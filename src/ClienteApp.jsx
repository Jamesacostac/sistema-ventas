import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import {
  ShoppingCart, Receipt, UtensilsCrossed, Plus, Minus, X, Search, LogOut, Trash2, CheckCircle, Clock, Printer
} from 'lucide-react';
import { db, auth } from './firebaseClientes';
import { usePantalla } from './ui';
import {
  MEDIOS_PAGO_CLIENTE, negocioPublico, generarCodigoPedido, precioItemCliente, descripcionItemCliente,
  claveItemCliente, estadoPedido, fechaHora, aMilis
} from './pedidosEnLinea';

const dinero = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const leer = (clave, defecto) => { try { return JSON.parse(localStorage.getItem(clave)) ?? defecto; } catch { return defecto; } };
const guardar = (clave, valor) => { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ } };
const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Firestore no acepta campos undefined
const limpio = (obj) => JSON.parse(JSON.stringify(obj));

// Indicador en bloque de color (mismo estilo que el portal del negocio)
const Kpi = ({ color, icono, etiqueta, valor, detalle, onClick, clase = '' }) => {
  const Contenedor = onClick ? 'button' : 'div';
  return (
    <Contenedor onClick={onClick} className={`${clase} kpi kpi-${color} p-3 sm:p-4 text-left ${onClick ? 'hover:-translate-y-0.5 transition' : ''}`}>
      <div className="flex justify-between items-start gap-2">
        <p className="kpi-etiqueta">{etiqueta}</p>
        <span className="kpi-icono">{icono}</span>
      </div>
      <p className="kpi-valor text-xl sm:text-2xl md:text-[1.75rem] leading-tight mt-1">{valor}</p>
      {detalle && <p className="text-[11px] sm:text-xs mt-1 font-medium opacity-80">{detalle}</p>}
    </Contenedor>
  );
};

// ---------- Ventana para elegir sabor, opciones, bebida y cantidad ----------

function ElegirProducto({ item, onAgregar, onCerrar }) {
  const [cantidad, setCantidad] = useState(1);
  const [variante, setVariante] = useState('TODAS');
  const [valores, setValores] = useState(() => (item.opciones || []).map(o => o.valores?.[0]?.id));
  const [adicionales, setAdicionales] = useState([]);
  const [elecciones, setElecciones] = useState(() => (item.incluye || []).map(e => {
    const opcion = e.opciones.find(o => o.disponible >= e.cantidad) || e.opciones[0];
    return { productoId: opcion.productoId, variante: 'TODAS' };
  }));
  const elegir = (i, cambios) => setElecciones(xs => xs.map((x, j) => (j === i ? { ...x, ...cambios } : x)));

  const linea = item.tipo === 'producto'
    ? { productoId: item.id, tipo: 'producto', nombre: item.nombre, cantidad, variante }
    : {
        productoId: item.id, tipo: 'fabricado', nombre: item.nombre, cantidad, valores, adicionales: [...adicionales].sort(),
        elegidos: (item.incluye || []).map((e, i) => {
          const opcion = e.opciones.find(o => o.productoId === elecciones[i].productoId);
          return { espacioId: e.id, productoId: opcion.productoId, nombre: opcion.nombre, variante: elecciones[i].variante, cantidad: e.cantidad };
        })
      };
  const { total } = precioItemCliente(linea, item);
  const faltaIncluido = (item.incluye || []).some((e, i) => (e.opciones.find(o => o.productoId === elecciones[i].productoId)?.disponible || 0) < e.cantidad * cantidad);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={item.nombre}>
      <div className="absolute inset-0 bg-tinta/50" onClick={onCerrar} />
      <div className="relative w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-white border-2 border-tinta rounded-t-[1.5rem] sm:rounded-[1.25rem] p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-tinta">{item.nombre}</h2>
            <p className="text-xs text-gris-calido">{item.categoria}</p>
          </div>
          <button onClick={onCerrar} className="btn-icono" aria-label="Cerrar"><X size={18} /></button>
        </div>

        {item.tipo === 'producto' && item.sabores.length > 0 && (
          <div>
            <p className="etiqueta">Sabor</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setVariante('TODAS')} className={`chip ${variante === 'TODAS' ? 'chip-activo' : ''}`}>Cualquiera</button>
              {item.sabores.map(s => (
                <button key={s.variante} type="button" onClick={() => setVariante(s.variante)} className={`chip ${variante === s.variante ? 'chip-activo' : ''}`}>{s.variante}</button>
              ))}
            </div>
          </div>
        )}

        {(item.opciones || []).map((o, i) => (
          <div key={o.id}>
            <p className="etiqueta">{o.nombre}</p>
            <div className="flex flex-wrap gap-2">
              {o.valores.map(v => (
                <button key={v.id} type="button" onClick={() => setValores(vs => vs.map((x, j) => (j === i ? v.id : x)))} className={`chip ${valores[i] === v.id ? 'chip-activo' : ''}`}>
                  {v.nombre}{v.precioExtra ? ` +${dinero(v.precioExtra)}` : ''}
                </button>
              ))}
            </div>
          </div>
        ))}

        {(item.adicionales || []).length > 0 && (
          <div>
            <p className="etiqueta">Adicionales</p>
            <div className="space-y-1.5">
              {item.adicionales.map(a => (
                <label key={a.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={adicionales.includes(a.id)} onChange={(e) => setAdicionales(xs => (e.target.checked ? [...xs, a.id] : xs.filter(x => x !== a.id)))} className="accent-tinta" />
                  <span className="flex-1">{a.nombre}</span>
                  <span className="text-gris-calido">+{dinero(a.precio)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {(item.incluye || []).map((e, i) => {
          const elegida = e.opciones.find(o => o.productoId === elecciones[i].productoId);
          return (
            <div key={e.id}>
              <p className="etiqueta">{e.nombre}{e.cantidad > 1 ? ` (${e.cantidad})` : ''}</p>
              {e.opciones.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {e.opciones.map(o => (
                    <button
                      key={o.productoId}
                      type="button"
                      disabled={o.disponible < e.cantidad}
                      onClick={() => elegir(i, { productoId: o.productoId, variante: 'TODAS' })}
                      className={`chip disabled:opacity-40 ${elecciones[i].productoId === o.productoId ? 'chip-activo' : ''}`}
                    >
                      {o.nombre}{o.precioExtra ? ` +${dinero(o.precioExtra)}` : ''}{o.disponible < e.cantidad ? ' · agotado' : ''}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-tinta">{elegida?.nombre}</p>
              )}
              {elegida?.sabores?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <button type="button" onClick={() => elegir(i, { variante: 'TODAS' })} className={`chip !text-xs ${elecciones[i].variante === 'TODAS' ? 'chip-activo' : ''}`}>Cualquier sabor</button>
                  {elegida.sabores.map(s => (
                    <button key={s.variante} type="button" onClick={() => elegir(i, { variante: s.variante })} className={`chip !text-xs ${elecciones[i].variante === s.variante ? 'chip-activo' : ''}`}>{s.variante}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="flex items-center justify-between gap-3">
          <div className="stepper">
            <button onClick={() => setCantidad(c => Math.max(1, c - 1))} aria-label="Quitar uno"><Minus size={14} /></button>
            <span>{cantidad}</span>
            <button onClick={() => setCantidad(c => c + 1)} aria-label="Agregar uno"><Plus size={14} /></button>
          </div>
          <p className="kpi-valor text-2xl leading-none">{dinero(total)}</p>
        </div>

        <button onClick={() => onAgregar(linea)} disabled={faltaIncluido} className="btn btn-primario w-full">
          <ShoppingCart size={16} /> {faltaIncluido ? 'No hay suficientes unidades' : 'Agregar al carrito'}
        </button>
      </div>
    </div>
  );
}

// ---------- Factura / detalle de un pedido ----------

function DetallePedido({ pedido, onCerrar, onCancelar }) {
  const pagado = pedido.estado === 'pagado';
  const lineas = pagado && pedido.factura?.lineas?.length
    ? pedido.factura.lineas
    : pedido.items.map(i => ({ nombre: i.nombre, detalle: i.descripcion, cantidad: i.cantidad, total: i.total }));
  const total = pagado ? pedido.factura?.total ?? pedido.total : pedido.total;
  const estado = estadoPedido[pedido.estado] || estadoPedido.pendiente;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center factura-ventana" role="dialog" aria-modal="true" aria-label="Pedido">
      <div className="absolute inset-0 bg-tinta/50 no-print" onClick={onCerrar} />
      <div className="relative w-full sm:max-w-md max-h-[92dvh] overflow-y-auto bg-white border-2 border-tinta rounded-t-[1.5rem] sm:rounded-[1.25rem] p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-tinta">{pagado ? 'Factura de compra' : 'Tu pedido'}</h2>
            <p className="text-xs text-gris-calido">Tazón para Dos · {fechaHora(pedido.creadoEn)}</p>
          </div>
          <button onClick={onCerrar} className="btn-icono no-print" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className={`rounded-xl p-4 text-center ${pagado ? 'bg-emerald-50 border border-emerald-200' : pedido.estado === 'cancelado' ? 'bg-crema' : 'bg-sol/30 border-2 border-dashed border-tinta'}`}>
          {pedido.estado === 'pendiente' && <p className="text-xs text-gris-calido">Muestra este código en caja</p>}
          <p className="font-mono text-4xl font-bold tracking-[0.2em] text-tinta my-1">{pedido.codigo}</p>
          <span className={`pastilla ${estado.clase}`}>
            {pagado ? <CheckCircle size={12} /> : <Clock size={12} />} {pagado ? `Pedido pagado · ${fechaHora(pedido.pagadoEn)}` : estado.texto}
          </span>
        </div>

        <div className="text-sm">
          <p className="text-xs text-gris-calido mb-2">A nombre de <b className="text-tinta">{pedido.clienteNombre}</b> · {pagado ? pedido.factura?.medioPago || pedido.medioPago : `pagará con ${pedido.medioPago}`}</p>
          <ul className="divide-y divide-linea-suave border-y border-linea-suave">
            {lineas.map((l, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-semibold">{l.cantidad} × {l.nombre}</span>
                  {l.detalle && <span className="block text-[11px] text-gris-calido">{l.detalle}</span>}
                </span>
                <span className="font-semibold whitespace-nowrap">{dinero(l.total)}</span>
              </li>
            ))}
          </ul>
          {pagado && pedido.factura?.recargo > 0 && (
            <p className="flex justify-between text-xs text-gris-calido pt-2"><span>Recargo tarjeta</span><span>{dinero(pedido.factura.recargo)}</span></p>
          )}
          <p className="flex justify-between items-baseline pt-3">
            <span className="kpi-etiqueta text-gris-calido">{pagado ? 'Total pagado' : 'Total aproximado'}</span>
            <span className="kpi-valor text-2xl">{dinero(total)}</span>
          </p>
          {!pagado && pedido.estado === 'pendiente' && (
            <p className="text-[11px] text-gris-calido mt-1">El valor final lo confirma la caja con los precios del día.</p>
          )}
          {pedido.nota && <p className="text-xs text-gris-calido mt-2">Nota: {pedido.nota}</p>}
        </div>

        <div className="flex gap-2 no-print">
          {pagado && <button onClick={() => window.print()} className="btn btn-claro flex-1"><Printer size={16} /> Imprimir o guardar PDF</button>}
          {pedido.estado === 'pendiente' && <button onClick={() => onCancelar(pedido)} className="btn btn-claro flex-1">Cancelar pedido</button>}
        </div>
      </div>
    </div>
  );
}

// ---------- App del cliente ----------

export default function ClienteApp({ usuario }) {
  const negocioId = useMemo(() => negocioPublico(), []);
  const [carta, setCarta] = useState(null); // null = cargando
  const [errorCarta, setErrorCarta] = useState('');
  const [vista, setVista] = useState('carta'); // 'carta' | 'pedidos'
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const esPC = usePantalla('(min-width: 1024px)');
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');
  const [eligiendo, setEligiendo] = useState(null);
  const claveCarrito = `carrito_cliente_${usuario.uid}`;
  const [carrito, setCarrito] = useState(() => leer(claveCarrito, []));
  const [nombre, setNombre] = useState(() => {
    if (usuario.displayName) return usuario.displayName;
    try { return localStorage.getItem('nombre_cliente') || ''; } catch { return ''; }
  });
  const [medioPago, setMedioPago] = useState('Efectivo');
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pedidos, setPedidos] = useState([]);
  const [abiertoId, setAbiertoId] = useState(null);
  const [aviso, setAviso] = useState(null);
  const estadosPrevios = useRef(null);

  useEffect(() => { guardar(claveCarrito, carrito); }, [claveCarrito, carrito]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4500);
    return () => clearTimeout(t);
  }, [aviso]);

  // Carta pública del negocio
  useEffect(() => onSnapshot(
    doc(db, 'negocios', negocioId, 'publico', 'carta'),
    (snap) => { setCarta(snap.exists() ? snap.data().items || [] : []); setErrorCarta(''); },
    (err) => { setCarta([]); setErrorCarta('No se pudo cargar la carta: ' + err.message); }
  ), [negocioId]);

  // Mis pedidos: avisa cuando caja marca uno como pagado
  useEffect(() => onSnapshot(
    query(collection(db, 'negocios', negocioId, 'pedidos'), where('clienteUid', '==', usuario.uid)),
    (snap) => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => aMilis(b.creadoEn) - aMilis(a.creadoEn));
      if (estadosPrevios.current) {
        const recienPagado = lista.find(p => p.estado === 'pagado' && estadosPrevios.current[p.id] === 'pendiente');
        if (recienPagado) {
          setAviso({ tipo: 'ok', texto: `¡Pedido ${recienPagado.codigo} pagado! Gracias por tu compra.` });
          setAbiertoId(recienPagado.id);
          try { navigator.vibrate?.(200); } catch { /* sin vibración */ }
        }
      }
      estadosPrevios.current = Object.fromEntries(lista.map(p => [p.id, p.estado]));
      setPedidos(lista);
    },
    (err) => console.error('Pedidos:', err)
  ), [negocioId, usuario.uid]);

  const cartaPorId = useMemo(() => Object.fromEntries((carta || []).map(i => [i.id, i])), [carta]);
  const categorias = [...new Set((carta || []).map(i => i.categoria))];
  const texto = sinTildes(busqueda.trim());
  const visibles = (carta || [])
    .filter(i => !categoria || i.categoria === categoria)
    .filter(i => !texto || sinTildes(i.nombre).includes(texto))
    .sort((a, b) => ((b.disponible ?? 1) > 0) - ((a.disponible ?? 1) > 0));

  const lineas = carrito.map(l => ({ ...l, ...precioItemCliente(l, cartaPorId[l.productoId]), descripcion: descripcionItemCliente(l, cartaPorId[l.productoId]) }));
  const totalCarrito = lineas.reduce((s, l) => s + l.total, 0);
  const unidades = carrito.reduce((s, l) => s + l.cantidad, 0);
  const pendientes = pedidos.filter(p => p.estado === 'pendiente').length;

  const agregar = (linea) => {
    const clave = claveItemCliente(linea);
    setCarrito(cs => (cs.some(c => claveItemCliente(c) === clave)
      ? cs.map(c => (claveItemCliente(c) === clave ? { ...c, cantidad: c.cantidad + linea.cantidad } : c))
      : [...cs, linea]));
    setEligiendo(null);
    setAviso({ tipo: 'ok', texto: `+${linea.cantidad} ${linea.nombre}` });
  };

  const tocarProducto = (item) => {
    const conEleccion = item.tipo === 'fabricado'
      ? item.opciones.length > 0 || item.adicionales.length > 0 || item.incluye.length > 0
      : item.sabores.length > 0;
    if (conEleccion) return setEligiendo(item);
    agregar(item.tipo === 'producto'
      ? { productoId: item.id, tipo: 'producto', nombre: item.nombre, cantidad: 1, variante: 'TODAS' }
      : { productoId: item.id, tipo: 'fabricado', nombre: item.nombre, cantidad: 1, valores: [], adicionales: [], elegidos: [] });
  };

  const cambiarCantidad = (i, cantidad) => setCarrito(cs => (cantidad <= 0 ? cs.filter((_, j) => j !== i) : cs.map((c, j) => (j === i ? { ...c, cantidad } : c))));

  const hacerPedido = async () => {
    if (!nombre.trim()) return setAviso({ tipo: 'error', texto: 'Escribe tu nombre para que caja te encuentre.' });
    const noDisponibles = lineas.filter(l => !cartaPorId[l.productoId]);
    if (noDisponibles.length) return setAviso({ tipo: 'error', texto: `Ya no está en la carta: ${noDisponibles.map(l => l.nombre).join(', ')}. Quítalo del carrito.` });
    setEnviando(true);
    try {
      try { localStorage.setItem('nombre_cliente', nombre.trim()); } catch { /* sin almacenamiento */ }
      const pedido = limpio({
        clienteUid: usuario.uid,
        clienteNombre: nombre.trim().slice(0, 60),
        codigo: generarCodigoPedido(),
        items: lineas.map(l => ({
          productoId: l.productoId,
          tipo: l.tipo,
          nombre: l.nombre,
          cantidad: l.cantidad,
          descripcion: l.descripcion,
          ...(l.tipo === 'producto' ? { variante: l.variante || 'TODAS' } : { valores: l.valores || [], adicionales: l.adicionales || [], elegidos: l.elegidos || [] }),
          precioUnitario: l.unitario,
          total: l.total
        })),
        total: totalCarrito,
        medioPago,
        estado: 'pendiente',
        ...(nota.trim() && { nota: nota.trim().slice(0, 200) })
      });
      const ref = await addDoc(collection(db, 'negocios', negocioId, 'pedidos'), { ...pedido, creadoEn: serverTimestamp() });
      setCarrito([]);
      setNota('');
      setVista('pedidos');
      setCarritoAbierto(false);
      setAbiertoId(ref.id);
    } catch (err) {
      setAviso({ tipo: 'error', texto: 'No se pudo enviar el pedido: ' + err.message });
    } finally {
      setEnviando(false);
    }
  };

  const cancelarPedido = async (pedido) => {
    try {
      await updateDoc(doc(db, 'negocios', negocioId, 'pedidos', pedido.id), { estado: 'cancelado', canceladoEn: Date.now() });
      setAviso({ tipo: 'ok', texto: `Pedido ${pedido.codigo} cancelado.` });
    } catch (err) {
      setAviso({ tipo: 'error', texto: 'No se pudo cancelar: ' + err.message });
    }
  };

  const salir = () => {
    signOut(auth);
  };

  const abierto = pedidos.find(p => p.id === abiertoId);
  const pagados = pedidos.filter(p => p.estado === 'pagado');
  const totalComprado = pagados.reduce((s, p) => s + (p.factura?.total ?? p.total ?? 0), 0);
  const primerNombre = nombre.trim().split(' ')[0];

  // Carrito: columna fija en pantallas grandes y ventana flotante en el celular
  const contenidoCarrito = (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-tinta flex items-center gap-2.5">
          <ShoppingCart size={18} /> Mi carrito
          {unidades > 0 && <span className="pastilla pastilla-pendiente">{unidades} un.</span>}
        </h2>
        {carrito.length > 0 && <button onClick={() => setCarrito([])} className="enlace enlace-peligro text-xs mr-10 lg:mr-0">Vaciar</button>}
      </div>

      {lineas.length === 0 ? (
        <div className="text-center py-8 px-4 rounded-xl bg-crema/60 border-[1.5px] border-dashed border-linea">
          <img src="/marca/mascota.svg" alt="" className="h-12 mx-auto mb-2 opacity-40" />
          <p className="text-sm text-gris-calido">Toca un producto de la carta para agregarlo.</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-linea-suave -mx-1">
            {lineas.map((l, i) => (
              <li key={claveItemCliente(l)} className="flex items-start gap-3 px-1 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{l.nombre}</p>
                  <p className="text-[11px] text-gris-calido">{l.descripcion ? `${l.descripcion} · ` : ''}{dinero(l.unitario)} c/u</p>
                  {!cartaPorId[l.productoId] && <p className="text-[11px] text-[#B23A50]">Ya no está en la carta</p>}
                </div>
                <div className="stepper shrink-0">
                  <button onClick={() => cambiarCantidad(i, l.cantidad - 1)} aria-label="Quitar uno">{l.cantidad === 1 ? <Trash2 size={13} /> : <Minus size={14} />}</button>
                  <span>{l.cantidad}</span>
                  <button onClick={() => cambiarCantidad(i, l.cantidad + 1)} aria-label="Agregar uno"><Plus size={14} /></button>
                </div>
                <p className="w-20 text-right text-sm font-bold shrink-0 pt-1">{dinero(l.total)}</p>
              </li>
            ))}
          </ul>

          <hr className="separador" />

          <p className="paso"><span className="paso-numero">1</span> ¿A nombre de quién?</p>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="campo mb-4" maxLength={60} placeholder="Tu nombre" />

          <p className="paso"><span className="paso-numero">2</span> ¿Cómo vas a pagar en caja?</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {MEDIOS_PAGO_CLIENTE.map(m => (
              <button key={m} type="button" onClick={() => setMedioPago(m)} className={`chip !py-2 ${medioPago === m ? 'chip-activo' : ''}`}>{m}</button>
            ))}
          </div>

          <p className="paso"><span className="paso-numero">3</span> Nota (opcional)</p>
          <input value={nota} onChange={(e) => setNota(e.target.value)} className="campo" maxLength={200} placeholder="Ej. sin salsa" />

          <hr className="separador" />

          <div className="flex items-baseline justify-between mb-3">
            <span className="kpi-etiqueta text-gris-calido">Total</span>
            <span className="kpi-valor text-3xl">{dinero(totalCarrito)}</span>
          </div>
          <button onClick={hacerPedido} disabled={enviando} className="btn btn-primario w-full !py-3 !text-base">
            <Receipt size={18} /> {enviando ? 'Enviando...' : 'Hacer pedido'}
          </button>
          <p className="text-[11px] text-gris-calido text-center mt-2">Te damos un código para pagar en caja.</p>
        </>
      )}
    </>
  );

  return (
    <div className="px-3 pt-3 pb-24 sm:px-4 sm:pt-4 md:px-6 md:pt-6 lg:pb-6 bg-papel min-h-screen text-tinta font-sans">
      <header className="marca-cabecera mb-6 rounded-2xl no-print">
        <div className="flex items-center justify-between gap-2 sm:gap-3 p-3 sm:p-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <img src="/marca/sello.svg" alt="Tazón para Dos" className="h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 shrink-0 rounded-full object-contain" />
            <div className="min-w-0">
              <p className="marca-eyebrow text-tinta/80 hidden sm:block">Pedidos en línea</p>
              <h1 className="marca-titular text-base sm:text-xl md:text-2xl text-tinta leading-tight truncate">Tazón para Dos</h1>
              <p className="text-[11px] sm:text-xs md:text-sm text-tinta/80 font-medium truncate">
                {primerNombre ? `¡Hola, ${primerNombre}! ` : ''}Pide aquí y paga en caja
              </p>
            </div>
          </div>
          <button onClick={salir} className="btn btn-claro btn-sm shrink-0" title="Cerrar sesión">
            <LogOut size={14} /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>

        <nav className="mx-2 sm:mx-3 mb-2 sm:mb-3 flex items-center justify-start md:justify-center gap-1 overflow-x-auto sin-scrollbar bg-papel p-1.5 rounded-2xl border-2 border-tinta barra-pestanas">
          <button onClick={() => setVista('carta')} className={`pestana ${vista === 'carta' ? 'pestana-activa' : ''}`}>
            <UtensilsCrossed size={16} /> Carta
          </button>
          <button onClick={() => setVista('pedidos')} className={`pestana ${vista === 'pedidos' ? 'pestana-activa' : ''}`}>
            <Receipt size={16} /> Mis pedidos
            {pendientes > 0 && <span className="pastilla pastilla-pendiente !text-[10px] !px-1.5">{pendientes}</span>}
          </button>
        </nav>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6 no-print">
        <Kpi color="sol" icono={<ShoppingCart size={18} />} etiqueta="Tu carrito" valor={dinero(totalCarrito)} detalle={`${unidades} producto(s)`} onClick={esPC ? undefined : () => setCarritoAbierto(true)} />
        <Kpi color="turquesa" icono={<Clock size={18} />} etiqueta="Por pagar" valor={pendientes} detalle={pendientes ? 'Muestra el código en caja' : 'Sin pedidos pendientes'} onClick={() => setVista('pedidos')} />
        <Kpi color="verde" icono={<CheckCircle size={18} />} etiqueta="Compras pagadas" valor={dinero(totalComprado)} detalle={`${pagados.length} pedido(s)`} clase="col-span-2 lg:col-span-1" onClick={() => setVista('pedidos')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start no-print">
        {vista === 'carta' ? (
          <section className="panel p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-bold text-tinta flex items-center gap-2.5"><UtensilsCrossed size={18} /> Carta</h2>
              <div className="relative w-full sm:w-64">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-calido" />
                <input type="search" placeholder="Buscar en la carta..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="campo pl-9" />
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto sin-scrollbar -mx-1 px-1 pb-1 mb-4">
              <button onClick={() => setCategoria('')} className={`chip shrink-0 ${!categoria ? 'chip-activo' : ''}`}>Todas</button>
              {categorias.map(c => <button key={c} onClick={() => setCategoria(c)} className={`chip shrink-0 ${categoria === c ? 'chip-activo' : ''}`}>{c}</button>)}
            </div>

            {carta === null && <p className="text-center text-gris-calido py-10">Cargando la carta...</p>}
            {errorCarta && <p className="aviso aviso-error">{errorCarta}</p>}
            {carta && carta.length === 0 && !errorCarta && (
              <div className="text-center py-10 text-sm text-gris-calido">
                <img src="/marca/mascota.svg" alt="" className="h-14 mx-auto mb-2 opacity-40" />
                La carta todavía no está publicada. Vuelve en un rato.
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {visibles.map(i => {
                const agotado = i.disponible !== null && i.disponible <= 0;
                const enCarrito = carrito.filter(c => c.productoId === i.id).reduce((s, c) => s + c.cantidad, 0);
                const eligeBebida = i.tipo === 'fabricado' && i.incluye.some(e => e.opciones.length > 1);
                const etiqueta = agotado ? 'Agotado'
                  : eligeBebida ? 'Elige bebida'
                  : (i.tipo === 'producto' && i.sabores.length > 0) ? 'Elige sabor'
                  : (i.disponible !== null && i.disponible <= 5) ? `Quedan ${i.disponible}` : null;
                return (
                  <button key={i.id} onClick={() => tocarProducto(i)} disabled={agotado} className={`producto-tile ${enCarrito ? 'producto-tile-en-carrito' : ''}`}>
                    {enCarrito > 0 && <span className="producto-cantidad">{enCarrito}</span>}
                    <span>
                      <span className="block font-bold text-sm leading-snug">{i.nombre}</span>
                      <span className="block text-[11px] text-gris-calido">{i.categoria}</span>
                    </span>
                    <span className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1.5">
                      <span className="kpi-valor text-lg leading-none">{dinero(i.precio)}</span>
                      {etiqueta && <span className={`pastilla !text-[10px] ${agotado ? 'pastilla-peligro' : 'pastilla-neutra'}`}>{etiqueta}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {carta && carta.length > 0 && visibles.length === 0 && (
              <p className="text-center py-10 text-sm text-gris-calido">Nada coincide con la búsqueda.</p>
            )}
          </section>
        ) : (
          <section className="panel p-4 md:p-5">
            <h2 className="text-base font-bold text-tinta flex items-center gap-2.5 mb-4"><Receipt size={18} /> Mis pedidos</h2>
            {pedidos.length === 0 ? (
              <div className="text-center py-10 text-sm text-gris-calido">
                <img src="/marca/mascota.svg" alt="" className="h-14 mx-auto mb-2 opacity-40" />
                <p>Todavía no has hecho pedidos.</p>
                <button onClick={() => setVista('carta')} className="btn btn-primario btn-sm mt-4"><UtensilsCrossed size={14} /> Ver la carta</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {pedidos.map(p => {
                  const estado = estadoPedido[p.estado] || estadoPedido.pendiente;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setAbiertoId(p.id)}
                      className={`producto-tile !min-h-0 ${p.estado === 'pendiente' ? 'producto-tile-en-carrito' : ''}`}
                    >
                      <span className="flex items-start justify-between gap-3 w-full">
                        <span className="min-w-0">
                          <span className="block font-mono font-bold text-xl tracking-widest leading-none">{p.codigo}</span>
                          <span className="block text-[11px] text-gris-calido mt-1">{fechaHora(p.creadoEn)}</span>
                        </span>
                        <span className="kpi-valor text-lg leading-none shrink-0">{dinero(p.estado === 'pagado' ? p.factura?.total ?? p.total : p.total)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2 w-full">
                        <span className="text-[11px] text-gris-calido truncate">{p.items.map(i => `${i.cantidad} ${i.nombre}`).join(', ')}</span>
                        <span className={`pastilla ${estado.clase} !text-[10px] shrink-0`}>{estado.texto}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {esPC && (
          <aside className="panel p-4 md:p-5 sticky top-4">{contenidoCarrito}</aside>
        )}
      </div>

      {!esPC && (
        <>
          <button
            onClick={() => setCarritoAbierto(true)}
            className="fixed z-30 bottom-4 right-4 left-4 sm:left-auto btn btn-oscuro !py-3 !px-5 !text-base !shadow-[4px_4px_0_var(--color-sol)] no-print"
            aria-label="Abrir el carrito"
          >
            <ShoppingCart size={18} />
            {carrito.length === 0
              ? <span className="opacity-80">Carrito vacío</span>
              : (
                <>
                  Carrito
                  <span className="pastilla pastilla-pendiente !border-sol">{unidades} un.</span>
                  <span className="font-extrabold">{dinero(totalCarrito)}</span>
                </>
              )}
          </button>

          {carritoAbierto && (
            <div className="fixed inset-0 z-40 no-print" role="dialog" aria-modal="true" aria-label="Carrito">
              <div className="absolute inset-0 bg-tinta/50" onClick={() => setCarritoAbierto(false)} />
              <div className="ventana-pedido absolute inset-x-0 bottom-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[400px] max-h-[92dvh] sm:max-h-none overflow-y-auto bg-papel border-t-[3px] sm:border-t-0 sm:border-l-[3px] border-tinta rounded-t-[1.5rem] sm:rounded-none p-5">
                <button onClick={() => setCarritoAbierto(false)} className="btn-icono absolute top-4 right-4" aria-label="Cerrar"><X size={18} /></button>
                {contenidoCarrito}
              </div>
            </div>
          )}
        </>
      )}

      {eligiendo && <ElegirProducto item={eligiendo} onAgregar={agregar} onCerrar={() => setEligiendo(null)} />}
      {abierto && <DetallePedido pedido={abierto} onCerrar={() => setAbiertoId(null)} onCancelar={cancelarPedido} />}
      {aviso && (
        <div
          role="status"
          className={`fixed bottom-24 lg:bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] aviso no-print shadow-[4px_4px_0_rgba(40,32,59,0.25)] ${aviso.tipo === 'error' ? 'aviso-error' : 'aviso-ok'}`}
        >
          {aviso.texto}
        </div>
      )}
    </div>
  );
}
