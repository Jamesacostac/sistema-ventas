import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, writeBatch 
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from './firebase';
import { enviarMensajeTelegram, obtenerUltimosMensajesTelegram, limpiarConfigTelegram } from './telegram';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line 
} from 'recharts';
import { 
  CheckCircle, XCircle, PlusCircle, Trash2, ShoppingBag, 
  Package, DollarSign, CreditCard, Send, BookOpen, AlertTriangle, Tag,
  Edit2, ChevronDown, ChevronUp, Save, Wallet, TrendingDown, RefreshCw, Printer, X, TrendingUp, FileText, LogOut, ShoppingCart, Users, HandCoins, UserPlus, Phone, Merge
} from 'lucide-react';

export default function App({ usuario }) {
  const [pestana, setPestana] = useState('ventas');
  const [productos, setProductos] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [cajaInicial, setCajaInicial] = useState(0);
  const [cajaDocId, setCajaDocId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorAcceso, setErrorAcceso] = useState(null);

  // Estados desplegables y edición
  const [productoExpandidoId, setProductoExpandidoId] = useState(null);
  const [gastoExpandidoId, setGastoExpandidoId] = useState(null);
  const [editandoProductoId, setEditandoProductoId] = useState(null);
  const [editandoGastoId, setEditandoGastoId] = useState(null);
  const [nuevoEfectivoBaseInput, setNuevoEfectivoBaseInput] = useState('');

  // Referencias para listener de Telegram
  const productosRef = useRef(productos);
  const ventasRef = useRef(ventas);

  useEffect(() => { productosRef.current = productos; }, [productos]);
  useEffect(() => { ventasRef.current = ventas; }, [ventas]);

  // Normalizador de lotes
  const obtenerLotesNorm = (p) => {
    if (Array.isArray(p.lotes) && p.lotes.length > 0) {
      return p.lotes;
    }
    const stockAntiguo = Number(p.stock) || 0;
    const vencAntiguo = p.vencimiento || 'Sin fecha';
    if (stockAntiguo > 0 || vencAntiguo !== 'Sin fecha') {
      return [{
        id: 'lote_legacy_' + (p.id || '1'),
        variante: p.nombre || 'General',
        cantidad: stockAntiguo,
        vencimiento: vencAntiguo
      }];
    }
    return [];
  };

  const getStockTotalProducto = (p) => {
    const lotes = obtenerLotesNorm(p);
    return lotes.reduce((acc, l) => acc + Number(l.cantidad || 0), 0);
  };

  const getProximoVencimientoProducto = (p) => {
    const lotes = obtenerLotesNorm(p);
    if (lotes.length === 0) return 'N/A';
    const fechas = lotes.map(l => l.vencimiento).filter(f => f && f !== 'Sin fecha').sort();
    return fechas[0] || 'N/A';
  };

  // Escuchar Firestore en tiempo real
  useEffect(() => {
    // Si las reglas de Firestore rechazan al usuario (no es administrador), se muestra un aviso
    const manejarError = (error) => {
      console.error("Error de Firestore:", error);
      setErrorAcceso(error.code === 'permission-denied'
        ? 'Tu cuenta no tiene permisos de administrador para ver estos datos.'
        : 'No se pudieron cargar los datos: ' + error.message);
      setCargando(false);
    };

    const unsubProductos = onSnapshot(collection(db, 'productos'), (snapshot) => {
      setProductos(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, manejarError);

    const unsubVentas = onSnapshot(collection(db, 'ventas'), (snapshot) => {
      const lista = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setVentas(lista.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0)));
      setCargando(false);
    }, manejarError);

    const unsubCategorias = onSnapshot(collection(db, 'categorias'), (snapshot) => {
      setCategorias(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, manejarError);

    const unsubGastos = onSnapshot(collection(db, 'gastos'), (snapshot) => {
      const listaG = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setGastos(listaG.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0)));
    }, manejarError);

    const unsubClientes = onSnapshot(collection(db, 'clientes'), (snapshot) => {
      const listaC = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setClientes(listaC.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')));
    }, manejarError);

    const unsubCaja = onSnapshot(collection(db, 'caja_base'), (snapshot) => {
      if (!snapshot.empty) {
        const docCaja = snapshot.docs[0];
        setCajaInicial(docCaja.data().monto || 0);
        setCajaDocId(docCaja.id);
      } else {
        setCajaInicial(0);
        setCajaDocId(null);
      }
    }, manejarError);

    return () => {
      unsubProductos();
      unsubVentas();
      unsubCategorias();
      unsubGastos();
      unsubClientes();
      unsubCaja();
    };
  }, []);

  // Listener Telegram
  useEffect(() => {
    const intervalo = setInterval(async () => {
      const mensajes = await obtenerUltimosMensajesTelegram();
      if (!mensajes || mensajes.length === 0) return;

      for (const update of mensajes) {
        if (!update.message || !update.message.text) continue;
        const texto = update.message.text.trim().toLowerCase();

        if (texto.includes('reporte') || texto.includes('ventas') || texto.includes('cierre')) {
          generarYEnviarReporteCierre(ventasRef.current);
        } else if (texto.includes('agotad') || texto.includes('stock') || texto.includes('faltan') || texto.includes('reponer')) {
          generarYEnviarAlertaStock(productosRef.current);
        }
      }
    }, 5000);

    return () => clearInterval(intervalo);
  }, []);

  // Formularios
  const [formVenta, setFormVenta] = useState({
    cliente: '', productoId: '', variante: 'TODAS', cantidad: 1, pagado: true, medioPago: 'Efectivo', otroMedioPago: ''
  });

  const [formProducto, setFormProducto] = useState({
    productoId: '', 
    nombre: '', costo: '', precio: '', variante: 'Limonada', cantidad: '', vencimiento: '', categoria: '', descripcion: ''
  });

  const [formGasto, setFormGasto] = useState({
    concepto: '', monto: '', tipo: 'Proveedor', detalle: ''
  });

  const [nuevaCategoria, setNuevaCategoria] = useState('');

  // Ganancia estimada en formulario
  const costoNum = Number(formProducto.costo) || 0;
  const precioNum = Number(formProducto.precio) || 0;
  const gananciaUnitariaPrev = precioNum - costoNum;

  // Reportes Telegram
  const generarYEnviarReporteCierre = async (listaVentas) => {
    const ventasPagadas = (listaVentas || ventas).filter(v => v.pagado);
    const totalIngresos = ventasPagadas.reduce((acc, v) => acc + v.total, 0);
    const totalReposicion = ventasPagadas.reduce((acc, v) => acc + v.costoTotal, 0);
    const gananciaBruta = ventasPagadas.reduce((acc, v) => acc + v.ganancia, 0);

    const ahorro = gananciaBruta * 0.15;
    const gananciaRepartible = gananciaBruta - ahorro;
    const pagoSocio = gananciaRepartible / 3;

    const fechaActual = new Date().toLocaleDateString('es-ES', { 
      year: 'numeric', month: 'long', day: 'numeric' 
    });

    const reporteTexto = 
      `📊 <b>INFORME DE CIERRE DE VENTAS</b>\n` +
      `📅 Fecha: ${fechaActual}\n\n` +
      `💰 <b>Ventas Pagadas Hoy:</b> $${totalIngresos.toLocaleString()}\n` +
      `🔄 <b>Fondo Reposición:</b> $${totalReposicion.toLocaleString()}\n` +
      `🌱 <b>Fondo Ahorro (15%):</b> $${ahorro.toLocaleString()}\n` +
      `👥 <b>Pago por Socio (3):</b> $${pagoSocio.toLocaleString(undefined, {maximumFractionDigits: 0})}\n\n` +
      `🛒 Total ventas registradas: ${ventasPagadas.length}\n` +
      `🧾 <b>Por cobrar (fiados):</b> $${(listaVentas || ventas).filter(v => !v.pagado).reduce((acc, v) => acc + v.total, 0).toLocaleString()}`;

    return await enviarMensajeTelegram(reporteTexto);
  };

  const generarYEnviarAlertaStock = async (listaProductos) => {
    const prods = listaProductos || productos;
    const agotados = prods.filter(p => getStockTotalProducto(p) <= 0);
    const porAgotarse = prods.filter(p => {
      const st = getStockTotalProducto(p);
      return st > 0 && st <= 3;
    });

    if (agotados.length === 0 && porAgotarse.length === 0) {
      return await enviarMensajeTelegram("✅ <b>Estado del Inventario:</b> Todo el inventario está en niveles óptimos.");
    }

    let textoAlerta = `🚨 <b>REPORTE DE PRODUCTOS A REPONER</b> 🚨\n\n`;
    if (agotados.length > 0) {
      textoAlerta += `❌ <b>PRODUCTOS AGOTADOS (Stock 0):</b>\n`;
      agotados.forEach(p => { textoAlerta += `• <b>${p.nombre}</b>\n`; });
      textoAlerta += `\n`;
    }
    if (porAgotarse.length > 0) {
      textoAlerta += `⚠️ <b>POCOS EN STOCK (3 o menos):</b>\n`;
      porAgotarse.forEach(p => { 
        textoAlerta += `• <b>${p.nombre}</b>: Quedan ${getStockTotalProducto(p)} unidades\n`; 
      });
      textoAlerta += `\n`;
    }
    textoAlerta += `🛒 <i>Por favor realizar pedido de compras.</i>`;

    return await enviarMensajeTelegram(textoAlerta);
  };

  // ==================== CLIENTES Y FIADOS ====================
  const [formCliente, setFormCliente] = useState({ nombre: '', telefono: '', nota: '' });
  const [editandoClienteId, setEditandoClienteId] = useState(null);
  const [cuentaExpandida, setCuentaExpandida] = useState(null);
  const [medioPagoAbono, setMedioPagoAbono] = useState('Efectivo');
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [procesandoCuenta, setProcesandoCuenta] = useState(false);

  const normalizarNombre = (nombre) => (nombre || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const buscarClientePorNombre = (nombre) => {
    const n = normalizarNombre(nombre);
    if (!n) return null;
    return clientes.find(c => normalizarNombre(c.nombre) === n) || null;
  };

  // Cliente al que pertenece una venta: por clienteId o, en ventas antiguas, por nombre
  const clienteDeVenta = (v) =>
    (v.clienteId && clientes.find(c => c.id === v.clienteId)) || buscarClientePorNombre(v.cliente);

  // Firestore permite máximo 500 operaciones por lote: se divide en bloques
  const actualizarEnLotes = async (operaciones) => {
    for (let i = 0; i < operaciones.length; i += 450) {
      const batch = writeBatch(db);
      operaciones.slice(i, i + 450).forEach(({ ref, datos }) => batch.update(ref, datos));
      await batch.commit();
    }
  };

  const ventasPendientes = ventas.filter(v => !v.pagado);
  const totalPorCobrar = ventasPendientes.reduce((acc, v) => acc + v.total, 0);

  const resumirPendientes = (pendientes) => ({
    pendientes,
    deuda: pendientes.reduce((acc, v) => acc + v.total, 0),
    ultimaFecha: pendientes.map(v => v.fecha).filter(Boolean).sort().pop() || null
  });

  // Cuentas de clientes registrados
  const cuentasClientes = clientes.map(c => ({
    key: `id:${c.id}`,
    cliente: c,
    nombre: c.nombre,
    ...resumirPendientes(ventasPendientes.filter(v => clienteDeVenta(v)?.id === c.id))
  }));

  // Fiados antiguos cuyo cliente todavía no está registrado (se agrupan por nombre)
  const deudoresSinRegistro = Object.values(
    ventasPendientes
      .filter(v => !clienteDeVenta(v))
      .reduce((grupos, v) => {
        const key = `nombre:${normalizarNombre(v.cliente) || 'sin nombre'}`;
        grupos[key] = grupos[key] || { key, cliente: null, nombre: v.cliente || 'Sin nombre', ventas: [] };
        grupos[key].ventas.push(v);
        return grupos;
      }, {})
  ).map(g => ({ key: g.key, cliente: g.cliente, nombre: g.nombre, ...resumirPendientes(g.ventas) }));

  const cuentasVisibles = [...deudoresSinRegistro, ...cuentasClientes]
    .filter(c => normalizarNombre(c.nombre).includes(normalizarNombre(busquedaCliente)))
    .sort((a, b) => b.deuda - a.deuda || a.nombre.localeCompare(b.nombre, 'es'));

  const clientesConDeuda = [...cuentasClientes, ...deudoresSinRegistro].filter(c => c.deuda > 0).length;

  const cancelarEdicionCliente = () => {
    setEditandoClienteId(null);
    setFormCliente({ nombre: '', telefono: '', nota: '' });
  };

  const handleGuardarCliente = async (e) => {
    e.preventDefault();
    const nombre = formCliente.nombre.trim().replace(/\s+/g, ' ');
    if (!nombre) return alert("Escribe el nombre del cliente.");

    const duplicado = buscarClientePorNombre(nombre);
    if (duplicado && duplicado.id !== editandoClienteId) {
      return alert(`Ya existe un cliente llamado "${duplicado.nombre}".`);
    }

    const datos = { nombre, telefono: formCliente.telefono.trim(), nota: formCliente.nota.trim() };

    try {
      if (editandoClienteId) {
        const anterior = clientes.find(c => c.id === editandoClienteId);
        await updateDoc(doc(db, 'clientes', editandoClienteId), datos);

        // Si cambió el nombre, se actualiza también en sus ventas para que el historial coincida
        if (anterior && anterior.nombre !== nombre) {
          const operaciones = ventas
            .filter(v => clienteDeVenta(v)?.id === editandoClienteId)
            .map(v => ({ ref: doc(db, 'ventas', v.id), datos: { cliente: nombre, clienteId: editandoClienteId } }));
          await actualizarEnLotes(operaciones);
        }
      } else {
        await addDoc(collection(db, 'clientes'), { ...datos, creadoEn: Date.now() });
      }
      cancelarEdicionCliente();
    } catch (error) {
      alert("Error al guardar el cliente: " + error.message);
    }
  };

  const iniciarEdicionCliente = (c) => {
    setEditandoClienteId(c.id);
    setFormCliente({ nombre: c.nombre || '', telefono: c.telefono || '', nota: c.nota || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const eliminarCliente = async (cuenta) => {
    if (cuenta.deuda > 0) {
      return alert(`No se puede eliminar a "${cuenta.nombre}" porque tiene una deuda pendiente de $${cuenta.deuda.toLocaleString()}.\n\nSi es un registro duplicado, usa el botón "Fusionar" para pasar su deuda al cliente correcto.`);
    }
    if (!confirm(`¿Eliminar al cliente "${cuenta.nombre}"? Sus ventas pasadas se conservan en el historial.`)) return;
    try {
      await deleteDoc(doc(db, 'clientes', cuenta.cliente.id));
    } catch (error) {
      alert("Error al eliminar el cliente: " + error.message);
    }
  };

  // ---- Fusionar registros duplicados ----
  // Pasa TODAS las ventas (pagadas y pendientes) de una cuenta a otro cliente
  // y elimina el registro duplicado. La deuda no se pierde: queda en el cliente destino.
  const [fusionCuentaKey, setFusionCuentaKey] = useState(null);
  const [fusionDestinoId, setFusionDestinoId] = useState('');

  const ventasDeCuenta = (cuenta) => cuenta.cliente
    ? ventas.filter(v => clienteDeVenta(v)?.id === cuenta.cliente.id)
    : ventas.filter(v => !clienteDeVenta(v) && `nombre:${normalizarNombre(v.cliente) || 'sin nombre'}` === cuenta.key);

  const abrirFusion = (cuenta) => {
    setFusionCuentaKey(fusionCuentaKey === cuenta.key ? null : cuenta.key);
    setFusionDestinoId('');
    setCuentaExpandida(null);
  };

  const handleFusionar = async (cuenta) => {
    const destino = clientes.find(c => c.id === fusionDestinoId);
    if (!destino) return alert("Elige el cliente al que se pasarán las ventas.");
    if (cuenta.cliente && destino.id === cuenta.cliente.id) return alert("Elige un cliente diferente.");

    const ventasMover = ventasDeCuenta(cuenta);
    const accion = cuenta.cliente ? `y se ELIMINARÁ el registro "${cuenta.nombre}"` : '';
    if (!confirm(
      `¿Pasar todo de "${cuenta.nombre}" a "${destino.nombre}"?\n\n` +
      `• ${ventasMover.length} venta(s) se asignarán a ${destino.nombre}\n` +
      `• Deuda que se traslada: $${cuenta.deuda.toLocaleString()}\n` +
      `• Las ventas pasadas se conservan ${accion}`
    )) return;

    setProcesandoCuenta(true);
    try {
      const operaciones = ventasMover.map(v => ({
        ref: doc(db, 'ventas', v.id),
        datos: { clienteId: destino.id, cliente: destino.nombre }
      }));

      if (operaciones.length < 450) {
        // Todo en una sola operación atómica: mover ventas + eliminar duplicado
        const batch = writeBatch(db);
        operaciones.forEach(({ ref, datos }) => batch.update(ref, datos));
        if (cuenta.cliente) batch.delete(doc(db, 'clientes', cuenta.cliente.id));
        await batch.commit();
      } else {
        // Primero se mueven las ventas; solo si todo sale bien se borra el duplicado
        await actualizarEnLotes(operaciones);
        if (cuenta.cliente) await deleteDoc(doc(db, 'clientes', cuenta.cliente.id));
      }

      setFusionCuentaKey(null);
      setFusionDestinoId('');
      alert(`Listo: las ventas de "${cuenta.nombre}" ahora pertenecen a "${destino.nombre}".`);
    } catch (error) {
      alert("Error al fusionar clientes: " + error.message);
    } finally {
      setProcesandoCuenta(false);
    }
  };

  // Registra como cliente a alguien que tenía fiados antiguos sin registro
  const registrarDeudor = async (cuenta) => {
    setProcesandoCuenta(true);
    try {
      const batch = writeBatch(db);
      const refCliente = doc(collection(db, 'clientes'));
      const nombre = cuenta.nombre.trim().replace(/\s+/g, ' ');
      batch.set(refCliente, { nombre, telefono: '', nota: '', creadoEn: Date.now() });
      cuenta.pendientes.slice(0, 450).forEach(v => {
        batch.update(doc(db, 'ventas', v.id), { clienteId: refCliente.id, cliente: nombre });
      });
      await batch.commit();
    } catch (error) {
      alert("Error al registrar el cliente: " + error.message);
    } finally {
      setProcesandoCuenta(false);
    }
  };

  // Marca como pagadas las ventas indicadas, con el medio con que se pagó la deuda
  const saldarVentas = async (ventasASaldar, medioPago) => {
    const operaciones = ventasASaldar.map(v => ({
      ref: doc(db, 'ventas', v.id),
      datos: { pagado: true, medioPago, fechaPago: new Date().toISOString().split('T')[0] }
    }));
    await actualizarEnLotes(operaciones);
  };

  const handleSaldarTodo = async (cuenta) => {
    if (cuenta.pendientes.length === 0) return;
    if (!confirm(`¿Registrar el pago de TODA la deuda de "${cuenta.nombre}"?\n\n${cuenta.pendientes.length} venta(s) por $${cuenta.deuda.toLocaleString()} pagadas con ${medioPagoAbono}.`)) return;

    setProcesandoCuenta(true);
    try {
      await saldarVentas(cuenta.pendientes, medioPagoAbono);
      enviarMensajeTelegram(
        `💵 <b>DEUDA SALDADA</b>\n\n` +
        `👤 Cliente: <b>${cuenta.nombre}</b>\n` +
        `💰 Monto: $${cuenta.deuda.toLocaleString()} (${medioPagoAbono})\n` +
        `🧾 Ventas saldadas: ${cuenta.pendientes.length}`
      );
      setCuentaExpandida(null);
    } catch (error) {
      alert("Error al saldar la deuda: " + error.message);
    } finally {
      setProcesandoCuenta(false);
    }
  };

  const handlePagarVenta = async (venta) => {
    if (!confirm(`¿Marcar como pagada la venta de ${venta.producto} por $${venta.total.toLocaleString()} (${medioPagoAbono})?`)) return;
    setProcesandoCuenta(true);
    try {
      await saldarVentas([venta], medioPagoAbono);
    } catch (error) {
      alert("Error al registrar el pago: " + error.message);
    } finally {
      setProcesandoCuenta(false);
    }
  };

  // ==================== CARRITO DE COMPRAS ====================
  const [carrito, setCarrito] = useState([]);
  const [guardandoVenta, setGuardandoVenta] = useState(false);

  // Descuenta una cantidad de los lotes por FEFO (primero los que vencen antes).
  // Devuelve los lotes resultantes y la cantidad que no se pudo cubrir.
  const descontarFEFO = (lotes, variante, cantidad) => {
    let restante = cantidad;
    const copia = JSON.parse(JSON.stringify(lotes))
      .sort((a, b) => new Date(a.vencimiento) - new Date(b.vencimiento));

    for (const lote of copia) {
      if (restante <= 0) break;
      if (variante !== 'TODAS' && lote.variante.toLowerCase() !== variante.toLowerCase()) continue;
      const usar = Math.min(lote.cantidad, restante);
      lote.cantidad -= usar;
      restante -= usar;
    }

    return { lotes: copia.filter(l => l.cantidad > 0), faltante: restante };
  };

  // Simula el descuento de todos los ítems del carrito sobre el inventario actual.
  // Si un mismo producto aparece varias veces, los descuentos se acumulan.
  // Primero se descuentan las variantes específicas y al final las "Automático (FEFO)",
  // para que el automático no consuma lotes que otra línea pidió explícitamente.
  const simularCarrito = (items) => {
    const lotesPorProducto = {};
    const ordenados = [...items].sort((a, b) => (a.variante === 'TODAS') - (b.variante === 'TODAS'));
    for (const item of ordenados) {
      const prod = productos.find(p => p.id === item.productoId);
      if (!prod) return { error: `El producto "${item.nombre}" ya no existe en el inventario.` };

      const lotesActuales = lotesPorProducto[prod.id] ?? obtenerLotesNorm(prod);
      const { lotes, faltante } = descontarFEFO(lotesActuales, item.variante, item.cantidad);
      if (faltante > 0) {
        const disponible = item.cantidad - faltante;
        return {
          error: item.variante === 'TODAS'
            ? `Stock insuficiente de "${prod.nombre}": solo quedan ${disponible} unidades disponibles para este pedido.`
            : `Stock insuficiente de "${prod.nombre}" (${item.variante}): solo quedan ${disponible} unidades disponibles para este pedido.`
        };
      }
      lotesPorProducto[prod.id] = lotes;
    }
    return { lotesPorProducto };
  };

  const handleAgregarAlCarrito = (e) => {
    e.preventDefault();
    const prod = productos.find(p => p.id === formVenta.productoId);
    if (!prod) return alert("Selecciona un producto válido.");

    const cantidad = Number(formVenta.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0) return alert("La cantidad debe ser un número entero mayor a cero.");

    const nuevoItem = {
      key: `${prod.id}_${Date.now()}`,
      productoId: prod.id,
      nombre: prod.nombre,
      variante: formVenta.variante,
      cantidad,
      precio: Number(prod.precio) || 0,
      costo: Number(prod.costo) || 0
    };

    // Si ya hay un ítem igual (mismo producto y variante), se suma la cantidad
    const existente = carrito.find(i => i.productoId === prod.id && i.variante === formVenta.variante);
    const carritoNuevo = existente
      ? carrito.map(i => i === existente ? { ...i, cantidad: i.cantidad + cantidad } : i)
      : [...carrito, nuevoItem];

    const { error } = simularCarrito(carritoNuevo);
    if (error) return alert(`❌ ${error}`);

    setCarrito(carritoNuevo);
    setFormVenta({ ...formVenta, productoId: '', variante: 'TODAS', cantidad: 1 });
  };

  const handleCambiarCantidadItem = (key, nuevaCantidad) => {
    const cantidad = Number(nuevaCantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0) return;
    const carritoNuevo = carrito.map(i => i.key === key ? { ...i, cantidad } : i);
    const { error } = simularCarrito(carritoNuevo);
    if (error) return alert(`❌ ${error}`);
    setCarrito(carritoNuevo);
  };

  const handleQuitarItem = (key) => {
    setCarrito(carrito.filter(i => i.key !== key));
  };

  const handleVaciarCarrito = () => {
    if (carrito.length > 0 && confirm("¿Vaciar el carrito?")) setCarrito([]);
  };

  const totalCarrito = carrito.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
  const unidadesCarrito = carrito.reduce((acc, i) => acc + i.cantidad, 0);

  // Registra todo el carrito en una sola operación atómica (writeBatch):
  // una venta por ítem + la actualización de lotes de cada producto.
  const handleRegistrarVenta = async () => {
    if (carrito.length === 0) return alert("El carrito está vacío.");
    if (formVenta.medioPago === 'Otro' && !formVenta.otroMedioPago.trim()) {
      return alert("Especifica el medio de pago.");
    }

    // Se vuelve a validar con el inventario actual por si otro socio vendió mientras tanto
    const { error, lotesPorProducto } = simularCarrito(carrito);
    if (error) return alert(`❌ ${error}`);

    const nombreCliente = formVenta.cliente.trim();
    if (!formVenta.pagado && (!nombreCliente || normalizarNombre(nombreCliente) === normalizarNombre('Cliente General'))) {
      return alert("Para dejar una venta como Pendiente (fiado) escribe el nombre del cliente.");
    }

    const medioPagoFinal = formVenta.medioPago === 'Otro'
      ? formVenta.otroMedioPago.trim()
      : formVenta.medioPago;
    const fecha = new Date().toISOString().split('T')[0];
    const creadoEn = Date.now();
    const pedidoId = doc(collection(db, 'ventas')).id;

    setGuardandoVenta(true);
    try {
      const batch = writeBatch(db);

      // Vincular la venta con el cliente registrado. Si es un fiado de un cliente
      // nuevo, se registra el cliente en la misma operación.
      let clienteRegistrado = buscarClientePorNombre(nombreCliente);
      if (!clienteRegistrado && !formVenta.pagado) {
        const refCliente = doc(collection(db, 'clientes'));
        clienteRegistrado = { id: refCliente.id, nombre: nombreCliente };
        batch.set(refCliente, { nombre: nombreCliente, telefono: '', nota: '', creadoEn });
      }
      const cliente = clienteRegistrado?.nombre || nombreCliente || 'Cliente General';
      const clienteId = clienteRegistrado?.id || null;

      carrito.forEach(item => {
        const total = item.precio * item.cantidad;
        const costoTotal = item.costo * item.cantidad;
        batch.set(doc(collection(db, 'ventas')), {
          fecha,
          cliente,
          clienteId,
          producto: item.nombre,
          variante: item.variante === 'TODAS' ? 'Auto (FEFO)' : item.variante,
          cantidad: item.cantidad,
          total,
          costoTotal,
          ganancia: total - costoTotal,
          pagado: formVenta.pagado,
          medioPago: medioPagoFinal,
          pedidoId,
          creadoEn
        });
      });

      const stockFinal = {};
      Object.entries(lotesPorProducto).forEach(([prodId, lotes]) => {
        const stock = lotes.reduce((acc, l) => acc + l.cantidad, 0);
        stockFinal[prodId] = stock;
        batch.update(doc(db, 'productos', prodId), { lotes, stock });
      });

      await batch.commit();

      // Alertas de reposición para los productos que quedaron con poco stock
      Object.entries(stockFinal).forEach(([prodId, stock]) => {
        if (stock > 3) return;
        const prod = productos.find(p => p.id === prodId);
        const estadoTexto = stock === 0 ? "❌ <b>TOTALMENTE AGOTADO</b>" : `⚠️ <b>QUEDAN SOLO ${stock} UNIDADES</b>`;
        enviarMensajeTelegram(
          `🚨 <b>ALERTA DE REPOSICIÓN DE INVENTARIO</b> 🚨\n\n` +
          `📦 Producto: <b>${prod?.nombre || prodId}</b>\n` +
          `📊 Estado: ${estadoTexto}\n` +
          `🔔 <i>Por favor coordinar compra con proveedores.</i>`
        );
      });

      setCarrito([]);
      setFormVenta({ cliente: '', productoId: '', variante: 'TODAS', cantidad: 1, pagado: true, medioPago: 'Efectivo', otroMedioPago: '' });
    } catch (error) {
      alert("Error al registrar la venta: " + error.message);
    } finally {
      setGuardandoVenta(false);
    }
  };

  const iniciarEdicionProductoBase = (prod) => {
    setEditandoProductoId(prod.id);
    setFormProducto({
      productoId: '',
      nombre: prod.nombre || '',
      costo: prod.costo || '',
      precio: prod.precio || '',
      categoria: prod.categoria || '',
      descripcion: prod.descripcion || '',
      variante: 'Limonada',
      cantidad: '',
      vencimiento: ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelarEdicion = () => {
    setEditandoProductoId(null);
    setFormProducto({ productoId: '', nombre: '', costo: '', precio: '', variante: 'Limonada', cantidad: '', vencimiento: '', categoria: '', descripcion: '' });
  };

  const handleGuardarProducto = async (e) => {
    e.preventDefault();

    try {
      if (editandoProductoId) {
        await updateDoc(doc(db, 'productos', editandoProductoId), {
          nombre: formProducto.nombre.trim(),
          costo: Number(formProducto.costo),
          precio: Number(formProducto.precio),
          categoria: formProducto.categoria || 'Sin categoría'
        });

        if (formProducto.cantidad && formProducto.vencimiento) {
          const prodObj = productos.find(p => p.id === editandoProductoId);
          let nuevosLotes = JSON.parse(JSON.stringify(obtenerLotesNorm(prodObj || {})));
          const cant = Number(formProducto.cantidad);

          nuevosLotes.push({
            id: Date.now().toString(),
            variante: formProducto.variante || 'General',
            cantidad: cant,
            vencimiento: formProducto.vencimiento
          });

          const nuevoStockTotal = nuevosLotes.reduce((acc, l) => acc + l.cantidad, 0);
          await updateDoc(doc(db, 'productos', editandoProductoId), { 
            lotes: nuevosLotes,
            stock: nuevoStockTotal
          });
        }

        setEditandoProductoId(null);
        alert("Producto actualizado con éxito.");
      } else {
        if (!formProducto.cantidad || !formProducto.vencimiento) {
          return alert("Por favor ingresa la cantidad y fecha de vencimiento del lote.");
        }

        const cant = Number(formProducto.cantidad);
        const prodExistente = productos.find(p => p.id === formProducto.productoId);

        if (prodExistente) {
          let nuevosLotes = JSON.parse(JSON.stringify(obtenerLotesNorm(prodExistente)));
          const idx = nuevosLotes.findIndex(
            l => l.variante.toLowerCase() === formProducto.variante.toLowerCase() && l.vencimiento === formProducto.vencimiento
          );

          if (idx >= 0) {
            nuevosLotes[idx].cantidad += cant;
          } else {
            nuevosLotes.push({
              id: Date.now().toString(),
              variante: formProducto.variante || 'General',
              cantidad: cant,
              vencimiento: formProducto.vencimiento
            });
          }

          nuevosLotes.sort((a, b) => new Date(a.vencimiento) - new Date(b.vencimiento));
          const nuevoStockTotal = nuevosLotes.reduce((acc, l) => acc + l.cantidad, 0);

          await updateDoc(doc(db, 'productos', prodExistente.id), { 
            lotes: nuevosLotes,
            stock: nuevoStockTotal
          });
        } else {
          if (!formProducto.nombre || !formProducto.costo || !formProducto.precio) {
            return alert("Completa nombre, costo y precio para el nuevo producto.");
          }

          await addDoc(collection(db, 'productos'), {
            nombre: formProducto.nombre.trim(),
            costo: Number(formProducto.costo),
            precio: Number(formProducto.precio),
            categoria: formProducto.categoria || 'Sin categoría',
            stock: cant,
            lotes: [
              {
                id: Date.now().toString(),
                variante: formProducto.variante || 'General',
                cantidad: cant,
                vencimiento: formProducto.vencimiento
              }
            ]
          });
        }
      }

      setFormProducto({ productoId: '', nombre: '', costo: '', precio: '', variante: 'Limonada', cantidad: '', vencimiento: '', categoria: '', descripcion: '' });
    } catch (error) {
      alert("Error al guardar producto/lote: " + error.message);
    }
  };

  const handleEditarLote = async (prodId, loteId) => {
    const prod = productos.find(p => p.id === prodId);
    if (!prod) return;
    const lotesActuales = obtenerLotesNorm(prod);
    const lote = lotesActuales.find(l => l.id === loteId);
    if (!lote) return;

    const nuevaCantStr = prompt(`Editar cantidad de "${prod.nombre} (${lote.variante})":`, lote.cantidad);
    const nuevaFecha = prompt(`Editar fecha de vencimiento (AAAA-MM-DD):`, lote.vencimiento);

    if (nuevaCantStr !== null && nuevaFecha !== null) {
      const nuevaCant = Number(nuevaCantStr) || 0;
      let lotesModificados = lotesActuales.map(l => {
        if (l.id === loteId) {
          return { ...l, cantidad: nuevaCant, vencimiento: nuevaFecha };
        }
        return l;
      }).filter(l => l.cantidad > 0);

      lotesModificados.sort((a, b) => new Date(a.vencimiento) - new Date(b.vencimiento));
      const nuevoStockTotal = lotesModificados.reduce((acc, l) => acc + l.cantidad, 0);

      try {
        await updateDoc(doc(db, 'productos', prodId), { 
          lotes: lotesModificados,
          stock: nuevoStockTotal,
          vencimiento: lotesModificados[0]?.vencimiento || 'N/A'
        });
      } catch (error) {
        alert("Error al actualizar lote: " + error.message);
      }
    }
  };

  const handleEliminarLote = async (prodId, loteId) => {
    if (!confirm("¿Eliminar este lote específico del inventario?")) return;
    const prod = productos.find(p => p.id === prodId);
    if (!prod) return;

    const lotesActuales = obtenerLotesNorm(prod);
    const lotesActualizados = lotesActuales.filter(l => l.id !== loteId);
    const nuevoStockTotal = lotesActualizados.reduce((acc, l) => acc + l.cantidad, 0);

    try {
      await updateDoc(doc(db, 'productos', prodId), { 
        lotes: lotesActualizados,
        stock: nuevoStockTotal 
      });
    } catch (error) {
      alert("Error al eliminar lote: " + error.message);
    }
  };

  const handleGuardarEfectivoBase = async (e) => {
    e.preventDefault();
    const monto = Number(nuevoEfectivoBaseInput);
    if (isNaN(monto)) return alert("Ingresa una cantidad válida.");

    try {
      if (cajaDocId) {
        await updateDoc(doc(db, 'caja_base', cajaDocId), { monto, fechaActualizacion: new Date().toISOString() });
      } else {
        await addDoc(collection(db, 'caja_base'), { monto, fechaActualizacion: new Date().toISOString() });
      }
      setNuevoEfectivoBaseInput('');
      alert("Efectivo base no registrado actualizado correctamente.");
    } catch (error) {
      alert("Error al guardar efectivo base: " + error.message);
    }
  };

  // Cargar datos de gasto en el formulario para editar
  const iniciarEdicionGasto = (g) => {
    setEditandoGastoId(g.id);
    setFormGasto({
      concepto: g.concepto || '',
      monto: g.monto || '',
      tipo: g.tipo || 'Proveedor',
      detalle: g.detalle || ''
    });
  };

  const cancelarEdicionGasto = () => {
    setEditandoGastoId(null);
    setFormGasto({ concepto: '', monto: '', tipo: 'Proveedor', detalle: '' });
  };

  const handleAgregarOEditarGasto = async (e) => {
    e.preventDefault();
    const monto = Number(formGasto.monto);
    if (!formGasto.concepto.trim() || isNaN(monto) || monto <= 0) {
      return alert("Por favor completa el concepto y un monto mayor a cero.");
    }

    try {
      if (editandoGastoId) {
        await updateDoc(doc(db, 'gastos', editandoGastoId), {
          concepto: formGasto.concepto.trim(),
          monto,
          tipo: formGasto.tipo,
          detalle: formGasto.detalle.trim() || 'Sin observaciones adicionales'
        });
        setEditandoGastoId(null);
        alert("Gasto actualizado con éxito.");
      } else {
        await addDoc(collection(db, 'gastos'), {
          concepto: formGasto.concepto.trim(),
          monto,
          tipo: formGasto.tipo,
          detalle: formGasto.detalle.trim() || 'Sin observaciones adicionales',
          fecha: new Date().toISOString().split('T')[0],
          creadoEn: Date.now()
        });
      }

      setFormGasto({ concepto: '', monto: '', tipo: 'Proveedor', detalle: '' });
    } catch (error) {
      alert("Error al guardar el gasto: " + error.message);
    }
  };

  const eliminarGasto = async (id) => {
    if (confirm("¿Eliminar este registro de gasto?")) {
      await deleteDoc(doc(db, 'gastos', id));
    }
  };

  const handleBorrarVentasPagadas = async () => {
    const ventasPagadasList = ventas.filter(v => v.pagado);
    if (ventasPagadasList.length === 0) {
      return alert("No hay ventas pagadas para eliminar.");
    }

    if (confirm(`¿Estás seguro de eliminar las ${ventasPagadasList.length} ventas ya PAGADAS? Se conservarán solo las pendientes por cobrar.`)) {
      try {
        const batch = writeBatch(db);
        ventasPagadasList.forEach(v => {
          batch.delete(doc(db, 'ventas', v.id));
        });
        await batch.commit();
        alert("Se eliminaron con éxito las ventas pagadas.");
      } catch (error) {
        alert("Error al borrar ventas pagadas: " + error.message);
      }
    }
  };

  const handleAgregarCategoria = async (e) => {
    e.preventDefault();
    if (!nuevaCategoria.trim()) return;
    try {
      await addDoc(collection(db, 'categorias'), { nombre: nuevaCategoria.trim() });
      setNuevaCategoria('');
    } catch (error) {
      alert("Error al agregar categoría: " + error.message);
    }
  };

  const eliminarCategoria = async (id) => {
    if (confirm("¿Eliminar esta categoría?")) await deleteDoc(doc(db, 'categorias', id));
  };

  const eliminarProductoCompleto = async (id) => {
    if (confirm("¿Eliminar este producto completo con todos sus lotes?")) {
      await deleteDoc(doc(db, 'productos', id));
    }
  };

  const togglePago = async (id, estadoActual) => {
    await updateDoc(doc(db, 'ventas', id), { pagado: !estadoActual });
  };

  const eliminarVenta = async (id) => {
    if (confirm("¿Eliminar esta venta?")) await deleteDoc(doc(db, 'ventas', id));
  };

  // Cuentas financieras dinámicas
  const ventasPagadas = ventas.filter(v => v.pagado);
  const totalVentasEfectivoCobrado = ventasPagadas
    .filter(v => v.medioPago === 'Efectivo')
    .reduce((acc, v) => acc + v.total, 0);

  const totalIngresosDia = ventasPagadas.reduce((acc, v) => acc + v.total, 0);
  const totalReposicionDia = ventasPagadas.reduce((acc, v) => acc + v.costoTotal, 0);
  const gananciaBrutaDia = ventasPagadas.reduce((acc, v) => acc + v.ganancia, 0);

  const fondoAhorro = gananciaBrutaDia * 0.15;
  const gananciaRepartible = gananciaBrutaDia - fondoAhorro;
  const salarioPorSocio = gananciaRepartible / 3;

  const totalGastosRegistrados = gastos.reduce((acc, g) => acc + g.monto, 0);
  const gastosEnReposiciones = gastos
    .filter(g => g.tipo === 'Proveedor' || g.tipo === 'Compra Productos')
    .reduce((acc, g) => acc + g.monto, 0);

  // CORRECCIÓN SOLICITADA EN ESTADO DE CUENTA: Efectivo total limpio sin restar gastos totales
  const efectivoTotalEnCaja = cajaInicial + totalVentasEfectivoCobrado;
  const estadoPuntoCeroReposicion = totalReposicionDia - gastosEnReposiciones;

  const handleEnviarReporteTelegram = async () => {
    const exito = await generarYEnviarReporteCierre(ventas);
    if (exito) alert("Informe financiero enviado con éxito a Telegram.");
    else alert("Ocurrió un error al enviar el informe por Telegram.");
  };

  const handleEnviarAlertaStockTelegram = async () => {
    const exito = await generarYEnviarAlertaStock(productos);
    if (exito) alert("Alerta de faltantes enviada con éxito a Telegram.");
    else alert("Ocurrió un error al enviar la alerta a Telegram.");
  };

  // Gráficos
  const datosVentasSemanales = (() => {
    const semanas = [
      { mes: 'Sem 1', ventas: 0 },
      { mes: 'Sem 2', ventas: 0 },
      { mes: 'Sem 3', ventas: 0 },
      { mes: 'Sem 4', ventas: 0 }
    ];

    ventasPagadas.forEach(v => {
      const dia = new Date(v.fecha).getDate();
      if (dia <= 7) semanas[0].ventas += v.total;
      else if (dia <= 14) semanas[1].ventas += v.total;
      else if (dia <= 21) semanas[2].ventas += v.total;
      else semanas[3].ventas += v.total;
    });

    return semanas;
  })();

  const datosProductosMasVendidos = (() => {
    const conteo = {};
    ventasPagadas.forEach(v => {
      conteo[v.producto] = (conteo[v.producto] || 0) + v.cantidad;
    });

    return Object.keys(conteo).map(nombre => ({
      nombre,
      unidades: conteo[nombre]
    })).sort((a, b) => b.unidades - a.unidades);
  })();

  const handleCerrarSesion = async () => {
    limpiarConfigTelegram();
    await signOut(auth);
  };

  if (cargando) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-50 text-slate-600 font-sans">
        <p className="font-semibold text-lg">Cargando datos desde la nube...</p>
      </div>
    );
  }

  if (errorAcceso) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-50 text-slate-800 font-sans p-4">
        <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center">
          <AlertTriangle size={32} className="mx-auto text-amber-500 mb-3" />
          <p className="text-sm font-semibold mb-1">{errorAcceso}</p>
          <p className="text-xs text-slate-500 mb-4">Sesión: {usuario?.email}</p>
          <button
            onClick={handleCerrarSesion}
            className="inline-flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-900 transition"
          >
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-slate-50 min-h-screen text-slate-800 font-sans print:p-0 print:bg-white">
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 1cm; }
          body { background-color: #ffffff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-card { border: 1px solid #e2e8f0 !important; box-shadow: none !important; break-inside: avoid; }
          .print-grid { display: grid !important; grid-template-cols: repeat(2, minmax(0, 1fr)) !important; gap: 12px !important; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Encabezado Principal */}
      <header className="mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col lg:flex-row justify-between items-center gap-4 print-card print:mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Sistema de Control Financiero y Ventas</h1>
          <p className="text-xs md:text-sm text-slate-500">
            Comestibles — Fecha: {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Pestañas */}
        <div className="flex items-center gap-1.5 no-print bg-slate-100 p-1.5 rounded-xl border border-slate-200 flex-wrap justify-center">
          <button 
            onClick={() => setPestana('ventas')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs md:text-sm transition ${
              pestana === 'ventas' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingBag size={16} /> Ventas & Cierre
          </button>
          <button
            onClick={() => setPestana('clientes')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs md:text-sm transition ${
              pestana === 'clientes' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users size={16} /> Clientes
            {clientesConDeuda > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pestana === 'clientes' ? 'bg-white text-indigo-700' : 'bg-amber-500 text-white'}`}>
                {clientesConDeuda}
              </span>
            )}
          </button>
          <button
            onClick={() => setPestana('estado_cuenta')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs md:text-sm transition ${
              pestana === 'estado_cuenta' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wallet size={16} /> Estado de Cuenta
          </button>
          <button 
            onClick={() => setPestana('inventario')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs md:text-sm transition ${
              pestana === 'inventario' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package size={16} /> Inventario
          </button>
          <button 
            onClick={() => setPestana('categorias')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs md:text-sm transition ${
              pestana === 'categorias' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Tag size={16} /> Categorías
          </button>
          <button 
            onClick={() => setPestana('catalogo')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs md:text-sm transition ${
              pestana === 'catalogo' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen size={16} /> Carta
          </button>
        </div>

        {/* Botones Telegram */}
        <div className="flex items-center gap-2 no-print flex-wrap justify-center lg:justify-end">
          <button 
            onClick={handleEnviarAlertaStockTelegram}
            className="flex items-center gap-1.5 bg-amber-500 text-white px-3 py-2 rounded-lg hover:bg-amber-600 transition shadow text-xs md:text-sm font-semibold"
            title="Enviar alerta de stock a Telegram"
          >
            <AlertTriangle size={16} /> Alertar Stock
          </button>
          <button 
            onClick={handleEnviarReporteTelegram}
            className="flex items-center gap-1.5 bg-sky-600 text-white px-3 py-2 rounded-lg hover:bg-sky-700 transition shadow text-xs md:text-sm font-semibold"
          >
            <Send size={16} /> Enviar Cierre
          </button>
          <button
            onClick={handleCerrarSesion}
            className="flex items-center gap-1.5 bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-900 transition shadow text-xs md:text-sm font-semibold"
            title={`Sesión iniciada como ${usuario?.email || ''}`}
          >
            <LogOut size={16} /> Salir
          </button>
        </div>
      </header>

      {/* ==================== PESTAÑA VENTAS ==================== */}
      {pestana === 'ventas' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 print:gap-2 print:mb-4">
            <div className="bg-white p-3 md:p-4 rounded-xl border border-slate-200 shadow-sm print-card">
              <p className="text-xs text-slate-500 font-medium">Ventas Pagadas Hoy</p>
              <h3 className="text-lg md:text-2xl font-bold text-slate-900">${totalIngresosDia.toLocaleString()}</h3>
            </div>
            <div className="bg-white p-3 md:p-4 rounded-xl border border-slate-200 shadow-sm print-card">
              <p className="text-xs text-slate-500 font-medium">Fondo Reposición</p>
              <h3 className="text-lg md:text-2xl font-bold text-blue-600">${totalReposicionDia.toLocaleString()}</h3>
            </div>
            <div className="bg-white p-3 md:p-4 rounded-xl border border-slate-200 shadow-sm print-card">
              <p className="text-xs text-slate-500 font-medium">Ahorro Mejoras (15%)</p>
              <h3 className="text-lg md:text-2xl font-bold text-emerald-600">${fondoAhorro.toLocaleString()}</h3>
            </div>
            <div className="bg-white p-3 md:p-4 rounded-xl border border-slate-200 shadow-sm print-card">
              <p className="text-xs text-slate-500 font-medium">Pago c/u (3 Socios)</p>
              <h3 className="text-lg md:text-2xl font-bold text-indigo-600">${salarioPorSocio.toLocaleString(undefined, {maximumFractionDigits: 0})}</h3>
            </div>
          </div>

          <div className="no-print bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6">
            <h2 className="text-lg font-bold mb-4 text-slate-800 flex items-center gap-2">
              <PlusCircle size={20} className="text-indigo-600" /> Registrar Nueva Venta / Regalo
            </h2>

            {/* Paso 1: agregar productos al carrito */}
            <form onSubmit={handleAgregarAlCarrito} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Producto</label>
                <select
                  required
                  value={formVenta.productoId}
                  onChange={(e) => setFormVenta({ ...formVenta, productoId: e.target.value, variante: 'TODAS' })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="">Seleccionar Producto...</option>
                  {productos.map((p) => {
                    const enCarrito = carrito.filter(i => i.productoId === p.id).reduce((acc, i) => acc + i.cantidad, 0);
                    const st = getStockTotalProducto(p) - enCarrito;
                    return (
                      <option key={p.id} value={p.id} disabled={st <= 0}>
                        {p.precio === 0 ? '🎁 [REGALO] ' : ''}
                        {p.nombre} — ${p.precio} (Disponible: {st})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Variante / Lote</label>
                <select
                  value={formVenta.variante}
                  onChange={(e) => setFormVenta({ ...formVenta, variante: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="TODAS">Automático (FEFO)</option>
                  {(() => {
                    const prodSel = productos.find(p => p.id === formVenta.productoId);
                    if (!prodSel) return null;
                    const lotes = obtenerLotesNorm(prodSel);
                    const variantesUnicas = [...new Set(lotes.map(l => l.variante))];
                    return variantesUnicas.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ));
                  })()}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cantidad</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={formVenta.cantidad}
                  onChange={(e) => setFormVenta({ ...formVenta, cantidad: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <button
                type="submit"
                className="flex items-center justify-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-900 transition shadow"
              >
                <ShoppingCart size={16} /> Agregar al Carrito
              </button>
            </form>

            {/* Paso 2: revisar el carrito */}
            <div className="mt-5 border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex justify-between items-center px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <ShoppingCart size={16} className="text-indigo-600" />
                  Carrito ({carrito.length} {carrito.length === 1 ? 'producto' : 'productos'}, {unidadesCarrito} un.)
                </h3>
                {carrito.length > 0 && (
                  <button onClick={handleVaciarCarrito} className="text-xs font-semibold text-rose-600 hover:text-rose-700">
                    Vaciar
                  </button>
                )}
              </div>

              {carrito.length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-400">Agrega productos para armar la venta.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs md:text-sm">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-200">
                        <th className="p-3">Producto</th>
                        <th className="p-3">Variante</th>
                        <th className="p-3">Precio</th>
                        <th className="p-3">Cantidad</th>
                        <th className="p-3">Subtotal</th>
                        <th className="p-3 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {carrito.map(item => (
                        <tr key={item.key}>
                          <td className="p-3 font-semibold text-slate-800">{item.nombre}</td>
                          <td className="p-3 text-slate-500">{item.variante === 'TODAS' ? 'Automático (FEFO)' : item.variante}</td>
                          <td className="p-3">${item.precio.toLocaleString()}</td>
                          <td className="p-3">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={item.cantidad}
                              onChange={(e) => handleCambiarCantidadItem(item.key, e.target.value)}
                              className="w-20 p-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </td>
                          <td className="p-3 font-bold text-slate-900">${(item.precio * item.cantidad).toLocaleString()}</td>
                          <td className="p-3 text-right">
                            <button onClick={() => handleQuitarItem(item.key)} className="text-rose-500 hover:text-rose-700 p-1" title="Quitar del carrito">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Paso 3: datos del cliente y pago, y confirmar */}
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del Cliente</label>
                <input
                  type="text"
                  list="lista-clientes"
                  placeholder={formVenta.pagado ? 'Ej. Juan Pérez (opcional)' : 'Obligatorio para fiar'}
                  value={formVenta.cliente}
                  onChange={(e) => setFormVenta({ ...formVenta, cliente: e.target.value })}
                  className={`w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none ${
                    !formVenta.pagado && !formVenta.cliente.trim() ? 'border-amber-400 bg-amber-50/50' : 'border-slate-300'
                  }`}
                />
                <datalist id="lista-clientes">
                  {clientes.map(c => <option key={c.id} value={c.nombre} />)}
                </datalist>
                {(() => {
                  const c = buscarClientePorNombre(formVenta.cliente);
                  if (!c) {
                    return !formVenta.pagado && formVenta.cliente.trim()
                      ? <p className="text-[11px] text-indigo-600 mt-1">Cliente nuevo: se registrará al guardar.</p>
                      : null;
                  }
                  const deuda = cuentasClientes.find(cc => cc.cliente.id === c.id)?.deuda || 0;
                  return deuda > 0
                    ? <p className="text-[11px] text-amber-700 mt-1">Debe actualmente ${deuda.toLocaleString()}</p>
                    : <p className="text-[11px] text-emerald-700 mt-1">Cliente registrado, sin deudas.</p>;
                })()}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Medio de Pago</label>
                <select
                  value={formVenta.medioPago}
                  onChange={(e) => setFormVenta({ ...formVenta, medioPago: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              {formVenta.medioPago === 'Otro' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Especificar Medio</label>
                  <input
                    type="text"
                    placeholder="Ej. Nequi, Daviplata..."
                    value={formVenta.otroMedioPago}
                    onChange={(e) => setFormVenta({ ...formVenta, otroMedioPago: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Estado de Pago</label>
                <select
                  value={formVenta.pagado ? 'true' : 'false'}
                  onChange={(e) => setFormVenta({ ...formVenta, pagado: e.target.value === 'true' })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="true">Pagado</option>
                  <option value="false">Pendiente</option>
                </select>
              </div>

              <div className={`flex flex-col gap-2 ${formVenta.medioPago === 'Otro' ? '' : 'lg:col-span-2'}`}>
                <p className="text-right text-sm text-slate-600">
                  Total: <span className="text-xl font-extrabold text-slate-900">${totalCarrito.toLocaleString()}</span>
                </p>
                <button
                  type="button"
                  onClick={handleRegistrarVenta}
                  disabled={carrito.length === 0 || guardandoVenta}
                  className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-semibold text-sm hover:bg-indigo-700 transition shadow disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {guardandoVenta ? 'Registrando...' : 'Registrar Venta'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-base font-bold text-slate-800">Historial de Ventas Registradas</h2>
              <button
                onClick={handleBorrarVentasPagadas}
                className="bg-rose-50 text-rose-600 border border-rose-200 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-rose-100 transition flex items-center gap-1.5 no-print"
              >
                <Trash2 size={14} /> Borrar Ventas Pagadas
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Producto</th>
                    <th className="p-3">Variante</th>
                    <th className="p-3">Cant</th>
                    <th className="p-3">Total</th>
                    <th className="p-3">Pago</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-right no-print">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {ventas.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 text-slate-500">{v.fecha}</td>
                      <td className="p-3 font-medium text-slate-800">{v.cliente}</td>
                      <td className="p-3 font-semibold text-indigo-600">{v.producto}</td>
                      <td className="p-3 text-slate-500">{v.variante}</td>
                      <td className="p-3">{v.cantidad}</td>
                      <td className="p-3 font-bold text-slate-900">${v.total.toLocaleString()}</td>
                      <td className="p-3"><span className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">{v.medioPago}</span></td>
                      <td className="p-3">
                        <button 
                          onClick={() => togglePago(v.id, v.pagado)}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 w-fit transition ${
                            v.pagado ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          }`}
                        >
                          {v.pagado ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          {v.pagado ? 'Pagado' : 'Pendiente'}
                        </button>
                      </td>
                      <td className="p-3 text-right no-print">
                        <button 
                          onClick={() => eliminarVenta(v.id)}
                          className="text-rose-500 hover:text-rose-700 p-1"
                          title="Eliminar venta"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {ventas.length === 0 && (
                    <tr>
                      <td colSpan="9" className="p-6 text-center text-slate-400">No hay ventas registradas todavía.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ==================== PESTAÑA CLIENTES Y FIADOS ==================== */}
      {pestana === 'clientes' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-xs font-bold tracking-wider uppercase text-slate-400">Total por Cobrar</h3>
              <p className="text-3xl font-extrabold text-amber-600 mt-1">${totalPorCobrar.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">{ventasPendientes.length} venta(s) pendiente(s)</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-xs font-bold tracking-wider uppercase text-slate-400">Clientes con Deuda</h3>
              <p className="text-3xl font-extrabold text-slate-900 mt-1">{clientesConDeuda}</p>
              <p className="text-xs text-slate-500 mt-1">
                {deudoresSinRegistro.length > 0 ? `${deudoresSinRegistro.length} sin registrar (fiados antiguos)` : 'Todos registrados'}
              </p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-xs font-bold tracking-wider uppercase text-slate-400">Clientes Registrados</h3>
              <p className="text-3xl font-extrabold text-indigo-600 mt-1">{clientes.length}</p>
            </div>
          </div>

          {/* Formulario de cliente */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm no-print">
            <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
              <UserPlus size={18} className="text-indigo-600" />
              {editandoClienteId ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
            </h2>
            <form onSubmit={handleGuardarCliente} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Juan Pérez"
                  value={formCliente.nombre}
                  onChange={(e) => setFormCliente({ ...formCliente, nombre: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono (opcional)</label>
                <input
                  type="tel"
                  placeholder="Ej. 300 123 4567"
                  value={formCliente.telefono}
                  onChange={(e) => setFormCliente({ ...formCliente, telefono: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nota (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej. Trabaja en el piso 2"
                  value={formCliente.nota}
                  onChange={(e) => setFormCliente({ ...formCliente, nota: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow flex-1"
                >
                  {editandoClienteId ? 'Guardar Cambios' : 'Agregar Cliente'}
                </button>
                {editandoClienteId && (
                  <button
                    type="button"
                    onClick={cancelarEdicionCliente}
                    className="bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-slate-300 transition"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Cuentas de clientes */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <HandCoins size={18} className="text-amber-600" /> Cuentas de Clientes y Fiados
              </h2>
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                className="p-2 border border-slate-300 rounded-lg text-sm w-full md:w-64 focus:ring-2 focus:ring-indigo-500 outline-none no-print"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Teléfono</th>
                    <th className="p-3">Ventas Pendientes</th>
                    <th className="p-3">Último Fiado</th>
                    <th className="p-3">Deuda</th>
                    <th className="p-3 text-right no-print">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {cuentasVisibles.map(cuenta => {
                    const expandida = cuentaExpandida === cuenta.key;
                    return (
                      <React.Fragment key={cuenta.key}>
                        <tr className={`transition ${cuenta.deuda > 0 ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-slate-50'}`}>
                          <td className="p-3 font-semibold">
                            <button
                              onClick={() => { setCuentaExpandida(expandida ? null : cuenta.key); setMedioPagoAbono('Efectivo'); setFusionCuentaKey(null); }}
                              className="flex items-center gap-1.5 text-left text-indigo-600 hover:underline"
                            >
                              {expandida ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              {cuenta.nombre}
                            </button>
                            {!cuenta.cliente && (
                              <span className="ml-6 inline-block mt-1 text-[10px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">SIN REGISTRAR</span>
                            )}
                            {cuenta.cliente?.nota && <p className="ml-6 text-[11px] font-normal text-slate-400">{cuenta.cliente.nota}</p>}
                          </td>
                          <td className="p-3 text-slate-500">
                            {cuenta.cliente?.telefono
                              ? <span className="inline-flex items-center gap-1"><Phone size={12} /> {cuenta.cliente.telefono}</span>
                              : '—'}
                          </td>
                          <td className="p-3">{cuenta.pendientes.length}</td>
                          <td className="p-3 text-slate-500">{cuenta.ultimaFecha || '—'}</td>
                          <td className="p-3">
                            {cuenta.deuda > 0
                              ? <span className="font-bold text-amber-700">${cuenta.deuda.toLocaleString()}</span>
                              : <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Al día</span>}
                          </td>
                          <td className="p-3 text-right no-print">
                            <div className="flex justify-end gap-2">
                              {clientes.some(c => c.id !== cuenta.cliente?.id) && (
                                <button
                                  onClick={() => abrirFusion(cuenta)}
                                  className={`p-1 transition ${fusionCuentaKey === cuenta.key ? 'text-amber-700' : 'text-amber-600 hover:text-amber-800'}`}
                                  title={cuenta.cliente ? 'Fusionar: es un registro duplicado' : 'Asignar estas ventas a un cliente registrado'}
                                >
                                  <Merge size={16} />
                                </button>
                              )}
                              {cuenta.cliente ? (
                                <>
                                  <button onClick={() => iniciarEdicionCliente(cuenta.cliente)} className="text-indigo-600 hover:text-indigo-800 p-1" title="Editar cliente">
                                    <Edit2 size={16} />
                                  </button>
                                  <button onClick={() => eliminarCliente(cuenta)} className="text-rose-500 hover:text-rose-700 p-1" title="Eliminar cliente">
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => registrarDeudor(cuenta)}
                                  disabled={procesandoCuenta}
                                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 disabled:opacity-50"
                                  title="Registrar como cliente"
                                >
                                  <UserPlus size={14} /> Registrar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {fusionCuentaKey === cuenta.key && (
                          <tr className="bg-amber-50/60 no-print">
                            <td colSpan="6" className="p-4">
                              <div className="bg-white p-4 rounded-lg border border-amber-200 shadow-inner">
                                <p className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-1">
                                  <Merge size={16} className="text-amber-600" />
                                  {cuenta.cliente ? `Fusionar "${cuenta.nombre}" con otro cliente` : `Asignar las ventas de "${cuenta.nombre}" a un cliente`}
                                </p>
                                <p className="text-xs text-slate-500 mb-3">
                                  {cuenta.cliente
                                    ? 'Úsalo si este cliente quedó registrado dos veces. Sus ventas y su deuda pasan al cliente que elijas y este registro se elimina.'
                                    : 'Úsalo si estas ventas son de un cliente que ya está registrado con otro nombre.'}
                                  {' '}Se trasladarán <b>{ventasDeCuenta(cuenta).length} venta(s)</b> y una deuda de <b>${cuenta.deuda.toLocaleString()}</b>.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                  <label className="text-xs font-semibold text-slate-600">Pasar a:</label>
                                  <select
                                    value={fusionDestinoId}
                                    onChange={(e) => setFusionDestinoId(e.target.value)}
                                    className="p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white sm:w-64"
                                  >
                                    <option value="">Elegir cliente...</option>
                                    {clientes.filter(c => c.id !== cuenta.cliente?.id).map(c => (
                                      <option key={c.id} value={c.id}>{c.nombre}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => handleFusionar(cuenta)}
                                    disabled={!fusionDestinoId || procesandoCuenta}
                                    className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-700 transition shadow disabled:opacity-50"
                                  >
                                    {cuenta.cliente ? 'Fusionar y eliminar duplicado' : 'Asignar ventas'}
                                  </button>
                                  <button
                                    onClick={() => setFusionCuentaKey(null)}
                                    className="bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-slate-300 transition"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}

                        {expandida && (
                          <tr className="bg-slate-50/80">
                            <td colSpan="6" className="p-4">
                              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-inner">
                                {cuenta.pendientes.length === 0 ? (
                                  <p className="text-sm text-slate-500">✅ {cuenta.nombre} no tiene deudas pendientes.</p>
                                ) : (
                                  <>
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3 no-print">
                                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Ventas pendientes por cobrar</p>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <label className="text-xs text-slate-600">Pagó con:</label>
                                        <select
                                          value={medioPagoAbono}
                                          onChange={(e) => setMedioPagoAbono(e.target.value)}
                                          className="p-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                        >
                                          <option value="Efectivo">Efectivo</option>
                                          <option value="Transferencia">Transferencia</option>
                                          <option value="Tarjeta">Tarjeta</option>
                                          <option value="Nequi">Nequi</option>
                                          <option value="Daviplata">Daviplata</option>
                                        </select>
                                        <button
                                          onClick={() => handleSaldarTodo(cuenta)}
                                          disabled={procesandoCuenta}
                                          className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700 transition shadow disabled:opacity-50"
                                        >
                                          <CheckCircle size={14} /> Saldar Todo (${cuenta.deuda.toLocaleString()})
                                        </button>
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      {cuenta.pendientes
                                        .slice()
                                        .sort((a, b) => (a.creadoEn || 0) - (b.creadoEn || 0))
                                        .map(v => (
                                          <div key={v.id} className="flex justify-between items-center text-xs bg-slate-50 p-2 rounded border border-slate-100">
                                            <div>
                                              <span className="text-slate-500">{v.fecha}</span>
                                              <span className="ml-3 font-semibold text-slate-800">{v.producto}</span>
                                              <span className="ml-2 text-slate-500">x{v.cantidad}</span>
                                              {v.variante && <span className="ml-2 text-slate-400">({v.variante})</span>}
                                            </div>
                                            <div className="flex items-center gap-3">
                                              <span className="font-bold text-slate-900">${v.total.toLocaleString()}</span>
                                              <button
                                                onClick={() => handlePagarVenta(v)}
                                                disabled={procesandoCuenta}
                                                className="text-emerald-700 hover:underline font-semibold no-print disabled:opacity-50"
                                              >
                                                Pagar
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {cuentasVisibles.length === 0 && (
                    <tr>
                      <td colSpan="6" className="p-6 text-center text-slate-400">
                        {busquedaCliente ? 'Ningún cliente coincide con la búsqueda.' : 'No hay clientes registrados ni ventas fiadas.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PESTAÑA ESTADO DE CUENTA ==================== */}
      {pestana === 'estado_cuenta' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Tarjeta de Efectivo Total en Caja (Corregida y limpia) */}
            <div className="bg-indigo-900 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xs font-bold tracking-wider uppercase opacity-80">Efectivo Total en Caja (Vivo)</h3>
                  <p className="text-3xl font-extrabold mt-1">${efectivoTotalEnCaja.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-white/10 rounded-xl">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xs font-bold tracking-wider uppercase text-slate-400">Recuperación Reposiciones (Punto Cero)</h3>
                  <p className={`text-3xl font-extrabold mt-1 ${estadoPuntoCeroReposicion >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    ${estadoPuntoCeroReposicion.toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    {estadoPuntoCeroReposicion >= 0 ? 'Reposiciones cubiertas por completo.' : `Falta por recuperar $${Math.abs(estadoPuntoCeroReposicion).toLocaleString()} para quedar en $0.`}
                  </p>
                </div>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                  <RefreshCw className="w-6 h-6" />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xs font-bold tracking-wider uppercase text-slate-400">Gastos Totales Registrados</h3>
                  <p className="text-3xl font-extrabold text-rose-600 mt-1">${totalGastosRegistrados.toLocaleString()}</p>
                  <p className="text-xs text-slate-500 mt-2">Incluye proveedores (${gastosEnReposiciones.toLocaleString()}) y otros egresos.</p>
                </div>
                <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                  <TrendingDown className="w-6 h-6" />
                </div>
              </div>
            </div>

            <button
              onClick={() => setPestana('clientes')}
              className="text-left bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-300 transition"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xs font-bold tracking-wider uppercase text-slate-400">Por Cobrar (Fiados)</h3>
                  <p className="text-3xl font-extrabold text-amber-600 mt-1">${totalPorCobrar.toLocaleString()}</p>
                  <p className="text-xs text-slate-500 mt-2">
                    {clientesConDeuda === 0 ? 'Nadie debe dinero.' : `${clientesConDeuda} cliente(s) con deuda. Ver en Clientes →`}
                  </p>
                </div>
                <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                  <HandCoins className="w-6 h-6" />
                </div>
              </div>
            </button>
          </div>

          {/* Ajustar efectivo base no registrado */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm no-print">
            <h2 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
              <DollarSign size={18} className="text-emerald-600" /> Ajustar Efectivo Base No Registrado
            </h2>
            <p className="text-xs text-slate-500 mb-4">Ingresa la cantidad de dinero acumulado físicamente que no se había registrado previamente.</p>
            <form onSubmit={handleGuardarEfectivoBase} className="flex gap-3 items-center">
              <input
                type="number"
                placeholder={`Actual: ${cajaInicial}`}
                value={nuevoEfectivoBaseInput}
                onChange={(e) => setNuevoEfectivoBaseInput(e.target.value)}
                className="p-2 border border-slate-300 rounded-lg text-sm w-48 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <button
                type="submit"
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition flex items-center gap-2 shadow"
              >
                <Save size={16} /> Guardar Base
              </button>
            </form>
          </div>

          {/* Registro de Gastos y Proveedores */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-800 mb-4">
              {editandoGastoId ? 'Editar Gasto / Proveedor' : 'Registrar Nuevo Gasto o Compra a Proveedor'}
            </h2>
            <form onSubmit={handleAgregarOEditarGasto} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mb-6">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Concepto</label>
                <input
                  type="text"
                  placeholder="Ej. Compra de Limones, Transporte..."
                  value={formGasto.concepto}
                  onChange={(e) => setFormGasto({ ...formGasto, concepto: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Monto ($)</label>
                <input
                  type="number"
                  placeholder="Ej. 15000"
                  value={formGasto.monto}
                  onChange={(e) => setFormGasto({ ...formGasto, monto: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Gasto</label>
                <select
                  value={formGasto.tipo}
                  onChange={(e) => setFormGasto({ ...formGasto, tipo: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="Proveedor">Proveedor / Reposición</option>
                  <option value="Compra Productos">Compra Productos</option>
                  <option value="Operativo">Gasto Operativo</option>
                  <option value="Otro">Otro Egreso</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow flex-1"
                >
                  {editandoGastoId ? 'Actualizar' : 'Agregar Gasto'}
                </button>
                {editandoGastoId && (
                  <button
                    type="button"
                    onClick={cancelarEdicionGasto}
                    className="bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-slate-300 transition"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            <h3 className="text-sm font-bold text-slate-700 mb-3">Historial de Gastos y Egresos</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Concepto</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Monto</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {gastos.map((g) => (
                    <tr key={g.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 text-slate-500">{g.fecha}</td>
                      <td className="p-3 font-medium text-slate-800">{g.concepto}</td>
                      <td className="p-3"><span className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">{g.tipo}</span></td>
                      <td className="p-3 font-bold text-rose-600">${g.monto.toLocaleString()}</td>
                      <td className="p-3 text-right flex justify-end gap-2">
                        <button onClick={() => iniciarEdicionGasto(g)} className="text-indigo-600 hover:text-indigo-800 p-1" title="Editar gasto">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => eliminarGasto(g.id)} className="text-rose-500 hover:text-rose-700 p-1" title="Eliminar gasto">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {gastos.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-6 text-center text-slate-400">No hay gastos registrados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PESTAÑA INVENTARIO ==================== */}
      {pestana === 'inventario' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm no-print">
            <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Package size={18} className="text-indigo-600" />
              {editandoProductoId ? 'Editar Producto Base' : 'Añadir Nuevo Producto o Lote (FEFO)'}
            </h2>
            <form onSubmit={handleGuardarProducto} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del Producto</label>
                <input
                  type="text"
                  placeholder="Ej. Limonada Natural"
                  value={formProducto.nombre}
                  onChange={(e) => setFormProducto({ ...formProducto, nombre: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required={!editandoProductoId}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Costo Unitario ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ej. 1000"
                  value={formProducto.costo}
                  onChange={(e) => setFormProducto({ ...formProducto, costo: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required={!editandoProductoId}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Precio de Venta ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ej. 2500"
                  value={formProducto.precio}
                  onChange={(e) => setFormProducto({ ...formProducto, precio: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required={!editandoProductoId}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Categoría</label>
                <select
                  value={formProducto.categoria}
                  onChange={(e) => setFormProducto({ ...formProducto, categoria: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="">Sin categoría</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.nombre}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Variante / Sabor del Lote</label>
                <input
                  type="text"
                  placeholder="Ej. Botella 500ml, Frutos Rojos..."
                  value={formProducto.variante}
                  onChange={(e) => setFormProducto({ ...formProducto, variante: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cantidad del Lote</label>
                <input
                  type="number"
                  placeholder="Ej. 20"
                  value={formProducto.cantidad}
                  onChange={(e) => setFormProducto({ ...formProducto, cantidad: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha de Vencimiento</label>
                <input
                  type="date"
                  value={formProducto.vencimiento}
                  onChange={(e) => setFormProducto({ ...formProducto, vencimiento: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow flex-1"
                >
                  {editandoProductoId ? 'Guardar Cambios' : 'Añadir al Inventario'}
                </button>
                {editandoProductoId && (
                  <button
                    type="button"
                    onClick={cancelarEdicion}
                    className="bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-slate-300 transition"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-800">Inventario por Lotes (Control FEFO)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="p-3">Producto</th>
                    <th className="p-3">Categoría</th>
                    <th className="p-3">Costo</th>
                    <th className="p-3">Precio</th>
                    <th className="p-3">Stock Total</th>
                    <th className="p-3">Próx. Vencimiento</th>
                    <th className="p-3 text-right no-print">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {productos.map((p) => {
                    const stockTotal = getStockTotalProducto(p);
                    const proxVenc = getProximoVencimientoProducto(p);
                    const lotes = obtenerLotesNorm(p);
                    const expandido = productoExpandidoId === p.id;

                    return (
                      <React.Fragment key={p.id}>
                        <tr className="hover:bg-slate-50 transition">
                          <td className="p-3 font-semibold text-indigo-600">
                            <button
                              onClick={() => setProductoExpandidoId(expandido ? null : p.id)}
                              className="flex items-center gap-1.5 text-left hover:underline"
                            >
                              {expandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              {p.nombre}
                            </button>
                          </td>
                          <td className="p-3 text-slate-500">{p.categoria || 'Sin categoría'}</td>
                          <td className="p-3">${p.costo}</td>
                          <td className="p-3 font-bold text-slate-900">${p.precio}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              stockTotal <= 0 ? 'bg-rose-100 text-rose-700' : stockTotal <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {stockTotal} un.
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">{proxVenc}</td>
                          <td className="p-3 text-right no-print flex justify-end gap-2">
                            <button onClick={() => iniciarEdicionProductoBase(p)} className="text-indigo-600 hover:text-indigo-800 p-1" title="Editar datos base">
                              <Edit2 size={16} />
                            </button>
                            <button onClick={() => eliminarProductoCompleto(p.id)} className="text-rose-500 hover:text-rose-700 p-1" title="Eliminar producto completo">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                        {expandido && (
                          <tr className="bg-slate-50/80">
                            <td colSpan="7" className="p-4">
                              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-inner">
                                <p className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Desglose de Lotes (FEFO):</p>
                                <div className="space-y-2">
                                  {lotes.map(lote => (
                                    <div key={lote.id} className="flex justify-between items-center text-xs bg-slate-50 p-2 rounded border border-slate-100">
                                      <div>
                                        <span className="font-semibold text-slate-800">Variante: {lote.variante}</span> | 
                                        <span className="text-slate-600 ml-2">Cantidad: <b>{lote.cantidad}</b></span> | 
                                        <span className="text-slate-500 ml-2">Vencimiento: {lote.vencimiento}</span>
                                      </div>
                                      <div className="flex gap-2 no-print">
                                        <button onClick={() => handleEditarLote(p.id, lote.id)} className="text-indigo-600 hover:underline">Editar</button>
                                        <button onClick={() => handleEliminarLote(p.id, lote.id)} className="text-rose-600 hover:underline">Eliminar</button>
                                      </div>
                                    </div>
                                  ))}
                                  {lotes.length === 0 && (
                                    <p className="text-xs text-slate-400">No hay lotes registrados para este producto.</p>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {productos.length === 0 && (
                    <tr>
                      <td colSpan="7" className="p-6 text-center text-slate-400">No hay productos en el inventario.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PESTAÑA CATEGORÍAS ==================== */}
      {pestana === 'categorias' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-xl mx-auto">
          <h2 className="text-base font-bold text-slate-800 mb-4">Gestión de Categorías</h2>
          <form onSubmit={handleAgregarCategoria} className="flex gap-3 mb-6">
            <input
              type="text"
              placeholder="Nueva categoría..."
              value={nuevaCategoria}
              onChange={(e) => setNuevaCategoria(e.target.value)}
              className="flex-1 p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow">
              Agregar
            </button>
          </form>

          <div className="space-y-2">
            {categorias.map(c => (
              <div key={c.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-sm font-medium text-slate-800">{c.nombre}</span>
                <button onClick={() => eliminarCategoria(c.id)} className="text-rose-500 hover:text-rose-700 p-1">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {categorias.length === 0 && (
              <p className="text-center text-slate-400 text-sm py-4">No hay categorías creadas.</p>
            )}
          </div>
        </div>
      )}

      {/* ==================== PESTAÑA CARTA ==================== */}
      {pestana === 'catalogo' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-2xl mx-auto text-center">
          <BookOpen size={48} className="mx-auto text-indigo-600 mb-3" />
          <h2 className="text-xl font-bold text-slate-900 mb-1">Carta y Menú Público</h2>
          <p className="text-sm text-slate-500 mb-6">Vista previa rápida de los productos disponibles para ofrecer a los clientes.</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
            {productos.map(p => {
              const stockTotal = getStockTotalProducto(p);
              if (stockTotal <= 0) return null;
              return (
                <div key={p.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-slate-800">{p.nombre}</h3>
                    <span className="font-extrabold text-indigo-600">${p.precio}</span>
                  </div>
                  <p className="text-xs text-slate-500">{p.categoria || 'General'} — Stock: {stockTotal} un.</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}