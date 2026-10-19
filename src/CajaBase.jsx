import React, { useState } from 'react';
import { doc } from 'firebase/firestore';
import { Banknote, Save, PlusCircle, MinusCircle, Calculator, Trash2 } from 'lucide-react';
import { Plegable } from './ui';

/**
 * Efectivo base de la caja: el dinero físico que no viene de ventas (base para cambio, aportes, retiros).
 * Antes se reemplazaba el valor; ahora cada movimiento suma, resta o ajusta según el conteo,
 * y queda en el historial del documento caja_base (campo movimientos, los últimos 100).
 *   Efectivo en caja = base + ventas cobradas en efectivo.
 */

const dinero = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-CO');

const MODOS = {
  entrada: { texto: 'Agregar dinero', icono: PlusCircle, ayuda: 'Se suma a lo que ya hay (base para cambio, aporte de un socio...).', placeholder: 'Cuánto entra' },
  salida: { texto: 'Sacar dinero', icono: MinusCircle, ayuda: 'Se resta de la caja (retiro, pago en efectivo que no es gasto...).', placeholder: 'Cuánto sale' },
  conteo: { texto: 'Contar la caja', icono: Calculator, ayuda: 'Escribe cuánto contaste en físico; se ajusta la diferencia.', placeholder: 'Total contado' },
  vaciado: { texto: 'Caja vaciada', icono: Trash2 }
};

const PALABRA_CONFIRMAR = 'VACIAR';

export default function CajaBase({ cajaInicial, cajaDocId, movimientos = [], ventasEfectivo, puedeEditar, operacion, col, docN, nombre = '', AvisoSinPermiso }) {
  const [modo, setModo] = useState('entrada');
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState(null);
  // Vaciar la caja: segunda confirmación escribiendo VACIAR
  const [vaciando, setVaciando] = useState(false);
  const [confirmacion, setConfirmacion] = useState('');
  const [borrarHistorial, setBorrarHistorial] = useState(false);

  const valor = Number(String(monto).replace(/\./g, '').replace(',', '.'));
  const efectivoActual = cajaInicial + ventasEfectivo;
  const valido = monto !== '' && Number.isFinite(valor) && (modo === 'conteo' ? valor >= 0 : valor > 0);
  // Cuánto cambia la base con este movimiento
  const cambio = !valido ? 0 : modo === 'entrada' ? valor : modo === 'salida' ? -valor : valor - efectivoActual;
  const nuevaBase = cajaInicial + cambio;

  const guardar = async (e) => {
    e.preventDefault();
    if (!puedeEditar || !valido) return;
    if (modo === 'conteo' && cambio === 0) return setEstado({ tipo: 'ok', texto: 'La caja cuadra: no hay nada que ajustar.' });
    setGuardando(true);
    setEstado(null);
    try {
      const movimiento = {
        fecha: new Date().toISOString(),
        tipo: modo,
        monto: cambio,
        base: nuevaBase,
        ...(modo === 'conteo' && { contado: valor, esperado: efectivoActual }),
        nota: nota.trim(),
        por: nombre
      };
      const accion = modo === 'entrada' ? 'Efectivo agregado a la caja' : modo === 'salida' ? 'Efectivo sacado de la caja' : 'Caja contada y ajustada';
      const op = operacion(accion, `${dinero(cambio)} · base ${dinero(cajaInicial)} → ${dinero(nuevaBase)}${nota.trim() ? ` · ${nota.trim()}` : ''}`);
      const datos = { monto: nuevaBase, fechaActualizacion: movimiento.fecha, movimientos: [movimiento, ...movimientos].slice(0, 100) };
      if (cajaDocId) op.actualizar(docN('caja_base', cajaDocId), datos, { monto: cajaInicial });
      else op.crear(doc(col('caja_base')), datos);
      await op.guardar();
      setMonto('');
      setNota('');
      setEstado({ tipo: 'ok', texto: `Listo. Efectivo en caja: ${dinero(nuevaBase + ventasEfectivo)}.` });
    } catch (err) {
      setEstado({ tipo: 'error', texto: 'No se pudo guardar: ' + err.message });
    } finally {
      setGuardando(false);
    }
  };

  // Deja el efectivo en caja en $0 (la base compensa las ventas en efectivo) y, si se pide, borra el historial
  const vaciar = async () => {
    if (!puedeEditar || confirmacion.trim().toUpperCase() !== PALABRA_CONFIRMAR) return;
    setGuardando(true);
    setEstado(null);
    try {
      const nueva = -ventasEfectivo;
      const movimiento = { fecha: new Date().toISOString(), tipo: 'vaciado', monto: nueva - cajaInicial, base: nueva, nota: borrarHistorial ? 'historial borrado' : '', por: nombre };
      const op = operacion('Caja vaciada', `Salen ${dinero(efectivoActual)} · la caja queda en $0${borrarHistorial ? ' · historial de movimientos borrado' : ''}`);
      const datos = { monto: nueva, fechaActualizacion: movimiento.fecha, movimientos: borrarHistorial ? [movimiento] : [movimiento, ...movimientos].slice(0, 100) };
      if (cajaDocId) op.actualizar(docN('caja_base', cajaDocId), datos, { monto: cajaInicial, movimientos });
      else op.crear(doc(col('caja_base')), datos);
      await op.guardar();
      setVaciando(false);
      setConfirmacion('');
      setBorrarHistorial(false);
      setEstado({ tipo: 'ok', texto: 'Caja vaciada: el efectivo en caja quedó en $0.' });
    } catch (err) {
      setEstado({ tipo: 'error', texto: 'No se pudo vaciar: ' + err.message });
    } finally {
      setGuardando(false);
    }
  };

  const Icono = MODOS[modo].icono;

  return (
    <Plegable titulo="Efectivo en caja" descripcion="Agregar o sacar dinero, o ajustar con el conteo físico" icono={<Banknote size={18} />}>
      {!puedeEditar && AvisoSinPermiso && <AvisoSinPermiso accion="ajustar la caja" />}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div className="rounded-xl bg-crema/70 p-2"><p className="kpi-etiqueta text-gris-calido">Base</p><p className="kpi-valor text-lg">{dinero(cajaInicial)}</p></div>
        <div className="rounded-xl bg-crema/70 p-2"><p className="kpi-etiqueta text-gris-calido">Ventas en efectivo</p><p className="kpi-valor text-lg">{dinero(ventasEfectivo)}</p></div>
        <div className="rounded-xl bg-crema/70 p-2"><p className="kpi-etiqueta text-gris-calido">En caja</p><p className="kpi-valor text-lg">{dinero(efectivoActual)}</p></div>
      </div>

      <form onSubmit={guardar}>
        <fieldset disabled={!puedeEditar || guardando} className="space-y-3">
          <div className="segmentado">
            {Object.entries(MODOS).map(([clave, m]) => (
              <button key={clave} type="button" onClick={() => { setModo(clave); setEstado(null); }} className={`segmento ${modo === clave ? 'segmento-activo' : ''}`}>
                {m.texto}
              </button>
            ))}
          </div>
          <p className="text-xs text-gris-calido">{MODOS[modo].ayuda}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input type="number" min="0" step="50" value={monto} onChange={(e) => setMonto(e.target.value)} className="campo" placeholder={MODOS[modo].placeholder} />
            <input value={nota} onChange={(e) => setNota(e.target.value)} className="campo sm:col-span-2" placeholder="Nota (opcional): ej. base para cambio del sábado" />
          </div>
          {valido && (
            <p className="aviso aviso-info !text-xs">
              <span>
                {modo === 'conteo'
                  ? cambio === 0 ? 'La caja cuadra con lo registrado.' : `${cambio > 0 ? 'Sobran' : 'Faltan'} ${dinero(Math.abs(cambio))} frente a lo registrado (${dinero(efectivoActual)}). `
                  : ''}
                {cambio !== 0 && <>La base pasa de <b>{dinero(cajaInicial)}</b> a <b>{dinero(nuevaBase)}</b> y en caja quedan <b>{dinero(nuevaBase + ventasEfectivo)}</b>.</>}
              </span>
            </p>
          )}
          {estado && <p className={`aviso ${estado.tipo === 'error' ? 'aviso-error' : 'aviso-ok'}`}>{estado.texto}</p>}
          <button type="submit" disabled={!valido} className="btn btn-exito"><Icono size={16} /> {guardando ? 'Guardando...' : MODOS[modo].texto}</button>
        </fieldset>
      </form>

      {movimientos.length > 0 && (
        <div className="mt-5">
          <p className="etiqueta">Últimos movimientos</p>
          <ul className="divide-y divide-linea-suave text-sm">
            {movimientos.slice(0, 10).map((m, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-semibold">{MODOS[m.tipo]?.texto || 'Ajuste'}</span>
                  {m.nota && <span className="text-gris-calido"> · {m.nota}</span>}
                  <span className="block text-[11px] text-gris-calido">
                    {new Date(m.fecha).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    {m.por ? ` · ${m.por}` : ''}
                    {m.tipo === 'conteo' && m.contado !== undefined ? ` · contado ${dinero(m.contado)}` : ''}
                  </span>
                </span>
                <span className={`font-bold whitespace-nowrap ${m.monto < 0 ? 'text-[#B23A50]' : 'text-emerald-700'}`}>{m.monto > 0 ? '+' : ''}{dinero(m.monto)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {puedeEditar && (
        <div className="mt-5 pt-4 border-t-[1.5px] border-dashed border-linea">
          {!vaciando ? (
            <button type="button" onClick={() => { setVaciando(true); setEstado(null); }} disabled={efectivoActual === 0 && movimientos.length === 0} className="btn btn-claro btn-sm">
              <Trash2 size={14} /> Vaciar caja
            </button>
          ) : (
            <div className="rounded-xl border-[1.5px] border-coral bg-rose-50 p-4 space-y-3">
              <p className="text-sm text-tinta">
                <b>¿Seguro que quieres vaciar la caja?</b> Salen <b>{dinero(efectivoActual)}</b> y el efectivo en caja queda en <b>$0</b>.
                {ventasEfectivo !== 0 && <> Las ventas no se borran: la base queda en {dinero(-ventasEfectivo)} para compensarlas.</>}
              </p>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={borrarHistorial} onChange={(e) => setBorrarHistorial(e.target.checked)} className="accent-tinta" />
                Borrar también el historial de movimientos (por ejemplo, si eran pruebas)
              </label>
              <div>
                <label className="etiqueta">Para confirmar, escribe {PALABRA_CONFIRMAR}</label>
                <input value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} className="campo sm:!w-60" placeholder={PALABRA_CONFIRMAR} autoComplete="off" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={vaciar} disabled={guardando || confirmacion.trim().toUpperCase() !== PALABRA_CONFIRMAR} className="btn btn-peligro btn-sm">
                  <Trash2 size={14} /> {guardando ? 'Vaciando...' : 'Sí, vaciar la caja'}
                </button>
                <button type="button" onClick={() => { setVaciando(false); setConfirmacion(''); }} className="btn btn-claro btn-sm">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Plegable>
  );
}
