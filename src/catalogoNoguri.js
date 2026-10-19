// Catálogo inicial de Noguri (precios del catálogo de 2026 + pines de resina).
// Los materiales se crean sin costo ni stock: se completan en Inventario → Materiales.
// Las cantidades en 0 (imágenes por hoja, stickers por hoja, resina) se completan en cada receta.

const TALLAS_CAMISETA = ['S', 'M', 'L', 'XL', '2XL'];
const TALLAS_HOODIE = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
const GRAMAJES = [160, 185, 230];
const BOTONES = [25, 37, 58];

const materiales = [
  ...BOTONES.flatMap(mm => [
    { clave: `base-metal-${mm}`, nombre: `Base metálica ${mm} mm`, grupo: 'Botones', unidad: 'unidad' },
    { clave: `base-plastica-${mm}`, nombre: `Base plástica ${mm} mm`, grupo: 'Botones', unidad: 'unidad' },
    { clave: `chapa-${mm}`, nombre: `Chapa ${mm} mm`, grupo: 'Botones', unidad: 'unidad' },
    { clave: `pelicula-${mm}`, nombre: `Película plástica ${mm} mm`, grupo: 'Botones', unidad: 'unidad' }
  ]),
  { clave: 'papel-imagenes', nombre: 'Papel para imágenes de botones', grupo: 'Botones', unidad: 'hoja' },
  { clave: 'adhesivo-mate', nombre: 'Papel fotográfico adhesivo mate', grupo: 'Stickers', unidad: 'hoja' },
  { clave: 'adhesivo-brillante', nombre: 'Papel fotográfico adhesivo brillante', grupo: 'Stickers', unidad: 'hoja' },
  ...GRAMAJES.flatMap(g => TALLAS_CAMISETA.map(t => ({ clave: `camiseta-${g}-${t}`, nombre: `Camiseta ${g} g talla ${t}`, grupo: `Camisetas ${g} g`, unidad: 'unidad' }))),
  ...TALLAS_HOODIE.map(t => ({ clave: `hoodie-${t}`, nombre: `Hoodie talla ${t}`, grupo: 'Hoodies', unidad: 'unidad' })),
  { clave: 'estampado-carta', nombre: 'Estampado tamaño carta', grupo: 'Estampados', unidad: 'unidad' },
  { clave: 'taza-11', nombre: 'Taza blanca 11 oz', grupo: 'Tazas', unidad: 'unidad' },
  { clave: 'resina', nombre: 'Resina epóxica', grupo: 'Pines de resina', unidad: 'g' },
  { clave: 'broche-pin', nombre: 'Broche para pin', grupo: 'Pines de resina', unidad: 'unidad' }
];

const linea = (clave, cantidad = 1) => ({ material: clave, cantidad });

const ADICIONALES_ESTAMPADO = [
  { nombre: 'Estampado 2 lados', precio: 10000, receta: [linea('estampado-carta')] },
  { nombre: 'Estampado grande', precio: 10000, receta: [] },
  { nombre: 'Estampado 1 brazo', precio: 8000, receta: [] }
];

const precioTalla = (talla, recargo) => (['2XL', '3XL', '4XL'].includes(talla) ? recargo : 0);

const productos = [
  ...[[25, 1300, 2000], [37, 2000, 3500], [58, 3000, 5000]].map(([mm, uno, dos]) => ({
    nombre: `Botón metálico ${mm} mm`,
    categoria: 'Botones',
    precio: uno,
    preciosCantidad: [{ cantidad: 2, precio: dos }],
    receta: [linea(`chapa-${mm}`), linea('papel-imagenes', 0), linea(`pelicula-${mm}`)],
    opciones: [{
      nombre: 'Base',
      valores: [
        { nombre: 'Metálica', precioExtra: 0, receta: [linea(`base-metal-${mm}`)] },
        { nombre: 'Plástica', precioExtra: 0, receta: [linea(`base-plastica-${mm}`)] }
      ]
    }]
  })),
  ...[[55, 1000, 6, 5000], [28, 300, 2, 500]].map(([mm, uno, cant, paquete]) => ({
    nombre: `Sticker ${mm} mm`,
    categoria: 'Stickers',
    precio: uno,
    preciosCantidad: [{ cantidad: cant, precio: paquete }],
    receta: [],
    opciones: [{
      nombre: 'Papel',
      valores: [
        { nombre: 'Mate', precioExtra: 0, receta: [linea('adhesivo-mate', 0)] },
        { nombre: 'Brillante', precioExtra: 0, receta: [linea('adhesivo-brillante', 0)] }
      ]
    }]
  })),
  {
    nombre: 'Hoja completa de stickers',
    categoria: 'Stickers',
    precio: 10000,
    receta: [],
    opciones: [{
      nombre: 'Papel',
      valores: [
        { nombre: 'Mate', precioExtra: 0, receta: [linea('adhesivo-mate')] },
        { nombre: 'Brillante', precioExtra: 5000, receta: [linea('adhesivo-brillante')] }
      ]
    }]
  },
  ...[[160, 45000, 8000], [185, 50000, 0], [230, 55000, 8000]].map(([g, precio, recargo]) => ({
    nombre: `Camiseta ${g} g`,
    categoria: 'Camisetas',
    precio,
    receta: [linea('estampado-carta')],
    opciones: [{
      nombre: 'Talla',
      valores: TALLAS_CAMISETA.map(t => ({ nombre: t, precioExtra: precioTalla(t, recargo), receta: [linea(`camiseta-${g}-${t}`)] }))
    }],
    adicionales: ADICIONALES_ESTAMPADO
  })),
  {
    nombre: 'Hoodie',
    categoria: 'Hoodies',
    precio: 90000,
    receta: [linea('estampado-carta')],
    opciones: [{
      nombre: 'Talla',
      valores: TALLAS_HOODIE.map(t => ({ nombre: t, precioExtra: precioTalla(t, 8000), receta: [linea(`hoodie-${t}`)] }))
    }],
    adicionales: ADICIONALES_ESTAMPADO
  },
  {
    nombre: 'Taza 11 oz',
    categoria: 'Tazas',
    precio: 18000,
    receta: [linea('taza-11')]
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
