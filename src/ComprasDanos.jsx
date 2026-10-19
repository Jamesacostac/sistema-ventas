import React, { useMemo, useState } from 'react';
import { doc } from 'firebase/firestore';
import { ShoppingBag, Plus, X, Save, AlertOctagon, Trash2 } from 'lucide-react';
import { Plegable } from './ui';
import {
  variantesDe, nombreVariante, claveVariante, costoReceta, recetaDe, planificarVenta, compararNombres
} from './fabricacion';

/**
 * Compras de materiales (suman stock y quedan como gasto) y daños (descuentan y quedan como pérdida).
 * Las pérdidas se guardan en perdidas/{id}: { fecha, creadoEn, tipo, descripcion, motivo, cantidad, valor }.
 */

const dinero = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const num = (t) => Number(String(t ?? '').replace(',', '.')) || 0;
const redondear = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
// AAAA-MM-DD con la hora de Colombia (igual que las ventas y los gastos)
const fechaLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const Mensaje = ({ estado }) => (estado ? <p className={`aviso ${estado.tipo === 'error' ? 'aviso-error' : 'aviso-ok'}`}>{estado.texto}</p> : null);

const SelectorMaterial = ({ materiales, value, onChange, className = '' }) => {
  const grupos = materiales.reduce((acc, m) => { (acc[m.grupo || 'Sin grupo'] ||= []).push(m); return acc; }, {});
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`campo ${className}`}>
      <option value="">Elige un material…</option>
      {Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b, 'es')).map(([g, lista]) => (
        <optgroup key={g} label={g}>
          {lista.sort((a, b) => compararNombres(a.nombre, b.nombre)).map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </optgroup>
      ))}
    </select>
  );
};

// ---------- Compra de materiales ----------

let siguiente = 1;
const lineaVacia = () => ({ k: siguiente++, materialId: '', cantidad: '', valor: '' });

export function CompraMateriales({ materiales, puedeEditar, operacion, col, docN }) {
  const [lineas, setLineas] = useState([lineaVacia()]);
  const [destino, setDestino] = useState('stock');
  const [proveedor, setProveedor] = useState('');
  const [comoGasto, setComoGasto] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState(null);
  const porId = useMemo(() => Object.fromEntries(materiales.map(m => [m.id, m])), [materiales]);

  const cambiar = (k, campo, valor) => setLineas(ls => ls.map(l => (l.k === k ? { ...l, [campo]: valor } : l)));
  const validas = lineas.filter(l => porId[l.materialId] && num(l.cantidad) > 0 && num(l.valor) > 0);
  const total = validas.reduce((s, l) => s + num(l.valor), 0);

  // Costo nuevo: promedio entre lo que había y lo comprado (si es para stock)
  const resultado = (l) => {
    const m = porId[l.materialId];
    const cant = num(l.cantidad);
    const valor = num(l.valor);
    const stock = Math.max(0, Number(m.stock) || 0);
    if (destino === 'pedido') return { costoPedido: redondear(valor / cant) };
    const costo = stock > 0 && Number(m.costo) > 0 ? (stock * Number(m.costo) + valor) / (stock + cant) : valor / cant;
    return { stock: redondear((Number(m.stock) || 0) + cant, 4), costo: redondear(costo) };
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!puedeEditar) return;
    if (!validas.length) return setEstado({ tipo: 'error', texto: 'Completa al menos un material con cantidad y valor pagado.' });
    setGuardando(true);
    setEstado(null);
    try {
      const resumen = validas.map(l => `${porId[l.materialId].nombre} × ${num(l.cantidad)} (${dinero(num(l.valor))})`).join(', ');
      const op = operacion(destino === 'stock' ? 'Compra de materiales' : 'Compra de materiales para un pedido', `${resumen} — total ${dinero(total)}`);
      validas.forEach(l => {
        const m = porId[l.materialId];
        const cambios = resultado(l);
        op.actualizar(docN('materiales', m.id), cambios, Object.fromEntries(Object.keys(cambios).map(c => [c, m[c] ?? 0])));
      });
      if (comoGasto) {
        op.crear(doc(col('gastos')), {
          concepto: `Materiales: ${validas.map(l => porId[l.materialId].nombre).join(', ')}`.slice(0, 140),
          monto: total,
          tipo: 'Compra Productos',
          detalle: [proveedor.trim(), destino === 'pedido' ? 'para un pedido ya vendido' : ''].filter(Boolean).join(' · ') || 'Compra de materiales',
          fecha: fechaLocal(),
          creadoEn: Date.now()
        });
      }
      await op.guardar();
      setLineas([lineaVacia()]);
      setProveedor('');
      setEstado({ tipo: 'ok', texto: `Compra registrada: ${dinero(total)}${destino === 'stock' ? '. Se sumó al stock y se actualizó el costo.' : '. Se actualizó el costo por pedido.'}` });
    } catch (err) {
      setEstado({ tipo: 'error', texto: 'No se pudo guardar: ' + err.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Plegable titulo="Registrar compra de materiales" descripcion="Suma al stock, actualiza el costo y queda como gasto" icono={<ShoppingBag size={18} />}>
      {!puedeEditar && <p className="aviso aviso-atencion mb-3">🔒 Necesitas los permisos de inventario y de gastos.</p>}
      <form onSubmit={guardar}>
        <fieldset disabled={!puedeEditar || guardando} className="space-y-4">
          <div className="segmentado">
            <button type="button" onClick={() => setDestino('stock')} className={`segmento ${destino === 'stock' ? 'segmento-activo' : ''}`}>Para tener en stock</button>
            <button type="button" onClick={() => setDestino('pedido')} className={`segmento ${destino === 'pedido' ? 'segmento-activo' : ''}`}>Para un pedido ya vendido</button>
          </div>
          <p className="text-xs text-gris-calido">
            {destino === 'stock'
              ? 'Se suma al stock y el costo queda como el promedio entre lo que había y lo que compraste.'
              : 'No se suma al stock (la venta ya lo descontó); se guarda como costo por pedido para las próximas cuentas.'}
          </p>
          <div className="space-y-2">
            {lineas.map(l => {
              const m = porId[l.materialId];
              const listo = m && num(l.cantidad) > 0 && num(l.valor) > 0;
              const r = listo ? resultado(l) : null;
              return (
                <div key={l.k} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <SelectorMaterial materiales={materiales} value={l.materialId} onChange={(v) => cambiar(l.k, 'materialId', v)} className="flex-1 min-w-[12rem]" />
                  <input type="number" min="0" step="any" value={l.cantidad} onChange={(e) => cambiar(l.k, 'cantidad', e.target.value)} className="campo !w-24 text-right" placeholder="Cant." />
                  <input type="number" min="0" step="100" value={l.valor} onChange={(e) => cambiar(l.k, 'valor', e.target.value)} className="campo !w-32 text-right" placeholder="Pagaste $" />
                  <span className="text-[11px] text-gris-calido w-36 shrink-0">
                    {r ? (destino === 'stock' ? `${dinero(num(l.valor) / num(l.cantidad))} c/u · costo queda ${dinero(r.costo)}` : `${dinero(r.costoPedido)} c/u por pedido`) : m ? `por ${m.unidad || 'unidad'}` : ''}
                  </span>
                  <button type="button" onClick={() => setLineas(ls => (ls.length > 1 ? ls.filter(x => x.k !== l.k) : [lineaVacia()]))} className="btn-icono btn-icono-peligro" title="Quitar"><X size={15} /></button>
                </div>
              );
            })}
            <button type="button" onClick={() => setLineas(ls => [...ls, lineaVacia()])} className="btn btn-claro btn-sm"><Plus size={14} /> Otro material</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <label className="etiqueta">Proveedor o nota <span className="font-normal text-gris-calido">(opcional)</span></label>
              <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} className="campo" placeholder="Ej. Papelería del centro" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={comoGasto} onChange={(e) => setComoGasto(e.target.checked)} className="accent-tinta" />
              Registrarlo también como gasto (Finanzas)
            </label>
          </div>
          <Mensaje estado={estado} />
          <button type="submit" className="btn btn-primario"><Save size={16} /> {guardando ? 'Guardando...' : `Registrar compra${total ? ` de ${dinero(total)}` : ''}`}</button>
        </fieldset>
      </form>
    </Plegable>
  );
}

// ---------- Daños y pérdidas ----------

export function RegistrarDano({ materiales, fabricados, puedeRegistrar, operacion, col, docN }) {
  const [tipo, setTipo] = useState('material');
  const [materialId, setMaterialId] = useState('');
  const [productoId, setProductoId] = useState('');
  const [indice, setIndice] = useState(0);
  const [origen, setOrigen] = useState('proceso');
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState(null);
  const porId = useMemo(() => Object.fromEntries(materiales.map(m => [m.id, m])), [materiales]);

  const producto = fabricados.find(p => p.id === productoId);
  const variantes = producto ? variantesDe(producto).map(eleccion => ({
    eleccion, valores: eleccion.map(e => e.valor.id), clave: claveVariante(eleccion.map(e => e.valor.id)), nombre: nombreVariante(eleccion)
  })) : [];
  const variante = variantes[indice] || variantes[0];
  const cant = num(cantidad);
  const listos = producto && variante ? Math.max(0, Number(producto.listos?.[variante.clave]) || 0) : 0;

  // Qué se descuenta y cuánto vale la pérdida
  const calculo = (() => {
    if (!(cant > 0)) return null;
    if (tipo === 'material') {
      const m = porId[materialId];
      if (!m) return null;
      return { valor: cant * (Number(m.costo) || 0), stock: { [m.id]: redondear(Math.max(0, (Number(m.stock) || 0) - cant), 4) }, descripcion: `${m.nombre} × ${cant}` };
    }
    if (!producto || !variante) return null;
    const nombre = `${producto.nombre}${variante.nombre ? ` (${variante.nombre})` : ''} × ${cant}`;
    if (origen === 'listos') {
      if (cant > listos) return { error: `Solo hay ${listos} listo(s) de esa variante.` };
      return {
        valor: cant * costoReceta(recetaDe(producto, variante.eleccion), porId),
        listos: { ...(producto.listos || {}), [variante.clave]: listos - cant },
        descripcion: `${nombre} — de los listos`
      };
    }
    const plan = planificarVenta([{ productoId: producto.id, nombre: producto.nombre, valores: variante.valores, adicionales: [], cantidad: cant }], { [producto.id]: { ...producto, listos: {} } }, porId);
    return { valor: plan.lineas[0].costoTotal, stock: plan.stock, descripcion: `${nombre} — se dañó al hacerlo`, faltantes: plan.faltantes };
  })();

  const guardar = async (e) => {
    e.preventDefault();
    if (!puedeRegistrar || !calculo || calculo.error) return;
    setGuardando(true);
    setEstado(null);
    try {
      const op = operacion('Daño registrado', `${calculo.descripcion} — pérdida ${dinero(calculo.valor)}${motivo.trim() ? ` (${motivo.trim()})` : ''}`);
      Object.entries(calculo.stock || {}).forEach(([id, stock]) => op.actualizar(docN('materiales', id), { stock }, { stock: porId[id]?.stock ?? 0 }));
      if (calculo.listos) op.actualizar(docN('productos', producto.id), { listos: calculo.listos }, { listos: producto.listos || {} });
      op.crear(doc(col('perdidas')), {
        fecha: fechaLocal(),
        creadoEn: Date.now(),
        tipo: tipo === 'material' ? 'Material' : origen === 'listos' ? 'Producto listo' : 'Producto en proceso',
        descripcion: calculo.descripcion,
        motivo: motivo.trim(),
        cantidad: cant,
        valor: Math.round(calculo.valor),
        ...(tipo === 'material' ? { materialId } : { productoId })
      });
      await op.guardar();
      setCantidad('1');
      setMotivo('');
      setEstado({ tipo: 'ok', texto: `Daño registrado: pérdida de ${dinero(calculo.valor)}. Lo ves en Finanzas.` });
    } catch (err) {
      setEstado({ tipo: 'error', texto: 'No se pudo guardar: ' + err.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Plegable titulo="Registrar daño o pérdida" descripcion="Material dañado o producto que tocó repetir" icono={<AlertOctagon size={18} />}>
      {!puedeRegistrar && <p className="aviso aviso-atencion mb-3">🔒 Necesitas el permiso de ventas o de inventario.</p>}
      <form onSubmit={guardar}>
        <fieldset disabled={!puedeRegistrar || guardando} className="space-y-4">
          <div className="segmentado">
            <button type="button" onClick={() => setTipo('material')} className={`segmento ${tipo === 'material' ? 'segmento-activo' : ''}`}>Un material</button>
            <button type="button" onClick={() => setTipo('producto')} className={`segmento ${tipo === 'producto' ? 'segmento-activo' : ''}`}>Un producto completo</button>
          </div>

          {tipo === 'material' ? (
            <SelectorMaterial materiales={materiales} value={materialId} onChange={setMaterialId} />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={productoId} onChange={(e) => { setProductoId(e.target.value); setIndice(0); }} className="campo">
                  <option value="">Elige el producto…</option>
                  {[...fabricados].sort((a, b) => compararNombres(a.nombre, b.nombre)).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                {variantes.length > 1 && (
                  <select value={indice} onChange={(e) => setIndice(Number(e.target.value))} className="campo">
                    {variantes.map((v, i) => <option key={v.clave} value={i}>{v.nombre}</option>)}
                  </select>
                )}
              </div>
              <div className="segmentado">
                <button type="button" onClick={() => setOrigen('proceso')} className={`segmento ${origen === 'proceso' ? 'segmento-activo' : ''}`}>Se dañó al hacerlo</button>
                <button type="button" onClick={() => setOrigen('listos')} className={`segmento ${origen === 'listos' ? 'segmento-activo' : ''}`}>Era de los listos{producto ? ` (${listos})` : ''}</button>
              </div>
              <p className="text-xs text-gris-calido">
                {origen === 'proceso' ? 'Se descuentan todos los materiales de la receta, como si se hubiera hecho.' : 'Se descuenta de lo que ya estaba hecho.'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="etiqueta">Cantidad</label>
              <input type="number" min="0" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="campo" />
            </div>
            <div className="sm:col-span-2">
              <label className="etiqueta">Qué pasó <span className="font-normal text-gris-calido">(opcional)</span></label>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="campo" placeholder="Ej. la película se arrugó en la prensa" />
            </div>
          </div>

          {calculo?.error && <p className="aviso aviso-error">{calculo.error}</p>}
          {calculo && !calculo.error && (
            <p className="aviso aviso-info !text-sm">
              <span>Pérdida: <b>{dinero(calculo.valor)}</b>{calculo.faltantes?.length ? ` · sin stock: ${calculo.faltantes.map(f => f.material.nombre).join(', ')}` : ''}</span>
            </p>
          )}
          <Mensaje estado={estado} />
          <button type="submit" disabled={!calculo || !!calculo.error} className="btn btn-peligro"><Save size={16} /> {guardando ? 'Guardando...' : 'Registrar daño'}</button>
        </fieldset>
      </form>
    </Plegable>
  );
}

// ---------- Pérdidas en Finanzas ----------

export function PerdidasFinanzas({ perdidas, puedeBorrar, operacion, docN }) {
  const mes = fechaLocal().slice(0, 7);
  const delMes = perdidas.filter(p => (p.fecha || '').startsWith(mes));
  const totalMes = delMes.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const total = perdidas.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const recientes = [...perdidas].sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0)).slice(0, 30);

  const borrar = async (p) => {
    if (!puedeBorrar || !confirm(`¿Borrar este registro de pérdida? No devuelve los materiales al stock.\n\n${p.descripcion}`)) return;
    try {
      const op = operacion('Pérdida eliminada', `${p.descripcion} — ${dinero(p.valor)}`);
      op.eliminar(docN('perdidas', p.id), p);
      await op.guardar();
    } catch (err) {
      alert('No se pudo borrar: ' + err.message);
    }
  };

  return (
    <div className="panel overflow-hidden">
      <div className="p-4 md:p-5 border-b-[1.5px] border-linea flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-tinta flex items-center gap-2.5"><AlertOctagon size={18} /> Pérdidas por daños</h2>
        <div className="flex gap-2 text-xs">
          <span className="pastilla pastilla-peligro">Este mes {dinero(totalMes)} · {delMes.length}</span>
          <span className="pastilla pastilla-neutra">Total {dinero(total)}</span>
        </div>
      </div>
      {recientes.length === 0 ? (
        <p className="p-6 text-center text-sm text-gris-calido">Sin daños registrados. Se registran en Inventario → Materiales.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabla w-full text-left border-collapse text-sm">
            <thead>
              <tr>
                <th className="p-3">Fecha</th>
                <th className="p-3">Qué se dañó</th>
                <th className="p-3 hidden md:table-cell">Tipo</th>
                <th className="p-3 text-right">Pérdida</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {recientes.map(p => (
                <tr key={p.id}>
                  <td className="p-3 whitespace-nowrap">{p.fecha}<span className="block text-[10px] text-slate-400">{p.modificadoPorNombre}</span></td>
                  <td className="p-3">{p.descripcion}{p.motivo && <span className="block text-[11px] text-gris-calido">{p.motivo}</span>}</td>
                  <td className="p-3 hidden md:table-cell text-xs">{p.tipo}</td>
                  <td className="p-3 text-right font-semibold whitespace-nowrap">{dinero(p.valor)}</td>
                  <td className="p-3 text-right">
                    {puedeBorrar && <button onClick={() => borrar(p)} className="btn-icono btn-icono-peligro" title="Borrar registro"><Trash2 size={15} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
