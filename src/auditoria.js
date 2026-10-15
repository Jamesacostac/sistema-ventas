import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

// Permisos (rangos de edición) de los socios. El titular (rol "principal") los tiene todos.
export const PERMISOS = [
  { clave: 'ventas', etiqueta: 'Registrar ventas', detalle: 'Usar el carrito, vender y fiar' },
  { clave: 'ventas_editar', etiqueta: 'Editar y eliminar ventas', detalle: 'Borrar ventas y cambiar su estado de pago' },
  { clave: 'clientes', etiqueta: 'Clientes y cobros', detalle: 'Registrar clientes, cobrar fiados, fusionar' },
  { clave: 'inventario', etiqueta: 'Inventario y categorías', detalle: 'Productos, precios, lotes y categorías' },
  { clave: 'finanzas', etiqueta: 'Gastos y caja', detalle: 'Gastos, proveedores y efectivo base' },
  { clave: 'socios', etiqueta: 'Gestionar socios y rangos', detalle: 'Solo el titular puede otorgar este permiso' }
];

export const RANGOS = [
  { nombre: 'Solo lectura', permisos: [] },
  { nombre: 'Vendedor', permisos: ['ventas', 'clientes'] },
  { nombre: 'Editor', permisos: ['ventas', 'ventas_editar', 'clientes', 'inventario', 'finanzas'] },
  { nombre: 'Administrador', permisos: ['ventas', 'ventas_editar', 'clientes', 'inventario', 'finanzas', 'socios'] }
];

export const tienePermiso = (perfil, permiso) =>
  perfil?.rol === 'principal' || perfil?.permisos?.[permiso] === true;

export const nombreRango = (perfil) => {
  if (perfil?.rol === 'principal') return 'Titular';
  const activos = PERMISOS.filter(p => perfil?.permisos?.[p.clave]).map(p => p.clave).sort().join(',');
  const rango = RANGOS.find(r => [...r.permisos].sort().join(',') === activos);
  return rango ? rango.nombre : 'Personalizado';
};

// Firestore admite máximo 500 escrituras por lote y las reglas limitan las consultas,
// por eso las eliminaciones (cada una con su propio registro) se agrupan de a pocas.
const MAX_ELIMINACIONES_POR_LOTE = 8;

const SELLO = ['modificadoPor', 'modificadoPorNombre', 'modificadoEn', 'auditoriaId'];

// Copia segura para guardar en el historial (sin el sello ni valores no serializables)
const limpiar = (datos) => {
  if (!datos) return null;
  const copia = { ...datos };
  delete copia.id;
  SELLO.forEach(c => delete copia[c]);
  return JSON.parse(JSON.stringify(copia, (_k, v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v)));
};

/**
 * Operación auditada: agrupa cambios en un writeBatch y registra quién y cuándo.
 * Las reglas de Firestore rechazan cualquier cambio que no venga con su registro.
 *
 *   const op = operacionAuditada(usuario, perfil, 'Venta registrada', 'Cliente Ana — $5.000');
 *   op.crear(doc(collection(db, 'ventas')), datos);
 *   op.actualizar(doc(db, 'productos', id), cambios, productoAntes);
 *   op.eliminar(doc(db, 'gastos', id), gastoAntes);
 *   await op.guardar();
 */
export const operacionAuditada = (usuario, perfil, accion, detalle = '') => {
  const nombre = perfil?.nombre || '';
  const refRegistro = doc(collection(db, 'auditoria'));
  const sello = {
    modificadoPor: usuario.uid,
    modificadoPorNombre: nombre,
    modificadoEn: serverTimestamp(),
    auditoriaId: refRegistro.id
  };
  const cambios = [];
  const eliminaciones = [];

  return {
    crear(ref, datos) {
      cambios.push({ ref, tipo: 'crear', datos: { ...datos, ...sello }, antes: null });
      return ref;
    },
    actualizar(ref, datos, antes = null) {
      cambios.push({ ref, tipo: 'editar', datos: { ...datos, ...sello }, antes });
    },
    eliminar(ref, antes = null) {
      eliminaciones.push({ ref, antes });
    },
    get vacia() {
      return cambios.length === 0 && eliminaciones.length === 0;
    },
    async guardar() {
      const registroBase = { uid: usuario.uid, nombre, accion, detalle };

      // 1. Creaciones y modificaciones: todas en un lote con un solo registro
      if (cambios.length > 0) {
        for (let i = 0; i < cambios.length; i += 400) {
          const batch = writeBatch(db);
          const grupo = cambios.slice(i, i + 400);
          const ref = i === 0 ? refRegistro : doc(collection(db, 'auditoria'));
          grupo.forEach(c => {
            const datos = i === 0 ? c.datos : { ...c.datos, auditoriaId: ref.id };
            if (c.tipo === 'crear') batch.set(c.ref, datos);
            else batch.update(c.ref, datos);
          });
          batch.set(ref, {
            ...registroBase,
            cambios: grupo.map(c => ({ ruta: c.ref.path, tipo: c.tipo, antes: limpiar(c.antes), despues: limpiar(c.datos) })),
            fecha: serverTimestamp()
          });
          await batch.commit();
        }
      }

      // 2. Eliminaciones: cada documento borrado deja su propio registro
      for (let i = 0; i < eliminaciones.length; i += MAX_ELIMINACIONES_POR_LOTE) {
        const batch = writeBatch(db);
        eliminaciones.slice(i, i + MAX_ELIMINACIONES_POR_LOTE).forEach(({ ref, antes }) => {
          batch.delete(ref);
          batch.set(doc(db, 'auditoria', `eliminar_${ref.parent.id}_${ref.id}`), {
            ...registroBase,
            cambios: [{ ruta: ref.path, tipo: 'eliminar', antes: limpiar(antes), despues: null }],
            fecha: serverTimestamp()
          });
        });
        await batch.commit();
      }
    }
  };
};
