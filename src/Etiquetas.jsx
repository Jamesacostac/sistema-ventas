import React, { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer, Tags, Sparkles, Search } from 'lucide-react';
import { codigosDe, esEAN13Valido, esCodigoInterno } from './codigos';

// Formatos de hoja carta (medidas en mm). Los "Avery" coinciden con las hojas de
// stickers precortadas más comunes en papelería; "recortar" sirve con papel normal.
const FORMATOS = {
  carta30: { nombre: 'Stickers 3 × 10 (30 por hoja, 6,7 × 2,5 cm)', cols: 3, filas: 10, ancho: 66.7, alto: 25.4, arriba: 12.7, izquierda: 4.8, sepX: 3.2, sepY: 0, borde: false },
  carta20: { nombre: 'Stickers 2 × 10 (20 por hoja, 10,2 × 2,5 cm)', cols: 2, filas: 10, ancho: 101.6, alto: 25.4, arriba: 12.7, izquierda: 4.0, sepX: 4.8, sepY: 0, borde: false },
  carta10: { nombre: 'Stickers 2 × 5 (10 por hoja, 10,2 × 5,1 cm)', cols: 2, filas: 5, ancho: 101.6, alto: 50.8, arriba: 12.7, izquierda: 4.0, sepX: 4.8, sepY: 0, borde: false },
  recortar: { nombre: 'Papel normal para recortar (24 por hoja)', cols: 3, filas: 8, ancho: 63, alto: 31, arriba: 10, izquierda: 9, sepX: 3, sepY: 2.5, borde: true }
};

const dinero = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');

// Código de barras como SVG (EAN-13 si es válido; si no, Code 128)
const svgCodigo = (codigo, alto) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, codigo, {
      format: esEAN13Valido(codigo) ? 'EAN13' : 'CODE128',
      height: alto,
      width: 1.6,
      margin: 0,
      fontSize: 13,
      textMargin: 1,
      font: 'DM Mono, monospace',
      background: 'transparent',
      lineColor: '#28203B'
    });
    return svg.outerHTML;
  } catch {
    return `<div style="font:12px monospace">${codigo}</div>`;
  }
};

const escapar = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const htmlEtiqueta = (p, opciones, formato) => `
  <div class="etiqueta">
    ${opciones.nombre || opciones.precio ? `<div class="fila">
      ${opciones.nombre ? `<span class="nombre">${escapar(p.nombre)}</span>` : '<span></span>'}
      ${opciones.precio ? `<span class="precio">${p.precio === 0 ? 'Regalo' : dinero(p.precio)}</span>` : ''}
    </div>` : ''}
    <div class="codigo">${svgCodigo(p.codigo, formato.alto >= 40 ? 60 : 28)}</div>
  </div>`;

const paginaImpresion = (etiquetas, formato, opciones) => {
  const porHoja = formato.cols * formato.filas;
  const hojas = [];
  for (let i = 0; i < etiquetas.length; i += porHoja) hojas.push(etiquetas.slice(i, i + porHoja));
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas · Tazón para Dos</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@500&family=DM+Sans:wght@700&display=swap" rel="stylesheet">
  <style>
    @page { size: letter portrait; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'DM Sans', sans-serif; color: #28203B; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .hoja { width: 215.9mm; height: 279.4mm; padding: ${formato.arriba}mm 0 0 ${formato.izquierda}mm;
      display: grid; grid-template-columns: repeat(${formato.cols}, ${formato.ancho}mm); grid-auto-rows: ${formato.alto}mm;
      column-gap: ${formato.sepX}mm; row-gap: ${formato.sepY}mm; page-break-after: always; break-after: page; align-content: start; }
    .hoja:last-child { page-break-after: auto; break-after: auto; }
    .etiqueta { padding: 1.6mm 3mm; display: flex; flex-direction: column; justify-content: center; gap: 0.8mm; overflow: hidden;
      ${formato.borde ? 'border: 0.3mm dashed #B9AFA0; border-radius: 2mm;' : ''} }
    .fila { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; }
    .nombre { font-size: ${formato.alto >= 40 ? 13 : 9}pt; font-weight: 700; line-height: 1.1; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .precio { font-family: 'DM Mono', monospace; font-size: ${formato.alto >= 40 ? 12 : 8.5}pt; white-space: nowrap; }
    .codigo { display: flex; justify-content: center; min-height: 0; }
    .codigo svg { max-width: 100%; height: auto; max-height: ${formato.alto >= 40 ? 30 : 14.5}mm; }
    @media screen { body { background: #e9e1d2; } .hoja { background: #fff; margin: 12px auto; box-shadow: 0 2px 8px rgba(0,0,0,.15); } }
  </style></head><body>
  ${hojas.map(h => `<div class="hoja">${h.map(p => htmlEtiqueta(p, opciones, formato)).join('')}</div>`).join('')}
  <script>document.fonts.ready.then(() => setTimeout(() => window.print(), 300));</script>
  </body></html>`;
};

export default function Etiquetas({ productos, puedeEditar, onAsignarCodigos }) {
  const [cantidades, setCantidades] = useState({});
  const [formatoClave, setFormatoClave] = useState('carta30');
  const [opciones, setOpciones] = useState({ nombre: true, precio: true });
  const [busqueda, setBusqueda] = useState('');
  const [asignando, setAsignando] = useState(false);
  const vistaRef = useRef(null);
  const formato = FORMATOS[formatoClave];

  const lista = useMemo(() => productos
    .map(p => ({ ...p, codigo: codigosDe(p)[0] || '' }))
    .filter(p => !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.codigo.includes(busqueda))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [productos, busqueda]);

  const sinCodigo = productos.filter(p => codigosDe(p).length === 0);
  const etiquetas = lista.flatMap(p => (p.codigo ? Array(Number(cantidades[p.id]) || 0).fill(p) : []));
  const porHoja = formato.cols * formato.filas;
  const hojas = Math.ceil(etiquetas.length / porHoja);

  const fijar = (id, valor) => setCantidades(c => ({ ...c, [id]: Math.max(0, Math.min(500, Number(valor) || 0)) }));
  const llenarHoja = (p) => fijar(p.id, (Number(cantidades[p.id]) || 0) + porHoja);

  // Vista previa de una etiqueta
  useEffect(() => {
    if (!vistaRef.current) return;
    const ejemplo = lista.find(p => p.codigo && cantidades[p.id] > 0) || lista.find(p => p.codigo);
    vistaRef.current.innerHTML = ejemplo
      ? `<style>.etiqueta{width:${formato.ancho}mm;height:${formato.alto}mm;padding:1.6mm 3mm;display:flex;flex-direction:column;justify-content:center;gap:.8mm;background:#fff;border:1px solid #D6CCBA;border-radius:2mm}.fila{display:flex;justify-content:space-between;align-items:baseline;gap:2mm}.nombre{font-size:${formato.alto >= 40 ? 13 : 9}pt;font-weight:700;line-height:1.1}.precio{font-family:'DM Mono',monospace;font-size:${formato.alto >= 40 ? 12 : 8.5}pt}.codigo{display:flex;justify-content:center}.codigo svg{max-width:100%;height:auto;max-height:${formato.alto >= 40 ? 30 : 14.5}mm}</style>${htmlEtiqueta(ejemplo, opciones, formato)}`
      : '<p style="font-size:12px;color:#665F68">Asigna un código a algún producto para ver la vista previa.</p>';
  }, [lista, cantidades, formato, opciones]);

  const imprimir = () => {
    if (etiquetas.length === 0) return alert('Indica cuántas etiquetas quieres de cada producto.');
    const ventana = window.open('', '_blank');
    if (!ventana) return alert('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para este sitio.');
    ventana.document.open();
    ventana.document.write(paginaImpresion(etiquetas, formato, opciones));
    ventana.document.close();
  };

  const asignarFaltantes = async () => {
    if (!confirm(`¿Generar un código interno para ${sinCodigo.length} producto(s) sin código?\n\nSon códigos que empiezan por 20 y no chocan con los de productos comerciales.`)) return;
    setAsignando(true);
    try {
      await onAsignarCodigos(sinCodigo.map(p => p.id));
    } finally {
      setAsignando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <h2 className="text-base font-bold text-tinta flex items-center gap-2.5">
            <Tags size={18} />
            <span>
              Etiquetas con código de barras
              <span className="block text-xs font-normal text-gris-calido font-sans">Elige cuántas imprimir de cada producto y el tipo de hoja.</span>
            </span>
          </h2>
          {sinCodigo.length > 0 && puedeEditar && (
            <button onClick={asignarFaltantes} disabled={asignando} className="btn btn-oscuro btn-sm">
              <Sparkles size={14} /> {asignando ? 'Generando...' : `Generar códigos (${sinCodigo.length} sin código)`}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
          <div>
            <label className="etiqueta">Tipo de hoja (tamaño carta)</label>
            <select value={formatoClave} onChange={(e) => setFormatoClave(e.target.value)} className="campo">
              {Object.entries(FORMATOS).map(([clave, f]) => <option key={clave} value={clave}>{f.nombre}</option>)}
            </select>
          </div>
          <div className="flex gap-4 text-sm font-semibold pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-tinta" checked={opciones.nombre} onChange={(e) => setOpciones({ ...opciones, nombre: e.target.checked })} /> Nombre
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-tinta" checked={opciones.precio} onChange={(e) => setOpciones({ ...opciones, precio: e.target.checked })} /> Precio
            </label>
          </div>
        </div>

        <hr className="separador" />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
          <div>
            <div className="relative mb-3 sm:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-calido" />
              <input type="search" placeholder="Buscar producto o código" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="campo pl-9" />
            </div>
            <div className="overflow-x-auto">
              <table className="tabla w-full text-left text-xs md:text-sm">
                <thead>
                  <tr>
                    <th className="p-3">Producto</th>
                    <th className="p-3 hidden md:table-cell">Código</th>
                    <th className="p-3 text-right hidden sm:table-cell">Precio</th>
                    <th className="p-3">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map(p => (
                    <tr key={p.id}>
                      <td className="p-3 font-semibold">
                        {p.nombre}
                        <span className="block md:hidden font-mono text-[10px] font-normal text-gris-calido">{p.codigo || 'Sin código'}</span>
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        {p.codigo ? (
                          <span className="font-mono text-xs">
                            {p.codigo}
                            {esCodigoInterno(p.codigo) && <span className="ml-2 pastilla pastilla-info !text-[9px]">Interno</span>}
                          </span>
                        ) : <span className="text-gris-calido italic">Sin código</span>}
                      </td>
                      <td className="p-3 text-right hidden sm:table-cell">{dinero(p.precio)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            disabled={!p.codigo}
                            value={cantidades[p.id] || ''}
                            placeholder="0"
                            onChange={(e) => fijar(p.id, e.target.value)}
                            className="campo !w-20 !py-1"
                          />
                          <button onClick={() => llenarHoja(p)} disabled={!p.codigo} className="btn btn-claro btn-sm" title={`Sumar ${porHoja} (una hoja completa)`}>
                            +1 hoja
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:w-80 lg:sticky lg:top-4 space-y-3">
            <p className="kpi-etiqueta text-gris-calido">Vista previa</p>
            <div ref={vistaRef} className="flex justify-center p-4 bg-crema rounded-xl overflow-hidden" />
            <div className="aviso aviso-info">
              <span>
                <b>{etiquetas.length}</b> etiqueta(s) · <b>{hojas}</b> hoja(s) carta.
                {' '}Imprime al <b>100 %</b> (sin "ajustar a la página").
              </span>
            </div>
            <button onClick={imprimir} disabled={etiquetas.length === 0} className="btn btn-primario w-full">
              <Printer size={16} /> Imprimir etiquetas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
