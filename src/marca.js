// Marca de cada negocio: colores, tipografías, estilo y logo.
// Se guarda en negocios/{nid}/config/marca y se aplica cambiando las variables CSS de la app
// (los colores de Tailwind del tema son variables, así que toda la app cambia con ellas).
//
//   marca = {
//     colores: { tinta, fondo, tarjeta, suave, cabecera, acento, linea, textoSuave, exito, peligro },
//     fuentes: { titulos, texto },   // nombres de Google Fonts
//     estilo: 'pop' | 'papel',       // pop: sombras de cómic y trama de puntos; papel: suave y plano
//     logo: 'data:image/...' | null, // ícono de la cabecera
//     origen: 'Noguri-Manual.html'
//   }

export const ROLES = [
  { clave: 'tinta', nombre: 'Texto y bordes', ayuda: 'Letras, contornos y botones oscuros' },
  { clave: 'fondo', nombre: 'Fondo', ayuda: 'Fondo de toda la página' },
  { clave: 'tarjeta', nombre: 'Tarjetas', ayuda: 'Paneles, campos y ventanas' },
  { clave: 'suave', nombre: 'Fondo suave', ayuda: 'Encabezados de tablas, etiquetas neutras' },
  { clave: 'cabecera', nombre: 'Cabecera', ayuda: 'Barra superior con el nombre del negocio' },
  { clave: 'acento', nombre: 'Acento', ayuda: 'Botón principal, íconos y detalles' },
  { clave: 'linea', nombre: 'Líneas', ayuda: 'Bordes suaves y separadores' },
  { clave: 'textoSuave', nombre: 'Texto suave', ayuda: 'Descripciones y ayudas' },
  { clave: 'exito', nombre: 'Éxito', ayuda: 'Pagado, confirmaciones' },
  { clave: 'peligro', nombre: 'Peligro', ayuda: 'Borrar, gastos, errores' }
];

// La marca original (Tazón para Dos): es la que usa la app cuando un negocio no tiene marca propia
export const MARCA_BASE = {
  colores: {
    tinta: '#28203B', fondo: '#FFFDF8', tarjeta: '#FFFFFF', suave: '#F7F2E8', cabecera: '#55C4BF',
    acento: '#F8CB67', linea: '#E9E1D2', textoSuave: '#665F68', exito: '#7EE5A8', peligro: '#EA6077'
  },
  fuentes: { titulos: 'Space Grotesk', texto: 'DM Sans' },
  estilo: 'pop',
  logo: null
};

// ---------- Utilidades de color ----------

const aRgb = (hex) => {
  let h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const aHex = (rgb) => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
// Mezcla a con b: peso = cuánto de b (0..1)
export const mezclar = (a, b, peso) => { const x = aRgb(a), y = aRgb(b); return aHex(x.map((v, i) => v + (y[i] - v) * peso)); };
const luminancia = (hex) => {
  const [r, g, b] = aRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const saturacion = (hex) => { const [r, g, b] = aRgb(hex); const max = Math.max(r, g, b), min = Math.min(r, g, b); return max === 0 ? 0 : (max - min) / max; };
export const contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
export const esHex = (v) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v || '').trim());
const normalizarHex = (v) => { const h = String(v).trim().toUpperCase(); return h.length === 4 ? '#' + h.slice(1).split('').map(c => c + c).join('') : h; };

// ---------- Aplicar la marca a la página ----------

const variablesDe = (marca) => {
  const c = { ...MARCA_BASE.colores, ...(marca?.colores || {}) };
  const f = { ...MARCA_BASE.fuentes, ...(marca?.fuentes || {}) };
  const blanco = '#FFFFFF';
  const v = {
    '--color-tinta': c.tinta,
    '--color-papel': c.fondo,
    '--color-tarjeta': c.tarjeta,
    '--color-crema': c.suave,
    '--color-turquesa': c.cabecera,
    '--color-turquesa-claro': mezclar(c.cabecera, blanco, 0.35),
    '--color-turquesa-oscuro': mezclar(c.cabecera, c.tinta, 0.12),
    '--color-sol': c.acento,
    '--color-sol-claro': mezclar(c.acento, blanco, 0.35),
    '--color-coral': c.peligro,
    '--color-exito': c.exito,
    '--color-gris-calido': c.textoSuave,
    '--color-linea': c.linea,
    '--color-linea-fuerte': mezclar(c.linea, c.tinta, 0.12),
    '--color-linea-suave': mezclar(c.linea, blanco, 0.45),
    // Escalas de Tailwind que usa la app, derivadas de los colores de la marca
    '--color-slate-50': c.fondo,
    '--color-slate-100': c.suave,
    '--color-slate-200': c.linea,
    '--color-slate-300': mezclar(c.linea, c.tinta, 0.12),
    '--color-slate-400': mezclar(c.textoSuave, blanco, 0.3),
    '--color-slate-500': c.textoSuave,
    '--color-slate-600': mezclar(c.textoSuave, c.tinta, 0.4),
    '--color-slate-700': mezclar(c.textoSuave, c.tinta, 0.7),
    '--color-slate-800': c.tinta,
    '--color-slate-900': mezclar(c.tinta, '#000000', 0.2),
    '--color-indigo-50': mezclar(c.cabecera, blanco, 0.85),
    '--color-indigo-100': mezclar(c.cabecera, blanco, 0.7),
    '--color-indigo-200': mezclar(c.cabecera, blanco, 0.45),
    '--color-indigo-300': mezclar(c.cabecera, blanco, 0.3),
    '--color-indigo-400': c.cabecera,
    '--color-indigo-500': mezclar(c.cabecera, c.tinta, 0.12),
    '--color-indigo-600': c.tinta,
    '--color-indigo-700': mezclar(c.tinta, '#000000', 0.2),
    '--color-indigo-800': mezclar(c.tinta, '#000000', 0.2),
    '--color-indigo-900': c.tinta,
    '--color-amber-50': mezclar(c.acento, blanco, 0.85),
    '--color-amber-100': mezclar(c.acento, blanco, 0.65),
    '--color-amber-200': mezclar(c.acento, blanco, 0.35),
    '--color-amber-300': c.acento,
    '--color-amber-400': c.acento,
    '--color-amber-500': c.acento,
    '--color-amber-600': mezclar(c.acento, c.tinta, 0.45),
    '--color-amber-700': mezclar(c.acento, c.tinta, 0.6),
    '--color-amber-800': mezclar(c.acento, c.tinta, 0.72),
    '--color-rose-50': mezclar(c.peligro, blanco, 0.88),
    '--color-rose-100': mezclar(c.peligro, blanco, 0.75),
    '--color-rose-200': mezclar(c.peligro, blanco, 0.5),
    '--color-rose-500': c.peligro,
    '--color-rose-600': mezclar(c.peligro, c.tinta, 0.3),
    '--color-rose-700': mezclar(c.peligro, c.tinta, 0.5),
    '--color-emerald-50': mezclar(c.exito, blanco, 0.85),
    '--color-emerald-100': mezclar(c.exito, blanco, 0.65),
    '--color-emerald-200': mezclar(c.exito, blanco, 0.35),
    '--color-emerald-600': mezclar(c.exito, c.tinta, 0.6),
    '--color-emerald-700': mezclar(c.exito, c.tinta, 0.7),
    '--color-sky-600': mezclar(c.cabecera, c.tinta, 0.55),
    '--color-sky-700': mezclar(c.cabecera, c.tinta, 0.68),
    '--color-blue-50': mezclar(c.cabecera, blanco, 0.85),
    '--color-blue-600': mezclar(c.cabecera, c.tinta, 0.55),
    '--font-sans': `'${f.texto}', ui-sans-serif, system-ui, sans-serif`,
    '--font-display': `'${f.titulos}', '${f.texto}', sans-serif`,
    // Las etiquetas en mayúsculas usan la letra mono solo en el estilo pop
    '--font-mono': (marca?.estilo || 'pop') === 'pop' ? "'DM Mono', ui-monospace, monospace" : `'${f.texto}', ui-sans-serif, sans-serif`
  };
  return v;
};

// URL de Google Fonts para las tipografías de la marca
export const urlFuentes = (fuentes) => {
  const familias = [...new Set([fuentes?.titulos, fuentes?.texto].filter(Boolean))]
    .filter(n => !['DM Sans', 'Space Grotesk'].includes(n));
  if (!familias.length) return null;
  return 'https://fonts.googleapis.com/css2?' + familias.map(n => `family=${encodeURIComponent(n).replace(/%20/g, '+')}:wght@400;500;600;700`).join('&') + '&display=swap';
};

const cargarFuentes = (fuentes) => {
  const url = urlFuentes(fuentes);
  let link = document.getElementById('fuentes-marca');
  if (!url) { link?.remove(); return; }
  if (!link) {
    link = document.createElement('link');
    link.id = 'fuentes-marca';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== url) link.href = url;
};

// Aplica la marca a un elemento (por defecto, toda la página). Con marca = null vuelve a la original.
export const aplicarMarca = (marca, elemento = document.documentElement) => {
  const variables = variablesDe(marca);
  Object.entries(variables).forEach(([k, val]) => {
    if (marca) elemento.style.setProperty(k, val);
    else elemento.style.removeProperty(k);
  });
  elemento.dataset.estilo = marca?.estilo || 'pop';
  if (elemento === document.documentElement) {
    cargarFuentes(marca?.fuentes);
    const tema = document.querySelector('meta[name="theme-color"]');
    if (tema) tema.content = (marca?.colores?.cabecera) || MARCA_BASE.colores.cabecera;
  }
};

// Estilo en línea para una vista previa (sin tocar la página)
export const estiloVistaPrevia = (marca) => variablesDe(marca);

// ---------- Detectar la marca en un archivo (manual de marca HTML, CSS, SVG) ----------

const PALABRAS = {
  tinta: /\b(tinta|ink|texto|text|foreground|fg|dark|oscuro|negro|black|primary-dark)\b/i,
  fondo: /\b(papel|paper|fondo|background|bg|base|canvas)\b/i,
  acento: /\b(acento|accent|rubor|brand|marca|primario|primary|highlight|destacado)\b/i,
  suave: /\b(polvo|suave|soft|alt|alterno|muted-bg|subtle)\b/i,
  cabecera: /\b(arena|sand|superficie|surface|header|cabecera|card)\b/i,
  linea: /\b(ln|linea|line|border|borde|divider|separador|stroke)\b/i,
  textoSuave: /\b(mu|muted|gris|gray|grey|secundario|secondary|texto-suave)\b/i,
  exito: /\b(exito|success|ok|verde|green)\b/i,
  peligro: /\b(peligro|danger|error|rojo|red|alerta)\b/i
};

const quitarDuplicados = (lista) => {
  const vistos = new Set();
  return lista.filter(x => (vistos.has(x.hex) ? false : vistos.add(x.hex)));
};

export const detectarMarca = (texto, nombreArchivo = '') => {
  const s = String(texto || '');
  // 1. Colores con nombre (variables CSS) y sueltos (por frecuencia)
  const conNombre = [...s.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-f]{3,6})\b/gi)].map(m => ({ nombre: m[1], hex: normalizarHex(m[2]) })).filter(x => esHex(x.hex));
  const frecuencia = {};
  for (const m of s.replace(/data:[^"')\s]+/g, '').matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)) {
    const h = normalizarHex(m[0]);
    frecuencia[h] = (frecuencia[h] || 0) + 1;
  }
  const sueltos = Object.entries(frecuencia).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([hex]) => ({ nombre: '', hex }));
  const paleta = quitarDuplicados([...conNombre, ...sueltos]);

  // 2. Asignar papeles: primero por nombre, luego por luminosidad y saturación
  const colores = {};
  const usados = new Set();
  const tomar = (rol, color) => { if (color && !colores[rol]) { colores[rol] = color.hex; usados.add(color.hex); } };
  Object.entries(PALABRAS).forEach(([rol, re]) => tomar(rol, conNombre.find(x => re.test(x.nombre.replace(/[-_]/g, ' ')) && !usados.has(x.hex))));
  const libres = () => paleta.filter(x => !usados.has(x.hex));
  const blancos = (x) => x.hex === '#FFFFFF';
  if (!colores.tinta) tomar('tinta', [...libres()].sort((a, b) => luminancia(a.hex) - luminancia(b.hex))[0]);
  if (!colores.fondo) tomar('fondo', [...libres()].filter(x => !blancos(x)).sort((a, b) => luminancia(b.hex) - luminancia(a.hex))[0]);
  if (!colores.acento) tomar('acento', [...libres()].filter(x => luminancia(x.hex) > 0.15).sort((a, b) => saturacion(b.hex) - saturacion(a.hex))[0]);
  const claros = [...libres()].filter(x => !blancos(x) && luminancia(x.hex) > 0.55).sort((a, b) => luminancia(b.hex) - luminancia(a.hex));
  if (!colores.suave) tomar('suave', claros[0]);
  if (!colores.cabecera) tomar('cabecera', claros[1] || claros[0]);
  if (!colores.linea) tomar('linea', [...libres()].filter(x => luminancia(x.hex) > 0.5).sort((a, b) => luminancia(a.hex) - luminancia(b.hex))[0]);
  if (!colores.textoSuave) tomar('textoSuave', [...libres()].filter(x => luminancia(x.hex) > 0.08 && luminancia(x.hex) < 0.35).sort((a, b) => saturacion(a.hex) - saturacion(b.hex))[0]);

  // 3. Estilo: "papel" si el manual lo dice o si la paleta es suave
  const estilo = /estilo\s+papel|paper\s+style|minimal/i.test(s) || (colores.acento && saturacion(colores.acento) < 0.35) ? 'papel' : 'pop';
  const base = { ...MARCA_BASE.colores, ...colores };
  // Éxito y peligro: si el manual no los define, se suavizan para que no rompan la paleta
  if (!colores.exito) base.exito = estilo === 'papel' ? mezclar(MARCA_BASE.colores.exito, base.fondo, 0.45) : MARCA_BASE.colores.exito;
  if (!colores.peligro) base.peligro = estilo === 'papel' ? mezclar(MARCA_BASE.colores.peligro, base.fondo, 0.35) : MARCA_BASE.colores.peligro;
  base.tarjeta = conNombre.find(x => x.hex === '#FFFFFF') || /#fff\b|#ffffff/i.test(s) ? '#FFFFFF' : base.tarjeta;

  // 4. Tipografías: @font-face, variables y enlaces de Google Fonts
  const nombresFuente = [
    ...[...s.matchAll(/font-family\s*:\s*["']([^"',;]+)["']/gi)].map(m => m[1]),
    ...[...s.matchAll(/--(?:serif|sans|display|titulos|texto|heading|body|font[\w-]*)\s*:\s*["']([^"',;]+)["']/gi)].map(m => m[1]),
    ...[...s.matchAll(/family=([A-Za-z+]+)/g)].map(m => m[1].replace(/\+/g, ' '))
  ].map(n => n.trim()).filter(n => n && !/system-ui|segoe|arial|helvetica|sans-serif|serif|monospace|inherit/i.test(n));
  const unicos = [...new Set(nombresFuente)];
  const titulos = (s.match(/--(?:serif|display|titulos|heading)\s*:\s*["']([^"',;]+)["']/i) || [])[1] || unicos[0];
  const textoF = (s.match(/--(?:sans|texto|body)\s*:\s*["']([^"',;]+)["']/i) || [])[1] || unicos.find(n => n !== titulos) || titulos;

  // 5. Logos: imágenes incrustadas con su texto alternativo
  const logos = [];
  const vistos = new Set();
  for (const m of s.matchAll(/<img[^>]*>/gi)) {
    const src = (m[0].match(/src="(data:image\/[^"]+)"/i) || [])[1];
    if (!src || vistos.has(src) || src.length > 400000) continue;
    vistos.add(src);
    logos.push({ src, alt: ((m[0].match(/alt="([^"]*)"/i) || [])[1] || '').replace(/&[a-z]+;/g, ' ').trim() });
  }
  if (/^\s*<svg/i.test(s)) logos.push({ src: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s))), alt: nombreArchivo });
  // Se prefiere un ícono o avatar (cuadrado) para la cabecera
  const preferido = logos.find(l => /avatar/i.test(l.alt)) || logos.find(l => /[íi]cono|icon|sello/i.test(l.alt)) || logos[0];

  return {
    marca: {
      colores: base,
      fuentes: { titulos: titulos || MARCA_BASE.fuentes.titulos, texto: textoF || MARCA_BASE.fuentes.texto },
      estilo,
      logo: preferido?.src || null,
      origen: nombreArchivo
    },
    paleta,
    logos
  };
};

// Imagen subida → data URL. Los SVG se guardan tal cual; las fotos se reducen a 256 px.
export const leerLogo = (archivo) => new Promise((resolver, rechazar) => {
  const lector = new FileReader();
  lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
  if (archivo.type === 'image/svg+xml') {
    if (archivo.size > 300000) return rechazar(new Error('El SVG pesa más de 300 KB.'));
    lector.onload = () => resolver(lector.result);
    lector.readAsDataURL(archivo);
    return;
  }
  lector.onload = () => {
    const img = new Image();
    img.onload = () => {
      const lado = 256;
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
      resolver(lienzo.toDataURL('image/png'));
    };
    img.onerror = () => rechazar(new Error('La imagen no se pudo abrir.'));
    img.src = lector.result;
  };
  lector.readAsDataURL(archivo);
});
