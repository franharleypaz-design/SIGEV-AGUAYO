// ============================================================================
// MOTOR CENTRAL DE FIREBASE (Inicialización pura)
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";

// Credenciales reales de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBquqkfUkYizO3w6V_9D2Ath2afYV56cV0",
    authDomain: "sigev-aguayo.firebaseapp.com",
    projectId: "sigev-aguayo",
    storageBucket: "sigev-aguayo.firebasestorage.app",
    messagingSenderId: "21666588211",
    appId: "1:21666588211:web:ff3f55d5484fe811b9e546",
    measurementId: "G-3QTQ0RQD98"
};

// Inicializar herramientas de Firebase y EXPORTARLAS
export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// TRUCO MAESTRO DE RED: Forzamos Long-Polling para evitar que firewalls locales corten la conexión NoSQL
export const db = initializeFirestore(app, {
    experimentalForceLongPolling: true
});