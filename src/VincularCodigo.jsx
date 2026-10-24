import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Link2, PackagePlus, Barcode, ArrowLeft } from 'lucide-react';
import { codigosDe, codigoDeSabor } from './codigos';

const sinTildes = (texto) => String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Ventana que aparece al escanear un código que no está registrado.
 * Permite asignarlo a un producto que ya está en el inventario (para no crear duplicados)
 * o, si de verdad es nuevo, seguir con el registro normal.
 * Los productos que todavía no tienen código salen primero.
 * Si el producto tiene sabores (variantes de sus lotes), se pregunta a cuál sabor pertenece:
 * cada sabor de una misma marca trae su propio código de barras.
 */
export default function VincularCodigo({ codigo, productos, saboresDe, onVincular, onNuevo, onCerrar, textoNuevo = 'Es un producto nuevo' }) {
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [elegido, setElegido] = useState(null);
  const [saborNuevo, setSaborNuevo] = useState('');

  useEffect(() => {
    const cerrar = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [onCerrar]);

  const lista = useMemo(() => {
    const texto = sinTildes(busqueda.trim());
    return productos
      .filter(p => !texto || sinTildes(`${p.nombre} ${p.categoria}`).includes(texto))
      .sort((a, b) => (codigosDe(a).length > 0) - (codigosDe(b).length > 0) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
  }, [productos, busqueda]);

  const vincular = async (producto, sabor = null) => {
    if (guardando) return;
    setGuardando(true);
    try {
      await onVincular(producto, sabor);
    } finally {
      setGuardando(false);
    }
  };

  // Con sabores se pasa al segundo paso; sin sabores se vincula al producto directamente
  const elegir = (producto) => {
    if (saboresDe(producto).length > 0) return setElegido(producto);
    vincular(producto);
  };

  if (elegido) {
    const sabores = saboresDe(elegido);
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center no-print" role="dialog" aria-modal="true" aria-label="Elegir sabor">
        <div className="absolute inset-0 bg-tinta/50" onClick={onCerrar} />
        <div className="relative w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-white border-2 border-tinta rounded-t-[1.5rem] sm:rounded-[1.25rem] shadow-[6px_6px_0_rgba(40,32,59,0.25)] p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-tinta">{elegido.nombre}</h2>
              <p className="text-xs text-gris-calido">
                ¿De qué sabor es el código <b className="font-mono text-tinta">{codigo}</b>?
              </p>
            </div>
            <button onClick={onCerrar} className="btn-icono" title="Cerrar"><X size={18} /></button>
          </div>

          <div className="space-y-2">
            {sabores.map(sabor => {
              const actual = codigoDeSabor(elegido, sabor);
              return (
                <button
                  key={sabor}
                  type="button"
                  disabled={guardando}
                  onClick={() => vincular(elegido, sabor)}
                  className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-xl border-[1.5px] border-linea hover:border-tinta transition disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block font-bold text-sm text-tinta truncate">{sabor}</span>
                    <span className="block text-[11px] text-gris-calido truncate">
                      {actual ? <>tiene el código <span className="font-mono">{actual}</span> (se reemplaza)</> : 'sin código'}
                    </span>
                  </span>
                  <Link2 size={16} className="shrink-0 text-gris-calido" />
                </button>
              );
            })}
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); if (saborNuevo.trim()) vincular(elegido, saborNuevo.trim()); }}
          >
            <input
              type="text"
              placeholder="Otro sabor (ej. Mora)"
              value={saborNuevo}
              onChange={(e) => setSaborNuevo(e.target.value)}
              className="campo"
            />
            <button type="submit" disabled={guardando || !saborNuevo.trim()} className="btn btn-oscuro shrink-0">Vincular</button>
          </form>

          <div className="flex gap-2">
            <button type="button" onClick={() => setElegido(null)} disabled={guardando} className="btn btn-claro flex-1">
              <ArrowLeft size={16} /> Otro producto
            </button>
            <button type="button" onClick={() => vincular(elegido)} disabled={guardando} className="btn btn-claro flex-1" title="El código sirve para todos los sabores">
              Sin sabor
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center no-print" role="dialog" aria-modal="true" aria-label="Vincular código">
      <div className="absolute inset-0 bg-tinta/50" onClick={onCerrar} />
      <div className="relative w-full sm:max-w-md max-h-[90dvh] flex flex-col bg-white border-2 border-tinta rounded-t-[1.5rem] sm:rounded-[1.25rem] shadow-[6px_6px_0_rgba(40,32,59,0.25)] p-5 gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-tinta flex items-center gap-2"><Barcode size={18} /> Código sin registrar</h2>
            <p className="text-xs text-gris-calido">
              <b className="font-mono text-tinta">{codigo}</b> · ¿Es de un producto que ya tienes? Elígelo y quedará vinculado.
            </p>
          </div>
          <button onClick={onCerrar} className="btn-icono" title="Cerrar"><X size={18} /></button>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-calido" />
          <input
            type="search"
            autoFocus
            placeholder="Buscar producto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="campo pl-9"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-2">
          {lista.length === 0 && <p className="text-sm text-gris-calido text-center py-6">No hay productos con ese nombre.</p>}
          {lista.map(p => {
            const actuales = codigosDe(p);
            return (
              <button
                key={p.id}
                type="button"
                disabled={guardando}
                onClick={() => elegir(p)}
                className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-xl border-[1.5px] border-linea hover:border-tinta transition disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block font-bold text-sm text-tinta truncate">{p.nombre}</span>
                  <span className="block text-[11px] text-gris-calido truncate">
                    {p.categoria || 'Sin categoría'} · {actuales.length
                      ? <>ya tiene {actuales.length === 1 ? 'el código' : `${actuales.length} códigos:`} <span className="font-mono">{actuales[0]}</span> (se agrega como otro código)</>
                      : 'sin código'}
                  </span>
                </span>
                <Link2 size={16} className="shrink-0 text-gris-calido" />
              </button>
            );
          })}
        </div>

        <button type="button" onClick={onNuevo} disabled={guardando} className="btn btn-claro w-full">
          <PackagePlus size={16} /> {textoNuevo}
        </button>
      </div>
    </div>
  );
}
