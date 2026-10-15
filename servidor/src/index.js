// Servidor de verificación del Sistema de Ventas (Cloudflare Worker).
//
// Se encarga de lo que no se puede hacer de forma segura desde el navegador:
//   - Enviar códigos de verificación por correo (Brevo) y comprobarlos.
//   - Marcar sesiones como verificadas y recordar dispositivos de confianza (30 días).
//   - Cambiar la contraseña exigiendo la actual + un código enviado al correo.
//   - Crear y quitar socios (solo el administrador principal).
//
// Accede a Firestore con una cuenta interna ("servidor") a la que las reglas
// le dan permiso sobre las colecciones admins, sesiones, dispositivos y codigos.

const TREINTA_DIAS = 30 * 24 * 60 * 60 * 1000;
const DOCE_HORAS = 12 * 60 * 60 * 1000;
const DIEZ_MINUTOS = 10 * 60 * 1000;
const ESPERA_REENVIO = 60 * 1000;
const MAX_INTENTOS = 5;
const MAX_ENVIOS_DIA = 10;

class ErrorApi extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

// ==================== Utilidades ====================

const sha256 = async (texto) => {
  const datos = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
};

const hexAleatorio = (bytes) =>
  [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('');

// Código de 6 dígitos sin sesgo
const generarCodigo = () => {
  const limite = Math.floor(0xffffffff / 1000000) * 1000000;
  let n;
  do {
    n = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (n >= limite);
  return String(n % 1000000).padStart(6, '0');
};

const decodificarJwt = (jwt) => {
  const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')));
};

const enmascararCorreo = (correo) => {
  const [usuario, dominio] = (correo || '').split('@');
  if (!dominio) return correo;
  const visible = usuario.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(usuario.length - 3, 1))}${usuario.slice(-1)}@${dominio}`;
};

const nombreDispositivo = (ua) => {
  const navegador = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const sistema = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'otro sistema';
  return `${navegador} en ${sistema}`;
};

const esCorreoValido = (correo) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo || '');

// ==================== Firebase Auth (Identity Toolkit) ====================

const identity = async (env, metodo, cuerpo) => {
  const respuesta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/${metodo}?key=${env.FIREBASE_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }
  );
  const datos = await respuesta.json();
  if (!respuesta.ok) {
    const error = new ErrorApi(400, datos.error?.message || 'Error de autenticación');
    error.codigo = (datos.error?.message || '').split(' ')[0];
    throw error;
  }
  return datos;
};

// Comprueba una contraseña sin tocar la sesión del navegador. Devuelve un ID token "fresco".
const comprobarClave = async (env, correo, clave) => {
  try {
    return await identity(env, 'accounts:signInWithPassword', { email: correo, password: clave, returnSecureToken: true });
  } catch (error) {
    if (['INVALID_PASSWORD', 'INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND'].includes(error.codigo)) {
      throw new ErrorApi(400, 'La contraseña actual no es correcta.');
    }
    if (error.codigo === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
      throw new ErrorApi(429, 'Demasiados intentos. Espera unos minutos.');
    }
    throw error;
  }
};

let cacheTokenServidor = null;

const tokenServidor = async (env) => {
  if (cacheTokenServidor && cacheTokenServidor.expira > Date.now() + 60000) return cacheTokenServidor.token;
  const datos = await identity(env, 'accounts:signInWithPassword', {
    email: env.SERVIDOR_EMAIL, password: env.SERVIDOR_CLAVE, returnSecureToken: true
  });
  cacheTokenServidor = { token: datos.idToken, expira: Date.now() + Number(datos.expiresIn) * 1000 };
  return cacheTokenServidor.token;
};

// ==================== Firestore (REST) ====================

const aValor = (v) => {
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(aValor) } };
  if (typeof v === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, aValor(x)])) } };
  }
  return { stringValue: String(v) };
};

const deValor = (v) => {
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('stringValue' in v) return v.stringValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(deValor);
  if ('mapValue' in v) {
    return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, deValor(x)]));
  }
  return null;
};

const aCampos = (obj) => ({ fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, aValor(v)])) });
const deDocumento = (d) => ({
  id: d.name.split('/').pop(),
  ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, deValor(v)]))
});

const firestore = (env) => {
  const base = `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents`;

  const pedir = async (url, opciones = {}) => {
    const token = await tokenServidor(env);
    const respuesta = await fetch(url, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    });
    if (respuesta.status === 404) return null;
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(`Firestore ${respuesta.status}: ${datos.error?.message || ''}`);
    return datos;
  };

  return {
    get: async (ruta) => {
      const d = await pedir(`${base}/${ruta}`);
      return d ? deDocumento(d) : null;
    },
    set: (ruta, obj) => pedir(`${base}/${ruta}`, { method: 'PATCH', body: JSON.stringify(aCampos(obj)) }),
    borrar: (ruta) => pedir(`${base}/${ruta}`, { method: 'DELETE' }),
    listar: async (coleccion) => {
      const resultado = await pedir(`${base}:runQuery`, {
        method: 'POST',
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: coleccion }] } })
      });
      return (resultado || []).filter(r => r.document).map(r => deDocumento(r.document));
    },
    buscar: async (coleccion, campo, valor) => {
      const resultado = await pedir(`${base}:runQuery`, {
        method: 'POST',
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: coleccion }],
            where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: aValor(valor) } }
          }
        })
      });
      return (resultado || []).filter(r => r.document).map(r => deDocumento(r.document));
    }
  };
};

// ==================== Correo (Brevo) ====================

const enviarCorreo = async (env, para, asunto, html) => {
  const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: env.REMITENTE_NOMBRE, email: env.REMITENTE_EMAIL },
      to: [{ email: para }],
      subject: asunto,
      htmlContent: html
    })
  });
  if (!respuesta.ok) {
    console.error('Brevo', respuesta.status, await respuesta.text());
    throw new ErrorApi(502, 'No se pudo enviar el correo. Intenta de nuevo en unos minutos.');
  }
};

const plantillaCodigo = (codigo, motivo, dispositivo) => `
  <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
    <h2 style="color:#0f172a;margin:0 0 8px">Sistema de Control Financiero y Ventas</h2>
    <p style="color:#475569;margin:0 0 16px">${motivo}</p>
    <p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#4f46e5;text-align:center;margin:16px 0">${codigo}</p>
    <p style="color:#64748b;font-size:13px">El código vence en 10 minutos. Solicitado desde: ${dispositivo}.</p>
    <p style="color:#64748b;font-size:13px">Si no fuiste tú, no compartas este código y cambia tu contraseña.</p>
  </div>`;

// ==================== Contexto y sesiones ====================

const crearContexto = async (request, env) => {
  const idToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/, '');
  if (!idToken) throw new ErrorApi(401, 'Debes iniciar sesión.');

  let usuario;
  try {
    usuario = (await identity(env, 'accounts:lookup', { idToken })).users?.[0];
  } catch {
    throw new ErrorApi(401, 'Tu sesión no es válida. Vuelve a iniciar sesión.');
  }
  if (!usuario) throw new ErrorApi(401, 'Tu sesión no es válida. Vuelve a iniciar sesión.');

  const db = firestore(env);
  const admin = await db.get(`admins/${usuario.localId}`);
  if (!admin) throw new ErrorApi(403, 'Tu cuenta no tiene permisos de administrador.');

  return {
    env,
    db,
    idToken,
    admin,
    uid: usuario.localId,
    correo: usuario.email,
    authTime: String(decodificarJwt(idToken).auth_time),
    dispositivo: nombreDispositivo(request.headers.get('User-Agent') || '')
  };
};

const rutaSesion = (ctx) => `sesiones/${ctx.uid}_${ctx.authTime}`;

const exigirSesion = async (ctx) => {
  const sesion = await ctx.db.get(rutaSesion(ctx));
  if (!sesion || sesion.expira < new Date()) throw new ErrorApi(401, 'Debes verificar este dispositivo de nuevo.');
  return sesion;
};

// ==================== Negocios, rangos y auditoría ====================

const PERMISOS = ['ventas', 'ventas_editar', 'clientes', 'inventario', 'finanzas', 'socios'];
// Por defecto un socio nuevo puede modificar todo, excepto gestionar socios
const PERMISOS_POR_DEFECTO = { ventas: true, ventas_editar: true, clientes: true, inventario: true, finanzas: true, socios: false };
const COLORES = ['turquesa', 'coral', 'sol', 'verde', 'lila'];
const ID_TAZON = 'tazon-para-dos';

const esTitular = (miembro) => miembro?.rol === 'titular';
const puedeGestionarSocios = (miembro) => esTitular(miembro) || miembro?.permisos?.socios === true;

const limpiarPermisos = (actor, permisos = {}) => {
  const limpios = Object.fromEntries(PERMISOS.map(p => [p, permisos[p] === true]));
  // Solo el titular puede autorizar a otros a gestionar socios
  if (!esTitular(actor)) limpios.socios = false;
  return limpios;
};

const textoPermisos = (permisos) => {
  const activos = PERMISOS.filter(p => permisos?.[p]);
  return activos.length ? activos.join(', ') : 'solo lectura';
};

const slug = (texto) => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'negocio';

// Miembro del negocio que hace la petición (y que la sesión esté verificada)
const exigirMiembro = async (ctx, negocioId) => {
  if (!negocioId || typeof negocioId !== 'string') throw new ErrorApi(400, 'Falta indicar el negocio.');
  await exigirSesion(ctx);
  const actor = await ctx.db.get(`negocios/${negocioId}/miembros/${ctx.uid}`);
  if (!actor) throw new ErrorApi(403, 'No perteneces a este negocio.');
  return actor;
};

const exigirGestor = (actor) => {
  if (!puedeGestionarSocios(actor)) {
    throw new ErrorApi(403, 'No tienes permiso para gestionar socios. Solo el titular o quien él autorice.');
  }
};

// Reglas sobre a quién puede afectar cada gestor
const exigirPuedeAfectar = (ctx, actor, socio) => {
  if (socio.id === ctx.uid) throw new ErrorApi(400, 'No puedes modificar tu propia cuenta desde aquí.');
  if (esTitular(socio)) throw new ErrorApi(403, 'Nadie puede modificar al titular.');
  if (!esTitular(actor) && socio.permisos?.socios) {
    throw new ErrorApi(403, 'Solo el titular puede modificar a otro gestor de socios.');
  }
};

// Lista de negocios de una cuenta (se guarda en admins/{uid}.negocios)
const ajustarNegociosDeCuenta = async (ctx, uid, negocioId, agregar) => {
  const cuenta = await ctx.db.get(`admins/${uid}`);
  if (!cuenta) return;
  const { id: _id, ...datos } = cuenta;
  const lista = new Set(Array.isArray(datos.negocios) ? datos.negocios : []);
  if (agregar) lista.add(negocioId); else lista.delete(negocioId);
  await ctx.db.set(`admins/${uid}`, { ...datos, negocios: [...lista] });
};

// Registro en la auditoría del negocio de lo que hace el servidor a pedido de un usuario
const auditar = (ctx, negocioId, accion, detalle, cambios = []) =>
  ctx.db.set(`negocios/${negocioId}/auditoria/srv_${Date.now()}_${hexAleatorio(4)}`, {
    uid: ctx.uid,
    nombre: ctx.admin.nombre || ctx.correo,
    accion,
    detalle,
    cambios,
    fecha: new Date()
  });

// Cambios de la cuenta (contraseña, correo, nombre): quedan en la auditoría de cada negocio de la persona
const auditarCuenta = (ctx, accion, detalle) =>
  Promise.all((ctx.admin.negocios || []).map(nid => auditar(ctx, nid, accion, detalle)));

// Comprueba un código; si es correcto lo invalida para que no se pueda reusar
const verificarCodigo = async (ctx, proposito, codigo) => {
  const ruta = `codigos/${ctx.uid}_${proposito}`;
  const registro = await ctx.db.get(ruta);
  if (!registro || !registro.hash || registro.expira < new Date()) {
    throw new ErrorApi(400, 'El código venció o no existe. Solicita uno nuevo.');
  }
  const { id: _id, ...datos } = registro;
  if (registro.intentos >= MAX_INTENTOS) {
    await ctx.db.set(ruta, { ...datos, hash: '' });
    throw new ErrorApi(429, 'Demasiados intentos fallidos. Solicita un código nuevo.');
  }

  const hash = await sha256(`${ctx.uid}:${proposito}:${String(codigo || '').trim()}`);
  if (hash !== registro.hash) {
    const intentos = registro.intentos + 1;
    await ctx.db.set(ruta, { ...datos, intentos });
    const quedan = MAX_INTENTOS - intentos;
    throw new ErrorApi(400, quedan > 0
      ? `Código incorrecto. Te quedan ${quedan} intento(s).`
      : 'Demasiados intentos fallidos. Solicita un código nuevo.');
  }
  await ctx.db.set(ruta, { ...datos, hash: '', intentos: 0 });
};

// ==================== Rutas ====================

const rutas = {
  // ¿Esta sesión ya está verificada o el dispositivo es de confianza?
  '/sesion/iniciar': async (ctx, { dispositivo }) => {
    // Mantener sincronizado el correo del perfil (por si lo cambió)
    if (ctx.admin.correo !== ctx.correo) {
      const { id: _id, ...admin } = ctx.admin;
      await ctx.db.set(`admins/${ctx.uid}`, { ...admin, correo: ctx.correo });
    }

    const actual = await ctx.db.get(rutaSesion(ctx));
    if (actual && actual.expira > new Date()) return { ok: true, expira: actual.expira };

    if (dispositivo) {
      const idDispositivo = await sha256(String(dispositivo));
      const confiable = await ctx.db.get(`dispositivos/${idDispositivo}`);
      if (confiable && confiable.uid === ctx.uid && confiable.expira > new Date()) {
        await ctx.db.set(rutaSesion(ctx), {
          uid: ctx.uid, expira: confiable.expira, dispositivoId: idDispositivo, creado: new Date()
        });
        return { ok: true, expira: confiable.expira };
      }
    }

    return { ok: false, requiereCodigo: true, correo: enmascararCorreo(ctx.correo) };
  },

  '/codigo/enviar': async (ctx, { proposito }) => {
    if (!['dispositivo', 'clave'].includes(proposito)) throw new ErrorApi(400, 'Propósito no válido.');
    if (proposito === 'clave') await exigirSesion(ctx);

    const ruta = `codigos/${ctx.uid}_${proposito}`;
    const anterior = await ctx.db.get(ruta);
    const ahora = new Date();

    if (anterior?.enviado && ahora - anterior.enviado < ESPERA_REENVIO) {
      const segundos = Math.ceil((ESPERA_REENVIO - (ahora - anterior.enviado)) / 1000);
      throw new ErrorApi(429, `Espera ${segundos} segundos para pedir otro código.`);
    }
    const hoy = ahora.toISOString().slice(0, 10);
    const enviosHoy = anterior?.dia === hoy ? anterior.enviosHoy : 0;
    if (enviosHoy >= MAX_ENVIOS_DIA) throw new ErrorApi(429, 'Alcanzaste el límite de códigos por hoy. Intenta mañana.');

    const codigo = generarCodigo();
    await ctx.db.set(ruta, {
      hash: await sha256(`${ctx.uid}:${proposito}:${codigo}`),
      expira: new Date(ahora.getTime() + DIEZ_MINUTOS),
      intentos: 0,
      enviado: ahora,
      dia: hoy,
      enviosHoy: enviosHoy + 1
    });

    const motivo = proposito === 'dispositivo'
      ? 'Alguien inició sesión con tu cuenta en un dispositivo nuevo. Usa este código para verificarlo:'
      : 'Solicitaste cambiar tu contraseña. Usa este código para confirmarlo:';
    const asunto = proposito === 'dispositivo'
      ? `${codigo} es tu código para verificar el dispositivo`
      : `${codigo} es tu código para cambiar la contraseña`;
    await enviarCorreo(ctx.env, ctx.correo, asunto, plantillaCodigo(codigo, motivo, ctx.dispositivo));

    return { ok: true, correo: enmascararCorreo(ctx.correo) };
  },

  '/sesion/verificar': async (ctx, { codigo, confiar }) => {
    await verificarCodigo(ctx, 'dispositivo', codigo);

    const respuesta = { ok: true };
    let expira = new Date(Date.now() + DOCE_HORAS);
    let dispositivoId = '';

    if (confiar) {
      const token = hexAleatorio(32);
      dispositivoId = await sha256(token);
      expira = new Date(Date.now() + TREINTA_DIAS);
      await ctx.db.set(`dispositivos/${dispositivoId}`, {
        uid: ctx.uid, nombre: ctx.dispositivo, creado: new Date(), expira
      });
      respuesta.dispositivo = token;
    }

    await ctx.db.set(rutaSesion(ctx), { uid: ctx.uid, expira, dispositivoId, creado: new Date() });
    respuesta.expira = expira;
    return respuesta;
  },

  '/dispositivos/revocar': async (ctx, { id }) => {
    await exigirSesion(ctx);
    const dispositivo = await ctx.db.get(`dispositivos/${id}`);
    if (!dispositivo || dispositivo.uid !== ctx.uid) throw new ErrorApi(404, 'Dispositivo no encontrado.');
    await ctx.db.borrar(`dispositivos/${id}`);
    const sesiones = await ctx.db.buscar('sesiones', 'dispositivoId', id);
    await Promise.all(sesiones.map(s => ctx.db.borrar(`sesiones/${s.id}`)));
    return { ok: true };
  },

  '/clave/cambiar': async (ctx, { actual, nueva, codigo }) => {
    await exigirSesion(ctx);
    if (!nueva || nueva.length < 8) throw new ErrorApi(400, 'La nueva contraseña debe tener al menos 8 caracteres.');
    if (nueva === actual) throw new ErrorApi(400, 'La nueva contraseña debe ser diferente a la actual.');

    // Primero la contraseña actual (así un error aquí no gasta el código)
    const fresco = await comprobarClave(ctx.env, ctx.correo, actual);
    await verificarCodigo(ctx, 'clave', codigo);

    try {
      await identity(ctx.env, 'accounts:update', { idToken: fresco.idToken, password: nueva, returnSecureToken: true });
    } catch (error) {
      if (error.codigo === 'WEAK_PASSWORD') throw new ErrorApi(400, 'La nueva contraseña es demasiado débil.');
      throw error;
    }
    await auditarCuenta(ctx, 'Contraseña cambiada', `Desde ${ctx.dispositivo}`);
    return { ok: true };
  },

  '/correo/cambiar': async (ctx, { actual, nuevo }) => {
    await exigirSesion(ctx);
    const correoNuevo = String(nuevo || '').trim().toLowerCase();
    if (!esCorreoValido(correoNuevo)) throw new ErrorApi(400, 'El correo nuevo no es válido.');
    if (correoNuevo === ctx.correo.toLowerCase()) throw new ErrorApi(400, 'Ese ya es tu correo actual.');

    const fresco = await comprobarClave(ctx.env, ctx.correo, actual);
    try {
      // Firebase envía un enlace al correo nuevo; el cambio se aplica al abrirlo
      await identity(ctx.env, 'accounts:sendOobCode', {
        requestType: 'VERIFY_AND_CHANGE_EMAIL', idToken: fresco.idToken, newEmail: correoNuevo
      });
    } catch (error) {
      if (error.codigo === 'EMAIL_EXISTS') throw new ErrorApi(409, 'Ese correo ya está en uso por otra cuenta.');
      throw error;
    }
    await auditarCuenta(ctx, 'Cambio de correo solicitado', `${ctx.correo} → ${correoNuevo}`);
    return { ok: true };
  },

  '/perfil/actualizar': async (ctx, { nombre }) => {
    await exigirSesion(ctx);
    const limpio = String(nombre || '').trim().replace(/\s+/g, ' ');
    if (limpio.length < 2 || limpio.length > 60) throw new ErrorApi(400, 'El nombre debe tener entre 2 y 60 caracteres.');

    const { id: _id, ...admin } = ctx.admin;
    await ctx.db.set(`admins/${ctx.uid}`, { ...admin, nombre: limpio, correo: ctx.correo });
    await identity(ctx.env, 'accounts:update', { idToken: ctx.idToken, displayName: limpio }).catch(() => {});
    if (admin.nombre !== limpio) {
      await auditarCuenta(ctx, 'Nombre de usuario cambiado', `${admin.nombre || '(sin nombre)'} → ${limpio}`);
      // Mantener el nombre al día en los negocios donde participa
      await Promise.all((admin.negocios || []).map(async (nid) => {
        const m = await ctx.db.get(`negocios/${nid}/miembros/${ctx.uid}`);
        if (m) { const { id: _m, ...dm } = m; await ctx.db.set(`negocios/${nid}/miembros/${ctx.uid}`, { ...dm, nombre: limpio }); }
      }));
    }
    return { ok: true };
  },

  // Registrar un negocio nuevo: quien lo crea queda como titular
  '/negocios/crear': async (ctx, { nombre, color, porcentajeAhorro, numeroSocios }) => {
    await exigirSesion(ctx);
    const nombreLimpio = String(nombre || '').trim().replace(/\s+/g, ' ');
    if (nombreLimpio.length < 2 || nombreLimpio.length > 50) throw new ErrorApi(400, 'El nombre del negocio debe tener entre 2 y 50 caracteres.');
    const ahorro = Number(porcentajeAhorro ?? 15);
    const socios = Number(numeroSocios ?? 1);
    if (!(ahorro >= 0 && ahorro <= 100)) throw new ErrorApi(400, 'El porcentaje de ahorro debe estar entre 0 y 100.');
    if (!Number.isInteger(socios) || socios < 1 || socios > 50) throw new ErrorApi(400, 'El número de socios debe ser un entero entre 1 y 50.');

    let id = slug(nombreLimpio);
    if (await ctx.db.get(`negocios/${id}`)) id = `${id}-${hexAleatorio(3)}`;

    await ctx.db.set(`negocios/${id}`, {
      nombre: nombreLimpio,
      color: COLORES.includes(color) ? color : 'coral',
      porcentajeAhorro: ahorro,
      numeroSocios: socios,
      migrado: true,
      creado: new Date(),
      creadoPor: ctx.uid
    });
    await ctx.db.set(`negocios/${id}/miembros/${ctx.uid}`, {
      uid: ctx.uid, nombre: ctx.admin.nombre || ctx.correo, correo: ctx.correo, rol: 'titular', creado: new Date()
    });
    await ajustarNegociosDeCuenta(ctx, ctx.uid, id, true);
    await auditar(ctx, id, 'Negocio creado', `${nombreLimpio} · ahorro ${ahorro} % · reparto entre ${socios} socio(s)`);
    return { ok: true, id };
  },

  // Separar los datos actuales (raíz) como el negocio "Tazón para Dos": crea el negocio y
  // copia las cuentas con sus rangos como miembros. Los datos los copia después la app.
  '/negocios/preparar-tazon': async (ctx) => {
    await exigirSesion(ctx);
    if (ctx.admin.rol !== 'principal') throw new ErrorApi(403, 'Solo el titular de Tazón para Dos puede prepararlo.');
    if (await ctx.db.get(`negocios/${ID_TAZON}`)) throw new ErrorApi(409, 'Tazón para Dos ya fue preparado.');

    await ctx.db.set(`negocios/${ID_TAZON}`, {
      nombre: 'Tazón para Dos', color: 'turquesa', porcentajeAhorro: 15, numeroSocios: 3,
      migrado: false, creado: new Date(), creadoPor: ctx.uid
    });
    const cuentas = await ctx.db.listar('admins');
    for (const c of cuentas) {
      await ctx.db.set(`negocios/${ID_TAZON}/miembros/${c.id}`, {
        uid: c.id,
        nombre: c.nombre || c.correo || '',
        correo: c.correo || '',
        rol: c.rol === 'principal' ? 'titular' : 'socio',
        permisos: c.rol === 'principal' ? {} : limpiarPermisos({ rol: 'titular' }, c.permisos || PERMISOS_POR_DEFECTO),
        creado: new Date()
      });
      await ajustarNegociosDeCuenta(ctx, c.id, ID_TAZON, true);
    }
    await auditar(ctx, ID_TAZON, 'Negocio preparado', `Tazón para Dos separado con ${cuentas.length} miembro(s)`);
    return { ok: true, id: ID_TAZON };
  },

  // Agregar un socio al negocio: si ya tiene cuenta en la app solo se agrega; si no, se crea
  '/miembros/crear': async (ctx, { negocioId, nombre, correo, clave, permisos }) => {
    const actor = await exigirMiembro(ctx, negocioId);
    exigirGestor(actor);

    const nombreLimpio = String(nombre || '').trim().replace(/\s+/g, ' ');
    const correoLimpio = String(correo || '').trim().toLowerCase();
    if (!esCorreoValido(correoLimpio)) throw new ErrorApi(400, 'El correo no es válido.');

    const existentes = await ctx.db.buscar('admins', 'correo', correoLimpio);
    let uid = existentes[0]?.id;
    let cuentaNueva = false;

    if (!uid) {
      if (nombreLimpio.length < 2) throw new ErrorApi(400, 'Escribe el nombre del socio.');
      if (!clave || clave.length < 8) throw new ErrorApi(400, 'La contraseña debe tener al menos 8 caracteres.');
      try {
        uid = (await identity(ctx.env, 'accounts:signUp', {
          email: correoLimpio, password: clave, displayName: nombreLimpio, returnSecureToken: true
        })).localId;
      } catch (error) {
        if (error.codigo !== 'EMAIL_EXISTS') throw error;
        try {
          uid = (await identity(ctx.env, 'accounts:signInWithPassword', { email: correoLimpio, password: clave, returnSecureToken: true })).localId;
        } catch {
          throw new ErrorApi(409, 'Ya existe una cuenta con ese correo y otra contraseña.');
        }
      }
      await ctx.db.set(`admins/${uid}`, { nombre: nombreLimpio, correo: correoLimpio, rol: 'socio', negocios: [], creado: new Date(), creadoPor: ctx.uid });
      cuentaNueva = true;
    }

    if (await ctx.db.get(`negocios/${negocioId}/miembros/${uid}`)) throw new ErrorApi(409, 'Esa persona ya es socio de este negocio.');
    const cuenta = await ctx.db.get(`admins/${uid}`);
    const permisosFinales = limpiarPermisos(actor, permisos || PERMISOS_POR_DEFECTO);
    const nombreFinal = cuenta?.nombre || nombreLimpio || correoLimpio;
    await ctx.db.set(`negocios/${negocioId}/miembros/${uid}`, {
      uid, nombre: nombreFinal, correo: correoLimpio, rol: 'socio', permisos: permisosFinales, creado: new Date(), creadoPor: ctx.uid
    });
    await ajustarNegociosDeCuenta(ctx, uid, negocioId, true);
    await auditar(ctx, negocioId, 'Socio agregado', `${nombreFinal} (${correoLimpio}) — permisos: ${textoPermisos(permisosFinales)}`,
      [{ ruta: `miembros/${uid}`, tipo: 'crear', antes: null, despues: { nombre: nombreFinal, correo: correoLimpio, permisos: permisosFinales } }]);
    return { ok: true, uid, cuentaNueva };
  },

  // Cambiar el rango (permisos de edición) de un socio del negocio
  '/miembros/permisos': async (ctx, { negocioId, uid, permisos }) => {
    const actor = await exigirMiembro(ctx, negocioId);
    exigirGestor(actor);
    const socio = await ctx.db.get(`negocios/${negocioId}/miembros/${uid}`);
    if (!socio) throw new ErrorApi(404, 'Socio no encontrado en este negocio.');
    exigirPuedeAfectar(ctx, actor, socio);

    const nuevos = limpiarPermisos(actor, permisos);
    if (!esTitular(actor)) nuevos.socios = socio.permisos?.socios === true; // un gestor no toca ese permiso

    const { id: _id, ...datos } = socio;
    await ctx.db.set(`negocios/${negocioId}/miembros/${uid}`, { ...datos, permisos: nuevos, permisosCambiadosPor: ctx.uid, permisosCambiadosEn: new Date() });
    await auditar(ctx, negocioId, 'Rango de socio cambiado', `${socio.nombre}: ${textoPermisos(socio.permisos)} → ${textoPermisos(nuevos)}`,
      [{ ruta: `miembros/${uid}`, tipo: 'editar', antes: { permisos: socio.permisos || {} }, despues: { permisos: nuevos } }]);
    return { ok: true, permisos: nuevos };
  },

  // Quitar un socio del negocio (su cuenta sigue existiendo si participa en otros negocios)
  '/miembros/eliminar': async (ctx, { negocioId, uid }) => {
    const actor = await exigirMiembro(ctx, negocioId);
    exigirGestor(actor);
    const socio = await ctx.db.get(`negocios/${negocioId}/miembros/${uid}`);
    if (!socio) throw new ErrorApi(404, 'Socio no encontrado en este negocio.');
    exigirPuedeAfectar(ctx, actor, socio);

    await ctx.db.borrar(`negocios/${negocioId}/miembros/${uid}`);
    await ajustarNegociosDeCuenta(ctx, uid, negocioId, false);
    await auditar(ctx, negocioId, 'Socio quitado', `${socio.nombre} (${socio.correo})`,
      [{ ruta: `miembros/${uid}`, tipo: 'eliminar', antes: { nombre: socio.nombre, correo: socio.correo, permisos: socio.permisos || {} }, despues: null }]);

    // Si ya no participa en ningún negocio, se cierran sus sesiones
    const cuenta = await ctx.db.get(`admins/${uid}`);
    if (!cuenta?.negocios?.length) {
      const [sesiones, dispositivos] = await Promise.all([ctx.db.buscar('sesiones', 'uid', uid), ctx.db.buscar('dispositivos', 'uid', uid)]);
      await Promise.all([...sesiones.map(x => ctx.db.borrar(`sesiones/${x.id}`)), ...dispositivos.map(d => ctx.db.borrar(`dispositivos/${d.id}`))]);
    }
    return { ok: true };
  }
};

// ==================== Punto de entrada ====================

const responder = (datos, status, cors) =>
  new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json', ...cors } });

export default {
  async fetch(request, env) {
    const origen = request.headers.get('Origin') || '';
    const permitidos = env.ORIGENES.split(',').map(o => o.trim());
    const cors = permitidos.includes(origen)
      ? {
          'Access-Control-Allow-Origin': origen,
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          Vary: 'Origin'
        }
      : {};

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return responder({ error: 'Método no permitido.' }, 405, cors);

    try {
      const manejador = rutas[new URL(request.url).pathname];
      if (!manejador) throw new ErrorApi(404, 'Ruta no encontrada.');
      const datos = await request.json().catch(() => ({}));
      const ctx = await crearContexto(request, env);
      return responder(await manejador(ctx, datos), 200, cors);
    } catch (error) {
      const esConocido = error instanceof ErrorApi;
      if (!esConocido) console.error(error);
      return responder(
        { error: esConocido ? error.message : 'Error interno del servidor.' },
        esConocido ? error.status : 500,
        cors
      );
    }
  }
};
