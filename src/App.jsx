import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc 
} from 'firebase/firestore';
import { db } from './firebase';
import { enviarMensajeTelegram, obtenerUltimosMensajesTelegram } from './telegram';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line 
} from 'recharts';
import { 
  CheckCircle, XCircle, FileText, PlusCircle, Trash2, ShoppingBag, 
  Package, DollarSign, CreditCard, Send, BookOpen, AlertTriangle, Tag,
  Edit2, ChevronDown, ChevronUp, Save, X
} from 'lucide-react';

export default function App() {
  const [pestana, setPestana] = useState('ventas');
  const [productos, setProductos] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Estado para expandir detalle individual en la tabla de productos
  const [productoExpandidoId, setProductoExpandidoId] = useState(null);

  // Estado para editar un producto existente
  const [editandoProductoId, setEditandoProductoId] = useState(null);

  // Referencias para listener de Telegram
  const productosRef = useRef(productos);
  const ventasRef = useRef(ventas);

  useEffect(() => { productosRef.current = productos; }, [productos]);
  useEffect(() => { ventasRef.current = ventas; }, [ventas]);

  // Escuchar Firestore en tiempo real
  useEffect(() => {
    const unsubProductos = onSnapshot(collection(db, 'productos'), (snapshot) => {
      const listaProds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProductos(listaProds);
    });

    const unsubVentas = onSnapshot(collection(db, 'ventas'), (snapshot) => {
      const listaVentas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setVentas(listaVentas.sort((a, b) => b.id - a.id));
      setCargando(false);
    });

    const unsubCategorias = onSnapshot(collection(db, 'categorias'), (snapshot) => {
      const listaCats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategorias(listaCats);
    });

    return () => {
      unsubProductos();
      unsubVentas();
      unsubCategorias();
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
    cliente: '',
    productoId: '',
    cantidad: 1,
    pagado: true,
    medioPago: 'Efectivo',
    otroMedioPago: ''
  });

  const [formProducto, setFormProducto] = useState({
    nombre: '',
    costo: '',
    precio: '',
    stock: '',
    vencimiento: '',
    categoria: '',
    descripcion: ''
  });

  const [nuevaCategoria, setNuevaCategoria] = useState('');

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
    const agotados = prods.filter(p => p.stock <= 0);
    const porAgotarse = prods.filter(p => p.stock > 0 && p.stock <= 3);

    if (agotados.length === 0 && porAgotarse.length === 0) {
      return await enviarMensajeTelegram("✅ <b>Estado del Inventario:</b> Todo el inventario está en niveles óptimos. No hay productos por reponer.");
    }

    let textoAlerta = `🚨 <b>REPORTE DE PRODUCTOS A REPONER</b> 🚨\n\n`;

    if (agotados.length > 0) {
      textoAlerta += `❌ <b>PRODUCTOS AGOTADOS (Stock 0):</b>\n`;
      agotados.forEach(p => {
        textoAlerta += `• <b>${p.nombre}</b> (Vencimiento: ${p.vencimiento})\n`;
      });
      textoAlerta += `\n`;
    }

    if (porAgotarse.length > 0) {
      textoAlerta += `⚠️ <b>POCOS EN STOCK (3 o menos):</b>\n`;
      porAgotarse.forEach(p => {
        textoAlerta += `• <b>${p.nombre}</b>: Quedan ${p.stock} unidades\n`;
      });
      textoAlerta += `\n`;
    }

    textoAlerta += `🛒 <i>Por favor realizar pedido de compras.</i>`;

    return await enviarMensajeTelegram(textoAlerta);
  };

  // Handlers
  const handleAgregarVenta = async (e) => {
    e.preventDefault();
    const prod = productos.find(p => p.id === formVenta.productoId);
    if (!prod) return alert("Selecciona un producto válido.");

    const cantidad = Number(formVenta.cantidad);

    if (prod.stock <= 0) {
      return alert(`❌ No se puede realizar la venta: El producto "${prod.nombre}" está totalmente agotado.`);
    }

    if (cantidad > prod.stock) {
      return alert(`❌ Stock insuficiente: Solo quedan ${prod.stock} unidades de "${prod.nombre}" disponibles.`);
    }

    const total = prod.precio * cantidad;
    const costoTotal = prod.costo * cantidad;
    const ganancia = total - costoTotal;

    const medioPagoFinal = formVenta.medioPago === 'Otro' 
      ? (formVenta.otroMedioPago.trim() || 'Otro') 
      : formVenta.medioPago;

    try {
      await addDoc(collection(db, 'ventas'), {
        fecha: new Date().toISOString().split('T')[0],
        cliente: formVenta.cliente || 'Cliente General',
        producto: prod.nombre,
        cantidad,
        total,
        costoTotal,
        ganancia,
        pagado: formVenta.pagado,
        medioPago: medioPagoFinal,
        creadoEn: Date.now()
      });

      const nuevoStock = prod.stock - cantidad;
      await updateDoc(doc(db, 'productos', prod.id), { stock: Math.max(0, nuevoStock) });

      if (nuevoStock <= 3) {
        const estadoTexto = nuevoStock === 0 ? "❌ <b>TOTALMENTE AGOTADO</b>" : `⚠️ <b>QUEDAN SOLO ${nuevoStock} UNIDADES</b>`;
        const mensajeAlerta = 
          `🚨 <b>ALERTA DE REPOSICIÓN DE INVENTARIO</b> 🚨\n\n` +
          `📦 Producto: <b>${prod.nombre}</b>\n` +
          `📊 Estado: ${estadoTexto}\n` +
          `🔔 <i>Por favor coordinar compra / reposición con proveedores.</i>`;
        
        enviarMensajeTelegram(mensajeAlerta);
      }

      setFormVenta({ cliente: '', productoId: '', cantidad: 1, pagado: true, medioPago: 'Efectivo', otroMedioPago: '' });
    } catch (error) {
      alert("Error al registrar la venta: " + error.message);
    }
  };

  // Crear o Editar Producto
  const handleGuardarProducto = async (e) => {
    e.preventDefault();
    try {
      const datosProd = {
        nombre: formProducto.nombre,
        costo: Number(formProducto.costo),
        precio: Number(formProducto.precio),
        stock: Number(formProducto.stock),
        vencimiento: formProducto.vencimiento,
        categoria: formProducto.categoria || 'Sin categoría',
        descripcion: formProducto.descripcion || 'Sin descripción'
      };

      if (editandoProductoId) {
        await updateDoc(doc(db, 'productos', editandoProductoId), datosProd);
        setEditandoProductoId(null);
      } else {
        await addDoc(collection(db, 'productos'), datosProd);
      }

      setFormProducto({ nombre: '', costo: '', precio: '', stock: '', vencimiento: '', categoria: '', descripcion: '' });
    } catch (error) {
      alert("Error al guardar producto: " + error.message);
    }
  };

  const iniciarEdicion = (prod) => {
    setEditandoProductoId(prod.id);
    setFormProducto({
      nombre: prod.nombre,
      costo: prod.costo,
      precio: prod.precio,
      stock: prod.stock,
      vencimiento: prod.vencimiento,
      categoria: prod.categoria || '',
      descripcion: prod.descripcion || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelarEdicion = () => {
    setEditandoProductoId(null);
    setFormProducto({ nombre: '', costo: '', precio: '', stock: '', vencimiento: '', categoria: '', descripcion: '' });
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
    if (confirm("¿Eliminar esta categoría?")) {
      await deleteDoc(doc(db, 'categorias', id));
    }
  };

  const eliminarProducto = async (id) => {
    if (confirm("¿Eliminar este producto del inventario?")) {
      await deleteDoc(doc(db, 'productos', id));
    }
  };

  const togglePago = async (id, estadoActual) => {
    await updateDoc(doc(db, 'ventas', id), { pagado: !estadoActual });
  };

  const eliminarVenta = async (id) => {
    if (confirm("¿Eliminar esta venta?")) {
      await deleteDoc(doc(db, 'ventas', id));
    }
  };

  // Cuentas financieras
  const ventasPagadas = ventas.filter(v => v.pagado);
  const totalIngresosDia = ventasPagadas.reduce((acc, v) => acc + v.total, 0);
  const totalReposicionDia = ventasPagadas.reduce((acc, v) => acc + v.costoTotal, 0);
  const gananciaBrutaDia = ventasPagadas.reduce((acc, v) => acc + v.ganancia, 0);

  const fondoAhorro = gananciaBrutaDia * 0.15;
  const gananciaRepartible = gananciaBrutaDia - fondoAhorro;
  const salarioPorSocio = gananciaRepartible / 3;

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

  // Datos para gráficos
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

  const gananciaUnitariaPrev = (Number(formProducto.precio) || 0) - (Number(formProducto.costo) || 0);

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
          .print-card { border: 1px solid #e2e8f0 !important; box-shadow: none !important; break-inside: avoid; }
          .print-grid { display: grid !important; grid-template-cols: repeat(2, minmax(0, 1fr)) !important; gap: 12px !important; }
        }
      `}</style>

      {/* Encabezado Principal */}
      <header className="mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col lg:flex-row justify-between items-center gap-4 print-card print:mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Informe de Cierre y Ventas</h1>
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
            <BookOpen size={16} /> Carta de Productos
          </button>
        </div>

        {/* Botones de acción Telegram / PDF */}
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
            onClick={() => window.print()}
            className="flex items-center gap-1.5 bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-900 transition shadow text-xs md:text-sm font-semibold"
          >
            <FileText size={16} /> Exportar PDF
          </button>
        </div>
      </header>

      {/* ==================== PESTAÑA VENTAS ==================== */}
      {pestana === 'ventas' && (
        <>
          {/* Tarjetas resumen */}
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

          {/* Formulario Registrar Venta */}
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
                  {productos.map((p) => (
                    <option 
                      key={p.id} 
                      value={p.id}
                      disabled={p.stock <= 0}
                    >
                      {p.precio === 0 ? '🎁 [REGALO] ' : ''}
                      {p.nombre} — ${p.precio} (Stock: {p.stock})
                    </option>
                  ))}
                </select>
              </div>

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

          {/* Tabla de ventas y lateral de inventario rápido */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 print:mb-4">
            <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm no-print">
              <h2 className="text-lg font-bold mb-4 text-slate-800">Registro de Ventas del Día</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="p-3">Cliente</th>
                      <th className="p-3">Producto</th>
                      <th className="p-3">Medio Pago</th>
                      <th className="p-3">Total</th>
                      <th className="p-3">Ganancia</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventas.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center p-4 text-slate-400">No hay ventas registradas aún.</td>
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
                              className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${
                                v.pagado ? 'bg-emerald-200 text-emerald-800' : 'bg-red-200 text-red-800'
                              }`}
                            >
                              {v.pagado ? <CheckCircle size={14} /> : <XCircle size={14} />}
                              {v.pagado ? 'Pagado' : 'Pendiente'}
                            </button>
                          </td>
                          <td className="p-3 text-center">
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

            {/* Lateral Resumen Stock */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm print-card lg:col-span-1">
              <h2 className="text-base font-bold mb-3 text-slate-800">Estado Rápido de Stock</h2>
              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {productos.map((p) => (
                  <div 
                    key={p.id} 
                    className={`p-2.5 rounded-lg border flex justify-between items-center text-xs ${
                      p.stock <= 0
                        ? 'bg-red-50 border-red-300 text-red-900 font-bold'
                        : p.stock <= 3 
                        ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold' 
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div>
                      <p className="text-slate-900 font-medium">{p.nombre}</p>
                      <p className="opacity-80">Vence: {p.vencimiento || 'N/A'}</p>
                    </div>
                    <span className="font-bold text-sm">
                      {p.stock <= 0 ? '❌ 0' : `${p.stock} un.`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Gráficos */}
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

      {/* ==================== PESTAÑA INVENTARIO ==================== */}
      {pestana === 'inventario' && (
        <>
          {/* Formulario Crear / Editar Producto */}
          <div className="no-print bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                {editandoProductoId ? <Edit2 size={20} className="text-amber-600" /> : <PlusCircle size={20} className="text-indigo-600" />}
                {editandoProductoId ? 'Editar Producto Seleccionado' : 'Registrar Nuevo Producto / Lote'}
              </h2>
              {editandoProductoId && (
                <button 
                  onClick={cancelarEdicion}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 bg-slate-100 px-2 py-1 rounded-md"
                >
                  <X size={14} /> Cancelar edición
                </button>
              )}
            </div>

            <form onSubmit={handleGuardarProducto} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej. Jugo de Mora"
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

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Costo Proveedor ($)</label>
                <input 
                  type="number" 
                  required
                  min="0"
                  placeholder="1000"
                  value={formProducto.costo}
                  onChange={(e) => setFormProducto({ ...formProducto, costo: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Precio Venta ($)</label>
                <input 
                  type="number" 
                  required
                  min="0"
                  placeholder="2500"
                  value={formProducto.precio}
                  onChange={(e) => setFormProducto({ ...formProducto, precio: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Stock</label>
                <input 
                  type="number" 
                  required
                  min="0"
                  placeholder="20"
                  value={formProducto.stock}
                  onChange={(e) => setFormProducto({ ...formProducto, stock: e.target.value })}
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

              <div className="md:col-span-3 lg:col-span-6 flex gap-2">
                <button 
                  type="submit"
                  className={`flex-1 font-semibold p-2.5 rounded-lg transition text-white flex justify-center items-center gap-2 ${
                    editandoProductoId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {editandoProductoId ? <Save size={18} /> : <PlusCircle size={18} />}
                  {editandoProductoId ? 'Guardar Cambios del Producto' : 'Guardar Producto'}
                </button>
              </div>
            </form>

            {formProducto.costo && formProducto.precio && (
              <div className="mt-3 p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-800 flex items-center gap-2">
                <DollarSign size={14} />
                <span>Ganancia estimada por unidad: <strong>${gananciaUnitariaPrev.toLocaleString()}</strong></span>
              </div>
            )}
          </div>

          {/* Tabla Desplegable de Inventario */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold mb-4 text-slate-800">Inventario de Productos y Lotes</h2>
            <p className="text-xs text-slate-500 mb-3">Haz clic sobre cualquier fila para desplegar y ver los detalles individuales del producto.</p>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="p-3 w-8"></th>
                    <th className="p-3">Nombre</th>
                    <th className="p-3">Categoría</th>
                    <th className="p-3">Costo</th>
                    <th className="p-3">Precio</th>
                    <th className="p-3">Stock</th>
                    <th className="p-3">Vencimiento</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center p-4 text-slate-400">No hay productos en el inventario.</td>
                    </tr>
                  ) : (
                    productos.map((p) => {
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
                                p.stock <= 0 ? 'bg-red-100 text-red-800' : p.stock <= 3 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {p.stock <= 0 ? 'Agotado (0)' : `${p.stock} un.`}
                              </span>
                            </td>
                            <td className="p-3 text-slate-600">{p.vencimiento}</td>
                            <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-center items-center gap-1">
                                <button 
                                  onClick={() => iniciarEdicion(p)}
                                  className="text-amber-600 hover:text-amber-800 p-1.5 rounded hover:bg-amber-50"
                                  title="Editar este producto"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button 
                                  onClick={() => eliminarProducto(p.id)}
                                  className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50"
                                  title="Eliminar este producto"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Fila desplegable con detalle individual */}
                          {estaExpandido && (
                            <tr className="bg-slate-50/90 border-b border-indigo-100">
                              <td colSpan="8" className="p-4">
                                <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-inner grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                                  <div>
                                    <p className="text-slate-400 font-medium">Nombre Completo</p>
                                    <p className="font-bold text-slate-800 text-sm">{p.nombre}</p>
                                  </div>
                                  <div>
                                    <p className="text-slate-400 font-medium">Margen Ganancia Unitaria</p>
                                    <p className="font-bold text-emerald-600 text-sm">${p.precio - p.costo}</p>
                                  </div>
                                  <div>
                                    <p className="text-slate-400 font-medium">Valor Total Inventario</p>
                                    <p className="font-bold text-indigo-600 text-sm">${p.precio * p.stock}</p>
                                  </div>
                                  <div>
                                    <p className="text-slate-400 font-medium">Fecha de Vencimiento</p>
                                    <p className="font-semibold text-slate-700">{p.vencimiento || 'No registrada'}</p>
                                  </div>
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
        </>
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
            {productos.map((p) => (
              <div key={p.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-900">{p.nombre}</h3>
                  <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium border border-indigo-100">
                    {p.categoria || 'General'}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-indigo-600">${p.precio}</p>
                  <p className="text-xs text-slate-500">{p.stock > 0 ? `Disponible: ${p.stock}` : 'Agotado'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}