import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { 
  collection, onSnapshot, doc
} from 'firebase/firestore';
import { db } from './firebase';
import { enviarMensajeTelegram, obtenerUltimosMensajesTelegram } from './telegram';
import { cerrarSesion } from './servidor';
import Perfil from './Perfil';
import ConfigNegocio from './ConfigNegocio';
import { colorNegocio, ID_TAZON, FormNuevoNegocio } from './negociosComun';
import { useConfigDatafono, calcularCobroTarjeta, desglose, DATAFONO_POR_DEFECTO } from './Datafono';
import Socios from './Socios';
import Materiales from './Materiales';
import ProductosFabricados from './ProductosFabricados';
import SelectorFabricado from './SelectorFabricado';
import { CompraMateriales, RegistrarDano, PerdidasFinanzas } from './ComprasDanos';
import GananciaProductos from './GananciaProductos';
import ConfigMarca from './ConfigMarca';
import { aplicarMarca } from './marca';
import Recorrido from './Recorrido';
import CajaBase from './CajaBase';
import BajasLotes from './BajasLotes';
import VincularCodigo from './VincularCodigo';
import { precioPorCantidad, planificarVenta, descripcionLinea, claveVariante, variantesDe, precioUnitario } from './fabricacion';
import Historial from './Historial';
import { operacionAuditada, tienePermiso } from './auditoria';
import { MenuDesplegable, MenuItem, MenuSeparador, MenuTitulo, Plegable, usePantalla } from './ui';
import { useLectorCodigos } from './lectorCodigos';
// La cámara y las etiquetas usan librerías pesadas: se cargan solo cuando se abren
const Etiquetas = lazy(() => import('./Etiquetas'));
const EscanerCamara = lazy(() => import('./Escaner').then(m => ({ default: m.EscanerCamara })));
import { codigosDe, buscarProductoPorCodigo, generarCodigoInterno, consultarOpenFoodFacts, esCodigoInterno, limpiarCodigo } from './codigos';
import {
  CheckCircle, Trash2, Package, Send, BookOpen, AlertTriangle, Tag, Edit2,
  ChevronDown, ChevronUp, Save, Wallet, TrendingDown, RefreshCw, LogOut, ShoppingCart, Users,
  HandCoins, UserPlus, Phone, Merge, UserCircle, History, BellRing, Boxes, UtensilsCrossed,
  Handshake, Banknote, PiggyBank, ClipboardList, Receipt, PackagePlus, Store, Search, Plus, Minus, Ellipsis, Gift, PackageX, Archive, ScanBarcode, Barcode, Tags, Sparkles, X, Settings, PlusCircle, Layers, Hammer, Compass
} from 'lucide-react';

// Fecha AAAA-MM-DD con la hora de Colombia. Antes se usaba la hora UTC y lo que se
// registraba después de las 7:00 p. m. quedaba con la fecha del día siguiente.
const ZONA_HORARIA = 'America/Bogota';
const fechaLocal = (momento = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(momento);

// Formulario de producto vacío
const FORM_PRODUCTO_VACIO = { productoId: '', nombre: '', costo: '', precio: '', variante: 'General', cantidad: '', vencimiento: '', categoria: '', descripcion: '', codigo: '' };

// Formato de dinero colombiano: $12.500
const dinero = (n) => {
  const valor = Math.round(Number(n) || 0);
  return (valor < 0 ? '-$' : '$') + Math.abs(valor).toLocaleString('es-CO');
};

// Indicador en bloque de color (estilo de la marca)
const Kpi = ({ color, icono, etiqueta, valor, detalle, onClick, clase = '' }) => {
  const Contenedor = onClick ? 'button' : 'div';
  return (
    <Contenedor onClick={onClick} className={`${clase} kpi kpi-${color} p-3 sm:p-4 text-left print-card ${onClick ? 'hover:-translate-y-0.5 transition' : ''}`}>
      <div className="flex justify-between items-start gap-2">
        <p className="kpi-etiqueta">{etiqueta}</p>
        <span className="kpi-icono">{icono}</span>
      </div>
      <p className="kpi-valor text-xl sm:text-2xl md:text-[1.75rem] leading-tight mt-1">{valor}</p>
      {detalle && <p className="text-[11px] sm:text-xs mt-1 font-medium opacity-80">{detalle}</p>}
    </Contenedor>
  );
};

// Aviso que aparece sobre un formulario cuando el socio no tiene ese rango de edición
const AvisoSinPermiso = ({ accion }) => (
  <p className="aviso aviso-atencion mb-3">
    🔒 Solo lectura: no tienes permiso para {accion}. El titular puede asignártelo en la pestaña Socios.
  </p>
);

// "Maira · 14 oct, 3:20 p. m." a partir del sello de auditoría del documento
const firmaCambio = (item) => {
  if (!item?.modificadoPorNombre) return null;
  // Si el registro no se ha tocado desde que se copió, se muestra quién lo hizo originalmente
  const sinCambiosDesdeCopia = item.firmaAnterior?.nombre && item.copiadoEn?.toMillis?.() === item.modificadoEn?.toMillis?.();
  if (sinCambiosDesdeCopia) {
    const f = item.firmaAnterior.fecha?.toDate?.();
    return `${item.firmaAnterior.nombre}${f ? ' · ' + f.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}`;
  }
  const fecha = item.modificadoEn?.toDate?.();
  const hora = fecha
    ? fecha.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '';
  return `${item.modificadoPorNombre}${hora ? ' · ' + hora : ''}`;
};

const FirmaCambio = ({ item }) => {
  const texto = firmaCambio(item);
  return texto ? <span className="block text-[10px] text-slate-400 font-normal whitespace-nowrap" title="Último cambio">✎ {texto}</span> : null;
};

export default function App({ usuario, onSesionVencida, negocioId, negocio, negocios = [], cambiarNegocio }) {
  // Todo se guarda dentro del negocio actual: negocios/{negocioId}/...
  const col = (nombre) => collection(db, 'negocios', negocioId, nombre);
  const docN = (nombre, id) => doc(db, 'negocios', negocioId, nombre, id);
  // Reparto configurable por negocio (Equipo → Configuración)
  const porcentajeAhorro = Math.min(100, Math.max(0, Number(negocio?.porcentajeAhorro ?? 15)));
  const numeroSocios = Math.max(1, Math.round(Number(negocio?.numeroSocios ?? 3)));
  // Los avisos de Telegram llevan el nombre del negocio
  const avisarTelegram = (texto) => enviarMensajeTelegram(`🏪 <b>${negocio?.nombre || ''}</b>\n` + texto, negocioId);
  const [pestana, setPestana] = useState('ventas');
  const [productos, setProductos] = useState([]);
  // Productos que se arman con materiales (Noguri). Van aparte: no usan lotes ni stock propio.
  const [fabricados, setFabricados] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [eligiendoFabricado, setEligiendoFabricado] = useState(null);
  const [perdidas, setPerdidas] = useState([]);
  // Marca propia del negocio (Equipo → Configuración → Marca y apariencia)
  const [marca, setMarca] = useState(null);
  const marcaActiva = marca?.activa ? marca : null;
  useEffect(() => onSnapshot(doc(db, 'negocios', negocioId, 'config', 'marca'),
    (s) => setMarca(s.exists() ? s.data() : null),
    () => setMarca(null)
  ), [negocioId]);
  useEffect(() => { aplicarMarca(marcaActiva); }, [marcaActiva]);
  useEffect(() => () => aplicarMarca(null), []);
  const fabricadosPorId = Object.fromEntries(fabricados.map(p => [p.id, p]));
  const materialesPorId = Object.fromEntries(materiales.map(m => [m.id, m]));
  const [ventas, setVentas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [perfil, setPerfil] = useState(null);

  // Rangos de edición: el titular puede todo; los socios según sus permisos
  const [miembro, setMiembro] = useState(null);
  const puede = (permiso) => tienePermiso(miembro, permiso);
  const exigir = (permiso, accion) => {
    if (puede(permiso)) return true;
    alert(`🔒 No tienes permiso para ${accion}.\n\nPídele al titular (o a quien gestione los socios) que te asigne ese rango.`);
    return false;
  };
  // Todo cambio se registra con el nombre del usuario y la hora (ver auditoria.js)
  const operacion = (accion, detalle) => operacionAuditada(usuario, perfil, accion, detalle, negocioId);
  const [cajaInicial, setCajaInicial] = useState(0);
  const [cajaDocId, setCajaDocId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorAcceso, setErrorAcceso] = useState(null);

  // Estados desplegables y edición
  const [productoExpandidoId, setProductoExpandidoId] = useState(null);
  const [gastoExpandidoId, setGastoExpandidoId] = useState(null);
  const [editandoProductoId, setEditandoProductoId] = useState(null);
  const [editandoGastoId, setEditandoGastoId] = useState(null);
  const [movimientosCaja, setMovimientosCaja] = useState([]);

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
    const montadoEn = Date.now();
    let avisado = false;

    // Si las reglas rechazan el acceso es porque venció la verificación de este
    // dispositivo (o se revocó): se vuelve a la pantalla de verificación.
    // Si ocurre apenas se abrió la app, es otro problema y se muestra el aviso.
    const manejarError = (error) => {
      console.error("Error de Firestore:", error);
      if (avisado) return;
      avisado = true;
      if (error.code === 'permission-denied' && Date.now() - montadoEn > 15000) {
        onSesionVencida();
        return;
      }
      setErrorAcceso(error.code === 'permission-denied'
        ? 'Tu cuenta no tiene permisos para ver estos datos o la verificación de este dispositivo no es válida.'
        : 'No se pudieron cargar los datos: ' + error.message);
      setCargando(false);
    };

    const unsubProductos = onSnapshot(col('productos'), (snapshot) => {
      const lista = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setProductos(lista.filter(p => !p.fabricado));
      setFabricados(lista.filter(p => p.fabricado));
    }, manejarError);

    const unsubMateriales = onSnapshot(col('materiales'), (snapshot) => {
      setMateriales(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, manejarError);

    const unsubPerdidas = onSnapshot(col('perdidas'), (snapshot) => {
      setPerdidas(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, manejarError);

    const unsubVentas = onSnapshot(col('ventas'), (snapshot) => {
      const lista = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setVentas(lista.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0)));
      setCargando(false);
    }, manejarError);

    const unsubCategorias = onSnapshot(col('categorias'), (snapshot) => {
      setCategorias(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, manejarError);

    const unsubGastos = onSnapshot(col('gastos'), (snapshot) => {
      const listaG = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setGastos(listaG.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0)));
    }, manejarError);

    const unsubMiembro = onSnapshot(doc(db, 'negocios', negocioId, 'miembros', usuario.uid), (snapshot) => {
      setMiembro(snapshot.exists() ? snapshot.data() : null);
    }, manejarError);

    const unsubPerfil = onSnapshot(doc(db, 'admins', usuario.uid), (snapshot) => {
      setPerfil(snapshot.exists() ? snapshot.data() : null);
    }, manejarError);

    const unsubClientes = onSnapshot(col('clientes'), (snapshot) => {
      const listaC = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setClientes(listaC.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')));
    }, manejarError);

    const unsubCaja = onSnapshot(col('caja_base'), (snapshot) => {
      if (!snapshot.empty) {
        const docCaja = snapshot.docs[0];
        setCajaInicial(docCaja.data().monto || 0);
        setCajaDocId(docCaja.id);
        setMovimientosCaja(docCaja.data().movimientos || []);
      } else {
        setCajaInicial(0);
        setCajaDocId(null);
        setMovimientosCaja([]);
      }
    }, manejarError);

    return () => {
      unsubProductos();
      unsubMateriales();
      unsubPerdidas();
      unsubVentas();
      unsubCategorias();
      unsubGastos();
      unsubPerfil();
      unsubMiembro();
      unsubClientes();
      unsubCaja();
    };
  }, []);

  // Listener Telegram
  useEffect(() => {
    const intervalo = setInterval(async () => {
      const mensajes = await obtenerUltimosMensajesTelegram(negocioId);
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
    cliente: '', productoId: '', variante: 'TODAS', cantidad: 1, pagado: true, staff: false, medioPago: 'Efectivo', otroMedioPago: ''
  });

  const [formProducto, setFormProducto] = useState(FORM_PRODUCTO_VACIO);
  // Agregando un lote a un producto que ya existe (se llega escaneando su código)
  const modoLote = !!formProducto.productoId;

  // ---- Códigos de barras: escáner, avisos breves y formulario ----
  const [escaner, setEscaner] = useState(null); // 'venta' | 'inventario' | 'formulario'
  const [toast, setToast] = useState(null);
  const [formularioProductoAbierto, setFormularioProductoAbierto] = useState(false);
  const [buscandoNombre, setBuscandoNombre] = useState(false);
  // Código leído que no está registrado: se ofrece vincularlo a un producto existente
  const [codigoPorVincular, setCodigoPorVincular] = useState(null); // { codigo, origen: 'venta' | 'inventario' }
  const mostrarToast = (texto, tipo = 'ok') => setToast({ texto, tipo, id: Date.now() });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

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
    // El recargo por tarjeta no es ingreso del negocio (se lo queda el datáfono)
    const ventasPagadas = (listaVentas || ventas).filter(v => v.pagado && !v.archivada && !v.esRecargo);
    const totalIngresos = ventasPagadas.reduce((acc, v) => acc + v.total, 0);
    const totalReposicion = ventasPagadas.reduce((acc, v) => acc + v.costoTotal, 0);
    const gananciaBruta = ventasPagadas.reduce((acc, v) => acc + v.ganancia, 0);

    const ahorro = gananciaBruta * porcentajeAhorro / 100;
    const gananciaRepartible = gananciaBruta - ahorro;
    const pagoSocio = gananciaRepartible / numeroSocios;

    const fechaActual = new Date().toLocaleDateString('es-ES', { 
      year: 'numeric', month: 'long', day: 'numeric' 
    });

    const reporteTexto = 
      `📊 <b>INFORME DE CIERRE DE VENTAS</b>\n` +
      `📅 Fecha: ${fechaActual}\n\n` +
      `💰 <b>Ventas pagadas del período:</b> $${totalIngresos.toLocaleString()}\n` +
      `🔄 <b>Fondo Reposición:</b> $${totalReposicion.toLocaleString()}\n` +
      `🌱 <b>Fondo Ahorro (${porcentajeAhorro}%):</b> $${ahorro.toLocaleString()}\n` +
      `👥 <b>Pago por Socio (${numeroSocios}):</b> $${pagoSocio.toLocaleString(undefined, {maximumFractionDigits: 0})}\n\n` +
      `🛒 Total ventas registradas: ${ventasPagadas.length}\n` +
      `🧾 <b>Por cobrar (fiados):</b> $${(listaVentas || ventas).filter(v => !v.pagado).reduce((acc, v) => acc + v.total, 0).toLocaleString()}`;

    return await avisarTelegram(reporteTexto);
  };

  const generarYEnviarAlertaStock = async (listaProductos) => {
    const prods = listaProductos || productos;
    const agotados = prods.filter(p => getStockTotalProducto(p) <= 0);
    const porAgotarse = prods.filter(p => {
      const st = getStockTotalProducto(p);
      return st > 0 && st <= 3;
    });

    if (agotados.length === 0 && porAgotarse.length === 0) {
      return await avisarTelegram("✅ <b>Estado del Inventario:</b> Todo el inventario está en niveles óptimos.");
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

    return await avisarTelegram(textoAlerta);
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
    if (!exigir('clientes', 'gestionar clientes')) return;

    try {
      if (editandoClienteId) {
        const anterior = clientes.find(c => c.id === editandoClienteId);
        const op = operacion('Cliente editado', anterior?.nombre !== nombre ? `${anterior?.nombre} → ${nombre}` : nombre);
        op.actualizar(docN('clientes', editandoClienteId), datos, anterior);

        // Si cambió el nombre, se actualiza también en sus ventas para que el historial coincida
        if (anterior && anterior.nombre !== nombre) {
          ventas
            .filter(v => clienteDeVenta(v)?.id === editandoClienteId)
            .forEach(v => op.actualizar(docN('ventas', v.id), { cliente: nombre, clienteId: editandoClienteId }, v));
        }
        await op.guardar();
      } else {
        const op = operacion('Cliente registrado', nombre);
        op.crear(doc(col('clientes')), { ...datos, creadoEn: Date.now() });
        await op.guardar();
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
    if (!exigir('clientes', 'eliminar clientes')) return;
    if (!confirm(`¿Eliminar al cliente "${cuenta.nombre}"? Sus ventas pasadas se conservan en el historial.`)) return;
    try {
      const op = operacion('Cliente eliminado', cuenta.nombre);
      op.eliminar(docN('clientes', cuenta.cliente.id), cuenta.cliente);
      await op.guardar();
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
    if (!exigir('clientes', 'fusionar clientes')) return;

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
      // Primero se mueven las ventas y después se borra el duplicado (todo queda registrado)
      const op = operacion(
        cuenta.cliente ? 'Clientes fusionados' : 'Ventas asignadas a cliente',
        `${cuenta.nombre} → ${destino.nombre} (${ventasMover.length} ventas, deuda $${cuenta.deuda.toLocaleString()})`
      );
      ventasMover.forEach(v => op.actualizar(docN('ventas', v.id), { clienteId: destino.id, cliente: destino.nombre }, v));
      if (cuenta.cliente) op.eliminar(docN('clientes', cuenta.cliente.id), cuenta.cliente);
      await op.guardar();

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
    if (!exigir('clientes', 'registrar clientes')) return;
    setProcesandoCuenta(true);
    try {
      const nombre = cuenta.nombre.trim().replace(/\s+/g, ' ');
      const op = operacion('Cliente registrado', `${nombre} (con ${cuenta.pendientes.length} fiados antiguos)`);
      const refCliente = op.crear(doc(col('clientes')), { nombre, telefono: '', nota: '', creadoEn: Date.now() });
      cuenta.pendientes.forEach(v => op.actualizar(docN('ventas', v.id), { clienteId: refCliente.id, cliente: nombre }, v));
      await op.guardar();
    } catch (error) {
      alert("Error al registrar el cliente: " + error.message);
    } finally {
      setProcesandoCuenta(false);
    }
  };

  // Marca como pagadas las ventas indicadas, con el medio con que se pagó la deuda
  const saldarVentas = async (ventasASaldar, medioPago, nombreCliente) => {
    const total = ventasASaldar.reduce((acc, v) => acc + v.total, 0);
    const op = operacion('Fiado cobrado', `${nombreCliente || ventasASaldar[0]?.cliente} — $${total.toLocaleString()} (${medioPago}, ${ventasASaldar.length} venta/s)`);
    ventasASaldar.forEach(v => op.actualizar(
      docN('ventas', v.id),
      { pagado: true, medioPago, fechaPago: fechaLocal() },
      v
    ));
    await op.guardar();
  };

  const handleSaldarTodo = async (cuenta) => {
    if (cuenta.pendientes.length === 0) return;
    if (!exigir('clientes', 'cobrar fiados')) return;
    if (!confirm(`¿Registrar el pago de TODA la deuda de "${cuenta.nombre}"?\n\n${cuenta.pendientes.length} venta(s) por $${cuenta.deuda.toLocaleString()} pagadas con ${medioPagoAbono}.`)) return;

    setProcesandoCuenta(true);
    try {
      await saldarVentas(cuenta.pendientes, medioPagoAbono, cuenta.nombre);
      avisarTelegram(
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
    if (!exigir('clientes', 'cobrar fiados')) return;
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
  const [ventanaNegocio, setVentanaNegocio] = useState(false);
  // Tutorial (recorrido guiado): sale solo la primera vez en cada dispositivo y se repite desde el menú
  const [recorridoAbierto, setRecorridoAbierto] = useState(false);
  const claveRecorrido = `recorrido-v1-${usuario?.uid}`;
  // Tarifas del datáfono del negocio (Mi perfil → Datáfono y tarifas de tarjeta)
  const configDatafono = useConfigDatafono(negocioId);
  const [datafonoId, setDatafonoId] = useState(null);
  // En PC (≥ 1536 px) el pedido es una columna fija; en celular, tablet y portátil es una ventana flotante
  const esPC = usePantalla('(min-width: 1536px)');
  const [pedidoAbierto, setPedidoAbierto] = useState(false);
  useEffect(() => {
    if (!pedidoAbierto || esPC) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const cerrarEscape = (e) => { if (e.key === 'Escape') setPedidoAbierto(false); };
    window.addEventListener('keydown', cerrarEscape);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', cerrarEscape);
    };
  }, [pedidoAbierto, esPC]);
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
      if (item.fabricado) continue;
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

  // Filtros del catálogo y del historial de ventas
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [categoriaVenta, setCategoriaVenta] = useState('');
  const [filtroVentas, setFiltroVentas] = useState('todas');
  const [busquedaVentas, setBusquedaVentas] = useState('');

  // Agrega un producto al pedido (con un toque en el catálogo). Si ya está, suma la cantidad.
  const agregarProducto = (prod, variante = 'TODAS', cantidad = 1) => {
    if (!exigir('ventas', 'registrar ventas')) return false;
    const existente = carrito.find(i => i.productoId === prod.id && i.variante === variante);
    const carritoNuevo = existente
      ? carrito.map(i => i === existente ? { ...i, cantidad: i.cantidad + cantidad } : i)
      : [...carrito, {
          key: `${prod.id}_${Date.now()}`,
          productoId: prod.id,
          nombre: prod.nombre,
          variante,
          cantidad,
          precio: Number(prod.precio) || 0,
          costo: Number(prod.costo) || 0
        }];

    const { error } = simularCarrito(carritoNuevo);
    if (error) {
      alert(`❌ ${error}`);
      return false;
    }
    setCarrito(carritoNuevo);
    return true;
  };

  // Producto fabricado: cada combinación de opciones y adicionales es una línea del pedido.
  // No se valida stock: lo que no esté listo se arma al vender (ver planificarVenta).
  const agregarFabricado = (prod, { valores = [], adicionales = [], cantidad = 1, precio }) => {
    if (!exigir('ventas', 'registrar ventas')) return false;
    const extras = [...adicionales].sort();
    const existente = carrito.find(i => i.fabricado && i.productoId === prod.id
      && claveVariante(i.valores) === claveVariante(valores) && claveVariante(i.adicionales) === claveVariante(extras));
    setCarrito(existente
      ? carrito.map(i => (i === existente ? { ...i, cantidad: i.cantidad + cantidad } : i))
      : [...carrito, {
          key: `${prod.id}_${Date.now()}`,
          productoId: prod.id,
          nombre: prod.nombre,
          fabricado: true,
          valores,
          adicionales: extras,
          variante: descripcionLinea(prod, valores, extras),
          cantidad,
          precio: precio ?? (Number(prod.precio) || 0)
        }]);
    return true;
  };

  // Cambia la variante/lote de una línea del pedido (si ya existe esa variante, se juntan)
  const handleCambiarVarianteItem = (key, variante) => {
    const item = carrito.find(i => i.key === key);
    if (!item || item.variante === variante) return;
    const igual = carrito.find(i => i.key !== key && i.productoId === item.productoId && i.variante === variante);
    const carritoNuevo = igual
      ? carrito.filter(i => i.key !== key).map(i => i === igual ? { ...i, cantidad: i.cantidad + item.cantidad } : i)
      : carrito.map(i => i.key === key ? { ...i, variante } : i);
    const { error } = simularCarrito(carritoNuevo);
    if (error) return alert(`❌ ${error}`);
    setCarrito(carritoNuevo);
  };

  const handleCambiarCantidadItem = (key, nuevaCantidad) => {
    const cantidad = Number(nuevaCantidad);
    if (cantidad === 0) return handleQuitarItem(key);
    if (!Number.isInteger(cantidad) || cantidad < 0) return;
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

  // Los fabricados pueden tener precio por cantidad (2 botones por $3.500)
  const totalItem = (i) => (i.fabricado ? precioPorCantidad(fabricadosPorId[i.productoId] || {}, i.cantidad, i.precio) : i.precio * i.cantidad);
  const totalCarrito = carrito.reduce((acc, i) => acc + totalItem(i), 0);
  const unidadesCarrito = carrito.reduce((acc, i) => acc + i.cantidad, 0);

  // Pago con tarjeta: se suma la tarifa del datáfono para que al negocio le llegue completo
  const datafonos = configDatafono?.datafonos?.length ? configDatafono.datafonos : [DATAFONO_POR_DEFECTO];
  const datafonoActivo = datafonos.find(d => d.id === datafonoId)
    || datafonos.find(d => d.id === configDatafono?.predeterminado)
    || datafonos[0];
  const cobroTarjeta = formVenta.medioPago === 'Tarjeta' && totalCarrito > 0 ? calcularCobroTarjeta(totalCarrito, datafonoActivo) : null;
  const aplicaRecargo = !!cobroTarjeta && formVenta.pagado && !formVenta.staff && configDatafono?.cobrarAlCliente !== false && cobroTarjeta.recargo > 0;
  // Consumo del staff: no se cobra; su costo queda como consumo
  const totalACobrar = formVenta.staff ? 0 : aplicaRecargo ? cobroTarjeta.cobrar : totalCarrito;

  // Registra todo el carrito en una sola operación atómica (writeBatch):
  // una venta por ítem + la actualización de lotes de cada producto.
  const handleRegistrarVenta = async () => {
    if (carrito.length === 0) return alert("El carrito está vacío.");
    if (!exigir('ventas', 'registrar ventas')) return;
    if (!formVenta.staff && formVenta.medioPago === 'Otro' && !formVenta.otroMedioPago.trim()) {
      return alert("Especifica el medio de pago.");
    }

    // Se vuelve a validar con el inventario actual por si otro socio vendió mientras tanto
    const { error, lotesPorProducto } = simularCarrito(carrito);
    if (error) return alert(`❌ ${error}`);
    // Fabricados: qué sale de lo listo y qué materiales se gastan
    const lineasFab = carrito.filter(i => i.fabricado);
    const planFab = planificarVenta(lineasFab, fabricadosPorId, materialesPorId);
    if (planFab.error) return alert(`❌ ${planFab.error}`);

    const nombreCliente = formVenta.cliente.trim();
    if (!formVenta.pagado && (!nombreCliente || normalizarNombre(nombreCliente) === normalizarNombre('Cliente General'))) {
      return alert("Para dejar una venta como Pendiente (fiado) escribe el nombre del cliente.");
    }

    const medioPagoFinal = formVenta.staff ? 'Staff'
      : formVenta.medioPago === 'Otro'
        ? formVenta.otroMedioPago.trim()
        : formVenta.medioPago;
    const fecha = fechaLocal();
    const creadoEn = Date.now();
    const pedidoId = doc(col('ventas')).id;

    setGuardandoVenta(true);
    try {
      const clientePrevio = formVenta.staff ? null : buscarClientePorNombre(nombreCliente);
      const nombreMostrado = clientePrevio?.nombre || nombreCliente || (formVenta.staff ? 'Staff' : 'Cliente General');
      const op = operacion(
        formVenta.staff ? 'Consumo del staff registrado' : formVenta.pagado ? 'Venta registrada' : 'Venta fiada registrada',
        `${nombreMostrado} — $${totalACobrar.toLocaleString()} (${carrito.map(i => `${i.nombre} x${i.cantidad}`).join(', ')}${aplicaRecargo ? ` + recargo tarjeta $${cobroTarjeta.recargo.toLocaleString()}` : ''})`
      );

      // Vincular la venta con el cliente registrado. Si es un fiado de un cliente
      // nuevo, se registra el cliente en la misma operación.
      let clienteRegistrado = clientePrevio;
      if (!clienteRegistrado && !formVenta.pagado) {
        const refCliente = op.crear(doc(col('clientes')), { nombre: nombreCliente, telefono: '', nota: '', creadoEn });
        clienteRegistrado = { id: refCliente.id, nombre: nombreCliente };
      }
      const cliente = clienteRegistrado?.nombre || nombreCliente || (formVenta.staff ? 'Staff' : 'Cliente General');
      const clienteId = clienteRegistrado?.id || null;

      carrito.forEach(item => {
        const plan = item.fabricado ? planFab.lineas[lineasFab.indexOf(item)] : null;
        const total = formVenta.staff ? 0 : totalItem(item);
        const costoTotal = plan ? plan.costoTotal : item.costo * item.cantidad;
        op.crear(doc(col('ventas')), {
          fecha,
          cliente,
          clienteId,
          producto: item.nombre,
          variante: item.fabricado ? item.variante : item.variante === 'TODAS' ? 'Auto (FEFO)' : item.variante,
          cantidad: item.cantidad,
          total,
          costoTotal,
          ganancia: total - costoTotal,
          pagado: formVenta.pagado,
          medioPago: medioPagoFinal,
          pedidoId,
          creadoEn,
          ...(plan && { fabricado: true, productoId: item.productoId, deListos: plan.deListos, consumo: plan.consumo }),
          ...(formVenta.staff && { staff: true, precioNormal: totalItem(item) })
        });
      });

      // Recargo por tarjeta: una línea más del pedido. No es ganancia ni costo de inventario:
      // es lo que se le traslada al cliente para cubrir la tarifa del datáfono.
      if (aplicaRecargo) {
        op.crear(doc(col('ventas')), {
          fecha,
          cliente,
          clienteId,
          producto: `Recargo tarjeta (${datafonoActivo.nombre})`,
          variante: '',
          cantidad: 1,
          total: cobroTarjeta.recargo,
          costoTotal: 0,
          ganancia: 0,
          pagado: true,
          medioPago: medioPagoFinal,
          pedidoId,
          creadoEn,
          esRecargo: true,
          tarifa: {
            datafono: datafonoActivo.nombre,
            comision: Number(datafonoActivo.comision),
            iva: Number(datafonoActivo.iva),
            retefuente: Number(datafonoActivo.retefuente),
            cobrado: cobroTarjeta.cobrar,
            descuentos: cobroTarjeta.total
          }
        });
      }

      const stockFinal = {};
      Object.entries(lotesPorProducto).forEach(([prodId, lotes]) => {
        const stock = lotes.reduce((acc, l) => acc + l.cantidad, 0);
        stockFinal[prodId] = stock;
        const antes = productos.find(p => p.id === prodId);
        op.actualizar(docN('productos', prodId), { lotes, stock }, antes && { lotes: antes.lotes, stock: antes.stock });
      });
      Object.entries(planFab.stock).forEach(([id, stock]) => {
        op.actualizar(docN('materiales', id), { stock }, { stock: materialesPorId[id]?.stock ?? 0 });
      });
      Object.entries(planFab.listos).forEach(([id, listos]) => {
        op.actualizar(docN('productos', id), { listos }, { listos: fabricadosPorId[id]?.listos || {} });
      });

      await op.guardar();

      // Alertas de reposición para los productos que quedaron con poco stock
      Object.entries(stockFinal).forEach(([prodId, stock]) => {
        if (stock > 3) return;
        const prod = productos.find(p => p.id === prodId);
        const estadoTexto = stock === 0 ? "❌ <b>TOTALMENTE AGOTADO</b>" : `⚠️ <b>QUEDAN SOLO ${stock} UNIDADES</b>`;
        avisarTelegram(
          `🚨 <b>ALERTA DE REPOSICIÓN DE INVENTARIO</b> 🚨\n\n` +
          `📦 Producto: <b>${prod?.nombre || prodId}</b>\n` +
          `📊 Estado: ${estadoTexto}\n` +
          `🔔 <i>Por favor coordinar compra con proveedores.</i>`
        );
      });

      // Materiales que quedaron bajo el mínimo o que hay que comprar para este pedido
      const bajos = Object.entries(planFab.stock)
        .map(([id, stock]) => ({ m: materialesPorId[id], stock }))
        .filter(({ m, stock }) => Number(m?.minimo) > 0 && stock <= Number(m.minimo) && (Number(m.stock) || 0) > Number(m.minimo));
      if (bajos.length || planFab.faltantes.length) {
        avisarTelegram(
          '🧰 <b>MATERIALES</b>\n' +
          bajos.map(({ m, stock }) => `⚠️ ${m.nombre}: quedan ${Math.round(stock * 100) / 100} ${m.unidad || ''}`).join('\n') +
          (bajos.length && planFab.faltantes.length ? '\n' : '') +
          planFab.faltantes.map(f => `🛒 Comprar para el pedido: ${f.material.nombre} × ${Math.round(f.cantidad * 100) / 100}`).join('\n')
        );
      }

      setCarrito([]);
      setPedidoAbierto(false);
      setFormVenta({ cliente: '', productoId: '', variante: 'TODAS', cantidad: 1, pagado: true, staff: false, medioPago: 'Efectivo', otroMedioPago: '' });
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
      variante: 'General',
      cantidad: '',
      vencimiento: '',
      codigo: codigosDe(prod)[0] || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelarEdicion = () => {
    setEditandoProductoId(null);
    setFormProducto(FORM_PRODUCTO_VACIO);
    setFormularioProductoAbierto(false);
  };

  const handleGuardarProducto = async (e) => {
    e.preventDefault();
    if (!exigir('inventario', 'modificar el inventario')) return;

    const codigoNuevo = limpiarCodigo(formProducto.codigo);
    if (codigoNuevo) {
      const duenio = buscarProductoPorCodigo(productos, codigoNuevo);
      const propio = editandoProductoId || formProducto.productoId;
      if (duenio && duenio.id !== propio) return alert(`El código ${codigoNuevo} ya pertenece a "${duenio.nombre}".`);
    }

    try {
      if (editandoProductoId) {
        const prodObj = productos.find(p => p.id === editandoProductoId);
        const otrosCodigos = codigosDe(prodObj).slice(1).filter(c => c !== codigoNuevo);
        const cambios = {
          nombre: formProducto.nombre.trim(),
          costo: Number(formProducto.costo),
          precio: Number(formProducto.precio),
          categoria: formProducto.categoria || 'Sin categoría',
          codigos: codigoNuevo ? [codigoNuevo, ...otrosCodigos] : otrosCodigos
        };
        let detalle = `${cambios.nombre}: costo $${cambios.costo}, precio $${cambios.precio}`;

        if (formProducto.cantidad && formProducto.vencimiento) {
          let nuevosLotes = JSON.parse(JSON.stringify(obtenerLotesNorm(prodObj || {})));
          const cant = Number(formProducto.cantidad);

          nuevosLotes.push({
            id: Date.now().toString(),
            variante: formProducto.variante || 'General',
            cantidad: cant,
            vencimiento: formProducto.vencimiento
          });

          cambios.lotes = nuevosLotes;
          cambios.stock = nuevosLotes.reduce((acc, l) => acc + l.cantidad, 0);
          detalle += ` + lote ${formProducto.variante} x${cant}`;
        }

        const op = operacion('Producto editado', detalle);
        op.actualizar(docN('productos', editandoProductoId), cambios, prodObj);
        await op.guardar();

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

          const op = operacion('Lote agregado', `${prodExistente.nombre} (${formProducto.variante}) x${cant}, vence ${formProducto.vencimiento}`);
          op.actualizar(docN('productos', prodExistente.id), { lotes: nuevosLotes, stock: nuevoStockTotal }, prodExistente);
          await op.guardar();
        } else {
          if (!formProducto.nombre || !formProducto.costo || !formProducto.precio) {
            return alert("Completa nombre, costo y precio para el nuevo producto.");
          }

          const op = operacion('Producto creado', `${formProducto.nombre.trim()} — costo $${formProducto.costo}, precio $${formProducto.precio}, ${cant} un.`);
          op.crear(doc(col('productos')), {
            nombre: formProducto.nombre.trim(),
            costo: Number(formProducto.costo),
            precio: Number(formProducto.precio),
            categoria: formProducto.categoria || 'Sin categoría',
            codigos: codigoNuevo ? [codigoNuevo] : [],
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
          await op.guardar();
        }
      }

      setFormProducto(FORM_PRODUCTO_VACIO);
    setFormularioProductoAbierto(false);
    } catch (error) {
      alert("Error al guardar producto/lote: " + error.message);
    }
  };

  const handleEditarLote = async (prodId, loteId) => {
    if (!exigir('inventario', 'modificar lotes')) return;
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
        const op = operacion('Lote editado', `${prod.nombre} (${lote.variante}): ${lote.cantidad} → ${nuevaCant} un., vence ${lote.vencimiento} → ${nuevaFecha}`);
        op.actualizar(docN('productos', prodId), {
          lotes: lotesModificados,
          stock: nuevoStockTotal,
          vencimiento: lotesModificados[0]?.vencimiento || 'N/A'
        }, prod);
        await op.guardar();
      } catch (error) {
        alert("Error al actualizar lote: " + error.message);
      }
    }
  };

  const handleEliminarLote = async (prodId, loteId) => {
    if (!exigir('inventario', 'eliminar lotes')) return;
    if (!confirm("¿Eliminar este lote específico del inventario?")) return;
    const prod = productos.find(p => p.id === prodId);
    if (!prod) return;

    const lotesActuales = obtenerLotesNorm(prod);
    const lote = lotesActuales.find(l => l.id === loteId);
    const lotesActualizados = lotesActuales.filter(l => l.id !== loteId);
    const nuevoStockTotal = lotesActualizados.reduce((acc, l) => acc + l.cantidad, 0);

    try {
      const op = operacion('Lote eliminado', `${prod.nombre} (${lote?.variante}) x${lote?.cantidad}, vence ${lote?.vencimiento}`);
      op.actualizar(docN('productos', prodId), { lotes: lotesActualizados, stock: nuevoStockTotal }, prod);
      await op.guardar();
    } catch (error) {
      alert("Error al eliminar lote: " + error.message);
    }
  };

  // Cargar datos de gasto en el formulario para editar
  const iniciarEdicionGasto = (g) => {
    setEditandoGastoId(g.id);
    setFormGasto({
      concepto: g.concepto || '',
      monto: g.monto || '',
      tipo: g.tipo || 'Proveedor',
      detalle: g.detalle === 'Sin observaciones adicionales' ? '' : (g.detalle || '')
    });
  };

  const cancelarEdicionGasto = () => {
    setEditandoGastoId(null);
    setFormGasto({ concepto: '', monto: '', tipo: 'Proveedor', detalle: '' });
  };

  const handleAgregarOEditarGasto = async (e) => {
    e.preventDefault();
    if (!exigir('finanzas', 'registrar gastos')) return;
    const monto = Number(formGasto.monto);
    if (!formGasto.concepto.trim() || isNaN(monto) || monto <= 0) {
      return alert("Por favor completa el concepto y un monto mayor a cero.");
    }

    try {
      const datos = {
        concepto: formGasto.concepto.trim(),
        monto,
        tipo: formGasto.tipo,
        detalle: formGasto.detalle.trim() || 'Sin observaciones adicionales'
      };
      if (editandoGastoId) {
        const anterior = gastos.find(g => g.id === editandoGastoId);
        const op = operacion('Gasto editado', `${datos.concepto}: $${(anterior?.monto || 0).toLocaleString()} → $${monto.toLocaleString()}`);
        op.actualizar(docN('gastos', editandoGastoId), datos, anterior);
        await op.guardar();
        setEditandoGastoId(null);
        alert("Gasto actualizado con éxito.");
      } else {
        const op = operacion('Gasto registrado', `${datos.concepto} (${datos.tipo}) — $${monto.toLocaleString()}`);
        op.crear(doc(col('gastos')), {
          ...datos,
          fecha: fechaLocal(),
          creadoEn: Date.now()
        });
        await op.guardar();
      }

      setFormGasto({ concepto: '', monto: '', tipo: 'Proveedor', detalle: '' });
    } catch (error) {
      alert("Error al guardar el gasto: " + error.message);
    }
  };

  const eliminarGasto = async (id) => {
    if (!exigir('finanzas', 'eliminar gastos')) return;
    if (!confirm("¿Eliminar este registro de gasto?")) return;
    const gasto = gastos.find(g => g.id === id);
    try {
      const op = operacion('Gasto eliminado', `${gasto?.concepto} — $${(gasto?.monto || 0).toLocaleString()}`);
      op.eliminar(docN('gastos', id), gasto);
      await op.guardar();
    } catch (error) {
      alert("Error al eliminar el gasto: " + error.message);
    }
  };

  // Cierre de caja: archiva las ventas pagadas del período (NO las borra).
  // Los indicadores de Ventas empiezan de cero, pero el efectivo en caja y el
  // punto cero siguen contando todas las ventas, así que el dinero no desaparece.
  const handleCerrarCaja = async () => {
    if (!exigir('ventas_editar', 'cerrar la caja')) return;
    const porCerrar = ventas.filter(v => v.pagado && !v.archivada);
    if (porCerrar.length === 0) return alert("No hay ventas pagadas pendientes de cierre.");

    const ingresos = porCerrar.filter(v => !v.esRecargo);
    const total = ingresos.reduce((acc, v) => acc + v.total, 0);
    const efectivo = ingresos.filter(v => v.medioPago === 'Efectivo').reduce((acc, v) => acc + v.total, 0);
    if (!confirm(
      `¿Cerrar la caja?\n\n` +
      `• ${porCerrar.length} venta(s) pagadas por ${dinero(total)} (en efectivo: ${dinero(efectivo)})\n` +
      `• Se enviará el informe de cierre a Telegram\n` +
      `• Los indicadores de Ventas vuelven a cero para el nuevo período\n\n` +
      `Las ventas NO se borran: quedan archivadas (filtro "Cerradas") y el efectivo en caja no cambia. Los fiados siguen pendientes.`
    )) return;

    try {
      await generarYEnviarReporteCierre(ventas);
      const fechaCierre = new Date().toISOString();
      const cierreId = `cierre_${Date.now()}`;
      const op = operacion('Cierre de caja', `${porCerrar.length} ventas por ${dinero(total)} (efectivo ${dinero(efectivo)})`);
      porCerrar.forEach(v => op.actualizar(docN('ventas', v.id), { archivada: true, cierreId, fechaCierre }, v));
      await op.guardar();
      alert("Caja cerrada. Las ventas quedaron archivadas y el efectivo en caja se mantiene.");
    } catch (error) {
      alert("Error al cerrar la caja: " + error.message);
    }
  };

  const handleAgregarCategoria = async (e) => {
    e.preventDefault();
    if (!nuevaCategoria.trim()) return;
    if (!exigir('inventario', 'crear categorías')) return;
    try {
      const op = operacion('Categoría creada', nuevaCategoria.trim());
      op.crear(doc(col('categorias')), { nombre: nuevaCategoria.trim() });
      await op.guardar();
      setNuevaCategoria('');
    } catch (error) {
      alert("Error al agregar categoría: " + error.message);
    }
  };

  const eliminarCategoria = async (id) => {
    if (!exigir('inventario', 'eliminar categorías')) return;
    if (!confirm("¿Eliminar esta categoría?")) return;
    const categoria = categorias.find(c => c.id === id);
    try {
      const op = operacion('Categoría eliminada', categoria?.nombre || '');
      op.eliminar(docN('categorias', id), categoria);
      await op.guardar();
    } catch (error) {
      alert("Error al eliminar la categoría: " + error.message);
    }
  };

  const eliminarProductoCompleto = async (id) => {
    if (!exigir('inventario', 'eliminar productos')) return;
    if (!confirm("¿Eliminar este producto completo con todos sus lotes?")) return;
    const prod = productos.find(p => p.id === id);
    try {
      const op = operacion('Producto eliminado', `${prod?.nombre} (${getStockTotalProducto(prod || {})} un.)`);
      op.eliminar(docN('productos', id), prod);
      await op.guardar();
    } catch (error) {
      alert("Error al eliminar el producto: " + error.message);
    }
  };

  const togglePago = async (id, estadoActual) => {
    if (!exigir('ventas_editar', 'cambiar el estado de pago de una venta')) return;
    const venta = ventas.find(v => v.id === id);
    try {
      const op = operacion(
        estadoActual ? 'Venta marcada como pendiente' : 'Venta marcada como pagada',
        `${venta?.cliente} — ${venta?.producto} $${(venta?.total || 0).toLocaleString()}`
      );
      op.actualizar(docN('ventas', id), { pagado: !estadoActual }, venta);
      await op.guardar();
    } catch (error) {
      alert("Error al cambiar el estado de pago: " + error.message);
    }
  };

  const eliminarVenta = async (id) => {
    if (!exigir('ventas_editar', 'eliminar ventas')) return;
    const venta = ventas.find(v => v.id === id);
    const aviso = venta?.pagado && venta?.medioPago === 'Efectivo'
      ? `\n\nOjo: es una venta pagada en efectivo. Al eliminarla, ${dinero(venta.total)} saldrán del efectivo en caja. Úsalo solo si la venta fue un error; para cerrar el día usa "Cerrar caja".`
      : '';
    if (!confirm("¿Eliminar esta venta?" + aviso)) return;
    try {
      const op = operacion('Venta eliminada', `${venta?.cliente} — ${venta?.producto} x${venta?.cantidad} $${(venta?.total || 0).toLocaleString()}`);
      op.eliminar(docN('ventas', id), venta);
      await op.guardar();
    } catch (error) {
      alert("Error al eliminar la venta: " + error.message);
    }
  };

  // Venta: el código leído agrega el producto al pedido
  const venderPorCodigo = (codigoLeido) => {
    const codigo = limpiarCodigo(codigoLeido);
    const prod = buscarProductoPorCodigo(productos, codigo);
    if (!prod) {
      if (!puede('inventario') || productos.length === 0) return mostrarToast(`El código ${codigo} no está registrado. Regístralo en Inventario.`, 'error');
      setEscaner(null);
      return setCodigoPorVincular({ codigo, origen: 'venta' });
    }
    if (agregarProducto(prod)) mostrarToast(`+1 ${prod.nombre}`);
  };

  // Guarda el código leído en un producto que ya estaba en el inventario
  const vincularCodigo = async (prod) => {
    if (!exigir('inventario', 'vincular códigos')) return;
    const { codigo, origen } = codigoPorVincular;
    const duenio = buscarProductoPorCodigo(productos, codigo);
    if (duenio) return alert(`El código ${codigo} ya pertenece a "${duenio.nombre}".`);
    try {
      const op = operacion('Código vinculado', `${prod.nombre}: ${codigo}`);
      op.actualizar(docN('productos', prod.id), { codigos: [...codigosDe(prod), codigo] }, { codigos: codigosDe(prod) });
      await op.guardar();
      setCodigoPorVincular(null);
      if (origen === 'venta') {
        if (agregarProducto(prod)) mostrarToast(`Código vinculado · +1 ${prod.nombre}`);
      } else {
        mostrarToast(`Código ${codigo} vinculado a ${prod.nombre}`);
      }
    } catch (error) {
      alert('Error al vincular el código: ' + error.message);
    }
  };

  // El código no era de ningún producto existente: se registra como producto nuevo
  const registrarCodigoComoNuevo = () => {
    const { codigo } = codigoPorVincular;
    setCodigoPorVincular(null);
    setPestana('inventario');
    registrarPorCodigo(codigo, true);
  };

  // Inventario: si el producto existe se agrega un lote; si no, se ofrece vincularlo o crearlo
  const registrarPorCodigo = async (codigoLeido, esNuevo = false) => {
    if (!exigir('inventario', 'registrar productos')) return;
    const codigo = limpiarCodigo(codigoLeido);
    if (!codigo) return;
    const prod = buscarProductoPorCodigo(productos, codigo);
    if (!prod && !esNuevo && productos.length > 0) {
      setEscaner(null);
      return setCodigoPorVincular({ codigo, origen: 'inventario' });
    }
    setEditandoProductoId(null);
    setFormularioProductoAbierto(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (prod) {
      const lotes = obtenerLotesNorm(prod);
      setFormProducto({
        ...FORM_PRODUCTO_VACIO,
        productoId: prod.id,
        nombre: prod.nombre,
        costo: prod.costo ?? '',
        precio: prod.precio ?? '',
        categoria: prod.categoria || '',
        variante: lotes[lotes.length - 1]?.variante || 'General',
        codigo
      });
      mostrarToast(`${prod.nombre}: escribe la cantidad y el vencimiento del lote nuevo`, 'info');
      return;
    }

    setFormProducto({ ...FORM_PRODUCTO_VACIO, codigo });
    setBuscandoNombre(true);
    const info = await consultarOpenFoodFacts(codigo);
    setBuscandoNombre(false);
    if (info) setFormProducto(actual => (actual.codigo === codigo && !actual.nombre ? { ...actual, nombre: info.nombre } : actual));
    mostrarToast(info ? `Producto nuevo: encontramos "${info.nombre}"` : 'Producto nuevo: completa el nombre y el precio', 'info');
  };

  // Etiquetas: asignar códigos internos a productos que no tienen
  const asignarCodigosInternos = async (ids) => {
    if (!exigir('inventario', 'asignar códigos')) return;
    const reservados = [];
    const op = operacion('Códigos internos asignados', `${ids.length} producto(s)`);
    ids.forEach(id => {
      const p = productos.find(x => x.id === id);
      if (!p) return;
      const codigo = generarCodigoInterno(productos, reservados);
      reservados.push(codigo);
      op.actualizar(docN('productos', id), { codigos: [codigo, ...codigosDe(p)] }, { codigos: codigosDe(p) });
    });
    try {
      await op.guardar();
      mostrarToast(`Se asignaron ${reservados.length} código(s) internos`);
    } catch (error) {
      alert('Error al asignar los códigos: ' + error.message);
    }
  };

  // Lo que se lee con la cámara o el lector va a la pantalla correspondiente
  const alLeerCodigo = (codigo) => {
    if (escaner === 'venta' || (!escaner && pestana === 'ventas')) return venderPorCodigo(codigo);
    if (escaner === 'formulario' && editandoProductoId) return setFormProducto(f => ({ ...f, codigo: limpiarCodigo(codigo) }));
    return registrarPorCodigo(codigo);
  };
  useLectorCodigos(alLeerCodigo, !escaner && !codigoPorVincular && (pestana === 'ventas' || pestana === 'inventario'));

  // Registros guardados con la fecha UTC (corrida un día después de las 7 p. m.).
  // La fecha correcta se obtiene del momento exacto en que se crearon (creadoEn).
  const fechaCorrecta = (r) => (r.creadoEn ? fechaLocal(new Date(r.creadoEn)) : r.fecha);
  const ventasConFechaCorrida = ventas.filter(v => v.creadoEn && v.fecha !== fechaCorrecta(v));
  const gastosConFechaCorrida = gastos.filter(g => g.creadoEn && g.fecha !== fechaCorrecta(g));
  const totalFechasCorridas = ventasConFechaCorrida.length + gastosConFechaCorrida.length;
  const [corrigiendoFechas, setCorrigiendoFechas] = useState(false);

  const handleCorregirFechas = async () => {
    if (!exigir('ventas_editar', 'corregir fechas de ventas') || !exigir('finanzas', 'corregir fechas de gastos')) return;
    if (!confirm(
      `¿Corregir la fecha de ${totalFechasCorridas} registro(s)?\n\n` +
      `• ${ventasConFechaCorrida.length} venta(s) y ${gastosConFechaCorrida.length} gasto(s) hechos entre las 7 p. m. y la medianoche quedaron con la fecha del día siguiente.\n` +
      `• Se les pondrá el día correcto según la hora exacta en que se registraron. Montos y caja no cambian.`
    )) return;
    setCorrigiendoFechas(true);
    try {
      const op = operacion('Fechas corregidas (zona horaria)', `${ventasConFechaCorrida.length} ventas y ${gastosConFechaCorrida.length} gastos`);
      ventasConFechaCorrida.forEach(v => op.actualizar(docN('ventas', v.id), { fecha: fechaCorrecta(v) }, { fecha: v.fecha }));
      gastosConFechaCorrida.forEach(g => op.actualizar(docN('gastos', g.id), { fecha: fechaCorrecta(g) }, { fecha: g.fecha }));
      await op.guardar();
      alert('Listo: las fechas quedaron con el día correcto.');
    } catch (error) {
      alert('Error al corregir las fechas: ' + error.message);
    } finally {
      setCorrigiendoFechas(false);
    }
  };

  // Cuentas financieras dinámicas
  // - Período abierto (desde el último cierre de caja): indicadores de Ventas
  // - Todo el histórico (incluye ventas archivadas): efectivo en caja y punto cero
  // El recargo por tarjeta se excluye: lo cobra el cliente pero lo recibe el datáfono, no el negocio
  const ventasPagadasHistorico = ventas.filter(v => v.pagado && !v.esRecargo);
  const ventasPagadas = ventasPagadasHistorico.filter(v => !v.archivada);
  const totalVentasEfectivoCobrado = ventasPagadasHistorico
    .filter(v => v.medioPago === 'Efectivo')
    .reduce((acc, v) => acc + v.total, 0);
  const totalReposicionHistorica = ventasPagadasHistorico.reduce((acc, v) => acc + v.costoTotal, 0);

  const totalIngresosDia = ventasPagadas.reduce((acc, v) => acc + v.total, 0);
  const totalReposicionDia = ventasPagadas.reduce((acc, v) => acc + v.costoTotal, 0);
  const gananciaBrutaDia = ventasPagadas.reduce((acc, v) => acc + v.ganancia, 0);

  const fondoAhorro = gananciaBrutaDia * porcentajeAhorro / 100;
  const gananciaRepartible = gananciaBrutaDia - fondoAhorro;
  const salarioPorSocio = gananciaRepartible / numeroSocios;

  const totalGastosRegistrados = gastos.reduce((acc, g) => acc + g.monto, 0);
  const gastosEnReposiciones = gastos
    .filter(g => g.tipo === 'Proveedor' || g.tipo === 'Compra Productos')
    .reduce((acc, g) => acc + g.monto, 0);

  // CORRECCIÓN SOLICITADA EN ESTADO DE CUENTA: Efectivo total limpio sin restar gastos totales
  const efectivoTotalEnCaja = cajaInicial + totalVentasEfectivoCobrado;
  const estadoPuntoCeroReposicion = totalReposicionHistorica - gastosEnReposiciones;

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

  const handleCerrarSesion = cerrarSesion;

  // La primera vez que la persona entra (en este dispositivo) se abre el tutorial
  useEffect(() => {
    if (cargando || errorAcceso) return;
    try { if (!localStorage.getItem(claveRecorrido)) setRecorridoAbierto(true); } catch { /* sin almacenamiento: no se muestra solo */ }
  }, [cargando]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirTutorial = () => { setPestana('ventas'); setPedidoAbierto(false); setRecorridoAbierto(true); };
  const terminarTutorial = () => {
    try { localStorage.setItem(claveRecorrido, new Date().toISOString()); } catch { /* sin almacenamiento */ }
    setRecorridoAbierto(false);
    setPestana('ventas');
  };
  const nombrePersona = perfil?.nombre?.split(' ')[0] || usuario?.displayName?.split(' ')[0] || '';
  const pasosTutorial = [
    { titulo: `¡Hola${nombrePersona ? ', ' + nombrePersona : ''}! 👋`, texto: `Te muestro en un minuto cómo funciona la app de ${negocio?.nombre || 'tu negocio'}. Puedes saltarlo y verlo cuando quieras desde tu menú → Tutorial.`, antes: () => { setPestana('ventas'); setPedidoAbierto(false); } },
    { objetivo: 'negocio', titulo: 'Tus negocios', texto: 'Toca el nombre para cambiar de negocio. Cada uno lleva sus ventas, inventario, socios y finanzas por separado.' },
    { objetivo: 'pestanas', titulo: 'El menú principal', texto: 'Desde aquí vas a Ventas, Clientes, Inventario, Finanzas y Equipo.' },
    { objetivo: 'indicadores', titulo: 'Cómo va el día', texto: 'Ventas pagadas, lo que hay que reponer, el ahorro y el pago por socio. Se actualizan con cada venta.' },
    { objetivo: 'productos', titulo: 'Vender', texto: `Toca un producto para agregarlo al pedido.${negocio?.fabricacion ? ' Los que dicen “Se arma” se hacen al vender: eliges talla u opciones y se descuentan los materiales.' : ''} Puedes buscar por nombre o filtrar por categoría.` },
    { objetivo: 'escanear', titulo: 'Escanear códigos', texto: 'Con la cámara del celular o un lector de códigos de barras agregas productos al pedido al instante.' },
    { objetivo: 'pedido', titulo: 'El pedido', texto: 'Aquí ves lo que lleva el cliente. Elige si paga o queda fiado, el medio de pago y pulsa Cobrar.' },
    { objetivo: 'historial', titulo: 'Historial de ventas', texto: 'Las ventas del día. Puedes buscarlas, marcar un fiado como pagado o corregir un error.' },
    { objetivo: 'tab-clientes', titulo: 'Clientes y fiados', texto: 'Quién debe y cuánto. Desde aquí cobras los fiados y registras a tus clientes.' },
    { objetivo: 'tab-inventario', titulo: 'Inventario', texto: negocio?.fabricacion
      ? 'Productos, categorías y etiquetas. En Fabricación están los materiales, las recetas con su costo y ganancia, las compras y los daños.'
      : 'Productos con sus lotes y vencimientos, categorías y etiquetas con código de barras.' },
    { objetivo: 'tab-finanzas', titulo: 'Finanzas', texto: 'Efectivo en caja, gastos, ganancia por producto y pérdidas. Todo lo de la plata está aquí.' },
    { objetivo: 'tab-equipo', titulo: 'Equipo', texto: 'Agrega socios con su rango, revisa el historial de cambios y configura el negocio y su marca.' },
    { objetivo: 'telegram', titulo: 'Avisos por Telegram', texto: 'Envía a los socios alertas de stock e informes de cierre.' },
    { objetivo: 'usuario', titulo: 'Tu cuenta', texto: 'Tu perfil, tus negocios y cerrar sesión. Aquí está el Tutorial para repetir esta guía.' },
    { titulo: '¡Listo para empezar! 🎉', texto: 'Si tienes dudas, abre el Tutorial desde tu menú o desde Mi perfil cuando quieras.' }
  ];

  if (cargando) {
    return (
      <div className="flex flex-col justify-center items-center gap-4 min-h-screen marca-cabecera border-0 shadow-none text-tinta font-sans">
        <img src="/marca/sello.svg" alt="Tazón para Dos" className="h-20 w-20 animate-bounce" />
        <p className="marca-eyebrow text-tinta">Cargando datos de la mesa...</p>
      </div>
    );
  }

  if (errorAcceso) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-50 text-slate-800 font-sans p-4">
        <div className="panel w-full max-w-sm p-6 text-center">
          <AlertTriangle size={32} className="mx-auto text-amber-500 mb-3" />
          <p className="text-sm font-semibold mb-1">{errorAcceso}</p>
          <p className="text-xs text-slate-500 mb-4">Sesión: {usuario?.email}</p>
          <button
            onClick={handleCerrarSesion}
            className="btn btn-oscuro"
          >
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 pt-3 pb-24 sm:px-4 sm:pt-4 md:px-6 md:pt-6 2xl:pb-6 bg-papel min-h-screen text-tinta font-sans print:p-0 print:bg-white">
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
      <header className="marca-cabecera mb-6 rounded-2xl print-card print:mb-4" style={marcaActiva ? undefined : { backgroundColor: colorNegocio(negocio?.color) }}>
        <div className="flex items-center justify-between gap-2 sm:gap-3 p-3 sm:p-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <img src={marcaActiva?.logo || '/marca/sello.svg'} alt={negocio?.nombre || 'Tazón para Dos'} className="h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 shrink-0 rounded-full object-contain" />
            <div className="min-w-0">
              <p className="marca-eyebrow text-tinta/80 hidden sm:block">Ventas y finanzas</p>
              <h1 className="sr-only">{negocio?.nombre}</h1>
              <MenuDesplegable
                etiqueta={<span className="truncate">{negocio?.nombre}</span>}
                claseBoton="flex items-center gap-1.5 max-w-full marca-titular text-base sm:text-xl md:text-2xl text-tinta leading-tight hover:opacity-80 no-print"
                recorrido="negocio"
              >
                <MenuTitulo>Tus negocios</MenuTitulo>
                {negocios.map(n => (
                  <MenuItem
                    key={n.id}
                    icono={<span className="h-3.5 w-3.5 rounded-full border-2 border-tinta shrink-0" style={{ background: colorNegocio(n.color) }} />}
                    onClick={() => cambiarNegocio(n.id)}
                    activo={n.id === negocioId}
                    detalle={n.rolPropio === 'titular' ? 'Titular' : 'Socio'}
                  >
                    {n.nombre}
                  </MenuItem>
                ))}
                <MenuSeparador />
                <MenuItem icono={<PlusCircle size={16} />} onClick={() => setVentanaNegocio(true)} detalle="Con sus propias ventas, socios y finanzas">
                  Registrar nuevo negocio
                </MenuItem>
              </MenuDesplegable>
              <p className="text-[11px] sm:text-xs md:text-sm text-tinta/80 font-medium first-letter:uppercase truncate">
                {new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 no-print shrink-0">
            <MenuDesplegable
              etiqueta={<span className="hidden sm:inline">Telegram</span>}
              icono={<Send size={16} />}
              alinear="derecha"
              claseBoton="btn btn-claro btn-sm"
              recorrido="telegram"
            >
              <MenuTitulo>Enviar a los socios</MenuTitulo>
              <MenuItem icono={<BellRing size={16} />} onClick={handleEnviarAlertaStockTelegram} detalle="Productos agotados o por agotarse">
                Alerta de stock
              </MenuItem>
              <MenuItem icono={<Send size={16} />} onClick={handleEnviarReporteTelegram} detalle="Ventas, ahorro y pago por socio">
                Informe de cierre
              </MenuItem>
            </MenuDesplegable>

            <MenuDesplegable
              etiqueta={<span className="hidden sm:inline max-w-[9rem] truncate">{perfil?.nombre?.split(' ')[0] || usuario?.displayName?.split(' ')[0] || 'Mi cuenta'}</span>}
              icono={<UserCircle size={16} />}
              alinear="derecha"
              claseBoton="btn btn-oscuro btn-sm"
              recorrido="usuario"
            >
              <MenuTitulo>{usuario?.email}</MenuTitulo>
              <MenuItem icono={<UserCircle size={16} />} onClick={() => setPestana('perfil')} activo={pestana === 'perfil'} detalle="Nombre, correo, contraseña y dispositivos">
                Mi perfil
              </MenuItem>
              <MenuItem icono={<Compass size={16} />} onClick={abrirTutorial} detalle="Guía de uso paso a paso">
                Tutorial
              </MenuItem>
              <MenuSeparador />
              <MenuTitulo>Mis negocios</MenuTitulo>
              {negocios.map(n => (
                <MenuItem
                  key={n.id}
                  icono={<span className="h-3.5 w-3.5 rounded-full border-2 border-current shrink-0" style={{ background: colorNegocio(n.color) }} />}
                  onClick={() => n.id !== negocioId && cambiarNegocio(n.id)}
                  activo={n.id === negocioId}
                  detalle={`${n.rolPropio === 'titular' ? 'Titular' : 'Socio'}${n.id === negocioId ? ' · abierto ahora' : ''}`}
                >
                  {n.nombre}
                </MenuItem>
              ))}
              <MenuItem icono={<PlusCircle size={16} />} onClick={() => setVentanaNegocio(true)} detalle="Con sus propias ventas, socios y finanzas">
                Registrar nuevo negocio
              </MenuItem>
              <MenuSeparador />
              <MenuItem icono={<LogOut size={16} />} onClick={handleCerrarSesion} peligro>
                Cerrar sesión
              </MenuItem>
            </MenuDesplegable>
          </div>
        </div>

        {/* Navegación principal */}
        <nav className="no-print mx-2 sm:mx-3 mb-2 sm:mb-3 flex flex-nowrap items-center justify-start md:justify-center gap-1 overflow-x-auto sin-scrollbar bg-papel p-1.5 rounded-2xl border-2 border-tinta barra-pestanas" data-recorrido="pestanas">
          <button onClick={() => setPestana('ventas')} className={`pestana ${pestana === 'ventas' ? 'pestana-activa' : ''}`}>
            <ShoppingCart size={16} /> Ventas
          </button>
          <button onClick={() => setPestana('clientes')} className={`pestana ${pestana === 'clientes' ? 'pestana-activa' : ''}`} data-recorrido="tab-clientes">
            <Users size={16} /> Clientes
            {clientesConDeuda > 0 && (
              <span className="pastilla pastilla-peligro !px-1.5 !py-0 !text-[10px]" title="Clientes con deuda">{clientesConDeuda}</span>
            )}
          </button>
          <MenuDesplegable
            etiqueta="Inventario"
            icono={<Package size={16} />}
            recorrido="tab-inventario"
            activo={['inventario', 'categorias', 'catalogo', 'etiquetas', 'materiales', 'fabricados'].includes(pestana)}
          >
            <MenuItem icono={<Boxes size={16} />} onClick={() => setPestana('inventario')} activo={pestana === 'inventario'} detalle="Stock por lotes y vencimientos">
              Productos y lotes
            </MenuItem>
            <MenuItem icono={<Tag size={16} />} onClick={() => setPestana('categorias')} activo={pestana === 'categorias'}>
              Categorías
            </MenuItem>
            <MenuItem icono={<Tags size={16} />} onClick={() => setPestana('etiquetas')} activo={pestana === 'etiquetas'} detalle="Imprimir códigos de barras">
              Etiquetas
            </MenuItem>
            {negocio?.fabricacion && (
              <>
                <MenuSeparador />
                <MenuTitulo>Fabricación</MenuTitulo>
                <MenuItem icono={<Layers size={16} />} onClick={() => setPestana('materiales')} activo={pestana === 'materiales'} detalle="Piezas e insumos con su costo">
                  Materiales
                </MenuItem>
                <MenuItem icono={<Hammer size={16} />} onClick={() => setPestana('fabricados')} activo={pestana === 'fabricados'} detalle="Recetas, costos y precios">
                  Productos fabricados
                </MenuItem>
              </>
            )}
            <MenuSeparador />
            <MenuItem icono={<UtensilsCrossed size={16} />} onClick={() => setPestana('catalogo')} activo={pestana === 'catalogo'} detalle="Lo disponible para ofrecer">
              Carta
            </MenuItem>
          </MenuDesplegable>
          <button onClick={() => setPestana('estado_cuenta')} className={`pestana ${pestana === 'estado_cuenta' ? 'pestana-activa' : ''}`} data-recorrido="tab-finanzas">
            <Wallet size={16} /> Finanzas
          </button>
          <MenuDesplegable
            etiqueta="Equipo"
            icono={<Handshake size={16} />}
            recorrido="tab-equipo"
            activo={['socios', 'historial', 'configuracion'].includes(pestana)}
            alinear="derecha"
          >
            <MenuItem icono={<Handshake size={16} />} onClick={() => setPestana('socios')} activo={pestana === 'socios'} detalle="Cuentas y rangos de edición">
              Socios
            </MenuItem>
            <MenuItem icono={<History size={16} />} onClick={() => setPestana('historial')} activo={pestana === 'historial'} detalle="Quién cambió qué y cuándo">
              Historial de cambios
            </MenuItem>
            <MenuSeparador />
            <MenuItem icono={<Settings size={16} />} onClick={() => setPestana('configuracion')} activo={pestana === 'configuracion'} detalle="Nombre, reparto, Telegram y marca">
              Configuración del negocio
            </MenuItem>
          </MenuDesplegable>
        </nav>
      </header>

      {pestana === 'perfil' && (
        <Perfil
          usuario={usuario}
          onReverificar={onSesionVencida}
          negocios={negocios}
          negocioId={negocioId}
          negocio={negocio}
          cambiarNegocio={cambiarNegocio}
          esTitularNegocio={miembro?.rol === 'titular'}
          operacion={operacion}
          onTutorial={abrirTutorial}
        />
      )}
      {pestana === 'socios' && <Socios usuario={usuario} negocioId={negocioId} negocio={negocio} />}
      {pestana === 'historial' && <Historial negocioId={negocioId} incluirAntiguo={negocioId === ID_TAZON} />}
      {pestana === 'configuracion' && (
        <div className="space-y-6">
          <ConfigNegocio negocioId={negocioId} negocio={negocio} esTitular={puede('socios') && miembro?.rol === 'titular'} operacion={operacion} />
          <ConfigMarca negocioId={negocioId} negocio={negocio} marca={marca} esTitular={miembro?.rol === 'titular'} operacion={operacion} />
        </div>
      )}
      {recorridoAbierto && <Recorrido pasos={pasosTutorial} onTerminar={terminarTutorial} />}
      {eligiendoFabricado && (
        <SelectorFabricado
          producto={eligiendoFabricado}
          materialesPorId={materialesPorId}
          onCerrar={() => setEligiendoFabricado(null)}
          onAgregar={(linea) => { if (agregarFabricado(eligiendoFabricado, linea)) setEligiendoFabricado(null); }}
        />
      )}
      {pestana === 'materiales' && (
        <Materiales materiales={materiales} productos={fabricados} puedeEditar={puede('inventario')} operacion={operacion} col={col} docN={docN}>
          <CompraMateriales materiales={materiales} puedeEditar={puede('inventario') && puede('finanzas')} operacion={operacion} col={col} docN={docN} />
          <RegistrarDano materiales={materiales} fabricados={fabricados} puedeRegistrar={puede('inventario') || puede('ventas')} operacion={operacion} col={col} docN={docN} />
        </Materiales>
      )}
      {pestana === 'fabricados' && (
        <ProductosFabricados
          productos={[...productos, ...fabricados]}
          materiales={materiales}
          categorias={categorias}
          puedeEditar={puede('inventario')}
          operacion={operacion}
          col={col}
          docN={docN}
          negocio={negocio}
        />
      )}
      {pestana === 'etiquetas' && (
        <Suspense fallback={<p className="text-center text-gris-calido py-10">Cargando etiquetas...</p>}>
          <Etiquetas productos={productos} puedeEditar={puede('inventario')} onAsignarCodigos={asignarCodigosInternos} />
        </Suspense>
      )}

      {/* ==================== PESTAÑA VENTAS (punto de venta) ==================== */}
      {pestana === 'ventas' && (() => {
        // Catálogo filtrado por búsqueda y categoría
        const categoriasVenta = [...new Set([...productos, ...fabricados].map(p => p.categoria || 'Sin categoría'))].sort((a, b) => a.localeCompare(b, 'es'));
        const textoBusqueda = normalizarNombre(busquedaProducto);
        const catalogo = productos
          .filter(p => !categoriaVenta || (p.categoria || 'Sin categoría') === categoriaVenta)
          .filter(p => !textoBusqueda || normalizarNombre(p.nombre).includes(textoBusqueda))
          .map(p => {
            const enCarrito = carrito.filter(i => i.productoId === p.id).reduce((acc, i) => acc + i.cantidad, 0);
            return { ...p, enCarrito, disponible: getStockTotalProducto(p) - enCarrito };
          })
          .sort((a, b) => (b.disponible > 0) - (a.disponible > 0) || a.nombre.localeCompare(b.nombre, 'es'));
        const catalogoFab = fabricados
          .filter(p => !categoriaVenta || (p.categoria || 'Sin categoría') === categoriaVenta)
          .filter(p => !textoBusqueda || normalizarNombre(p.nombre).includes(textoBusqueda))
          .sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '', 'es') || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));

        // Historial filtrado
        const textoVentas = normalizarNombre(busquedaVentas);
        const ventasFiltradas = ventas
          .filter(v => filtroVentas === 'cerradas' ? v.archivada
            : !v.archivada && (filtroVentas === 'todas' || (filtroVentas === 'pagadas' ? v.pagado : !v.pagado)))
          .filter(v => !textoVentas || normalizarNombre(`${v.cliente} ${v.producto}`).includes(textoVentas));

        const clienteSeleccionado = buscarClientePorNombre(formVenta.cliente);
        const deudaCliente = clienteSeleccionado ? (cuentasClientes.find(cc => cc.cliente.id === clienteSeleccionado.id)?.deuda || 0) : 0;
        const puedeVender = puede('ventas');
        // Materiales que no alcanzan para lo que hay en el pedido (se compran por pedido)
        const planPedido = planificarVenta(carrito.filter(i => i.fabricado), fabricadosPorId, materialesPorId);
        const costoPedido = carrito.filter(i => !i.fabricado).reduce((s, i) => s + i.costo * i.cantidad, 0)
          + planPedido.lineas.reduce((s, l) => s + (l.costoTotal || 0), 0);

        // Contenido del pedido (columna en PC, ventana flotante en las demás pantallas)
        const contenidoPedido = (
          <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-tinta flex items-center gap-2.5">
                  <ShoppingCart size={18} /> Pedido
                  {unidadesCarrito > 0 && <span className="pastilla pastilla-pendiente">{unidadesCarrito} un.</span>}
                </h2>
                {carrito.length > 0 && <button onClick={handleVaciarCarrito} className="enlace enlace-peligro text-xs">Vaciar</button>}
              </div>

              {carrito.length === 0 ? (
                <div className="text-center py-8 px-4 rounded-xl bg-crema/60 border-[1.5px] border-dashed border-linea">
                  <img src={marcaActiva?.logo || '/marca/mascota.svg'} alt="" className="h-12 mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-gris-calido">Toca un producto para agregarlo al pedido.</p>
                </div>
              ) : (
                <ul className="divide-y divide-linea-suave -mx-1">
                  {carrito.map(item => {
                    const prod = productos.find(p => p.id === item.productoId);
                    const variantes = prod ? [...new Set(obtenerLotesNorm(prod).map(l => l.variante))] : [];
                    return (
                      <li key={item.key} className="flex items-start gap-3 px-1 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{item.nombre}</p>
                          {item.fabricado ? (
                            <p className="text-[11px] text-gris-calido">{item.variante ? `${item.variante} · ` : ''}{dinero(item.precio)} c/u</p>
                          ) : variantes.length > 1 ? (
                            <select
                              value={item.variante}
                              onChange={(e) => handleCambiarVarianteItem(item.key, e.target.value)}
                              className="mt-0.5 text-[11px] text-gris-calido bg-transparent border-0 p-0 pr-4 focus:outline-none cursor-pointer"
                              title="Variante o lote"
                            >
                              <option value="TODAS">Automático (FEFO)</option>
                              {variantes.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          ) : (
                            <p className="text-[11px] text-gris-calido">{dinero(item.precio)} c/u</p>
                          )}
                        </div>
                        <div className="stepper shrink-0">
                          <button onClick={() => handleCambiarCantidadItem(item.key, item.cantidad - 1)} aria-label="Quitar uno"><Minus size={14} /></button>
                          <span>{item.cantidad}</span>
                          <button onClick={() => handleCambiarCantidadItem(item.key, item.cantidad + 1)} aria-label="Agregar uno"><Plus size={14} /></button>
                        </div>
                        <p className="w-20 text-right text-sm font-bold shrink-0 pt-1">{dinero(totalItem(item))}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
              {planPedido.faltantes.length > 0 && (
                <p className="aviso aviso-atencion mt-2 !text-xs">
                  <span>🛒 No hay en stock: {planPedido.faltantes.map(f => `${f.material.nombre} × ${Math.round(f.cantidad * 100) / 100}`).join(', ')}. Se toma como comprado por pedido.</span>
                </p>
              )}

              <hr className="separador" />

              <div className="space-y-4">
                <div>
                  <label className="etiqueta">{formVenta.staff ? '¿Quién del staff?' : 'Cliente'} {formVenta.pagado && <span className="font-normal text-gris-calido">(opcional)</span>}</label>
                  <input
                    type="text"
                    list="lista-clientes"
                    placeholder={formVenta.staff ? 'Staff' : formVenta.pagado ? 'Cliente General' : 'Nombre de quien queda debiendo'}
                    value={formVenta.cliente}
                    onChange={(e) => setFormVenta({ ...formVenta, cliente: e.target.value })}
                    className={`campo ${!formVenta.pagado && !formVenta.cliente.trim() ? '!border-sol !bg-amber-50' : ''}`}
                  />
                  <datalist id="lista-clientes">
                    {clientes.map(c => <option key={c.id} value={c.nombre} />)}
                  </datalist>
                  {clienteSeleccionado && deudaCliente > 0 && <p className="text-[11px] text-amber-700 mt-1 font-semibold">Debe actualmente {dinero(deudaCliente)}</p>}
                  {!clienteSeleccionado && !formVenta.pagado && formVenta.cliente.trim() && <p className="text-[11px] text-gris-calido mt-1">Cliente nuevo: se registrará al guardar.</p>}
                </div>

                <div>
                  <p className="etiqueta">Estado</p>
                  <div className="segmentado">
                    <button onClick={() => setFormVenta({ ...formVenta, pagado: true, staff: false })} className={`segmento ${formVenta.pagado && !formVenta.staff ? 'segmento-activo' : ''}`}>
                      <CheckCircle size={14} /> Pagado
                    </button>
                    <button onClick={() => setFormVenta({ ...formVenta, pagado: false, staff: false })} className={`segmento ${!formVenta.pagado ? 'segmento-activo-fiado' : ''}`}>
                      <HandCoins size={14} /> Fiado
                    </button>
                    <button onClick={() => setFormVenta({ ...formVenta, pagado: true, staff: true })} className={`segmento ${formVenta.staff ? 'segmento-activo' : ''}`} title="Lo toma el equipo: no se cobra">
                      <Users size={14} /> Staff
                    </button>
                  </div>
                  {formVenta.staff && (
                    <p className="text-[11px] text-gris-calido mt-1.5">
                      No se cobra. Se descuenta del inventario y su costo ({dinero(costoPedido)}) queda como consumo del staff.
                    </p>
                  )}
                </div>

                <div className={formVenta.staff ? 'hidden' : ''}>
                  <p className="etiqueta">Medio de pago</p>
                  <div className="segmentado">
                    {['Efectivo', 'Transferencia', 'Tarjeta', 'Otro'].map(m => (
                      <button key={m} onClick={() => setFormVenta({ ...formVenta, medioPago: m })} className={`segmento ${formVenta.medioPago === m ? 'segmento-activo' : ''}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                  {formVenta.medioPago === 'Tarjeta' && cobroTarjeta && (
                    <div className="mt-2 rounded-xl border-[1.5px] border-linea bg-crema/50 p-3 text-xs space-y-1">
                      {datafonos.length > 1 && (
                        <select value={datafonoActivo.id} onChange={(e) => setDatafonoId(e.target.value)} className="campo !py-1.5 !text-xs mb-2" title="Datáfono">
                          {datafonos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                        </select>
                      )}
                      <p className="font-bold">
                        {datafonoActivo.nombre}: {datafonoActivo.comision} % + IVA {datafonoActivo.iva} % + retefuente {datafonoActivo.retefuente} %
                      </p>
                      {aplicaRecargo ? (
                        <p className="text-gris-calido">
                          Se suman <b className="text-tinta">{dinero(cobroTarjeta.recargo)}</b> para que te lleguen completos los {dinero(totalCarrito)}
                          {' '}(comisión {dinero(cobroTarjeta.comision)} · IVA {dinero(cobroTarjeta.iva)} · retefuente {dinero(cobroTarjeta.retefuente)}).
                        </p>
                      ) : (
                        <p className="text-gris-calido">
                          {formVenta.pagado
                            ? <>El negocio asume la tarifa: te llegan <b className="text-tinta">{dinero(desglose(totalCarrito, datafonoActivo).llega)}</b>.</>
                            : 'Al ser fiado, el recargo no se aplica ahora.'}
                        </p>
                      )}
                    </div>
                  )}
                  {formVenta.medioPago === 'Otro' && (
                    <input
                      type="text"
                      placeholder="¿Cuál? Ej. Nequi, Daviplata"
                      value={formVenta.otroMedioPago}
                      onChange={(e) => setFormVenta({ ...formVenta, otroMedioPago: e.target.value })}
                      className="campo mt-2"
                    />
                  )}
                </div>
              </div>

              <hr className="separador" />

              {aplicaRecargo && (
                <div className="text-sm space-y-0.5 mb-2">
                  <div className="flex justify-between text-gris-calido"><span>Productos</span><span>{dinero(totalCarrito)}</span></div>
                  <div className="flex justify-between text-gris-calido"><span>Recargo tarjeta ({datafonoActivo.nombre})</span><span>+{dinero(cobroTarjeta.recargo)}</span></div>
                </div>
              )}
              <div className="flex items-baseline justify-between mb-3">
                <span className="kpi-etiqueta text-gris-calido">{aplicaRecargo ? 'Total a cobrar' : 'Total'}</span>
                <span className="kpi-valor text-3xl">{dinero(totalACobrar)}</span>
              </div>
              {aplicaRecargo && (
                <div className="flex items-center justify-between text-xs mb-3 -mt-1 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                  <span className="text-gris-calido">{datafonoActivo.nombre} descuenta {dinero(cobroTarjeta.total)} · <b className="text-tinta">te llega</b></span>
                  <b className="text-emerald-700 text-sm">{dinero(cobroTarjeta.llega)}</b>
                </div>
              )}
              <button
                type="button"
                onClick={handleRegistrarVenta}
                disabled={!puedeVender || carrito.length === 0 || guardandoVenta}
                className={`btn w-full !py-3 !text-base ${formVenta.pagado && !formVenta.staff ? 'btn-primario' : 'btn-oscuro'}`}
              >
                {guardandoVenta
                  ? 'Registrando...'
                  : formVenta.staff ? <><Users size={18} /> Registrar consumo del staff</>
                  : formVenta.pagado ? <><CheckCircle size={18} /> Cobrar {dinero(totalACobrar)}</> : <><HandCoins size={18} /> Registrar fiado</>}
              </button>
          </>
        );

        return (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 print:gap-2 print:mb-4" data-recorrido="indicadores">
            <Kpi color="sol" icono={<Banknote size={18} />} etiqueta="Ventas pagadas" valor={dinero(totalIngresosDia)} detalle={`${ventasPagadas.filter(v => !v.staff).length} venta(s)`} />
            <Kpi color="turquesa" icono={<RefreshCw size={18} />} etiqueta="Fondo reposición" valor={dinero(totalReposicionDia)} detalle="Costo de lo vendido" />
            <Kpi color="verde" icono={<PiggyBank size={18} />} etiqueta="Ahorro mejoras" valor={dinero(fondoAhorro)} detalle={`${porcentajeAhorro} % de la ganancia`} />
            <Kpi color="coral" icono={<Handshake size={18} />} etiqueta="Pago por socio" valor={dinero(salarioPorSocio)} detalle={`Ganancia neta ÷ ${numeroSocios}`} />
          </div>

          {!puedeVender && <AvisoSinPermiso accion="registrar ventas" />}

          {totalFechasCorridas > 0 && puede('ventas_editar') && puede('finanzas') && (
            <div className="aviso aviso-info mb-6 flex-wrap items-center justify-between no-print">
              <span>
                <b>Hay {totalFechasCorridas} registro(s) con la fecha corrida un día</b> (hechos entre las 7 p. m. y la medianoche).
                {' '}Se pueden corregir con la hora exacta en que se registraron.
              </span>
              <button onClick={handleCorregirFechas} disabled={corrigiendoFechas} className="btn btn-oscuro btn-sm">
                {corrigiendoFechas ? 'Corrigiendo...' : 'Corregir fechas'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_400px] gap-6 mb-6 items-start no-print">
            {/* ---------- Catálogo ---------- */}
            <section className="panel p-4 md:p-5" data-recorrido="productos">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-base font-bold text-tinta flex items-center gap-2.5">
                  <Store size={18} /> Productos
                </h2>
                <div className="flex w-full sm:w-auto gap-2">
                  <div className="relative flex-1 sm:w-64">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-calido" />
                    <input
                      type="search"
                      placeholder="Buscar o escribir código..."
                      value={busquedaProducto}
                      onChange={(e) => setBusquedaProducto(e.target.value)}
                      onKeyDown={(e) => {
                        // Un lector de códigos escribe aquí y termina con Enter
                        if (e.key === 'Enter' && /^\d{6,}$/.test(busquedaProducto.trim())) {
                          e.preventDefault();
                          venderPorCodigo(busquedaProducto);
                          setBusquedaProducto('');
                        }
                      }}
                      className="campo pl-9"
                    />
                  </div>
                  <button onClick={() => setEscaner('venta')} disabled={!puedeVender} className="btn btn-oscuro shrink-0" title="Escanear con la cámara" data-recorrido="escanear">
                    <ScanBarcode size={16} /> <span className="hidden md:inline">Escanear</span>
                  </button>
                </div>
              </div>

              {categoriasVenta.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
                  <button onClick={() => setCategoriaVenta('')} className={`chip ${!categoriaVenta ? 'chip-activo' : ''}`}>Todas</button>
                  {categoriasVenta.map(c => (
                    <button key={c} onClick={() => setCategoriaVenta(c)} className={`chip ${categoriaVenta === c ? 'chip-activo' : ''}`}>{c}</button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pt-2">
                {catalogo.map(p => (
                  <button
                    key={p.id}
                    onClick={() => agregarProducto(p)}
                    disabled={!puedeVender || p.disponible <= 0}
                    className={`producto-tile ${p.enCarrito > 0 ? 'producto-tile-en-carrito' : ''}`}
                    title={p.disponible <= 0 ? 'Sin stock disponible' : 'Agregar al pedido'}
                  >
                    {p.enCarrito > 0 && <span className="producto-cantidad">{p.enCarrito}</span>}
                    <span>
                      <span className="block font-bold text-sm leading-snug">{p.nombre}</span>
                      <span className="block text-[11px] text-gris-calido">{p.categoria || 'Sin categoría'}</span>
                    </span>
                    <span className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1.5">
                      <span className="kpi-valor text-lg leading-none">
                        {p.precio === 0 ? <span className="flex items-center gap-1 text-sm"><Gift size={14} /> Regalo</span> : dinero(p.precio)}
                      </span>
                      <span className={`pastilla !text-[10px] ${p.disponible <= 0 ? (p.enCarrito > 0 ? 'pastilla-pendiente' : 'pastilla-peligro') : p.disponible <= 3 ? 'pastilla-pendiente' : 'pastilla-neutra'}`}>
                        {p.disponible <= 0 ? (p.enCarrito > 0 ? 'Todo en pedido' : 'Agotado') : `${p.disponible} disp.`}
                      </span>
                    </span>
                  </button>
                ))}
                {catalogoFab.map(p => {
                  const enCarrito = carrito.filter(i => i.productoId === p.id).reduce((a, i) => a + i.cantidad, 0);
                  const precios = variantesDe(p).map(e => precioUnitario(p, e));
                  const desde = Math.min(...precios);
                  const listos = Object.values(p.listos || {}).reduce((a, n) => a + (Number(n) || 0), 0);
                  const conOpciones = (p.opciones || []).length > 0 || (p.adicionales || []).length > 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => (conOpciones
                        ? exigir('ventas', 'registrar ventas') && setEligiendoFabricado(p)
                        : agregarFabricado(p, { cantidad: 1, precio: Number(p.precio) || 0 }))}
                      disabled={!puedeVender}
                      className={`producto-tile ${enCarrito > 0 ? 'producto-tile-en-carrito' : ''}`}
                      title={conOpciones ? 'Elegir opciones' : 'Agregar al pedido'}
                    >
                      {enCarrito > 0 && <span className="producto-cantidad">{enCarrito}</span>}
                      <span>
                        <span className="block font-bold text-sm leading-snug">{p.nombre}</span>
                        <span className="block text-[11px] text-gris-calido">{p.categoria || 'Sin categoría'}</span>
                      </span>
                      <span className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1.5">
                        <span className="kpi-valor text-lg leading-none">
                          {Math.max(...precios) !== desde && <span className="block text-[10px] font-normal text-gris-calido">desde</span>}
                          {dinero(desde)}
                        </span>
                        <span className={`pastilla !text-[10px] ${listos > 0 ? 'pastilla-ok' : 'pastilla-neutra'}`}>{listos > 0 ? `${listos} listos` : 'Se arma'}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {catalogo.length === 0 && catalogoFab.length === 0 && (
                <div className="text-center py-10 text-sm text-gris-calido">
                  <PackageX size={28} className="mx-auto mb-2 opacity-60" />
                  {productos.length === 0 ? 'Todavía no hay productos. Agrégalos en Inventario.' : 'Ningún producto coincide con la búsqueda.'}
                </div>
              )}
            </section>

            {/* ---------- Pedido actual ---------- */}
            {esPC && (
              <aside className="panel p-4 md:p-5 sticky top-4" data-recorrido="pedido">
                {contenidoPedido}
              </aside>
            )}
          </div>

          {!esPC && (
            <>
              <button
                onClick={() => setPedidoAbierto(true)}
                className="fixed z-30 bottom-4 right-4 left-4 sm:left-auto btn btn-oscuro !py-3 !px-5 !text-base !shadow-[4px_4px_0_var(--color-sol)] hover:!shadow-[5px_5px_0_var(--color-sol)] no-print"
                aria-label="Abrir el pedido"
                data-recorrido="pedido"
              >
                <ShoppingCart size={18} />
                {carrito.length === 0
                  ? <span className="opacity-80">Pedido vacío</span>
                  : (
                    <>
                      Pedido
                      <span className="pastilla pastilla-pendiente !border-sol">{unidadesCarrito} un.</span>
                      <span className="font-extrabold">{dinero(totalACobrar)}</span>
                    </>
                  )}
              </button>

              {pedidoAbierto && (
                <div className="fixed inset-0 z-40 no-print" role="dialog" aria-modal="true" aria-label="Pedido">
                  <div className="absolute inset-0 bg-tinta/50" onClick={() => setPedidoAbierto(false)} />
                  <div className="ventana-pedido absolute inset-x-0 bottom-0 max-h-[90dvh] sm:inset-y-3 sm:right-3 sm:left-auto sm:w-[420px] sm:max-h-none overflow-y-auto overscroll-contain bg-white border-2 border-tinta rounded-t-[1.5rem] sm:rounded-[1.25rem] shadow-[0_-6px_0_rgba(40,32,59,0.12)] sm:shadow-[6px_6px_0_rgba(40,32,59,0.25)] p-4 md:p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="sm:hidden mx-auto h-1.5 w-12 rounded-full bg-linea" aria-hidden="true" />
                      <button onClick={() => setPedidoAbierto(false)} className="btn-icono ml-auto" aria-label="Cerrar el pedido" title="Cerrar">
                        <X size={18} />
                      </button>
                    </div>
                    {contenidoPedido}
                    <button onClick={() => setPedidoAbierto(false)} className="btn btn-claro w-full mt-3">
                      Seguir agregando productos
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ---------- Historial ---------- */}
          <div className="panel overflow-hidden mb-6" data-recorrido="historial">
            <div className="p-4 md:p-5 border-b-[1.5px] border-linea flex flex-wrap gap-3 justify-between items-center">
              <h2 className="text-base font-bold text-tinta flex items-center gap-2.5"><ClipboardList size={18} /> Historial de ventas</h2>
              <div className="flex flex-wrap items-center gap-2 no-print">
                <div className="segmentado !flex-nowrap">
                  {[['todas', 'Abiertas'], ['pagadas', 'Pagadas'], ['pendientes', 'Fiadas'], ['cerradas', 'Cerradas']].map(([valor, texto]) => (
                    <button key={valor} onClick={() => setFiltroVentas(valor)} className={`segmento !py-1 ${filtroVentas === valor ? 'segmento-activo' : ''}`}>{texto}</button>
                  ))}
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gris-calido" />
                  <input
                    type="search"
                    placeholder="Cliente o producto"
                    value={busquedaVentas}
                    onChange={(e) => setBusquedaVentas(e.target.value)}
                    className="campo !py-1.5 pl-8 w-44"
                  />
                </div>
                <MenuDesplegable etiqueta="" icono={<Ellipsis size={16} />} alinear="derecha" claseBoton="btn btn-claro btn-sm !px-2">
                  <MenuTitulo>Acciones</MenuTitulo>
                  <MenuItem icono={<Archive size={16} />} onClick={handleCerrarCaja} detalle="Archiva las pagadas y envía el informe; el efectivo no cambia">
                    Cerrar caja
                  </MenuItem>
                </MenuDesplegable>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="tabla w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr>
                    <th className="p-3 hidden md:table-cell">Fecha</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Detalle</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 hidden sm:table-cell">Pago</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 no-print"></th>
                  </tr>
                </thead>
                <tbody>
                  {ventasFiltradas.map((v) => (
                    <tr key={v.id}>
                      <td className="p-3 text-gris-calido whitespace-nowrap hidden md:table-cell">{v.fecha}<FirmaCambio item={v} /></td>
                      <td className="p-3 font-semibold">{v.cliente}</td>
                      <td className="p-3">
                        {v.esRecargo
                          ? <span className="text-gris-calido italic">Tarifa del datáfono ({v.tarifa?.datafono || 'tarjeta'}) · no es ingreso, la recibe el datáfono</span>
                          : <><span className="font-semibold">{v.producto}</span> <span className="text-gris-calido">× {v.cantidad}</span></>}
                        <span className="block md:hidden text-[11px] text-gris-calido">{v.fecha} · {v.medioPago}</span>
                        {v.variante && v.variante !== 'Auto (FEFO)' && <span className="block text-[11px] text-gris-calido">{v.variante}</span>}
                      </td>
                      <td className={`p-3 text-right whitespace-nowrap ${v.esRecargo || v.staff ? 'text-gris-calido' : 'font-bold'}`}>{v.esRecargo ? `(${dinero(v.total)})` : v.staff ? <span title="No se cobró">costo {dinero(v.costoTotal)}</span> : dinero(v.total)}</td>
                      <td className="p-3 hidden sm:table-cell"><span className="pastilla pastilla-neutra">{v.medioPago}</span></td>
                      <td className="p-3">
                        {v.staff ? (
                          <span className="pastilla pastilla-info" title={`Consumo del staff · costo ${dinero(v.costoTotal)}`}><Users size={12} /> Staff</span>
                        ) : (
                          <button
                            onClick={() => togglePago(v.id, v.pagado)}
                            title="Cambiar estado de pago"
                            className={`pastilla hover:brightness-95 transition ${v.pagado ? 'pastilla-ok' : 'pastilla-pendiente'}`}
                          >
                            {v.pagado ? <CheckCircle size={12} /> : <HandCoins size={12} />}
                            {v.pagado ? 'Pagado' : 'Fiado'}
                          </button>
                        )}
                        {v.archivada && <span className="block mt-1 text-[10px] text-gris-calido whitespace-nowrap">Cerrada {v.fechaCierre ? fechaLocal(new Date(v.fechaCierre)) : ''}</span>}
                      </td>
                      <td className="p-3 text-right no-print">
                        <button onClick={() => eliminarVenta(v.id)} className="btn-icono btn-icono-peligro" title="Eliminar venta">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {ventasFiltradas.length === 0 && (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-gris-calido">
                        {ventas.length === 0 ? 'Todavía no hay ventas registradas.' : filtroVentas === 'cerradas' ? 'Todavía no hay cierres de caja.' : 'No hay ventas con ese filtro.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
        );
      })()}

      {/* ==================== PESTAÑA CLIENTES Y FIADOS ==================== */}
      {pestana === 'clientes' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
            <Kpi color="sol" icono={<HandCoins size={18} />} etiqueta="Total por cobrar" valor={dinero(totalPorCobrar)} detalle={`${ventasPendientes.length} venta(s) pendiente(s)`} />
            <Kpi color="coral" icono={<Users size={18} />} etiqueta="Clientes con deuda" valor={clientesConDeuda} detalle={deudoresSinRegistro.length > 0 ? `${deudoresSinRegistro.length} sin registrar (fiados antiguos)` : 'Todos registrados'} />
            <Kpi clase="col-span-2 sm:col-span-1" color="turquesa" icono={<UserPlus size={18} />} etiqueta="Clientes registrados" valor={clientes.length} detalle="En el directorio" />
          </div>

          {/* Formulario de cliente */}
          <Plegable
            titulo={editandoClienteId ? 'Editar cliente' : 'Nuevo cliente'}
            descripcion="Nombre, teléfono y una nota"
            icono={<UserPlus size={18} />}
            forzarAbierto={!!editandoClienteId}
          >
            {!puede('clientes') && <AvisoSinPermiso accion="gestionar clientes" />}
            <form onSubmit={handleGuardarCliente} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <fieldset disabled={!puede('clientes')} className="contents">
              <div>
                <label className="etiqueta">Nombre</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Juan Pérez"
                  value={formCliente.nombre}
                  onChange={(e) => setFormCliente({ ...formCliente, nombre: e.target.value })}
                  className="campo"
                />
              </div>
              <div>
                <label className="etiqueta">Teléfono (opcional)</label>
                <input
                  type="tel"
                  placeholder="Ej. 300 123 4567"
                  value={formCliente.telefono}
                  onChange={(e) => setFormCliente({ ...formCliente, telefono: e.target.value })}
                  className="campo"
                />
              </div>
              <div>
                <label className="etiqueta">Nota (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej. Trabaja en el piso 2"
                  value={formCliente.nota}
                  onChange={(e) => setFormCliente({ ...formCliente, nota: e.target.value })}
                  className="campo"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="btn btn-primario flex-1"
                >
                  {editandoClienteId ? 'Guardar Cambios' : 'Agregar Cliente'}
                </button>
                {editandoClienteId && (
                  <button
                    type="button"
                    onClick={cancelarEdicionCliente}
                    className="btn btn-claro"
                  >
                    Cancelar
                  </button>
                )}
              </div>
              </fieldset>
            </form>
          </Plegable>

          {/* Cuentas de clientes */}
          <div className="panel overflow-hidden">
            <div className="p-4 border-b-[1.5px] border-linea flex flex-col md:flex-row md:justify-between md:items-center gap-3">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <HandCoins size={18} /> Cuentas de Clientes y Fiados
              </h2>
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                className="campo md:w-64 no-print"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="tabla w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr>
                    <th className="p-3">Cliente</th>
                    <th className="p-3 hidden md:table-cell">Teléfono</th>
                    <th className="p-3 hidden sm:table-cell">Ventas Pendientes</th>
                    <th className="p-3 hidden lg:table-cell">Último Fiado</th>
                    <th className="p-3">Deuda</th>
                    <th className="p-3 text-right no-print">Acciones</th>
                  </tr>
                </thead>
                <tbody>
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
                              <span className="ml-6 mt-1 pastilla pastilla-neutra !text-[10px]">SIN REGISTRAR</span>
                            )}
                            {cuenta.cliente?.nota && <p className="ml-6 text-[11px] font-normal text-slate-400">{cuenta.cliente.nota}</p>}
                          </td>
                          <td className="p-3 text-slate-500 hidden md:table-cell">
                            {cuenta.cliente?.telefono
                              ? <span className="inline-flex items-center gap-1"><Phone size={12} /> {cuenta.cliente.telefono}</span>
                              : '—'}
                          </td>
                          <td className="p-3 hidden sm:table-cell">{cuenta.pendientes.length}</td>
                          <td className="p-3 text-slate-500 hidden lg:table-cell">{cuenta.ultimaFecha || '—'}</td>
                          <td className="p-3">
                            {cuenta.deuda > 0
                              ? <span className="font-bold text-amber-700">{dinero(cuenta.deuda)}</span>
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
                                  <button onClick={() => iniciarEdicionCliente(cuenta.cliente)} className="btn-icono" title="Editar cliente">
                                    <Edit2 size={16} />
                                  </button>
                                  <button onClick={() => eliminarCliente(cuenta)} className="btn-icono btn-icono-peligro" title="Eliminar cliente">
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => registrarDeudor(cuenta)}
                                  disabled={procesandoCuenta}
                                  className="btn btn-claro btn-sm"
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
                                  <Merge size={16} />
                                  {cuenta.cliente ? `Fusionar "${cuenta.nombre}" con otro cliente` : `Asignar las ventas de "${cuenta.nombre}" a un cliente`}
                                </p>
                                <p className="text-xs text-slate-500 mb-3">
                                  {cuenta.cliente
                                    ? 'Úsalo si este cliente quedó registrado dos veces. Sus ventas y su deuda pasan al cliente que elijas y este registro se elimina.'
                                    : 'Úsalo si estas ventas son de un cliente que ya está registrado con otro nombre.'}
                                  {' '}Se trasladarán <b>{ventasDeCuenta(cuenta).length} venta(s)</b> y una deuda de <b>{dinero(cuenta.deuda)}</b>.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                  <label className="text-xs font-semibold text-slate-600">Pasar a:</label>
                                  <select
                                    value={fusionDestinoId}
                                    onChange={(e) => setFusionDestinoId(e.target.value)}
                                    className="campo sm:w-64"
                                  >
                                    <option value="">Elegir cliente...</option>
                                    {clientes.filter(c => c.id !== cuenta.cliente?.id).map(c => (
                                      <option key={c.id} value={c.id}>{c.nombre}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => handleFusionar(cuenta)}
                                    disabled={!fusionDestinoId || procesandoCuenta}
                                    className="btn btn-primario"
                                  >
                                    {cuenta.cliente ? 'Fusionar y eliminar duplicado' : 'Asignar ventas'}
                                  </button>
                                  <button
                                    onClick={() => setFusionCuentaKey(null)}
                                    className="btn btn-claro"
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
                                          className="campo"
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
                                          className="btn btn-exito btn-sm"
                                        >
                                          <CheckCircle size={14} /> Saldar todo ({dinero(cuenta.deuda)})
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
                                              <span className="font-bold text-slate-900">{dinero(v.total)}</span>
                                              <button
                                                onClick={() => handlePagarVenta(v)}
                                                disabled={procesandoCuenta}
                                                className="enlace no-print disabled:opacity-50"
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
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
            <Kpi color="tinta" icono={<Wallet size={18} />} etiqueta="Efectivo en caja" valor={dinero(efectivoTotalEnCaja)} detalle="Base + ventas cobradas en efectivo" />
            <Kpi
              color="turquesa"
              icono={<RefreshCw size={18} />}
              etiqueta="Punto cero"
              valor={dinero(estadoPuntoCeroReposicion)}
              detalle={estadoPuntoCeroReposicion >= 0 ? 'Reposiciones cubiertas' : `Faltan ${dinero(Math.abs(estadoPuntoCeroReposicion))} por recuperar`}
            />
            <Kpi color="coral" icono={<TrendingDown size={18} />} etiqueta="Gastos" valor={dinero(totalGastosRegistrados)} detalle={`Proveedores: ${dinero(gastosEnReposiciones)}`} />
            <Kpi
              color="sol"
              icono={<HandCoins size={18} />}
              etiqueta="Por cobrar"
              valor={dinero(totalPorCobrar)}
              detalle={clientesConDeuda === 0 ? 'Nadie debe dinero' : `${clientesConDeuda} cliente(s) · Ver →`}
              onClick={() => setPestana('clientes')}
            />
          </div>

          <PerdidasFinanzas perdidas={perdidas} puedeBorrar={puede('inventario')} operacion={operacion} docN={docN} fabricacion={!!negocio?.fabricacion} />

          <GananciaProductos ventas={ventas} perdidas={perdidas} />

          {/* Efectivo base: entradas, salidas y conteo de la caja */}
          <CajaBase
            cajaInicial={cajaInicial}
            cajaDocId={cajaDocId}
            movimientos={movimientosCaja}
            ventasEfectivo={totalVentasEfectivoCobrado}
            puedeEditar={puede('finanzas')}
            operacion={operacion}
            col={col}
            docN={docN}
            nombre={perfil?.nombre || ''}
            AvisoSinPermiso={AvisoSinPermiso}
          />

          {/* Registro de Gastos y Proveedores */}
          <Plegable
            titulo={editandoGastoId ? 'Editar gasto' : 'Registrar gasto o compra'}
            descripcion="Proveedores, compras de productos y otros egresos"
            icono={<Receipt size={18} />}
            forzarAbierto={!!editandoGastoId}
          >
            {!puede('finanzas') && <AvisoSinPermiso accion="registrar gastos" />}
            <form onSubmit={handleAgregarOEditarGasto} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <fieldset disabled={!puede('finanzas')} className="contents">
              <div>
                <label className="etiqueta">Concepto</label>
                <input
                  type="text"
                  placeholder="Ej. Compra de Limones, Transporte..."
                  value={formGasto.concepto}
                  onChange={(e) => setFormGasto({ ...formGasto, concepto: e.target.value })}
                  className="campo"
                  required
                />
              </div>
              <div>
                <label className="etiqueta">Monto ($)</label>
                <input
                  type="number"
                  placeholder="Ej. 15000"
                  value={formGasto.monto}
                  onChange={(e) => setFormGasto({ ...formGasto, monto: e.target.value })}
                  className="campo"
                  required
                />
              </div>
              <div>
                <label className="etiqueta">Tipo de Gasto</label>
                <select
                  value={formGasto.tipo}
                  onChange={(e) => setFormGasto({ ...formGasto, tipo: e.target.value })}
                  className="campo"
                >
                  <option value="Proveedor">Proveedor / Reposición</option>
                  <option value="Compra Productos">Compra Productos</option>
                  <option value="Operativo">Gasto Operativo</option>
                  <option value="Otro">Otro Egreso</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="etiqueta">Detalle <span className="font-normal text-gris-calido">(opcional)</span></label>
                <input
                  type="text"
                  placeholder="Ej. 2 kg de limón en la plaza de Engativá, pagado en efectivo"
                  value={formGasto.detalle}
                  onChange={(e) => setFormGasto({ ...formGasto, detalle: e.target.value })}
                  className="campo"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="btn btn-primario flex-1"
                >
                  {editandoGastoId ? 'Actualizar' : 'Agregar Gasto'}
                </button>
                {editandoGastoId && (
                  <button
                    type="button"
                    onClick={cancelarEdicionGasto}
                    className="btn btn-claro"
                  >
                    Cancelar
                  </button>
                )}
              </div>
              </fieldset>
            </form>
          </Plegable>

          <div className="panel overflow-hidden">
            <div className="p-4 md:p-5 border-b-[1.5px] border-linea">
              <h2 className="text-base font-bold text-tinta flex items-center gap-2.5"><ClipboardList size={18} /> Historial de gastos</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="tabla w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr>
                    <th className="p-3 w-10"></th>
                    <th className="p-3">Concepto</th>
                    <th className="p-3 hidden sm:table-cell">Tipo</th>
                    <th className="p-3 text-right">Monto</th>
                    <th className="p-3 hidden md:table-cell">Fecha</th>
                    <th className="p-3 text-right no-print">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {gastos.map((g) => {
                    const abierto = gastoExpandidoId === g.id;
                    const tieneDetalle = g.detalle && g.detalle !== 'Sin observaciones adicionales';
                    return (
                      <React.Fragment key={g.id}>
                        <tr
                          onClick={() => setGastoExpandidoId(abierto ? null : g.id)}
                          className={`cursor-pointer ${abierto ? '!bg-crema/60' : ''}`}
                        >
                          <td className="p-3">
                            <button
                              className="btn-icono"
                              aria-expanded={abierto}
                              title={abierto ? 'Ocultar detalle' : 'Ver detalle'}
                              onClick={(e) => { e.stopPropagation(); setGastoExpandidoId(abierto ? null : g.id); }}
                            >
                              <ChevronDown size={16} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
                            </button>
                          </td>
                          <td className="p-3">
                            <span className="font-semibold">{g.concepto}</span>
                            {tieneDetalle && !abierto && <span className="block text-[11px] text-gris-calido truncate max-w-[16rem]">{g.detalle}</span>}
                          </td>
                          <td className="p-3 hidden sm:table-cell"><span className="pastilla pastilla-neutra">{g.tipo}</span></td>
                          <td className="p-3 font-bold text-right whitespace-nowrap">{dinero(g.monto)}</td>
                          <td className="p-3 text-gris-calido whitespace-nowrap hidden md:table-cell">{g.fecha}</td>
                          <td className="p-3 no-print" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              <button onClick={() => iniciarEdicionGasto(g)} className="btn-icono" title="Editar gasto">
                                <Edit2 size={16} />
                              </button>
                              <button onClick={() => eliminarGasto(g.id)} className="btn-icono btn-icono-peligro" title="Eliminar gasto">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {abierto && (
                          <tr className="!bg-crema/40">
                            <td></td>
                            <td colSpan="5" className="px-3 pb-4 pt-1">
                              <dl className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-x-4 gap-y-1.5 text-xs md:text-sm">
                                <dt className="kpi-etiqueta text-gris-calido pt-0.5">Concepto</dt>
                                <dd className="font-semibold">{g.concepto}</dd>
                                <dt className="kpi-etiqueta text-gris-calido pt-0.5">Detalle</dt>
                                <dd className={tieneDetalle ? '' : 'text-gris-calido italic'}>{tieneDetalle ? g.detalle : 'Sin observaciones'}</dd>
                                <dt className="kpi-etiqueta text-gris-calido pt-0.5">Tipo</dt>
                                <dd>{g.tipo}{['Proveedor', 'Compra Productos'].includes(g.tipo) && <span className="text-gris-calido"> · cuenta para el punto cero</span>}</dd>
                                <dt className="kpi-etiqueta text-gris-calido pt-0.5">Monto</dt>
                                <dd className="font-bold">{dinero(g.monto)}</dd>
                                <dt className="kpi-etiqueta text-gris-calido pt-0.5">Registro</dt>
                                <dd>{g.fecha}{firmaCambio(g) && <span className="text-gris-calido"> · último cambio: {firmaCambio(g)}</span>}</dd>
                              </dl>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {gastos.length === 0 && (
                    <tr>
                      <td colSpan="6" className="p-6 text-center text-gris-calido">No hay gastos registrados.</td>
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
          <div className="panel p-4 flex flex-wrap items-center justify-between gap-3 no-print">
            <p className="text-sm text-gris-calido flex items-center gap-2">
              <Barcode size={18} className="text-tinta shrink-0" />
              Escanea un producto para registrarlo o sumarle un lote. También funciona con lector USB/Bluetooth.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setEscaner('inventario')} disabled={!puede('inventario')} className="btn btn-oscuro btn-sm">
                <ScanBarcode size={14} /> Escanear producto
              </button>
              <button onClick={() => setPestana('etiquetas')} className="btn btn-claro btn-sm">
                <Tags size={14} /> Etiquetas
              </button>
            </div>
          </div>

          <BajasLotes productos={productos} puedeRegistrar={puede('inventario') || puede('ventas')} operacion={operacion} col={col} docN={docN} />

          <Plegable
            titulo={editandoProductoId ? 'Editar producto' : modoLote ? `Agregar lote: ${formProducto.nombre}` : 'Nuevo producto o lote'}
            descripcion={modoLote ? 'Producto encontrado por su código' : 'Precio, categoría, código y lotes con fecha de vencimiento'}
            icono={<PackagePlus size={18} />}
            forzarAbierto={!!editandoProductoId || formularioProductoAbierto}
          >
            {!puede('inventario') && <AvisoSinPermiso accion="modificar el inventario" />}
            {modoLote && (
              <div className="aviso aviso-info mb-4 flex-wrap items-center justify-between">
                <span>Vas a agregar un <b>lote nuevo</b> a <b>{formProducto.nombre}</b>. Escribe la cantidad, la variante y el vencimiento.</span>
                <button type="button" onClick={cancelarEdicion} className="enlace text-xs">Cancelar</button>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div className="flex-1 min-w-[14rem]">
                <label className="etiqueta">Código de barras <span className="font-normal text-gris-calido">(opcional)</span></label>
                <div className="relative">
                  <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-calido" />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Escanea o escribe el código"
                    value={formProducto.codigo}
                    disabled={modoLote || !puede('inventario')}
                    onChange={(e) => setFormProducto({ ...formProducto, codigo: e.target.value })}
                    onKeyDown={(e) => {
                      // Al escanear en este campo (Enter), se busca si el producto ya existe
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (!editandoProductoId && formProducto.codigo.trim()) registrarPorCodigo(formProducto.codigo);
                      }
                    }}
                    className="campo pl-9 font-mono"
                  />
                </div>
                {formProducto.codigo && esCodigoInterno(limpiarCodigo(formProducto.codigo)) && <p className="text-[11px] text-gris-calido mt-1">Código interno de la tienda (para imprimir en etiqueta).</p>}
                {buscandoNombre && <p className="text-[11px] text-gris-calido mt-1">Buscando el nombre en Open Food Facts...</p>}
              </div>
              {!modoLote && (
                <>
                  <button type="button" onClick={() => setEscaner('formulario')} disabled={!puede('inventario')} className="btn btn-claro">
                    <ScanBarcode size={16} /> Escanear
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormProducto(f => ({ ...f, codigo: generarCodigoInterno(productos) }))}
                    disabled={!puede('inventario')}
                    className="btn btn-claro"
                    title="Para productos caseros que no traen código"
                  >
                    <Sparkles size={16} /> Generar código propio
                  </button>
                </>
              )}
            </div>
            <form onSubmit={handleGuardarProducto} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <fieldset disabled={!puede('inventario')} className="contents">
              <div>
                <label className="etiqueta">Nombre del Producto</label>
                <input
                  type="text"
                  placeholder="Ej. Limonada Natural"
                  value={formProducto.nombre}
                  onChange={(e) => setFormProducto({ ...formProducto, nombre: e.target.value })}
                  className="campo"
                  required={!editandoProductoId && !modoLote}
                  disabled={modoLote}
                />
              </div>
              <div>
                <label className="etiqueta">Costo Unitario ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ej. 1000"
                  value={formProducto.costo}
                  onChange={(e) => setFormProducto({ ...formProducto, costo: e.target.value })}
                  className="campo"
                  required={!editandoProductoId && !modoLote}
                  disabled={modoLote}
                />
              </div>
              <div>
                <label className="etiqueta">Precio de Venta ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ej. 2500"
                  value={formProducto.precio}
                  onChange={(e) => setFormProducto({ ...formProducto, precio: e.target.value })}
                  className="campo"
                  required={!editandoProductoId && !modoLote}
                  disabled={modoLote}
                />
              </div>
              <div>
                <label className="etiqueta">Categoría</label>
                <select
                  value={formProducto.categoria}
                  disabled={modoLote}
                  onChange={(e) => setFormProducto({ ...formProducto, categoria: e.target.value })}
                  className="campo"
                >
                  <option value="">Sin categoría</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.nombre}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="etiqueta">Variante / Sabor del Lote</label>
                <input
                  type="text"
                  placeholder="Ej. Botella 500ml, Frutos Rojos..."
                  value={formProducto.variante}
                  onChange={(e) => setFormProducto({ ...formProducto, variante: e.target.value })}
                  className="campo"
                />
              </div>
              <div>
                <label className="etiqueta">Cantidad del Lote</label>
                <input
                  type="number"
                  placeholder="Ej. 20"
                  value={formProducto.cantidad}
                  onChange={(e) => setFormProducto({ ...formProducto, cantidad: e.target.value })}
                  className="campo"
                />
              </div>
              <div>
                <label className="etiqueta">Fecha de Vencimiento</label>
                <input
                  type="date"
                  value={formProducto.vencimiento}
                  onChange={(e) => setFormProducto({ ...formProducto, vencimiento: e.target.value })}
                  className="campo"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="btn btn-primario flex-1"
                >
                  {editandoProductoId ? 'Guardar Cambios' : modoLote ? 'Agregar lote' : 'Añadir al Inventario'}
                </button>
                {(editandoProductoId || modoLote || formularioProductoAbierto) && (
                  <button
                    type="button"
                    onClick={cancelarEdicion}
                    className="btn btn-claro"
                  >
                    Cancelar
                  </button>
                )}
              </div>
              </fieldset>
            </form>
          </Plegable>

          <div className="panel overflow-hidden">
            <div className="p-4 md:p-5 border-b-[1.5px] border-linea">
              <h2 className="text-base font-bold text-tinta flex items-center gap-2.5">
                <Boxes size={18} /> Inventario por lotes
                <span className="pastilla pastilla-info" title="Se vende primero lo que vence antes">FEFO</span>
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="tabla w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr>
                    <th className="p-3">Producto</th>
                    <th className="p-3 hidden md:table-cell">Categoría</th>
                    <th className="p-3 hidden sm:table-cell">Costo</th>
                    <th className="p-3">Precio</th>
                    <th className="p-3">Stock</th>
                    <th className="p-3 hidden lg:table-cell">Próx. Vencimiento</th>
                    <th className="p-3 text-right no-print">Acciones</th>
                  </tr>
                </thead>
                <tbody>
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
                            {codigosDe(p)[0] && (
                              <span className="block font-mono text-[10px] text-gris-calido">
                                {codigosDe(p)[0]}{esCodigoInterno(codigosDe(p)[0]) ? ' · interno' : ''}
                              </span>
                            )}
                            <FirmaCambio item={p} />
                          </td>
                          <td className="p-3 text-slate-500 hidden md:table-cell">{p.categoria || 'Sin categoría'}</td>
                          <td className="p-3 hidden sm:table-cell">{dinero(p.costo)}</td>
                          <td className="p-3 font-bold text-slate-900">{dinero(p.precio)}</td>
                          <td className="p-3">
                            <span className={`pastilla ${
                              stockTotal <= 0 ? 'pastilla-peligro' : stockTotal <= 3 ? 'pastilla-pendiente' : 'pastilla-ok'
                            }`}>
                              {stockTotal} un.
                            </span>
                          </td>
                          <td className="p-3 text-slate-600 hidden lg:table-cell">{proxVenc}</td>
                          <td className="p-3 text-right no-print flex justify-end gap-2">
                            <button onClick={() => iniciarEdicionProductoBase(p)} className="btn-icono" title="Editar datos base">
                              <Edit2 size={16} />
                            </button>
                            <button onClick={() => eliminarProductoCompleto(p.id)} className="btn-icono btn-icono-peligro" title="Eliminar producto completo">
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
                                        <button onClick={() => handleEditarLote(p.id, lote.id)} className="enlace">Editar</button>
                                        <button onClick={() => handleEliminarLote(p.id, lote.id)} className="enlace enlace-peligro">Eliminar</button>
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
        <div className="panel p-6 max-w-xl mx-auto">
          <h2 className="text-base font-bold text-tinta mb-4 flex items-center gap-2.5"><Tag size={18} /> Categorías</h2>
          {!puede('inventario') && <AvisoSinPermiso accion="crear categorías" />}
          <form onSubmit={handleAgregarCategoria} className="flex gap-3 mb-6">
            <fieldset disabled={!puede('inventario')} className="contents">
            <input
              type="text"
              placeholder="Nueva categoría..."
              value={nuevaCategoria}
              onChange={(e) => setNuevaCategoria(e.target.value)}
              className="campo flex-1"
            />
            <button type="submit" className="btn btn-primario">
              Agregar
            </button>
            </fieldset>
          </form>

          <div className="space-y-2">
            {categorias.map(c => (
              <div key={c.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-sm font-medium text-slate-800">{c.nombre}</span>
                <button onClick={() => eliminarCategoria(c.id)} className="btn-icono btn-icono-peligro">
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
        <div className="panel p-6 max-w-2xl mx-auto text-center">
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
                    <span className="font-extrabold text-tinta">{dinero(p.precio)}</span>
                  </div>
                  <p className="text-xs text-slate-500">{p.categoria || 'General'} — Stock: {stockTotal} un.</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ventanaNegocio && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 no-print" role="dialog" aria-modal="true" aria-label="Registrar nuevo negocio">
          <div className="absolute inset-0 bg-tinta/50" onClick={() => setVentanaNegocio(false)} />
          <div className="ventana-pedido relative w-full max-w-md max-h-[92dvh] overflow-y-auto marca-tarjeta p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold flex items-center gap-2"><Store size={18} /> Registrar nuevo negocio</h2>
              <button onClick={() => setVentanaNegocio(false)} className="btn-icono" aria-label="Cerrar"><X size={18} /></button>
            </div>
            <p className="text-xs text-gris-calido mb-4">Tendrá sus propias ventas, inventario, socios y finanzas, sin mezclarse con {negocio?.nombre}. Tú quedas como titular.</p>
            <FormNuevoNegocio onCreado={(id) => { setVentanaNegocio(false); cambiarNegocio(id); }} />
          </div>
        </div>
      )}

      {escaner && (
        <Suspense fallback={null}>
      <EscanerCamara
        abierto={!!escaner}
        continuo={escaner === 'venta'}
        titulo={escaner === 'venta' ? 'Escanear productos para vender' : 'Escanear código del producto'}
        onCerrar={() => setEscaner(null)}
        onCodigo={alLeerCodigo}
      />
        </Suspense>
      )}
      {codigoPorVincular && (
        <VincularCodigo
          codigo={codigoPorVincular.codigo}
          productos={productos}
          onVincular={vincularCodigo}
          onNuevo={registrarCodigoComoNuevo}
          onCerrar={() => setCodigoPorVincular(null)}
          textoNuevo={codigoPorVincular.origen === 'venta' ? 'Registrarlo como producto nuevo' : 'Es un producto nuevo'}
        />
      )}
      {toast && (
        <div
          key={toast.id}
          role="status"
          className={`fixed bottom-24 2xl:bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] aviso no-print shadow-[4px_4px_0_rgba(40,32,59,0.25)] ${
            toast.tipo === 'error' ? 'aviso-error' : toast.tipo === 'info' ? 'aviso-info' : 'aviso-ok'
          }`}
        >
          {toast.texto}
        </div>
      )}
    </div>
  );
}