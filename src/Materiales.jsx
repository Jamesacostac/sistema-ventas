import React, { useMemo, useState } from 'react';
import { doc } from 'firebase/firestore';
import { Layers, PackagePlus, Save, Search, Edit2, Trash2, AlertTriangle, X } from 'lucide-react';
import { Plegable } from './ui';
import { UNIDADES, compararNombres } from './fabricacion';

/**
 * Materiales (piezas e insumos) de un negocio que fabrica: bases, chapas, camisetas por talla,
 * papel adhesivo... No se venden sueltos: los gastan las recetas de los productos fabricados.
 */

const dinero = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const numero = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('es-CO');

const FORM_VACIO = { nombre: '', grupo: '', unidad: 'unidad', costo: '', costoPedido: '', stock: '', minimo: '' };

export default function Materiales({ materiales, productos, puedeEditar, operacion, col, docN, children }) {
  const [form, setForm] = useState(FORM_VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState(null);

  const grupos = useMemo(() => [...new Set(materiales.map(m => m.grupo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [materiales]);

  // Qué productos usan cada material (para no borrar uno que está en una receta)
  const usos = useMemo(() => {
    const mapa = {};
    const anotar = (receta, nombre) => (receta || []).forEach(l => { (mapa[l.materialId] ||= new Set()).add(nombre); });
    productos.filter(p => p.fabricado).forEach(p => {
      anotar(p.receta, p.nombre);
      (p.opciones || []).forEach(o => o.valores?.forEach(v => anotar(v.receta, p.nombre)));
      (p.adicionales || []).forEach(a => anotar(a.receta, p.nombre));
    });
    return mapa;
  }, [productos]);

  const texto = busqueda.trim().toLowerCase();
  const filtrados = materiales
    .filter(m => !texto || `${m.nombre} ${m.grupo || ''}`.toLowerCase().includes(texto))
    .sort((a, b) => (a.grupo || '').localeCompare(b.grupo || '', 'es') || compararNombres(a.nombre, b.nombre));
  const porGrupo = filtrados.reduce((acc, m) => { (acc[m.grupo || 'Sin grupo'] ||= []).push(m); return acc; }, {});

  const valorTotal = materiales.reduce((s, m) => s + (Number(m.costo) || 0) * Math.max(0, Number(m.stock) || 0), 0);
  const porAcabarse = materiales.filter(m => Number(m.minimo) > 0 && (Number(m.stock) || 0) <= Number(m.minimo));
  const sinCosto = materiales.filter(m => !(Number(m.costo) > 0));

  const editar = (m) => {
    setEditandoId(m.id);
    setForm({ nombre: m.nombre, grupo: m.grupo || '', unidad: m.unidad || 'unidad', costo: m.costo ?? '', costoPedido: Number(m.costoPedido) > 0 ? m.costoPedido : '', stock: m.stock ?? '', minimo: m.minimo ?? '' });
    setEstado(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelar = () => { setEditandoId(null); setForm(FORM_VACIO); };

  const guardar = async (e) => {
    e.preventDefault();
    if (!puedeEditar) return;
    const nombre = form.nombre.trim().replace(/\s+/g, ' ');
    if (!nombre) return setEstado({ tipo: 'error', texto: 'Escribe el nombre del material.' });
    const repetido = materiales.find(m => m.id !== editandoId && m.nombre.toLowerCase() === nombre.toLowerCase());
    if (repetido) return setEstado({ tipo: 'error', texto: `Ya existe "${repetido.nombre}".` });
    const datos = {
      nombre,
      grupo: form.grupo.trim(),
      unidad: form.unidad,
      costo: Math.max(0, Number(String(form.costo).replace(',', '.')) || 0),
      costoPedido: Math.max(0, Number(String(form.costoPedido).replace(',', '.')) || 0),
      stock: Number(String(form.stock).replace(',', '.')) || 0,
      minimo: Math.max(0, Number(String(form.minimo).replace(',', '.')) || 0)
    };
    setGuardando(true);
    setEstado(null);
    try {
      if (editandoId) {
        const antes = materiales.find(m => m.id === editandoId);
        const cambios = [
          antes.costo !== datos.costo && `costo ${dinero(antes.costo)} → ${dinero(datos.costo)}`,
          (Number(antes.costoPedido) || 0) !== datos.costoPedido && `costo por pedido ${dinero(antes.costoPedido)} → ${dinero(datos.costoPedido)}`,
          antes.stock !== datos.stock && `stock ${numero(antes.stock)} → ${numero(datos.stock)}`,
          antes.nombre !== datos.nombre && `nombre ${antes.nombre} → ${datos.nombre}`
        ].filter(Boolean).join(', ');
        const op = operacion('Material editado', `${datos.nombre}${cambios ? ': ' + cambios : ''}`);
        op.actualizar(docN('materiales', editandoId), datos, antes);
        await op.guardar();
        setEstado({ tipo: 'ok', texto: `"${datos.nombre}" actualizado.` });
      } else {
        const op = operacion('Material creado', `${datos.nombre} — ${numero(datos.stock)} ${datos.unidad} a ${dinero(datos.costo)} c/u`);
        op.crear(doc(col('materiales')), datos);
        await op.guardar();
        setEstado({ tipo: 'ok', texto: `"${datos.nombre}" agregado.` });
      }
      setEditandoId(null);
      setForm({ ...FORM_VACIO, grupo: datos.grupo, unidad: datos.unidad });
    } catch (err) {
      setEstado({ tipo: 'error', texto: 'No se pudo guardar: ' + err.message });
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (m) => {
    if (!puedeEditar) return;
    const enUso = usos[m.id];
    if (enUso?.size) {
      alert(`"${m.nombre}" se usa en: ${[...enUso].join(', ')}.\n\nQuítalo primero de esas recetas.`);
      return;
    }
    if (!confirm(`¿Eliminar el material "${m.nombre}"?`)) return;
    try {
      const op = operacion('Material eliminado', m.nombre);
      op.eliminar(docN('materiales', m.id), m);
      await op.guardar();
      if (editandoId === m.id) cancelar();
    } catch (err) {
      alert('No se pudo eliminar: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="kpi kpi-sol p-4">
          <p className="kpi-etiqueta">Valor en materiales</p>
          <p className="kpi-valor text-2xl mt-1">{dinero(valorTotal)}</p>
          <p className="text-xs mt-1 opacity-80">{materiales.length} material(es)</p>
        </div>
        <div className={`kpi ${porAcabarse.length ? 'kpi-coral' : 'kpi-verde'} p-4`}>
          <p className="kpi-etiqueta">Por acabarse</p>
          <p className="kpi-valor text-2xl mt-1">{porAcabarse.length}</p>
          <p className="text-xs mt-1 opacity-80 truncate">{porAcabarse.slice(0, 3).map(m => m.nombre).join(', ') || 'Todo por encima del mínimo'}</p>
        </div>
        <div className="kpi kpi-turquesa p-4">
          <p className="kpi-etiqueta">Sin costo</p>
          <p className="kpi-valor text-2xl mt-1">{sinCosto.length}</p>
          <p className="text-xs mt-1 opacity-80">{sinCosto.length ? 'Ponles costo para calcular precios' : 'Todos tienen costo'}</p>
        </div>
      </div>

      {children}

      <Plegable
        titulo={editandoId ? `Editar material: ${form.nombre}` : 'Nuevo material'}
        descripcion="Piezas e insumos: bases, chapas, prendas por talla, papel, resina..."
        icono={<PackagePlus size={18} />}
        forzarAbierto={!!editandoId}
      >
        {!puedeEditar && <p className="aviso aviso-atencion mb-3">🔒 Solo lectura: necesitas el permiso de inventario.</p>}
        <form onSubmit={guardar}>
          <fieldset disabled={!puedeEditar || guardando} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="etiqueta">Nombre</label>
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="campo" placeholder="Ej. Chapa 37 mm" />
              </div>
              <div>
                <label className="etiqueta">Grupo</label>
                <input list="grupos-materiales" value={form.grupo} onChange={(e) => setForm({ ...form, grupo: e.target.value })} className="campo" placeholder="Ej. Botones" />
                <datalist id="grupos-materiales">{grupos.map(g => <option key={g} value={g} />)}</datalist>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="etiqueta">Se cuenta por</label>
                <select value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} className="campo">
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="etiqueta">Costo por {form.unidad}</label>
                <input type="number" min="0" step="any" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} className="campo" placeholder="0" />
              </div>
              <div>
                <label className="etiqueta" title="Si a veces se compra cuando llega el pedido (al detal) y sale más caro">Costo por pedido <span className="font-normal text-gris-calido">(opcional)</span></label>
                <input type="number" min="0" step="any" value={form.costoPedido} onChange={(e) => setForm({ ...form, costoPedido: e.target.value })} className="campo" placeholder="Igual" />
              </div>
              <div>
                <label className="etiqueta">Hay en stock</label>
                <input type="number" step="any" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="campo" placeholder="0" />
              </div>
              <div>
                <label className="etiqueta">Avisar cuando queden</label>
                <input type="number" min="0" step="any" value={form.minimo} onChange={(e) => setForm({ ...form, minimo: e.target.value })} className="campo" placeholder="0" />
              </div>
            </div>
            {estado && <p className={`aviso ${estado.tipo === 'error' ? 'aviso-error' : 'aviso-ok'}`}>{estado.texto}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primario"><Save size={16} /> {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Agregar material'}</button>
              {editandoId && <button type="button" onClick={cancelar} className="btn btn-claro"><X size={16} /> Cancelar</button>}
            </div>
          </fieldset>
        </form>
      </Plegable>

      <div className="panel overflow-hidden">
        <div className="p-4 md:p-5 border-b-[1.5px] border-linea flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-tinta flex items-center gap-2.5"><Layers size={18} /> Materiales</h2>
          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-calido" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar material" className="campo !pl-9" />
          </div>
        </div>
        {filtrados.length === 0 ? (
          <p className="p-8 text-center text-gris-calido text-sm">{materiales.length ? 'Ningún material coincide con la búsqueda.' : 'Todavía no hay materiales. Agrega el primero arriba.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla w-full text-left border-collapse text-sm">
              <thead>
                <tr>
                  <th className="p-3">Material</th>
                  <th className="p-3 text-right">Costo</th>
                  <th className="p-3 text-right">Stock</th>
                  <th className="p-3 text-right hidden md:table-cell">Valor</th>
                  <th className="p-3 hidden lg:table-cell">Se usa en</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              {Object.entries(porGrupo).map(([grupo, lista]) => (
                <tbody key={grupo}>
                  <tr><td colSpan={6} className="px-3 pt-4 pb-1 kpi-etiqueta text-gris-calido">{grupo}</td></tr>
                  {lista.map(m => {
                    const bajo = Number(m.minimo) > 0 && (Number(m.stock) || 0) <= Number(m.minimo);
                    const enUso = [...(usos[m.id] || [])];
                    return (
                      <tr key={m.id}>
                        <td className="p-3 font-semibold">{m.nombre}<span className="block text-[11px] font-normal text-gris-calido">por {m.unidad || 'unidad'}</span></td>
                        <td className={`p-3 text-right whitespace-nowrap ${Number(m.costo) > 0 ? '' : 'text-gris-calido italic'}`}>{Number(m.costo) > 0 ? dinero(m.costo) : 'sin costo'}{Number(m.costoPedido) > 0 && <span className="block text-[11px] text-gris-calido not-italic">por pedido {dinero(m.costoPedido)}</span>}</td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <span className={`pastilla ${bajo ? 'pastilla-peligro' : (Number(m.stock) || 0) > 0 ? 'pastilla-neutra' : 'pastilla-pendiente'}`}>
                            {bajo && <AlertTriangle size={11} />} {numero(m.stock)}
                          </span>
                        </td>
                        <td className="p-3 text-right whitespace-nowrap hidden md:table-cell">{dinero((Number(m.costo) || 0) * Math.max(0, Number(m.stock) || 0))}</td>
                        <td className="p-3 text-xs text-gris-calido hidden lg:table-cell">{enUso.length ? enUso.join(', ') : '—'}</td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <button onClick={() => editar(m)} disabled={!puedeEditar} className="btn-icono" title="Editar"><Edit2 size={15} /></button>
                          <button onClick={() => eliminar(m)} disabled={!puedeEditar} className="btn-icono btn-icono-peligro" title="Eliminar"><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
