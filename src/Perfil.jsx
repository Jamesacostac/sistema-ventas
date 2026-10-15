import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { UserCircle, LogOut, Save, Mail, KeyRound, Smartphone, Send, Trash2, Eye, EyeOff } from 'lucide-react';
import { auth, db } from './firebase';
import { llamarServidor, cerrarSesion, idDispositivoActual, borrarDispositivo } from './servidor';

const claseInput = 'w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
const claseBoton = 'flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow disabled:opacity-50';

const Mensaje = ({ estado }) => {
  if (!estado?.texto) return null;
  return (
    <p className={`text-xs rounded-lg p-2 border ${estado.tipo === 'error'
      ? 'text-rose-600 bg-rose-50 border-rose-200'
      : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>
      {estado.texto}
    </p>
  );
};

const formatoFecha = (valor) => {
  const fecha = valor?.toDate ? valor.toDate() : valor ? new Date(valor) : null;
  return fecha ? fecha.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
};

export default function Perfil({ usuario, onReverificar }) {
  const [perfil, setPerfil] = useState(null);
  const [dispositivos, setDispositivos] = useState([]);
  const [idActual, setIdActual] = useState(null);

  const [nombre, setNombre] = useState('');
  const [estadoNombre, setEstadoNombre] = useState(null);

  const [formCorreo, setFormCorreo] = useState({ nuevo: '', actual: '' });
  const [estadoCorreo, setEstadoCorreo] = useState(null);

  const [formClave, setFormClave] = useState({ actual: '', nueva: '', confirmar: '', codigo: '' });
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [estadoClave, setEstadoClave] = useState(null);
  const [verClaves, setVerClaves] = useState(false);

  const [ocupado, setOcupado] = useState('');

  useEffect(() => {
    const unsubPerfil = onSnapshot(doc(db, 'admins', usuario.uid), (snap) => {
      const datos = snap.data() || {};
      setPerfil(datos);
      setNombre(prev => prev || datos.nombre || '');
    });
    const unsubDispositivos = onSnapshot(
      query(collection(db, 'dispositivos'), where('uid', '==', usuario.uid)),
      (snap) => setDispositivos(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (error) => console.error('Dispositivos:', error)
    );
    idDispositivoActual(usuario.uid).then(setIdActual);
    return () => { unsubPerfil(); unsubDispositivos(); };
  }, [usuario.uid]);

  const handleGuardarNombre = async (e) => {
    e.preventDefault();
    setEstadoNombre(null);
    setOcupado('nombre');
    try {
      await llamarServidor('/perfil/actualizar', { nombre });
      setEstadoNombre({ tipo: 'ok', texto: 'Nombre actualizado.' });
    } catch (err) {
      setEstadoNombre({ tipo: 'error', texto: err.message });
    } finally {
      setOcupado('');
    }
  };

  const handleCambiarCorreo = async (e) => {
    e.preventDefault();
    setEstadoCorreo(null);
    setOcupado('correo');
    try {
      await llamarServidor('/correo/cambiar', { nuevo: formCorreo.nuevo, actual: formCorreo.actual });
      setEstadoCorreo({
        tipo: 'ok',
        texto: `Te enviamos un enlace a ${formCorreo.nuevo.trim()}. El cambio se aplica cuando lo abras; después tendrás que iniciar sesión con el correo nuevo.`
      });
      setFormCorreo({ nuevo: '', actual: '' });
    } catch (err) {
      setEstadoCorreo({ tipo: 'error', texto: err.message });
    } finally {
      setOcupado('');
    }
  };

  const validarClaves = () => {
    if (!formClave.actual) return 'Escribe tu contraseña actual.';
    if (formClave.nueva.length < 8) return 'La nueva contraseña debe tener al menos 8 caracteres.';
    if (formClave.nueva !== formClave.confirmar) return 'La confirmación no coincide con la nueva contraseña.';
    if (formClave.nueva === formClave.actual) return 'La nueva contraseña debe ser diferente a la actual.';
    return null;
  };

  const handleEnviarCodigoClave = async () => {
    setEstadoClave(null);
    const problema = validarClaves();
    if (problema) return setEstadoClave({ tipo: 'error', texto: problema });
    setOcupado('codigo');
    try {
      const r = await llamarServidor('/codigo/enviar', { proposito: 'clave' });
      setCodigoEnviado(true);
      setEstadoClave({ tipo: 'ok', texto: `Enviamos un código a ${r.correo}. Escríbelo abajo para confirmar el cambio.` });
    } catch (err) {
      setEstadoClave({ tipo: 'error', texto: err.message });
    } finally {
      setOcupado('');
    }
  };

  const handleCambiarClave = async (e) => {
    e.preventDefault();
    setEstadoClave(null);
    const problema = validarClaves();
    if (problema) return setEstadoClave({ tipo: 'error', texto: problema });
    if (!/^\d{6}$/.test(formClave.codigo.trim())) return setEstadoClave({ tipo: 'error', texto: 'Escribe el código de 6 dígitos que llegó a tu correo.' });

    setOcupado('clave');
    try {
      await llamarServidor('/clave/cambiar', {
        actual: formClave.actual, nueva: formClave.nueva, codigo: formClave.codigo.trim()
      });
      alert('Contraseña cambiada con éxito. Por seguridad se cerrarán las sesiones en otros dispositivos.');
      // Firebase invalida las sesiones al cambiar la contraseña: se vuelve a entrar con la nueva
      await signInWithEmailAndPassword(auth, usuario.email, formClave.nueva);
      // El nuevo inicio de sesión necesita su propia verificación (automática si el dispositivo es de confianza)
      onReverificar?.();
    } catch (err) {
      setEstadoClave({ tipo: 'error', texto: err.message });
      setOcupado('');
    }
  };

  const handleRevocar = async (d) => {
    const esEste = d.id === idActual;
    if (!confirm(esEste
      ? '¿Dejar de confiar en ESTE dispositivo? Se cerrará tu sesión y la próxima vez se pedirá código.'
      : `¿Dejar de confiar en "${d.nombre}"? Se cerrará la sesión en ese dispositivo.`)) return;
    try {
      await llamarServidor('/dispositivos/revocar', { id: d.id });
      if (esEste) {
        borrarDispositivo(usuario.uid);
        await cerrarSesion();
      }
    } catch (err) {
      alert('No se pudo quitar el dispositivo: ' + err.message);
    }
  };

  const tipoInputClave = verClaves ? 'text' : 'password';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Encabezado del perfil */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full">
            <UserCircle size={36} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{perfil?.nombre || 'Sin nombre'}</h2>
            <p className="text-sm text-slate-500">{usuario.email}</p>
            <span className={`inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
              perfil?.rol === 'principal' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
            }`}>
              {perfil?.rol === 'principal' ? 'Administrador principal' : 'Socio'}
            </span>
          </div>
        </div>
        <button
          onClick={cerrarSesion}
          className="flex items-center justify-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-900 transition shadow"
        >
          <LogOut size={16} /> Cerrar sesión
        </button>
      </div>

      {/* Nombre de usuario */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          <UserCircle size={18} className="text-indigo-600" /> Nombre de usuario
        </h3>
        <form onSubmit={handleGuardarNombre} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={claseInput}
          />
          <button type="submit" disabled={ocupado === 'nombre'} className={claseBoton}>
            <Save size={16} /> {ocupado === 'nombre' ? 'Guardando...' : 'Guardar'}
          </button>
        </form>
        <div className="mt-3"><Mensaje estado={estadoNombre} /></div>
      </div>

      {/* Correo */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
          <Mail size={18} className="text-indigo-600" /> Cambiar correo
        </h3>
        <p className="text-xs text-slate-500 mb-4">Llegará un enlace de confirmación al correo nuevo. Hasta que no lo abras, sigues usando el actual.</p>
        <form onSubmit={handleCambiarCorreo} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Correo nuevo</label>
            <input
              type="email"
              required
              value={formCorreo.nuevo}
              onChange={(e) => setFormCorreo({ ...formCorreo, nuevo: e.target.value })}
              className={claseInput}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Contraseña actual</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={formCorreo.actual}
              onChange={(e) => setFormCorreo({ ...formCorreo, actual: e.target.value })}
              className={claseInput}
            />
          </div>
          <button type="submit" disabled={ocupado === 'correo'} className={claseBoton}>
            <Send size={16} /> {ocupado === 'correo' ? 'Enviando...' : 'Enviar enlace'}
          </button>
        </form>
        <div className="mt-3"><Mensaje estado={estadoCorreo} /></div>
      </div>

      {/* Contraseña */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-start mb-1">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <KeyRound size={18} className="text-indigo-600" /> Cambiar contraseña
          </h3>
          <button
            type="button"
            onClick={() => setVerClaves(!verClaves)}
            className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1"
          >
            {verClaves ? <EyeOff size={14} /> : <Eye size={14} />} {verClaves ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">Necesitas tu contraseña actual y un código que llegará a tu correo.</p>
        <form onSubmit={handleCambiarClave} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Contraseña actual</label>
              <input
                type={tipoInputClave}
                autoComplete="current-password"
                value={formClave.actual}
                onChange={(e) => setFormClave({ ...formClave, actual: e.target.value })}
                className={claseInput}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nueva (mínimo 8)</label>
              <input
                type={tipoInputClave}
                autoComplete="new-password"
                value={formClave.nueva}
                onChange={(e) => setFormClave({ ...formClave, nueva: e.target.value })}
                className={claseInput}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Confirmar nueva</label>
              <input
                type={tipoInputClave}
                autoComplete="new-password"
                value={formClave.confirmar}
                onChange={(e) => setFormClave({ ...formClave, confirmar: e.target.value })}
                className={claseInput}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <button
              type="button"
              onClick={handleEnviarCodigoClave}
              disabled={ocupado === 'codigo'}
              className="flex items-center justify-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-900 transition shadow disabled:opacity-50"
            >
              <Send size={16} /> {ocupado === 'codigo' ? 'Enviando...' : codigoEnviado ? 'Reenviar código' : 'Enviar código al correo'}
            </button>
            {codigoEnviado && (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="Código de 6 dígitos"
                  value={formClave.codigo}
                  onChange={(e) => setFormClave({ ...formClave, codigo: e.target.value.replace(/\D/g, '') })}
                  className={`${claseInput} sm:w-48 tracking-widest`}
                />
                <button type="submit" disabled={ocupado === 'clave'} className={claseBoton}>
                  <KeyRound size={16} /> {ocupado === 'clave' ? 'Cambiando...' : 'Cambiar contraseña'}
                </button>
              </>
            )}
          </div>
          <Mensaje estado={estadoClave} />
        </form>
      </div>

      {/* Dispositivos de confianza */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
          <Smartphone size={18} className="text-indigo-600" /> Dispositivos de confianza
        </h3>
        <p className="text-xs text-slate-500 mb-4">En estos dispositivos no se pide código hasta la fecha de vencimiento. Quita los que ya no uses.</p>
        <div className="space-y-2">
          {dispositivos
            .slice()
            .sort((a, b) => (b.creado?.toMillis?.() || 0) - (a.creado?.toMillis?.() || 0))
            .map(d => (
              <div key={d.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                <div>
                  <p className="font-semibold text-slate-800">
                    {d.nombre}
                    {d.id === idActual && <span className="ml-2 text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">ESTE DISPOSITIVO</span>}
                  </p>
                  <p className="text-xs text-slate-500">Desde {formatoFecha(d.creado)} · vence {formatoFecha(d.expira)}</p>
                </div>
                <button onClick={() => handleRevocar(d)} className="text-rose-500 hover:text-rose-700 p-1" title="Dejar de confiar">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          {dispositivos.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-2">No hay dispositivos de confianza.</p>
          )}
        </div>
      </div>
    </div>
  );
}
