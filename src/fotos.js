// Fotos de pedidos (taller y clientes): se guardan como data URL JPEG en Firestore,
// cada una en su propio documento, así que deben pesar menos de ~850 KB.
const MAX_LARGO = 850000;
const INTENTOS = [[1600, 0.82], [1280, 0.75], [1024, 0.65], [800, 0.6]];

/** Achica una imagen del celular o del computador a JPEG que quepa en un documento. */
export const achicarFoto = (archivo) => new Promise((resolver, rechazar) => {
  const url = URL.createObjectURL(archivo);
  const img = new Image();
  img.onload = () => {
    let data = '';
    for (const [lado, calidad] of INTENTOS) {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      const ctx = lienzo.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, lienzo.width, lienzo.height);
      ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
      data = lienzo.toDataURL('image/jpeg', calidad);
      if (data.length <= MAX_LARGO) break;
    }
    URL.revokeObjectURL(url);
    if (data.length > MAX_LARGO) rechazar(new Error(`${archivo.name}: la foto es demasiado grande`));
    else resolver(data);
  };
  img.onerror = () => { URL.revokeObjectURL(url); rechazar(new Error(`${archivo.name}: no es una imagen`)); };
  img.src = url;
});

/** Enlace de WhatsApp con un mensaje listo (los teléfonos sin indicativo se toman como de Colombia). */
export const enlaceWhatsApp = (telefono, texto) => {
  const digitos = String(telefono || '').replace(/\D/g, '');
  if (digitos.length < 7) return '';
  const numero = digitos.length === 10 ? '57' + digitos : digitos;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
};
