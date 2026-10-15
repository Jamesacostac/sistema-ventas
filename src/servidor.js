import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import { limpiarConfigTelegram } from './telegram';

// URL del servidor de verificación (Cloudflare Worker). Se define en el archivo .env
const URL_SERVIDOR = import.meta.env.VITE_URL_SERVIDOR;

// Llama a una ruta del servidor enviando el token de sesión de Firebase
export const llamarServidor = async (ruta, datos = {}) => {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error('No hay una sesión iniciada.');
  if (!URL_SERVIDOR) throw new Error('Falta configurar VITE_URL_SERVIDOR en el archivo .env');

  const token = await usuario.getIdToken();
  let respuesta;
  try {
    respuesta = await fetch(`${URL_SERVIDOR}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(datos)
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor de verificación. Revisa tu conexión a internet.');
  }

  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(cuerpo.error || 'Error del servidor de verificación.');
    error.status = respuesta.status;
    throw error;
  }
  return cuerpo;
};

// Token del dispositivo de confianza (se guarda solo en este navegador)
const claveDispositivo = (uid) => `dispositivo_confiable_${uid}`;

export const leerDispositivo = (uid) => {
  try {
    return localStorage.getItem(claveDispositivo(uid));
  } catch {
    return null;
  }
};

export const guardarDispositivo = (uid, token) => {
  try {
    localStorage.setItem(claveDispositivo(uid), token);
  } catch {
    // Sin almacenamiento disponible: simplemente se pedirá código la próxima vez
  }
};

export const borrarDispositivo = (uid) => {
  try {
    localStorage.removeItem(claveDispositivo(uid));
  } catch {
    // Nada que borrar
  }
};

// Identificador del dispositivo tal como lo guarda el servidor (hash SHA-256 del token)
export const idDispositivoActual = async (uid) => {
  const token = leerDispositivo(uid);
  if (!token) return null;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
};

export const cerrarSesion = async () => {
  limpiarConfigTelegram();
  await signOut(auth);
};
