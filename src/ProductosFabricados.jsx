import React, { useMemo, useState } from 'react';
import { doc } from 'firebase/firestore';
import {
  Hammer, Plus, Trash2, Save, X, Edit2, ChevronDown, ChevronUp, AlertTriangle, Calculator, Sparkles, Layers, PackageCheck
} from 'lucide-react';
import {
  costoReceta, faltantesReceta, variantesDe, nombreVariante, recetaDe, precioUnitario, precioPorCantidad,
  precioSugerido, gananciaDe, leerCantidad, mostrarCantidad, nuevoId, compararNombres, GANANCIA_POR_DEFECTO,
  planificarVenta, alcanzaPara, claveVariante, combinacionesIncluye, esCombo, incluyeDe
} from './fabricacion';
import { CATALOGO_NOGURI } from './catalogoNoguri';
import { CATALOGO_TAZON } from './catalogoTazon';

/**
 * Productos fabricados: cada uno con su receta de materiales, opciones (talla, base, papel...),
 * adicionales y precios por cantidad. Calcula el costo, la ganancia y un precio sugerido.
 */

const dinero = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-CO');
const pct = (n) => (n === null ? '—' : `${Math.round(n)} %`);
const num = (t) => Number(String(t ?? '').replace(',', '.')) || 0;

// ---------- Conversión producto ⇄ formulario ----------

const lineasAForm = (receta) => (receta || []).map(l => ({ k: nuevoId(), materialId: l.materialId, cantidad: mostrarCantidad(l.cantidad) }));
const lineasADatos = (lineas) => lineas.filter(l => l.materialId).map(l => ({ materialId: l.materialId, cantidad: leerCantidad(l.cantidad) }));

const FORM_VACIO = { nombre: '', categoria: '', precio: '', ganancia: String(GANANCIA_POR_DEFECTO), receta: [], opciones: [], adicionales: [], preciosCantidad: [], incluye: [] };

const aForm = (p) => ({
  nombre: p.nombre || '',
  categoria: p.categoria && p.categoria !== 'Sin categoría' ? p.categoria : '',
  precio: String(p.precio ?? ''),
  ganancia: String(p.ganancia ?? GANANCIA_POR_DEFECTO),
  receta: lineasAForm(p.receta),
  opciones: (p.opciones || []).map(o => ({
    id: o.id || nuevoId(),
    nombre: o.nombre,
    valores: (o.valores || []).map(v => ({ id: v.id || nuevoId(), nombre: v.nombre, precioExtra: String(v.precioExtra ?? 0), receta: lineasAForm(v.receta) }))
  })),
  adicionales: (p.adicionales || []).map(a => ({ id: a.id || nuevoId(), nombre: a.nombre, precio: String(a.precio ?? 0), receta: lineasAForm(a.receta) })),
  preciosCantidad: (p.preciosCantidad || []).map(x => ({ k: nuevoId(), cantidad: String(x.cantidad), precio: String(x.precio) })),
  incluye: (p.incluye || []).map(e => ({
    id: e.id || nuevoId(),
    nombre: e.nombre,
    cantidad: String(e.cantidad ?? 1),
    opciones: (e.opciones || []).map(o => ({ k: nuevoId(), productoId: o.productoId, precioExtra: String(o.precioExtra ?? 0) }))
  }))
});

const aDatos = (f) => ({
  nombre: f.nombre.trim().replace(/\s+/g, ' '),
  categoria: f.categoria.trim() || 'Sin categoría',
  precio: Math.max(0, num(f.precio)),
  ganancia: Math.max(0, num(f.ganancia)),
  receta: lineasADatos(f.receta),
  opciones: f.opciones
    .filter(o => o.nombre.trim() && o.valores.some(v => v.nombre.trim()))
    .map(o => ({
      id: o.id,
      nombre: o.nombre.trim(),
      valores: o.valores.filter(v => v.nombre.trim()).map(v => ({ id: v.id, nombre: v.nombre.trim(), precioExtra: num(v.precioExtra), receta: lineasADatos(v.receta) }))
    })),
  adicionales: f.adicionales.filter(a => a.nombre.trim()).map(a => ({ id: a.id, nombre: a.nombre.trim(), precio: num(a.precio), receta: lineasADatos(a.receta) })),
  preciosCantidad: f.preciosCantidad
    .map(x => ({ cantidad: Math.round(num(x.cantidad)), precio: num(x.precio) }))
    .filter(x => x.cantidad > 1 && x.precio > 0)
    .sort((a, b) => a.cantidad - b.cantidad),
  incluye: (f.incluye || [])
    .filter(e => e.nombre.trim() && e.opciones.some(o => o.productoId))
    .map(e => ({
      id: e.id,
      nombre: e.nombre.trim(),
      cantidad: Math.max(1, Math.round(num(e.cantidad))),
      opciones: e.opciones.filter(o => o.productoId).map(o => ({ productoId: o.productoId, precioExtra: num(o.precioExtra) }))
    }))
});

// Costo y precio de cada variante: opciones elegidas × lo incluido del inventario (en los combos)
const filasCostos = (producto, materialesPorId, inventarioPorId) =>
  variantesDe(producto).flatMap(eleccion => combinacionesIncluye(producto).map(combo => {
    const receta = recetaDe(producto, eleccion);
    const costoIncluido = combo.reduce((s, { espacio, opcion }) => s + (Number(inventarioPorId[opcion.productoId]?.costo) || 0) * (Number(espacio.cantidad) || 1), 0);
    const extra = combo.reduce((s, { opcion }) => s + (Number(opcion.precioExtra) || 0), 0);
    const nombreIncluido = combo.filter(({ espacio }) => espacio.opciones.length > 1).map(({ opcion }) => inventarioPorId[opcion.productoId]?.nombre || '(borrado)').join(' + ');
    return {
      nombre: [nombreVariante(eleccion), nombreIncluido].filter(Boolean).join(' · ') || 'Único',
      costo: costoReceta(receta, materialesPorId) + costoIncluido,
      costoPedido: costoReceta(receta, materialesPorId, true) + costoIncluido,
      precio: precioUnitario(producto, eleccion) + extra,
      faltan: [
        ...faltantesReceta(receta, materialesPorId),
        ...combo.filter(({ opcion }) => !inventarioPorId[opcion.productoId]).map(() => 'un producto incluido que ya no existe')
      ]
    };
  }));

// Costo de la variante más barata (el "costo" que ve el resto de la app)
const costoMinimo = (producto, materialesPorId, inventarioPorId) => {
  const costos = filasCostos(producto, materialesPorId, inventarioPorId).map(f => f.costo);
  return costos.length ? Math.min(...costos) : 0;
};

// ---------- Editor de una receta (lista de materiales con cantidad) ----------

function EditorReceta({ lineas, onChange, materiales, materialesPorId, compacto = false }) {
  const grupos = useMemo(() => materiales.reduce((acc, m) => { (acc[m.grupo || 'Sin grupo'] ||= []).push(m); return acc; }, {}), [materiales]);
  const cambiar = (k, campo, valor) => onChange(lineas.map(l => (l.k === k ? { ...l, [campo]: valor } : l)));

  return (
    <div className="space-y-2">
      {lineas.map(l => {
        const m = materialesPorId[l.materialId];
        const cantidad = leerCantidad(l.cantidad);
        return (
          <div key={l.k} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <select value={l.materialId} onChange={(e) => cambiar(l.k, 'materialId', e.target.value)} className="campo flex-1 min-w-[12rem]">
              <option value="">Elige un material…</option>
              {Object.entries(grupos).map(([g, lista]) => (
                <optgroup key={g} label={g}>
                  {lista.map(mat => <option key={mat.id} value={mat.id}>{mat.nombre}</option>)}
                </optgroup>
              ))}
            </select>
            <input
              value={l.cantidad}
              onChange={(e) => cambiar(l.k, 'cantidad', e.target.value)}
              className={`campo !w-24 text-right ${cantidad > 0 ? '' : '!border-coral'}`}
              placeholder="1 o 1/12"
              title="Cantidad. Para una parte de una hoja escribe 1/12 (una hoja rinde 12)."
            />
            <span className="text-xs text-gris-calido w-24 shrink-0 whitespace-nowrap">
              {m ? `${m.unidad || 'unidad'} · ${Number(m.costo) > 0 ? dinero(cantidad * m.costo) : 'sin costo'}` : ''}
            </span>
            <button type="button" onClick={() => onChange(lineas.filter(x => x.k !== l.k))} className="btn-icono btn-icono-peligro" title="Quitar"><Trash2 size={14} /></button>
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...lineas, { k: nuevoId(), materialId: '', cantidad: '1' }])} className={`btn btn-claro btn-sm ${compacto ? '!text-xs' : ''}`}>
        <Plus size={14} /> Material
      </button>
    </div>
  );
}

// ---------- Tabla de costos y ganancia de un producto ----------

function TablaCostos({ producto, materialesPorId, inventarioPorId }) {
  const ganancia = Number(producto.ganancia ?? GANANCIA_POR_DEFECTO);
  const filas = filasCostos(producto, materialesPorId, inventarioPorId).map(f => ({
    ...f,
    g: gananciaDe(f.precio, f.costo), gPedido: gananciaDe(f.precio, f.costoPedido),
    sugerido: precioSugerido(f.costo, ganancia)
  }));
  const masBarata = filas.reduce((a, b) => (b.costo < a.costo ? b : a), filas[0]);
  const hayPedido = filas.some(f => f.costoPedido !== f.costo);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border-[1.5px] border-linea">
        <table className="tabla w-full text-left border-collapse text-xs md:text-sm">
          <thead>
            <tr>
              <th className="p-2">Variante</th>
              <th className="p-2 text-right">Costo</th>
              <th className="p-2 text-right">Precio</th>
              <th className="p-2 text-right">Ganancia</th>
              <th className="p-2 text-right">Sugerido ({ganancia} %)</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => {
              const bajo = f.g.porcentaje !== null && f.g.porcentaje < ganancia;
              return (
                <tr key={f.nombre}>
                  <td className="p-2 font-semibold">
                    {f.nombre}
                    {f.faltan.length > 0 && <span className="block text-[11px] font-normal text-[#B23A50]">Falta: {f.faltan.join(', ')}</span>}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    {dinero(f.costo)}
                    {f.costoPedido !== f.costo && <span className="block text-[11px] text-gris-calido">por pedido {dinero(f.costoPedido)}</span>}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">{dinero(f.precio)}</td>
                  <td className={`p-2 text-right whitespace-nowrap ${bajo ? 'text-[#B23A50] font-semibold' : 'text-emerald-700'}`}>
                    {dinero(f.g.pesos)} <span className="text-[11px]">({pct(f.g.porcentaje)})</span>
                    {f.costoPedido !== f.costo && (
                      <span className={`block text-[11px] ${f.gPedido.porcentaje !== null && f.gPedido.porcentaje < ganancia ? 'text-[#B23A50]' : 'text-gris-calido'}`}>
                        por pedido {dinero(f.gPedido.pesos)} ({pct(f.gPedido.porcentaje)})
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">{f.faltan.length ? '—' : dinero(f.sugerido)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hayPedido && (
        <p className="text-xs text-gris-calido">Arriba: comprando la prenda o pieza para tener en stock. Debajo: comprándola cuando llega el pedido.</p>
      )}
      {(producto.preciosCantidad || []).length > 0 && masBarata && (
        <p className="text-xs text-gris-calido">
          Por cantidad ({masBarata.nombre}):{' '}
          {producto.preciosCantidad.map(x => {
            const total = precioPorCantidad(producto, x.cantidad, masBarata.precio);
            const porUnidad = total / x.cantidad;
            return `${x.cantidad} por ${dinero(total)} → ${dinero(porUnidad)} c/u, ganancia ${dinero(porUnidad - masBarata.costo)} c/u`;
          }).join(' · ')}
        </p>
      )}
      {(producto.adicionales || []).length > 0 && (
        <p className="text-xs text-gris-calido">
          Adicionales: {producto.adicionales.map(a => {
            const costo = costoReceta(a.receta, materialesPorId);
            return `${a.nombre} +${dinero(a.precio)}${costo > 0 ? ` (cuesta ${dinero(costo)})` : ''}`;
          }).join(' · ')}
        </p>
      )}
    </div>
  );
}

// ---------- Vista principal ----------

export default function ProductosFabricados({ productos, materiales, categorias, puedeEditar, operacion, col, docN, negocio }) {
  const [form, setForm] = useState(null); // null = cerrado
  const [editandoId, setEditandoId] = useState(null);
  const [abiertoId, setAbiertoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState(null);

  const materialesPorId = useMemo(() => Object.fromEntries(materiales.map(m => [m.id, m])), [materiales]);
  const materialesOrdenados = useMemo(
    () => [...materiales].sort((a, b) => (a.grupo || '').localeCompare(b.grupo || '', 'es') || compararNombres(a.nombre, b.nombre)),
    [materiales]
  );
  // Productos del inventario (bebidas, mecato...) que pueden ir incluidos en un combo
  const inventario = useMemo(() => productos.filter(p => !p.fabricado).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [productos]);
  const inventarioPorId = useMemo(() => Object.fromEntries(inventario.map(p => [p.id, p])), [inventario]);
  const fabricados = productos.filter(p => p.fabricado).sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '', 'es') || compararNombres(a.nombre, b.nombre));
  const nombresCategorias = [...new Set([...categorias.map(c => c.nombre), ...fabricados.map(p => p.categoria)].filter(c => c && c !== 'Sin categoría'))];

  const abrirNuevo = () => { setEditandoId(null); setForm({ ...FORM_VACIO }); setEstado(null); };
  const abrirEdicion = (p) => { setEditandoId(p.id); setForm(aForm(p)); setEstado(null); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const cerrar = () => { setForm(null); setEditandoId(null); };

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));
  const setOpcion = (id, cambios) => set('opciones', form.opciones.map(o => (o.id === id ? { ...o, ...cambios } : o)));
  const setValor = (oid, vid, cambios) => setOpcion(oid, { valores: form.opciones.find(o => o.id === oid).valores.map(v => (v.id === vid ? { ...v, ...cambios } : v)) });
  const setAdicional = (id, cambios) => set('adicionales', form.adicionales.map(a => (a.id === id ? { ...a, ...cambios } : a)));
  const setEspacio = (id, cambios) => set('incluye', form.incluye.map(e => (e.id === id ? { ...e, ...cambios } : e)));
  const setOpcionIncluida = (eid, k, cambios) => setEspacio(eid, { opciones: form.incluye.find(e => e.id === eid).opciones.map(o => (o.k === k ? { ...o, ...cambios } : o)) });

  const guardar = async () => {
    if (!puedeEditar || !form) return;
    const datos = aDatos(form);
    if (!datos.nombre) return setEstado({ tipo: 'error', texto: 'Escribe el nombre del producto.' });
    if (!(datos.precio > 0)) return setEstado({ tipo: 'error', texto: 'Escribe el precio de venta.' });
    const repetido = productos.find(p => p.id !== editandoId && p.nombre.toLowerCase() === datos.nombre.toLowerCase());
    if (repetido) return setEstado({ tipo: 'error', texto: `Ya existe un producto llamado "${repetido.nombre}".` });
    const costo = costoMinimo(datos, materialesPorId, inventarioPorId);

    setGuardando(true);
    setEstado(null);
    try {
      if (editandoId) {
        const antes = productos.find(p => p.id === editandoId);
        const op = operacion('Producto fabricado editado', `${datos.nombre} — precio ${dinero(datos.precio)}, costo ${dinero(costo)}`);
        op.actualizar(docN('productos', editandoId), { ...datos, costo, fabricado: true }, antes);
        await op.guardar();
      } else {
        const op = operacion('Producto fabricado creado', `${datos.nombre} — precio ${dinero(datos.precio)}, costo ${dinero(costo)}`);
        op.crear(doc(col('productos')), { ...datos, costo, fabricado: true, codigos: [], stock: 0, lotes: [] });
        await op.guardar();
      }
      setEstado({ tipo: 'ok', texto: `"${datos.nombre}" guardado.` });
      cerrar();
    } catch (err) {
      setEstado({ tipo: 'error', texto: 'No se pudo guardar: ' + err.message });
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (p) => {
    if (!puedeEditar || !confirm(`¿Eliminar "${p.nombre}"? Las ventas que ya se hicieron no cambian.`)) return;
    try {
      const op = operacion('Producto fabricado eliminado', p.nombre);
      op.eliminar(docN('productos', p.id), p);
      await op.guardar();
      if (editandoId === p.id) cerrar();
    } catch (err) {
      alert('No se pudo eliminar: ' + err.message);
    }
  };

  // Crea los materiales y productos del catálogo de Noguri que todavía no existan
  const cargarCatalogo = async () => {
    if (!puedeEditar) return;
    const { materiales: mats, productos: prods } = CATALOGO_NOGURI;
    if (!confirm(`Se crearán ${mats.length} materiales y ${prods.length} productos del catálogo de Noguri, con los costos y el stock de la hoja de inventario (los que ya existan con el mismo nombre se dejan como están). ¿Continuar?`)) return;
    setGuardando(true);
    setEstado(null);
    try {
      const op = operacion('Catálogo de Noguri cargado', `${prods.length} productos y ${mats.length} materiales`);
      const idPorClave = {};
      let nuevosMateriales = 0;
      mats.forEach(m => {
        const existente = materiales.find(x => x.nombre.toLowerCase() === m.nombre.toLowerCase());
        if (existente) { idPorClave[m.clave] = existente.id; return; }
        const { clave, ...datos } = m;
        idPorClave[clave] = op.crear(doc(col('materiales')), { ...datos, minimo: 0 }).id;
        nuevosMateriales++;
      });
      const receta = (lineas) => (lineas || []).map(l => ({ materialId: idPorClave[l.material], cantidad: l.cantidad }));
      let nuevosProductos = 0;
      prods.forEach(p => {
        if (productos.some(x => x.nombre.toLowerCase() === p.nombre.toLowerCase())) return;
        op.crear(doc(col('productos')), {
          nombre: p.nombre,
          categoria: p.categoria,
          precio: p.precio,
          ganancia: GANANCIA_POR_DEFECTO,
          receta: receta(p.receta),
          opciones: (p.opciones || []).map(o => ({ id: nuevoId(), nombre: o.nombre, valores: o.valores.map(v => ({ id: nuevoId(), nombre: v.nombre, precioExtra: v.precioExtra, receta: receta(v.receta) })) })),
          adicionales: (p.adicionales || []).map(a => ({ id: nuevoId(), nombre: a.nombre, precio: a.precio, receta: receta(a.receta) })),
          preciosCantidad: p.preciosCantidad || [],
          listos: p.listos ? { [claveVariante([])]: p.listos } : {},
          costo: 0,
          fabricado: true,
          codigos: [],
          stock: 0,
          lotes: []
        });
        nuevosProductos++;
      });
      const nuevasCategorias = [...new Set(prods.map(p => p.categoria))].filter(c => !categorias.some(x => x.nombre.toLowerCase() === c.toLowerCase()));
      nuevasCategorias.forEach(nombre => op.crear(doc(col('categorias')), { nombre }));
      if (op.vacia) {
        setEstado({ tipo: 'ok', texto: 'El catálogo ya estaba cargado.' });
      } else {
        await op.guardar();
        setEstado({ tipo: 'ok', texto: `Listo: ${nuevosProductos} producto(s) y ${nuevosMateriales} material(es), con los costos y el stock de la hoja de inventario. Revisa en Materiales lo que haya cambiado.` });
      }
    } catch (err) {
      setEstado({ tipo: 'error', texto: 'No se pudo cargar el catálogo: ' + err.message });
    } finally {
      setGuardando(false);
    }
  };

  // Crea los materiales, platos y combos de Tazón para Dos que todavía no existan, y completa
  // los combos ya creados con las opciones que les falten (p. ej. una bebida que no se encontró).
  // Las bebidas y el mecato de los combos se buscan por nombre en el inventario.
  const normalizar = (texto) => String(texto || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const idProducto = (nombre) => inventario.find(p => normalizar(p.nombre) === normalizar(nombre))?.id;
  const opcionesCatalogo = (espacio, noEncontrados) => espacio.opciones
    .map(o => {
      const productoId = idProducto(o.producto);
      if (!productoId) noEncontrados?.add(o.producto);
      return productoId ? { productoId, precioExtra: o.precioExtra } : null;
    })
    .filter(Boolean);
  const combosTazonPendientes = CATALOGO_TAZON.productos.filter(p => !productos.some(x => normalizar(x.nombre) === normalizar(p.nombre)));
  // Combos ya creados a los que les falta alguna opción del catálogo que ahora sí está en el inventario
  const combosTazonIncompletos = CATALOGO_TAZON.productos.flatMap(p => {
    const existente = fabricados.find(x => normalizar(x.nombre) === normalizar(p.nombre));
    if (!existente || !(p.incluye || []).length) return [];
    const incluye = p.incluye.map(e => {
      const actual = (existente.incluye || []).find(x => normalizar(x.nombre) === normalizar(e.nombre));
      const delCatalogo = opcionesCatalogo(e);
      const otras = (actual?.opciones || []).filter(o => !delCatalogo.some(c => c.productoId === o.productoId));
      return { id: actual?.id || nuevoId(), nombre: e.nombre, cantidad: e.cantidad, opciones: [...delCatalogo, ...otras] };
    }).filter(e => e.opciones.length > 0);
    const faltaAlgo = incluye.some(e => {
      const actual = (existente.incluye || []).find(x => x.id === e.id);
      return !actual || e.opciones.some(o => !actual.opciones.some(a => a.productoId === o.productoId));
    });
    return faltaAlgo ? [{ existente, incluye }] : [];
  });
  const cargarCombosTazon = async () => {
    if (!puedeEditar) return;
    const { materiales: mats } = CATALOGO_TAZON;
    if (!confirm(`Se crearán ${combosTazonPendientes.length} platos y combos (y los materiales de empanadas y nuggets que falten, con stock 0) y se completarán ${combosTazonIncompletos.length} combo(s) a los que les faltan opciones. ¿Continuar?`)) return;
    setGuardando(true);
    setEstado(null);
    try {
      const op = operacion('Platos y combos de Tazón cargados', `${combosTazonPendientes.length} nuevos, ${combosTazonIncompletos.length} completados`);
      combosTazonIncompletos.forEach(({ existente, incluye }) => {
        const datos = { ...existente, incluye };
        op.actualizar(docN('productos', existente.id), { incluye, costo: costoMinimo(datos, materialesPorId, inventarioPorId) }, existente);
      });
      const idPorClave = {};
      const materialesTemp = { ...materialesPorId };
      let nuevosMateriales = 0;
      mats.forEach(m => {
        const existente = materiales.find(x => x.nombre.toLowerCase() === m.nombre.toLowerCase());
        if (existente) { idPorClave[m.clave] = existente.id; return; }
        const { clave, ...datos } = m;
        const id = op.crear(doc(col('materiales')), { ...datos, minimo: 0 }).id;
        idPorClave[clave] = id;
        materialesTemp[id] = { id, ...datos };
        nuevosMateriales++;
      });
      const noEncontrados = new Set();
      combosTazonPendientes.forEach(p => {
        const incluye = (p.incluye || []).map(e => ({ id: nuevoId(), nombre: e.nombre, cantidad: e.cantidad, opciones: opcionesCatalogo(e, noEncontrados) }));
        const datos = {
          nombre: p.nombre,
          categoria: p.categoria,
          precio: p.precio,
          ganancia: 50,
          receta: (p.receta || []).map(l => ({ materialId: idPorClave[l.material], cantidad: l.cantidad })),
          opciones: [],
          adicionales: [],
          preciosCantidad: p.preciosCantidad || [],
          incluye: incluye.filter(e => e.opciones.length > 0)
        };
        op.crear(doc(col('productos')), {
          ...datos,
          costo: costoMinimo(datos, materialesTemp, inventarioPorId),
          listos: {},
          fabricado: true,
          codigos: [],
          stock: 0,
          lotes: []
        });
      });
      const nuevasCategorias = [...new Set(combosTazonPendientes.map(p => p.categoria))].filter(c => !categorias.some(x => x.nombre.toLowerCase() === c.toLowerCase()));
      nuevasCategorias.forEach(nombre => op.crear(doc(col('categorias')), { nombre }));
      await op.guardar();
      setEstado({
        tipo: noEncontrados.size ? 'error' : 'ok',
        texto: `Listo: ${combosTazonPendientes.length} plato(s) y combo(s) nuevos, ${combosTazonIncompletos.length} completado(s) y ${nuevosMateriales} material(es).`
          + (noEncontrados.size ? ` No se encontraron en el inventario: ${[...noEncontrados].join(', ')} (quedaron fuera de los combos).` : '')
          + ' Registra las bolsas de empanadas y nuggets en Inventario → Materiales.'
      });
    } catch (err) {
      setEstado({ tipo: 'error', texto: 'No se pudieron cargar los combos: ' + err.message });
    } finally {
      setGuardando(false);
    }
  };

  const vista = form ? aDatos(form) : null;
  const editorReceta = (lineas, onChange, compacto) => (
    <EditorReceta lineas={lineas} onChange={onChange} materiales={materialesOrdenados} materialesPorId={materialesPorId} compacto={compacto} />
  );

  return (
    <div className="space-y-6">
      <div className="panel p-4 md:p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-tinta flex items-center gap-2.5"><Hammer size={18} /> Productos fabricados</h2>
          <p className="text-xs text-gris-calido mt-1">Cada producto con los materiales que gasta. La app calcula el costo, la ganancia y un precio sugerido.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {fabricados.length === 0 && /noguri/i.test(negocio?.nombre || '') && (
            <button onClick={cargarCatalogo} disabled={!puedeEditar || guardando} className="btn btn-claro"><Sparkles size={16} /> Cargar catálogo de Noguri</button>
          )}
          {(combosTazonPendientes.length > 0 || combosTazonIncompletos.length > 0) && /taz[oó]n/i.test(negocio?.nombre || '') && (
            <button onClick={cargarCombosTazon} disabled={!puedeEditar || guardando} className="btn btn-claro">
              <Sparkles size={16} /> {combosTazonPendientes.length > 0 ? 'Cargar platos y combos' : `Completar ${combosTazonIncompletos.length} combo(s)`}
            </button>
          )}
          <button onClick={abrirNuevo} disabled={!puedeEditar || !!form} className="btn btn-primario"><Plus size={16} /> Nuevo producto</button>
        </div>
      </div>

      {!puedeEditar && <p className="aviso aviso-atencion">🔒 Solo lectura: necesitas el permiso de inventario para cambiar productos.</p>}
      {estado && !form && <p className={`aviso ${estado.tipo === 'error' ? 'aviso-error' : 'aviso-ok'}`}>{estado.texto}</p>}
      {materiales.length === 0 && (
        <p className="aviso aviso-info">Primero agrega los materiales (Inventario → Materiales) para poder armar las recetas.</p>
      )}

      {form && (
        <div className="panel p-5 md:p-6 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-bold text-tinta">{editandoId ? `Editar: ${form.nombre}` : 'Nuevo producto fabricado'}</h3>
            <button onClick={cerrar} className="btn-icono" title="Cerrar"><X size={18} /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <label className="etiqueta">Nombre</label>
              <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} className="campo" placeholder="Ej. Botón metálico 37 mm" />
            </div>
            <div>
              <label className="etiqueta">Categoría</label>
              <input list="categorias-fabricados" value={form.categoria} onChange={(e) => set('categoria', e.target.value)} className="campo" placeholder="Ej. Botones" />
              <datalist id="categorias-fabricados">{nombresCategorias.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="etiqueta">Precio</label>
                <input type="number" min="0" step="100" value={form.precio} onChange={(e) => set('precio', e.target.value)} className="campo" />
              </div>
              <div>
                <label className="etiqueta" title="Ganancia deseada sobre el costo, para el precio sugerido">% ganancia</label>
                <input type="number" min="0" step="5" value={form.ganancia} onChange={(e) => set('ganancia', e.target.value)} className="campo" />
              </div>
            </div>
          </div>

          <section className="space-y-2">
            <h4 className="font-bold text-tinta text-sm">Materiales que gasta siempre</h4>
            <p className="text-xs text-gris-calido">Para una parte de una hoja escribe la fracción: si una hoja rinde 12 stickers, pon <b>1/12</b>.</p>
            {editorReceta(form.receta, (r) => set('receta', r))}
          </section>

          <section className="space-y-3">
            <div>
              <h4 className="font-bold text-tinta text-sm">Opciones</h4>
              <p className="text-xs text-gris-calido">Algo que el cliente elige, como la talla o el tipo de base. Cada valor puede cambiar el precio y gastar sus propios materiales.</p>
            </div>
            {form.opciones.map(o => (
              <div key={o.id} className="rounded-xl border-[1.5px] border-linea p-3 md:p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <input value={o.nombre} onChange={(e) => setOpcion(o.id, { nombre: e.target.value })} className="campo font-semibold" placeholder="Ej. Talla" />
                  <button type="button" onClick={() => set('opciones', form.opciones.filter(x => x.id !== o.id))} className="btn-icono btn-icono-peligro" title="Quitar opción"><Trash2 size={15} /></button>
                </div>
                {o.valores.map(v => (
                  <div key={v.id} className="rounded-lg bg-crema/60 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <input value={v.nombre} onChange={(e) => setValor(o.id, v.id, { nombre: e.target.value })} className="campo flex-1 min-w-[8rem]" placeholder="Ej. M" />
                      <label className="text-xs text-gris-calido flex items-center gap-1.5 whitespace-nowrap">
                        Precio +
                        <input type="number" step="100" value={v.precioExtra} onChange={(e) => setValor(o.id, v.id, { precioExtra: e.target.value })} className="campo !w-28 text-right" />
                      </label>
                      <button type="button" onClick={() => setOpcion(o.id, { valores: o.valores.filter(x => x.id !== v.id) })} className="btn-icono btn-icono-peligro" title="Quitar valor"><X size={15} /></button>
                    </div>
                    {editorReceta(v.receta, (r) => setValor(o.id, v.id, { receta: r }), true)}
                  </div>
                ))}
                <button type="button" onClick={() => setOpcion(o.id, { valores: [...o.valores, { id: nuevoId(), nombre: '', precioExtra: '0', receta: [] }] })} className="btn btn-claro btn-sm">
                  <Plus size={14} /> Valor
                </button>
              </div>
            ))}
            <button type="button" onClick={() => set('opciones', [...form.opciones, { id: nuevoId(), nombre: '', valores: [{ id: nuevoId(), nombre: '', precioExtra: '0', receta: [] }] }])} className="btn btn-claro btn-sm">
              <Plus size={14} /> Opción
            </button>
          </section>

          <section className="space-y-3">
            <div>
              <h4 className="font-bold text-tinta text-sm">Adicionales</h4>
              <p className="text-xs text-gris-calido">Extras que se suman al precio si el cliente los pide, como el estampado en 2 lados.</p>
            </div>
            {form.adicionales.map(a => (
              <div key={a.id} className="rounded-lg bg-crema/60 p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input value={a.nombre} onChange={(e) => setAdicional(a.id, { nombre: e.target.value })} className="campo flex-1 min-w-[10rem]" placeholder="Ej. Estampado 2 lados" />
                  <label className="text-xs text-gris-calido flex items-center gap-1.5 whitespace-nowrap">
                    Precio +
                    <input type="number" step="100" value={a.precio} onChange={(e) => setAdicional(a.id, { precio: e.target.value })} className="campo !w-28 text-right" />
                  </label>
                  <button type="button" onClick={() => set('adicionales', form.adicionales.filter(x => x.id !== a.id))} className="btn-icono btn-icono-peligro" title="Quitar"><X size={15} /></button>
                </div>
                {editorReceta(a.receta, (r) => setAdicional(a.id, { receta: r }), true)}
              </div>
            ))}
            <button type="button" onClick={() => set('adicionales', [...form.adicionales, { id: nuevoId(), nombre: '', precio: '0', receta: [] }])} className="btn btn-claro btn-sm">
              <Plus size={14} /> Adicional
            </button>
          </section>

          <section className="space-y-3">
            <div>
              <h4 className="font-bold text-tinta text-sm">Incluye del inventario (combos)</h4>
              <p className="text-xs text-gris-calido">
                Productos del inventario que van en el combo, como la bebida o un paquete de papas. Si un espacio tiene varias opciones,
                al vender se elige cuál (y su sabor) y se descuenta de sus lotes. El precio extra se suma al del combo.
              </p>
            </div>
            {form.incluye.map(e => (
              <div key={e.id} className="rounded-xl border-[1.5px] border-linea p-3 md:p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <input value={e.nombre} onChange={(ev) => setEspacio(e.id, { nombre: ev.target.value })} className="campo font-semibold" placeholder="Ej. Bebida" />
                  <label className="text-xs text-gris-calido flex items-center gap-1.5 whitespace-nowrap">
                    Cantidad
                    <input type="number" min="1" step="1" value={e.cantidad} onChange={(ev) => setEspacio(e.id, { cantidad: ev.target.value })} className="campo !w-20 text-right" />
                  </label>
                  <button type="button" onClick={() => set('incluye', form.incluye.filter(x => x.id !== e.id))} className="btn-icono btn-icono-peligro" title="Quitar espacio"><Trash2 size={15} /></button>
                </div>
                {e.opciones.map(o => {
                  const prod = inventarioPorId[o.productoId];
                  return (
                    <div key={o.k} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                      <select value={o.productoId} onChange={(ev) => setOpcionIncluida(e.id, o.k, { productoId: ev.target.value })} className="campo flex-1 min-w-[12rem]">
                        <option value="">Elige un producto…</option>
                        {inventario.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                      <label className="text-xs text-gris-calido flex items-center gap-1.5 whitespace-nowrap">
                        Precio +
                        <input type="number" step="100" value={o.precioExtra} onChange={(ev) => setOpcionIncluida(e.id, o.k, { precioExtra: ev.target.value })} className="campo !w-24 text-right" />
                      </label>
                      <span className="text-xs text-gris-calido w-24 shrink-0 whitespace-nowrap">{prod ? `cuesta ${dinero(prod.costo)}` : ''}</span>
                      <button type="button" onClick={() => setEspacio(e.id, { opciones: e.opciones.filter(x => x.k !== o.k) })} className="btn-icono btn-icono-peligro" title="Quitar"><X size={15} /></button>
                    </div>
                  );
                })}
                <button type="button" onClick={() => setEspacio(e.id, { opciones: [...e.opciones, { k: nuevoId(), productoId: '', precioExtra: '0' }] })} className="btn btn-claro btn-sm">
                  <Plus size={14} /> Opción
                </button>
              </div>
            ))}
            <button type="button" onClick={() => set('incluye', [...form.incluye, { id: nuevoId(), nombre: '', cantidad: '1', opciones: [{ k: nuevoId(), productoId: '', precioExtra: '0' }] }])} className="btn btn-claro btn-sm">
              <Plus size={14} /> Espacio (ej. Bebida)
            </button>
          </section>

          <section className="space-y-2">
            <div>
              <h4 className="font-bold text-tinta text-sm">Precios por cantidad</h4>
              <p className="text-xs text-gris-calido">Ej.: 2 botones por $3.500. Al vender más, se usan primero los paquetes más grandes.</p>
            </div>
            {form.preciosCantidad.map(x => (
              <div key={x.k} className="flex items-center gap-2 text-sm">
                <input type="number" min="2" step="1" value={x.cantidad} onChange={(e) => set('preciosCantidad', form.preciosCantidad.map(y => (y.k === x.k ? { ...y, cantidad: e.target.value } : y)))} className="campo !w-20 text-right" />
                <span className="text-gris-calido">por</span>
                <input type="number" min="0" step="100" value={x.precio} onChange={(e) => set('preciosCantidad', form.preciosCantidad.map(y => (y.k === x.k ? { ...y, precio: e.target.value } : y)))} className="campo !w-32 text-right" />
                <button type="button" onClick={() => set('preciosCantidad', form.preciosCantidad.filter(y => y.k !== x.k))} className="btn-icono btn-icono-peligro" title="Quitar"><X size={15} /></button>
              </div>
            ))}
            <button type="button" onClick={() => set('preciosCantidad', [...form.preciosCantidad, { k: nuevoId(), cantidad: '2', precio: '' }])} className="btn btn-claro btn-sm">
              <Plus size={14} /> Precio por cantidad
            </button>
          </section>

          <section className="space-y-2">
            <h4 className="font-bold text-tinta text-sm flex items-center gap-2"><Calculator size={16} /> Costo y ganancia</h4>
            <TablaCostos producto={vista} materialesPorId={materialesPorId} inventarioPorId={inventarioPorId} />
          </section>

          {estado && <p className={`aviso ${estado.tipo === 'error' ? 'aviso-error' : 'aviso-ok'}`}>{estado.texto}</p>}
          <div className="flex flex-wrap gap-2">
            <button onClick={guardar} disabled={!puedeEditar || guardando} className="btn btn-primario"><Save size={16} /> {guardando ? 'Guardando...' : 'Guardar producto'}</button>
            <button onClick={cerrar} className="btn btn-claro">Cancelar</button>
          </div>
        </div>
      )}

      {fabricados.length === 0 ? (
        !form && <p className="panel p-8 text-center text-sm text-gris-calido">Todavía no hay productos fabricados.</p>
      ) : (
        <div className="space-y-3">
          {fabricados.map(p => {
            const variantes = filasCostos(p, materialesPorId, inventarioPorId).map(f => ({ ...f, faltan: f.faltan.length }));
            const costos = variantes.map(v => v.costo);
            const precios = variantes.map(v => v.precio);
            // Rango de ganancia: la peor (comprando por pedido) y la mejor (con lo que hay en stock)
            const porcentajes = (campo) => variantes.map(v => gananciaDe(v.precio, v[campo]).porcentaje).filter(x => x !== null);
            const peor = Math.min(...porcentajes('costoPedido'), ...porcentajes('costo'));
            const mejor = Math.max(...porcentajes('costo'));
            const peorEnStock = Math.min(...porcentajes('costo'));
            const faltan = variantes.some(v => v.faltan);
            const objetivo = Number(p.ganancia ?? GANANCIA_POR_DEFECTO);
            const rango = (lista) => (Math.min(...lista) === Math.max(...lista) ? dinero(lista[0]) : `${dinero(Math.min(...lista))} – ${dinero(Math.max(...lista))}`);
            const abierto = abiertoId === p.id;
            return (
              <div key={p.id} className="panel overflow-hidden">
                <div className="p-4 flex flex-wrap items-center gap-3">
                  <button onClick={() => setAbiertoId(abierto ? null : p.id)} className="flex-1 min-w-[14rem] text-left flex items-center gap-3">
                    {abierto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    <span>
                      <span className="font-bold text-tinta">{p.nombre}</span>
                      <span className="block text-xs text-gris-calido">
                        {p.categoria} · {[
                          ...(p.opciones || []).map(o => `${o.nombre}: ${o.valores.length}`),
                          ...incluyeDe(p).filter(e => e.opciones.length > 1).map(e => `${e.nombre}: ${e.opciones.length} a elegir`)
                        ].join(' · ') || 'sin opciones'}
                        {(p.preciosCantidad || []).length > 0 && ` · ${p.preciosCantidad.map(x => `${x.cantidad} por ${dinero(x.precio)}`).join(', ')}`}
                      </span>
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="pastilla pastilla-neutra">Precio {rango(precios)}</span>
                    <span className="pastilla pastilla-neutra">Costo {rango(costos)}</span>
                    {faltan
                      ? <span className="pastilla pastilla-pendiente"><AlertTriangle size={11} /> Faltan datos</span>
                      : <span className={`pastilla ${peorEnStock < objetivo ? 'pastilla-peligro' : 'pastilla-ok'}`}>Ganancia {Math.round(peor) === Math.round(mejor) ? pct(peor) : `${Math.round(peor)} – ${pct(mejor)}`}</span>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => abrirEdicion(p)} disabled={!puedeEditar || !!form} className="btn-icono" title="Editar"><Edit2 size={15} /></button>
                    <button onClick={() => eliminar(p)} disabled={!puedeEditar} className="btn-icono btn-icono-peligro" title="Eliminar"><Trash2 size={15} /></button>
                  </div>
                </div>
                {abierto && (
                  <div className="px-4 pb-4 pt-3 border-t-[1.5px] border-dashed border-linea space-y-3">
                    {(p.receta || []).length > 0 && (
                      <p className="text-xs text-gris-calido flex flex-wrap items-center gap-1.5">
                        <Layers size={13} /> Siempre gasta: {p.receta.map(l => `${mostrarCantidad(l.cantidad)} ${materialesPorId[l.materialId]?.nombre || '(material borrado)'}`).join(', ')}
                      </p>
                    )}
                    {esCombo(p) && (
                      <p className="text-xs text-gris-calido flex flex-wrap items-center gap-1.5">
                        <PackageCheck size={13} /> Incluye: {p.incluye.map(e => `${e.cantidad > 1 ? `${e.cantidad} ` : ''}${e.opciones.length > 1 ? `${e.nombre} (${e.opciones.map(o => inventarioPorId[o.productoId]?.nombre || '(borrado)').join(', ')})` : inventarioPorId[e.opciones[0].productoId]?.nombre || '(borrado)'}`).join(' + ')}
                      </p>
                    )}
                    <TablaCostos producto={p} materialesPorId={materialesPorId} inventarioPorId={inventarioPorId} />
                    {/* Un combo no se arma por adelantado: lo incluido sale del inventario al vender */}
                    {!esCombo(p) && <ListosProducto producto={p} materialesPorId={materialesPorId} puedeEditar={puedeEditar} operacion={operacion} docN={docN} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Listos para vender: lo que ya está hecho ----------

function ListosProducto({ producto, materialesPorId, puedeEditar, operacion, docN }) {
  const variantes = variantesDe(producto).map(eleccion => {
    const valores = eleccion.map(e => e.valor.id);
    return { valores, clave: claveVariante(valores), nombre: nombreVariante(eleccion) || producto.nombre };
  });
  const [indice, setIndice] = useState(0);
  const [cantidad, setCantidad] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState(null);
  const elegida = variantes[indice] || variantes[0];
  const listos = (clave) => Math.max(0, Number(producto.listos?.[clave]) || 0);
  const n = Math.round(num(cantidad));
  const detalleVariante = elegida.nombre !== producto.nombre ? ` (${elegida.nombre})` : '';

  // Armar por adelantado: gasta los materiales y suma a los listos
  const armar = async () => {
    if (!puedeEditar || !(n > 0)) return;
    const plan = planificarVenta(
      [{ productoId: producto.id, nombre: producto.nombre, valores: elegida.valores, adicionales: [], cantidad: n }],
      { [producto.id]: { ...producto, listos: {} } },
      materialesPorId
    );
    if (plan.faltantes.length && !confirm(`No alcanzan: ${plan.faltantes.map(f => `${f.material.nombre} (faltan ${Math.round(f.cantidad * 100) / 100})`).join(', ')}.\n\n¿Registrarlo igual? Esos materiales quedarán en 0.`)) return;
    setGuardando(true);
    setEstado(null);
    try {
      const op = operacion('Productos armados', `${n} × ${producto.nombre}${detalleVariante} — costo ${dinero(plan.lineas[0].costoTotal)}`);
      Object.entries(plan.stock).forEach(([id, stock]) => op.actualizar(docN('materiales', id), { stock }, { stock: materialesPorId[id]?.stock ?? 0 }));
      op.actualizar(docN('productos', producto.id), { listos: { ...(producto.listos || {}), [elegida.clave]: listos(elegida.clave) + n } }, { listos: producto.listos || {} });
      await op.guardar();
      setCantidad('');
      setEstado({ tipo: 'ok', texto: `Listo: ${n} armado(s). Se descontaron los materiales.` });
    } catch (err) {
      setEstado({ tipo: 'error', texto: 'No se pudo guardar: ' + err.message });
    } finally {
      setGuardando(false);
    }
  };

  // Corregir el conteo (inventario físico): no toca los materiales
  const corregir = async () => {
    if (!puedeEditar || cantidad === '' || n < 0) return;
    setGuardando(true);
    setEstado(null);
    try {
      const op = operacion('Listos corregidos', `${producto.nombre}${detalleVariante}: ${listos(elegida.clave)} → ${n}`);
      op.actualizar(docN('productos', producto.id), { listos: { ...(producto.listos || {}), [elegida.clave]: n } }, { listos: producto.listos || {} });
      await op.guardar();
      setCantidad('');
      setEstado({ tipo: 'ok', texto: 'Cantidad corregida.' });
    } catch (err) {
      setEstado({ tipo: 'error', texto: 'No se pudo guardar: ' + err.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="rounded-xl bg-crema/60 p-3 md:p-4 space-y-3">
      <div>
        <h4 className="font-bold text-tinta text-sm flex items-center gap-2"><PackageCheck size={16} /> Listos para vender</h4>
        <p className="text-xs text-gris-calido">Lo ya hecho se vende primero. Lo demás se arma al vender y descuenta materiales.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {variantes.map(v => {
          const alcanza = alcanzaPara(producto, v.valores, materialesPorId);
          return (
            <span key={v.clave} className={`pastilla ${listos(v.clave) > 0 ? 'pastilla-ok' : 'pastilla-neutra'}`}>
              {variantes.length > 1 ? `${v.nombre}: ` : ''}{listos(v.clave)} listo(s){alcanza !== null ? ` · alcanza para ${alcanza}` : ''}
            </span>
          );
        })}
      </div>
      {puedeEditar && (
        <div className="flex flex-wrap items-center gap-2">
          {variantes.length > 1 && (
            <select value={indice} onChange={(e) => setIndice(Number(e.target.value))} className="campo !w-auto">
              {variantes.map((v, i) => <option key={v.clave} value={i}>{v.nombre}</option>)}
            </select>
          )}
          <input type="number" min="0" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="campo !w-24 text-right" placeholder="Cant." />
          <button onClick={armar} disabled={guardando || !(n > 0)} className="btn btn-oscuro btn-sm"><Hammer size={14} /> Armar</button>
          <button onClick={corregir} disabled={guardando || cantidad === ''} className="btn btn-claro btn-sm" title="Fijar cuántos hay (conteo físico), sin tocar materiales">Corregir conteo</button>
        </div>
      )}
      {estado && <p className={`aviso ${estado.tipo === 'error' ? 'aviso-error' : 'aviso-ok'} !text-xs`}>{estado.texto}</p>}
    </div>
  );
}
