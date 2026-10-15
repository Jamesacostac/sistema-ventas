import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Settings, Send, Save, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { db } from './firebase';
import { COLORES_NEGOCIO } from './negociosComun';
import { enviarMensajeTelegram, limpiarConfigTelegram } from './telegram';

const dinero = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');

const Mensaje = ({ estado }) => (estado ? <p className={`aviso ${estado.tipo === 'error' ? 'aviso-error' : 'aviso-ok'}`}>{estado.texto}</p> : null);

export default function ConfigNegocio({ negocioId, negocio, esTitular, operacion }) {
  const [form, setForm] = useState({
    nombre: negocio?.nombre || '',
    color: negocio?.color || 'turquesa',
    porcentajeAhorro: negocio?.porcentajeAhorro ?? 15,
    numeroSocios: negocio?.numeroSocios ?? 3
  });
  const [estadoGeneral, setEstadoGeneral] = useState(null);
  const [guardando, setGuardando] = useState('');

  const [telegram, setTelegram] = useState({ token: '', chatIds: '' });
  const [tokenGuardado, setTokenGuardado] = useState('');
  const [verToken, setVerToken] = useState(false);
  const [estadoTelegram, setEstadoTelegram] = useState(null);

  useEffect(() => {
    getDoc(doc(db, 'negocios', negocioId, 'config', 'telegram'))
      .then(s => {
        const d = s.exists() ? s.data() : null;
        setTokenGuardado(d?.token || '');
        setTelegram({ token: '', chatIds: (d?.chatIds || []).join('\n') });
      })
      .catch(() => {});
  }, [negocioId]);

  const ahorro = Math.min(100, Math.max(0, Number(form.porcentajeAhorro) || 0));
  const socios = Math.max(1, Math.round(Number(form.numeroSocios) || 1));
  const ejemplo = 100000;

  const guardarGeneral = async (e) => {
    e.preventDefault();
    setEstadoGeneral(null);
    const nombre = form.nombre.trim().replace(/\s+/g, ' ');
    if (nombre.length < 2) return setEstadoGeneral({ tipo: 'error', texto: 'Escribe el nombre del negocio.' });
    const cambios = { nombre, color: form.color, porcentajeAhorro: ahorro, numeroSocios: socios };
    const antes = { nombre: negocio.nombre, color: negocio.color, porcentajeAhorro: negocio.porcentajeAhorro, numeroSocios: negocio.numeroSocios };
    const detalle = [
      antes.nombre !== nombre && `nombre: ${antes.nombre} → ${nombre}`,
      antes.porcentajeAhorro !== ahorro && `ahorro: ${antes.porcentajeAhorro} % → ${ahorro} %`,
      antes.numeroSocios !== socios && `socios para el salario: ${antes.numeroSocios} → ${socios}`,
      antes.color !== form.color && `color: ${antes.color} → ${form.color}`
    ].filter(Boolean).join(' · ');
    if (!detalle) return setEstadoGeneral({ tipo: 'ok', texto: 'No hay cambios para guardar.' });

    setGuardando('general');
    try {
      const op = operacion('Configuración del negocio cambiada', detalle);
      op.actualizar(doc(db, 'negocios', negocioId), cambios, antes);
      await op.guardar();
      setEstadoGeneral({ tipo: 'ok', texto: 'Cambios guardados. Los indicadores ya usan el nuevo reparto.' });
    } catch (err) {
      setEstadoGeneral({ tipo: 'error', texto: 'No se pudo guardar: ' + err.message });
    } finally {
      setGuardando('');
    }
  };

  const guardarTelegram = async (e) => {
    e.preventDefault();
    setEstadoTelegram(null);
    const token = telegram.token.trim() || tokenGuardado;
    const chatIds = telegram.chatIds.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
    if (!/^\d+:[\w-]{20,}$/.test(token)) return setEstadoTelegram({ tipo: 'error', texto: 'El token no parece válido. Se ve así: 123456789:ABCdef...' });
    if (chatIds.length === 0) return setEstadoTelegram({ tipo: 'error', texto: 'Escribe al menos un Chat ID.' });

    setGuardando('telegram');
    try {
      const op = operacion('Telegram configurado', `${chatIds.length} chat(s)${telegram.token.trim() ? ' · token nuevo' : ''}`);
      op.crear(doc(db, 'negocios', negocioId, 'config', 'telegram'), { token, chatIds });
      await op.guardar();
      limpiarConfigTelegram(negocioId);
      setTokenGuardado(token);
      setTelegram({ token: '', chatIds: chatIds.join('\n') });
      setEstadoTelegram({ tipo: 'ok', texto: 'Telegram guardado. Usa "Enviar prueba" para comprobarlo.' });
    } catch (err) {
      setEstadoTelegram({ tipo: 'error', texto: 'No se pudo guardar: ' + err.message });
    } finally {
      setGuardando('');
    }
  };

  const probarTelegram = async () => {
    setEstadoTelegram(null);
    setGuardando('prueba');
    const ok = await enviarMensajeTelegram(`🏪 <b>${negocio.nombre}</b>\n✅ Mensaje de prueba: Telegram está bien configurado.`, negocioId);
    setGuardando('');
    setEstadoTelegram(ok
      ? { tipo: 'ok', texto: 'Mensaje de prueba enviado. Revisa Telegram.' }
      : { tipo: 'error', texto: 'No se pudo enviar. Revisa el token y que cada persona le haya escrito /start al bot.' });
  };

  const tokenOculto = tokenGuardado ? tokenGuardado.slice(0, 6) + '••••••' + tokenGuardado.slice(-4) : '';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {!esTitular && (
        <p className="aviso aviso-atencion">🔒 Solo el titular de {negocio.nombre} puede cambiar esta configuración.</p>
      )}

      <div className="panel p-5 md:p-6">
        <h2 className="text-base font-bold text-tinta flex items-center gap-2.5 mb-4"><Settings size={18} /> {negocio.nombre}: datos y reparto</h2>
        <form onSubmit={guardarGeneral}>
          <fieldset disabled={!esTitular} className="space-y-4">
            <div>
              <label className="etiqueta">Nombre del negocio</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="campo" />
            </div>
            <div>
              <p className="etiqueta">Color de la cabecera</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(COLORES_NEGOCIO).map(([clave, c]) => (
                  <button
                    type="button"
                    key={clave}
                    onClick={() => setForm({ ...form, color: clave })}
                    className={`h-9 px-3 rounded-full border-2 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 ${form.color === clave ? 'border-tinta shadow-[2px_2px_0_#28203B]' : 'border-transparent'}`}
                    style={{ background: c.hex }}
                  >
                    {form.color === clave && <CheckCircle size={14} />} {c.nombre}
                  </button>
                ))}
              </div>
            </div>

            <hr className="separador !my-2" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="etiqueta">% de la ganancia para ahorro y mejoras</label>
                <input type="number" min="0" max="100" step="1" value={form.porcentajeAhorro} onChange={(e) => setForm({ ...form, porcentajeAhorro: e.target.value })} className="campo" />
                <p className="text-[11px] text-gris-calido mt-1">El resto ({100 - ahorro} %) se reparte como salario.</p>
              </div>
              <div>
                <label className="etiqueta">Número de socios entre los que se divide el salario</label>
                <input type="number" min="1" max="50" step="1" value={form.numeroSocios} onChange={(e) => setForm({ ...form, numeroSocios: e.target.value })} className="campo" />
              </div>
            </div>

            <div className="rounded-xl bg-crema/70 border-[1.5px] border-[#E9E1D2] p-4 text-sm">
              <p className="kpi-etiqueta text-gris-calido mb-2">Ejemplo con una ganancia de {dinero(ejemplo)}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-xs text-gris-calido">Ahorro</p><p className="kpi-valor text-lg">{dinero(ejemplo * ahorro / 100)}</p></div>
                <div><p className="text-xs text-gris-calido">Salarios</p><p className="kpi-valor text-lg">{dinero(ejemplo * (100 - ahorro) / 100)}</p></div>
                <div><p className="text-xs text-gris-calido">Por socio (÷ {socios})</p><p className="kpi-valor text-lg">{dinero(ejemplo * (100 - ahorro) / 100 / socios)}</p></div>
              </div>
            </div>

            <Mensaje estado={estadoGeneral} />
            {esTitular && (
              <button type="submit" disabled={guardando === 'general'} className="btn btn-primario">
                <Save size={16} /> {guardando === 'general' ? 'Guardando...' : 'Guardar cambios'}
              </button>
            )}
          </fieldset>
        </form>
      </div>

      <div className="panel p-5 md:p-6">
        <h2 className="text-base font-bold text-tinta flex items-center gap-2.5 mb-1"><Send size={18} /> Telegram de {negocio.nombre}</h2>
        <p className="text-xs text-gris-calido mb-4">
          Bot que recibe las alertas de stock y los cierres de caja de este negocio. El token lo da @BotFather; cada persona debe escribirle /start al bot.
        </p>
        <form onSubmit={guardarTelegram}>
          <fieldset disabled={!esTitular} className="space-y-4">
            <div>
              <label className="etiqueta">Token del bot {tokenGuardado && <span className="font-normal text-gris-calido">(actual: {tokenOculto})</span>}</label>
              <div className="relative">
                <input
                  type={verToken ? 'text' : 'password'}
                  autoComplete="off"
                  placeholder={tokenGuardado ? 'Déjalo vacío para conservar el actual' : '123456789:ABCdef...'}
                  value={telegram.token}
                  onChange={(e) => setTelegram({ ...telegram, token: e.target.value })}
                  className="campo pr-9 font-mono"
                />
                <button type="button" onClick={() => setVerToken(!verToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gris-calido" title={verToken ? 'Ocultar' : 'Mostrar'}>
                  {verToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="etiqueta">Chat IDs (uno por línea)</label>
              <textarea rows={3} value={telegram.chatIds} onChange={(e) => setTelegram({ ...telegram, chatIds: e.target.value })} className="campo font-mono" placeholder={'1283673615\n786677703'} />
            </div>
            <Mensaje estado={estadoTelegram} />
            {esTitular && (
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={guardando === 'telegram'} className="btn btn-primario">
                  <Save size={16} /> {guardando === 'telegram' ? 'Guardando...' : 'Guardar Telegram'}
                </button>
                <button type="button" onClick={probarTelegram} disabled={!tokenGuardado || guardando === 'prueba'} className="btn btn-claro">
                  <Send size={16} /> {guardando === 'prueba' ? 'Enviando...' : 'Enviar prueba'}
                </button>
              </div>
            )}
          </fieldset>
        </form>
      </div>
    </div>
  );
}
