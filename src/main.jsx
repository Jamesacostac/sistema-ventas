import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import './index.css'
import App from './App.jsx'
import Login from './Login.jsx'
import Verificacion from './Verificacion.jsx'

function Raiz() {
  // undefined = todavía verificando la sesión, null = sin sesión
  const [usuario, setUsuario] = useState(undefined);
  // La sesión de este dispositivo fue verificada (código o dispositivo de confianza)
  const [verificado, setVerificado] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUsuario(u);
    setVerificado(false);
  }), []);

  if (usuario === undefined) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-50 text-slate-600 font-sans">
        <p className="font-semibold text-lg">Verificando sesión...</p>
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
