import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db, usandoEmulador } from './firebase'
import './index.css'
import EspacioNegocios from './Negocios.jsx'
import Login from './Login.jsx'
import Verificacion from './Verificacion.jsx'
import { cerrarSesion } from './servidor'
import { URL_PORTAL_CLIENTES } from './pedidosEnLinea'

const Cargando = () => (
  <div className="flex flex-col justify-center items-center gap-4 min-h-screen marca-cabecera border-0 shadow-none text-tinta font-sans">
    <img src="/marca/sello.svg" alt="Tazón para Dos" className="h-20 w-20 animate-bounce" />
    <p className="marca-eyebrow text-tinta">Verificando sesión...</p>
  </div>
);

// Una cuenta de cliente que entra al portal del negocio: se le indica su portal
const CuentaDeCliente = () => (
  <div className="flex justify-center items-center min-h-screen marca-cabecera border-0 shadow-none text-tinta font-sans p-4">
    <div className="w-full max-w-sm marca-tarjeta p-6 text-center space-y-4">
      <img src="/marca/logotipo-horizontal.svg" alt="Tazón para Dos" className="w-56 mx-auto" />
      <p className="text-sm">Esta es una cuenta de cliente. Los pedidos se hacen en el portal de clientes.</p>
      <a href={URL_PORTAL_CLIENTES} className="btn btn-primario w-full">Ir al portal de pedidos</a>
      <button onClick={cerrarSesion} className="btn btn-claro w-full">Cerrar sesión</button>
    </div>
  </div>
);

function Raiz() {
  // undefined = todavía verificando la sesión, null = sin sesión
  const [usuario, setUsuario] = useState(undefined);
  // La cuenta está habilitada para el equipo (admins/{uid}); si no, es de un cliente
  const [esEquipo, setEsEquipo] = useState(true);
  // La sesión de este dispositivo fue verificada (código o dispositivo de confianza)
  const [verificado, setVerificado] = useState(usandoEmulador);
  const alVencerSesion = useCallback(() => setVerificado(false), []);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    // Con el emulador no hay servidor de verificación: se omite el código
    setVerificado(usandoEmulador);
    let equipo = true;
    if (u) {
      try {
        equipo = (await getDoc(doc(db, 'admins', u.uid))).exists();
      } catch {
        // Sin conexión: se sigue como antes (la verificación decide)
      }
    }
    setEsEquipo(equipo);
    setUsuario(u);
  }), []);

  if (usuario === undefined) return <Cargando />;

  if (!usuario) return <Login />;

  if (!esEquipo) return <CuentaDeCliente />;

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
