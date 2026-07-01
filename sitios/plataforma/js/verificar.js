// ============================================================================
// GUARDIÁN DEL SEGUNDO FACTOR DE AUTENTICACIÓN (2FA) - VERSIÓN PRODUCCIÓN
// ============================================================================
import { auth, db } from "./app.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Elementos de la Interfaz del verificar.html
const form2FA = document.getElementById("form-2fa");
const inputCodigo = document.getElementById("input-codigo");
const btnVerificar = document.getElementById("btn-verificar");
const btnReenviar = document.getElementById("btn-reenviar");

let usuarioLogueado = null;

// 🛡️ CONTROL DE ACCESO: Validar que el usuario tenga una sesión activa de Firebase
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        console.warn("⚠️ Acceso denegado: No hay una sesión activa. Redirigiendo al Login.");
        window.location.href = "index.html";
        return;
    }

    usuarioLogueado = user;

    // Si por alguna razón el usuario ya pasó el 2FA y recarga la página, lo mandamos al Dashboard
    if (sessionStorage.getItem("sigev_2fa_autenticado") === "true") {
        window.location.href = "dashboard.html";
        return;
    }

    // Si es su primera entrada en esta sesión de pestaña, generamos y enviamos el código inmediatamente
    if (!sessionStorage.getItem("sigev_2fa_token")) {
        await generarYEnviarCodigo();
    }
});

// ============================================================================
// 📨 MOTOR GENERADOR Y ENVÍO DE TOKEN (2FA) - PLANTILLA CORPORATIVA GLOBAL
// ============================================================================
async function generarYEnviarCodigo() {
    try {
        btnReenviar.disabled = true;
        btnReenviar.innerText = "Enviando código...";

        // 1. Generar un número aleatorio de 6 dígitos (100000 - 999999)
        const codigoAleatorio = Math.floor(100000 + Math.random() * 900000).toString();
        
        // 2. Guardar el código en la SessionStorage del navegador del usuario
        sessionStorage.setItem("sigev_2fa_token", codigoAleatorio);

        // 3. Crear el documento en la colección 'mail' para activar la extensión de Firebase
        await addDoc(collection(db, "mail"), {
            to: usuarioLogueado.email,
            message: {
                subject: "🔒 Código de Seguridad SIGEV",
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e3e8ee; border-radius: 12px; background-color: #ffffff;">
                        
                        <div style="text-align: center; margin-bottom: 24px;">
                            <img src="https://sigev.cl/img/Logo_Letra.png" alt="SIGEV" style="height: 48px; width: auto; object-fit: contain;">
                        </div>

                        <h2 style="color: #0b438c; text-align: center; margin-top: 0; font-size: 22px; font-weight: 800;">Verificación de Identidad</h2>
                        
                        <p style="color: #475569; font-size: 15px; line-height: 1.5; margin-top: 16px;">Hola,</p>
                        <p style="color: #475569; font-size: 15px; line-height: 1.5;">Has iniciado sesión en la plataforma de gestión. Para continuar con el proceso de autenticación, ingresa el siguiente código de seguridad en tu pantalla:</p>
                        
                        <div style="background-color: #f8fafc; padding: 18px; text-align: center; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
                            <span style="font-size: 34px; font-weight: 800; letter-spacing: 6px; color: #0f172a;">${codigoAleatorio}</span>
                        </div>
                        
                        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;">

                        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0; line-height: 1.6;">
                            Este código es de un solo uso y vencerá al cerrar la pestaña actual.<br>
                            Si no solicitaste este acceso o necesitas asistencia técnica, por favor contáctanos de inmediato en 
                            <a href="mailto:soporte@sigev.cl" style="color: #0b438c; text-decoration: none; font-weight: 700;">soporte@sigev.cl</a>.
                        </p>
                    </div>
                `
            }
        });

        console.log("🚀 Éxito: Orden de correo inyectada en Firestore.");
        mostrarMensaje(`Código enviado con éxito a: ${usuarioLogueado.email}`, "success");
        
        // Cooldown de 30 segundos para evitar abusos del botón de reenvío
        let countdown = 30;
        const interval = setInterval(() => {
            countdown--;
            btnReenviar.innerText = `Solicitar otro código en (${countdown}s)`;
            if (countdown <= 0) {
                clearInterval(interval);
                btnReenviar.disabled = false;
                btnReenviar.innerText = "¿No recibiste el correo? Solicitar otro";
            }
        }, 1000);

    } catch (error) {
        console.error("Error crítico al procesar el 2FA:", error);
        mostrarMensaje("Ocurrió un error al enviar el correo electrónico de seguridad. Inténtalo de nuevo.", "danger");
        btnReenviar.disabled = false;
        btnReenviar.innerText = "¿No recibiste el correo? Solicitar otro";
    }
}

// ============================================================================
// 🔍 VERIFICACIÓN PASAPORTE: Comparar lo que digita el usuario
// ============================================================================
form2FA.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const codigoIngresado = inputCodigo.value.trim();
    const codigoEsperado = sessionStorage.getItem("sigev_2fa_token");

    if (!codigoEsperado) {
        mostrarMensaje("Tu sesión de validación ha expirado o no es válida. Solicita un nuevo código.", "danger");
        return;
    }

    if (codigoIngresado === codigoEsperado) {
        console.log("🔒 2FA: Identidad verificada con éxito.");
        
        // Activamos la bandera verde de éxito en el navegador
        sessionStorage.setItem("sigev_2fa_autenticado", "true");
        
        // Destruimos el token usado para que no pueda ser reciclado bajo ninguna circunstancia
        sessionStorage.removeItem("sigev_2fa_token");

        // Pasaporte aprobado: ¡Adelante al sistema!
        window.location.href = "dashboard.html";
    } else {
        console.warn("❌ 2FA: Intento de acceso fallido. Código incorrecto.");
        mostrarMensaje("El código de verificación ingresado es incorrecto. Revisa tu correo e inténtalo nuevamente.", "danger");
        inputCodigo.value = "";
        inputCodigo.focus();
    }
});

// Listener para el botón de reenvío manual
btnReenviar.addEventListener("click", async () => {
    await generarYEnviarCodigo();
});

// ============================================================================
// 🔧 FUNCIÓN AUXILIAR: INYECTOR DINÁMICO DE ALERTAS (BOOTSTRAP)
// ============================================================================
function mostrarMensaje(texto, tipo) {
    const cajaMensaje = document.getElementById("mensaje-status");
    if (!cajaMensaje) return;

    cajaMensaje.innerText = texto;
    cajaMensaje.className = `alert small text-center py-2 mb-3 alert-${tipo === "success" ? "success" : "danger"}`;
    cajaMensaje.classList.remove("d-none"); // Destapa la caja en la interfaz
}