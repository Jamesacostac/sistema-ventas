import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc 
} from 'firebase/firestore';
import { db } from './firebase';
import { enviarMensajeTelegram, obtenerUltimosMensajesTelegram } from './telegram';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line 
} from 'recharts';
import { CheckCircle, XCircle, FileText, PlusCircle, Trash2, ShoppingBag, Package, DollarSign, CreditCard, Send, Coffee, Gift, BookOpen, AlertTriangle } from 'lucide-react';

export default function App() {
  const [pestana, setPestana] = useState('ventas');
  const [productos, setProductos] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Referencias mutables para el listener de Telegram
  const productosRef = useRef(productos);
  const ventasRef = useRef(ventas);

  useEffect(() => {
    productosRef.current = productos;
  }, [productos]);

  useEffect(() => {
    ventasRef.current = ventas;
  }, [ventas]);

  // Escuchar cambios en Firestore en tiempo real
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

    return () => {
      unsubProductos();
      unsubVentas();
    };
  }, []);

  // Listener de Telegram para responder solicitudes de los socios en chat
  useEffect(() => {
    const intervalo = setInterval(async () => {
      const mensajes = await obtenerUltimosMensajesTelegram();
      if (!mensajes || mensajes.length === 0) return;

      for (const update of mensajes) {
        if (!update.message || !update.message.text) continue;

        const texto = update.message.text.trim().toLowerCase();

        // Si piden reporte o ventas
        if (texto.includes('reporte') || texto.includes('ventas') || texto.includes('cierre')) {
          generarYEnviarReporteCierre(ventasRef.current);
        } 
        // Si piden agotados, stock o faltantes
        else if (texto.includes('agotad') || texto.includes('stock') || texto.includes('faltan') || texto.includes('reponer')) {
          generarYEnviarAlertaStock(productosRef.current);
        }
      }
    }, 5000); // Consulta la API de Telegram cada 5 segundos

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
    descripcion: ''
  });

  // Generadores de reportes aislados para reuso
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
      const prodRef = doc(db, 'productos', prod.id);
      await updateDoc(prodRef, {
        stock: Math.max(0, nuevoStock)
      });

      if (nuevoStock <= 3) {
        const estadoTexto = nuevoStock === 0 ? "❌ <b>TOTALMENTE AGOTADO</b>" : `⚠️ <b>QUEDAN SOLO ${nuevoStock} UNIDADES</b>`;
        const mensajeAlerta = 
          `🚨 <b>ALERTA DE REPOSICIÓN DE INVENTARIO</b> 🚨\n\n` +
          `📦 Producto: <b>${prod.nombre}</b>\n` +
          `📊 Estado: ${estadoTexto}\n` +
          `🔔 <i>Por favor coordinar compra / reposición con proveedores.</i>`;
        
        enviarMensajeTelegram(mensajeAlerta);
      }

      setFormVenta({ 
        cliente: '', 
        productoId: '', 
        cantidad: 1, 
        pagado: true, 
        medioPago: 'Efectivo', 
        otroMedioPago: '' 
      });
    } catch (error) {
      alert("Error al registrar la venta: " + error.message);
    }
  };

  const handleAgregarProducto = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'productos'), {
        nombre: formProducto.nombre,
        costo: Number(formProducto.costo),
        precio: Number(formProducto.precio),
        stock: Number(formProducto.stock),
        vencimiento: formProducto.vencimiento,
        descripcion: formProducto.descripcion || 'Sin descripción'
      });

      setFormProducto({ nombre: '', costo: '', precio: '', stock: '', vencimiento: '', descripcion: '' });
    } catch (error) {
      alert("Error al agregar producto: " + error.message);
    }
  };

  const eliminarProducto = async (id) => {
    if (confirm("¿Eliminar este producto?")) {
      await deleteDoc(doc(db, 'productos', id));
    }
  };

  const togglePago = async (id, estadoActual) => {
    await updateDoc(doc(db, 'ventas', id), {
      pagado: !estadoActual
    });
  };

  const eliminarVenta = async (id) => {
    if (confirm("¿Eliminar esta venta?")) {
      await deleteDoc(doc(db, 'ventas', id));
    }
  };

  // Cálculos Financieros para Vista
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

  // Gráficas
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

      {/* Encabezado */}
      <header className="mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 print-card print:mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Informe de Cierre y Ventas</h1>
          <p className="text-xs md:text-sm text-slate-500">
            Comestibles — Fecha: {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Pestañas de navegación */}
        <div className="flex items-center gap-2 no-print bg-slate-100 p-1.5 rounded-xl border border-slate-200">
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
            onClick={() => setPestana('catalogo')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs md:text-sm transition ${
              pestana === 'catalogo' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen size={16} /> Carta de Productos
          </button>
        </div>

        {/* Botones de acción Telegram y PDF */}
        <div className="flex items-center gap-2 no-print flex-wrap justify-end">
          <button 
            onClick={handleEnviarAlertaStockTelegram}
            className="flex items-center gap-1.5 bg-amber-500 text-white px-3 py-2 rounded-lg hover:bg-amber-600 transition shadow text-xs md:text-sm font-semibold"
            title="Enviar informe a Telegram de los productos agotados o con poco stock"
          >
            <AlertTriangle size={16} /> Alertar Stock Bajo
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
            <form onSubmit={handleAgregarVenta} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">Producto / Degustación</label>
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
                      {p.nombre} (${p.precio}) - {p.stock > 0 ? `Stock: ${p.stock}` : '(AGOTADO)'}
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
                    <option value="true">Pagado (Al Contado / Gratis)</option>
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
            <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm no-print">
              <h2 className="text-lg font-bold mb-4 text-slate-800">Registro de Ventas del Día</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="p-3">Cliente</th>
                      <th className="p-3">Producto</th>
                      <th className="p-3">Medio Pago</th>
                      <th className="p-3">Total</th>
                      <th className="p-3">Ganancia</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventas.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center p-4 text-slate-400">No hay ventas registradas en la nube.</td>
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
                          <td className="p-3">
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

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm print-card lg:col-span-1">
              <h2 className="text-base font-bold mb-3 text-slate-800">Estado de Inventario</h2>
              <div className="space-y-2">
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
                      <p className="text-slate-900">{p.nombre}</p>
                      <p className="opacity-80">
                        {p.stock <= 0 ? '❌ AGOTADO' : `Stock: ${p.stock}`} | Vence: {p.vencimiento}
                      </p>
                    </div>
                  </div>
                ))}
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

      {/* ==================== PESTAÑA INVENTARIO ==================== */}
      {pestana === 'inventario' && (
        <>
          <div className="no-print bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6">
            <h2 className="text-lg font-bold mb-4 text-slate-800 flex items-center gap-2">
              <PlusCircle size={20} className="text-indigo-600" /> Registrar Nuevo Producto / Lote
            </h2>
            <form onSubmit={handleAgregarProducto} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre (ej. Jugo de Mora)</label>
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">Precio Venta ($ - 0 si es regalo)</label>
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">Stock Inicial</label>
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha Vencimiento Lote</label>
                <input 
                  type="date" 
                  required
                  value={formProducto.vencimiento}
                  onChange={(e) => setFormProducto({ ...formProducto, vencimiento: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-indigo-600 text-white font-semibold p-2 rounded-lg hover:bg-indigo-700 transition"
              >
                Guardar Producto
              </button>
            </form>

            {formProducto.costo && formProducto.precio && (
              <div className="mt-3 p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-800 flex items-center gap-2">
                <DollarSign size={14} />
                <span>Ganancia estimada por unidad: <strong>${gananciaUnitariaPrev.toLocaleString()}</strong></span>
              </div>
            )}
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold mb-4 text-slate-800">Inventario de Productos y Lotes</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="p-3">Producto</th>
                    <th className="p-3">Costo Proveedor</th>
                    <th className="p-3">Precio Venta</th>
                    <th className="p-3">Ganancia / Unidad</th>
                    <th className="p-3">Stock Actual</th>
                    <th className="p-3">Vencimiento</th>
                    <th className="p-3 no-print">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3 font-semibold text-slate-900">
                        {p.precio === 0 ? <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold mr-2"><Gift size={12}/> Cortesía</span> : null}
                        {p.nombre}
                      </td>
                      <td className="p-3 text-slate-600">${p.costo.toLocaleString()}</td>
                      <td className="p-3 font-bold text-slate-900">${p.precio.toLocaleString()}</td>
                      <td className="p-3 text-emerald-600 font-semibold">${(p.precio - p.costo).toLocaleString()}</td>
                      <td className="p-3 font-bold">
                        {p.stock <= 0 ? <span className="text-red-600">0 (AGOTADO)</span> : `${p.stock} unidades`}
                      </td>
                      <td className="p-3 text-slate-600">{p.vencimiento}</td>
                      <td className="p-3 no-print">
                        <button 
                          onClick={() => eliminarProducto(p.id)}
                          className="text-red-500 hover:text-red-700 p-1 rounded transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ==================== PESTAÑA CARTA / CATÁLOGO DE PRODUCTOS ==================== */}
      {pestana === 'catalogo' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between border-b pb-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Coffee className="text-indigo-600" /> Carta de Productos & Bebidas
              </h2>
              <p className="text-xs text-slate-500">Listado de oferta disponible para el público</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {productos.map((p) => (
              <div key={p.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:shadow-md transition">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-base text-slate-800">{p.nombre}</h3>
                  <span className="bg-indigo-600 text-white font-bold text-sm px-2.5 py-1 rounded-lg">
                    {p.precio === 0 ? '¡GRATIS!' : `$${p.precio.toLocaleString()}`}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3">{p.descripcion || 'Producto de excelente calidad.'}</p>
                <div className="flex justify-between items-center text-xs text-slate-400 border-t pt-2 border-slate-200">
                  <span>Disponibilidad: <strong>{p.stock > 0 ? `${p.stock} ud.` : 'Agotado'}</strong></span>
                  {p.precio === 0 && <span className="text-amber-600 font-semibold flex items-center gap-1"><Gift size={12}/> Obsequio</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}