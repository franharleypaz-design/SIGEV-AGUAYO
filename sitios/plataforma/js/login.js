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

// 🕵️‍♂️ DETECTOR MULTI-TENANT INTELIGENTE
// Si estás programando localmente usa por defecto el entorno "paz". En internet leerá la URL automáticamente.
const subdominioDetectado = window.location.hostname.split('.')[0];
const tenantActual = (subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado;

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
                    nombre: user.displayName,
                    email: user.email,
                    photoURL: user.photoURL,
                    fechaRegistro: serverTimestamp(),
                    tenantId: tenantActual,
                    rol: "pendiente"
                });
                console.log(`¡Nuevo perfil territorial registrado en Cloud Firestore bajo Tenant-${tenantActual}!`);
            } else {
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
        }
    } catch (error) {
        console.warn("Buzón de conectividad: Canal offline.", error);
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
    let tipoSeleccionado = "Solicitar Apoyo Solidario"; 
    let archivosAdjuntosList = [];
    const botonesOpcion = document.querySelectorAll('.option-btn');
    
    // Capturar la selección de categoría pública removiendo emojis para las llaves lógicas
    botonesOpcion.forEach(btn => {
        btn.addEventListener('click', () => {
            botonesOpcion.forEach(b => b.style.cssText = "");
            btn.style.cssText = "border-color: var(--navy-blue); background: #f0f7ff; box-shadow: 0 0 0 2px rgba(15,54,97,0.1);";
            tipoSeleccionado = btn.innerText.replace(/[^\w\sñáéíóúÁÉÍÓÚ]/g, '').trim();
        });
    });

    const btnEnviarTrigger = document.querySelector('.btn-send-request');
    const citizenModal = document.getElementById('citizen-modal');
    const closeCitizenBtn = document.getElementById('close-citizen-btn');
    const modalTitle = document.getElementById('citizen-modal-title');
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

    if (btnEnviarTrigger && citizenModal) {
        btnEnviarTrigger.addEventListener('click', () => {
            const opcionesValidas = [
                "Solicitar Apoyo Solidario", 
                "Reportar un Problema o Reclamo", 
                "Realizar una Denuncia Ciudadana", 
                "Enviar una Idea o Iniciativa Vecinal", 
                "Enviar un mensaje de agradecimiento", 
                "Otro Asunto o Consulta"
            ];
            
            if (opcionesValidas.includes(tipoSeleccionado)) {
                
                const configCampos = {
                    "Solicitar Apoyo Solidario": {
                        titulo: "🎁 Solicitar Apoyo Solidario",
                        lblAsunto: "Ayuda o Insumo Requerido *", phAsunto: "Ej. Canasta de alimentos, pañales, materiales de construcción, silla de ruedas...",
                        lblDesc: "Detalle de tu situación y requerimiento *", phDesc: "Por favor, describe detalladamente tu situación familiar o de salud y el apoyo específico que necesitas aquí..."
                    },
                    "Reportar un Problema o Reclamo": {
                        titulo: "⚠️ Reportar un Problema o Reclamo",
                        lblAsunto: "Asunto del Reclamo *", phAsunto: "Ej. Luminaria apagada en mi pasaje",
                        lblDesc: "Descripción del Problema / Reclamo *", phDesc: "Detalla el inconveniente técnico detectado en terreno aquí..."
                    },
                    "Enviar una Idea o Iniciativa Vecinal": {
                        titulo: "💡 Enviar una Idea o Iniciativa Vecinal",
                        lblAsunto: "Título de tu Idea o Iniciativa", phAsunto: "Ej. Implementar nuevos puntos limpios de reciclaje comunitarios",
                        lblDesc: "Cuéntanos en detalle tu propuesta", phDesc: "Explica aquí cómo visualizas esta idea y cómo podemos impulsarla juntos en el territorio..."
                    },
                    "Enviar un mensaje de agradecimiento": {
                        titulo: "Enviar un mensaje de agradecimiento ❤️",
                        lblAsunto: "Motivo del agradecimiento", phAsunto: "Ej. Excelente gestión en el operativo veterinario",
                        lblDesc: "Tu mensaje de agradecimiento", phDesc: "¡Escribe aquí tu mensaje para el equipo! Nos motiva mucho leerte..."
                    },
                    "Realizar una Denuncia Ciudadana": {
                        titulo: "Ingresar Denuncia Territorial Segura 📣",
                        lblAsunto: "Asunto de la Denuncia *", phAsunto: "Ej. Acopio ilegal de escombros o ruidos molestos reiterados en la vía pública",
                        lblDesc: "Descripción detallada de los hechos *", phDesc: "Por favor, detalla los hechos con precisión, incluyendo fechas u horarios estimados para agilizar la fiscalización aquí..."
                    },
                    "Otro Asunto o Consulta": {
                        titulo: "Enviar Consulta o Requerimiento General •••",
                        lblAsunto: "Asunto de tu Consulta *", phAsunto: "Ej. Consulta sobre las fechas de postulación a fondos concursables",
                        lblDesc: "Detalle de tu Consulta *", phDesc: "Escribe tu duda de forma libre aquí para poder derivarla rápidamente al departamento correspondiente..."
                    }
                };

                const currentConfig = configCampos[tipoSeleccionado] || configCampos["Otro Asunto o Consulta"];
                
                if (modalTitle) modalTitle.innerText = currentConfig.titulo;
                
                const inputAsunto = document.getElementById('cit-asunto');
                const inputDesc = document.getElementById('cit-descripcion');
                
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

                citizenModal.classList.add('open');
            } else {
                alert(`El tipo '${tipoSeleccionado}' se procesa por canal automatizado interno directo.`);
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

    const btnSubmitForm = document.getElementById('btn-submit-citizen-form');
    if (btnSubmitForm) {
        btnSubmitForm.addEventListener('click', async () => {
            const nombre = document.getElementById('cit-nombre').value.trim();
            const rut = document.getElementById('cit-rut').value.trim();
            const telefono = document.getElementById('cit-telefono').value.trim();
            const direccion = document.getElementById('cit-direccion').value.trim();
            const asunto = document.getElementById('cit-asunto').value.trim();
            const descripcion = document.getElementById('cit-descripcion').value.trim();

            if (!rut) {
                await mostrarAlertaPersonalizada("No se puede enviar el formulario porque el campo RUN es obligatorio para validar tu identidad. Por favor, ingrésalo para avanzar.", "error");
                if (inputCitRut) inputCitRut.focus();
                return;
            }

            if (!validarRutAlgoritmoChileno(rut)) {
                await mostrarAlertaPersonalizada("No se puede proceder con el envío de la solicitud porque el RUT ingresado no es válido. Por favor, verifica el número o el dígito verificador para avanzar.", "error");
                if (inputCitRut) {
                    inputCitRut.focus();
                    inputCitRut.style.borderColor = "#ef4444";
                    inputCitRut.style.backgroundColor = "#fef2f2";
                }
                return;
            }

            // Canales con validación flexible libres de campos obligatorios
            const esBuzonFlexible = ["Enviar una Idea o Iniciativa Vecinal", "Enviar un mensaje de agradecimiento"].includes(tipoSeleccionado);
            if (!esBuzonFlexible) {
                if (!nombre || !telefono || !asunto || !descripcion) {
                    await mostrarAlertaPersonalizada("Por favor complete todos los campos obligatorios (*) marcados en el formulario.", "error");
                    return;
                }
            }

            btnSubmitForm.disabled = true;
            btnSubmitForm.innerText = "Subiendo adjuntos y despachando...";

            try {
                let urlsCargadasStorage = [];

                for (let i = 0; i < archivosAdjuntosList.length; i++) {
                    const file = archivosAdjuntosList[i];
                    const storageRef = ref(storage, `buzon_ciudadano_adjuntos/${Date.now()}_${file.name}`);
                    await uploadBytes(storageRef, file);
                    const downloadUrl = await getDownloadURL(storageRef);
                    urlsCargadasStorage.push(downloadUrl);
                }

                const formularioPayload = {
                    tenantId: tenantActual,
                    nombre: nombre || "Vecino Identificado",
                    rut: rut,
                    telefono: telefono || "No proporcionado",
                    direccion: direccion || "No proporcionada",
                    tipo: tipoSeleccionado,
                    asunto: asunto || `${tipoSeleccionado} Ciudadana Directa`,
                    descripcion: descripcion || `Ingreso de ${tipoSeleccionado.toLowerCase()} procesada de forma rápida sin texto complementario.`,
                    estado: "Nuevo",
                    prioridad: "Alta",
                    fecha: serverTimestamp(),
                    adjuntos: urlsCargadasStorage
                };

                await addDoc(collection(db, "buzon_ciudadano"), formularioPayload);
                
                // 🚀 PAUSA ASÍNCRONA BLINDADA: Espera obligatoriamente a que el usuario presione "Aceptar" para continuar
                await mostrarAlertaPersonalizada(`¡Tu requerimiento ha sido enviado con éxito! Nuestro equipo revisará los antecedentes y serás contactado a la brevedad.`, "success");
                
                citizenModal.classList.remove('open');
                document.getElementById('form-solicitud-ciudadana').reset();
                if (previewContainer) previewContainer.innerHTML = "";
                window.location.reload();

            } catch (error) {
                console.error("Error crítico al despachar al buzón con adjuntos:", error);
                await mostrarAlertaPersonalizada("Ocurrió un inconveniente al conectar con el servidor. Valida los permisos e inténtalo de nuevo.", "error");
                btnSubmitForm.disabled = false;
                btnSubmitForm.innerText = "🚀 Despachar Caso Oficial al Buzón";
            }
        });
    }
}

// Inicialización de procesos
cargarBrandingPublico();
inicializarFormularioBuzonCiudadano();