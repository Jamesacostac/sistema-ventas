import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// Cada negocio tiene su propia configuración de Telegram en negocios/{id}/config/telegram,
// que solo pueden leer sus miembros con sesión verificada (ver firestore.rules) y que el
// titular cambia desde Equipo → Configuración.
//   { token: "123:ABC...", chatIds: ["111", "222", "333"] }
const cache = new Map();

const obtenerConfigTelegram = async (negocioId) => {
  if (!negocioId) return null;
  if (cache.has(negocioId)) return cache.get(negocioId);

  try {
    const snap = await getDoc(doc(db, 'negocios', negocioId, 'config', 'telegram'));
    const datos = snap.exists() ? snap.data() : null;
    const config = datos?.token && Array.isArray(datos.chatIds) && datos.chatIds.length
      ? { token: datos.token, chatIds: datos.chatIds.filter(Boolean) }
      : null;
    cache.set(negocioId, config);
    return config;
  } catch (error) {
    console.error("No se pudo leer la configuración de Telegram:", error);
    return null;
  }
};

export const limpiarConfigTelegram = (negocioId) => {
  if (negocioId) cache.delete(negocioId);
  else cache.clear();
};

export const telegramConfigurado = async (negocioId) => !!(await obtenerConfigTelegram(negocioId));

export const enviarMensajeTelegram = async (mensajeTexto, negocioId) => {
  const config = await obtenerConfigTelegram(negocioId);
  if (!config) return false;

  let exitoGlobal = true;

  for (const chatId of config.chatIds) {
    try {
      const url = `https://api.telegram.org/bot${config.token}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: mensajeTexto,
          parse_mode: 'HTML'
        })
      });

      const data = await response.json();
      if (!data.ok) {
        console.error(`Error enviando a Telegram ID ${chatId}:`, data.description);
        exitoGlobal = false;
      }
    } catch (error) {
      console.error(`Error de red al enviar a Telegram ID ${chatId}:`, error);
      exitoGlobal = false;
    }
  }

  return exitoGlobal;
};

// Últimos mensajes enviados al bot del negocio (para responder "cierre", "stock"...)
const ultimoUpdatePorToken = new Map();

export const obtenerUltimosMensajesTelegram = async (negocioId) => {
  const config = await obtenerConfigTelegram(negocioId);
  if (!config) return [];

  try {
    const ultimo = ultimoUpdatePorToken.get(config.token) || 0;
    const url = `https://api.telegram.org/bot${config.token}/getUpdates?offset=${ultimo + 1}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.ok && data.result.length > 0) {
      ultimoUpdatePorToken.set(config.token, data.result[data.result.length - 1].update_id);
      return data.result;
    }
  } catch (error) {
    console.error("Error al consultar mensajes de Telegram:", error);
  }

  return [];
};
