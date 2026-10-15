import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDiCyAqfjgkiIbQ6B8r1NzTsOg7m7J95Bg",
  authDomain: "app-ventas-comestibles.firebaseapp.com",
  projectId: "app-ventas-comestibles",
  storageBucket: "app-ventas-comestibles.firebasestorage.app",
  messagingSenderId: "494378094387",
  appId: "1:494378094387:web:bda03351ba826b711c3846",
  measurementId: "G-X84RLNDKFF"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Solo para pruebas locales: VITE_EMULADOR=1 npm run dev (usa los emuladores de Firebase, no los datos reales)
export const usandoEmulador = import.meta.env.DEV && import.meta.env.VITE_EMULADOR === '1';
if (usandoEmulador) {
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
