import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDicYAqfjgkiBQ6B8r1NzTs0g7m7J95Bg",
  authDomain: "app-ventas-comestibles.firebaseapp.com",
  projectId: "app-ventas-comestibles",
  storageBucket: "app-ventas-comestibles.firebasestorage.app",
  messagingSenderId: "494378094387",
  appId: "1:494378094387:web:bda03351ba826b711c3846",
  measurementId: "G-X84RLNDKFF"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);