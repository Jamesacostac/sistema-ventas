import React, { useEffect, useState } from 'react';
import { X, Plus, Minus, ShoppingCart, PackageCheck, Hammer } from 'lucide-react';
import { eleccionDe, adicionalesDe, precioUnitario, precioPorCantidad, claveVariante, alcanzaPara } from './fabricacion';

const dinero = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');

/**
 * Ventana para vender un producto fabricado: se elige un valor de cada opción (talla, base...),
 * los adicionales y la cantidad. Muestra el precio con los precios por cantidad y si hay listos.
 */
export default function SelectorFabricado({ producto, materialesPorId, onAgregar, onCerrar }) {
  const [valores, setValores] = useState(() => (producto.opciones || []).map(o => o.valores?.[0]?.id));
  const [adicionales, setAdicionales] = useState([]);
  const [cantidad, setCantidad] = useState(1);

  useEffect(() => {
    const cerrar = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [onCerrar]);

  const eleccion = eleccionDe(producto, valores);
  const unitario = precioUnitario(producto, eleccion, adicionalesDe(producto, adicionales));
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
                    className="accent-[#28203B]"
                  />
                  <span className="flex-1">{a.nombre}</span>
                  <span className="text-gris-calido">+{dinero(a.precio)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

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

        <button onClick={() => onAgregar({ valores, adicionales, cantidad, precio: unitario })} className="btn btn-primario w-full">
          <ShoppingCart size={16} /> Agregar al pedido
        </button>
      </div>
    </div>
  );
}
