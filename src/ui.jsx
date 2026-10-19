import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Menú desplegable accesible: se abre con clic, se cierra al elegir,
 * al hacer clic afuera o con Escape.
 *
 *   <MenuDesplegable etiqueta="Inventario" icono={<Package size={16} />} activo={...}>
 *     <MenuItem icono={...} onClick={...} activo>Productos</MenuItem>
 *     <MenuSeparador />
 *   </MenuDesplegable>
 */
export function MenuDesplegable({ etiqueta, icono, activo = false, alinear = 'izquierda', claseBoton, children, insignia, recorrido }) {
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState(null);
  const ref = useRef(null);
  const botonRef = useRef(null);

  // El menú se ubica con posición fija bajo el botón, así no lo recorta una barra deslizable
  const abrir = () => {
    if (abierto) return setAbierto(false);
    const r = botonRef.current.getBoundingClientRect();
    const anchoMenu = 240;
    setPosicion(alinear === 'derecha'
      ? { top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) }
      : { top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - anchoMenu - 8)) });
    setAbierto(true);
  };

  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setAbierto(false);
    const cerrarAfuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    const cerrarEscape = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', cerrarAfuera);
    document.addEventListener('touchstart', cerrarAfuera);
    document.addEventListener('keydown', cerrarEscape);
    window.addEventListener('resize', cerrar);
    window.addEventListener('scroll', cerrar, true);
    return () => {
      document.removeEventListener('mousedown', cerrarAfuera);
      document.removeEventListener('touchstart', cerrarAfuera);
      document.removeEventListener('keydown', cerrarEscape);
      window.removeEventListener('resize', cerrar);
      window.removeEventListener('scroll', cerrar, true);
    };
  }, [abierto]);

  return (
    <div ref={ref} className="relative" data-recorrido={recorrido}>
      <button
        ref={botonRef}
        type="button"
        onClick={abrir}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className={claseBoton || `pestana ${activo ? 'pestana-activa' : ''}`}
      >
        {icono}
        {etiqueta}
        {insignia}
        <ChevronDown size={14} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div
          role="menu"
          className="menu-panel"
          style={{ position: 'fixed', marginTop: 0, ...posicion }}
          onClick={(e) => { if (e.target.closest('[role="menuitem"]')) setAbierto(false); }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icono, onClick, activo = false, peligro = false, children, detalle }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`menu-item ${activo ? 'menu-item-activo' : ''} ${peligro ? 'menu-item-peligro' : ''}`}
    >
      {icono}
      <span className="flex-1">
        {children}
        {detalle && <span className={`block text-[11px] font-normal ${activo ? 'opacity-80' : 'text-gris-calido'}`}>{detalle}</span>}
      </span>
    </button>
  );
}

// ¿La pantalla cumple la media query? (se actualiza al cambiar el tamaño)
export function usePantalla(consulta) {
  const [cumple, setCumple] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const cambiar = () => setCumple(mq.matches);
    cambiar();
    mq.addEventListener('change', cambiar);
    return () => mq.removeEventListener('change', cambiar);
  }, [consulta]);
  return cumple;
}

export const MenuSeparador = () => <div role="separator" className="menu-separador" />;

export const MenuTitulo = ({ children }) => <p className="menu-titulo">{children}</p>;

/**
 * Sección plegable para formularios que no se usan todo el tiempo.
 * Se abre sola cuando `forzarAbierto` es verdadero (por ejemplo, al editar).
 */
export function Plegable({ titulo, icono, descripcion, abiertoInicial = false, forzarAbierto = false, children }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const visible = abierto || forzarAbierto;

  return (
    <div className="panel no-print">
      <button
        type="button"
        onClick={() => setAbierto(!visible)}
        aria-expanded={visible}
        className="w-full flex items-center justify-between gap-3 p-5 text-left"
      >
        <h2 className="text-base font-bold text-tinta flex items-center gap-2.5">
          {icono}
          <span>
            {titulo}
            {descripcion && <span className="block text-xs font-normal text-gris-calido font-sans">{descripcion}</span>}
          </span>
        </h2>
        <span className="btn btn-claro btn-sm">
          {visible ? 'Ocultar' : 'Abrir'}
          <ChevronDown size={14} className={`transition-transform ${visible ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {visible && <div className="px-5 pb-5 pt-4 border-t-[1.5px] border-dashed border-linea">{children}</div>}
    </div>
  );
}
