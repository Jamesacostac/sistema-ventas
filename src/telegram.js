import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// El token y los Chat IDs de los socios NO van en el código: se guardan en
// Firestore en el documento config/telegram, que solo pueden leer los
// administradores con sesión iniciada (ver firestore.rules).
//   config/telegram = { token: "123:ABC...", chatIds: ["111", "222", "333"] }
let configCache = null;

const obtenerConfigTelegram = async () => {
  if (configCache) return configCache;

  try {
    const snap = await getDoc(doc(db, 'config', 'telegram'));
    if (!snap.exists()) {
      console.error("Falta crear el documento config/telegram en Firestore.");
      return null;
    }
    const { token, chatIds } = snap.data();
    if (!token || !Array.isArray(chatIds)) {
      console.error("El documento config/telegram debe tener 'token' y 'chatIds'.");
      return null;
    }
    configCache = { token, chatIds };
    return configCache;
  } catch (error) {
    console.error("No se pudo leer la configuración de Telegram:", error);
    return null;
  }
};

export const limpiarConfigTelegram = () => {
  configCache = null;
};

export const enviarMensajeTelegram = async (mensajeTexto) => {
  const config = await obtenerConfigTelegram();
  if (!config) return false;

  let exitoGlobal = true;

  for (const chatId of config.chatIds) {
    if (!chatId) continue;

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

// Función para obtener los últimos mensajes enviados al Bot
let ultimoUpdateId = 0;

export const obtenerUltimosMensajesTelegram = async () => {
  const config = await obtenerConfigTelegram();
  if (!config) return [];

  try {
    const url = `https://api.telegram.org/bot${config.token}/getUpdates?offset=${ultimoUpdateId + 1}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.ok && data.result.length > 0) {
      ultimoUpdateId = data.result[data.result.length - 1].update_id;
      return data.result;
    }
  } catch (error) {
    console.error("Error al consultar mensajes de Telegram:", error);
  }

  return [];
};
