// 1. Importar los módulos desde la CDN oficial (Cambiamos getFirestore por initializeFirestore para configuraciones de red)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { initializeFirestore, doc, setDoc, getDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";

// 2. Credenciales reales de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBquqkfUkYizO3w6V_9D2Ath2afYV56cV0",
    authDomain: "sigev-aguayo.firebaseapp.com",
    projectId: "sigev-aguayo",
    storageBucket: "sigev-aguayo.firebasestorage.app",
    messagingSenderId: "21666588211",
    appId: "1:21666588211:web:ff3f55d5484fe811b9e546",
    measurementId: "G-3QTQ0RQD98"
};

// 3. Inicializar herramientas de Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const storage = getStorage(app);

// 🚀 TRUCO MAESTRO DE RED: Forzamos Long-Polling para evitar que firewalls locales corten la conexión NoSQL
const db = initializeFirestore(app, {
    experimentalForceLongPolling: true
});

// 🕵️‍♂️ DETECTOR MULTI-TENANT INTELIGENTE CON RESPALDO DE SESIÓN GLOBAL (PASAPORTE)
const subdominioDetectado = window.location.hostname.split('.')[0];
const tenantActual = sessionStorage.getItem('SIGEV_ACTIVE_TENANT') || ((subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const btnGoogleLogin = document.getElementById('btn-google-login');
const loginError = document.getElementById('login-error');

if (btnGoogleLogin) {
    btnGoogleLogin.addEventListener('click', async () => {
        try {
            btnGoogleLogin.disabled = true;
            btnGoogleLogin.innerHTML = '<span>Conectando con Google...</span>';
            if (loginError) loginError.style.display = 'none';

            // Lanzar login de Google
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            // 4. VERIFICACIÓN INTELIGENTE ANTES DE ESCRIBIR EL ROL
            const userRef = doc(db, "usuarios", user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                await setDoc(userRef, {
                    uid: user.uid,
                    nombreCompleto: user.displayName,
                    nombre: user.displayName,
                    email: user.email,
                    photoURL: user.photoURL,
                    fechaRegistro: serverTimestamp(),
                    tenantId: tenantActual,
                    rol: "pendiente",
                    rolVisual: "Inactivo",
                    estadoCuenta: "Inactivo"
                });
                console.log(`¡Nuevo perfil territorial registrado en Cloud Firestore bajo Tenant-${tenantActual}!`);
                
                // Si es un usuario nuevo, forzamos un cierre de sesión silencioso y mostramos error,
                // impidiendo que entre y ensucie el dashboard.
                await auth.signOut();
                if (loginError) {
                    loginError.style.display = 'block';
                    loginError.innerText = "Tu cuenta no tiene permisos para ingresar. Comunícate con tu administrador.";
                }
                
                btnGoogleLogin.disabled = false;
                btnGoogleLogin.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.53-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-8.17z"/>
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.11 0-5.74-2.11-6.68-4.96H1.21v3.15C3.18 21.88 7.31 24 12 24z"/>
                        <path fill="#FBBC05" d="M5.32 14.24c-.24-.72-.38-1.5-.38-2.24s.14-1.52.38-2.24V6.61H1.21C.4 8.22 0 10.04 0 12s.4 3.78 1.21 5.39l4.11-3.15z"/>
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.18 2.12 1.21 5.39l4.11 3.15c.94-2.85 3.57-4.96 6.68-4.96z"/>
                    </svg>
                    <span>Iniciar sesión con Google</span>
                `;
                return; // Bloqueamos que continúe y salte a dashboard.html
            } else {
                const userData = userSnap.data();
                const rolSeguro = (userData.rol || "").toUpperCase();
                const estado = userData.estadoCuenta || userData.estado || "Activo";

                // Verificación estricta de permisos antes de dejarlo pasar
                if (estado === "Suspendido" || estado === "Inactivo" || rolSeguro === "PENDIENTE" || rolSeguro === "INACTIVO" || (!rolSeguro.includes("ADMIN") && !rolSeguro.includes("GESTOR") && !rolSeguro.includes("SECRETARIA") && !rolSeguro.includes("CONCEJAL") && !rolSeguro.includes("MOD"))) {
                    await auth.signOut();
                    if (loginError) {
                        loginError.style.display = 'block';
                        loginError.innerText = "Tu cuenta no tiene permisos para ingresar. Comunícate con tu administrador.";
                    }
                    btnGoogleLogin.disabled = false;
                    btnGoogleLogin.innerHTML = `
                        <svg width="18" height="18" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.53-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-8.17z"/>
                            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.11 0-5.74-2.11-6.68-4.96H1.21v3.15C3.18 21.88 7.31 24 12 24z"/>
                            <path fill="#FBBC05" d="M5.32 14.24c-.24-.72-.38-1.5-.38-2.24s.14-1.52.38-2.24V6.61H1.21C.4 8.22 0 10.04 0 12s.4 3.78 1.21 5.39l4.11-3.15z"/>
                            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.18 2.12 1.21 5.39l4.11 3.15c.94-2.85 3.57-4.96 6.68-4.96z"/>
                        </svg>
                        <span>Iniciar sesión con Google</span>
                    `;
                    return;
                }

                await setDoc(userRef, {
                    nombre: user.displayName,
                    photoURL: user.photoURL,
                    ultimaConexion: serverTimestamp()
                }, { merge: true });
                console.log("¡Usuario recurrente detectado! Configuración y Tenant preservados.");
            }
            
            window.location.href = 'dashboard.html';

        } catch (error) {
            console.error("Error al autenticar o guardar datos:", error);

            if (loginError) {
                loginError.style.display = 'block';
                loginError.innerText = "Error al iniciar sesión. Inténtalo nuevamente.";
            }

            btnGoogleLogin.disabled = false;
            btnGoogleLogin.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.53-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-8.17z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.11 0-5.74-2.11-6.68-4.96H1.21v3.15C3.18 21.88 7.31 24 12 24z"/>
                    <path fill="#FBBC05" d="M5.32 14.24c-.24-.72-.38-1.5-.38-2.24s.14-1.52.38-2.24V6.61H1.21C.4 8.22 0 10.04 0 12s.4 3.78 1.21 5.39l4.11-3.15z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.18 2.12 1.21 5.39l4.11 3.15c.94-2.85 3.57-4.96 6.68-4.96z"/>
                </svg>
                <span>Iniciar sesión con Google</span>
            `;
        }
    });
}

// ==============================================================================
// 5. CARGA DINÁMICA DE BRANDING PÚBLICO
// ==============================================================================
async function cargarBrandingPublico() {
    try {
        const docRef = doc(db, "configuracion_tenant", tenantActual);
        const snap = await getDoc(docRef);

        const brandContainer = document.getElementById("public-brand-container");
        const customTitle = document.getElementById("public-custom-title");

        if (snap.exists()) {
            const config = snap.data();
            
            if (config.portalLogoUrl) {
                const contenedorLogo = document.getElementById("portal-logo-container");
                if (contenedorLogo) {
                    contenedorLogo.innerHTML = `
                        <img src="${config.portalLogoUrl}" alt="Logo Portal Público">
                    `;
                }
            }

            if (config.sidebarLogoUrl && brandContainer) {
                const img = new Image();
                img.src = config.sidebarLogoUrl;
                img.onload = () => {
                    brandContainer.innerHTML = `
                        <div style="background-color: #ffffff; padding: 12px; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); width: 90px; height: 90px; display: flex; align-items: center; justify-content: center; box-sizing: border-box; margin: 0 auto 20px auto;">
                            <img src="${config.sidebarLogoUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;">
                        </div>
                    `;
                };
            }

            if (config.sidebarTitle && customTitle) {
                customTitle.innerText = config.sidebarTitle;
            } else if (customTitle) {
                customTitle.innerText = "Sistema de Gestión Territorial";
            }
        } else {
            if (customTitle) customTitle.innerText = "Sistema de Gestión Territorial";
        }
    } catch (e) {
        console.error("Error al cargar branding público:", e);
    }
}

// 🌐 FUNCIÓN CENTRAL PARA INYECTAR ALERTAS SUTILES CON BLINDAJE DE ESPERA ASÍNCRONA
function mostrarAlertaPersonalizada(mensaje, tipo = "success") {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        
        overlay.style.cssText = "position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(15, 23, 42, 0.3) !important; backdrop-filter: blur(4px) !important; display: flex !important; align-items: center !important; justify-content: center !important; z-index: 999999 !important; padding: 20px !important; box-sizing: border-box !important;";

        let iconSvg = ""; let titleText = ""; let iconStyles = "";

        if (tipo === "success") {
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            titleText = "Operación Exitosa";
            iconStyles = "background-color: #f0fdf4; color: #16a34a;";
        } else if (tipo === "info") {
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="12" x2="12" y2="16"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
            titleText = "Información del Sistema";
            iconStyles = "background-color: #eff6ff; color: #2563eb;";
        } else {
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            titleText = "Atención Requerida";
            iconStyles = "background-color: #fef2f2; color: #dc2626;";
        }

        overlay.innerHTML = `
            <div style="background: #ffffff !important; border-radius: 16px !important; padding: 32px !important; max-width: 400px !important; width: 100% !important; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important; display: flex !important; flex-direction: column !important; align-items: center !important; text-align: center !important; box-sizing: border-box !important; font-family: system-ui, -apple-system, sans-serif !important;">
                <div style="${iconStyles} width: 48px !important; height: 48px !important; border-radius: 50% !important; display: flex !important; align-items: center !important; justify-content: center !important; margin-bottom: 16px !important; flex-shrink: 0 !important;">
                    ${iconSvg}
                </div>
                <h3 style="margin: 0 0 8px 0 !important; font-size: 18px !important; font-weight: 700 !important; color: #0f172a !important; line-height: 1.2 !important;">
                    ${titleText}
                </h3>
                <p style="margin: 0 0 24px 0 !important; font-size: 14px !important; color: #475569 !important; line-height: 1.5 !important; font-weight: 500 !important;">
                    ${mensaje}
                </p>
                <button class="btn-alert-confirm" style="width: 100% !important; background: #0b438c !important; color: #ffffff !important; border: none !important; padding: 12px !important; font-size: 14px !important; font-weight: 600 !important; border-radius: 8px !important; cursor: pointer !important; transition: background 0.2s ease !important; outline: none !important;">
                    Aceptar
                </button>
            </div>
        `;

        document.body.appendChild(overlay);
        const btnAceptar = overlay.querySelector(".btn-alert-confirm");
        if (btnAceptar) {
            btnAceptar.focus();
            btnAceptar.addEventListener("mouseover", () => btnAceptar.style.backgroundColor = "#08336e");
            btnAceptar.addEventListener("mouseout", () => btnAceptar.style.backgroundColor = "#0b438c");
        }
        
        btnAceptar.addEventListener("click", () => {
            overlay.remove();
            resolve(); // 🚀 Desbloquea el flujo del script original justo aquí
        });
    });
}

// 🌐 FUNCIÓN DE VALIDACIÓN MATEMÁTICA OFICIAL CHILENA (MÓDULO 11)
function validarRutAlgoritmoChileno(rut) {
    if (!rut) return false;
    let clean = rut.replace(/[^0-9kK]/g, "").toUpperCase();
    if (clean.length < 8) return false;

    let cuerpo = clean.slice(0, -1);
    let dvEntered = clean.slice(-1);

    let suma = 0;
    let multiplicador = 2;

    for (let i = cuerpo.length - 1; i >= 0; i--) {
        suma += parseInt(cuerpo.charAt(i)) * multiplicador;
        multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
    }

    let dvEsperado = 11 - (suma % 11);
    if (dvEsperado === 11) dvEsperado = "0";
    else if (dvEsperado === 10) dvEsperado = "K";
    else dvEsperado = dvEsperado.toString();

    return dvEntered === dvEsperado;
}

// ==============================================================================
// 6. CONTROL DEL FORMULARIO CON ADJUNTOS Y TÍTULOS DINÁMICOS ADAPTATIVOS
// ==============================================================================
function inicializarFormularioBuzonCiudadano() {
    let tipoSeleccionado = "Reclamo"; // Carga por defecto limpia
    let archivosAdjuntosList = [];
    
    // Captura los clics de las 4 tarjetas de Triage (En index.html ahora se llaman ".text-triage-btn")
    const botonesOpcion = document.querySelectorAll('.text-triage-btn');
    
    botonesOpcion.forEach(btn => {
        btn.addEventListener('click', () => {
            tipoSeleccionado = btn.getAttribute("data-tipo") || "Otro";
            const configCampos = {
                "Reclamo": {
                    titulo: "⚠️ Reportar un Problema o Reclamo",
                    lblAsunto: "Asunto del Reclamo *", phAsunto: "Ej. Luminaria apagada en mi pasaje",
                    lblDesc: "Descripción del Problema / Reclamo *", phDesc: "Detalla el inconveniente técnico detectado en terreno aquí..."
                },
                "Sugerencia": {
                    titulo: "💡 Enviar una Idea o Iniciativa Vecinal",
                    lblAsunto: "Título de tu Idea o Iniciativa *", phAsunto: "Ej. Implementar nuevos puntos limpios de reciclaje comunitarios",
                    lblDesc: "Cuéntanos en detalle tu propuesta *", phDesc: "Explica aquí cómo visualizas esta idea y cómo podemos impulsarla juntos en el territorio..."
                },
                "Felicitación": {
                    titulo: "Enviar un mensaje de agradecimiento ❤️",
                    lblAsunto: "Motivo del agradecimiento *", phAsunto: "Ej. Excelente gestión en el operativo veterinario",
                    lblDesc: "Tu mensaje de agradecimiento *", phDesc: "¡Escribe aquí tu mensaje para el equipo! Nos motiva mucho leerte..."
                },
                "Otro": {
                    titulo: "Enviar Consulta o Requerimiento General •••",
                    lblAsunto: "Asunto de tu Consulta *", phAsunto: "Ej. Consulta sobre las fechas de postulación a fondos concursables",
                    lblDesc: "Detalle de tu Consulta *", phDesc: "Escribe tu duda de forma libre aquí para poder derivarla rápidamente al departamento correspondiente..."
                }
            };

            const currentConfig = configCampos[tipoSeleccionado] || configCampos["Otro"];
            const modalTitle = document.getElementById('citizen-modal-title');
            const inputAsunto = document.getElementById('cit-asunto');
            const inputDesc = document.getElementById('cit-descripcion');
            
            if (modalTitle) modalTitle.innerText = currentConfig.titulo;
            
            if (inputAsunto) {
                inputAsunto.placeholder = currentConfig.phAsunto;
                const labelAsunto = inputAsunto.previousElementSibling;
                if (labelAsunto) labelAsunto.innerHTML = currentConfig.lblAsunto;
            }
            if (inputDesc) {
                inputDesc.placeholder = currentConfig.phDesc;
                const labelDesc = inputDesc.previousElementSibling;
                if (labelDesc) labelDesc.innerHTML = currentConfig.lblDesc;
            }
        });
    });

    const citizenModal = document.getElementById('citizen-modal');
    const closeCitizenBtn = document.getElementById('close-citizen-btn');
    const fileInput = document.getElementById('cit-adjuntos');
    const previewContainer = document.getElementById('cit-adjuntos-preview');
    const inputCitRut = document.getElementById('cit-rut');

    // 🏎️ FORMATEADOR EN VIVO Y CONTROL DE ALERTAS VISUALES DIRECTAS
    if (inputCitRut) {
        inputCitRut.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^0-9kK]/g, '');
            if (value.length > 1) { 
                e.target.value = value.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + value.slice(-1).toUpperCase(); 
            } else { 
                e.target.value = value.toUpperCase(); 
            }

            // Al escribir limpiamos el estado de alerta rojo para permitir edición limpia
            inputCitRut.style.borderColor = "";
            inputCitRut.style.backgroundColor = "";
            inputCitRut.style.boxShadow = "";

            // Si llega a ser un RUT válido mientras tipea, le damos feedback verde esmeralda altiro
            let cleanRut = e.target.value.replace(/[^0-9kK]/g, "");
            if (cleanRut.length >= 8 && validarRutAlgoritmoChileno(e.target.value)) {
                inputCitRut.style.borderColor = "#059669";
                inputCitRut.style.boxShadow = "0 0 0 2px rgba(5, 150, 105, 0.1)";
            }
        });

        // 🎯 DETECTOR DE SALIDA (BLUR): Si el campo pierde foco y está malo, se marca en rojo al instante
        inputCitRut.addEventListener('blur', (e) => {
            const val = e.target.value.trim();
            if (!val) return;

            if (!validarRutAlgoritmoChileno(val)) {
                inputCitRut.style.borderColor = "#ef4444";
                inputCitRut.style.backgroundColor = "#fef2f2";
                inputCitRut.style.boxShadow = "0 0 0 2px rgba(239, 68, 68, 0.15)";
            } else {
                inputCitRut.style.borderColor = "#059669";
                inputCitRut.style.backgroundColor = "";
                inputCitRut.style.boxShadow = "0 0 0 2px rgba(5, 150, 105, 0.1)";
            }
        });
    }

    if (closeCitizenBtn && citizenModal) {
        closeCitizenBtn.addEventListener('click', () => {
            if (inputCitRut) {
                inputCitRut.style.borderColor = "";
                inputCitRut.style.backgroundColor = "";
                inputCitRut.style.boxShadow = "";
            }
            citizenModal.classList.remove('open');
        });
    }

    if (fileInput && previewContainer) {
        fileInput.addEventListener('change', (e) => {
            previewContainer.innerHTML = "";
            archivosAdjuntosList = Array.from(e.target.files).slice(0, 4);
            
            archivosAdjuntosList.forEach(file => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    previewContainer.innerHTML += `
                        <div style="width: 55px; height: 42px; border-radius: 4px; overflow:hidden; border:1px solid #cbd5e1;">
                            <img src="${ev.target.result}" style="width:100%; height:100%; object-fit:cover;">
                        </div>`;
                };
                reader.readAsDataURL(file);
            });
        });
    }

    // Aquí evitamos chocar con el listener que pusimos en index.html.
    // Solo manejamos las validaciones estrictas y dejamos que index.html despache.
    const formCiudadano = document.getElementById('form-solicitud-ciudadana');
    if (formCiudadano) {
        formCiudadano.addEventListener('submit', async (e) => {
            
            const rut = document.getElementById('cit-rut').value.trim();
            
            if (!rut) {
                e.preventDefault();
                await mostrarAlertaPersonalizada("No se puede enviar el formulario porque el campo RUN es obligatorio para validar tu identidad. Por favor, ingrésalo para avanzar.", "error");
                if (inputCitRut) inputCitRut.focus();
                return;
            }

            if (!validarRutAlgoritmoChileno(rut)) {
                e.preventDefault();
                await mostrarAlertaPersonalizada("No se puede proceder con el envío de la solicitud porque el RUT ingresado no es válido. Por favor, verifica el número o el dígito verificador para avanzar.", "error");
                if (inputCitRut) {
                    inputCitRut.focus();
                    inputCitRut.style.borderColor = "#ef4444";
                    inputCitRut.style.backgroundColor = "#fef2f2";
                }
                return;
            }
            
            // Si todo está correcto, NO hacemos e.preventDefault(),
            // de este modo, el evento fluye libremente y es procesado 
            // por el index.html para guardarse de forma aislada.
        });
    }
}

// Inicialización de procesos
cargarBrandingPublico();
inicializarFormularioBuzonCiudadano();

// ============================================================================
// SISTEMA DE SEGURIDAD: CIERRE DE SESIÓN POR INACTIVIDAD (15 MINUTOS)
// ============================================================================
let timeoutInactividad;

function reiniciarTemporizadorInactividad() {
    clearTimeout(timeoutInactividad);
    if (auth.currentUser) {
        timeoutInactividad = setTimeout(() => {
            console.log("Cerrando sesión por inactividad operativa...");
            auth.signOut().then(() => {
                window.location.href = "index.html";
            }).catch((error) => {
                console.error("Error al cerrar sesión por inactividad:", error);
            });
        }, 15 * 60 * 1000); // 15 minutos en milisegundos
    }
}

window.onload = reiniciarTemporizadorInactividad;
document.onmousemove = reiniciarTemporizadorInactividad;
document.onkeypress = reiniciarTemporizadorInactividad;
document.ontouchstart = reiniciarTemporizadorInactividad;
document.onclick = reiniciarTemporizadorInactividad;
document.onscroll = reiniciarTemporizadorInactividad;

auth.onAuthStateChanged((user) => {
    if (user) {
        reiniciarTemporizadorInactividad();
    } else {
        clearTimeout(timeoutInactividad);
    }
});

// ============================================================================
// 🎨 INYECCIÓN DINÁMICA DEL LOGO CORPORATIVO (Logo_Letra.png)
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
    // 1. Buscamos el contenedor del logo y el título en el modal de login
    const logoZone = document.querySelector(".login-logo-zone");
    const titleModal = document.querySelector(".login-title-modal");
    
    // 2. Reemplazamos el ícono SVG por tu imagen PNG
    if (logoZone) {
        // Asegúrate de que la ruta "img/Logo_Letra.png" coincida con tu estructura de carpetas
        logoZone.innerHTML = `<img src="img/Logo_Letra.png" alt="SIGEV" style="width: 180px; height: auto; object-fit: contain; filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.1));">`;
        
        // Quitamos cualquier fondo o padding predeterminado que tuviera la zona del ícono antiguo
        logoZone.style.background = "transparent";
        logoZone.style.boxShadow = "none";
        logoZone.style.marginBottom = "8px"; 
    }
    
    // 3. Ocultamos el texto "SIGEV" ya que la imagen de la letra ya lo incluye
    if (titleModal) {
        titleModal.style.display = "none";
    }
});