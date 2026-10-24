import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { firebaseConfig } from "./firebaseConfig";

// Portal de clientes: instancia aparte ("clientes") para que su sesión no se mezcle
// con la del equipo del negocio, aunque se abran en el mismo navegador.
const app = initializeApp(firebaseConfig, 'clientes');
export const db = getFirestore(app);
export const auth = getAuth(app);

if (import.meta.env.DEV && import.meta.env.VITE_EMULADOR === '1') {
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
