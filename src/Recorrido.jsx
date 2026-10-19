import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { X, ArrowLeft, ArrowRight, Check } from 'lucide-react';

/**
 * Recorrido guiado: resalta partes de la pantalla (elementos con data-recorrido="...") y explica
 * cada una en una ventana flotante. Los pasos sin elemento (o con uno oculto) se muestran al centro
 * si no tienen `objetivo`, o se saltan si su elemento no está en pantalla (p. ej. en el celular).
 *
 *   pasos = [{ objetivo?: 'pedido', titulo, texto, antes?: () => void }]
 */

const MARGEN = 8;

const buscar = (objetivo) => {
  if (!objetivo) return null;
  const candidatos = [...document.querySelectorAll(`[data-recorrido="${objetivo}"]`)];
  return candidatos.find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || null;
};

export default function Recorrido({ pasos, onTerminar }) {
  const [indice, setIndice] = useState(0);
  const [rect, setRect] = useState(null);
  const [ancho, setAncho] = useState(() => window.innerWidth);
  const paso = pasos[indice];

  const medir = useCallback(() => {
    setAncho(window.innerWidth);
    const el = buscar(paso?.objetivo);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [paso]);

  // Al cambiar de paso: preparar la pantalla, llevar el elemento a la vista y medirlo
  useLayoutEffect(() => {
    if (!paso) return;
    paso.antes?.();
    const t = setTimeout(() => {
      const el = buscar(paso.objetivo);
      if (paso.objetivo && !el) {
        // No está en esta pantalla: se salta en la dirección en que se iba
        setIndice(i => (i < pasos.length - 1 ? i + 1 : i));
        return;
      }
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(medir, 350);
    }, 60);
    return () => clearTimeout(t);
  }, [indice]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [medir]);

  const siguiente = () => (indice < pasos.length - 1 ? setIndice(indice + 1) : onTerminar(true));
  const anterior = () => {
    // Retrocede saltando los pasos que no están en esta pantalla
    let i = indice - 1;
    while (i > 0 && pasos[i].objetivo && !buscar(pasos[i].objetivo)) i--;
    setIndice(Math.max(0, i));
  };

  useEffect(() => {
    const teclas = (e) => {
      if (e.key === 'Escape') onTerminar(false);
      if (e.key === 'ArrowRight' || e.key === 'Enter') siguiente();
      if (e.key === 'ArrowLeft') anterior();
    };
    window.addEventListener('keydown', teclas);
    return () => window.removeEventListener('keydown', teclas);
  });

  if (!paso) return null;
  const conObjetivo = paso.objetivo && rect;

  // Ventana flotante: debajo del elemento si cabe, si no arriba; al centro si no hay elemento
  const anchoVentana = Math.min(360, ancho - 2 * 16);
  let estiloVentana = { width: anchoVentana, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  if (conObjetivo) {
    const alto = 230;
    const abajo = rect.bottom + 14 + alto < window.innerHeight;
    const izquierda = Math.min(Math.max(16, rect.left + rect.width / 2 - anchoVentana / 2), ancho - anchoVentana - 16);
    estiloVentana = abajo
      ? { width: anchoVentana, left: izquierda, top: rect.bottom + 14 }
      : { width: anchoVentana, left: izquierda, top: Math.max(16, rect.top - 14), transform: 'translateY(-100%)' };
  }

  return (
    <div className="fixed inset-0 z-[60] no-print" role="dialog" aria-modal="true" aria-label={`Recorrido: ${paso.titulo}`}>
      {/* Fondo oscuro con un hueco sobre el elemento */}
      {conObjetivo ? (
        <div
          className="fixed rounded-2xl transition-all duration-300 pointer-events-none"
          style={{
            left: rect.left - MARGEN,
            top: rect.top - MARGEN,
            width: rect.width + 2 * MARGEN,
            height: rect.height + 2 * MARGEN,
            boxShadow: '0 0 0 3px var(--color-sol), 0 0 0 9999px color-mix(in srgb, var(--color-tinta) 55%, transparent)'
          }}
        />
      ) : (
        <div className="fixed inset-0" style={{ background: 'color-mix(in srgb, var(--color-tinta) 55%, transparent)' }} />
      )}
      {/* Captura los clics para que no se toque la app durante el recorrido */}
      <div className="fixed inset-0" onClick={(e) => e.stopPropagation()} />

      <div className="fixed panel p-4 sm:p-5 space-y-3 shadow-[0_12px_32px_rgba(0,0,0,0.18)] transition-all duration-300" style={estiloVentana}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="kpi-etiqueta text-gris-calido">Paso {indice + 1} de {pasos.length}</p>
            <h2 className="text-base font-bold text-tinta leading-snug mt-0.5">{paso.titulo}</h2>
          </div>
          <button onClick={() => onTerminar(false)} className="btn-icono" title="Saltar el recorrido" aria-label="Saltar el recorrido"><X size={16} /></button>
        </div>
        <p className="text-sm text-tinta/85 leading-relaxed">{paso.texto}</p>
        <div className="flex gap-1" aria-hidden="true">
          {pasos.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === indice ? 'w-5 bg-tinta' : i < indice ? 'w-1.5 bg-tinta/50' : 'w-1.5 bg-linea-fuerte'}`} />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button onClick={() => onTerminar(false)} className="enlace text-xs">Saltar</button>
          <div className="flex gap-2">
            {indice > 0 && <button onClick={anterior} className="btn btn-claro btn-sm"><ArrowLeft size={14} /> Atrás</button>}
            <button onClick={siguiente} className="btn btn-primario btn-sm">
              {indice < pasos.length - 1 ? <>Siguiente <ArrowRight size={14} /></> : <><Check size={14} /> Empezar</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
