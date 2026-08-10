const TELEGRAM_BOT_TOKEN = '8948898576:AAFtq3k9kRIwz1SwG_Wlwl1Ss4c2MFX9hgU';

// Lista con los Chat IDs de los 3 socios
const CHAT_IDS_SOCIOS = [
  '1283673615',
  '786677703',
  '429181093'
];

export const enviarMensajeTelegram = async (mensajeTexto) => {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.includes('AQUÍ_TU_TOKEN')) {
    console.error("Falta configurar el Token de Telegram.");
    return false;
  }

  let exitoGlobal = true;

  for (const chatId of CHAT_IDS_SOCIOS) {
    if (!chatId || chatId.includes('AQUÍ_CHAT_ID')) continue;

    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
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
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.includes('AQUÍ_TU_TOKEN')) return [];

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${ultimoUpdateId + 1}`;
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