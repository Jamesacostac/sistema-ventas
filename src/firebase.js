import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { firebaseConfig } from "./firebaseConfig";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Solo para pruebas locales: VITE_EMULADOR=1 npm run dev (usa los emuladores de Firebase, no los datos reales)
export const usandoEmulador = import.meta.env.DEV && import.meta.env.VITE_EMULADOR === '1';
if (usandoEmulador) {
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
