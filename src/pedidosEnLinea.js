// Pedidos en línea: los clientes ven la carta, arman su carrito y lo pagan en caja.
//
// negocios/{nid}/publico/carta   carta pública SIN costos ni stock interno. La genera la app del
//                                negocio cada vez que cambia el inventario (cartaPublica).
// negocios/{nid}/pedidos/{id}    { clienteUid, clienteNombre, codigo, items, total, medioPago, nota,
//                                  estado: 'pendiente' | 'pagado' | 'cancelado', creadoEn,
//                                  pagadoEn, factura }  (la factura la escribe caja al cobrar)
//
// Un ítem del pedido: { productoId, tipo: 'producto' | 'fabricado', nombre, cantidad, descripcion,
//   variante (producto: sabor o 'TODAS'), valores, adicionales, elegidos (fabricado), precioUnitario, total }
// El total del cliente es informativo: en caja se cobra con los precios reales del inventario.

import {
  eleccionDe, adicionalesDe, precioUnitario, precioPorCantidad, incluyeDe, alcanzaPara, precioExtraElegidos,
  descripcionLinea, descripcionElegidos
} from './fabricacion';

export const MEDIOS_PAGO_CLIENTE = ['Efectivo', 'Transferencia', 'Tarjeta'];

// Portal de clientes (sitio aparte del portal del negocio para que las sesiones no se mezclen)
export const URL_PORTAL_CLIENTES = 'https://tazon-pedidos.web.app';
// Página de solicitudes de Noguri (Angular en Hostinger) con el chat; ?pedido=<código> abre el seguimiento
export const URL_PAGINA_NOGURI = 'https://tazon-para-dos.online/NOGURI/';
// API de esa página (Google Apps Script): la bandeja de chats le pide traer las respuestas dadas en Telegram
export const URL_API_NOGURI = 'https://script.google.com/macros/s/AKfycbw1OYWZVBFp2i2lqJ2cefTmgVvl6vQ4M_eoQjA4Gzlc-9DeGiAz63nMtEbQCrk9Fc3T/exec';

// Negocio que atiende los pedidos del portal (?negocio=id para otro). Es el mismo ID_TAZON de
// negociosComun, copiado aquí para que el portal de clientes no cargue código del negocio.
const NEGOCIO_POR_DEFECTO = 'tazon-para-dos';
export const negocioPublico = () => {
  try {
    return new URLSearchParams(window.location.search).get('negocio') || NEGOCIO_POR_DEFECTO;
  } catch {
    return NEGOCIO_POR_DEFECTO;
  }
};

// Código corto para decir en caja (sin letras que se confunden: O/0, I/1, L)
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const generarCodigoPedido = () => {
  const azar = crypto.getRandomValues(new Uint32Array(5));
  return [...azar].map(n => LETRAS[n % LETRAS.length]).join('');
};

// Sabores con unidades ("Mora" y "mora " son el mismo)
export const saboresDeLotes = (lotes = []) => {
  const porSabor = {};
  lotes.forEach(l => {
    const nombre = String(l.variante || 'General').trim();
    const clave = nombre.toLowerCase();
    porSabor[clave] ??= { variante: nombre, cantidad: 0 };
    porSabor[clave].cantidad += Number(l.cantidad) || 0;
  });
  return Object.values(porSabor).filter(s => s.cantidad > 0);
};

const stockDe = (lotes) => saboresDeLotes(lotes).reduce((s, x) => s + x.cantidad, 0);

/**
 * Carta pública a partir del inventario. `lotesDe(p)` devuelve los lotes normalizados de un producto.
 * No incluye costos, ganancias ni datos de clientes.
 */
export const cartaPublica = (productos, fabricados, materialesPorId, lotesDe) => {
  const inventarioPorId = Object.fromEntries(productos.map(p => [p.id, p]));
  const productoPublico = (p) => {
    const lotes = lotesDe(p);
    const sabores = saboresDeLotes(lotes);
    return {
      id: p.id,
      tipo: 'producto',
      nombre: p.nombre.trim().replace(/\s+/g, ' '),
      categoria: p.categoria || 'Sin categoría',
      precio: Number(p.precio) || 0,
      disponible: stockDe(lotes),
      sabores: sabores.length > 1 ? sabores : []
    };
  };

  const items = productos.filter(p => Number(p.precio) > 0).map(productoPublico);

  fabricados.filter(p => Number(p.precio) > 0).forEach(p => {
    const espacios = incluyeDe(p).map(e => ({
      id: e.id,
      nombre: e.nombre,
      cantidad: Number(e.cantidad) || 1,
      opciones: e.opciones
        .filter(o => inventarioPorId[o.productoId])
        .map(o => {
          const publico = productoPublico(inventarioPorId[o.productoId]);
          return { productoId: o.productoId, nombre: publico.nombre, precioExtra: Number(o.precioExtra) || 0, disponible: publico.disponible, sabores: publico.sabores };
        })
    })).filter(e => e.opciones.length > 0);

    // Lo hecho de antemano + lo que alcanzan los materiales (null = no gasta materiales)
    const listos = Object.values(p.listos || {}).reduce((a, n) => a + (Number(n) || 0), 0);
    const alcanza = alcanzaPara(p, eleccionDe(p, []).map(e => e.valor.id), materialesPorId);
    const porMateriales = alcanza === null ? null : alcanza + listos;
    const porIncluidos = espacios.length
      ? Math.min(...espacios.map(e => Math.floor(Math.max(...e.opciones.map(o => o.disponible)) / e.cantidad)))
      : null;
    const limites = [porMateriales, porIncluidos].filter(x => x !== null);

    items.push({
      id: p.id,
      tipo: 'fabricado',
      nombre: p.nombre,
      categoria: p.categoria || 'Sin categoría',
      precio: Number(p.precio) || 0,
      preciosCantidad: p.preciosCantidad || [],
      opciones: (p.opciones || []).map(o => ({ id: o.id, nombre: o.nombre, valores: (o.valores || []).map(v => ({ id: v.id, nombre: v.nombre, precioExtra: Number(v.precioExtra) || 0 })) })),
      adicionales: (p.adicionales || []).map(a => ({ id: a.id, nombre: a.nombre, precio: Number(a.precio) || 0 })),
      incluye: espacios,
      disponible: limites.length ? Math.max(0, Math.min(...limites)) : null
    });
  });

  return items.sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
};

// Precio de un ítem del carrito del cliente según la carta
export const precioItemCliente = (item, cartaItem) => {
  if (!cartaItem) return { unitario: 0, total: 0 };
  if (item.tipo === 'producto') {
    const unitario = cartaItem.precio;
    return { unitario, total: unitario * item.cantidad };
  }
  const unitario = precioUnitario(cartaItem, eleccionDe(cartaItem, item.valores), adicionalesDe(cartaItem, item.adicionales))
    + precioExtraElegidos(cartaItem, item.elegidos);
  return { unitario, total: precioPorCantidad(cartaItem, item.cantidad, unitario) };
};

export const descripcionItemCliente = (item, cartaItem) => {
  if (item.tipo === 'producto') return item.variante && item.variante !== 'TODAS' ? item.variante : '';
  return [cartaItem ? descripcionLinea(cartaItem, item.valores, item.adicionales) : '', descripcionElegidos(item.elegidos)].filter(Boolean).join(' · ');
};

// Mismo producto con las mismas elecciones → se juntan en una línea
export const claveItemCliente = (item) =>
  [item.productoId, item.variante || '', (item.valores || []).join(','), [...(item.adicionales || [])].sort().join(','),
    (item.elegidos || []).map(e => `${e.productoId}:${e.variante}`).join(',')].join('|');

export const estadoPedido = {
  pendiente: { texto: 'Pendiente de pago', clase: 'pastilla-pendiente' },
  pagado: { texto: 'Pagado', clase: 'pastilla-ok' },
  cancelado: { texto: 'Cancelado', clase: 'pastilla-peligro' }
};

// Milisegundos de un número o de un Timestamp de Firestore (creadoEn usa la hora del servidor)
export const aMilis = (valor) => (typeof valor?.toMillis === 'function' ? valor.toMillis() : Number(valor) || 0);

export const fechaHora = (valor) => (aMilis(valor)
  ? new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(aMilis(valor)))
  : '');

// Errores de Firebase Auth para la entrada de clientes
export const mensajesErrorCliente = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/invalid-email': 'El correo no es válido.',
  'auth/email-already-in-use': 'Ya hay una cuenta con ese correo. Inicia sesión.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  'auth/network-request-failed': 'Sin conexión a internet.',
};

// ---------- Solicitudes de la página web de Noguri ----------
// El Apps Script de la página (tazon-para-dos.online/NOGURI) copia cada solicitud como pedido con
// origen 'web-noguri'. Sus ítems traen { tipo: 'noguri', producto: 'stickers'|'botones'|'pines', medida_mm,
// cantidad }. Al cobrar se buscan los productos fabricados equivalentes para descontar sus materiales.

const medidaEnNombre = (nombre) => Number((String(nombre).match(/(\d+)\s*mm/i) || [])[1]) || null;

/**
 * Producto fabricado que corresponde a un ítem de la web de Noguri:
 * { prod, valores, aproximado: texto si no es exacto } o null si no hay ninguno.
 */
export const productoNoguri = (item, fabricados) => {
  const medida = Number(item.medida_mm);
  const valoresDe = (prod, preferido) => (prod.opciones || []).map(o => (
    o.valores.find(v => preferido && preferido.test(v.nombre)) || o.valores[0]
  )?.id).filter(Boolean);

  if (item.producto === 'botones') {
    const prod = fabricados.find(p => /bot[oó]n/i.test(p.nombre) && medidaEnNombre(p.nombre) === medida);
    return prod ? { prod, valores: valoresDe(prod), aproximado: null } : null;
  }
  if (item.producto === 'pines') {
    const prod = fabricados.find(p => /pin/i.test(p.nombre) && /resina/i.test(p.nombre));
    return prod ? { prod, valores: valoresDe(prod, /personaliz/i), aproximado: null } : null;
  }
  // Stickers: el de la misma medida o el más cercano (se prefiere el mate a los fotográficos)
  const candidatos = fabricados
    .filter(p => /sticker/i.test(p.nombre) && !/hoja/i.test(p.nombre) && medidaEnNombre(p.nombre))
    .sort((a, b) => Math.abs(medidaEnNombre(a.nombre) - medida) - Math.abs(medidaEnNombre(b.nombre) - medida)
      || /foto/i.test(a.nombre) - /foto/i.test(b.nombre));
  const prod = candidatos[0];
  if (!prod) return null;
  const real = medidaEnNombre(prod.nombre);
  return { prod, valores: valoresDe(prod), aproximado: real === medida ? null : `sticker de ${medida} mm cobrado como "${prod.nombre}"` };
};
