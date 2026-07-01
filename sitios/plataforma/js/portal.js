// ============================================================================
// 🔍 MOTOR DE BÚSQUEDA Y SEGUIMIENTO DE TICKETS PARA EL VECINO (V16 SAAS-FADEIN)
// ============================================================================
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDocs, collection, query, where, increment, serverTimestamp, getDoc, runTransaction, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

console.log("🔵 SIGEV PORTAL.JS CARGADO CORRECTAMENTE V16"); 

const firebaseConfig = {
    apiKey: "AIzaSyBquqkfUkYizO3w6V_9D2Ath2afYV56cV0",
    authDomain: "sigev-aguayo.firebaseapp.com",
    projectId: "sigev-aguayo",
    storageBucket: "sigev-aguayo.firebasestorage.app",
    messagingSenderId: "21666588211",
    appId: "1:21666588211:web:ff3f55d5484fe811b9e546"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

const baseConcejalesSaaS = {
    "aguayo": { id: "ID_CONCEJAL_AGUAYO_LC", nombre: "Gonzalo Aguayo", comuna: "La Cisterna", tenantId: "aguayo" },
    "paz": { id: "ID_CONCEJAL_PAZ_LC", nombre: "Franchesca Paz", comuna: "Pudahuel", tenantId: "paz" }
};

let subdominioCrudo = window.location.hostname.split('.')[0].toLowerCase();
const subdominioLimpio = subdominioCrudo.replace('sigev-', '');
let tenantAUsar = (subdominioLimpio === 'localhost' || subdominioLimpio === '127' || subdominioLimpio === 'landing') ? "paz" : subdominioLimpio;

if (!baseConcejalesSaaS[tenantAUsar]) {
    tenantAUsar = "aguayo";
}
let concejalActivo = baseConcejalesSaaS[tenantAUsar];

const urlParams = new URLSearchParams(window.location.search);
const refConcejal = urlParams.get('c');

function mostrarAlertaPublicaConCodigo(mensaje, codigoSeguimiento) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 999999; padding: 20px; box-sizing: border-box;";
        overlay.innerHTML = `
            <div style="background: #ffffff; width: 100%; max-width: 460px; border-radius: 20px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); overflow: hidden; display: flex; flex-direction: column; font-family: inherit; animation: alertPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); box-sizing: border-box;">
                <div style="padding: 32px 32px 24px 32px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px;">
                    <div style="width: 56px; height: 56px; background: #f0fdf4; color: #16a34a; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">¡Solicitud Ingresada!</h3>
                        <p style="margin: 6px 0 0 0; font-size: 14.5px; color: #475569; line-height: 1.5;">` + mensaje + `</p>
                    </div>
                    <div style="width: 100%; background: #f8fafc; border: 2px dashed #cbd5e1; padding: 16px; border-radius: 12px; display: flex; flex-direction: column; gap: 6px; box-sizing: border-box; position: relative;">
                        <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.5px; display: block;">Código de Seguimiento</span>
                        <strong style="font-size: 24px; color: #0b438c; font-family: monospace; letter-spacing: 1px; display: block; margin-bottom: 4px;">` + codigoSeguimiento + `</strong>
                        <button id="btn-copiar-capsula" style="background: #ffffff; border: 1px solid #e2e8f0; color: #475569; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; margin: 0 auto; box-shadow: 0 1px 2px rgba(0,0,0,0.05); outline: none;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            <span id="txt-copiar-capsula">Copiar Código</span>
                        </button>
                    </div>
                    <p style="margin: 4px 0 0 0; font-size: 12.5px; color: #64748b; line-height: 1.4;">Guarda este código. Lo necesitarás junto a tu RUT para consultar el avance del caso desde este portal.</p>
                </div>
                <div style="background: #f8fafc; padding: 16px 32px 24px 32px; border-top: 1px solid #e2e8f0; display: flex; justify-content: center;">
                    <button id="btn-alerta-exito-ok" style="width: 100%; background: #0b438c; color: #ffffff; border: none; padding: 12px; font-size: 15px; font-weight: 700; border-radius: 8px; cursor: pointer; transition: background 0.2s; outline: none; box-shadow: 0 4px 6px -1px rgba(11, 67, 140, 0.2);">Finalizar Consulta</button>
                </div>
            </div>
            <style>
                @keyframes alertPop { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
            </style>
        `;
        document.body.appendChild(overlay);
        const btnCopiar = overlay.querySelector("#btn-copiar-capsula");
        btnCopiar.addEventListener("click", () => {
            navigator.clipboard.writeText(codigoSeguimiento).then(() => {
                const txt = overlay.querySelector("#txt-copiar-capsula");
                txt.innerText = "¡Copiado!";
                btnCopiar.style.background = "#f0fdf4";
                btnCopiar.style.color = "#16a34a";
                setTimeout(() => { txt.innerText = "Copiar Código"; btnCopiar.style.background = "#ffffff"; btnCopiar.style.color = "#475569"; }, 2000);
            });
        });
        overlay.querySelector("#btn-alerta-exito-ok").onclick = () => { overlay.remove(); resolve(); };
    });
}

async function mostrarAlertaError(msg) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.3); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999999; padding: 20px; box-sizing: border-box;";
        overlay.innerHTML = `
            <div style="background: #ffffff; width: 100%; max-width: 400px; border-radius: 14px; padding: 28px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); text-align: center; font-family: inherit;">
                <div style="width: 48px; height: 48px; background: #fef2f2; color: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </div>
                <h3 style="margin: 0 0 8px 0; font-size: 16.5px; font-weight: 700; color: #0f172a;">Verificar Información</h3>
                <p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.5;">` + msg + `</p>
                <button id="btn-err-ok" style="width: 100%; background: #0f172a; color: #fff; border: none; padding: 11px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; outline: none;">Corregir Datos</button>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector("#btn-err-ok").onclick = () => { overlay.remove(); resolve(); };
    });
}

function validarRutAlgoritmoChileno(rut) {
    if (!rut) return false;
    let clean = rut.replace(/[^0-9kK]/g, "").toUpperCase();
    if (clean.length < 8) return false;

    let cuerpo = clean.slice(0, -1);
    let dvEntered = clean.slice(-1);
    let suma = 0, multiplicador = 2;

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

const inputBuzonRut = document.getElementById("buzon-rut");
if (inputBuzonRut) {
    inputBuzonRut.addEventListener("input", (e) => {
        let value = e.target.value.replace(/[^0-9kK]/g, '');
        if (value.length > 9) value = value.slice(0, 9);
        e.target.value = value.length > 1 ? value.slice(0, -1) + "-" + value.slice(-1).toUpperCase() : value.toUpperCase();
    });
}

let tipoIngresoBuzon = "Otro";

window.abrirModalBuzon = function(tipo) {
    tipoIngresoBuzon = tipo;
    const modal = document.getElementById("modal-buzon");
    if (!modal) return;
    
    const titulo = document.getElementById("lbl-buzon-titulo");
    const lblAsunto = document.getElementById("lbl-buzon-asunto");
    const lblDetalle = document.getElementById("lbl-buzon-detalle");
    const btnSubmit = document.getElementById("btn-submit-buzon");
    
    document.getElementById("form-buzon-publico").reset();
    
    const errArchivos = document.getElementById("error-archivos");
    if(errArchivos) errArchivos.style.display = "none";
    
    document.getElementById("buzon-rut").style.borderColor = "#cbd5e1";
    document.getElementById("buzon-telefono").style.borderColor = "#cbd5e1";

    if (tipo === "reclamo") {
        titulo.innerHTML = "🔴 Ingresar Reclamo";
        lblAsunto.innerHTML = "Asunto del reclamo <span style='color: red;'>*</span>";
        lblDetalle.innerHTML = "Detalle del problema <span style='color: red;'>*</span>";
        btnSubmit.innerText = "Enviar Reclamo";
    } 
    else if (tipo === "iniciativa") {
        titulo.innerHTML = "💡 Ingresar Iniciativa";
        lblAsunto.innerHTML = "Nombre de la iniciativa <span style='color: red;'>*</span>";
        lblDetalle.innerHTML = "Describe tu idea o propuesta <span style='color: red;'>*</span>";
        btnSubmit.innerText = "Enviar Iniciativa";
    } 
    else if (tipo === "agradecimiento") {
        titulo.innerHTML = "💙 Enviar Agradecimiento";
        lblAsunto.innerHTML = "Motivo del agradecimiento <span style='color: red;'>*</span>";
        lblDetalle.innerHTML = "Tu mensaje al equipo <span style='color: red;'>*</span>";
        btnSubmit.innerText = "Enviar Mensaje";
    }
    else {
        titulo.innerHTML = "📝 Otra Consulta";
        lblAsunto.innerHTML = "Asunto <span style='color: red;'>*</span>";
        lblDetalle.innerHTML = "Detalle de tu solicitud <span style='color: red;'>*</span>";
        btnSubmit.innerText = "Enviar Solicitud";
    }

    modal.style.display = "flex";
    setTimeout(() => modal.classList.add("open"), 10);
};

window.cerrarModalBuzon = function() {
    const modal = document.getElementById("modal-buzon");
    if(modal) {
        modal.classList.remove("open");
        setTimeout(() => modal.style.display = "none", 200);
    }
};

const inputArchivos = document.getElementById("buzon-archivos");
if (inputArchivos) {
    inputArchivos.addEventListener("change", function(e) {
        const errorArchivos = document.getElementById("error-archivos");
        if (!errorArchivos) return;
        
        errorArchivos.style.display = "none";
        const files = e.target.files;
        const MAX_ARCHIVOS = 5;
        const MAX_MB = 4 * 1024 * 1024; 

        if (files.length > MAX_ARCHIVOS) {
            errorArchivos.innerText = `⚠️ Has seleccionado ${files.length} imágenes. El máximo permitido es ${MAX_ARCHIVOS}.`;
            errorArchivos.style.display = "block";
            this.value = ""; 
            return;
        }

        for (let i = 0; i < files.length; i++) {
            if (files[i].size > MAX_MB) {
                errorArchivos.innerText = `⚠️ La imagen "${files[i].name}" supera el límite de 4MB. Por favor, elige una más liviana.`;
                errorArchivos.style.display = "block";
                this.value = ""; 
                return;
            }
        }
    });
}

const formBuzonPublico = document.getElementById("form-buzon-publico");
if (formBuzonPublico) {
    formBuzonPublico.addEventListener("submit", async (e) => {
        e.preventDefault();

        const rutIngresado = document.getElementById("buzon-rut").value.trim();
        if (!validarRutAlgoritmoChileno(rutIngresado)) {
            await mostrarAlertaError("El RUT ingresado no es válido. Por favor, verifica el número y el dígito verificador.");
            document.getElementById("buzon-rut").style.borderColor = "#ef4444";
            return;
        }

        const telefonoValue = document.getElementById("buzon-telefono").value.trim();
        if (telefonoValue.length !== 8) {
            await mostrarAlertaError("El número de teléfono debe contener exactamente 8 dígitos.");
            document.getElementById("buzon-telefono").style.borderColor = "#ef4444";
            return;
        }

        const btnSubmit = document.getElementById("btn-submit-buzon");
        const textoOriginal = btnSubmit.innerText;
        
        btnSubmit.disabled = true;
        btnSubmit.style.opacity = "0.7";
        btnSubmit.innerText = "Procesando solicitud...";

        try {
            // 🚀 ESTÁNDAR MAESTRO: CORRELATIVO MATEMÁTICO DIARIO UNIFICADO
            const hoy = new Date();
            const yy = String(hoy.getFullYear()).slice(-2);
            const mm = String(hoy.getMonth() + 1).padStart(2, '0');
            const dd = String(hoy.getDate()).padStart(2, '0');
            const fechaStr = `${yy}${mm}${dd}`;

            const counterRef = doc(db, "counters_diarios", concejalActivo.tenantId);
            let correlativoNumerico = 1;

            await runTransaction(db, async (transaction) => {
                const counterSnap = await transaction.get(counterRef);
                if (counterSnap.exists()) {
                    const data = counterSnap.data();
                    if (data[fechaStr]) {
                        correlativoNumerico = data[fechaStr] + 1;
                    }
                    transaction.set(counterRef, { [fechaStr]: correlativoNumerico }, { merge: true });
                } else {
                    transaction.set(counterRef, { [fechaStr]: 1 });
                }
            });

            const correlativoStr = String(correlativoNumerico).padStart(4, '0');
            const codigoPublico = `SIG-${fechaStr}-${correlativoStr}`;

            let tipoMapeado = "Otro";
            if (tipoIngresoBuzon === "reclamo") tipoMapeado = "Reclamo";
            if (tipoIngresoBuzon === "iniciativa") tipoMapeado = "Sugerencia";
            if (tipoIngresoBuzon === "agradecimiento") tipoMapeado = "Felicitación";

            const telefonoCompleto = "+569" + telefonoValue;

            const correoIngresado = document.getElementById("buzon-correo").value.trim();
            const direccionIngresada = document.getElementById("buzon-direccion").value.trim();

            const nuevoDocRef = doc(collection(db, "buzon_ciudadano"));
            
            const payload = {
                id: nuevoDocRef.id,
                codigo: codigoPublico,
                codigoInterno: "Pendiente de Clasificación", 
                tenantId: concejalActivo.tenantId,
                concejalId: concejalActivo.id,
                nombre: document.getElementById("buzon-nombre").value.trim(),
                rut: rutIngresado,
                telefono: telefonoCompleto,
                correo: correoIngresado, 
                direccion: direccionIngresada, 
                comuna: concejalActivo.comuna,
                asunto: document.getElementById("buzon-asunto").value.trim(),
                descripcion: document.getElementById("buzon-detalle").value.trim(),
                tipo: tipoMapeado,
                estado: "Nuevo",
                oficinaDerivada: "",
                comentarioRespuesta: "",
                fecha: serverTimestamp(),
                adjuntos: [] 
            };

            await setDoc(nuevoDocRef, payload);
            
            window.cerrarModalBuzon();
            formBuzonPublico.reset();
            document.getElementById("buzon-rut").style.borderColor = "#cbd5e1";
            document.getElementById("buzon-telefono").style.borderColor = "#cbd5e1";

            await mostrarAlertaPublicaConCodigo("Tu solicitud ha sido recibida con éxito y derivada directamente al equipo territorial.", codigoPublico);
            
        } catch (err) {
            console.error("Error al despachar el caso:", err);
            await mostrarAlertaError("Hubo un inconveniente de red al conectar con el servidor. Por favor intenta nuevamente en unos segundos.");
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.style.opacity = "1";
            btnSubmit.innerText = textoOriginal;
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const btnConsulta = document.getElementById("btn-ejecutar-consulta");
    
    if (btnConsulta) {
        btnConsulta.addEventListener("click", async (e) => {
            if(e) e.preventDefault();
            const rutInp = document.getElementById("inp-consulta-rut").value.trim();
            const codInp = document.getElementById("inp-consulta-codigo").value.trim().toUpperCase();

            if (!rutInp || !codInp || codInp === "SIG-") {
                await mostrarAlertaError("Por favor ingresa tu RUN y un Código de Solicitud válido.");
                return;
            }
            
            if (!validarRutAlgoritmoChileno(rutInp)) {
                await mostrarAlertaError("El RUT ingresado no es válido. Compruébalo e inténtalo nuevamente.");
                return;
            }

            btnConsulta.innerText = "Buscando requerimiento...";
            btnConsulta.disabled = true;

            try {
                let ticketEncontrado = null;
                const rutInpLimpio = rutInp.replace(/[^0-9kK]/g, "").toUpperCase();

                const buscarYFiltrar = async (coleccion, campoCodigo) => {
                    try {
                        const q = query(collection(db, coleccion), where(campoCodigo, "==", codInp));
                        const snap = await getDocs(q);
                        
                        if (!snap.empty) {
                            const docEncontrado = snap.docs.find(docSnap => {
                                const data = docSnap.data();
                                const rutDbLimpio = (data.rut || data.rutVecino || data.vecinoRut || "").replace(/[^0-9kK]/g, "").toUpperCase();
                                return rutDbLimpio === rutInpLimpio && data.tenantId === concejalActivo.tenantId;
                            });
                            return docEncontrado ? docEncontrado.data() : null;
                        }
                    } catch (err) {
                        console.warn("Aviso de seguridad al filtrar colección:", err);
                    }
                    return null;
                };

                ticketEncontrado = await buscarYFiltrar("buzon_ciudadano", "codigo");
                if (!ticketEncontrado) ticketEncontrado = await buscarYFiltrar("solicitudes", "codigo");
                if (!ticketEncontrado) ticketEncontrado = await buscarYFiltrar("solicitudes", "codigoPublico");

                if (!ticketEncontrado) {
                    await mostrarAlertaError("No encontramos ninguna solicitud registrada con ese Código y RUT asociado. Verifica tus datos e inténtalo nuevamente.");
                } else {
                    const ticketData = ticketEncontrado;
                    
                    let rutRaw = ticketData.rut || ticketData.rutVecino || ticketData.vecinoRut || rutInp;
                    let rutFormateadoModal = rutRaw;
                    let limpioRut = rutRaw.replace(/[^0-9kK]/g, "").toUpperCase();
                    if (limpioRut.length > 1) {
                        let dv = limpioRut.slice(-1);
                        let cuerpo = limpioRut.slice(0, -1);
                        cuerpo = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                        rutFormateadoModal = cuerpo + "-" + dv;
                    }

                    const nombreFinal = ticketData.nombre || ticketData.nombreVecino || ticketData.vecinoNombre || 'Usuario';
                    
                    document.getElementById("res-codigo").innerText = ticketData.codigo || ticketData.codigoPublico || codInp;
                    document.getElementById("res-rut-header").innerText = "RUT: " + rutFormateadoModal;
                    document.getElementById("res-solicitante").innerText = nombreFinal + " (RUT: " + rutFormateadoModal + ")";
                    document.getElementById("res-asunto").innerText = ticketData.asunto || ticketData.motivo || ticketData.categoria || "Requerimiento General";
                    document.getElementById("res-descripcion").innerText = ticketData.descripcion || "Sin detalles proporcionados.";
                    
                    const estadoOriginal = ticketData.estado || "Nuevo";
                    const estadoGestion = ticketData.estadoGestion || "";
                    const badge = document.getElementById("res-estado");
                    
                    let contenedorDinamico = document.getElementById("res-contenedor-estado-dinamico");
                    
                    let textoEstado = estadoOriginal.toUpperCase();
                    if (estadoOriginal === "Resuelto") textoEstado = "RESUELTO";
                    else if (estadoGestion) textoEstado = estadoGestion.toUpperCase();

                    const divDerivacionAntiguo = document.getElementById("res-caja-derivacion");
                    if (divDerivacionAntiguo) divDerivacionAntiguo.style.display = "none";
                    
                    const divRespuestaAntiguo = document.getElementById("res-respuesta");
                    if (divRespuestaAntiguo && divRespuestaAntiguo.parentElement) {
                        divRespuestaAntiguo.parentElement.style.display = "none";
                    }

                    if (!contenedorDinamico) {
                        contenedorDinamico = document.createElement("div");
                        contenedorDinamico.id = "res-contenedor-estado-dinamico";
                        contenedorDinamico.style.cssText = "display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;";
                        const btnCierre = document.querySelector("#modal-resultado-busqueda button[onclick*='cerrarModalG']");
                        if (btnCierre && btnCierre.parentElement) {
                            btnCierre.parentElement.insertBefore(contenedorDinamico, btnCierre);
                        }
                    }

                    contenedorDinamico.style.display = "flex"; 

                    if (textoEstado.includes("RESUELTO") || textoEstado.includes("FINALIZADA") || textoEstado.includes("FINALIZADO")) {
                        if (badge) { badge.innerText = "RESUELTO"; badge.style.background = "#dcfce7"; badge.style.color = "#166534"; }
                        
                        contenedorDinamico.innerHTML = `
                            <div style="background: #ffffff; border: 1px solid #cbd5e1; border-left: 3px solid #0f172a; border-radius: 6px; padding: 16px; font-family: inherit; box-sizing: border-box;">
                                <strong style="font-size: 11px; text-transform: uppercase; color: #0f172a; font-weight: 800; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">ESTADO DE LA SOLICITUD:</strong>
                                <span style="font-style: normal; font-weight: 600; color: #0f172a; font-size: 13.5px; line-height: 1.6; display: block;">
                                    🎉 Hemos finalizado la gestión de tu solicitud.<br><br>
                                    Gracias por utilizar este canal. En los próximos días nuestro equipo se comunicará contigo para entregarte la respuesta final y el resultado de las acciones realizadas.
                                </span>
                            </div>
                        `;
                    } else if (textoEstado.includes("GESTIÓN") || textoEstado.includes("DERIVAD") || textoEstado.includes("ESPERA DE RESPUESTA")) {
                        if (badge) { badge.innerText = "EN GESTIÓN"; badge.style.background = "#e0e7ff"; badge.style.color = "#1e40af"; }
                        
                        contenedorDinamico.innerHTML = `
                            <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; font-family: inherit; box-sizing: border-box;">
                                <label style="font-size: 10px; font-weight: 800; color: #1d4ed8; text-transform: uppercase; display: block; margin-bottom: 4px; letter-spacing: 0.5px;">Estatus de Flujo:</label>
                                <span style="font-size: 13px; font-weight: 600; color: #1e40af; display: flex; align-items: center; gap: 6px;">📝 Tu requerimiento está siendo atendido</span>
                            </div>
                            <div style="background: #ffffff; border: 1px solid #cbd5e1; border-left: 3px solid #0f172a; border-radius: 6px; padding: 14px; font-family: inherit; box-sizing: border-box;">
                                <strong style="font-size: 11px; text-transform: uppercase; color: #1e40af; font-weight: 800; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">ESTADO DE LA SOLICITUD:</strong>
                                <span style="font-style: italic; font-weight: normal; color: #475569; font-size: 13.5px; line-height: 1.5; display: block;">Tu solicitud ya está siendo gestionada por nuestro equipo. Pronto serás contactado con novedades sobre tu caso.</span>
                            </div>
                        `;
                    } else if (textoEstado.includes("CLASIFICADO") || textoEstado.includes("REVISIÓN")) {
                        if (badge) { badge.innerText = "EN REVISIÓN"; badge.style.background = "#fef3c7"; badge.style.color = "#92400e"; }
                        
                        contenedorDinamico.innerHTML = `
                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-family: inherit; box-sizing: border-box;">
                                <label style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px; letter-spacing: 0.5px;">Estatus de Flujo:</label>
                                <span style="font-size: 13px; font-weight: 600; color: #475569; display: flex; align-items: center; gap: 6px;">📋 Tu solicitud está siendo revisada por nuestro equipo.</span>
                            </div>
                            <div style="background: #ffffff; border: 1px solid #cbd5e1; border-left: 3px solid #0f172a; border-radius: 6px; padding: 14px; font-family: inherit; box-sizing: border-box;">
                                <strong style="font-size: 11px; text-transform: uppercase; color: #92400e; font-weight: 800; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">ESTADO DE LA SOLICITUD:</strong>
                                <span style="font-style: italic; font-weight: normal; color: #475569; font-size: 13.5px; line-height: 1.5; display: block;">Tu solicitud ya fue analizada por nuestro equipo y clasificada correctamente. Estamos a un paso de derivarla al departamento encargado de solucionarlo.</span>
                            </div>
                        `;
                    } else { 
                        if (badge) { badge.innerText = "NUEVO"; badge.style.background = "#fffbeb"; badge.style.color = "#d97706"; }
                        
                        contenedorDinamico.innerHTML = `
                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-family: inherit; box-sizing: border-box;">
                                <label style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px; letter-spacing: 0.5px;">Estatus de Flujo:</label>
                                <span style="font-size: 13px; font-weight: 600; color: #475569; display: flex; align-items: center; gap: 6px;">📋 Tu solicitud está siendo revisada por nuestro equipo.</span>
                            </div>
                            <div style="background: #ffffff; border: 1px solid #cbd5e1; border-left: 3px solid #0f172a; border-radius: 6px; padding: 14px; font-family: inherit; box-sizing: border-box;">
                                <strong style="font-size: 11px; text-transform: uppercase; color: #d97706; font-weight: 800; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">ESTADO DE LA SOLICITUD:</strong>
                                <span style="font-style: italic; font-weight: normal; color: #475569; font-size: 13.5px; line-height: 1.5; display: block;">¡Hola! Hemos recibido tu solicitud correctamente. Nuestro equipo la revisará muy pronto para canalizarla al área correspondiente.</span>
                            </div>
                        `;
                    }

                    if (typeof window.abrirModalG === "function") {
                        window.abrirModalG("modal-resultado-busqueda");
                    }
                }
            } catch (error) {
                console.error("Error al consultar el ticket:", error);
                await mostrarAlertaError("Hubo un problema de conexión al buscar tu solicitud. Revisa tu internet e intenta de nuevo.");
            }

            btnConsulta.innerText = "Buscar Requerimiento Oficial";
            btnConsulta.disabled = false;
        });
    }
});


document.querySelectorAll('.scroll-link').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        const targetSection = document.querySelector(targetId);
        if (targetSection) targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

async function inicializarPortalPublicoDinamico() {
    try {
        console.log("Iniciando inyección de portal SaaS para el Tenant:", concejalActivo.tenantId);
        
        // 🚀 INYECCIÓN DEL SCRIPT RASTREADOR DE VISITAS URL
        if (!sessionStorage.getItem("sigev_visita_contada") && !window.location.search.includes('c=')) {
            sessionStorage.setItem("sigev_visita_contada", "true");
            updateDoc(doc(db, "metricas_qr", concejalActivo.id), { visitasUrl: increment(1) }).catch(e => console.warn(e));
        }
        
        const docRef = doc(db, "configuracion_tenant", concejalActivo.tenantId);
        const snap = await getDoc(docRef);

        if (snap.exists()) {
            const c = snap.data();
            console.log("✅ Datos de la nube recibidos. Inyectando...");

            const elLogoContainer = document.getElementById("portal-logo-container");
            if (elLogoContainer) {
                if (c.portalLogoUrl) {
                    elLogoContainer.innerHTML = `<img src="${c.portalLogoUrl}" alt="Logo Portal">`;
                } else if (c.sidebarLogoUrl) {
                    elLogoContainer.innerHTML = `<img src="${c.sidebarLogoUrl}" alt="Logo Portal">`;
                } else {
                    elLogoContainer.innerHTML = `<h2 style="margin:0; font-size: 20px; font-weight: 800; color: #0f172a;">${c.sidebarTitle || 'SIGEV'}</h2>`;
                }
            }

            const elHeroHeader = document.getElementById("portal-hero-header");
            if (elHeroHeader) {
                if (c.portalHeroBgUrl) {
                    elHeroHeader.style.setProperty('background-image', `linear-gradient(to right, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.75) 50%, rgba(255, 255, 255, 0.4) 100%), url('${c.portalHeroBgUrl}')`, 'important');
                    elHeroHeader.style.setProperty('background-size', 'cover', 'important');
                    elHeroHeader.style.setProperty('background-position', 'center', 'important');
                    elHeroHeader.style.setProperty('background-repeat', 'no-repeat', 'important');
                } else {
                    elHeroHeader.style.setProperty('background', '#f8fafc', 'important'); 
                }
            }

            const elHeroTitulo = document.getElementById("portal-hero-title");
            const elHeroSub = document.getElementById("portal-hero-subtitle");
            if (elHeroTitulo && c.portalHeroTitulo) elHeroTitulo.innerHTML = c.portalHeroTitulo;
            if (elHeroSub && c.portalHeroSubtitulo) elHeroSub.innerHTML = c.portalHeroSubtitulo;

            const elNombre = document.getElementById("hero-concejal-nombre");
            const elCargo = document.getElementById("hero-concejal-cargo");
            const elImgHero = document.getElementById("hero-concejal-img");

            const elBadgeSvg = document.getElementById("hero-badge-svg");
            const elBadgeImg = document.getElementById("hero-badge-img");

            const elNombreModal = document.getElementById("modal-contact-name");
            const elCargoModal = document.getElementById("modal-contact-title");
            const elImgModal = document.getElementById("modal-contact-img");

            if (elNombre && c.portalNombre) elNombre.innerHTML = c.portalNombre;
            if (elNombreModal && c.portalNombre) elNombreModal.innerHTML = c.portalNombre;
            if (elCargo && c.portalCargo) elCargo.innerHTML = c.portalCargo;
            if (elCargoModal && c.portalCargo) elCargoModal.innerHTML = c.portalCargo;
            
            if (c.portalImagenUrl) {
                if (elImgHero) elImgHero.src = c.portalImagenUrl;
                if (elImgModal) elImgModal.src = c.portalImagenUrl;
            }

            if (c.portalBadgeUrl) {
                if (elBadgeImg) {
                    elBadgeImg.src = c.portalBadgeUrl;
                    elBadgeImg.style.display = "block";
                }
                if (elBadgeSvg) elBadgeSvg.style.display = "none";
            } else {
                if (elBadgeImg) elBadgeImg.style.display = "none";
                if (elBadgeSvg) elBadgeSvg.style.display = "block";
            }

            const elFooterLogoSvg = document.getElementById("footer-logo-svg");
            const elFooterLogoImg = document.getElementById("footer-logo-img");
            const elFooterBrandText = document.getElementById("footer-brand-text");
            const elFooterContainer = document.getElementById("portal-footer-container");

            if (elFooterBrandText && c.sidebarTitle) elFooterBrandText.innerText = c.sidebarTitle; 

            if (c.portalFooterLogoUrl) {
                if (elFooterLogoImg) { elFooterLogoImg.src = c.portalFooterLogoUrl; elFooterLogoImg.style.display = "block"; }
                if (elFooterLogoSvg) elFooterLogoSvg.style.display = "none";
            }

            if (elFooterContainer) {
                if (c.portalFooterBgUrl) {
                    elFooterContainer.style.setProperty('background-image', `url('${c.portalFooterBgUrl}')`, 'important');
                    elFooterContainer.style.setProperty('background-size', 'cover', 'important');
                    elFooterContainer.style.setProperty('background-position', 'center', 'important');
                    elFooterContainer.style.setProperty('background-repeat', 'no-repeat', 'important');
                } else {
                    elFooterContainer.style.setProperty('background-color', '#f8fafc', 'important');
                }
            }

            const elDir = document.getElementById("modal-contact-dir");
            const elPhone = document.getElementById("modal-contact-phone");
            const elWsp = document.getElementById("modal-contact-wsp");
            const elEmail = document.getElementById("modal-contact-email");
            const elFooterMsg = document.getElementById("portal-footer-mensaje");

            if (elDir) elDir.innerHTML = c.contactoDireccion || "No especificada";
            if (elPhone) elPhone.innerHTML = c.contactoTelefono || "No especificado";
            if (elWsp) elWsp.innerHTML = c.contactoWhatsapp || "No especificado";
            if (elEmail) elEmail.innerHTML = c.contactoEmail || "No especificado";
            if (elFooterMsg && c.footerMensaje) elFooterMsg.innerHTML = c.footerMensaje;

            const elFb = document.getElementById("portal-link-fb");
            const elIg = document.getElementById("portal-link-ig");
            const elTiktok = document.getElementById("portal-link-tiktok");
            const elWeb = document.getElementById("portal-link-web");
            
            if (elFb) { elFb.style.display = c.rrssFb ? "flex" : "none"; if(c.rrssFb) elFb.href = c.rrssFb; }
            if (elIg) { elIg.style.display = c.rrssIg ? "flex" : "none"; if(c.rrssIg) elIg.href = c.rrssIg; }
            if (elTiktok) { elTiktok.style.display = c.rrssTiktok ? "flex" : "none"; if(c.rrssTiktok) elTiktok.href = c.rrssTiktok; }
            if (elWeb) { elWeb.style.display = c.rrssWeb ? "flex" : "none"; if(c.rrssWeb) elWeb.href = c.rrssWeb; }

        } else {
            console.warn("⚠️ El documento de configuración no existe en Firestore.");
        }
    } catch (error) {
        console.error("🛑 Error crítico leyendo Firestore desde el Portal (Posible bloqueo de Reglas de Seguridad):", error);
    } finally {
        // 🚀 BUMPER FADE-IN: Se revela la web cuando todo está montado.
        document.body.style.opacity = "1";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    inicializarPortalPublicoDinamico();
    
    if (refConcejal) {
        const alias = refConcejal.toLowerCase();
        if (baseConcejalesSaaS[alias]) {
            try {
                const metricaRef = doc(db, "metricas_qr", baseConcejalesSaaS[alias].id);
                setDoc(metricaRef, { scans: increment(1) }, { merge: true });
            } catch (e) {}
        }
    }
});