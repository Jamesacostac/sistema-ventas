import { StrictMode, lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db, usandoEmulador } from './firebase'
import './index.css'
import EspacioNegocios from './Negocios.jsx'
import Login from './Login.jsx'
import Verificacion from './Verificacion.jsx'
// La parte de clientes se carga solo cuando entra un cliente
const ClienteLogin = lazy(() => import('./ClienteLogin.jsx'))
const ClienteApp = lazy(() => import('./ClienteApp.jsx'))

const Cargando = ({ texto }) => (
  <div className="flex flex-col justify-center items-center gap-4 min-h-screen marca-cabecera border-0 shadow-none text-tinta font-sans">
    <img src="/marca/sello.svg" alt="Tazón para Dos" className="h-20 w-20 animate-bounce" />
    <p className="marca-eyebrow text-tinta">{texto}</p>
  </div>
);

// El enlace con ?cliente abre directo la entrada de clientes (para compartir o en un QR)
const enlaceDeCliente = () => {
  try { return new URLSearchParams(window.location.search).has('cliente'); } catch { return false; }
};

function Raiz() {
  // undefined = todavía verificando la sesión, null = sin sesión
  const [usuario, setUsuario] = useState(undefined);
  // 'equipo' (cuenta habilitada en admins/) o 'cliente' (invitado o cuenta de cliente)
  const [tipo, setTipo] = useState(null);
  const [modoCliente, setModoCliente] = useState(enlaceDeCliente);
  // La sesión de este dispositivo fue verificada (código o dispositivo de confianza)
  const [verificado, setVerificado] = useState(usandoEmulador);
  const alVencerSesion = useCallback(() => setVerificado(false), []);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    // Con el emulador no hay servidor de verificación: se omite el código
    setVerificado(usandoEmulador);
    if (!u) {
      setTipo(null);
      setUsuario(null);
      return;
    }
    if (u.isAnonymous) {
      setTipo('cliente');
      setUsuario(u);
      return;
    }
    // Solo las cuentas habilitadas por el servidor (admins/{uid}) son del equipo del negocio
    let esEquipo = true;
    try {
      esEquipo = (await getDoc(doc(db, 'admins', u.uid))).exists();
    } catch {
      // Sin conexión: se sigue como antes (la verificación decide)
    }
    setTipo(esEquipo ? 'equipo' : 'cliente');
    setUsuario(u);
  }), []);

  if (usuario === undefined) return <Cargando texto="Verificando sesión..." />;

  if (!usuario) {
    return modoCliente
      ? <Suspense fallback={<Cargando texto="Cargando..." />}><ClienteLogin onVolver={() => setModoCliente(false)} /></Suspense>
      : <Login onCliente={() => setModoCliente(true)} />;
  }

  if (tipo === 'cliente') {
    return <Suspense fallback={<Cargando texto="Cargando la carta..." />}><ClienteApp key={usuario.uid} usuario={usuario} /></Suspense>;
  }

  if (!verificado) {
    return <Verificacion key={usuario.uid} usuario={usuario} onVerificada={() => setVerificado(true)} />;
  }

  // key: al cambiar de usuario se reinicia todo y sus listeners de Firestore
  return <EspacioNegocios key={usuario.uid} usuario={usuario} onSesionVencida={alVencerSesion} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
)
