import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { CreditCard, Plus, Trash2, Save, Star } from 'lucide-react';
import { db } from './firebase';

// Tarifas de pago con tarjeta (datáfono). Ejemplo Wompi: comisión 1,99 % + IVA 19 % de la
// comisión + retefuente 1,5 % de la venta. Se guardan por negocio en negocios/{id}/config/datafono.
export const DATAFONO_POR_DEFECTO = { id: 'wompi', nombre: 'Wompi', comision: 1.99, iva: 19, retefuente: 1.5 };

const num = (v) => Math.max(0, Number(String(v).replace(',', '.')) || 0);

// Tasa total que se descuenta sobre el valor cobrado
export const tasaDescuento = (t) => (num(t.comision) / 100) * (1 + num(t.iva) / 100) + num(t.retefuente) / 100;

// Desglose de lo que descuenta el datáfono sobre un valor cobrado
export const desglose = (cobrado, t) => {
  const comision = Math.round(cobrado * num(t.comision) / 100);
  const iva = Math.round(comision * num(t.iva) / 100);
  const retefuente = Math.round(cobrado * num(t.retefuente) / 100);
  return { comision, iva, retefuente, total: comision + iva + retefuente, llega: cobrado - comision - iva - retefuente };
};

/**
 * Cuánto cobrarle al cliente para que, después de las tarifas, llegue completo el valor de la venta.
 * Las tarifas se calculan sobre lo cobrado, por eso no basta con sumarlas: se divide entre (1 − tasa).
 */
export const calcularCobroTarjeta = (base, t) => {
  const tasa = tasaDescuento(t);
  if (!base || tasa <= 0 || tasa >= 0.5) return { cobrar: base, recargo: 0, ...desglose(base, t) };
  let cobrar = Math.ceil(base / (1 - tasa));
  // Ajuste por redondeo de cada tarifa: que lo que llegue nunca quede por debajo de la venta
  while (desglose(cobrar, t).llega < base) cobrar++;
  // …y el mínimo posible, para que llegue lo más exacto al valor de la venta
  while (cobrar > base && desglose(cobrar - 1, t).llega >= base) cobrar--;
  return { cobrar, recargo: cobrar - base, ...desglose(cobrar, t) };
};

const dinero = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');

// Configuración guardada del negocio (para la pantalla de ventas)
export function useConfigDatafono(negocioId) {
  const [config, setConfig] = useState(null);
  useEffect(() => onSnapshot(
    doc(db, 'negocios', negocioId, 'config', 'datafono'),
    (s) => setConfig(s.exists() ? s.data() : null),
    () => setConfig(null)
  ), [negocioId]);
  return config;
}

// ---------- Apartado de configuración (Mi perfil) ----------
export function ConfigDatafono({ negocioId, negocio, esTitular, operacion }) {
  const guardada = useConfigDatafono(negocioId);
  const [datafonos, setDatafonos] = useState(null);
  const [predeterminado, setPredeterminado] = useState('wompi');
  const [cobrarAlCliente, setCobrarAlCliente] = useState(true);
  const [estado, setEstado] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // Cargar lo guardado una vez (después se edita localmente)
  useEffect(() => {
    if (datafonos !== null) return;
    if (guardada === null) {
      setDatafonos([DATAFONO_POR_DEFECTO]);
    } else {
      setDatafonos(guardada.datafonos?.length ? guardada.datafonos : [DATAFONO_POR_DEFECTO]);
      setPredeterminado(guardada.predeterminado || guardada.datafonos?.[0]?.id || 'wompi');
      setCobrarAlCliente(guardada.cobrarAlCliente !== false);
    }
  }, [guardada, datafonos]);

  if (!datafonos) return null;

  const cambiar = (id, campo, valor) => setDatafonos(ds => ds.map(d => (d.id === id ? { ...d, [campo]: valor } : d)));
  const agregar = () => {
    const id = `datafono_${Date.now()}`;
    setDatafonos(ds => [...ds, { id, nombre: '', comision: 0, iva: 19, retefuente: 1.5 }]);
  };
  const quitar = (id) => {
    if (datafonos.length === 1) return;
    setDatafonos(ds => ds.filter(d => d.id !== id));
    if (predeterminado === id) setPredeterminado(datafonos.find(d => d.id !== id)?.id);
  };

  const guardar = async () => {
    setEstado(null);
    const limpios = datafonos.map(d => ({ id: d.id, nombre: d.nombre.trim(), comision: num(d.comision), iva: num(d.iva), retefuente: num(d.retefuente) }));
    if (limpios.some(d => !d.nombre)) return setEstado({ tipo: 'error', texto: 'Ponle nombre a cada datáfono (ej. Wompi, Bold, Bancolombia).' });
    if (limpios.some(d => tasaDescuento(d) >= 0.5)) return setEstado({ tipo: 'error', texto: 'Revisa los porcentajes: son demasiado altos.' });
    setGuardando(true);
    try {
      const op = operacion('Tarifas de datáfono configuradas',
        `${limpios.map(d => `${d.nombre}: ${d.comision} % + IVA ${d.iva} % + retefuente ${d.retefuente} %`).join(' · ')}${cobrarAlCliente ? ' · se cobra al cliente' : ' · lo asume el negocio'}`);
      op.crear(doc(db, 'negocios', negocioId, 'config', 'datafono'), { datafonos: limpios, predeterminado, cobrarAlCliente });
      await op.guardar();
      setEstado({ tipo: 'ok', texto: 'Tarifas guardadas.' });
    } catch (err) {
      setEstado({ tipo: 'error', texto: 'No se pudo guardar: ' + err.message });
    } finally {
      setGuardando(false);
    }
  };

  const ejemplo = 30000;
  const activo = datafonos.find(d => d.id === predeterminado) || datafonos[0];
  const sinRecargo = desglose(ejemplo, activo);
  const conRecargo = calcularCobroTarjeta(ejemplo, activo);

  return (
    <div className="panel p-6">
      <h3 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
        <CreditCard size={18} /> Datáfono y tarifas de tarjeta · {negocio?.nombre}
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        Porcentajes que descuenta el datáfono de cada pago con tarjeta. Se aplican al elegir "Tarjeta" en el pedido.
      </p>

      <fieldset disabled={!esTitular} className="space-y-3">
        {datafonos.map(d => (
          <div key={d.id} className={`p-3 rounded-xl border-[1.5px] ${d.id === predeterminado ? 'border-tinta bg-crema/50' : 'border-[#E9E1D2]'}`}>
            <div className="flex items-center gap-2 mb-2">
              <input
                value={d.nombre}
                onChange={(e) => cambiar(d.id, 'nombre', e.target.value)}
                placeholder="Nombre (ej. Wompi, Bold, Bancolombia)"
                className="campo !py-1.5 font-semibold"
              />
              <button type="button" onClick={() => setPredeterminado(d.id)} title="Usar por defecto" className={`btn-icono ${d.id === predeterminado ? '!text-amber-600' : ''}`}>
                <Star size={16} fill={d.id === predeterminado ? 'currentColor' : 'none'} />
              </button>
              <button type="button" onClick={() => quitar(d.id)} disabled={datafonos.length === 1} title="Quitar" className="btn-icono btn-icono-peligro">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[['comision', 'Comisión %'], ['iva', 'IVA de la comisión %'], ['retefuente', 'Retefuente %']].map(([campo, etiqueta]) => (
                <label key={campo} className="block">
                  <span className="text-[11px] font-bold text-tinta">{etiqueta}</span>
                  <input type="number" step="0.01" min="0" value={d[campo]} onChange={(e) => cambiar(d.id, campo, e.target.value)} className="campo !py-1.5" />
                </label>
              ))}
            </div>
          </div>
        ))}

        <button type="button" onClick={agregar} className="btn btn-claro btn-sm"><Plus size={14} /> Agregar otro datáfono</button>

        <label className="flex items-start gap-2 text-sm p-3 rounded-xl bg-crema/60 border-[1.5px] border-[#E9E1D2] cursor-pointer">
          <input type="checkbox" checked={cobrarAlCliente} onChange={(e) => setCobrarAlCliente(e.target.checked)} className="mt-0.5 accent-[#28203B]" />
          <span>
            <b>Sumar las tarifas al total cuando el cliente paga con tarjeta</b>
            <span className="block text-xs text-gris-calido">Si lo desactivas, el negocio asume la tarifa y solo verás cuánto te llega.</span>
          </span>
        </label>
      </fieldset>

      <div className="mt-4 rounded-xl border-[1.5px] border-[#E9E1D2] p-4 text-sm">
        <p className="kpi-etiqueta text-gris-calido mb-2">Ejemplo con {activo.nombre || 'el datáfono'} y una venta de {dinero(ejemplo)}</p>
        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <span>Comisión ({num(activo.comision)} %)</span><span className="text-right text-rose-600">-{dinero(sinRecargo.comision)}</span>
          <span>IVA de la comisión ({num(activo.iva)} %)</span><span className="text-right text-rose-600">-{dinero(sinRecargo.iva)}</span>
          <span>Retefuente de la venta ({num(activo.retefuente)} %)</span><span className="text-right text-rose-600">-{dinero(sinRecargo.retefuente)}</span>
          <span className="font-bold border-t border-[#E9E1D2] pt-1">Sin recargo te llegan</span><span className="text-right font-bold border-t border-[#E9E1D2] pt-1">{dinero(sinRecargo.llega)}</span>
          {cobrarAlCliente && (
            <>
              <span className="font-bold text-emerald-700">Cobrando {dinero(conRecargo.cobrar)} (+{dinero(conRecargo.recargo)})</span>
              <span className="text-right font-bold text-emerald-700">te llegan {dinero(conRecargo.llega)}</span>
            </>
          )}
        </div>
      </div>

      {estado && <p className={`mt-3 aviso ${estado.tipo === 'error' ? 'aviso-error' : 'aviso-ok'}`}>{estado.texto}</p>}
      {esTitular
        ? <button type="button" onClick={guardar} disabled={guardando} className="btn btn-primario mt-4"><Save size={16} /> {guardando ? 'Guardando...' : 'Guardar tarifas'}</button>
        : <p className="mt-3 aviso aviso-atencion">🔒 Solo el titular de {negocio?.nombre} puede cambiar las tarifas.</p>}
    </div>
  );
}
