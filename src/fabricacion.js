// Fabricación: materiales, recetas y precios de los productos que se arman (botones, camisetas, ...).
//
// Un producto fabricado (productos/{id} con fabricado: true) guarda:
//   receta:          [{ materialId, cantidad }]           lo que gasta siempre
//   opciones:        [{ id, nombre, valores: [{ id, nombre, precioExtra, receta }] }]   se elige uno de cada opción
//   adicionales:     [{ id, nombre, precio, receta }]      se suman si el cliente los pide
//   preciosCantidad: [{ cantidad, precio }]                 p. ej. 2 botones por $2.000
//   ganancia:        % de ganancia deseada sobre el costo (para el precio sugerido)
// Los materiales viven en materiales/{id}: { nombre, grupo, unidad, costo (por unidad), costoPedido, stock, minimo }.
// costo es el de comprarlo para tener en stock; costoPedido (opcional) el de comprarlo cuando llega el pedido.

export const UNIDADES = ['unidad', 'hoja', 'g', 'ml', 'm', 'cm'];

export const GANANCIA_POR_DEFECTO = 100;

// "1/12" → 0.0833…; "0,5" → 0.5. Sirve para recetas que gastan una parte de una hoja.
export const leerCantidad = (texto) => {
  const t = String(texto ?? '').trim().replace(',', '.');
  const fraccion = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fraccion) return Number(fraccion[2]) > 0 ? Number(fraccion[1]) / Number(fraccion[2]) : 0;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// 0.08333 → "1/12" cuando es una fracción simple; si no, el número con hasta 3 decimales
export const mostrarCantidad = (n) => {
  const v = Number(n) || 0;
  if (v > 0 && v < 1) {
    const d = Math.round(1 / v);
    if (d > 1 && Math.abs(1 / d - v) < 1e-6) return `1/${d}`;
  }
  return String(Math.round(v * 1000) / 1000).replace('.', ',');
};

const costoMaterial = (m, porPedido) => (porPedido && Number(m.costoPedido) > 0 ? Number(m.costoPedido) : Number(m.costo) || 0);

export const costoReceta = (receta, materialesPorId, porPedido = false) =>
  (receta || []).reduce((total, linea) => {
    const m = materialesPorId[linea.materialId];
    return total + (m ? costoMaterial(m, porPedido) * (Number(linea.cantidad) || 0) : 0);
  }, 0);

// Problemas que hacen que el costo no sea confiable (para avisar en la calculadora)
export const faltantesReceta = (receta, materialesPorId) => {
  const faltan = [];
  (receta || []).forEach(linea => {
    const m = materialesPorId[linea.materialId];
    if (!m) faltan.push('un material que ya no existe');
    else if (!(Number(linea.cantidad) > 0)) faltan.push(`cantidad de ${m.nombre}`);
    else if (!(Number(m.costo) > 0)) faltan.push(`costo de ${m.nombre}`);
  });
  return faltan;
};

// Todas las combinaciones de opciones (Talla M + Base plástica, ...). Máximo 60 para no explotar.
export const variantesDe = (producto) => {
  let combinaciones = [[]];
  for (const opcion of producto.opciones || []) {
    if (!opcion.valores?.length) continue;
    combinaciones = combinaciones.flatMap(c => opcion.valores.map(v => [...c, { opcion, valor: v }]));
    if (combinaciones.length > 60) return combinaciones.slice(0, 60);
  }
  return combinaciones;
};

export const nombreVariante = (eleccion) => eleccion.map(e => e.valor.nombre).join(' · ');

// Receta completa de una venta: base + valores elegidos + adicionales
export const recetaDe = (producto, eleccion = [], adicionales = []) => [
  ...(producto.receta || []),
  ...eleccion.flatMap(e => e.valor.receta || []),
  ...adicionales.flatMap(a => a.receta || [])
];

export const precioUnitario = (producto, eleccion = [], adicionales = []) =>
  (Number(producto.precio) || 0)
  + eleccion.reduce((s, e) => s + (Number(e.valor.precioExtra) || 0), 0)
  + adicionales.reduce((s, a) => s + (Number(a.precio) || 0), 0);

// Precio de `cantidad` unidades con los precios por cantidad: se usan primero los paquetes más grandes.
// Ej.: 1 botón $2.000, 2 por $3.500 → 3 botones = $3.500 + $2.000.
export const precioPorCantidad = (producto, cantidad, unitario = Number(producto.precio) || 0) => {
  const paquetes = (producto.preciosCantidad || [])
    .filter(p => Number(p.cantidad) > 1 && Number(p.precio) > 0)
    .sort((a, b) => b.cantidad - a.cantidad);
  const extraPorUnidad = unitario - (Number(producto.precio) || 0);
  let restante = cantidad;
  let total = 0;
  for (const p of paquetes) {
    const veces = Math.floor(restante / p.cantidad);
    total += veces * (Number(p.precio) + extraPorUnidad * p.cantidad);
    restante -= veces * p.cantidad;
  }
  return total + restante * unitario;
};

export const redondearPrecio = (valor, paso = 100) => Math.ceil((Number(valor) || 0) / paso) * paso;

export const precioSugerido = (costo, ganancia) => redondearPrecio(costo * (1 + (Number(ganancia) || 0) / 100));

// Ganancia de vender a `precio` algo que cuesta `costo`: en pesos y como % del costo
export const gananciaDe = (precio, costo) => ({
  pesos: precio - costo,
  porcentaje: costo > 0 ? ((precio - costo) / costo) * 100 : null
});

export const nuevoId = () => Math.random().toString(36).slice(2, 10);

// Orden natural de nombres con tallas: "talla S" < "talla M" < "talla XL" < "talla 2XL"
const ORDEN_TALLAS = { XXS: 1, XS: 2, S: 3, M: 4, L: 5, XL: 6, '2XL': 7, XXL: 7, '3XL': 8, '4XL': 9 };
const claveOrden = (nombre) => String(nombre || '').replace(/\b(XXS|XS|S|M|L|XL|2XL|XXL|3XL|4XL)$/i, (t) => `~${ORDEN_TALLAS[t.toUpperCase()]}`);
export const compararNombres = (a, b) => claveOrden(a).localeCompare(claveOrden(b), 'es', { numeric: true });
