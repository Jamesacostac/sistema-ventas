import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import './index.css'
import App from './App.jsx'
import Login from './Login.jsx'

function Raiz() {
  // undefined = todavía verificando la sesión, null = sin sesión
  const [usuario, setUsuario] = useState(undefined);

  useEffect(() => onAuthStateChanged(auth, setUsuario), []);

  if (usuario === undefined) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-50 text-slate-600 font-sans">
        <p className="font-semibold text-lg">Verificando sesión...</p>
      </div>
    );
  }

  // key: al cambiar de usuario se reinicia App y sus listeners de Firestore
  return usuario ? <App key={usuario.uid} usuario={usuario} /> : <Login />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
)
