import React, { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from './firebase';
import { LogIn } from 'lucide-react';

const mensajesError = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/invalid-email': 'El correo no es válido.',
  'auth/user-disabled': 'Esta cuenta está deshabilitada.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  'auth/network-request-failed': 'Sin conexión a internet.'
};

export default function Login() {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  const handleIngresar = async (e) => {
    e.preventDefault();
    setError('');
    setAviso('');
    setEnviando(true);
    try {
      await signInWithEmailAndPassword(auth, correo.trim(), clave);
    } catch (err) {
      setError(mensajesError[err.code] || 'No se pudo iniciar sesión: ' + err.message);
    } finally {
      setEnviando(false);
    }
  };

  const handleOlvideClave = async () => {
    setError('');
    setAviso('');
    if (!correo.trim()) return setError('Escribe tu correo para enviarte el enlace de recuperación.');
    try {
      await sendPasswordResetEmail(auth, correo.trim());
      setAviso('Si el correo está registrado, te llegará un enlace para cambiar la contraseña.');
    } catch (err) {
      setError(mensajesError[err.code] || 'No se pudo enviar el correo: ' + err.message);
    }
  };

  return (
    <div className="flex flex-col justify-center items-center min-h-screen marca-cabecera border-0 shadow-none text-tinta font-sans p-4">
      <div className="w-full max-w-sm marca-tarjeta p-6">
        <div className="flex flex-col items-center mb-6 text-center">
          <img src="/marca/logotipo-horizontal.svg" alt="Tazón para Dos" className="w-60 mb-4" />
          <p className="marca-eyebrow text-gris-calido">Comestibles · Control de ventas</p>
          <p className="text-xs text-slate-500 mt-1">Acceso exclusivo para el equipo administrador</p>
        </div>

        <form onSubmit={handleIngresar} className="space-y-4">
          <div>
            <label className="etiqueta">Correo</label>
            <input
              type="email"
              required
              autoComplete="username"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="campo"
            />
          </div>
          <div>
            <label className="etiqueta">Contraseña</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              className="campo"
            />
          </div>

          {error && <p className="btn btn-peligro btn-sm">{error}</p>}
          {aviso && <p className="aviso aviso-ok">{aviso}</p>}

          <button
            type="submit"
            disabled={enviando}
            className="btn btn-primario w-full"
          >
            <LogIn size={16} /> {enviando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleOlvideClave}
          className="w-full text-center text-xs text-slate-500 hover:text-indigo-600 mt-4"
        >
          ¿Olvidaste tu contraseña?
        </button>
      </div>
      <p className="marca-eyebrow text-tinta/80 mt-6 text-center">Jugar también es escuchar · Engativá, Bogotá</p>
    </div>
  );
}
