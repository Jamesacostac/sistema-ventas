import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Store, LogOut, DatabaseZap } from 'lucide-react';
import { db } from './firebase';
import App from './App.jsx';
import { llamarServidor, cerrarSesion } from './servidor';
import { operacionAuditada } from './auditoria';
import { FormNuevoNegocio, ID_TAZON } from './negociosComun';

const claveActual = (uid) => `negocio_actual_${uid}`;
const leerActual = (uid) => { try { return localStorage.getItem(claveActual(uid)); } catch { return null; } };
const guardarActual = (uid, id) => { try { localStorage.setItem(claveActual(uid), id); } catch { /* sin almacenamiento */ } };

const Pantalla = ({ children }) => (
  <div className="flex justify-center items-center min-h-screen marca-cabecera border-0 shadow-none text-tinta font-sans p-4">
    <div className="w-full max-w-md marca-tarjeta p-6">{children}</div>
  </div>
);

const Cargando = ({ texto }) => (
  <div className="flex flex-col justify-center items-center gap-4 min-h-screen marca-cabecera border-0 shadow-none text-tinta font-sans">
    <img src="/marca/sello.svg" alt="" className="h-20 w-20 animate-bounce" />
    <p className="marca-eyebrow text-tinta">{texto}</p>
  </div>
);

// ---------- Copia de los datos antiguos (raíz) a Tazón para Dos ----------
const COLECCIONES = ['categorias', 'productos', 'clientes', 'caja_base', 'gastos', 'ventas'];
const SELLO = ['modificadoPor', 'modificadoPorNombre', 'modificadoEn', 'auditoriaId'];

function Migracion({ usuario, cuenta, negocioId, esTitularNegocio }) {
  const [progreso, setProgreso] = useState('');
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  const copiar = async () => {
    setError('');
    setTrabajando(true);
    try {
      const op = operacionAuditada(usuario, cuenta, 'Datos copiados de la versión anterior', '', negocioId);
      let total = 0;
      for (const nombre of COLECCIONES) {
        setProgreso(`Leyendo ${nombre}...`);
        const snap = await getDocs(collection(db, nombre));
        snap.forEach(d => {
          const datos = { ...d.data() };
          const firmaAnterior = datos.modificadoPorNombre ? { nombre: datos.modificadoPorNombre, fecha: datos.modificadoEn || null } : null;
          SELLO.forEach(c => delete datos[c]);
          op.crear(doc(db, 'negocios', negocioId, nombre, d.id), { ...datos, firmaAnterior, copiadoEn: serverTimestamp() });
          total++;
        });
      }
      const telegram = await getDoc(doc(db, 'config', 'telegram'));
      if (telegram.exists()) op.crear(doc(db, 'negocios', negocioId, 'config', 'telegram'), telegram.data());

      setProgreso(`Copiando ${total} registro(s)...`);
      await op.guardar();

      const fin = operacionAuditada(usuario, cuenta, 'Separación de negocios terminada', `${total} registro(s) copiados`, negocioId);
      fin.actualizar(doc(db, 'negocios', negocioId), { migrado: true });
      await fin.guardar();
    } catch (err) {
      setError('No se pudo terminar la copia: ' + err.message + '. Puedes intentarlo de nuevo; lo ya copiado se sobrescribe sin duplicarse.');
      setTrabajando(false);
    }
  };

  return (
    <Pantalla>
      <div className="text-center mb-4">
        <DatabaseZap size={32} className="mx-auto mb-2" />
        <h1 className="text-lg font-bold">Preparar Tazón para Dos</h1>
      </div>
      {esTitularNegocio ? (
        <div className="space-y-4 text-sm">
          <p>Vamos a <b>copiar los datos actuales</b> (productos, ventas, clientes, gastos, caja y Telegram) al espacio propio de <b>Tazón para Dos</b>, para que no se mezclen con otros negocios.</p>
          <p className="aviso aviso-info">Los datos originales <b>no se borran</b>: quedan como respaldo. Este paso se hace una sola vez.</p>
          {error && <p className="aviso aviso-error">{error}</p>}
          {trabajando && !error && <p className="aviso aviso-atencion">{progreso} No cierres esta ventana.</p>}
          <button onClick={copiar} disabled={trabajando && !error} className="btn btn-primario w-full">
            {trabajando && !error ? 'Copiando...' : 'Copiar datos y continuar'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-center">El titular está preparando este negocio. Vuelve a entrar en unos minutos.</p>
      )}
      <button onClick={cerrarSesion} className="w-full flex items-center justify-center gap-1.5 text-xs text-gris-calido hover:text-coral mt-5 pt-4 border-t border-linea-suave">
        <LogOut size={14} /> Cerrar sesión
      </button>
    </Pantalla>
  );
}

// ---------- Cuenta sin negocios ----------
function SinNegocios({ cuenta, alCrear }) {
  const [preparando, setPreparando] = useState(false);
  const [error, setError] = useState('');

  const prepararTazon = async () => {
    setPreparando(true);
    setError('');
    try {
      await llamarServidor('/negocios/preparar-tazon');
    } catch (err) {
      setError(err.message);
      setPreparando(false);
    }
  };

  return (
    <Pantalla>
      <div className="text-center mb-5">
        <Store size={32} className="mx-auto mb-2" />
        <h1 className="text-lg font-bold">Elige o crea un negocio</h1>
        <p className="text-xs text-gris-calido">Cada negocio tiene sus propias ventas, inventario, socios y finanzas.</p>
      </div>
      {cuenta?.rol === 'principal' && (
        <div className="mb-5 space-y-2">
          <button onClick={prepararTazon} disabled={preparando} className="btn btn-oscuro w-full">
            <DatabaseZap size={16} /> {preparando ? 'Preparando...' : 'Preparar Tazón para Dos (datos actuales)'}
          </button>
          {error && <p className="aviso aviso-error">{error}</p>}
          <hr className="separador" />
        </div>
      )}
      {cuenta?.rol !== 'principal' && (
        <p className="aviso aviso-info mb-4">Si trabajas en un negocio que ya existe, pídele al titular que te agregue en <b>Equipo → Socios</b>.</p>
      )}
      <FormNuevoNegocio onCreado={alCrear} />
      <button onClick={cerrarSesion} className="w-full flex items-center justify-center gap-1.5 text-xs text-gris-calido hover:text-coral mt-5 pt-4 border-t border-linea-suave">
        <LogOut size={14} /> Cerrar sesión
      </button>
    </Pantalla>
  );
}

// ---------- Espacio de trabajo: elige el negocio y muestra la app ----------
export default function EspacioNegocios({ usuario, onSesionVencida }) {
  const [cuenta, setCuenta] = useState(undefined);
  const [datosNegocios, setDatosNegocios] = useState({});
  const [miembrosPropios, setMiembrosPropios] = useState({});
  const [actual, setActual] = useState(() => leerActual(usuario.uid));

  useEffect(() => onSnapshot(
    doc(db, 'admins', usuario.uid),
    (s) => setCuenta(s.exists() ? s.data() : null),
    () => onSesionVencida()
  ), [usuario.uid, onSesionVencida]);

  const ids = useMemo(() => (Array.isArray(cuenta?.negocios) ? cuenta.negocios : []), [cuenta]);
  const clave = ids.join('|');

  // Datos de cada negocio y el rol propio en cada uno
  useEffect(() => {
    const cancelar = ids.flatMap(id => [
      onSnapshot(doc(db, 'negocios', id),
        (s) => setDatosNegocios(d => ({ ...d, [id]: s.exists() ? { id, ...s.data() } : null })),
        (e) => { if (e.code === 'permission-denied') onSesionVencida(); }),
      onSnapshot(doc(db, 'negocios', id, 'miembros', usuario.uid),
        (s) => setMiembrosPropios(m => ({ ...m, [id]: s.exists() ? s.data() : null })),
        () => {})
    ]);
    return () => cancelar.forEach(f => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, usuario.uid]);

  const cambiarNegocio = (id) => {
    guardarActual(usuario.uid, id);
    setActual(id);
    window.scrollTo({ top: 0 });
  };

  if (cuenta === undefined) return <Cargando texto="Cargando tu cuenta..." />;
  if (ids.length === 0) return <SinNegocios cuenta={cuenta} alCrear={cambiarNegocio} />;

  const negocioId = ids.includes(actual) ? actual : (ids.includes(ID_TAZON) ? ID_TAZON : ids[0]);
  const negocio = datosNegocios[negocioId];
  if (!negocio) return <Cargando texto="Abriendo el negocio..." />;

  if (negocio.migrado === false) {
    return <Migracion usuario={usuario} cuenta={cuenta} negocioId={negocioId} esTitularNegocio={miembrosPropios[negocioId]?.rol === 'titular'} />;
  }

  const negocios = ids.map(id => ({ ...(datosNegocios[id] || { id, nombre: '…' }), rolPropio: miembrosPropios[id]?.rol }));

  return (
    <App
      key={negocioId}
      usuario={usuario}
      onSesionVencida={onSesionVencida}
      negocioId={negocioId}
      negocio={negocio}
      negocios={negocios}
      cambiarNegocio={cambiarNegocio}
    />
  );
}
