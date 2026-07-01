// ============================================================================
// GUARDIÁN DE SEGURIDAD GENERAL (RBAC, Multi-Tenant, Inactividad y 2FA)
// ============================================================================
import { auth, db } from "./app.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 🕵️‍♂️ DETECTOR MULTI-TENANT DINÁMICO (Identificación de Municipio por Subdominio)
const subdominioDetectado = window.location.hostname.split('.')[0];
const BASE_TENANT_ID = (subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado;

// Bandera global para desactivar el límite de inactividad en SuperAdmins
let esCuentaSuperAdmin = false;

// ==========================================================================
// 🛡️ BLINDAJE ANTI-DESTELLO (FOUC) PARA MENÚS RESTRINGIDOS
// ==========================================================================
// Oculta los elementos visuales críticos con CSS puro antes de que el motor
// de renderizado del navegador termine de pintar la interfaz gráfica.
const styleSeguridad = document.createElement('style');
styleSeguridad.innerHTML = `
    li[data-page="configuracion.html"], 
    li[data-page="usuarios.html"],
    li[data-page="reportes.html"],
    li[data-page="mapa.html"],
    li[data-page="auditoria.html"] { 
        display: none !important; 
    }
    
    /* Reglas para destapar menús respetando el ancho completo (block) */
    body.is-superadmin li[data-page="configuracion.html"],
    body.is-superadmin li[data-page="usuarios.html"],
    body.is-superadmin li[data-page="reportes.html"],
    body.is-superadmin li[data-page="mapa.html"],
    body.is-superadmin li[data-page="auditoria.html"] {
        display: block !important; 
    }
    
    body.is-admin li[data-page="usuarios.html"],
    body.is-admin li[data-page="reportes.html"],
    body.is-admin li[data-page="mapa.html"] {
        display: block !important; 
    }
`;
document.head.appendChild(styleSeguridad);

// ============================================================================
// ⏱️ SISTEMA DE SEGURIDAD: CIERRE DE SESIÓN POR INACTIVIDAD (10 MINUTOS)
// ============================================================================
const TIEMPO_MAXIMO_INACTIVIDAD = 10 * 60 * 1000; // 10 minutos exactos
let tiempoUltimaActividad = Date.now();

function actualizarTiempoInactividad() {
    tiempoUltimaActividad = Date.now();
}

// Sensores de presencia humana en la pestaña del sistema
window.addEventListener('mousemove', actualizarTiempoInactividad, { passive: true });
window.addEventListener('keypress', actualizarTiempoInactividad, { passive: true });
window.addEventListener('click', actualizarTiempoInactividad, { passive: true });
window.addEventListener('scroll', actualizarTiempoInactividad, { passive: true });
window.addEventListener('touchstart', actualizarTiempoInactividad, { passive: true });

// Reloj detector: revisa cada 10 segundos el estado del funcionario
setInterval(() => {
    // Si la sesión existe Y NO ES UN SUPER ADMIN, se aplica el filtro
    if (auth.currentUser && !esCuentaSuperAdmin) {
        const tiempoInactivo = Date.now() - tiempoUltimaActividad;
        if (tiempoInactivo >= TIEMPO_MAXIMO_INACTIVIDAD) {
            console.log("⏱️ Seguridad: Inactividad detectada (10 min). Destruyendo sesión activa...");
            
            signOut(auth).then(() => {
                // Limpieza absoluta de credenciales locales en la pestaña
                sessionStorage.removeItem("SIGEV_ACTIVE_TENANT");
                sessionStorage.removeItem("sigev_2fa_autenticado");
                window.location.href = "index.html"; 
            }).catch(err => console.error("Error en cierre forzado por inactividad:", err));
        }
    }
}, 10000);

// ==========================================================================
// 🛑 FUNCIONES DE EXPULSIÓN DE SEGURIDAD (Diseño UI de Intercepción Amable)
// ==========================================================================
function mostrarAlertaSeguridadYSalir(mensaje) {
    const overlay = document.createElement("div");
    overlay.className = "custom-alert-overlay";
    overlay.innerHTML = `
        <div class="custom-alert-card" style="max-width: 400px; padding: 32px;">
            <div class="custom-alert-icon info" style="background:#fffbeb; color:#d97706; border-radius:50%; width:56px; height:56px; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
            </div>
            <div class="custom-alert-title" style="text-align:center; font-size:18px; font-weight:800; color:#0f172a; margin-bottom:12px;">Verificación de Acceso</div>
            <div class="custom-alert-message" style="text-align:center; font-size:14px; color:#475569; margin-bottom: 24px; line-height: 1.5;">${mensaje}</div>
            <button class="btn-alert-confirm" style="width:100%; background-color:#0b438c; color:white; border:none; border-radius:8px; padding:12px; font-size:14px; font-weight:bold; cursor:pointer; box-shadow: 0 4px 6px -1px rgba(11, 67, 140, 0.2);">Entendido, regresar al inicio</button>
        </div>
    `;
    document.body.appendChild(overlay);
    const btnRegresar = overlay.querySelector(".btn-alert-confirm");
    
    btnRegresar.addEventListener("mouseover", () => btnRegresar.style.backgroundColor = "#08336e");
    btnRegresar.addEventListener("mouseout", () => btnRegresar.style.backgroundColor = "#0b438c");
    
    btnRegresar.addEventListener("click", async () => {
        overlay.remove();
        sessionStorage.removeItem("SIGEV_ACTIVE_TENANT");
        sessionStorage.removeItem("sigev_2fa_autenticado");
        await signOut(auth);
        window.location.href = "index.html";
    });
}

// ==========================================================================
// 🛡️ ADUANA PRINCIPAL: CONTROL ADUANERO DE IDENTIDAD (AUTORIZADOR MAESTRO)
// ==========================================================================
onAuthStateChanged(auth, async (user) => {
    const appWorkspace = document.getElementById("app-workspace");
    const userAvatar = document.getElementById("user-avatar");
    const userDisplayName = document.getElementById("user-display-name");
    const userDisplayRole = document.getElementById("user-display-role");

    if (user) {
        try {
            // Lectura Server-Side del perfil operativo en Firestore PRIMERO
            // Esto es vital para saber si es un SuperAdmin y hacerle bypass al 2FA
            const userRef = doc(db, "usuarios", user.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const userData = userSnap.data();
                const userRole = (userData.rol || "").toUpperCase().trim();
                const estadoCuenta = userData.estado || "Activo";
                const userTenant = userData.tenantId;

                // 1. EVALUAR PERMISOS POR ROLES (RBAC)
                const esSuperAdminGlobal = (userRole === "SUPER_ADMIN" || userRole === "SUPERADMIN");
                const esAdmin = (userRole === "ADMIN" || userRole === "CONCEJAL");
                const esGestor = (userRole === "GESTOR_TERRITORIAL" || userRole === "SECRETARIA" || userRole === "MOD");

                // 🛑 BLOQUEO INMEDIATO: Si no tiene rol válido o está inactivo, no entra y NO SE LE PIDE 2FA
                if (!esSuperAdminGlobal && !esAdmin && !esGestor) {
                    mostrarAlertaSeguridadYSalir("Aún no cuentas con los permisos operativos para ingresar a este panel. Comunícate con el administrador.");
                    return;
                }

                if (estadoCuenta === "Inactivo" || estadoCuenta === "Suspendido") {
                    mostrarAlertaSeguridadYSalir("Tu acceso a la plataforma municipal se encuentra pausado temporalmente.");
                    return;
                }

                // 🚨 ------------------------------------------------------------------
                // REGLA DE ORO 2FA: Verificamos el pasaporte SOLO si no es SuperAdmin.
                // ---------------------------------------------------------------------
                esCuentaSuperAdmin = esSuperAdminGlobal; // Esta variable apaga el reloj de inactividad
                
                if (!esSuperAdminGlobal && sessionStorage.getItem("sigev_2fa_autenticado") !== "true") {
                    console.warn("🚫 Aduana SIGEV: Usuario autenticado pero sin 2FA. Desviando a verificación.");
                    window.location.href = "verificar.html";
                    return; // Bloquea la ejecución completa
                }

                // 2. APLICAR CLASES CSS AL BODY PARA DESBLOQUEAR HERRAMIENTAS VISUALES
                if (esSuperAdminGlobal) {
                    document.body.classList.add('is-superadmin');
                } else if (esAdmin) {
                    document.body.classList.add('is-admin');
                }

                // 3. CONTROL MULTI-TENANT ESTRICTO (Aislamiento de Jurisdicción)
                let workspaceActivo = BASE_TENANT_ID;
                const urlParams = new URLSearchParams(window.location.search);
                const queryTenant = urlParams.get('t') || urlParams.get('tenant');

                if (esSuperAdminGlobal && queryTenant) {
                    workspaceActivo = queryTenant.toLowerCase().trim();
                } else if (esSuperAdminGlobal && sessionStorage.getItem('SIGEV_ACTIVE_TENANT')) {
                    workspaceActivo = sessionStorage.getItem('SIGEV_ACTIVE_TENANT');
                }

                sessionStorage.setItem('SIGEV_ACTIVE_TENANT', workspaceActivo);

                // Expulsión si un funcionario intenta meterse a la base de datos de otra municipalidad
                if (!esSuperAdminGlobal && userTenant !== workspaceActivo) {
                    mostrarAlertaSeguridadYSalir(`Tu cuenta institucional no está vinculada al entorno territorial de: <b>SIGEV-${workspaceActivo.toUpperCase()}</b>.`);
                    return;
                }

                // 4. DAR ACCESO DEFINITIVO E INYECTAR PERFIL DEL FUNCIONARIO EN LA UI
                if (userAvatar && user.photoURL) userAvatar.src = user.photoURL;
                
                let iconoRol = "⭐";
                let nombreRol = "Gestor Territorial";
                if (esSuperAdminGlobal) { iconoRol = "🎩"; nombreRol = "Super Administrador"; }
                else if (esAdmin) { iconoRol = "👑"; nombreRol = "Administrador"; }

                if (userDisplayName) userDisplayName.innerText = `${iconoRol} ${userData.nombre || user.displayName}`;
                if (userDisplayRole) userDisplayRole.innerText = userData.rolVisual || nombreRol;
                
                // Mostrar todo el panel de trabajo ya limpio
                if (appWorkspace) appWorkspace.style.display = "flex";
            } else {
                mostrarAlertaSeguridadYSalir(`El correo <b>${user.email}</b> no figura en la base de datos operativa de SIGEV. Comunícate con tu jefatura.`);
            }
        } catch (error) {
            console.error("Error crítico en el motor del guardián de acceso:", error);
            window.location.href = "index.html";
        }
    } else {
        // Si no hay sesión de Firebase activa, rebote directo al login
        const path = window.location.pathname;
        if (!path.includes("index.html") && !path.endsWith("/")) {
            window.location.href = "index.html";
        }
    }
});

// ==========================================================================
// 🚪 FUNCIÓN DE SALIDA MANUAL CONTROLADA (Exportada al Scope Global)
// ==========================================================================
window.logoutSystem = function() {
    if (confirm("¿Estás seguro de que deseas cerrar sesión de la plataforma municipal?")) {
        // Limpieza estricta de tokens antes de redirigir
        sessionStorage.removeItem('SIGEV_ACTIVE_TENANT');
        sessionStorage.removeItem('sigev_2fa_autenticado');
        
        signOut(auth).then(() => {
            window.location.href = "index.html";
        }).catch((error) => console.error("Error al procesar el cierre de sesión:", error));
    }
};