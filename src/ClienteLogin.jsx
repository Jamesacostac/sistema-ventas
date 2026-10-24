import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { auth } from './firebaseClientes';
import { LogIn, UserPlus } from 'lucide-react';
import { mensajesErrorCliente } from './pedidosEnLinea';

/**
 * Entrada del portal de clientes: iniciar sesión o crear cuenta.
 * Con la cuenta, el historial de compras queda guardado en cualquier celular.
 */
export default function ClienteLogin() {
  const [modo, setModo] = useState('ingreso'); // 'ingreso' | 'registro'
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const registro = modo === 'registro';

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setAviso('');
    if (registro && !nombre.trim()) return setError('Escribe tu nombre.');
    setEnviando(true);
    try {
      if (registro) {
        // El portal puede abrir antes de que el nombre quede en el perfil
        try { localStorage.setItem('nombre_cliente', nombre.trim()); } catch { /* sin almacenamiento */ }
        const { user } = await createUserWithEmailAndPassword(auth, correo.trim(), clave);
        await updateProfile(user, { displayName: nombre.trim() });
        await user.reload();
      } else {
        await signInWithEmailAndPassword(auth, correo.trim(), clave);
      }
    } catch (err) {
      setError(mensajesErrorCliente[err.code] || 'No se pudo continuar: ' + err.message);
      setEnviando(false);
    }
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

  const cambiarModo = (nuevo) => { setModo(nuevo); setError(''); setAviso(''); };

  return (
    <div className="flex flex-col justify-center items-center min-h-screen marca-cabecera border-0 shadow-none text-tinta font-sans p-4">
      <div className="w-full max-w-sm marca-tarjeta p-6">
        <div className="flex flex-col items-center mb-6 text-center">
          <img src="/marca/logotipo-horizontal.svg" alt="Tazón para Dos" className="w-60 mb-4" />
          <p className="marca-eyebrow text-gris-calido">Haz tu pedido · Paga en caja</p>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-5">
          <button type="button" onClick={() => cambiarModo('ingreso')} className={`chip !inline-flex items-center justify-center gap-1.5 ${!registro ? 'chip-activo' : ''}`}><LogIn size={14} /> Iniciar sesión</button>
          <button type="button" onClick={() => cambiarModo('registro')} className={`chip !inline-flex items-center justify-center gap-1.5 ${registro ? 'chip-activo' : ''}`}><UserPlus size={14} /> Crear cuenta</button>
        </div>

        <form onSubmit={enviar} className="space-y-4">
          {registro && (
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
              autoComplete={registro ? 'new-password' : 'current-password'}
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              className="campo"
            />
          </div>

          {error && <p className="aviso aviso-error">{error}</p>}
          {aviso && <p className="aviso aviso-ok">{aviso}</p>}

          <button type="submit" disabled={enviando} className="btn btn-primario w-full">
            {registro
              ? <><UserPlus size={16} /> {enviando ? 'Creando...' : 'Crear cuenta'}</>
              : <><LogIn size={16} /> {enviando ? 'Ingresando...' : 'Ingresar'}</>}
          </button>
        </form>

        {!registro && (
          <button type="button" onClick={olvideClave} className="w-full text-center text-xs text-gris-calido hover:text-tinta mt-4">
            ¿Olvidaste tu contraseña?
          </button>
        )}
        <p className="text-xs text-gris-calido text-center mt-4">Con tu cuenta, tu historial de compras queda guardado aunque cambies de celular.</p>
      </div>
      <p className="marca-eyebrow text-tinta/80 mt-6 text-center">Jugar también es escuchar · Engativá, Bogotá</p>
    </div>
  );
}
