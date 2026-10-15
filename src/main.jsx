import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, usandoEmulador } from './firebase'
import './index.css'
import App from './App.jsx'
import Login from './Login.jsx'
import Verificacion from './Verificacion.jsx'

function Raiz() {
  // undefined = todavía verificando la sesión, null = sin sesión
  const [usuario, setUsuario] = useState(undefined);
  // La sesión de este dispositivo fue verificada (código o dispositivo de confianza)
  const [verificado, setVerificado] = useState(usandoEmulador);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUsuario(u);
    // Con el emulador no hay servidor de verificación: se omite el código
    setVerificado(usandoEmulador);
  }), []);

  if (usuario === undefined) {
    return (
      <div className="flex flex-col justify-center items-center gap-4 min-h-screen marca-cabecera border-0 shadow-none text-tinta font-sans">
        <img src="/marca/sello.svg" alt="Tazón para Dos" className="h-20 w-20 animate-bounce" />
        <p className="marca-eyebrow text-tinta">Verificando sesión...</p>
      </div>
    );
  }

  if (!usuario) return <Login />;

  if (!verificado) {
    return <Verificacion key={usuario.uid} usuario={usuario} onVerificada={() => setVerificado(true)} />;
  }

  // key: al cambiar de usuario se reinicia App y sus listeners de Firestore
  return <App key={usuario.uid} usuario={usuario} onSesionVencida={() => setVerificado(false)} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
)
