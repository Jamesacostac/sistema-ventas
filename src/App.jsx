import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, writeBatch 
} from 'firebase/firestore';
import { db } from './firebase';
import { enviarMensajeTelegram, obtenerUltimosMensajesTelegram } from './telegram';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line 
} from 'recharts';
import { 
  CheckCircle, XCircle, FileText, PlusCircle, Trash2, ShoppingBag, 
  Package, DollarSign, CreditCard, Send, BookOpen, AlertTriangle, Tag,
  Edit2, ChevronDown, ChevronUp, Save, X, Wallet, TrendingDown, RefreshCw, Printer
} from 'lucide-react';

export default function App() {
  const [pestana, setPestana] = useState('ventas');
  const [productos, setProductos] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [cajaInicial, setCajaInicial] = useState(0);
  const [cajaDocId, setCajaDocId] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Estados desplegables y edición
  const [productoExpandidoId, setProductoExpandidoId] = useState(null);
  const [nuevoEfectivoBaseInput, setNuevoEfectivoBaseInput] = useState('');

  // Referencias para listener de Telegram
  const productosRef = useRef(productos);
  const ventasRef = useRef(ventas);

  useEffect(() => { productosRef.current = productos; }, [productos]);
  useEffect(() => { ventasRef.current = ventas; }, [ventas]);

  // Escuchar Firestore en tiempo real
  useEffect(() => {
    const unsubProductos = onSnapshot(collection(db, 'productos'), (snapshot) => {
      setProductos(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubVentas = onSnapshot(collection(db, 'ventas'), (snapshot) => {
      const lista = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setVentas(lista.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0)));
      setCargando(false);
    });

    const unsubCategorias = onSnapshot(collection(db, 'categorias'), (snapshot) => {
      setCategorias(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubGastos = onSnapshot(collection(db, 'gastos'), (snapshot) => {
      const listaG = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setGastos(listaG.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0)));
    });

    const unsubCaja = onSnapshot(collection(db, 'caja_base'), (snapshot) => {
      if (!snapshot.empty) {
        const docCaja = snapshot.docs[0];
        setCajaInicial(docCaja.data().monto || 0);
        setCajaDocId(docCaja.id);
      } else {
        setCajaInicial(0);
        setCajaDocId(null);
      }
    });

    return () => {
      unsubProductos();
      unsubVentas();
      unsubCategorias();
      unsubGastos();
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
    productoId: '', // Vacío para nuevo producto, o ID para añadir lote
    nombre: '', costo: '', precio: '', variante: 'Limonada', cantidad: '', vencimiento: '', categoria: '', descripcion: ''
  });

  const [formGasto, setFormGasto] = useState({
    concepto: '', monto: '', tipo: 'Proveedor', detalle: ''
  });

  const [nuevaCategoria, setNuevaCategoria] = useState('');

  // Auxiliares para lotes y stock
  const getStockTotalProducto = (lotes) => {
    if (!lotes || !Array.isArray(lotes)) return 0;
    return lotes.reduce((acc, l) => acc + Number(l.cantidad || 0), 0);
  };

  const getProximoVencimientoProducto = (lotes) => {
    if (!lotes || !Array.isArray(lotes) || lotes.length === 0) return 'N/A';
    const fechas = lotes.map(l => l.vencimiento).filter(Boolean).sort();
    return fechas[0] || 'N/A';
  };

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
      `🛒 Total ventas registradas: ${ventasPagadas.length}`;

    return await enviarMensajeTelegram(reporteTexto);
  };

  const generarYEnviarAlertaStock = async (listaProductos) => {
    const prods = listaProductos || productos;
    const agotados = prods.filter(p => getStockTotalProducto(p.lotes) <= 0);
    const porAgotarse = prods.filter(p => {
      const st = getStockTotalProducto(p.lotes);
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
        textoAlerta += `• <b>${p.nombre}</b>: Quedan ${getStockTotalProducto(p.lotes)} unidades\n`; 
      });
      textoAlerta += `\n`;
    }
    textoAlerta += `🛒 <i>Por favor realizar pedido de compras.</i>`;

    return await enviarMensajeTelegram(textoAlerta);
  };

  // Guardar Venta con Descuento Inteligente (FEFO)
  const handleAgregarVenta = async (e) => {
    e.preventDefault();
    const prod = productos.find(p => p.id === formVenta.productoId);
    if (!prod) return alert("Selecciona un producto válido.");

    let cantidadARestar = Number(formVenta.cantidad);
    const stockDisponible = getStockTotalProducto(prod.lotes);

    if (stockDisponible <= 0) return alert(`❌ No se puede realizar la venta: "${prod.nombre}" está agotado.`);
    if (cantidadARestar > stockDisponible) return alert(`❌ Stock insuficiente: Quedan ${stockDisponible} unidades.`);

    let lotesActualizados = JSON.parse(JSON.stringify(prod.lotes || []));
    lotesActualizados.sort((a, b) => new Date(a.vencimiento) - new Date(b.vencimiento));

    for (let lote of lotesActualizados) {
      if (cantidadARestar <= 0) break;
      if (formVenta.variante !== 'TODAS' && lote.variante.toLowerCase() !== formVenta.variante.toLowerCase()) {
        continue;
      }

      if (lote.cantidad >= cantidadARestar) {
        lote.cantidad -= cantidadARestar;
        cantidadARestar = 0;
      } else {
        cantidadARestar -= lote.cantidad;
        lote.cantidad = 0;
      }
    }

    if (cantidadARestar > 0 && formVenta.variante !== 'TODAS') {
      return alert(`❌ No hay suficiente stock de la variante "${formVenta.variante}".`);
    }

    lotesActualizados = lotesActualizados.filter(l => l.cantidad > 0);

    const cantidadComprada = Number(formVenta.cantidad);
    const total = prod.precio * cantidadComprada;
    const costoTotal = prod.costo * cantidadComprada;
    const ganancia = total - costoTotal;

    const medioPagoFinal = formVenta.medioPago === 'Otro' 
      ? (formVenta.otroMedioPago.trim() || 'Otro') 
      : formVenta.medioPago;

    try {
      await addDoc(collection(db, 'ventas'), {
        fecha: new Date().toISOString().split('T')[0],
        cliente: formVenta.cliente || 'Cliente General',
        producto: prod.nombre,
        variante: formVenta.variante === 'TODAS' ? 'Auto (FEFO)' : formVenta.variante,
        cantidad: cantidadComprada,
        total,
        costoTotal,
        ganancia,
        pagado: formVenta.pagado,
        medioPago: medioPagoFinal,
        creadoEn: Date.now()
      });

      await updateDoc(doc(db, 'productos', prod.id), { lotes: lotesActualizados });

      const nuevoStockTotal = getStockTotalProducto(lotesActualizados);
      if (nuevoStockTotal <= 3) {
        const estadoTexto = nuevoStockTotal === 0 ? "❌ <b>TOTALMENTE AGOTADO</b>" : `⚠️ <b>QUEDAN SOLO ${nuevoStockTotal} UNIDADES</b>`;
        enviarMensajeTelegram(
          `🚨 <b>ALERTA DE REPOSICIÓN DE INVENTARIO</b> 🚨\n\n` +
          `📦 Producto: <b>${prod.nombre}</b>\n` +
          `📊 Estado: ${estadoTexto}\n` +
          `🔔 <i>Por favor coordinar compra con proveedores.</i>`
        );
      }

      setFormVenta({ cliente: '', productoId: '', variante: 'TODAS', cantidad: 1, pagado: true, medioPago: 'Efectivo', otroMedioPago: '' });
    } catch (error) {
      alert("Error al registrar la venta: " + error.message);
    }
  };

  // Guardar Producto o Nuevo Lote
  const handleGuardarProducto = async (e) => {
    e.preventDefault();
    if (!formProducto.cantidad || !formProducto.vencimiento) return alert("Completa la cantidad y vencimiento.");

    const cant = Number(formProducto.cantidad);
    const prodExistente = productos.find(p => p.id === formProducto.productoId);

    try {
      if (prodExistente) {
        let nuevosLotes = JSON.parse(JSON.stringify(prodExistente.lotes || []));
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
        await updateDoc(doc(db, 'productos', prodExistente.id), { lotes: nuevosLotes });
      } else {
        if (!formProducto.nombre || !formProducto.costo || !formProducto.precio) {
          return alert("Completa nombre, costo y precio para el nuevo producto.");
        }

        await addDoc(collection(db, 'productos'), {
          nombre: formProducto.nombre.trim(),
          costo: Number(formProducto.costo),
          precio: Number(formProducto.precio),
          categoria: formProducto.categoria || 'Sin categoría',
          descripcion: formProducto.descripcion || 'Sin descripción',
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

      setFormProducto({ productoId: '', nombre: '', costo: '', precio: '', variante: 'Limonada', cantidad: '', vencimiento: '', categoria: '', descripcion: '' });
    } catch (error) {
      alert("Error al guardar producto/lote: " + error.message);
    }
  };

  // Editar o Eliminar Lote
  const handleEditarLote = async (prodId, loteId) => {
    const prod = productos.find(p => p.id === prodId);
    if (!prod) return;
    const lote = (prod.lotes || []).find(l => l.id === loteId);
    if (!lote) return;

    const nuevaCantStr = prompt(`Editar cantidad de "${prod.nombre} (${lote.variante})":`, lote.cantidad);
    const nuevaFecha = prompt(`Editar fecha de vencimiento (AAAA-MM-DD):`, lote.vencimiento);

    if (nuevaCantStr !== null && nuevaFecha !== null) {
      const nuevaCant = Number(nuevaCantStr) || 0;
      let lotesModificados = (prod.lotes || []).map(l => {
        if (l.id === loteId) {
          return { ...l, cantidad: nuevaCant, vencimiento: nuevaFecha };
        }
        return l;
      }).filter(l => l.cantidad > 0);

      lotesModificados.sort((a, b) => new Date(a.vencimiento) - new Date(b.vencimiento));

      try {
        await updateDoc(doc(db, 'productos', prodId), { lotes: lotesModificados });
      } catch (error) {
        alert("Error al actualizar lote: " + error.message);
      }
    }
  };

  const handleEliminarLote = async (prodId, loteId) => {
    if (!confirm("¿Eliminar este lote específico del inventario?")) return;
    const prod = productos.find(p => p.id === prodId);
    if (!prod) return;

    const lotesActualizados = (prod.lotes || []).filter(l => l.id !== loteId);
    try {
      await updateDoc(doc(db, 'productos', prodId), { lotes: lotesActualizados });
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

  const handleAgregarGasto = async (e) => {
    e.preventDefault();
    const monto = Number(formGasto.monto);
    if (!formGasto.concepto.trim() || isNaN(monto) || monto <= 0) {
      return alert("Por favor completa el concepto y un monto mayor a cero.");
    }

    try {
      await addDoc(collection(db, 'gastos'), {
        concepto: formGasto.concepto.trim(),
        monto,
        tipo: formGasto.tipo,
        detalle: formGasto.detalle.trim() || 'Sin observaciones',
        fecha: new Date().toISOString().split('T')[0],
        creadoEn: Date.now()
      });

      setFormGasto({ concepto: '', monto: '', tipo: 'Proveedor', detalle: '' });
    } catch (error) {
      alert("Error al registrar el gasto: " + error.message);
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

  const efectivoTotalEnCaja = cajaInicial + totalVentasEfectivoCobrado - totalGastosRegistrados;
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

  if (cargando) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-50 text-slate-600 font-sans">
        <p className="font-semibold text-lg">Cargando datos desde la nube...</p>
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
            <form onSubmit={handleAgregarVenta} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del Cliente</label>
                <input 
                  type="text" 
                  placeholder="Ej. Juan Pérez"
                  value={formVenta.cliente}
                  onChange={(e) => setFormVenta({ ...formVenta, cliente: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Producto</label>
                <select 
                  required
                  value={formVenta.productoId}
                  onChange={(e) => setFormVenta({ ...formVenta, productoId: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="">Seleccionar Producto...</option>
                  {productos.map((p) => {
                    const st = getStockTotalProducto(p.lotes);
                    return (
                      <option key={p.id} value={p.id} disabled={st <= 0}>
                        {p.precio === 0 ? '🎁 [REGALO] ' : ''}
                        {p.nombre} — ${p.precio} (Stock: {st})
                      </option>
                    );
                  })}
                </select>
              </div>

              {formVenta.productoId && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Sabor / Variante</label>
                  <select 
                    value={formVenta.variante}
                    onChange={(e) => setFormVenta({ ...formVenta, variante: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  >
                    <option value="TODAS">🤖 Auto (Prioriza la más próxima a vencer)</option>
                    {productos.find(p => p.id === formVenta.productoId)?.lotes?.map(l => (
                      <option key={l.id} value={l.variante}>
                        {l.variante} (Cant: {l.cantidad} - Vence: {l.vencimiento})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cantidad</label>
                <input 
                  type="number" 
                  min="1"
                  value={formVenta.cantidad}
                  onChange={(e) => setFormVenta({ ...formVenta, cantidad: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Medio de Pago</label>
                <select 
                  value={formVenta.medioPago}
                  onChange={(e) => setFormVenta({ ...formVenta, medioPago: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium"
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Nequi">Nequi</option>
                  <option value="Daviplata">Daviplata</option>
                  <option value="Cortesía / Regalo">Cortesía / Regalo</option>
                  <option value="Otro">Otro (Especificar)</option>
                </select>
              </div>

              {formVenta.medioPago === 'Otro' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Especifique Medio</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ej. Transferencia"
                    value={formVenta.otroMedioPago}
                    onChange={(e) => setFormVenta({ ...formVenta, otroMedioPago: e.target.value })}
                    className="w-full p-2 border border-indigo-400 bg-indigo-50/50 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Estado de Pago</label>
                  <select 
                    value={formVenta.pagado}
                    onChange={(e) => setFormVenta({ ...formVenta, pagado: e.target.value === 'true' })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  >
                    <option value="true">Pagado</option>
                    <option value="false">Pendiente (Fiado)</option>
                  </select>
                </div>
              )}

              <button 
                type="submit"
                className="w-full bg-indigo-600 text-white font-semibold p-2 rounded-lg hover:bg-indigo-700 transition"
              >
                Guardar Venta
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 print:mb-4">
            <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm print-card">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                <h2 className="text-lg font-bold text-slate-800">Registro de Ventas del Día</h2>
                <div className="no-print flex items-center gap-2 flex-wrap">
                  <button 
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-900 transition text-xs font-semibold shadow"
                  >
                    <Printer size={14} /> Generar Cierre (PDF)
                  </button>
                  <button 
                    onClick={handleBorrarVentasPagadas}
                    className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition text-xs font-semibold shadow"
                  >
                    <Trash2 size={14} /> Limpiar Ventas Pagadas
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="p-3">Cliente</th>
                      <th className="p-3">Producto</th>
                      <th className="p-3">Sabor</th>
                      <th className="p-3">Medio Pago</th>
                      <th className="p-3">Total</th>
                      <th className="p-3">Ganancia</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3 text-center no-print">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventas.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="text-center p-4 text-slate-400">No hay ventas registradas aún.</td>
                      </tr>
                    ) : (
                      ventas.map((v) => (
                        <tr 
                          key={v.id} 
                          className={`border-b border-slate-100 transition ${
                            v.pagado ? 'bg-emerald-50/60' : 'bg-red-50/80'
                          }`}
                        >
                          <td className="p-3 font-medium">{v.cliente}</td>
                          <td className="p-3">{v.producto} (x{v.cantidad})</td>
                          <td className="p-3 text-xs text-slate-500 font-medium">{v.variante || 'General'}</td>
                          <td className="p-3">
                            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-semibold border border-slate-200">
                              <CreditCard size={12} /> {v.medioPago}
                            </span>
                          </td>
                          <td className="p-3 font-bold">${v.total}</td>
                          <td className="p-3 text-emerald-700 font-semibold">${v.ganancia}</td>
                          <td className="p-3">
                            <button 
                              onClick={() => togglePago(v.id, v.pagado)}
                              className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 no-print ${
                                v.pagado ? 'bg-emerald-200 text-emerald-800' : 'bg-red-200 text-red-800'
                              }`}
                            >
                              {v.pagado ? <CheckCircle size={14} /> : <XCircle size={14} />}
                              {v.pagado ? 'Pagado' : 'Pendiente'}
                            </button>
                            <span className="print-only text-xs font-semibold">
                              {v.pagado ? 'Pagado' : 'Pendiente'}
                            </span>
                          </td>
                          <td className="p-3 text-center no-print">
                            <button 
                              onClick={() => eliminarVenta(v.id)} 
                              className="text-red-500 hover:text-red-700 p-1 rounded"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm print-card lg:col-span-1 no-print">
              <h2 className="text-base font-bold mb-3 text-slate-800">Estado Rápido de Stock</h2>
              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {productos.map((p) => {
                  const stockTotal = getStockTotalProducto(p.lotes);
                  const proxVenc = getProximoVencimientoProducto(p.lotes);
                  return (
                    <div 
                      key={p.id} 
                      className={`p-2.5 rounded-lg border flex justify-between items-center text-xs ${
                        stockTotal <= 0
                          ? 'bg-red-50 border-red-300 text-red-900 font-bold'
                          : stockTotal <= 3 
                          ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold' 
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div>
                        <p className="text-slate-900 font-medium">{p.nombre}</p>
                        <p className="opacity-80">Próx. Vence: {proxVenc}</p>
                      </div>
                      <span className="font-bold text-sm">
                        {stockTotal <= 0 ? '❌ 0' : `${stockTotal} un.`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print-grid">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm print-card">
              <h3 className="text-sm font-bold mb-3 text-slate-800">Ventas Acumuladas ($)</h3>
              <div className="h-48 md:h-56 print:h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={datosVentasSemanales}>
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="ventas" stroke="#4f46e5" strokeWidth={2.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm print-card">
              <h3 className="text-sm font-bold mb-3 text-slate-800">Productos más Vendidos (Unidades)</h3>
              <div className="h-48 md:h-56 print:h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosProductosMasVendidos}>
                    <XAxis dataKey="nombre" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="unidades" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== PESTAÑA ESTADO DE CUENTA ==================== */}
      {pestana === 'estado_cuenta' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-indigo-900 to-indigo-700 text-white p-5 rounded-xl shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs uppercase font-semibold text-indigo-200">Efectivo Total en Caja (Vivo)</p>
                <Wallet size={20} className="text-indigo-300" />
              </div>
              <h3 className="text-2xl md:text-3xl font-extrabold">${efectivoTotalEnCaja.toLocaleString()}</h3>
              <p className="text-xs text-indigo-200 mt-2">
                Base ({cajaInicial.toLocaleString()}) + Ventas Efectivo ({totalVentasEfectivoCobrado.toLocaleString()}) - Gastos ({totalGastosRegistrados.toLocaleString()})
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase">Recuperación Reposiciones (Punto Cero)</p>
                <RefreshCw size={20} className="text-indigo-600" />
              </div>
              <h3 className={`text-2xl md:text-3xl font-extrabold ${estadoPuntoCeroReposicion >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                ${estadoPuntoCeroReposicion.toLocaleString()}
              </h3>
              <p className="text-xs text-slate-500 mt-2">
                {estadoPuntoCeroReposicion < 0 
                  ? `Falta por recuperar $${Math.abs(estadoPuntoCeroReposicion).toLocaleString()} para quedar en $0.`
                  : estadoPuntoCeroReposicion === 0
                  ? '¡Punto de equilibrio alcanzado! ($0 en saldo de reposición).'
                  : `¡Ganancia neta sobre reposición: +$${estadoPuntoCeroReposicion.toLocaleString()}!`}
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase">Gastos Totales Registrados</p>
                <TrendingDown size={20} className="text-red-500" />
              </div>
              <h3 className="text-2xl md:text-3xl font-extrabold text-red-600">${totalGastosRegistrados.toLocaleString()}</h3>
              <p className="text-xs text-slate-500 mt-2">
                Incluye proveedores (${gastosEnReposiciones.toLocaleString()}) y otros egresos.
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
              <DollarSign size={18} className="text-emerald-600" /> Ajustar Efectivo Base No Registrado
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Ingresa la cantidad de dinero acumulado físicamente que no se había registrado previamente.
            </p>
            <form onSubmit={handleGuardarEfectivoBase} className="flex gap-3 max-w-md">
              <input 
                type="number" 
                required
                min="0"
                placeholder={`Actual: $${cajaInicial}`}
                value={nuevoEfectivoBaseInput}
                onChange={(e) => setNuevoEfectivoBaseInput(e.target.value)}
                className="flex-1 p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <button 
                type="submit" 
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg transition text-sm flex items-center gap-1"
              >
                <Save size={16} /> Guardar Base
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                <PlusCircle size={18} className="text-red-600" /> Registrar Nuevo Gasto
              </h2>
              <form onSubmit={handleAgregarGasto} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Concepto / Nombre</label>
                  <input 
                    type="text"
                    required
                    placeholder="Ej. Pago Proveedor Bebidas"
                    value={formGasto.concepto}
                    onChange={(e) => setFormGasto({ ...formGasto, concepto: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Monto ($)</label>
                  <input 
                    type="number"
                    required
                    min="1"
                    placeholder="Ej. 50000"
                    value={formGasto.monto}
                    onChange={(e) => setFormGasto({ ...formGasto, monto: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Gasto</label>
                  <select 
                    value={formGasto.tipo}
                    onChange={(e) => setFormGasto({ ...formGasto, tipo: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium"
                  >
                    <option value="Proveedor">Proveedor (Reposición Stock)</option>
                    <option value="Compra Productos">Compra Productos</option>
                    <option value="Servicios / Operativo">Servicios / Operativo</option>
                    <option value="Otro">Otro Gasto</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Detalle / Observaciones</label>
                  <textarea 
                    rows="2"
                    placeholder="Detalles adicionales..."
                    value={formGasto.detalle}
                    onChange={(e) => setFormGasto({ ...formGasto, detalle: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold p-2 rounded-lg transition text-sm"
                >
                  Guardar Gasto
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-base font-bold text-slate-800 mb-4">Historial de Gastos y Salidas de Dinero</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Concepto</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Monto</th>
                      <th className="p-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gastos.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center p-4 text-slate-400">No se han registrado gastos aún.</td>
                      </tr>
                    ) : (
                      gastos.map((g) => (
                        <tr key={g.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3 text-slate-500 text-xs">{g.fecha}</td>
                          <td className="p-3 font-medium text-slate-900">{g.concepto}</td>
                          <td className="p-3">
                            <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-xs font-medium border border-red-100">
                              {g.tipo}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-red-600">-${g.monto.toLocaleString()}</td>
                          <td className="p-3 text-center">
                            <button 
                              onClick={() => eliminarGasto(g.id)}
                              className="text-red-500 hover:text-red-700 p-1 rounded"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PESTAÑA INVENTARIO ==================== */}
      {pestana === 'inventario' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="no-print bg-white p-5 rounded-xl border border-slate-200 shadow-sm h-fit">
            <h2 className="text-lg font-bold mb-4 text-slate-800 flex items-center gap-2">
              <PlusCircle size={20} className="text-indigo-600" /> Registrar Mercancía / Lote
            </h2>
            <form onSubmit={handleGuardarProducto} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Seleccionar Producto</label>
                <select 
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formProducto.productoId}
                  onChange={(e) => setFormProducto({ ...formProducto, productoId: e.target.value })}
                >
                  <option value="">-- Crear Nuevo Producto Base --</option>
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>Añadir Lote a: {p.nombre}</option>
                  ))}
                </select>
              </div>

              {!formProducto.productoId && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del Producto Base</label>
                    <input 
                      type="text" 
                      placeholder="Ej. Mr Tea"
                      value={formProducto.nombre}
                      onChange={(e) => setFormProducto({ ...formProducto, nombre: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Categoría</label>
                    <select
                      value={formProducto.categoria}
                      onChange={(e) => setFormProducto({ ...formProducto, categoria: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      <option value="">Seleccionar Categoría...</option>
                      {categorias.map(cat => (
                        <option key={cat.id} value={cat.nombre}>{cat.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Costo Proveedor ($)</label>
                      <input 
                        type="number" 
                        min="0"
                        placeholder="3000"
                        value={formProducto.costo}
                        onChange={(e) => setFormProducto({ ...formProducto, costo: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Precio Venta ($)</label>
                      <input 
                        type="number" 
                        min="0"
                        placeholder="4200"
                        value={formProducto.precio}
                        onChange={(e) => setFormProducto({ ...formProducto, precio: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="border-t border-slate-200 pt-3">
                <p className="text-xs font-bold text-indigo-600 uppercase mb-2">Detalles del Lote / Sabor</p>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Sabor / Variante</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ej. Limonada, Durazno, Original..."
                    value={formProducto.variante}
                    onChange={(e) => setFormProducto({ ...formProducto, variante: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Cantidad</label>
                    <input 
                      type="number" 
                      required
                      min="1"
                      placeholder="10"
                      value={formProducto.cantidad}
                      onChange={(e) => setFormProducto({ ...formProducto, cantidad: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha Vencimiento</label>
                    <input 
                      type="date" 
                      required
                      value={formProducto.vencimiento}
                      onChange={(e) => setFormProducto({ ...formProducto, vencimiento: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <button 
                type="submit"
                className="w-full bg-indigo-600 text-white font-semibold p-2.5 rounded-lg hover:bg-indigo-700 transition text-sm mt-2"
              >
                {formProducto.productoId ? 'Añadir Lote al Producto' : 'Guardar Nuevo Producto'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold mb-4 text-slate-800">Inventario de Productos y Lotes Desplegables</h2>
            <p className="text-xs text-slate-500 mb-3">Haz clic en la flecha para desplegar las fechas de vencimiento y sabores de cada producto.</p>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse min-w-[550px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="p-3 w-8"></th>
                    <th className="p-3">Producto</th>
                    <th className="p-3">Categoría</th>
                    <th className="p-3">Costo</th>
                    <th className="p-3">Precio</th>
                    <th className="p-3">Stock Total</th>
                    <th className="p-3">Próx. Vencimiento</th>
                    <th className="p-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center p-4 text-slate-400">No hay productos en inventario.</td>
                    </tr>
                  ) : (
                    productos.map((p) => {
                      const stockTotal = getStockTotalProducto(p.lotes);
                      const proxVenc = getProximoVencimientoProducto(p.lotes);
                      const estaExpandido = productoExpandidoId === p.id;

                      return (
                        <React.Fragment key={p.id}>
                          <tr 
                            onClick={() => setProductoExpandidoId(estaExpandido ? null : p.id)}
                            className="border-b border-slate-100 hover:bg-indigo-50/40 cursor-pointer transition"
                          >
                            <td className="p-3 text-slate-400">
                              {estaExpandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </td>
                            <td className="p-3 font-semibold text-slate-900">{p.nombre}</td>
                            <td className="p-3">
                              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs border border-slate-200 font-medium">
                                {p.categoria || 'Sin categoría'}
                              </span>
                            </td>
                            <td className="p-3 text-slate-600">${p.costo}</td>
                            <td className="p-3 font-bold text-slate-900">${p.precio}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                stockTotal <= 0 ? 'bg-red-100 text-red-800' : stockTotal <= 3 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {stockTotal <= 0 ? 'Agotado (0)' : `${stockTotal} un.`}
                              </span>
                            </td>
                            <td className="p-3 text-slate-600 text-xs font-medium">{proxVenc}</td>
                            <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <button 
                                onClick={() => eliminarProductoCompleto(p.id)}
                                className="text-red-500 hover:text-red-700 p-1 rounded"
                                title="Eliminar producto completo"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>

                          {/* Sub-tabla desplegable de variantes y lotes */}
                          {estaExpandido && (
                            <tr className="bg-slate-50/90 border-b border-indigo-100">
                              <td colSpan="8" className="p-4">
                                <div className="text-xs font-bold text-slate-500 uppercase mb-2">Sabores / Lotes Registrados:</div>
                                <div className="space-y-1.5">
                                  {(!p.lotes || p.lotes.length === 0) ? (
                                    <p className="text-xs text-slate-400 italic">No hay lotes activos para este producto.</p>
                                  ) : (
                                    p.lotes.map((lote) => (
                                      <div key={lote.id} className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200 text-xs shadow-sm">
                                        <div className="flex items-center gap-4 flex-wrap">
                                          <span className="font-bold text-slate-800">📦 {lote.variante || 'General'}</span>
                                          <span className="text-slate-600">Stock: <strong>{lote.cantidad} un.</strong></span>
                                          <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                                            Vence: {lote.vencimiento}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <button 
                                            onClick={() => handleEditarLote(p.id, lote.id)}
                                            className="text-amber-600 hover:text-amber-800 p-1.5 rounded hover:bg-amber-50"
                                            title="Editar este lote"
                                          >
                                            <Edit2 size={15} />
                                          </button>
                                          <button 
                                            onClick={() => handleEliminarLote(p.id, lote.id)}
                                            className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50"
                                            title="Eliminar este lote"
                                          >
                                            <Trash2 size={15} />
                                          </button>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PESTAÑA CATEGORÍAS ==================== */}
      {pestana === 'categorias' && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold mb-4 text-slate-800 flex items-center gap-2">
              <Tag size={20} className="text-indigo-600" /> Nueva Categoría
            </h2>
            <form onSubmit={handleAgregarCategoria} className="flex gap-2">
              <input 
                type="text"
                placeholder="Nombre de la categoría (ej. Bebidas, Snacks, Galletas)"
                value={nuevaCategoria}
                onChange={(e) => setNuevaCategoria(e.target.value)}
                className="flex-1 p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <button 
                type="submit"
                className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
              >
                Agregar
              </button>
            </form>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold mb-4 text-slate-800">Categorías Existentes</h2>
            <ul className="divide-y divide-slate-100">
              {categorias.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">No se han creado categorías aún.</p>
              ) : (
                categorias.map((cat) => (
                  <li key={cat.id} className="flex justify-between items-center py-3">
                    <span className="font-medium text-slate-800 text-sm">{cat.nombre}</span>
                    <button
                      onClick={() => eliminarCategoria(cat.id)}
                      className="text-red-500 hover:text-red-700 p-1 rounded transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}

      {/* ==================== PESTAÑA CARTA DE PRODUCTOS ==================== */}
      {pestana === 'catalogo' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-xl font-bold mb-6 text-slate-900 text-center">Menú de Productos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {productos.map((p) => {
              const stockTotal = getStockTotalProducto(p.lotes);
              return (
                <div key={p.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-slate-900">{p.nombre}</h3>
                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium border border-indigo-100">
                      {p.categoria || 'General'}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-indigo-600">${p.precio}</p>
                    <p className="text-xs text-slate-500">{stockTotal > 0 ? `Disponible: ${stockTotal}` : 'Agotado'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}