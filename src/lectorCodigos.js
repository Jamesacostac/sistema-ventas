import { useEffect, useRef } from 'react';

// Pitido corto para confirmar la lectura (copia liviana para no cargar la librería de cámara)
const pitar = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gan = ctx.createGain();
    osc.frequency.value = 1350;
    gan.gain.value = 0.08;
    osc.connect(gan).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
    osc.onended = () => ctx.close();
  } catch {
    // Sin audio disponible
  }
};

/**
 * Lector USB/Bluetooth: estos lectores "escriben" el código muy rápido y terminan con Enter.
 * Se detecta por la velocidad, así que no interfiere con lo que la persona teclea a mano.
 * No actúa si el foco está en un campo de texto (ahí el código llega al campo).
 */
export function useLectorCodigos(onCodigo, activo = true) {
  const onCodigoRef = useRef(onCodigo);
  useEffect(() => { onCodigoRef.current = onCodigo; }, [onCodigo]);

  useEffect(() => {
    if (!activo) return;
    let buffer = '';
    let ultimaTecla = 0;

    const alPresionar = (e) => {
      const el = document.activeElement;
      const escribiendo = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (escribiendo || e.ctrlKey || e.altKey || e.metaKey) return;

      const ahora = Date.now();
      if (ahora - ultimaTecla > 60) buffer = '';
      ultimaTecla = ahora;

      if (e.key === 'Enter') {
        if (buffer.length >= 6) {
          e.preventDefault();
          pitar();
          onCodigoRef.current(buffer);
        }
        buffer = '';
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [activo]);
}
