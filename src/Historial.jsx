import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { History, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { db } from './firebase';

const PASO = 100;

const NOMBRES_COLECCION = {
  ventas: 'Venta', productos: 'Producto', clientes: 'Cliente', gastos: 'Gasto', materiales: 'Material', perdidas: 'Pérdida',
  categorias: 'Categoría', caja_base: 'Caja', admins: 'Socio'
};

const formatoValor = (v) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

// Lista de campos que cambiaron entre "antes" y "después"
const diferencias = (antes, despues) => {
  const claves = [...new Set([...Object.keys(antes || {}), ...Object.keys(despues || {})])]
    .filter(k => !['creadoEn', 'fechaActualizacion'].includes(k));
  return claves
    .filter(k => JSON.stringify(antes?.[k]) !== JSON.stringify(despues?.[k]))
    .filter(k => despues === null || despues?.[k] !== undefined);
};

const colorAccion = (accion = '') =>
  /eliminad|borrad|quitad/i.test(accion) ? 'pastilla-peligro'
    : /cread|registrad|agregad|cobrad/i.test(accion) ? 'pastilla-ok'
    : 'pastilla-pendiente';

export default function Historial({ negocioId, incluirAntiguo = false }) {
  const [registrosNegocio, setRegistrosNegocio] = useState([]);
  const [registrosAntiguos, setRegistrosAntiguos] = useState([]);
  const [cantidad, setCantidad] = useState(PASO);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [filtroSocio, setFiltroSocio] = useState('');
  const [filtroDia, setFiltroDia] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'negocios', negocioId, 'auditoria'), orderBy('fecha', 'desc'), limit(cantidad));
    const cancelar = [onSnapshot(q, (snap) => {
      setRegistrosNegocio(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCargando(false);
    }, (err) => {
      setError('No se pudo cargar el historial: ' + err.message);
      setCargando(false);
    })];
    // Historial de antes de separar los negocios (solo Tazón para Dos)
    if (incluirAntiguo) {
      const qa = query(collection(db, 'auditoria'), orderBy('fecha', 'desc'), limit(cantidad));
      cancelar.push(onSnapshot(qa, (snap) => setRegistrosAntiguos(snap.docs.map(d => ({ id: 'antiguo_' + d.id, antiguo: true, ...d.data() }))), () => {}));
    }
    return () => cancelar.forEach(f => f());
  }, [cantidad, negocioId, incluirAntiguo]);

  const registros = useMemo(() => [...registrosNegocio, ...registrosAntiguos]
    .sort((a, b) => (b.fecha?.toMillis?.() || 0) - (a.fecha?.toMillis?.() || 0))
    .slice(0, cantidad), [registrosNegocio, registrosAntiguos, cantidad]);

  const socios = useMemo(() => [...new Set(registros.map(r => r.nombre).filter(Boolean))].sort(), [registros]);

  const visibles = registros.filter(r => {
    const fecha = r.fecha?.toDate?.();
    if (filtroSocio && r.nombre !== filtroSocio) return false;
    if (filtroDia && (!fecha || fecha.toLocaleDateString('en-CA') !== filtroDia)) return false;
    if (busqueda && !`${r.accion} ${r.detalle}`.toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="panel p-5">
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <History size={18} className="text-indigo-600" /> Historial de cambios
        </h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          Cada cambio queda registrado con el nombre de quien lo hizo y la hora del servidor. Nadie puede editarlo ni borrarlo, ni siquiera el titular.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select
            value={filtroSocio}
            onChange={(e) => setFiltroSocio(e.target.value)}
            className="campo"
          >
            <option value="">Todos los socios</option>
            {socios.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            type="date"
            value={filtroDia}
            onChange={(e) => setFiltroDia(e.target.value)}
            className="campo"
          />
          <div className="relative">
            <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar (ej. eliminada, Limonada)"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="campo pl-8"
            />
          </div>
        </div>
      </div>

      <div className="panel overflow-hidden">
        {error && <p className="p-4 text-sm text-rose-600">{error}</p>}
        {cargando && <p className="p-6 text-center text-slate-400 text-sm">Cargando historial...</p>}
        {!cargando && visibles.length === 0 && !error && (
          <p className="p-6 text-center text-slate-400 text-sm">No hay cambios que coincidan con los filtros.</p>
        )}

        <div>
          {visibles.map(r => {
            const fecha = r.fecha?.toDate?.();
            const expandido = abierto === r.id;
            const cambios = r.cambios || [];
            return (
              <div key={r.id} className="p-3 md:p-4 text-sm">
                <button
                  onClick={() => setAbierto(expandido ? null : r.id)}
                  className="w-full flex justify-between items-start gap-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`pastilla ${colorAccion(r.accion)}`}>{r.accion}</span>
                      <span className="font-semibold text-slate-800">{r.nombre || 'Desconocido'}</span>
                      {r.antiguo && <span className="pastilla pastilla-neutra !text-[9px]" title="Antes de separar los negocios">ANTERIOR</span>}
                    </div>
                    {r.detalle && <p className="text-xs text-slate-600 mt-1 break-words">{r.detalle}</p>}
                  </div>
                  <div className="text-right shrink-0 flex items-start gap-2">
                    <span className="text-xs text-slate-500">
                      {fecha ? fecha.toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—'}
                    </span>
                    {cambios.length > 0 && (expandido ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />)}
                  </div>
                </button>

                {expandido && cambios.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {cambios.map((c, i) => {
                      const [coleccion] = (c.ruta || '').split('/');
                      const campos = c.tipo === 'editar' ? diferencias(c.antes, c.despues) : [];
                      return (
                        <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs">
                          <p className="font-semibold text-slate-700 mb-1">
                            {c.tipo === 'crear' ? '➕ Creado' : c.tipo === 'eliminar' ? '🗑️ Eliminado' : '✏️ Editado'}: {NOMBRES_COLECCION[coleccion] || coleccion}
                            {(c.antes?.nombre || c.despues?.nombre || c.antes?.producto || c.despues?.producto || c.antes?.concepto || c.despues?.concepto) &&
                              ` — ${c.despues?.nombre || c.antes?.nombre || c.despues?.producto || c.antes?.producto || c.despues?.concepto || c.antes?.concepto}`}
                          </p>
                          {c.tipo === 'editar' && campos.map(k => (
                            <p key={k} className="text-slate-600 break-all">
                              <span className="font-medium">{k}:</span>{' '}
                              <span className="line-through text-rose-600">{formatoValor(c.antes?.[k])}</span>{' → '}
                              <span className="text-emerald-700">{formatoValor(c.despues?.[k])}</span>
                            </p>
                          ))}
                          {c.tipo !== 'editar' && (
                            <pre className="text-[11px] text-slate-600 whitespace-pre-wrap break-all">
                              {JSON.stringify(c.tipo === 'eliminar' ? c.antes : c.despues, null, 1)}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {registros.length >= cantidad && (
          <button
            onClick={() => setCantidad(cantidad + PASO)}
            className="w-full p-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 border-t border-slate-200"
          >
            Cargar más cambios
          </button>
        )}
      </div>
    </div>
  );
}
