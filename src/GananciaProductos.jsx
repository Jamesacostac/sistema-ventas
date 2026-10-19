import React, { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Ganancia por producto: cuánto se vendió, cuánto costó y cuánto dejó cada producto en un periodo.
 * Cuenta las ventas pagadas y fiadas (también las de cajas ya cerradas); el recargo por tarjeta no cuenta.
 * Los productos fabricados se pueden abrir para ver cada variante (talla, base...).
 */

const dinero = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-CO');
const pct = (n) => (n === null || !Number.isFinite(n) ? '—' : `${Math.round(n)} %`);
const hoyBogota = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const haceDias = (dias) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - dias * 86400000));

const PERIODOS = [
  { id: 'mes', texto: 'Este mes', desde: () => hoyBogota().slice(0, 8) + '01' },
  { id: '30', texto: 'Últimos 30 días', desde: () => haceDias(30) },
  { id: '90', texto: 'Últimos 90 días', desde: () => haceDias(90) },
  { id: 'todo', texto: 'Todo', desde: () => '' }
];

const acumular = (mapa, clave, v) => {
  const fila = (mapa[clave] ||= { nombre: clave, unidades: 0, ventas: 0, costo: 0 });
  fila.unidades += Number(v.cantidad) || 0;
  fila.ventas += Number(v.total) || 0;
  fila.costo += Number(v.costoTotal) || 0;
  return fila;
};

export default function GananciaProductos({ ventas, perdidas = [] }) {
  const [periodo, setPeriodo] = useState('mes');
  const [orden, setOrden] = useState('ganancia');
  const [abierto, setAbierto] = useState(null);

  const { filas, totales, totalPerdidas } = useMemo(() => {
    const desde = PERIODOS.find(p => p.id === periodo).desde();
    const lista = ventas.filter(v => !v.esRecargo && (!desde || (v.fecha || '') >= desde));
    const porProducto = {};
    lista.forEach(v => {
      const fila = acumular(porProducto, v.producto || 'Sin nombre', v);
      if (v.fabricado) {
        fila.variantes ||= {};
        acumular(fila.variantes, v.variante || 'Única', v);
      }
    });
    const filas = Object.values(porProducto);
    const totales = filas.reduce((t, f) => ({ unidades: t.unidades + f.unidades, ventas: t.ventas + f.ventas, costo: t.costo + f.costo }), { unidades: 0, ventas: 0, costo: 0 });
    const totalPerdidas = perdidas.filter(p => !desde || (p.fecha || '') >= desde).reduce((s, p) => s + (Number(p.valor) || 0), 0);
    return { filas, totales, totalPerdidas };
  }, [ventas, perdidas, periodo]);

  const ganancia = (f) => f.ventas - f.costo;
  const margen = (f) => (f.costo > 0 ? (ganancia(f) / f.costo) * 100 : null);
  const ordenadas = [...filas].sort((a, b) => (
    orden === 'ganancia' ? ganancia(b) - ganancia(a)
      : orden === 'unidades' ? b.unidades - a.unidades
        : (margen(b) ?? -Infinity) - (margen(a) ?? -Infinity)
  ));
  const gananciaTotal = ganancia(totales);
  const mayor = Math.max(1, ...filas.map(ganancia));

  return (
    <div className="panel overflow-hidden">
      <div className="p-4 md:p-5 border-b-[1.5px] border-[#E9E1D2] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-tinta flex items-center gap-2.5"><BarChart3 size={18} /> Ganancia por producto</h2>
          <p className="text-xs text-gris-calido mt-1">Ventas pagadas y fiadas, también las de cajas ya cerradas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="campo !w-auto !py-1.5 text-sm">
            {PERIODOS.map(p => <option key={p.id} value={p.id}>{p.texto}</option>)}
          </select>
          <select value={orden} onChange={(e) => setOrden(e.target.value)} className="campo !w-auto !py-1.5 text-sm">
            <option value="ganancia">Más ganancia</option>
            <option value="unidades">Más vendidos</option>
            <option value="margen">Mayor % de ganancia</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 md:p-5">
        <div><p className="kpi-etiqueta text-gris-calido">Vendido</p><p className="kpi-valor text-xl">{dinero(totales.ventas)}</p><p className="text-[11px] text-gris-calido">{totales.unidades} unidad(es)</p></div>
        <div><p className="kpi-etiqueta text-gris-calido">Costo</p><p className="kpi-valor text-xl">{dinero(totales.costo)}</p></div>
        <div><p className="kpi-etiqueta text-gris-calido">Ganancia</p><p className="kpi-valor text-xl text-emerald-700">{dinero(gananciaTotal)}</p><p className="text-[11px] text-gris-calido">{pct(margen(totales))} sobre el costo</p></div>
        <div>
          <p className="kpi-etiqueta text-gris-calido">Menos pérdidas</p>
          <p className={`kpi-valor text-xl ${totalPerdidas ? 'text-[#B23A50]' : ''}`}>{dinero(gananciaTotal - totalPerdidas)}</p>
          <p className="text-[11px] text-gris-calido">{totalPerdidas ? `Daños: ${dinero(totalPerdidas)}` : 'Sin daños en el periodo'}</p>
        </div>
      </div>

      {ordenadas.length === 0 ? (
        <p className="px-5 pb-6 text-center text-sm text-gris-calido">No hay ventas en este periodo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabla w-full text-left border-collapse text-sm">
            <thead>
              <tr>
                <th className="p-3">Producto</th>
                <th className="p-3 text-right">Unid.</th>
                <th className="p-3 text-right hidden sm:table-cell">Vendido</th>
                <th className="p-3 text-right hidden md:table-cell">Costo</th>
                <th className="p-3 text-right">Ganancia</th>
                <th className="p-3 text-right hidden sm:table-cell">% s/costo</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map(f => {
                const variantes = f.variantes ? Object.values(f.variantes).sort((a, b) => ganancia(b) - ganancia(a)) : null;
                const expandido = abierto === f.nombre;
                return (
                  <React.Fragment key={f.nombre}>
                    <tr>
                      <td className="p-3 font-semibold">
                        {variantes && variantes.length > 1 ? (
                          <button onClick={() => setAbierto(expandido ? null : f.nombre)} className="flex items-center gap-1.5 text-left">
                            {expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {f.nombre}
                          </button>
                        ) : f.nombre}
                        <span className="block h-1.5 mt-1.5 rounded-full bg-turquesa/70" style={{ width: `${Math.max(2, (ganancia(f) / mayor) * 100)}%` }} />
                      </td>
                      <td className="p-3 text-right">{f.unidades}</td>
                      <td className="p-3 text-right whitespace-nowrap hidden sm:table-cell">{dinero(f.ventas)}</td>
                      <td className="p-3 text-right whitespace-nowrap hidden md:table-cell">{dinero(f.costo)}</td>
                      <td className={`p-3 text-right whitespace-nowrap font-semibold ${ganancia(f) < 0 ? 'text-[#B23A50]' : 'text-emerald-700'}`}>{dinero(ganancia(f))}</td>
                      <td className="p-3 text-right hidden sm:table-cell">{pct(margen(f))}</td>
                    </tr>
                    {expandido && variantes.map(v => (
                      <tr key={v.nombre} className="bg-crema/50 text-xs">
                        <td className="p-2 pl-9 text-gris-calido">{v.nombre}</td>
                        <td className="p-2 text-right">{v.unidades}</td>
                        <td className="p-2 text-right hidden sm:table-cell">{dinero(v.ventas)}</td>
                        <td className="p-2 text-right hidden md:table-cell">{dinero(v.costo)}</td>
                        <td className="p-2 text-right">{dinero(ganancia(v))}</td>
                        <td className="p-2 text-right hidden sm:table-cell">{pct(margen(v))}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
