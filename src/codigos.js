// Utilidades de códigos de barras
//
// Códigos propios: se usa el rango "de circulación restringida" de GS1 (EAN-13 que
// empiezan por 20–29). Ningún producto comercial usa esos números, así que los
// productos caseros nunca chocan con los de paquete.

const PREFIJO_INTERNO = '20';

export const soloDigitos = (texto) => String(texto || '').replace(/\D/g, '');

// Dígito de control EAN-13 para los primeros 12 dígitos
export const digitoControlEAN13 = (doce) => {
  const suma = doce.split('').reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (suma % 10)) % 10);
};

export const esEAN13Valido = (codigo) =>
  /^\d{13}$/.test(codigo) && digitoControlEAN13(codigo.slice(0, 12)) === codigo[12];

export const esCodigoInterno = (codigo) => /^2\d{12}$/.test(codigo || '') && esEAN13Valido(codigo);

// Normaliza lo que entrega un lector: quita espacios y saltos de línea
export const limpiarCodigo = (codigo) => String(codigo || '').trim().replace(/\s+/g, '');

// Códigos de un producto (se admite el campo antiguo "codigoBarras" por si acaso)
export const codigosDe = (producto) => {
  const lista = Array.isArray(producto?.codigos) ? producto.codigos : [];
  return [...new Set([...lista, producto?.codigoBarras].filter(Boolean))];
};

export const buscarProductoPorCodigo = (productos, codigo) => {
  const limpio = limpiarCodigo(codigo);
  if (!limpio) return null;
  return productos.find(p => codigosDe(p).includes(limpio)) || null;
};

// Sabores: cada sabor de un producto puede tener su propio código ({ codigo: 'Fresa' }).
// El código también queda en "codigos", así la búsqueda y las etiquetas siguen igual.
export const codigosSaborDe = (producto) =>
  producto?.codigosSabor && typeof producto.codigosSabor === 'object' ? producto.codigosSabor : {};

export const saborDeCodigo = (producto, codigo) => codigosSaborDe(producto)[limpiarCodigo(codigo)] || null;

export const codigoDeSabor = (producto, sabor) => {
  const buscado = String(sabor || '').toLowerCase();
  return Object.entries(codigosSaborDe(producto)).find(([, s]) => String(s).toLowerCase() === buscado)?.[0] || null;
};

// Cambios para asignar (o quitar, con codigo vacío) el código de un sabor
export const cambiosCodigoSabor = (producto, sabor, codigo) => {
  const mapa = { ...codigosSaborDe(producto) };
  const anterior = codigoDeSabor(producto, sabor);
  let codigos = codigosDe(producto);
  if (anterior) {
    delete mapa[anterior];
    codigos = codigos.filter(c => c !== anterior);
  }
  if (codigo) {
    mapa[codigo] = sabor;
    if (!codigos.includes(codigo)) codigos = [...codigos, codigo];
  }
  return { codigos, codigosSabor: mapa };
};

// Siguiente código interno libre: 20 + secuencia de 10 dígitos + dígito de control
export const generarCodigoInterno = (productos, reservados = []) => {
  const usados = new Set([...productos.flatMap(codigosDe), ...reservados]);
  const secuencias = [...usados]
    .filter(c => c.startsWith(PREFIJO_INTERNO) && c.length === 13)
    .map(c => Number(c.slice(2, 12)))
    .filter(n => Number.isFinite(n));
  let siguiente = (secuencias.length ? Math.max(...secuencias) : 0) + 1;
  let codigo;
  do {
    const doce = PREFIJO_INTERNO + String(siguiente).padStart(10, '0');
    codigo = doce + digitoControlEAN13(doce);
    siguiente++;
  } while (usados.has(codigo));
  return codigo;
};

// Consulta gratuita a Open Food Facts para autocompletar el nombre de productos de paquete
export const consultarOpenFoodFacts = async (codigo) => {
  if (!/^\d{8,14}$/.test(codigo) || esCodigoInterno(codigo)) return null;
  const control = new AbortController();
  const tiempo = setTimeout(() => control.abort(), 6000);
  try {
    const r = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${codigo}.json?fields=product_name,product_name_es,brands,quantity`,
      { signal: control.signal }
    );
    if (!r.ok) return null;
    const datos = await r.json();
    if (datos.status !== 1 || !datos.product) return null;
    const p = datos.product;
    const nombre = (p.product_name_es || p.product_name || '').trim();
    if (!nombre) return null;
    const marca = (p.brands || '').split(',')[0].trim();
    // Quita el símbolo ℮ (o una 'e' suelta) que algunos empaques ponen junto a la cantidad
    const cantidad = (p.quantity || '').replace(/\s+[e℮]$/i, '').trim();
    return {
      nombre: [nombre, marca && !nombre.toLowerCase().includes(marca.toLowerCase()) ? marca : '', cantidad].filter(Boolean).join(' · '),
      fuente: 'Open Food Facts'
    };
  } catch {
    return null;
  } finally {
    clearTimeout(tiempo);
  }
};
