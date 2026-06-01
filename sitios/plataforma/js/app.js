// Importar funciones de autenticación y base de datos
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuración de tu proyecto Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBquqkfUkYizO3w6V_9D2Ath2afYV56cV0",
    authDomain: "sigev-aguayo.firebaseapp.com",
    projectId: "sigev-aguayo",
    storageBucket: "sigev-aguayo.firebasestorage.app",
    messagingSenderId: "21666588211",
    appId: "1:21666588211:web:ff3f55d5484fe811b9e546",
    measurementId: "G-3QTQ0RQD98"
};

// Inicializar Firebase y exportarlos para el uso de los demás módulos
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// 🕵️‍♂️ DETECTOR MULTI-TENANT DINÁMICO PARA EL GUARDIÁN GLOBAL
// Si estás localmente en localhost o 127.0.0.1 validará el entorno de "paz". En producción leerá la URL.
const subdominioDetectado = window.location.hostname.split('.')[0];
const TARGET_TENANT_ID = (subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado;

// --- FUNCIÓN EXCLUSIVA PARA MOSTRAR ALERTAS DE SEGURIDAD PREMIUM ---
function mostrarAlertaSeguridadYSalir(mensaje) {
    const overlay = document.createElement("div");
    overlay.className = "custom-alert-overlay";

    overlay.innerHTML = `
        <div class="custom-alert-card" style="max-width: 380px;">
            <div class="custom-alert-icon error">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </div>
            <div class="custom-alert-title">Acceso Restringido</div>
            <div class="custom-alert-message" style="margin-bottom: 20px;">${mensaje}</div>
            <button class="btn-alert-confirm" style="background-color: #ef4444;">Regresar al Inicio</button>
        </div>
    `;

    document.body.appendChild(overlay);

    const btnRegresar = overlay.querySelector(".btn-alert-confirm");
    if (btnRegresar) btnRegresar.focus();

    btnRegresar.addEventListener("click", async () => {
        overlay.remove();
        await signOut(auth);
        window.location.href = "index.html";
    });
}

// ==========================================================================
// GUARDIÁN DE SEGURIDAD GENERAL (VALIDACIÓN DE ROLES Y AISLAMIENTO DE TENANT)
// ==========================================================================
onAuthStateChanged(auth, async (user) => {
    const appWorkspace = document.getElementById("app-workspace");
    const userAvatar = document.getElementById("user-avatar");
    const userDisplayName = document.getElementById("user-display-name");

    if (user) {
        try {
            const userRef = doc(db, "usuarios", user.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const userData = userSnap.data();
                const userRole = userData.rol;
                const estadoCuenta = userData.estado || "Activo";
                const userTenant = userData.tenantId;

                // FIJADO DE SEGURIDAD: Bloquea accesos cruzados de funcionarios de otros municipios
                if (userTenant !== TARGET_TENANT_ID) {
                    mostrarAlertaSeguridadYSalir(`Tu cuenta no pertenece al Workspace territorial de SIGEV-${TARGET_TENANT_ID.toUpperCase()}.`);
                    return;
                }

                // Bloqueo inmediato si la cuenta fue dada de baja por el ADMIN
                if (estadoCuenta === "Inactivo") {
                    mostrarAlertaSeguridadYSalir("Tu acceso a la plataforma ha sido revocado por el administrador.");
                    return;
                }

                // NUEVO MAPEO: Permite el ingreso a los 3 roles corporativos del ecosistema
                if (userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "GESTOR_TERRITORIAL" || userRole === "admin" || userRole === "mod") {
                    if (userAvatar && user.photoURL) userAvatar.src = user.photoURL;
                    if (userDisplayName) userDisplayName.innerText = user.displayName;
                    if (appWorkspace) appWorkspace.style.display = "flex";
                } else {
                    mostrarAlertaSeguridadYSalir("Tu cuenta requiere aprobación del administrador para acceder al Equipo Territorial.");
                }
            } else {
                mostrarAlertaSeguridadYSalir(`Tu correo electrónico no figura registrado en el sistema SIGEV-${TARGET_TENANT_ID.toUpperCase()}.`);
            }
        } catch (error) {
            console.error("Error en el guardián de acceso:", error);
            window.location.href = "index.html";
        }
    } else {
        window.location.href = "index.html";
    }
});

window.logoutSystem = function() {
    if (confirm("¿Estás seguro de que deseas cerrar sesión?")) {
        signOut(auth).then(() => {
            window.location.href = "index.html";
        }).catch((error) => console.error("Error al cerrar sesión:", error));
    }
};