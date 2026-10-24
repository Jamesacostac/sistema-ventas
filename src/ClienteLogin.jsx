import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, sendPasswordResetEmail, updateProfile
} from 'firebase/auth';
import { auth } from './firebase';
import { ArrowLeft, LogIn, UserPlus, ShoppingBag } from 'lucide-react';
import { mensajesErrorCliente } from './pedidosEnLinea';


/**
 * Entrada de los clientes: crear cuenta, iniciar sesión o pedir como invitado (sin registrarse).
 * Con cuenta, el historial de compras queda guardado en cualquier celular.
 */
export default function ClienteLogin({ onVolver }) {
  const [modo, setModo] = useState('inicio'); // 'inicio' | 'registro' | 'ingreso'
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  const intentar = async (accion) => {
    setError('');
    setAviso('');
    setEnviando(true);
    try {
      await accion();
    } catch (err) {
      setError(mensajesErrorCliente[err.code] || 'No se pudo continuar: ' + err.message);
      setEnviando(false);
    }
  };

  const registrarse = (e) => {
    e.preventDefault();
    if (!nombre.trim()) return setError('Escribe tu nombre.');
    intentar(async () => {
      // La app del cliente puede abrir antes de que el nombre quede en el perfil
      try { localStorage.setItem('nombre_cliente', nombre.trim()); } catch { /* sin almacenamiento */ }
      const { user } = await createUserWithEmailAndPassword(auth, correo.trim(), clave);
      await updateProfile(user, { displayName: nombre.trim() });
      await user.reload();
    });
  };

  const ingresar = (e) => {
    e.preventDefault();
    intentar(() => signInWithEmailAndPassword(auth, correo.trim(), clave));
  };

  const olvideClave = async () => {
    setError('');
    setAviso('');
    if (!correo.trim()) return setError('Escribe tu correo para enviarte el enlace de recuperación.');
    try {
      await sendPasswordResetEmail(auth, correo.trim());
      setAviso('Si el correo está registrado, te llegará un enlace para cambiar la contraseña.');
    } catch (err) {
      setError(mensajesErrorCliente[err.code] || 'No se pudo enviar el correo: ' + err.message);
    }
  };

  const campos = (conNombre) => (
    <>
      {conNombre && (
        <div>
          <label className="etiqueta">Tu nombre</label>
          <input required autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} className="campo" maxLength={60} />
        </div>
      )}
      <div>
        <label className="etiqueta">Correo</label>
        <input type="email" required autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} className="campo" />
      </div>
      <div>
        <label className="etiqueta">Contraseña</label>
        <input
          type="password"
          required
          minLength={6}
          autoComplete={conNombre ? 'new-password' : 'current-password'}
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          className="campo"
        />
      </div>
    </>
  );

  return (
    <div className="flex flex-col justify-center items-center min-h-screen marca-cabecera border-0 shadow-none text-tinta font-sans p-4">
      <div className="w-full max-w-sm marca-tarjeta p-6">
        <div className="flex flex-col items-center mb-6 text-center">
          <img src="/marca/logotipo-horizontal.svg" alt="Tazón para Dos" className="w-60 mb-4" />
          <p className="marca-eyebrow text-gris-calido">Haz tu pedido · Paga en caja</p>
        </div>

        {modo === 'inicio' && (
          <div className="space-y-3">
            <button onClick={() => intentar(() => signInAnonymously(auth))} disabled={enviando} className="btn btn-primario w-full">
              <ShoppingBag size={16} /> {enviando ? 'Entrando...' : 'Pedir sin registrarme'}
            </button>
            <button onClick={() => setModo('registro')} className="btn btn-oscuro w-full"><UserPlus size={16} /> Crear cuenta</button>
            <button onClick={() => setModo('ingreso')} className="btn btn-claro w-full"><LogIn size={16} /> Ya tengo cuenta</button>
            <p className="text-xs text-gris-calido text-center">Con cuenta, tu historial de compras queda guardado aunque cambies de celular.</p>
          </div>
        )}

        {modo === 'registro' && (
          <form onSubmit={registrarse} className="space-y-4">
            {campos(true)}
            <button type="submit" disabled={enviando} className="btn btn-primario w-full"><UserPlus size={16} /> {enviando ? 'Creando...' : 'Crear cuenta'}</button>
          </form>
        )}

        {modo === 'ingreso' && (
          <form onSubmit={ingresar} className="space-y-4">
            {campos(false)}
            <button type="submit" disabled={enviando} className="btn btn-primario w-full"><LogIn size={16} /> {enviando ? 'Ingresando...' : 'Ingresar'}</button>
            <button type="button" onClick={olvideClave} className="w-full text-center text-xs text-gris-calido hover:text-tinta">¿Olvidaste tu contraseña?</button>
          </form>
        )}

        {error && <p className="aviso aviso-error mt-4">{error}</p>}
        {aviso && <p className="aviso aviso-ok mt-4">{aviso}</p>}

        <button
          type="button"
          onClick={() => (modo === 'inicio' ? onVolver() : (setModo('inicio'), setError(''), setAviso('')))}
          className="w-full mt-5 text-xs text-gris-calido hover:text-tinta flex items-center justify-center gap-1"
        >
          <ArrowLeft size={13} /> {modo === 'inicio' ? 'Soy del equipo del negocio' : 'Volver'}
        </button>
      </div>
      <p className="marca-eyebrow text-tinta/80 mt-6 text-center">Jugar también es escuchar · Engativá, Bogotá</p>
    </div>
  );
}
