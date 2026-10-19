import React, { useState } from 'react';
import { doc } from 'firebase/firestore';
import { CalendarX, Save, AlertTriangle } from 'lucide-react';
import { Plegable } from './ui';

/**
 * Productos vencidos o dañados (productos con lotes, como los de Tazón): se descuenta del lote
 * y queda como pérdida en perdidas/{id} con su costo. Avisa de los lotes que ya vencieron.
 */

const dinero = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// Lotes de un producto (los productos antiguos sin lotes tienen solo stock)
const lotesDe = (p) => {
  if (Array.isArray(p.lotes) && p.lotes.length > 0) return p.lotes;
  const stock = Number(p.stock) || 0;
  return stock > 0 ? [{ id: 'lote_legacy_' + p.id, variante: p.nombre || 'General', cantidad: stock, vencimiento: p.vencimiento || 'Sin fecha' }] : [];
};
const tieneFecha = (l) => l.vencimiento && l.vencimiento !== 'Sin fecha';
const nombreLote = (l) => `${l.variante || 'General'}${tieneFecha(l) ? ` · vence ${l.vencimiento}` : ''}`;

const MOTIVOS = [
  { clave: 'vencido', texto: 'Vencido' },
  { clave: 'dano', texto: 'Dañado' },
  { clave: 'otro', texto: 'Otro' }
];

export default function BajasLotes({ productos, puedeRegistrar, operacion, col, docN }) {
  const [motivo, setMotivo] = useState('vencido');
  const [productoId, setProductoId] = useState('');
  const [loteId, setLoteId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState(null);

  const fechaHoy = hoy();
  const vencidos = productos.flatMap(p => lotesDe(p)
    .filter(l => tieneFecha(l) && l.vencimiento < fechaHoy && Number(l.cantidad) > 0)
    .map(l => ({ p, l })));

  const conStock = productos.filter(p => lotesDe(p).some(l => Number(l.cantidad) > 0)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const producto = productos.find(p => p.id === productoId);
  const lotes = producto ? lotesDe(producto).filter(l => Number(l.cantidad) > 0) : [];
  const lote = lotes.find(l => l.id === loteId) || lotes[0];
  const cant = Math.round(Number(cantidad) || 0);
  const valor = producto ? cant * (Number(producto.costo) || 0) : 0;
  const error = lote && cant > Number(lote.cantidad) ? `Ese lote solo tiene ${lote.cantidad}.` : null;

  // Da de baja `n` unidades de un lote y registra la pérdida, en una sola operación
  const darDeBaja = async (p, l, n, clase, texto) => {
    const lotesNuevos = lotesDe(p).map(x => (x.id === l.id ? { ...x, cantidad: Number(x.cantidad) - n } : x)).filter(x => Number(x.cantidad) > 0);
    const stock = lotesNuevos.reduce((s, x) => s + Number(x.cantidad), 0);
    const costo = n * (Number(p.costo) || 0);
    const etiqueta = MOTIVOS.find(m => m.clave === clase)?.texto || 'Baja';
    const descripcion = `${p.nombre} (${nombreLote(l)}) × ${n}`;
    const op = operacion(`Producto dado de baja: ${etiqueta.toLowerCase()}`, `${descripcion} — pérdida ${dinero(costo)}${texto ? ` (${texto})` : ''}`);
    op.actualizar(docN('productos', p.id), { lotes: lotesNuevos, stock }, { lotes: p.lotes || [], stock: p.stock ?? 0 });
    op.crear(doc(col('perdidas')), {
      fecha: hoy(),
      creadoEn: Date.now(),
      clase: clase === 'vencido' ? 'vencido' : 'dano',
      tipo: etiqueta,
      descripcion,
      motivo: texto || '',
      cantidad: n,
      valor: Math.round(costo),
      productoId: p.id,
      loteId: l.id
    });
    await op.guardar();
    return costo;
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!puedeRegistrar || !producto || !lote || !(cant > 0) || error) return;
    setGuardando(true);
    setEstado(null);
    try {
      const costo = await darDeBaja(producto, lote, cant, motivo, nota.trim());
      setCantidad('');
      setNota('');
      setEstado({ tipo: 'ok', texto: `Listo: ${cant} de ${producto.nombre} dados de baja. Pérdida ${dinero(costo)} (en Finanzas).` });
    } catch (err) {
      setEstado({ tipo: 'error', texto: 'No se pudo guardar: ' + err.message });
    } finally {
      setGuardando(false);
    }
  };

  const bajaRapida = async ({ p, l }) => {
    if (!puedeRegistrar || !confirm(`¿Dar de baja ${l.cantidad} de ${p.nombre} (${nombreLote(l)}) por vencido?\n\nSe descuenta del inventario y queda como pérdida de ${dinero(l.cantidad * (Number(p.costo) || 0))}.`)) return;
    try {
      await darDeBaja(p, l, Number(l.cantidad), 'vencido', 'lote vencido');
    } catch (err) {
      alert('No se pudo dar de baja: ' + err.message);
    }
  };

  return (
    <>
      {vencidos.length > 0 && (
        <div className="aviso aviso-atencion flex-col !items-stretch gap-2">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> Hay {vencidos.length} lote(s) vencido(s) con unidades en el inventario</p>
          <ul className="space-y-1.5">
            {vencidos.map(({ p, l }) => (
              <li key={p.id + l.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span><b>{p.nombre}</b> · {nombreLote(l)} · {l.cantidad} unidad(es) · {dinero(l.cantidad * (Number(p.costo) || 0))}</span>
                {puedeRegistrar && <button type="button" onClick={() => bajaRapida({ p, l })} className="btn btn-claro btn-sm">Dar de baja</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Plegable titulo="Producto vencido o dañado" descripcion="Se descuenta del lote y queda como pérdida en Finanzas" icono={<CalendarX size={18} />}>
        {!puedeRegistrar && <p className="aviso aviso-atencion mb-3">🔒 Necesitas el permiso de ventas o de inventario.</p>}
        <form onSubmit={guardar}>
          <fieldset disabled={!puedeRegistrar || guardando} className="space-y-4">
            <div className="segmentado">
              {MOTIVOS.map(m => (
                <button key={m.clave} type="button" onClick={() => setMotivo(m.clave)} className={`segmento ${motivo === m.clave ? 'segmento-activo' : ''}`}>{m.texto}</button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select value={productoId} onChange={(e) => { setProductoId(e.target.value); setLoteId(''); }} className="campo">
                <option value="">Elige el producto…</option>
                {conStock.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <select value={lote?.id || ''} onChange={(e) => setLoteId(e.target.value)} className="campo" disabled={!producto}>
                {lotes.map(l => <option key={l.id} value={l.id}>{nombreLote(l)} · hay {l.cantidad}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input type="number" min="1" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="campo" placeholder="Cantidad" />
              <input value={nota} onChange={(e) => setNota(e.target.value)} className="campo sm:col-span-2" placeholder="Nota (opcional): ej. se cayó la bandeja" />
            </div>
            {error && <p className="aviso aviso-error">{error}</p>}
            {producto && cant > 0 && !error && (
              <p className="aviso aviso-info !text-sm"><span>Pérdida: <b>{dinero(valor)}</b> ({cant} × costo {dinero(producto.costo)})</span></p>
            )}
            {estado && <p className={`aviso ${estado.tipo === 'error' ? 'aviso-error' : 'aviso-ok'}`}>{estado.texto}</p>}
            <button type="submit" disabled={!producto || !(cant > 0) || !!error} className="btn btn-peligro"><Save size={16} /> {guardando ? 'Guardando...' : 'Dar de baja'}</button>
          </fieldset>
        </form>
      </Plegable>
    </>
  );
}
