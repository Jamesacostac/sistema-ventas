import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, LogOut, RefreshCw } from 'lucide-react';
import { llamarServidor, leerDispositivo, guardarDispositivo, borrarDispositivo, cerrarSesion } from './servidor';

// Pantalla que aparece después de iniciar sesión. Si el dispositivo es de confianza
// pasa directo; si no, envía un código al correo y lo pide.
export default function Verificacion({ usuario, onVerificada }) {
  const [fase, setFase] = useState('comprobando'); // comprobando | codigo | error
  const [correo, setCorreo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [confiar, setConfiar] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [espera, setEspera] = useState(0);
  const iniciado = useRef(false);

  const enviarCodigo = async () => {
    setError('');
    setEnviando(true);
    try {
      const r = await llamarServidor('/codigo/enviar', { proposito: 'dispositivo' });
      setAviso(`Enviamos un código de 6 dígitos a ${r.correo}. Revisa también la carpeta de spam.`);
      setEspera(60);
    } catch (err) {
      setError(err.message);
      const segundos = Number((err.message.match(/Espera (\d+) segundos/) || [])[1]);
      if (segundos) setEspera(segundos);
    } finally {
      setEnviando(false);
    }
  };

  const comprobar = async () => {
    setFase('comprobando');
    setError('');
    try {
      const tokenDispositivo = leerDispositivo(usuario.uid);
      const r = await llamarServidor('/sesion/iniciar', { dispositivo: tokenDispositivo });
      if (r.ok) return onVerificada();

      // El dispositivo no es de confianza (o venció): se pide código
      if (tokenDispositivo) borrarDispositivo(usuario.uid);
      setCorreo(r.correo);
      setFase('codigo');
      await enviarCodigo();
    } catch (err) {
      setError(err.message);
      setFase('error');
    }
  };

  useEffect(() => {
    // En modo desarrollo React ejecuta los efectos dos veces: se evita enviar dos códigos
    if (iniciado.current) return;
    iniciado.current = true;
    comprobar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera(espera - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const handleVerificar = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(codigo.trim())) return setError('El código tiene 6 dígitos.');
    setVerificando(true);
    try {
      const r = await llamarServidor('/sesion/verificar', { codigo: codigo.trim(), confiar });
      if (r.dispositivo) guardarDispositivo(usuario.uid, r.dispositivo);
      onVerificada();
    } catch (err) {
      setError(err.message);
      setCodigo('');
    } finally {
      setVerificando(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen marca-cabecera border-0 shadow-none text-tinta font-sans p-4">
      <div className="w-full max-w-sm marca-tarjeta p-6">
        <div className="flex flex-col items-center mb-5 text-center">
          <img src="/marca/sello.svg" alt="Tazón para Dos" className="h-16 w-16 mb-3" />
          <h1 className="text-lg font-bold text-slate-900">Verificación de dispositivo</h1>
          <p className="text-xs text-slate-500 mt-1">{usuario.email}</p>
        </div>

        {fase === 'comprobando' && (
          <p className="text-sm text-center text-slate-500 py-4">Comprobando este dispositivo...</p>
        )}

        {fase === 'error' && (
          <div className="space-y-4">
            <p className="btn btn-peligro btn-sm">{error}</p>
            <button
              onClick={comprobar}
              className="btn btn-primario w-full"
            >
              <RefreshCw size={16} /> Reintentar
            </button>
          </div>
        )}

        {fase === 'codigo' && (
          <form onSubmit={handleVerificar} className="space-y-4">
            <p className="text-sm text-slate-600">
              Es la primera vez que entras desde este dispositivo (o pasaron 30 días). Escribe el código que enviamos a <b>{correo}</b>.
            </p>

            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              className="campo text-2xl text-center tracking-[0.5em]"
              autoFocus
            />

            <label className="flex items-start gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confiar}
                onChange={(e) => setConfiar(e.target.checked)}
                className="mt-0.5 accent-indigo-600"
              />
              <span>
                <b>Confiar en este dispositivo durante 30 días</b>
                <span className="block text-xs text-slate-500">No volveremos a pedir código aquí durante 30 días. No lo marques en computadores públicos o prestados.</span>
              </span>
            </label>

            {aviso && !error && <p className="aviso aviso-ok">{aviso}</p>}
            {error && <p className="btn btn-peligro btn-sm">{error}</p>}

            <button
              type="submit"
              disabled={verificando || codigo.length !== 6}
              className="btn btn-primario w-full"
            >
              <ShieldCheck size={16} /> {verificando ? 'Verificando...' : 'Verificar'}
            </button>

            <button
              type="button"
              onClick={enviarCodigo}
              disabled={enviando || espera > 0}
              className="w-full text-center text-xs text-slate-500 hover:text-indigo-600 disabled:opacity-60 disabled:hover:text-slate-500"
            >
              {enviando ? 'Enviando...' : espera > 0 ? `Reenviar código en ${espera} s` : '¿No te llegó? Reenviar código'}
            </button>
          </form>
        )}

        <button
          onClick={cerrarSesion}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-rose-600 mt-5 pt-4 border-t border-slate-100"
        >
          <LogOut size={14} /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}
