import React, { useEffect, useState } from 'react';
import { X, Plus, Minus, ShoppingCart, PackageCheck, Hammer } from 'lucide-react';
import { eleccionDe, adicionalesDe, precioUnitario, precioPorCantidad, claveVariante, alcanzaPara, incluyeDe, precioExtraElegidos } from './fabricacion';

const dinero = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');

// Unidades por sabor de un producto del inventario: [{ variante, cantidad }]
const saboresConStock = (prod) => {
  const porSabor = {};
  (prod?.lotes || []).forEach(l => { porSabor[l.variante || 'General'] = (porSabor[l.variante || 'General'] || 0) + (Number(l.cantidad) || 0); });
  return Object.entries(porSabor).map(([variante, cantidad]) => ({ variante, cantidad })).filter(s => s.cantidad > 0);
};
const stockDe = (prod) => saboresConStock(prod).reduce((s, x) => s + x.cantidad, 0);

/**
 * Ventana para vender un producto fabricado: se elige un valor de cada opción (talla, base...),
 * los adicionales y la cantidad. Muestra el precio con los precios por cantidad y si hay listos.
 * En los combos también se elige lo incluido del inventario (la bebida y su sabor).
 */
export default function SelectorFabricado({ producto, materialesPorId, inventarioPorId = {}, onAgregar, onCerrar }) {
  const [valores, setValores] = useState(() => (producto.opciones || []).map(o => o.valores?.[0]?.id));
  const [adicionales, setAdicionales] = useState([]);
  const [cantidad, setCantidad] = useState(1);
  const espacios = incluyeDe(producto);
  // Por cada espacio: el producto elegido (el primero con unidades) y su sabor
  const [elecciones, setElecciones] = useState(() => espacios.map(e => {
    const conStock = e.opciones.find(o => stockDe(inventarioPorId[o.productoId]) > 0) || e.opciones[0];
    return { productoId: conStock.productoId, variante: 'TODAS' };
  }));
  const elegir = (i, cambios) => setElecciones(xs => xs.map((x, j) => (j === i ? { ...x, ...cambios } : x)));
  const elegidos = espacios.map((e, i) => {
    const prod = inventarioPorId[elecciones[i].productoId];
    return {
      espacioId: e.id,
      productoId: elecciones[i].productoId,
      nombre: prod?.nombre || '(producto borrado)',
      variante: elecciones[i].variante,
      cantidad: Number(e.cantidad) || 1,
      costo: Number(prod?.costo) || 0
    };
  });
  const faltaIncluido = elegidos.some(e => !inventarioPorId[e.productoId] || stockDe(inventarioPorId[e.productoId]) < e.cantidad);

  useEffect(() => {
    const cerrar = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [onCerrar]);

  const eleccion = eleccionDe(producto, valores);
  const unitario = precioUnitario(producto, eleccion, adicionalesDe(producto, adicionales)) + precioExtraElegidos(producto, elegidos);
  const total = precioPorCantidad(producto, cantidad, unitario);
  const listos = Math.max(0, Number(producto.listos?.[claveVariante(valores)]) || 0);
  const alcanza = alcanzaPara(producto, valores, materialesPorId);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center no-print" role="dialog" aria-modal="true" aria-label={`Vender ${producto.nombre}`}>
      <div className="absolute inset-0 bg-tinta/50" onClick={onCerrar} />
      <div className="relative w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-white border-2 border-tinta rounded-t-[1.5rem] sm:rounded-[1.25rem] shadow-[6px_6px_0_rgba(40,32,59,0.25)] p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-tinta">{producto.nombre}</h2>
            <p className="text-xs text-gris-calido">{producto.categoria}</p>
          </div>
          <button onClick={onCerrar} className="btn-icono" title="Cerrar"><X size={18} /></button>
        </div>

        {(producto.opciones || []).map((o, i) => (
          <div key={o.id}>
            <p className="etiqueta">{o.nombre}</p>
            <div className="flex flex-wrap gap-2">
              {o.valores.map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setValores(vs => vs.map((x, j) => (j === i ? v.id : x)))}
                  className={`chip ${valores[i] === v.id ? 'chip-activo' : ''}`}
                >
                  {v.nombre}{Number(v.precioExtra) ? ` +${dinero(v.precioExtra)}` : ''}
                </button>
              ))}
            </div>
          </div>
        ))}

        {(producto.adicionales || []).length > 0 && (
          <div>
            <p className="etiqueta">Adicionales</p>
            <div className="space-y-1.5">
              {producto.adicionales.map(a => (
                <label key={a.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adicionales.includes(a.id)}
                    onChange={(e) => setAdicionales(xs => (e.target.checked ? [...xs, a.id] : xs.filter(x => x !== a.id)))}
                    className="accent-tinta"
                  />
                  <span className="flex-1">{a.nombre}</span>
                  <span className="text-gris-calido">+{dinero(a.precio)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {espacios.map((e, i) => {
          const elegido = inventarioPorId[elecciones[i].productoId];
          const sabores = saboresConStock(elegido);
          return (
            <div key={e.id}>
              <p className="etiqueta">{e.nombre}{Number(e.cantidad) > 1 ? ` (${e.cantidad})` : ''}</p>
              {e.opciones.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {e.opciones.map(o => {
                    const prod = inventarioPorId[o.productoId];
                    const hay = stockDe(prod);
                    return (
                      <button
                        key={o.productoId}
                        type="button"
                        disabled={hay < (Number(e.cantidad) || 1)}
                        onClick={() => elegir(i, { productoId: o.productoId, variante: 'TODAS' })}
                        className={`chip disabled:opacity-40 ${elecciones[i].productoId === o.productoId ? 'chip-activo' : ''}`}
                        title={hay ? `${hay} disponible(s)` : 'Agotado'}
                      >
                        {prod?.nombre || '(borrado)'}{Number(o.precioExtra) ? ` +${dinero(o.precioExtra)}` : ''}{hay ? '' : ' · agotado'}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-tinta">{elegido?.nombre || '(producto borrado)'} <span className="text-xs text-gris-calido">· {stockDe(elegido)} disp.</span></p>
              )}
              {sabores.length > 1 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <button type="button" onClick={() => elegir(i, { variante: 'TODAS' })} className={`chip !text-xs ${elecciones[i].variante === 'TODAS' ? 'chip-activo' : ''}`}>
                    Cualquier sabor
                  </button>
                  {sabores.map(s => (
                    <button
                      key={s.variante}
                      type="button"
                      onClick={() => elegir(i, { variante: s.variante })}
                      className={`chip !text-xs ${elecciones[i].variante === s.variante ? 'chip-activo' : ''}`}
                    >
                      {s.variante} · {s.cantidad}
                    </button>
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
          <div className="text-right">
            <p className="kpi-valor text-2xl leading-none">{dinero(total)}</p>
            {total !== unitario * cantidad && <p className="text-[11px] text-emerald-700 font-semibold">Precio por cantidad (antes {dinero(unitario * cantidad)})</p>}
          </div>
        </div>

        <p className="text-xs text-gris-calido flex items-center gap-1.5">
          {listos > 0
            ? <><PackageCheck size={14} /> Hay {listos} listo(s); el resto se arma al vender.</>
            : <><Hammer size={14} /> Se arma al vender{alcanza !== null ? ` · los materiales alcanzan para ${alcanza}` : ''}.</>}
        </p>

        <button
          onClick={() => onAgregar({ valores, adicionales, cantidad, precio: unitario, elegidos })}
          disabled={faltaIncluido}
          className="btn btn-primario w-full"
        >
          <ShoppingCart size={16} /> {faltaIncluido ? 'No hay unidades de lo incluido' : 'Agregar al pedido'}
        </button>
      </div>
    </div>
  );
}
