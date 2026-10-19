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

// ---------- Venta de productos fabricados ----------
//
// Una línea del pedido: { productoId, valores: [idValor por opción], adicionales: [idAdicional], cantidad }.
// "listos" del producto: { [claveVariante]: cantidad } = lo que ya está hecho y se vende sin gastar materiales.

// Clave de la variante dentro de "listos" (Firestore no admite claves vacías)
export const claveVariante = (valores = []) => (valores.length ? valores.join('|') : 'unica');

export const eleccionDe = (producto, valores = []) =>
  (producto.opciones || []).map((opcion, i) => {
    const valor = opcion.valores?.find(v => v.id === valores[i]) || opcion.valores?.[0];
    return valor ? { opcion, valor } : null;
  }).filter(Boolean);

export const adicionalesDe = (producto, ids = []) => (producto.adicionales || []).filter(a => ids.includes(a.id));

export const descripcionLinea = (producto, valores, adicionales) =>
  [nombreVariante(eleccionDe(producto, valores)), ...adicionalesDe(producto, adicionales).map(a => `+ ${a.nombre}`)].filter(Boolean).join(' · ');

const redondear4 = (n) => Math.round(n * 10000) / 10000;

/**
 * Simula la venta de las líneas fabricadas del pedido: primero se usan los listos de esa variante
 * y lo demás se fabrica gastando materiales. Si un material no alcanza, la diferencia se toma como
 * comprada por pedido (con su costo por pedido) y el stock queda en 0.
 * Devuelve por línea { deListos, fabricadas, costoTotal, consumo } y el estado final de stock y listos.
 */
export const planificarVenta = (lineas, productosPorId, materialesPorId) => {
  const stock = Object.fromEntries(Object.values(materialesPorId).map(m => [m.id, Number(m.stock) || 0]));
  const listos = {};
  const faltantes = {}; // materialId → cantidad que no había en stock
  const materialesTocados = new Set();
  const productosTocados = new Set();

  const resultado = lineas.map(linea => {
    const p = productosPorId[linea.productoId];
    if (!p) return { error: `El producto "${linea.nombre}" ya no existe.` };
    const clave = claveVariante(linea.valores);
    listos[p.id] ??= { ...(p.listos || {}) };
    const hayListos = Math.max(0, Number(listos[p.id][clave]) || 0);
    const deListos = Math.min(hayListos, linea.cantidad);
    if (deListos > 0) {
      listos[p.id][clave] = hayListos - deListos;
      productosTocados.add(p.id);
    }
    const fabricadas = linea.cantidad - deListos;
    const eleccion = eleccionDe(p, linea.valores);
    const extras = adicionalesDe(p, linea.adicionales);

    // Lo hecho de antemano ya gastó sus materiales; los adicionales siempre se hacen al vender
    const recetaFabricar = recetaDe(p, eleccion, extras);
    const recetaListos = extras.flatMap(a => a.receta || []);
    const consumo = {};
    const sumar = (receta, veces) => receta.forEach(l => {
      if (!materialesPorId[l.materialId] || !(Number(l.cantidad) > 0) || veces <= 0) return;
      consumo[l.materialId] = (consumo[l.materialId] || 0) + Number(l.cantidad) * veces;
    });
    sumar(recetaFabricar, fabricadas);
    sumar(recetaListos, deListos);

    let costoTotal = costoReceta(recetaDe(p, eleccion), materialesPorId) * deListos;
    const detalle = Object.entries(consumo).map(([materialId, cantidad]) => {
      const m = materialesPorId[materialId];
      const deStock = Math.max(0, Math.min(stock[materialId], cantidad));
      const porPedido = redondear4(cantidad - deStock);
      stock[materialId] = redondear4(stock[materialId] - deStock);
      materialesTocados.add(materialId);
      if (porPedido > 0) faltantes[materialId] = (faltantes[materialId] || 0) + porPedido;
      costoTotal += deStock * (Number(m.costo) || 0) + porPedido * (Number(m.costoPedido) > 0 ? Number(m.costoPedido) : Number(m.costo) || 0);
      return { materialId, nombre: m.nombre, cantidad: redondear4(cantidad), porPedido };
    });
    return { deListos, fabricadas, costoTotal: Math.round(costoTotal), consumo: detalle };
  });

  const error = resultado.find(r => r.error)?.error;
  return {
    error,
    lineas: resultado,
    stock: Object.fromEntries([...materialesTocados].map(id => [id, stock[id]])),
    listos: Object.fromEntries([...productosTocados].map(id => [id, listos[id]])),
    faltantes: Object.entries(faltantes).map(([id, cantidad]) => ({ material: materialesPorId[id], cantidad: redondear4(cantidad) }))
  };
};

// Cuántas unidades de una variante alcanzan a fabricarse con el stock de materiales
export const alcanzaPara = (producto, valores, materialesPorId) => {
  const receta = recetaDe(producto, eleccionDe(producto, valores));
  const porMaterial = {};
  receta.forEach(l => { if (Number(l.cantidad) > 0) porMaterial[l.materialId] = (porMaterial[l.materialId] || 0) + Number(l.cantidad); });
  const limites = Object.entries(porMaterial).map(([id, cant]) => Math.floor((Number(materialesPorId[id]?.stock) || 0) / cant + 1e-9));
  return limites.length ? Math.max(0, Math.min(...limites)) : null;
};
