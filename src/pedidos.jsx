import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebaseClientes'
import './index.css'
import ClienteLogin from './ClienteLogin.jsx'
import ClienteApp from './ClienteApp.jsx'

// Portal de clientes (tazon-pedidos.web.app): carta, carrito, pedidos y facturas.
// Va aparte del portal del negocio para que las sesiones no se mezclen.
function Portal() {
  // undefined = todavía verificando la sesión, null = sin sesión
  const [usuario, setUsuario] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, setUsuario), []);

  if (usuario === undefined) {
    return (
      <div className="flex flex-col justify-center items-center gap-4 min-h-screen marca-cabecera border-0 shadow-none text-tinta font-sans">
        <img src="/marca/sello.svg" alt="Tazón para Dos" className="h-20 w-20 animate-bounce" />
        <p className="marca-eyebrow text-tinta">Cargando...</p>
      </div>
    );
  }
  if (!usuario) return <ClienteLogin />;
  return <ClienteApp key={usuario.uid} usuario={usuario} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Portal />
  </StrictMode>,
)
