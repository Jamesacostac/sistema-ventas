import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { X, ScanLine, CameraOff } from 'lucide-react';
import { limpiarCodigo } from './codigos';

// Formatos de los códigos de productos (más rápido que buscar todos los tipos)
const FORMATOS = [
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF
];

// Pitido corto para confirmar la lectura
export const pitar = () => {
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
    // Sin audio disponible: no pasa nada
  }
};

/**
 * Ventana con la cámara para leer códigos de barras.
 *  - continuo=false: se cierra sola al leer el primer código (inventario)
 *  - continuo=true: sigue abierta para escanear varios productos (ventas)
 */
export function EscanerCamara({ abierto, onCerrar, onCodigo, continuo = false, titulo = 'Escanear código' }) {
  const videoRef = useRef(null);
  const ultimo = useRef({ codigo: '', momento: 0 });
  const onCodigoRef = useRef(onCodigo);
  const onCerrarRef = useRef(onCerrar);
  const [error, setError] = useState('');
  const [leido, setLeido] = useState('');

  useEffect(() => { onCodigoRef.current = onCodigo; onCerrarRef.current = onCerrar; }, [onCodigo, onCerrar]);

  useEffect(() => {
    if (!abierto) return;
    setError('');
    setLeido('');
    let controles = null;
    let cancelado = false;

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATOS);
    const lector = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });

    lector.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      videoRef.current,
      (resultado) => {
        if (!resultado || cancelado) return;
        const codigo = limpiarCodigo(resultado.getText());
        const ahora = Date.now();
        // Evita leer el mismo código varias veces seguidas
        if (codigo === ultimo.current.codigo && ahora - ultimo.current.momento < 1800) return;
        ultimo.current = { codigo, momento: ahora };
        pitar();
        setLeido(codigo);
        onCodigoRef.current(codigo);
        if (!continuo) onCerrarRef.current();
      }
    ).then(c => {
      controles = c;
      if (cancelado) c.stop();
    }).catch((e) => {
      setError(
        e?.name === 'NotAllowedError'
          ? 'No diste permiso para usar la cámara. Actívalo en el candado de la barra de direcciones y vuelve a intentar.'
          : e?.name === 'NotFoundError'
            ? 'No se encontró ninguna cámara en este dispositivo. Puedes usar un lector USB/Bluetooth o escribir el código.'
            : 'No se pudo abrir la cámara: ' + (e?.message || e)
      );
    });

    return () => {
      cancelado = true;
      controles?.stop();
    };
  }, [abierto, continuo]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 bg-tinta/70 flex items-end sm:items-center justify-center p-3" onClick={onCerrar}>
      <div className="marca-tarjeta w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold flex items-center gap-2"><ScanLine size={18} /> {titulo}</h2>
          <button onClick={onCerrar} className="btn-icono" aria-label="Cerrar"><X size={18} /></button>
        </div>

        {error ? (
          <div className="aviso aviso-error"><CameraOff size={16} className="shrink-0 mt-0.5" /> <span>{error}</span></div>
        ) : (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            {/* Guía de encuadre */}
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-24 border-[3px] border-sol rounded-xl shadow-[0_0_0_9999px_rgba(40,32,59,0.35)]" />
            <div className="absolute inset-x-10 top-1/2 h-0.5 bg-coral/90 animate-pulse" />
          </div>
        )}

        <p className="text-xs text-gris-calido mt-3 text-center">
          {leido
            ? <>Leído: <b className="font-mono text-tinta">{leido}</b>{continuo && ' · sigue escaneando o cierra'}</>
            : 'Centra el código de barras dentro del recuadro.'}
        </p>
      </div>
    </div>
  );
}
