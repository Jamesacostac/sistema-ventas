// Platos y combos de Tazón para Dos, con los costos de "Costos y Precios por Plato" (octubre 2026).
// Empanadas y nuggets son materiales (se compran por bolsa y se gastan por unidad):
//   carne:   bolsa $9.850, 12 unidades (420 g)  → $821 c/u
//   queso:   bolsa $11.500, 10 unidades (400 g) → $1.150 c/u
//   nuggets: bolsa $13.630, 16 unidades (240 g) → $852 c/u
// Las bebidas y el mecato de los combos son productos del inventario: se buscan por nombre
// y al vender se elige la bebida y su sabor.

const material = (clave, nombre, grupo, costo) => ({ clave, nombre, grupo, unidad: 'unidad', costo, stock: 0, costoPedido: 0 });

const materiales = [
  material('carne', 'Empanada de carne (congelada)', 'Empanadas', 821),
  material('queso', 'Empanada de queso (congelada)', 'Empanadas', 1150),
  material('nugget', 'Nugget de pollo (congelado)', 'Nuggets', 852)
];

const linea = (material, cantidad = 1) => ({ material, cantidad });
const opcion = (producto, precioExtra = 0) => ({ producto, precioExtra });

// Bebidas personales: el Hit es la base y las demás cuestan $500 más
const BEBIDAS = [
  opcion('Hit Tetrapack 200ml'),
  opcion('Te Hatsu Tetrapack 200ml', 500),
  opcion('Postobon pet 400ml', 500)
];
// Para el plato mixto también se ofrecen las bebidas grandes
const BEBIDAS_GRANDES = [
  ...BEBIDAS,
  opcion('mr tea limonada', 1000),
  opcion('Gaseosa Postobon Pet 1.5L', 2500),
  opcion('Jugo Hit 1L', 2500)
];

const bebida = (nombre = 'Bebida', opciones = BEBIDAS) => ({ nombre, cantidad: 1, opciones });
const fijo = (producto, cantidad = 1) => ({ nombre: producto, cantidad, opciones: [opcion(producto)] });

const PLATO_MIXTO = [linea('carne', 2), linea('queso', 2), linea('nugget', 3)];

const productos = [
  // Platos (se venden por unidad; los nuggets tienen precio por cantidad)
  { nombre: 'Empanada de carne', categoria: 'Comidas', precio: 2000, receta: [linea('carne')] },
  { nombre: 'Empanada de queso', categoria: 'Comidas', precio: 2500, receta: [linea('queso')] },
  {
    nombre: 'Nuggets de pollo',
    categoria: 'Comidas',
    precio: 2500,
    preciosCantidad: [{ cantidad: 5, precio: 12000 }, { cantidad: 6, precio: 14000 }],
    receta: [linea('nugget')]
  },
  { nombre: 'Plato mixto (2 carne + 2 queso + 3 nuggets)', categoria: 'Comidas', precio: 16000, receta: PLATO_MIXTO },

  // Combos de plato + bebida
  { nombre: 'Combo Empanadero (3 empanadas de carne + bebida)', categoria: 'Combos', precio: 8000, receta: [linea('carne', 3)], incluye: [bebida()] },
  { nombre: 'Combo Quesito (2 empanadas de queso + bebida)', categoria: 'Combos', precio: 7000, receta: [linea('queso', 2)], incluye: [bebida()] },
  { nombre: 'Combo Nuggets (4 nuggets + bebida)', categoria: 'Combos', precio: 12000, receta: [linea('nugget', 4)], incluye: [bebida()] },
  { nombre: 'Combo Mixto (plato mixto + bebida)', categoria: 'Combos', precio: 17500, receta: PLATO_MIXTO, incluye: [bebida('Bebida', BEBIDAS_GRANDES)] },
  { nombre: 'Combo para Compartir (plato mixto + 2 bebidas)', categoria: 'Combos', precio: 20000, receta: PLATO_MIXTO, incluye: [bebida('Bebida 1'), bebida('Bebida 2')] },

  // Combos de mecato + bebida
  { nombre: 'Combo Recreo (Festival + 3 moritas + bebida)', categoria: 'Combos', precio: 5000, incluye: [fijo('Festival Recreo'), fijo('moritas caramelo', 3), bebida()] },
  { nombre: 'Combo Mini Chips (mini chips + bebida)', categoria: 'Combos', precio: 5000, incluye: [fijo('mini chips galletas'), bebida()] },
  { nombre: 'Combo Papas Rizadas (papas + bebida)', categoria: 'Combos', precio: 5000, incluye: [fijo('Yupi Papas Rizadas'), bebida()] },
  { nombre: 'Combo Golpe (Yupi Golpe + bebida)', categoria: 'Combos', precio: 5500, incluye: [fijo('Yupi Golpe'), bebida()] },
  { nombre: 'Combo Monte Rojo (papas Monte Rojo + bebida)', categoria: 'Combos', precio: 6000, incluye: [fijo('Papas Monte Rojo'), bebida()] },
  {
    nombre: 'Combo para Dos (Monte Rojo + mini chips + 2 bebidas)',
    categoria: 'Combos',
    precio: 11000,
    incluye: [fijo('Papas Monte Rojo'), fijo('mini chips galletas'), bebida('Bebida 1'), bebida('Bebida 2')]
  }
];

export const CATALOGO_TAZON = { materiales, productos };
