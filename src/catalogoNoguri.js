// Catálogo inicial de Noguri, con los costos y el stock de la hoja "Inventario" (Drive) y los precios vigentes.
// costo = comprado para tener en stock (al por mayor); costoPedido = comprado cuando llega el pedido (al detal).
// Las hojas de imágenes y stickers ya incluyen la tinta. El stock es el de la hoja (puede estar desactualizado).
// listos = productos ya hechos según la hoja (66 stickers de 55 mm y 20 hojas completas).

const TALLAS = ['S', 'M', 'L', 'XL'];
const TALLAS_GRANDES_CAMISETA = ['2XL'];
const TALLAS_HOODIE = ['XS', 'S', 'M', 'L', 'XL'];
const TALLAS_GRANDES_HOODIE = ['2XL', '3XL', '4XL'];

// Prenda en blanco por talla: [nombre, grupo, tallas estándar, tallas grandes, costos estándar, costos grandes]
const PRENDAS = [
  { clave: 'c160', nombre: 'Camiseta 160 g', tallas: TALLAS, grandes: TALLAS_GRANDES_CAMISETA, costo: [13400, 19000], costoGrande: [17700, 25500] },
  { clave: 'c230', nombre: 'Camiseta 230 g', tallas: TALLAS, grandes: TALLAS_GRANDES_CAMISETA, costo: [21000, 28900], costoGrande: [27300, 38900] },
  { clave: 'hoodie', nombre: 'Hoodie', tallas: TALLAS_HOODIE, grandes: TALLAS_GRANDES_HOODIE, costo: [50500, 72000], costoGrande: [57200, 81900] },
  { clave: 'chaqueta', nombre: 'Chaqueta', tallas: TALLAS, grandes: [], costo: [58300, 82900] },
  { clave: 'sisa', nombre: 'Camiseta manga sisa', tallas: TALLAS, grandes: [], costo: [16500, 23900] },
  { clave: 'enzo', nombre: 'Esqueleto Enzo', tallas: TALLAS, grandes: [], costo: [13500, 19600] }
];

const material = (clave, nombre, grupo, unidad, costo = 0, stock = 0, costoPedido = 0) => ({ clave, nombre, grupo, unidad, costo, stock, costoPedido });

const materiales = [
  // Botones: chapa + herraje (la hoja da el costo del juego; se reparte a la mitad)
  material('chapa-25', 'Chapa 25 mm', 'Botones', 'unidad', 185, 104),
  material('herraje-25', 'Herraje 25 mm', 'Botones', 'unidad', 185, 112),
  material('chapa-37', 'Chapa 37 mm', 'Botones', 'unidad', 215, 27),
  material('herraje-37', 'Herraje 37 mm', 'Botones', 'unidad', 215, 40),
  material('chapa-58-m', 'Chapa metálica 58 mm', 'Botones', 'unidad', 310, 26),
  material('herraje-58-m', 'Herraje metálico 58 mm', 'Botones', 'unidad', 310, 8),
  material('chapa-58-p', 'Chapa plástica 58 mm', 'Botones', 'unidad', 250, 279),
  material('herraje-58-p', 'Herraje plástico 58 mm', 'Botones', 'unidad', 250, 295),
  material('acetato-58', 'Acetato 58 mm', 'Botones', 'unidad'),
  material('hoja-botones', 'Hoja de imágenes para botones (papel y tinta)', 'Botones', 'hoja', 400),
  // Stickers (hoja + tinta)
  material('hoja-mate', 'Hoja adhesiva mate (papel y tinta)', 'Stickers', 'hoja', 1550),
  material('hoja-foto', 'Hoja adhesiva fotográfica (papel y tinta)', 'Stickers', 'hoja', 1575),
  // Ropa: prendas por talla + estampado
  ...PRENDAS.flatMap(p => [
    ...p.tallas.map(t => material(`${p.clave}-${t}`, `${p.nombre} talla ${t}`, p.nombre, 'unidad', p.costo[0], 0, p.costo[1])),
    ...p.grandes.map(t => material(`${p.clave}-${t}`, `${p.nombre} talla ${t}`, p.nombre, 'unidad', p.costoGrande[0], 0, p.costoGrande[1]))
  ]),
  material('estampado-carta', 'Estampado tamaño carta (papel y tinta)', 'Estampados', 'unidad', 8600),
  // Hojas que tienen en stock (para conectarlas a las recetas que las usen)
  material('hoja-laminadora', 'Hoja laminadora', 'Hojas', 'hoja', 0, 15),
  material('hoja-sublimacion-basica', 'Hoja de sublimación básica', 'Hojas', 'hoja', 0, 50),
  material('hoja-sublimacion-especial', 'Hoja de sublimación especial', 'Hojas', 'hoja', 0, 100),
  material('hoja-vinilo-carta', 'Hoja de vinilo carta para ropa', 'Hojas', 'hoja', 0, 18),
  material('hoja-vinilo-color', 'Hoja de vinilo color para ropa', 'Hojas', 'hoja', 0, 35),
  // Tazas (36 tazas por $160.000)
  material('taza-11', 'Taza blanca 11 oz', 'Tazas', 'unidad', 4444, 24),
  material('estampado-taza', 'Estampado para taza 11 oz', 'Tazas', 'unidad', 350, 50),
  material('sticker-taza', 'Sticker para taza 11 oz', 'Tazas', 'unidad', 1017, 85),
  // Pines de resina
  material('resina', 'Resina epóxica', 'Pines de resina', 'g'),
  material('broche-pin', 'Broche para pin', 'Pines de resina', 'unidad')
];

const linea = (clave, cantidad = 1) => ({ material: clave, cantidad });

const ADICIONALES_ROPA = [
  { nombre: 'Estampado en la espalda (2 lados)', precio: 10000, receta: [linea('estampado-carta')] },
  { nombre: 'Hoja adicional', precio: 10000, receta: [linea('estampado-carta')] },
  { nombre: 'Estampado en el brazo', precio: 8000, receta: [] },
  { nombre: 'Bolsillo', precio: 3000, receta: [] }
];

const prenda = (clave, nombre, categoria, precio, recargoGrandes = 8000) => {
  const p = PRENDAS.find(x => x.clave === clave);
  return {
    nombre,
    categoria,
    precio,
    receta: [linea('estampado-carta')],
    opciones: [{
      nombre: 'Talla',
      valores: [
        ...p.tallas.map(t => ({ nombre: t, precioExtra: 0, receta: [linea(`${clave}-${t}`)] })),
        ...p.grandes.map(t => ({ nombre: t, precioExtra: recargoGrandes, receta: [linea(`${clave}-${t}`)] }))
      ]
    }],
    adicionales: ADICIONALES_ROPA
  };
};

const sticker = (nombre, hoja, rinde, precio, paquete, listos = 0) => ({
  nombre,
  listos,
  categoria: 'Stickers',
  precio,
  preciosCantidad: paquete ? [paquete] : [],
  receta: [linea(hoja, 1 / rinde)]
});

const productos = [
  { nombre: 'Botón 25 mm', categoria: 'Botones', precio: 1300, preciosCantidad: [{ cantidad: 2, precio: 2000 }], receta: [linea('chapa-25'), linea('herraje-25'), linea('hoja-botones', 1 / 35)] },
  { nombre: 'Botón 37 mm', categoria: 'Botones', precio: 2000, preciosCantidad: [{ cantidad: 2, precio: 3500 }], receta: [linea('chapa-37'), linea('herraje-37'), linea('hoja-botones', 1 / 19)] },
  {
    nombre: 'Botón 58 mm',
    categoria: 'Botones',
    precio: 3000,
    preciosCantidad: [{ cantidad: 2, precio: 5000 }],
    receta: [linea('acetato-58'), linea('hoja-botones', 1 / 9)],
    opciones: [{
      nombre: 'Material',
      valores: [
        { nombre: 'Metálico', precioExtra: 0, receta: [linea('chapa-58-m'), linea('herraje-58-m')] },
        { nombre: 'Plástico', precioExtra: 0, receta: [linea('chapa-58-p'), linea('herraje-58-p')] }
      ]
    }]
  },
  sticker('Sticker 55 mm mate', 'hoja-mate', 15, 1000, { cantidad: 6, precio: 5000 }, 66),
  sticker('Sticker 28 mm mate', 'hoja-mate', 30, 300, { cantidad: 2, precio: 500 }),
  sticker('Hoja completa de stickers mate', 'hoja-mate', 1, 10000, null, 20),
  sticker('Sticker 55 mm fotográfico', 'hoja-foto', 15, 2000, { cantidad: 3, precio: 5000 }),
  sticker('Sticker 28 mm fotográfico', 'hoja-foto', 30, 600),
  sticker('Hoja completa de stickers fotográficos', 'hoja-foto', 1, 15000),
  prenda('c160', 'Camiseta 160 g', 'Camisetas', 50000),
  prenda('c230', 'Camiseta 230 g', 'Camisetas', 55000),
  prenda('sisa', 'Camiseta manga sisa', 'Camisetas', 50000),
  prenda('enzo', 'Esqueleto Enzo', 'Camisetas', 45000),
  prenda('hoodie', 'Hoodie', 'Hoodies', 90000),
  prenda('chaqueta', 'Chaqueta', 'Chaquetas', 95000),
  {
    nombre: 'Taza 11 oz',
    categoria: 'Tazas',
    precio: 18000,
    receta: [linea('taza-11')],
    opciones: [{
      nombre: 'Acabado',
      valores: [
        { nombre: 'Estampada', precioExtra: 0, receta: [linea('estampado-taza')] },
        { nombre: 'Con sticker', precioExtra: 0, receta: [linea('sticker-taza')] }
      ]
    }]
  },
  {
    nombre: 'Pin de resina',
    categoria: 'Pines de resina',
    precio: 10000,
    receta: [linea('resina', 0), linea('broche-pin')],
    opciones: [{
      nombre: 'Tipo',
      valores: [
        { nombre: 'Prefabricado', precioExtra: 0, receta: [] },
        { nombre: 'Personalizado', precioExtra: 5000, receta: [] }
      ]
    }]
  }
];

export const CATALOGO_NOGURI = { materiales, productos };
