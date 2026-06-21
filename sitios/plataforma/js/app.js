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

// 🕵️‍♂️ DETECTOR MULTI-TENANT DINÁMICO CON OVERRIDE DE SESIÓN
const subdominioDetectado = window.location.hostname.split('.')[0];
const BASE_TENANT_ID = (subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado;

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

                // 👑 VALIDACIÓN DE PRIVILEGIOS DE SUPER ADMINISTRADOR GLOBAL
                const esSuperAdminGlobal = (userRole === "SUPER_ADMIN");

                // 🪄 SWAPPER DINÁMICO DE WORKSPACE (EXCLUSIVO PARA CHECA)
                let workspaceActivo = BASE_TENANT_ID;
                const urlParams = new URLSearchParams(window.location.search);
                const queryTenant = urlParams.get('t') || urlParams.get('tenant');

                // Si eres Super Admin y especificas un tenant por URL (?t=aguayo), forzamos el cambio
                if (esSuperAdminGlobal && queryTenant) {
                    workspaceActivo = queryTenant.toLowerCase().trim();
                } else if (esSuperAdminGlobal && sessionStorage.getItem('SIGEV_ACTIVE_TENANT')) {
                    // Si ya habías entrado a un tenant antes, mantenemos tu sesión en esa pestaña
                    workspaceActivo = sessionStorage.getItem('SIGEV_ACTIVE_TENANT');
                }

                // Guardamos en la memoria de la sesión activa el tenant definitivo para que lo lean los otros JS
                sessionStorage.setItem('SIGEV_ACTIVE_TENANT', workspaceActivo);

                // FIJADO DE SEGURIDAD STANDARD: Bloquea accesos cruzados para usuarios comunes
                if (!esSuperAdminGlobal && userTenant !== workspaceActivo) {
                    mostrarAlertaSeguridadYSalir(`Tu cuenta no pertenece al Workspace territorial de SIGEV-${workspaceActivo.toUpperCase()}.`);
                    return;
                }

                // Bloqueo inmediato si la cuenta fue dada de baja por el ADMIN
                if (estadoCuenta === "Inactivo") {
                    mostrarAlertaSeguridadYSalir("Tu acceso a la plataforma ha sido revocado por el administrador.");
                    return;
                }

                // NUEVO MAPEO: Permite el ingreso a los roles corporativos del de la plataforma
                if (userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "GESTOR_TERRITORIAL" || userRole === "admin" || userRole === "mod") {
                    if (userAvatar && user.photoURL) userAvatar.src = user.photoURL;
                    if (userDisplayName) userDisplayName.innerText = user.displayName;
                    if (appWorkspace) appWorkspace.style.display = "flex";
                } else {
                    mostrarAlertaSeguridadYSalir("Tu cuenta requiere aprobación del administrador para acceder al Equipo Territorial.");
                }
            } else {
                mostrarAlertaSeguridadYSalir(`Tu correo electrónico no figura registrado en el sistema SIGEV-${workspaceActivo.toUpperCase()}.`);
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
        // Al salir limpiamos el pasaporte de desarrollo
        sessionStorage.removeItem('SIGEV_ACTIVE_TENANT');
        signOut(auth).then(() => {
            window.location.href = "index.html";
        }).catch((error) => console.error("Error al cerrar sesión:", error));
    }
};