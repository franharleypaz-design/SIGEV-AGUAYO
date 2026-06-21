// 1. Importamos las instancias seguras compartidas desde app.js
import { auth, db, app } from "./app.js";

// 2. Importamos los métodos oficiales de Cloud Firestore
import { 
    collection, addDoc, doc, getDoc, updateDoc, getDocs, query, orderBy, limit, where, serverTimestamp, getCountFromServer, runTransaction, setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 3. Importamos los métodos de Firebase Storage
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// 4. Importamos Layout
import { inyectarEstructuraGlobal, actualizarPerfilLayout } from "./layout.js";
import { MAPEO_TERRITORIAL } from "./mapeoMunicipal.js";

// Inicializar de forma segura el canal de almacenamiento
const storage = getStorage(app);
let archivoFotoSeleccionado = null; 
let archivoDocSeleccionado = null; 
let estaGuardando = false; 
let solicitudesGlobalesMemory = []; 
let estadoFiltroKPIActivo = "Todos";
let vDataActual = null;
let paginaActual = 1;
let filasPorPagina = 10; 

// ARQUITECTURA TENANT
const subdominioDetectado = window.location.hostname.split('.')[0];
const CURRENT_TENANT_ID = sessionStorage.getItem('SIGEV_ACTIVE_TENANT') || ((subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado);

// 🌟 MAPA MAESTRO UNIFICADO
const MAPA_CLASIFICACION_SIGEV = {
    "AYUDA SOCIAL": { depCod: "DID", depName: "DIDESO", catCod: "SOC", subs: {"Giftcard":"GIF", "Apoyo económico":"ECO", "Medicamentos":"MED", "Pago cuentas básicas":"CUE", "Subsidios económicos":"SUB"} },
    "ALUMBRADO": { depCod: "OBR", depName: "OBRAS", catCod: "ALU", subs: {"Robo de cable":"ROB", "Solicitud punto lumínico":"PUN", "Solicitud de despeje cono lumínico":"CON", "Mantención luminarias":"MAN", "Reparación juegos":"JUE"} },
    "ASEO Y BASURA": { depCod: "DMA", depName: "DIMAO", catCod: "ASE", subs: {"Solicitud fumigación":"FUM", "Basura acumulada":"BAS", "Microbasural":"MIC", "Retiro escombros":"ESC"} },
    "ÁREAS VERDES": { depCod: "DMA", depName: "DIMAO", catCod: "VER", subs: {"Poda árboles":"POD", "Árbol peligroso":"PEL", "Mantención plaza":"PLA"} },
    "SEGURIDAD": { depCod: "SEG", depName: "SEGURIDAD MUNICIPAL", catCod: "SEG", subs: {"Ruidos molestos":"RUI", "Consumo drogas":"DRO", "Peleas":"PEL", "Vehículos abandonados":"VEH", "Patrullaje":"PAT", "Cámaras seguridad":"CAM", "Alarmas comunitarias":"ALA"} },
    "MASCOTAS": { depCod: "DMA", depName: "DIMAO", catCod: "MAS", subs: {"Esterilización":"EST", "Vacunación":"VAC", "Operativo veterinario":"VET"} },
    "ESTRUCTURA VIAL": { depCod: "TRA", depName: "TRÁNSITO", catCod: "VIA", subs: {"Señalética y demarcación vial":"SEN", "Alumbrado paradero":"PAR", "Baches":"BAC", "Veredas rotas":"VER", "Semáforos":"SEM", "Accesibilidad":"ACC"} },
    "TRÁMITES MUNICIPALES": { depCod: "CON", depName: "OFICINA DEL CONCEJAL", catCod: "TRA", subs: {"Orientación municipal":"ORI", "Certificados":"CER", "Permisos":"PER", "Patentes":"PAT", "Derivaciones":"DER"} },
    "OPERATIVO TERRITORIAL": { depCod: "OPE", depName: "OPERATIVO TERRITORIAL", catCod: "OPT", subs: {"Oftalmológico":"OFT", "Salud":"SAL", "Podología":"POD"} }
};

const ETIQUETAS_SECTORES = {
    "Sector Territorial 1": "Sector Territorial 1 (UV 1)",
    "Sector Territorial 2": "Sector Territorial 2 (UV 2-3)",
    "Sector Territorial 3": "Sector Territorial 3 (UV 4-5)",
    "Sector Territorial 4": "Sector Territorial 4 (UV 14-15)",
    "Sector Territorial 5": "Sector Territorial 5 (UV 16-17)",
    "Sector Territorial 6": "Sector Territorial 6 (UV 18)",
    "No Sabe / Sin Información": "No Sabe / Sin Información"
};

inyectarEstructuraGlobal();

auth.onAuthStateChanged((user) => {
    if (user) {
        console.log("🟢 Autenticación exitosa. Cargando Módulo de Solicitudes...");
        actualizarPerfilLayout(user);
        inicializarRelojMundial();
        ejecutarMotorCargaSolicitudes();
        inicializarEscuchadoresFiltros();
        inicializarManejadorModalIngreso();
    } else {
        window.location.href = "index.html";
    }
});

function inicializarRelojMundial() {
    const clockContainer = document.getElementById("live-clock");
    if (!clockContainer) return;
    const render = () => {
        const ahora = new Date();
        clockContainer.innerText = `|   ${ahora.toLocaleDateString('es-CL')}   ${ahora.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    };
    render(); setInterval(render, 1000);
}

function mostrarAlertaPersonalizada(mensaje, tipo = "success") {
    const overlay = document.createElement("div");
    overlay.className = "custom-alert-overlay";

    let iconSvg = ""; let titleText = ""; let iconStyles = "";
    if (tipo === "success") {
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        titleText = "¡Operación Exitosa!";
        iconStyles = "background-color: rgba(16, 185, 129, 0.1); color: #10b981;";
    } else if (tipo === "info") {
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="12" x2="12" y2="16"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        titleText = "Notificación del Sistema";
        iconStyles = "background-color: rgba(37, 99, 235, 0.1); color: #2563eb;";
    } else {
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        titleText = "Acción Requerida";
        iconStyles = "background-color: rgba(239, 68, 68, 0.1); color: #ef4444;";
    }

    overlay.innerHTML = `
        <div class="custom-alert-card">
            <div class="custom-alert-icon" style="${iconStyles}">${iconSvg}</div>
            <div class="custom-alert-title">${titleText}</div>
            <div class="custom-alert-message">${mensaje}</div>
            <button class="btn-alert-confirm">Aceptar</button>
        </div>`;
    document.body.appendChild(overlay);
    const btnAceptar = overlay.querySelector(".btn-alert-confirm");
    if (btnAceptar) btnAceptar.focus();
    btnAceptar.addEventListener("click", () => overlay.remove());
}

function mostrarAlertaTicketCreado(nombre, rut, codigo) {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 999999; padding: 20px; box-sizing: border-box;";
    overlay.innerHTML = `
        <div style="background: #ffffff; width: 100%; max-width: 460px; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); overflow: hidden; display: flex; flex-direction: column; font-family: system-ui, -apple-system, sans-serif; animation: alertPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); box-sizing: border-box;">
            <div style="padding: 32px 32px 24px 32px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px;">
                <div style="width: 56px; height: 56px; background: #f0fdf4; color: #16a34a; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div>
                    <h3 style="margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">¡Operación Exitosa!</h3>
                    <p style="margin: 8px 0 0 0; font-size: 14px; color: #475569; line-height: 1.5;">Solicitud realizada y agregada al expediente del vecino<br><b>${nombre}</b> (RUT: ${rut}).</p>
                </div>
                <div style="width: 100%; background: #f8fafc; border: 2px dashed #cbd5e1; padding: 16px; border-radius: 12px; display: flex; flex-direction: column; gap: 6px; box-sizing: border-box; position: relative;">
                    <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.5px; display: block;">Código del Vecino</span>
                    <strong style="font-size: 26px; color: #0b438c; font-family: monospace; letter-spacing: 1px; display: block; margin-bottom: 4px;">${codigo}</strong>
                    <button id="btn-copiar-capsula" style="background: #ffffff; border: 1px solid #e2e8f0; color: #475569; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; margin: 0 auto; box-shadow: 0 1px 2px rgba(0,0,0,0.05); outline: none; transition: 0.2s;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        <span id="txt-copiar-capsula">Copiar Código</span>
                    </button>
                </div>
            </div>
            <div style="background: #f8fafc; padding: 16px 32px 24px 32px; border-top: 1px solid #e2e8f0; display: flex; justify-content: center;">
                <button id="btn-alerta-exito-ok" style="width: 100%; background: #2563eb; color: #ffffff; border: none; padding: 12px; font-size: 15px; font-weight: 700; border-radius: 8px; cursor: pointer; transition: background 0.2s; outline: none; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">Aceptar</button>
            </div>
        </div>
        <style>
            @keyframes alertPop { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
            #btn-copiar-capsula:hover { background: #f1f5f9 !important; }
            #btn-alerta-exito-ok:hover { background: #1d4ed8 !important; }
        </style>
    `;
    document.body.appendChild(overlay);
    const btnCopiar = overlay.querySelector("#btn-copiar-capsula");
    btnCopiar.addEventListener("click", () => {
        navigator.clipboard.writeText(codigo).then(() => {
            const txt = overlay.querySelector("#txt-copiar-capsula");
            txt.innerText = "¡Copiado!";
            btnCopiar.style.background = "#f0fdf4";
            btnCopiar.style.color = "#16a34a";
            btnCopiar.style.borderColor = "#86efac";
            setTimeout(() => { 
                txt.innerText = "Copiar Código"; 
                btnCopiar.style.background = "#ffffff"; 
                btnCopiar.style.color = "#475569";
                btnCopiar.style.borderColor = "#e2e8f0"; 
            }, 2000);
        });
    });
    overlay.querySelector("#btn-alerta-exito-ok").onclick = () => { overlay.remove(); };
}

async function abrirVisorVecino(id) {
    try {
        const docRef = doc(db, "vecinos", id); const docSnap = await getDoc(docRef); if (!docSnap.exists()) return;
        const data = docSnap.data(); const fotoSrc = data.fotoPerfil || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100";
        const fNacimientoFormatted = data.fechaNacimiento ? data.fechaNacimiento.split("-").reverse().join("/") : "No registrada";

        const snapSolicitudes = await getDocs(query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID), where("idVecino", "==", id)));
        let solicitudesLista = []; snapSolicitudes.forEach(sDoc => { solicitudesLista.push({ id: sDoc.id, ...sDoc.data() }); });
        solicitudesLista.sort((a, b) => (b.fechaCreacion?.seconds || 0) - (a.fechaCreacion?.seconds || 0));

        const modalOverlay = document.createElement("div"); 
        modalOverlay.className = "profile-modal-overlay";
        modalOverlay.style.zIndex = "2500"; 

        let solicitudesHTML = "";
        if (solicitudesLista.length > 0) {
            solicitudesLista.forEach(sol => {
                const fCreacionObj = sol.fechaCreacion ? new Date(sol.fechaCreacion.seconds * 1000) : new Date();
                const d = String(fCreacionObj.getDate()).padStart(2, '0'); const m = String(fCreacionObj.getMonth() + 1).padStart(2, '0'); const a = String(fCreacionObj.getFullYear()).slice(-2);
                const codigoTicket = sol.codigoInterno || sol.codigo || `${(sol.idVecino || "000").substring(0, 4).toUpperCase()}-${d}${m}${a}-${sol.id.substring(0, 3).toUpperCase()}`;

                solicitudesHTML += `
                    <div style="padding: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <div style="font-weight: 700; font-size: 14px; color: #1e3a8a;">#${codigoTicket} - ${sol.motivo}</div>
                            <span style="font-size: 11px; padding: 4px 10px; border-radius: 12px; font-weight: bold; background: #f1f5f9; color: #475569;">${sol.estadoGestion || sol.estado}</span>
                        </div>
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 8px;">Derivada a: <b style="color: #334155;">${sol.oficinaDerivada || 'No asignada'}</b> el ${fCreacionObj.toLocaleDateString('es-CL')}</div>
                        <p style="color: #0f172a; margin: 0; font-size: 13px; line-height: 1.5;">${sol.descripcion || 'Sin descripción detallada.'}</p>
                    </div>`;
            });
        } else { 
            solicitudesHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-size: 13px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px;">Este vecino no registra requerimientos territoriales históricos.</div>`; 
        }

        const sectorVisorLabel = ETIQUETAS_SECTORES[data.sectorTerritorial] || data.sectorTerritorial || "Sin Información";

        let docHTML = "";
        if (data.urlDocumento) {
            docHTML = `
                <div style="padding: 16px 20px; background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid #8b5cf6; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-size: 14px; font-weight: 600; color: #0f172a;">${data.nombreDocumento || "Documento de Respaldo"}</span>
                    <a href="${data.urlDocumento}" target="_blank" style="color: #2563eb; display: flex; align-items: center; font-weight: 600; font-size: 13px; text-decoration: none;" title="Ver documento">
                        Ver archivo <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="margin-left: 4px;"><path d="M1 12s4-8 11-8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </a>
                </div>`;
        } else {
            docHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-size: 13px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px;">No se registran archivos PDF o documentos anexos en este expediente.</div>`;
        }

        modalOverlay.innerHTML = `
            <div class="profile-modal-card" style="max-width: 760px; width: 95%; border-radius: 12px; overflow: hidden; background: #fff; display: flex; flex-direction: column;">
                <div style="background: #154c8a; padding: 20px 24px; color: white; position: relative;">
                    <h2 style="margin: 0; font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px;">Expediente Digital</h2>
                    <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.85;">SIGEV - Visualización de Hoja de Vida Territorial</p>
                    <button class="btn-profile-close" style="position: absolute; top: 16px; right: 16px; background: rgba(255,255,255,0.15); border: none; color: white; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">&times;</button>
                </div>
                <div class="profile-modal-tabs" style="display: flex; gap: 24px; padding: 0 24px; border-bottom: 1px solid #e2e8f0; background: #fff;">
                    <div class="profile-tab active" data-target="v-panel-basicos" style="padding: 16px 0; font-size: 13px; font-weight: 600; color: #154c8a; border-bottom: 2px solid #154c8a; cursor: pointer;">Datos Básicos</div>
                    <div class="profile-tab" data-target="v-panel-solicitudes" style="padding: 16px 0; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer;">Solicitudes</div>
                    <div class="profile-tab" data-target="v-panel-avanzados" style="padding: 16px 0; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer;">Datos Avanzados</div>
                    <div class="profile-tab" data-target="v-panel-adicional" style="padding: 16px 0; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer;">Info Adicional</div>
                    <div class="profile-tab" data-target="v-panel-documentos" style="padding: 16px 0; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer;">Documentos</div>
                </div>
                <div class="profile-modal-body" style="padding: 32px 24px; max-height: 65vh; overflow-y: auto; background: #ffffff;">
                    <div class="profile-panel active" id="v-panel-basicos" style="display: block;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px dashed #e2e8f0;">
                            <div style="display: flex; align-items: center; gap: 16px;">
                                <img src="${fotoSrc}" style="width: 72px; height: 72px; border-radius: 50%; object-fit: cover; background: #f1f5f9; border: 1px solid #e2e8f0;">
                                <div>
                                    <h3 style="margin: 0; font-size: 20px; font-weight: 800; color: #0f172a;">${data.nombreCompleto || 'Sin nombre'}</h3>
                                    <p style="margin: 4px 0 0 0; font-size: 13.5px; color: #64748b; display: flex; align-items: center; gap: 6px;">
                                        RUN: <span style="color: #334155; font-weight: 600;">${data.rut || 'No registrado'}</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px;">
                            <div><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">TELÉFONO</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${data.telefono || 'No registrado'}</p></div>
                            <div><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">FECHA NACIMIENTO</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${fNacimientoFormatted}</p></div>
                            <div><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">DIRECCIÓN</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${data.direccion || 'No registrada'}</p></div>
                            <div><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">SECTOR TERRITORIAL</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${sectorVisorLabel}</p></div>
                            <div><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">UNIDAD VECINAL (UV)</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${data.unidadVecinal || 'Sin Información'}</p></div>
                            <div><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">JUNTA DE VECINOS</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${data.juntaVecinos || 'Sin Información'}</p></div>
                            <div style="grid-column: span 2;"><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">BARRIO / VILLA POPULAR</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${data.barrioPopular || 'Sin Información'}</p></div>
                        </div>
                    </div>
                    <div class="profile-panel" id="v-panel-solicitudes" style="display: none;">${solicitudesHTML}</div>
                    <div class="profile-panel" id="v-panel-avanzados" style="display: none;">
                        <div style="display: grid; gap: 24px;">
                            <div><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">OCUPACIÓN / OFICIO</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${data.ocupacion || "No registrada"}</p></div>
                        </div>
                    </div>
                    <div class="profile-panel" id="v-panel-adicional" style="display: none;">
                        <div style="display: grid; gap: 16px;">
                            <div>
                                <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">OBSERVACIONES CRÍTICAS DE TERRENO</label>
                                <div style="margin-top: 12px; font-size: 13.5px; line-height: 1.6; color: #334155; white-space: pre-wrap; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">${data.observaciones || "No se registran observaciones adicionales."}</div>
                            </div>
                        </div>
                    </div>
                    <div class="profile-panel" id="v-panel-documentos" style="display: none;">${docHTML}</div>
                </div>
            </div>`;
        document.body.appendChild(modalOverlay);

        const tabs = modalOverlay.querySelectorAll(".profile-tab");
        const panels = modalOverlay.querySelectorAll(".profile-panel");
        tabs.forEach(t => t.addEventListener("click", () => {
            tabs.forEach(tab => {
                tab.classList.remove("active");
                tab.style.borderBottom = "none";
                tab.style.color = "#64748b";
            }); 
            panels.forEach(p => p.style.display = "none");
            
            t.classList.add("active"); 
            t.style.borderBottom = "2px solid #154c8a";
            t.style.color = "#154c8a";
            modalOverlay.querySelector(`#${t.getAttribute("data-target")}`).style.display = "block";
        }));

        modalOverlay.querySelector(".btn-profile-close").addEventListener("click", () => modalOverlay.remove());
    } catch (error) { console.error(error); }
}

async function abrirEditorVecino(id) {
    try {
        const docRef = doc(db, "vecinos", id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            mostrarAlertaPersonalizada("No se encontró el registro.", "error");
            return;
        }

        const data = docSnap.data();
        const fotoSrc = data.fotoPerfil || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100";

        const modalOverlay = document.createElement("div");
        modalOverlay.className = "profile-modal-overlay";

        let opcionesSectoresHTML = `<option value="">Seleccione Sector</option>`;
        Object.keys(MAPEO_TERRITORIAL).forEach(sec => { opcionesSectoresHTML += `<option value="${sec}" ${data.sectorTerritorial === sec ? 'selected' : ''}>${ETIQUETAS_SECTORES[sec] || sec}</option>`; });

        let opcionesUvsHTML = `<option value="">Seleccione UV</option>`;
        if (data.sectorTerritorial && MAPEO_TERRITORIAL[data.sectorTerritorial]) { MAPEO_TERRITORIAL[data.sectorTerritorial].uvs.forEach(uv => { opcionesUvsHTML += `<option value="${uv}" ${data.unidadVecinal === uv ? 'selected' : ''}>${uv}</option>`; }); }

        let opcionesJuntasTerritorialesHTML = `<option value="">Seleccione Junta</option>`;
        if (data.sectorTerritorial && data.unidadVecinal && MAPEO_TERRITORIAL[data.sectorTerritorial]?.juntas[data.unidadVecinal]) { MAPEO_TERRITORIAL[data.sectorTerritorial].juntas[data.unidadVecinal].forEach(j => { opcionesJuntasTerritorialesHTML += `<option value="${j}" ${data.juntaVecinos === j ? 'selected' : ''}>${j}</option>`; }); }

        const qSolsEdit = query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID), where("idVecino", "==", id));
        const snapSolicitudesEdit = await getDocs(qSolsEdit);
        let solicitudesListaEdit = [];
        snapSolicitudesEdit.forEach(sDoc => { solicitudesListaEdit.push({ id: sDoc.id, ...sDoc.data() }); });
        solicitudesListaEdit.sort((a, b) => (b.fechaCreacion?.seconds || 0) - (a.fechaCreacion?.seconds || 0));

        let solicitudesRenderHTML = "";
        if (solicitudesListaEdit.length > 0) {
            solicitudesListaEdit.forEach(sol => {
                const fCreacionObj = sol.fechaCreacion ? new Date(sol.fechaCreacion.seconds * 1000) : new Date();
                const d = String(fCreacionObj.getDate()).padStart(2, '0'); const m = String(fCreacionObj.getMonth() + 1).padStart(2, '0'); const a = String(fCreacionObj.getFullYear()).slice(-2);
                const codigoTicket = sol.codigoInterno || sol.codigo || `${(sol.idVecino || "000").substring(0, 4).toUpperCase()}-${d}${m}${a}-${sol.id.substring(0, 3).toUpperCase()}`;

                solicitudesRenderHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #fff; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                        <div>
                            <div style="font-weight: 700; font-size: 13px; color: var(--primary-blue); margin-bottom: 3px;">#${codigoTicket}</div>
                            <div style="font-weight: 600; font-size: 12.5px; color: var(--text-dark);">${sol.motivo} <span style="font-weight: normal; color: var(--text-light);">(${sol.subcategoria || 'Gral'})</span></div>
                            <div style="font-size: 11px; color: var(--text-light); margin-top: 4px;">Estado: <b style="color: var(--text-dark);">${sol.estado}</b> | Prioridad: <b>${sol.prioridad || 'Media'}</b></div>
                        </div>
                    </div>`;
            });
        } else { solicitudesRenderHTML = `<div class="no-data-placeholder"><p>No se registran solicitudes activas para este vecino.</p></div>`; }

        modalOverlay.innerHTML = `
            <div class="profile-modal-card">
                <div class="profile-modal-header" style="background: linear-gradient(135deg, #1e293b, #475569);">
                    <div class="modal-avatar-wrapper" style="position: relative;">
                        <img src="${fotoSrc}" class="profile-modal-avatar" id="edit-modal-preview">
                    </div>
                    <div class="profile-header-info"><h3>Modificando Expediente</h3><p>RUT: ${data.rut}</p></div>
                    <button class="btn-profile-close">&times;</button>
                </div>
                <div class="profile-modal-tabs">
                    <div class="profile-tab active" data-target="e-panel-basicos">Datos Básicos</div>
                    <div class="profile-tab" data-target="e-panel-solicitudes">Solicitud Territorial</div>
                </div>
                <div class="profile-modal-body">
                    <div class="profile-panel active" id="e-panel-basicos">
                        <div class="form-row-grid" style="margin-bottom: 14px;">
                            <div class="form-group"><label>Nombre completo</label><input type="text" id="e-vecino-nombre" value="${data.nombreCompleto || ''}"></div>
                            <div class="form-group"><label>Teléfono celular</label><input type="text" id="e-vecino-telefono" value="${data.telefono || ''}"></div>
                        </div>
                        <div class="form-row-grid" style="margin-bottom: 14px;">
                            <div class="form-group"><label>Sector Territorial</label><select id="e-vecino-sector-territorial">${opcionesSectoresHTML}</select></div>
                            <div class="form-group"><label>Unidad Vecinal</label><select id="e-vecino-unidad-vecinal">${opcionesUvsHTML}</select></div>
                        </div>
                        <div class="form-row-grid" style="margin-bottom: 14px;">
                            <div class="form-group"><label>Junta de Vecinos</label><select id="e-vecino-junta-vecinal">${opcionesJuntasTerritorialesHTML}</select></div>
                            <div class="form-group"><label>Barrio / Villa</label><input type="text" id="e-vecino-barrio-popular" value="${data.barrioPopular || ''}"></div>
                        </div>
                    </div>
                    <div class="profile-panel" id="e-panel-solicitudes">${solicitudesRenderHTML}</div>
                </div>
                <div style="padding: 16px 32px; background: #f8fafc; display: flex; justify-content: flex-end; gap: 12px;">
                    <button class="btn btn-secondary btn-modal-cancel">Cancelar</button>
                    <button class="btn btn-primary btn-modal-save" style="background-color: #0b438c;">Guardar cambios</button>
                </div>
            </div>`;
        document.body.appendChild(modalOverlay);

        const eSecTerr = modalOverlay.querySelector("#e-vecino-sector-territorial");
        const eUvTerr = modalOverlay.querySelector("#e-vecino-unidad-vecinal");
        const eJuntTerr = modalOverlay.querySelector("#e-vecino-junta-vecinal");

        eSecTerr.addEventListener("change", (e) => {
            const sec = e.target.value; eUvTerr.innerHTML = '<option value="">Seleccione UV</option>'; eJuntTerr.innerHTML = '<option value="">Seleccione Junta</option>'; eJuntTerr.disabled = true;
            if (sec && MAPEO_TERRITORIAL[sec]) { MAPEO_TERRITORIAL[sec].uvs.forEach(uv => { eUvTerr.innerHTML += `<option value="${uv}">${uv}</option>`; }); eUvTerr.disabled = false; }
        });
        eUvTerr.addEventListener("change", (e) => {
            const sec = eSecTerr.value; const uv = e.target.value; eJuntTerr.innerHTML = '<option value="">Seleccione Junta</option>';
            if (sec && uv && MAPEO_TERRITORIAL[sec]?.juntas[uv]) { MAPEO_TERRITORIAL[sec].juntas[uv].forEach(j => { eJuntTerr.innerHTML += `<option value="${j}">${j}</option>`; }); eJuntTerr.disabled = false; }
        });

        const tabs = modalOverlay.querySelectorAll(".profile-tab"); const panels = modalOverlay.querySelectorAll(".profile-panel");
        tabs.forEach(t => t.addEventListener("click", () => {
            tabs.forEach(tab => tab.classList.remove("active")); panels.forEach(p => p.classList.remove("active"));
            t.classList.add("active"); modalOverlay.querySelector(`#${t.getAttribute("data-target")}`).classList.add("active");
        }));

        modalOverlay.querySelector(".btn-profile-close").onclick = () => modalOverlay.remove();
        modalOverlay.querySelector(".btn-modal-cancel").onclick = () => modalOverlay.remove();

        const btnSave = modalOverlay.querySelector(".btn-modal-save");
        btnSave.onclick = async () => {
            const nuevoNombre = modalOverlay.querySelector("#e-vecino-nombre").value.trim(); if (!nuevoNombre) return;
            btnSave.disabled = true; btnSave.innerText = "Sincronizando...";
            try {
                await updateDoc(docRef, {
                    nombreCompleto: nuevoNombre, telefono: modalOverlay.querySelector("#e-vecino-telefono").value.trim(),
                    sectorTerritorial: eSecTerr.value || "Sin Información", unidadVecinal: eUvTerr.value || "Sin Información",
                    juntaVecinos: eJuntTerr.value || "Sin Información", barrioPopular: modalOverlay.querySelector("#e-vecino-barrio-popular").value.trim() || "Sin Información"
                });
                modalOverlay.remove(); renderizarMetricasServidor(); await ejecutarMotorCargaSolicitudes();
            } catch (err) { console.error(err); btnSave.disabled = false; }
        };
    } catch (e) { console.error(e); }
}

async function ejecutarMotorCargaSolicitudes() {
    try {
        console.log("⏳ Descargando solicitudes para Tenant:", CURRENT_TENANT_ID);
        const snapGlobal = await getDocs(query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID)));
        
        solicitudesGlobalesMemory = [];
        snapGlobal.forEach(sDoc => { solicitudesGlobalesMemory.push({ id: sDoc.id, ...sDoc.data() }); });
        
        console.log(`✅ ${solicitudesGlobalesMemory.length} solicitudes encontradas en la nube.`);

        solicitudesGlobalesMemory.sort((a, b) => {
            const timeA = a.fechaCreacion?.seconds || 0;
            const timeB = b.fechaCreacion?.seconds || 0;
            return timeB - timeA;
        });

        aplicarFiltrosCruzadosInterfaz();
        actualizarContadoresPestañasSolicitudes();
        calcularEstadisticasAvanzadas(); // 🚀 ¡AQUÍ SE EJECUTA!
    } catch (err) { 
        console.error("❌ Error CRÍTICO cargando solicitudes:", err); 
    }
}

// 🚀 NUEVA: Calcula estadísticas avanzadas para el Concejal en memoria (Ahorra lecturas a BD)
function calcularEstadisticasAvanzadas() {
    if (solicitudesGlobalesMemory.length === 0) return;

    let total = solicitudesGlobalesMemory.length;
    let resueltos = 0;
    let sumaTiempos = 0;
    let casosResueltosConTiempo = 0;

    let categoriasCount = {};
    let deptosActivosCount = {};

    solicitudesGlobalesMemory.forEach(sol => {
        const eOrig = sol.estado || "Nuevo";
        const eGest = sol.estadoGestion || "";
        const isFinalizada = eOrig === "Resuelto" || eGest.includes("Respondido") || eGest.includes("Finalizada") || eGest.includes("Caso Resuelto");

        // 1. Tasa de Resolución
        if (isFinalizada) resueltos++;

        // 2. Tiempo Promedio de Resolución (Dias)
        if (isFinalizada && sol.fechaCreacion && sol.fechaFinalizada) {
            const tCreacion = sol.fechaCreacion.seconds;
            const tFin = sol.fechaFinalizada.seconds;
            if (tFin >= tCreacion) {
                sumaTiempos += (tFin - tCreacion);
                casosResueltosConTiempo++;
            }
        }

        // 3. Categoría más solicitada (Histórica)
        const cat = sol.motivo || sol.categoria || sol.categoriaOficial || "General";
        categoriasCount[cat] = (categoriasCount[cat] || 0) + 1;

        // 4. Depto con más carga (Solo contamos los NO finalizados ni archivados)
        if (!isFinalizada && eOrig !== "Archivado" && sol.oficinaDerivada) {
            const depto = sol.oficinaDerivada;
            deptosActivosCount[depto] = (deptosActivosCount[depto] || 0) + 1;
        }
    });

    // Inyectar Tasa de Resolución
    const tasa = Math.round((resueltos / total) * 100);
    const elTasa = document.getElementById("kpi-tasa-resolucion");
    if (elTasa) elTasa.innerText = `${tasa}%`;
    const elTasaSub = document.getElementById("kpi-tasa-sub");
    if (elTasaSub) elTasaSub.innerText = `${resueltos} de ${total} tickets`;

    // Inyectar Tiempo Promedio
    const elTiempo = document.getElementById("kpi-tiempo-promedio");
    if (elTiempo) {
        if (casosResueltosConTiempo > 0) {
            const promSegundos = sumaTiempos / casosResueltosConTiempo;
            const promDias = Math.round(promSegundos / 86400); // 86400 segs en 1 día
            elTiempo.innerText = promDias === 0 ? "< 1 Día" : `${promDias} Días`;
        } else {
            elTiempo.innerText = "--";
        }
    }

    // Inyectar Categoría Top
    let catTop = "N/A"; let maxCat = 0;
    for (const [c, count] of Object.entries(categoriasCount)) {
        if (count > maxCat) { maxCat = count; catTop = c; }
    }
    const elCatTop = document.getElementById("kpi-categoria-top");
    if (elCatTop) elCatTop.innerText = catTop.length > 15 ? catTop.substring(0, 15) + "..." : catTop;
    const elCatSub = document.getElementById("kpi-categoria-sub");
    if (elCatSub) elCatSub.innerText = `${maxCat} solicitudes`;

    // Inyectar Depto Top
    let deptoTop = "No hay carga"; let maxDepto = 0;
    for (const [d, count] of Object.entries(deptosActivosCount)) {
        if (count > maxDepto) { maxDepto = count; deptoTop = d; }
    }
    const elDeptoTop = document.getElementById("kpi-depto-top");
    if (elDeptoTop) elDeptoTop.innerText = deptoTop.length > 15 ? deptoTop.substring(0, 15) + "..." : deptoTop;
    const elDeptoSub = document.getElementById("kpi-depto-sub");
    if (elDeptoSub) elDeptoSub.innerText = `${maxDepto} casos activos`;
}

function aplicarFiltrosCruzadosInterfaz() {
    const textoBusqueda = document.getElementById("filter-solicitud-codigo")?.value.toLowerCase().trim() || "";
    const tipoSelect = document.getElementById("filter-tipo")?.value || "Todos";
    const prioSelect = document.getElementById("filter-prioridad")?.value || "Todos";
    const fDesde = document.getElementById("filter-fecha-desde")?.value || "";
    const fHasta = document.getElementById("filter-fecha-hasta")?.value || "";

    let filtrados = solicitudesGlobalesMemory.filter(sol => {
        if (textoBusqueda) {
            const ticketCodigo = (sol.codigo || "").toLowerCase();
            const ticketInterno = (sol.codigoInterno || "").toLowerCase();
            const nombreVecino = (sol.vecinoNombre || sol.nombreVecino || "").toLowerCase();
            
            const rutRaw = (sol.vecinoRut || sol.rutVecino || "").toLowerCase();
            const rutCleanDB = rutRaw.replace(/[^0-9k]/g, "");
            const textoRutClean = textoBusqueda.replace(/[^0-9k]/g, "");

            const coincideCodigo = ticketCodigo.includes(textoBusqueda) || ticketInterno.includes(textoBusqueda);
            const coincideNombre = nombreVecino.includes(textoBusqueda);
            
            let coincideRut = rutRaw.includes(textoBusqueda);
            if (!coincideRut && textoRutClean.length > 2) {
                coincideRut = rutCleanDB.includes(textoRutClean);
            }

            if (!coincideCodigo && !coincideNombre && !coincideRut) return false;
        }
        
        let matchesEstado = false;
        const eOrig = sol.estado || "Nuevo";
        const eGest = sol.estadoGestion || "";
        const cat = sol.categoria || ""; 
        const filtroLow = estadoFiltroKPIActivo.toLowerCase();

        if (filtroLow === "todos") {
            matchesEstado = true;
        } else if (filtroLow.includes("por clasificar") || filtroLow.includes("pendiente de triage")) {
            // 🚀 AQUÍ ATRAPAMOS LOS TICKETS DE MIGRACIÓN
            matchesEstado = (cat === "Pendiente de Triage" || eGest.includes("migración masiva") || eGest === "Pendiente de Triage");
        } else if (filtroLow.includes("clasificado") || filtroLow.includes("revisión")) {
            matchesEstado = (eOrig === "Clasificado" && (eGest === "En revisión" || eGest === "") && cat !== "Pendiente de Triage");
        } else if (filtroLow.includes("derivado") || filtroLow.includes("gestión")) {
            matchesEstado = (eGest === "Derivada" || eGest === "En gestión");
        } else if (filtroLow.includes("responder")) {
            matchesEstado = (eGest === "Finalizado en espera de respuesta");
        } else if (filtroLow.includes("finalizado") || filtroLow.includes("resuelto")) {
            matchesEstado = (eOrig === "Resuelto" || eGest.includes("Respondido") || eGest.includes("Finalizada") || eGest.includes("Caso Resuelto"));
        } else {
            matchesEstado = (eOrig === estadoFiltroKPIActivo || eGest === estadoFiltroKPIActivo);
        }

        if (!matchesEstado) return false;

        if (tipoSelect !== "Todos") {
            const catDB = sol.motivo || sol.categoria || sol.categoriaOficial || "";
            if (catDB !== tipoSelect) return false;
        }

        if (prioSelect !== "Todos" && sol.prioridad !== prioSelect) return false;

        if (sol.fechaCreacion) {
            const fechaTicket = new Date(sol.fechaCreacion.seconds * 1000);
            if (fDesde) {
                const desdeDate = new Date(fDesde + "T00:00:00");
                if (fechaTicket < desdeDate) return false;
            }
            if (fHasta) {
                const hastaDate = new Date(fHasta + "T23:59:59");
                if (fechaTicket > hastaDate) return false;
            }
        }
        return true;
    });
    
    paginaActual = 1;
    inyectarFilasTablaSolicitudes(filtrados);
}

// 🚀 NUEVA: Función para actualizar los contadores en las pestañas
function actualizarContadoresPestañasSolicitudes() {
    let cPorClasificar = 0, cClasificados = 0, cDerivados = 0, cResponder = 0, cFinalizados = 0;

    solicitudesGlobalesMemory.forEach(sol => {
        const eOrig = sol.estado || "Nuevo";
        const eGest = sol.estadoGestion || "";
        const cat = sol.categoria || ""; 
        
        // 🚀 SUMAMOS LOS TICKETS AL GLOBO ROJO
        if (cat === "Pendiente de Triage" || eGest.includes("migración masiva") || eGest === "Pendiente de Triage") cPorClasificar++;
        else if (eOrig === "Clasificado" && (eGest === "En revisión" || eGest === "")) cClasificados++;
        else if (eGest === "Derivada" || eGest === "En gestión") cDerivados++;
        else if (eGest === "Finalizado en espera de respuesta") cResponder++;
        else if (eOrig === "Resuelto" || eGest.includes("Respondido") || eGest.includes("Finalizada") || eGest.includes("Caso Resuelto")) cFinalizados++;
    });

    const elPorClas = document.getElementById("tab-count-clasificar");
    const elClas = document.getElementById("tab-count-clasificados");
    const elDer = document.getElementById("tab-count-derivados");
    const elResp = document.getElementById("tab-count-responder");
    const elFin = document.getElementById("tab-count-finalizados");

    if (elPorClas) elPorClas.innerText = cPorClasificar;
    if (elClas) elClas.innerText = cClasificados;
    if (elDer) elDer.innerText = cDerivados;
    if (elResp) elResp.innerText = cResponder;
    if (elFin) elFin.innerText = cFinalizados;
}

function inyectarFilasTablaSolicitudes(listaTickets) {
    const tbody = document.querySelector("#tabla-global-solicitudes tbody"); 
    if (!tbody) { return; }
    
    const inicio = (paginaActual - 1) * filasPorPagina;
    const fin = inicio + filasPorPagina;
    const ticketsPaginados = listaTickets.slice(inicio, fin);
    
    let html = "";

    ticketsPaginados.forEach((sol, index) => {
        try {
            const dateObj = sol.fechaCreacion ? new Date(sol.fechaCreacion.seconds * 1000) : new Date();
            const estadoActual = sol.estadoGestion || sol.estado || "Abierta";
            let classEstado = "revision";
            
            // 🚀 COLOR ROJO PARA LOS DE TRIAGE EN LA TABLA
            if(sol.categoria === "Pendiente de Triage" || estadoActual.includes("migración masiva") || estadoActual === "Pendiente de Triage") classEstado = "vencida";
            else if(estadoActual === "En revisión") classEstado = "revision";
            else if(estadoActual === "En gestión" || estadoActual === "Derivada" || estadoActual === "Finalizado en espera de respuesta") classEstado = "gestion";
            else if(estadoActual.includes("Finalizada") || sol.estado === "Resuelto") classEstado = "finalizada";
            
            html += `
                <tr class="table-row-clickable" data-index="${inicio + index}">
                    <td><input type="checkbox" class="row-selector-checkbox"></td>
                    <td style="white-space: nowrap;"><span class="stacked-cell-primary">${dateObj.toLocaleDateString('es-CL')}</span><span class="stacked-cell-secondary">${dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span></td>
                    <td style="min-width: 160px;"><span class="stacked-cell-primary" style="font-weight: 700; color: #0f172a;">${sol.vecinoNombre || sol.nombreVecino || 'Sin Nombre'}</span><span class="stacked-cell-secondary">RUT: ${sol.vecinoRut || sol.rutVecino || "S/R"}</span></td>
                    <td style="min-width: 140px;"><span class="stacked-cell-primary" style="font-weight: 700; color: #1e3a8a;">${sol.categoria || sol.motivo || "Petición"}</span><span class="stacked-cell-secondary">${sol.subcategoria || "Gral"}</span></td>
                    <td style="min-width: 130px;"><span class="stacked-cell-primary" style="font-size:12px; font-weight:600; color: #475569;">${sol.oficinaDerivada || "Equipo Territorial"}</span></td>
                    <td style="min-width: 120px;"><span class="badge-status ${classEstado}">${estadoActual}</span></td>
                    <td><span class="badge-priority ${(sol.prioridad || "Media").toLowerCase()}">${sol.prioridad || "Media"}</span></td>
                </tr>`;
        } catch (e) { console.warn("⚠️ Solicitud ignorada por falta de formato en BD:", sol.id, e); }
    });

    tbody.innerHTML = html || `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-light);">No se encontraron solicitudes con estos filtros.</td></tr>`;
    
    tbody.querySelectorAll(".table-row-clickable").forEach(tr => {
        tr.addEventListener("click", (e) => {
            if(e.target.closest('input')) return;
            document.querySelectorAll(".table-row-clickable").forEach(r => r.classList.remove("active-row"));
            tr.classList.add("active-row");
            const idx = tr.getAttribute("data-index");
            mostrarDetallesEnPanel(listaTickets[idx]); 
        });
    });

    renderizarPaginacion(listaTickets);
}

function renderizarPaginacion(listaFiltrada) {
    const totalItems = listaFiltrada.length;
    const totalPages = Math.ceil(totalItems / filasPorPagina);
    
    const countLabel = document.getElementById("pagination-info-text");
    const inicioNum = totalItems === 0 ? 0 : (paginaActual - 1) * filasPorPagina + 1;
    const finNum = Math.min(paginaActual * filasPorPagina, totalItems);
    
    if(countLabel) countLabel.innerText = `Mostrando ${inicioNum} a ${finNum} de ${totalItems} solicitudes`;
    
    const btnPrev = document.getElementById("page-prev");
    const btnNext = document.getElementById("page-next");
    const numbersContainer = document.getElementById("page-numbers-container");
    
    if(!btnPrev || !btnNext || !numbersContainer) return;
    
    btnPrev.disabled = paginaActual === 1;
    btnNext.disabled = paginaActual === totalPages || totalPages === 0;
    
    const newBtnPrev = btnPrev.cloneNode(true);
    btnPrev.parentNode.replaceChild(newBtnPrev, btnPrev);
    newBtnPrev.onclick = () => { if(paginaActual > 1) { paginaActual--; inyectarFilasTablaSolicitudes(listaFiltrada); } };
    
    const newBtnNext = btnNext.cloneNode(true);
    btnNext.parentNode.replaceChild(newBtnNext, btnNext);
    newBtnNext.onclick = () => { if(paginaActual < totalPages) { paginaActual++; inyectarFilasTablaSolicitudes(listaFiltrada); } };
    
    numbersContainer.innerHTML = "";
    
    let startPage = Math.max(1, paginaActual - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    for(let i = startPage; i <= endPage; i++) {
        const btn = document.createElement("button");
        btn.innerText = i;
        btn.className = `page-nav-btn`;
        btn.style.width = "30px";
        btn.style.height = "30px";
        btn.style.border = "1px solid #cbd5e1";
        btn.style.background = "#fff";
        btn.style.borderRadius = "4px";
        btn.style.cursor = "pointer";
        
        if(i === paginaActual) {
            btn.style.background = "#2563eb";
            btn.style.color = "white";
            btn.style.borderColor = "#2563eb";
            btn.style.fontWeight = "bold";
        }
        
        btn.onclick = () => { paginaActual = i; inyectarFilasTablaSolicitudes(listaFiltrada); };
        numbersContainer.appendChild(btn);
    }
}

function mostrarDetallesEnPanel(sol) {
    const pVacio = document.getElementById("panel-vacio");
    if (pVacio) pVacio.style.display = "none";

    const panelContenido = document.getElementById("panel-contenido");
    if (!panelContenido) return;
    
    panelContenido.style.cssText = "display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; font-family: system-ui, -apple-system, sans-serif;";

    const fCreacionObj = sol.fechaCreacion ? new Date(sol.fechaCreacion.seconds * 1000) : new Date();
    const fechaStr = `${String(fCreacionObj.getDate()).padStart(2, '0')}-${String(fCreacionObj.getMonth() + 1).padStart(2, '0')}-${String(fCreacionObj.getFullYear()).slice(-2)}`;
    const horaStr = fCreacionObj.toLocaleTimeString('es-CL', {hour: '2-digit', minute:'2-digit'});

    const estadoVisual = sol.estadoGestion || sol.estado || "Nuevo";
    let bgBadge = "#e2e8f0", colorBadge = "#475569";
    if (estadoVisual === "Abierta" || estadoVisual === "Nuevo" || estadoVisual === "En revisión") { bgBadge = "#fef3c7"; colorBadge = "#d97706"; }
    if (estadoVisual === "En gestión" || estadoVisual === "Derivada" || estadoVisual === "Finalizado en espera de respuesta") { bgBadge = "#dbeafe"; colorBadge = "#2563eb"; }
    if (estadoVisual.includes("Finalizada") || sol.estado === "Resuelto") { bgBadge = "#dcfce7"; colorBadge = "#059669"; }

    let rutBadge = sol.idVecino ? `<span style="background: #dcfce7; color: #059669; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 800; border: 1px solid #6ee7b7; margin-left:8px; display:inline-flex; align-items:center; gap:4px;">✓ Registrado <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></span>` : ``;

    let clasifBox = "";
    if (sol.codigoInterno) {
        clasifBox = `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px;">
            <div style="font-size: 12px; font-weight: 700; color: #059669; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                ✓ REQUERIMIENTO CLASIFICADO
            </div>
            <div style="font-size: 13px; color: #0f172a; line-height: 1.6;">
                <b style="color: #475569;">ID Interno:</b> ${sol.codigoInterno}<br>
                <b style="color: #475569;">Derivado a:</b> ${sol.oficinaDerivada || 'N/A'}<br>
                <b style="color: #475569;">Responsable:</b> ${sol.asignadoA || sol.registradaPorNombre || 'N/A'}
            </div>
        </div>`;
    }

    panelContenido.innerHTML = `
        <button id="btn-cerrar-panel-mobile" style="position:absolute; top:16px; right:16px; background:#f1f5f9; border:none; width:32px; height:32px; border-radius:50%; display:none; align-items:center; justify-content:center; color:#475569; z-index:10; cursor:pointer;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        <div style="padding: 24px; border-bottom: 1px solid #e2e8f0; display: flex; gap: 16px; align-items: flex-start; position: relative; flex-shrink: 0;">
            <div style="width: 42px; height: 42px; background: #eff6ff; color: #2563eb; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
            <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                    <div>
                        <div style="font-size: 12px; font-weight: 700; color: #2563eb; margin-bottom: 2px;">${sol.codigo || 'S/N'}</div>
                        <h2 style="font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.3; margin: 0;">${sol.motivo || sol.categoria || "Requerimiento Presencial"}</h2>
                    </div>
                    <span style="background: ${bgBadge}; color: ${colorBadge}; font-size: 11px; padding: 4px 8px; border-radius: 4px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${estadoVisual}</span>
                </div>
                <div style="font-size: 12px; color: #64748b; margin-top: 4px;">
                    <span style="text-transform: capitalize;">${sol.categoria ? sol.categoria.toLowerCase() : 'General'}</span> • Ingresado el ${fechaStr} a las ${horaStr}
                </div>
            </div>
        </div>

        <div style="padding: 24px; overflow-y: auto; flex: 1; min-height: 0;">
            <div style="padding-bottom: 32px;"> 
                ${clasifBox}

                <div style="margin-bottom: 24px;">
                    <h4 style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">Información del Remitente</h4>
                    <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px 16px; font-size: 13px;">
                        <span style="color: #64748b;">Nombre:</span> <span style="color: #0f172a; font-weight: 600;">${sol.vecinoNombre || sol.nombreVecino || 'Desconocido'}</span>
                        <span style="color: #64748b;">RUT:</span> <span style="color: #0f172a; font-weight: 600; display:flex; align-items:center;">${sol.vecinoRut || sol.rutVecino || 'S/R'} ${rutBadge}</span>
                        <span style="color: #64748b;">Teléfono:</span> <span style="color: #0f172a; font-weight: 600;">${sol.vecinoTelefono || sol.telefono || 'No proporcionado'}</span>
                        <span style="color: #64748b;">Dirección:</span> <span style="color: #0f172a; font-weight: 600;">${sol.vecinoDireccion || sol.direccion || 'No proporcionado'}</span>
                    </div>
                </div>

                <div style="margin-bottom: 24px;">
                    <h4 style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">Descripción del Caso</h4>
                    <div style="border: 1px solid #e2e8f0; background: #ffffff; padding: 16px; border-radius: 8px; font-size: 13px; color: #334155; line-height: 1.5; white-space: pre-wrap;">${sol.descripcion || 'Sin descripción detallada.'}</div>
                </div>

                <button id="btn-ver-ficha-rapida" style="background: #2563eb; color: white; border: none; padding: 10px; border-radius: 6px; font-weight: 600; font-size: 13px; width: 100%; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 32px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    Ver Ficha Vecino
                </button>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                    <h4 style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; text-align: center;">Acciones Operativas</h4>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <button id="btn-abrir-reclasificar" style="background: #2563eb; color: white; border: none; padding: 10px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>
                            RECLASIFICAR REQUERIMIENTO
                        </button>
                        <button id="btn-archivar-rapido" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 10px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="5" rx="2" ry="2"></rect><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"></path><line x1="10" y1="13" x2="14" y2="13"></line></svg>
                            Archivar Sin Acción
                        </button>
                    </div>
                </div>

                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); margin-bottom: 16px;">
                    <h4 style="font-size: 12px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px;">
                        ⚙️ Gestión del Caso
                    </h4>
                    
                    <label style="font-size: 11px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 4px;">ESTADO DE GESTIÓN</label>
                    <select id="sel-estado-gestion" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; margin-bottom: 12px; background: white; outline: none; background-image: url('data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2364748b\\' stroke-width=\\'2.5\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'%3E%3Cpolyline points=\\'6 9 12 15 18 9\\'%3E%3C/polyline%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: right 10px center; background-size: 14px; -webkit-appearance: none;">
                        <option value="En revisión" ${estadoVisual === 'En revisión' ? 'selected' : ''}>En revisión</option>
                        <option value="Derivada" ${estadoVisual === 'Derivada' ? 'selected' : ''}>Derivada</option>
                        <option value="En gestión" ${estadoVisual === 'En gestión' ? 'selected' : ''}>En gestión</option>
                        <option value="Finalizada" ${estadoVisual.includes('Finalizada') || estadoVisual === 'Finalizado en espera de respuesta' ? 'selected' : ''}>Finalizada</option>
                    </select>
                    
                    <div id="info-box-gestion" style="padding: 12px; border-radius: 6px; font-size: 12px; margin-bottom: 12px; background: #ffffff; border: 1px dashed #94a3b8; color: #475569; line-height: 1.5;"></div>
                    
                    <div id="caja-respuesta-vecino" style="display: none; margin-bottom: 12px;"></div>

                    <button id="btn-guardar-gestion" style="background: #0f172a; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: 600; font-size: 13px; width: 100%; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        💾 Guardar Avance de Gestión
                    </button>
                </div>

                <button id="btn-ver-historial" style="background: #ffffff; color: #475569; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; font-weight: 600; font-size: 13px; width: 100%; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    Ver Historial de Trazabilidad
                </button>
            </div>
        </div>
    `;

    // LÓGICA DE BOTONES
    const btnCerrarM = document.getElementById("btn-cerrar-panel-mobile");
    if (btnCerrarM) {
        if (window.innerWidth <= 1024) btnCerrarM.style.display = "flex";
        btnCerrarM.onclick = () => { panelContenido.style.display = "none"; document.querySelectorAll(".table-row-clickable").forEach(r => r.classList.remove("active-row")); };
    }

    const btnVerVecino = document.getElementById("btn-ver-ficha-rapida");
    if(btnVerVecino && sol.idVecino) {
        btnVerVecino.onclick = () => { abrirVisorVecino(sol.idVecino); };
    } else if (btnVerVecino) { btnVerVecino.style.display = "none"; }

    const btnReclasificar = document.getElementById("btn-abrir-reclasificar");
    if (btnReclasificar) {
        btnReclasificar.onclick = () => { 
            abrirEditorEspecificoSolicitud(sol.id); 
        };
    }

    const btnArchivar = document.getElementById("btn-archivar-rapido");
    if (btnArchivar) {
        btnArchivar.onclick = async () => {
            if(confirm("¿Estás seguro que deseas archivar este ticket sin emitir acción municipal?")) {
                let userRoleCache = sessionStorage.getItem('SIGEV_USER_ROLE');
                let baseName = auth.currentUser ? auth.currentUser.displayName : "Administrador";
                let rolEtiqueta = (userRoleCache === "super_admin" || userRoleCache === "superadmin") ? "ADMINISTRADOR" : baseName;
                
                await updateDoc(doc(db, "solicitudes", sol.id), { estado: "Archivado", estadoGestion: "Archivado", archivadoPor: rolEtiqueta });
                mostrarAlertaPersonalizada("El ticket ha sido archivado correctamente.", "info");
                ejecutarMotorCargaSolicitudes();
            }
        };
    }

    const selEstadoG = document.getElementById("sel-estado-gestion");
    const infoBox = document.getElementById("info-box-gestion");
    const cajaResp = document.getElementById("caja-respuesta-vecino");
    const btnGuardarG = document.getElementById("btn-guardar-gestion");
    const depto = sol.oficinaDerivada || "el departamento";

    const updateInfoBox = () => {
        const v = selEstadoG.value;
        if (v === "En revisión") {
            infoBox.innerHTML = "<b>Revisión:</b> El ticket ha sido clasificado formalmente, pero aún no se le avisa ni deriva la gestión al departamento operativo correspondiente.";
            cajaResp.style.display = "none";
        } else if (v === "Derivada") {
            infoBox.innerHTML = `<b>Derivada:</b> El requerimiento ha sido notificado y despachado formalmente a <b>${depto}</b> para su toma de conocimiento.`;
            cajaResp.style.display = "none";
        } else if (v === "En gestión") {
            infoBox.innerHTML = `<b>En Gestión:</b> El departamento <b>${depto}</b> ha recepcionado el caso y se encuentra trabajando activamente en la resolución técnica.`;
            cajaResp.style.display = "none";
        } else if (v === "Finalizada" || v === "Finalizado en espera de respuesta") {
            if (!sol.detalleInternoResolucion) {
                // PASO 1: Solo pedir el detalle interno
                infoBox.innerHTML = `<b>Caso Resuelto:</b> Acción municipal ejecutada con éxito. Por favor redacta el detalle interno del caso.`;
                cajaResp.style.display = "block";
                cajaResp.innerHTML = `
                    <label style="font-size: 11px; font-weight: 700; color: #b45309; display: block; margin-bottom: 4px;">DETALLE INTERNO DEL CASO (Para el Concejal) *</label>
                    <textarea id="txt-detalle-interno" rows="3" placeholder="Escribe aquí los detalles de cómo se resolvió para que el concejal los lea..." style="width: 100%; padding: 10px; border: 1px solid #fde68a; border-radius: 6px; font-size: 13px; resize: vertical; outline: none; background: #fffbeb;">${sol.detalleInternoResolucion || ''}</textarea>
                `;
            } else {
                // PASO 2: Ya existe detalle interno, ahora pedimos la respuesta al vecino
                infoBox.innerHTML = `<b>Respuesta Final:</b> Redacta la respuesta oficial que será enviada y visible para el vecino en su portal.`;
                cajaResp.style.display = "block";
                
                const btnEditDet = `<button type="button" onclick="document.getElementById('txt-detalle-interno').readOnly=false; document.getElementById('txt-detalle-interno').focus(); this.style.display='none';" style="background:none; border:none; color:#b45309; cursor:pointer; font-size:11px; font-weight:bold; text-decoration:underline; outline:none; padding:0;">✏️ Editar</button>`;
                
                cajaResp.innerHTML = `
                    <div style="margin-bottom: 16px;">
                        <label style="font-size: 11px; font-weight: 700; color: #b45309; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span>📝 RESOLUCIÓN DEL CASO (Interno)</span>
                            ${btnEditDet}
                        </label>
                        <textarea id="txt-detalle-interno" readonly rows="3" style="width: 100%; padding: 10px; border: 1px dashed #f59e0b; border-radius: 6px; font-size: 13px; resize: vertical; outline: none; background: #fef3c7; color: #92400e;">${sol.detalleInternoResolucion || ''}</textarea>
                    </div>

                    <div>
                        <label style="font-size: 11px; font-weight: 700; color: #166534; display: block; margin-bottom: 4px;">RESPUESTA FINAL AL VECINO *</label>
                        <textarea id="txt-respuesta-vecino" rows="3" placeholder="Redacta la resolución oficial que visualizará el vecino..." style="width: 100%; padding: 10px; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 13px; resize: vertical; outline: none; background: #f0fdf4;">${sol.respuestaVecino || ''}</textarea>
                    </div>
                `;
            }
        }
    };
    selEstadoG.addEventListener("change", updateInfoBox);
    updateInfoBox();

    btnGuardarG.onclick = async () => {
        let nuevoE = selEstadoG.value;
        const respEl = document.getElementById("txt-respuesta-vecino");
        const resp = respEl ? respEl.value.trim() : "";
        
        const detEl = document.getElementById("txt-detalle-interno");
        const detalle = detEl ? detEl.value.trim() : "";

        // Validación blindada
        if (nuevoE === "Finalizada") {
            if (!sol.detalleInternoResolucion && !detalle) { 
                mostrarAlertaPersonalizada("Debes ingresar la resolución del caso para avanzar.", "error");
                return; 
            }
        }

        btnGuardarG.disabled = true; btnGuardarG.innerText = "Guardando...";
        let userRoleCache = sessionStorage.getItem('SIGEV_USER_ROLE');
        let baseName = auth.currentUser ? auth.currentUser.displayName : "Equipo Territorial";
        let rolEtiqueta = (userRoleCache === "super_admin" || userRoleCache === "superadmin") ? "ADMINISTRADOR" : baseName;
        const payload = { ultimaGestionPor: rolEtiqueta };

        if (nuevoE === "Derivada" && !sol.fechaDerivada) payload.fechaDerivada = serverTimestamp();
        if (nuevoE === "En gestión" && !sol.fechaEnGestion) payload.fechaEnGestion = serverTimestamp();
        
        // Lógica de dos pasos
        if (nuevoE === "Finalizada") {
            if (!sol.detalleInternoResolucion && !resp) {
                // Paso 1: Secretaría guarda detalle interno
                payload.estadoGestion = "Finalizado en espera de respuesta";
                payload.detalleInternoResolucion = detalle;
                payload.estado = "En Gestión"; // El vecino sigue viendo "En Gestión"
                if (!sol.fechaResueltoInterno) payload.fechaResueltoInterno = serverTimestamp();
            } else if (resp) {
                // Paso 2: Concejal guarda respuesta final
                payload.estadoGestion = "Finalizada (Caso Respondido)";
                payload.detalleInternoResolucion = detalle || sol.detalleInternoResolucion; 
                payload.respuestaVecino = resp;
                payload.estado = "Resuelto"; // Se cierra el ticket para el vecino
                if (!sol.fechaFinalizada) payload.fechaFinalizada = serverTimestamp();
            } else {
                // Caso: Editó la nota interna pero aún no pone la respuesta final
                payload.estadoGestion = "Finalizado en espera de respuesta";
                payload.detalleInternoResolucion = detalle;
            }
        } else {
            payload.estadoGestion = nuevoE;
        }

        try {
            await updateDoc(doc(db, "solicitudes", sol.id), payload);
            mostrarAlertaPersonalizada(`El estado interno del caso ha sido actualizado.`, "success");
            
            // Actualizar objeto local para re-renderizar la UI al instante
            Object.assign(sol, payload);
            updateInfoBox();
            
            await ejecutarMotorCargaSolicitudes();
            
            // Refrescar el botón
            btnGuardarG.disabled = false; 
            btnGuardarG.innerText = "💾 Guardar Avance de Gestión";
            
        } catch (err) {
            console.error(err); btnGuardarG.disabled = false; btnGuardarG.innerText = "💾 Guardar Avance de Gestión";
            mostrarAlertaPersonalizada("Ocurrió un error al actualizar la gestión.", "error");
        }
    };

    const btnHistorial = document.getElementById("btn-ver-historial");
    if (btnHistorial) {
        btnHistorial.onclick = () => {
            const formatTs = (ts) => ts ? new Date(ts.seconds * 1000).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "Fecha desconocida";

            const formatActor = (rawName) => {
                if (!rawName) return "ADMINISTRADOR";
                let n = rawName.toUpperCase();
                if (n.includes("ADMIN") || n.includes("SUPER")) return "ADMINISTRADOR";
                
                n = n.replace(/\s*\(.*?\)\s*/g, '').trim();
                let partes = n.split(" ");
                if (partes.length >= 4) return partes[0] + " " + partes[2]; // Nombre1 Apellido1
                if (partes.length === 3) return partes[0] + " " + partes[1]; // Nombre1 Apellido1 (usualmente)
                return n;
            };

            const events = [];
            
            // 1. Evento de Ingreso
            events.push({
                color: "#2563eb", textColor: "#1e40af", time: formatTs(sol.fechaCreacion), 
                user: "VECINO PRESENCIAL",
                title: "Ingreso Presencial", desc: `Ticket público <b>${sol.codigo || 'S/N'}</b> despachado exitosamente mediante la plataforma.`
            });
            
            // 2. Evento de Clasificación
            if (sol.codigoInterno || sol.fechaClasificacion) {
                events.push({
                    color: "#16a34a", textColor: "#166534", time: formatTs(sol.fechaClasificacion || sol.fechaCreacion), 
                    user: formatActor(sol.registradaPorNombre || sol.ultimaGestionPor || "ADMINISTRADOR"),
                    title: "Clasificación Técnica Realizada", desc: `Requerimiento derivado a <b>${sol.oficinaDerivada || 'N/A'}</b> bajo el ID interno oficial <b>${sol.codigoInterno || 'N/A'}</b>. Asignado a <b>${sol.asignadoA || 'N/A'}</b>.`
                });
            }
            
            // 3. Evento de Derivación
            if (sol.fechaDerivada) {
                events.push({
                    color: "#eab308", textColor: "#ca8a04", time: formatTs(sol.fechaDerivada), 
                    user: formatActor(sol.ultimaGestionPor),
                    title: "Ticket Derivado Formalmente", desc: `Se ha notificado al departamento encargado.`
                });
            }
            
            // 4. Evento de Gestión
            if (sol.fechaEnGestion) {
                events.push({
                    color: "#8b5cf6", textColor: "#6d28d9", time: formatTs(sol.fechaEnGestion), 
                    user: formatActor(sol.ultimaGestionPor),
                    title: "Gestión en Proceso", desc: `El departamento se encuentra trabajando activamente en la resolución técnica del caso.`
                });
            }

            // 4.5 Evento de Resolución Interna
            if (sol.fechaResueltoInterno) {
                events.push({
                    color: "#f59e0b", textColor: "#b45309", time: formatTs(sol.fechaResueltoInterno), 
                    user: formatActor(sol.ultimaGestionPor),
                    title: "Resolución Interna", desc: `Acción técnica completada. A la espera de la redacción oficial del Concejal.`
                });
            }
            
            // 5. Evento de Finalización
            if (sol.fechaFinalizada) {
                events.push({
                    color: "#059669", textColor: "#065f46", time: formatTs(sol.fechaFinalizada), 
                    user: formatActor(sol.ultimaGestionPor),
                    title: "Caso Finalizado", desc: `Acción municipal ejecutada con éxito o respuesta entregada al vecino.`
                });
            }

            // Construir el HTML de la línea de tiempo dinámica
            let timelineHTML = events.map((ev, i) => {
                const isLast = i === events.length - 1;
                const borderStyle = isLast ? "transparent" : "#cbd5e1";
                return `
                    <div style="position: relative; padding-left: 24px; border-left: 2px solid ${borderStyle}; padding-bottom: ${isLast ? '0' : '24px'}; margin-left: 8px;">
                        <div style="position: absolute; left: -6px; top: 0; width: 10px; height: 10px; border-radius: 50%; background: ${ev.color};"></div>
                        <div style="font-size: 11px; font-weight: 800; color: ${ev.textColor}; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">${ev.time} - ${ev.user}</div>
                        <div style="font-size: 13.5px; color: #334155; line-height: 1.5;">
                            <b style="color: #0f172a;">${ev.title}:</b> ${ev.desc}
                        </div>
                    </div>
                `;
            }).join("");

            // Generar el Modal
            const overlay = document.createElement("div");
            overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 999999; padding: 20px; box-sizing: border-box;";
            overlay.innerHTML = `
                <div style="background: #ffffff; width: 100%; max-width: 500px; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); display: flex; flex-direction: column; font-family: system-ui, -apple-system, sans-serif; animation: fadeIn 0.2s ease-out; overflow: hidden;">
                    <div style="padding: 24px; border-bottom: 1px solid #e2e8f0; position: relative;">
                        <h2 style="margin: 0; font-size: 18px; font-weight: 800; color: #0f172a;">Trazabilidad del Caso</h2>
                        <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Secuencia de eventos y progreso de gestión</p>
                        <button id="btn-cerrar-trazabilidad-x" style="position: absolute; top: 24px; right: 24px; background: #f1f5f9; border: none; width: 28px; height: 28px; border-radius: 50%; color: #475569; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <div style="padding: 32px 24px; max-height: 50vh; overflow-y: auto; background: #f8fafc;">
                        ${timelineHTML}
                    </div>
                    <div style="padding: 16px 24px; background: #ffffff; border-top: 1px solid #e2e8f0;">
                        <button id="btn-cerrar-trazabilidad" style="width: 100%; background: #0f172a; color: #ffffff; border: none; padding: 12px; font-size: 14px; font-weight: 700; border-radius: 8px; cursor: pointer; outline: none; transition: 0.2s;">Entendido</button>
                    </div>
                </div>
                <style>@keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }</style>
            `;
            document.body.appendChild(overlay);

            // Funciones de cierre
            overlay.querySelector("#btn-cerrar-trazabilidad-x").onclick = () => overlay.remove();
            overlay.querySelector("#btn-cerrar-trazabilidad").onclick = () => overlay.remove();
            overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        };
    }
}

export function inicializarEscuchadoresFiltros() {
    const inputCodigo = document.getElementById("filter-solicitud-codigo");
    const btnToggleMobile = document.getElementById("btn-toggle-filters-mobile");
    
    if (btnToggleMobile) {
        btnToggleMobile.addEventListener("click", () => {
            const panelCard = btnToggleMobile.closest(".filter-panel-card");
            if (panelCard) panelCard.classList.toggle("filters-expanded");
        });
    }

    if (inputCodigo) {
        inputCodigo.addEventListener("input", (e) => {
            aplicarFiltrosCruzadosInterfaz();
        });
    }

    const selectFiltroTipo = document.getElementById("filter-tipo");
    if (selectFiltroTipo && selectFiltroTipo.children.length === 1) {
        Object.keys(MAPA_CLASIFICACION_SIGEV).forEach(cat => {
            const opt = document.createElement("option");
            opt.value = cat; opt.textContent = cat;
            selectFiltroTipo.appendChild(opt);
        });
    }

    document.getElementById("filter-tipo")?.addEventListener("change", aplicarFiltrosCruzadosInterfaz);
    document.getElementById("filter-prioridad")?.addEventListener("change", aplicarFiltrosCruzadosInterfaz);
    document.getElementById("filter-fecha-desde")?.addEventListener("change", aplicarFiltrosCruzadosInterfaz);
    document.getElementById("filter-fecha-hasta")?.addEventListener("change", aplicarFiltrosCruzadosInterfaz);

    document.getElementById("btn-reset-filters")?.addEventListener("click", () => {
        if (inputCodigo) inputCodigo.value = "";
        document.getElementById("filter-tipo").value = "Todos";
        document.getElementById("filter-prioridad").value = "Todos";
        document.getElementById("filter-fecha-desde").value = "";
        document.getElementById("filter-fecha-hasta").value = "";
        estadoFiltroKPIActivo = "Todos";
        
        // Limpiamos los estilos de ambas botoneras (Tabs y KPIs)
        document.querySelectorAll(".tab-filtro-solicitud").forEach(t => t.classList.remove("active"));
        const tabTodos = document.querySelector(".tab-filtro-solicitud[data-estado='Todos']");
        if(tabTodos) tabTodos.classList.add("active");

        document.querySelectorAll(".mini-kpi-card").forEach(c => c.style.borderColor = "var(--border-color)");
        
        aplicarFiltrosCruzadosInterfaz();
    });

    // 🚀 NUEVO: Escuchador para las Sub-Tabs (Clasificados, Derivados, etc.)
    document.querySelectorAll(".tab-filtro-solicitud").forEach(tab => {
        tab.addEventListener("click", () => {
            // Reiniciar estado visual de todas las pestañas
            document.querySelectorAll(".tab-filtro-solicitud").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            
            // Actualizar la variable global
            estadoFiltroKPIActivo = tab.getAttribute("data-estado");
            
            // Apagar las tarjetas superiores (KPI) si se usó este sub-menú
            document.querySelectorAll(".mini-kpi-card").forEach(c => c.style.borderColor = "var(--border-color)");

            aplicarFiltrosCruzadosInterfaz();
        });
    });

    // Escuchador original de las tarjetas KPI (Se mantiene por compatibilidad visual)
    document.querySelectorAll(".mini-kpi-card").forEach(card => {
        card.addEventListener("click", () => {
            document.querySelectorAll(".mini-kpi-card").forEach(c => c.style.borderColor = "var(--border-color)");
            
            // Apagar el estilo de las sub-tabs inferiores
            document.querySelectorAll(".tab-filtro-solicitud").forEach(t => t.classList.remove("active"));

            const targetFilter = card.getAttribute("data-filter");
            if (estadoFiltroKPIActivo === targetFilter) { 
                estadoFiltroKPIActivo = "Todos"; 
                const tabTodos = document.querySelector(".tab-filtro-solicitud[data-estado='Todos']");
                if(tabTodos) tabTodos.classList.add("active");
            } 
            else { 
                estadoFiltroKPIActivo = targetFilter; 
                card.style.borderColor = "var(--sidebar-active)"; 
            }
            aplicarFiltrosCruzadosInterfaz();
        });
    });

    const selectLimit = document.getElementById("table-entries-limit");
    if(selectLimit) {
        selectLimit.addEventListener("change", (e) => {
            filasPorPagina = parseInt(e.target.value);
            aplicarFiltrosCruzadosInterfaz();
        });
    }
}

async function abrirEditorEspecificoSolicitud(idSolicitud) {
    try {
        const docRef = doc(db, "solicitudes", idSolicitud);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return;

        const sol = docSnap.data();
        
        const fCreacionObj = sol.fechaCreacion ? new Date(sol.fechaCreacion.seconds * 1000) : new Date();
        const d = String(fCreacionObj.getDate()).padStart(2, '0');
        const m = String(fCreacionObj.getMonth() + 1).padStart(2, '0');
        const a = String(fCreacionObj.getFullYear()).slice(-2);
        const smartTicketId = sol.codigoInterno || sol.codigo || `${(sol.idVecino || "000").substring(0, 4).toUpperCase()}-${d}${m}${a}-${sol.id.substring(0, 3).toUpperCase()}`;

        let opcionesCategoriasHTML = `<option value="">Seleccione Categoría</option>`;
        Object.keys(MAPA_CLASIFICACION_SIGEV).forEach(cat => {
            opcionesCategoriasHTML += `<option value="${cat}" ${(sol.categoria || sol.motivo) === cat ? 'selected' : ''}>${cat}</option>`;
        });

        const modalOverlay = document.createElement("div");
        modalOverlay.className = "profile-modal-overlay";

        modalOverlay.innerHTML = `
            <div class="profile-modal-card" style="max-width: 550px; border-radius: 12px; overflow: hidden; background: #fff; display: flex; flex-direction: column; font-family: system-ui, sans-serif;">
                <div style="background-color: #0b438c; padding: 20px 24px; position: relative; flex-shrink: 0;">
                    <h3 style="margin: 0; font-size: 18px; color: #ffffff; font-weight: 800;">Reclasificar Requerimiento</h3>
                    <p style="margin: 4px 0 0 0; font-size: 12.5px; color: rgba(255,255,255,0.85);">Ticket Público: ${smartTicketId}</p>
                    <button class="btn-profile-close" style="position: absolute; top: 16px; right: 20px; background: none; border: none; color: #ffffff; font-size: 24px; cursor: pointer; outline: none;">&times;</button>
                </div>

                <div class="profile-modal-body" style="padding: 24px; overflow-y: auto; max-height: 70vh;">
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        
                        <div>
                            <label style="font-size: 11px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; margin-bottom: 6px; display: block;">Categoría de Clasificación *</label>
                            <select id="es-motivo" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; outline: none; background: white; -webkit-appearance: none; background-image: url('data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2364748b\\' stroke-width=\\'2.5\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'%3E%3Cpolyline points=\\'6 9 12 15 18 9\\'%3E%3C/polyline%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: right 10px center; background-size: 14px;">
                                ${opcionesCategoriasHTML}
                            </select>
                        </div>

                        <div>
                            <label style="font-size: 11px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; margin-bottom: 6px; display: block;">Subcategoría Específica *</label>
                            <select id="es-subcategoria" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; outline: none; background: white; -webkit-appearance: none; background-image: url('data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2364748b\\' stroke-width=\\'2.5\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'%3E%3Cpolyline points=\\'6 9 12 15 18 9\\'%3E%3C/polyline%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: right 10px center; background-size: 14px;">
                            </select>
                        </div>

                        <div style="background: #f8fafc; border: 1px dashed #cbd5e1; padding: 12px 16px; border-radius: 8px;">
                            <label style="font-size: 10.5px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 6px; display: block;">Departamento Encargado</label>
                            <input type="text" id="es-oficina" value="${sol.oficinaDerivada || ''}" readonly style="width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13.5px; font-weight: 700; background-color: #ffffff; color: #0f172a; outline: none; cursor: not-allowed; box-sizing: border-box;">
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                            <div>
                                <label style="font-size: 11px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; margin-bottom: 6px; display: block;">Responsable de Seguimiento *</label>
                                <select id="es-asignado" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; outline: none; background: white; font-weight: 600; color: #0f172a; -webkit-appearance: none; background-image: url('data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2364748b\\' stroke-width=\\'2.5\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'%3E%3Cpolyline points=\\'6 9 12 15 18 9\\'%3E%3C/polyline%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: right 10px center; background-size: 14px;">
                                    <option value="Equipo Territorial">Cargando equipo...</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-size: 11px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; margin-bottom: 6px; display: block;">Prioridad Operativa *</label>
                                <select id="es-prioridad" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; outline: none; background: white; -webkit-appearance: none; background-image: url('data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2364748b\\' stroke-width=\\'2.5\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'%3E%3Cpolyline points=\\'6 9 12 15 18 9\\'%3E%3C/polyline%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: right 10px center; background-size: 14px;">
                                    <option value="Baja" ${sol.prioridad === 'Baja' ? 'selected' : ''}>🟢 Baja</option>
                                    <option value="Media" ${(sol.prioridad === 'Media' || !sol.prioridad) ? 'selected' : ''}>🟡 Media</option>
                                    <option value="Alta" ${sol.prioridad === 'Alta' ? 'selected' : ''}>🔴 Alta</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label style="font-size: 11px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; margin-bottom: 6px; display: block;">Notas Internas / Resoluciones Operativas</label>
                            <textarea id="es-notas-gestion" rows="3" placeholder="Ingresa instrucciones o resoluciones para el equipo..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; outline: none; resize: vertical;">${sol.notasGestion || ''}</textarea>
                        </div>

                    </div>
                </div>

                <div style="padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px; flex-shrink: 0;">
                    <button type="button" id="btn-modal-cancel" style="padding: 10px 20px; font-size: 13.5px; font-weight: 600; color: #475569; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; outline: none;">Cancelar</button>
                    <button type="button" id="btn-modal-save" style="padding: 10px 20px; font-size: 13.5px; font-weight: 700; color: #ffffff; background: #2563eb; border: none; border-radius: 6px; cursor: pointer; outline: none; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">🚀 Guardar Re-Clasificación</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);

        const selectPersonal = modalOverlay.querySelector("#es-asignado");
        try {
            const qUsers = query(collection(db, "usuarios")); 
            const querySnapshot = await getDocs(qUsers);
            
            let opcionesHTML = `<option value="Equipo Territorial">Equipo Territorial</option>`;
            window.cacheFotosUsuarios = {};

            querySnapshot.forEach((docSnap) => {
                const userData = docSnap.data();
                const rolNormalizado = (userData.rol || "").toLowerCase();
                
                if (rolNormalizado !== "pendiente" && rolNormalizado !== "super_admin" && rolNormalizado !== "superadmin" && userData.rol) {
                    const nombreUsuario = userData.nombreCompleto || userData.nombre || userData.email;
                    
                    window.cacheFotosUsuarios[nombreUsuario] = userData.fotoPerfil || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=50";
                    
                    const seleccionado = (sol.asignadoA === nombreUsuario) ? "selected" : "";
                    opcionesHTML += `<option value="${nombreUsuario}" ${seleccionado}>${nombreUsuario}</option>`;
                }
            });
            
            selectPersonal.innerHTML = opcionesHTML;
        } catch (error) {
            console.error("Error consultando el personal autorizado:", error);
            selectPersonal.innerHTML = `<option value="Equipo Territorial">Equipo Territorial</option>`;
        }

        const eMotivo = modalOverlay.querySelector("#es-motivo");
        const eSub = modalOverlay.querySelector("#es-subcategoria");
        const eOfi = modalOverlay.querySelector("#es-oficina");

        const poblarSub = (cat, defaultVal = "") => {
            eSub.innerHTML = "";
            if (cat && MAPA_CLASIFICACION_SIGEV[cat]) {
                eOfi.value = MAPA_CLASIFICACION_SIGEV[cat].depName;
                let h = `<option value="">Seleccione subcategoría</option>`;
                Object.keys(MAPA_CLASIFICACION_SIGEV[cat].subs).forEach(s => { h += `<option value="${s}" ${s === defaultVal ? 'selected' : ''}>${s}</option>`; });
                eSub.innerHTML = h; eSub.disabled = false;
            } else { eOfi.value = ""; eSub.innerHTML = `<option value="">Seleccione categoría</option>`; eSub.disabled = true; }
        };

        if (sol.categoria || sol.motivo) poblarSub(sol.categoria || sol.motivo, sol.subcategoria);
        eMotivo.addEventListener("change", (e) => poblarSub(e.target.value));

        modalOverlay.querySelector(".btn-profile-close").addEventListener("click", () => modalOverlay.remove());
        modalOverlay.querySelector("#btn-modal-cancel").addEventListener("click", () => modalOverlay.remove());

        const btnSave = modalOverlay.querySelector("#btn-modal-save");
        btnSave.addEventListener("click", async () => {
            btnSave.disabled = true; btnSave.innerText = "Guardando...";
            try {
                const nombreAsignadoElegido = modalOverlay.querySelector("#es-asignado").value;
                
                let fotoEncargadoElegido = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=50";
                if (window.cacheFotosUsuarios && window.cacheFotosUsuarios[nombreAsignadoElegido]) {
                    fotoEncargadoElegido = window.cacheFotosUsuarios[nombreAsignadoElegido];
                }

                const catNueva = eMotivo.value;
                const subNueva = eSub.value;
                let codigoInternoNuevo = sol.codigoInterno;

                if (MAPA_CLASIFICACION_SIGEV[catNueva]) {
                    const dataCat = MAPA_CLASIFICACION_SIGEV[catNueva];
                    const baseCodigoPublico = sol.codigo || "S/N";
                    if(baseCodigoPublico !== "S/N") {
                        codigoInternoNuevo = `${baseCodigoPublico}-${dataCat.depCod || "GEN"}-${dataCat.catCod || "GEN"}-${dataCat.subs[subNueva] || "GEN"}`;
                    }
                }

                const updatePayload = {
                    motivo: catNueva,
                    categoria: catNueva,
                    subcategoria: subNueva,
                    oficinaDerivada: eOfi.value.trim(),
                    codigoInterno: codigoInternoNuevo,
                    asignadoA: nombreAsignadoElegido,
                    registradaPorFoto: fotoEncargadoElegido,
                    prioridad: modalOverlay.querySelector("#es-prioridad").value,
                    notasGestion: modalOverlay.querySelector("#es-notas-gestion").value.trim()
                };

                await updateDoc(docRef, updatePayload);
                modalOverlay.remove();
                mostrarAlertaPersonalizada("La solicitud se ha actualizado y reasignado en el sistema.", "success");
                renderizarMetricasServidor();
                await ejecutarMotorCargaSolicitudes(); 
            } catch (err) {
                console.error("Error al actualizar la solicitud:", err);
                btnSave.disabled = false;
                btnSave.innerText = "🚀 Guardar Re-Clasificación";
            }
        });

    } catch (err) { console.error(err); }
}

function inicializarManejadorModalIngreso() {
    const modalIngreso = document.getElementById("modal-ingreso-vecino");
    const btnAbrirModal = document.getElementById("btn-trigger-new-solicitud");
    const btnCerrarIngreso = document.getElementById("btn-cerrar-ingreso");
    const btnLimpiarIngreso = document.getElementById("btn-limpiar-ingreso");
    const btnGuardarVecino = document.getElementById("btn-guardar-vecino");
    const inputRutIngreso = document.getElementById("vecino-rut");
    const formVecino = document.getElementById("form-vecino");

    const sMotivo = document.getElementById("solicitud-motivo");
    const sSub = document.getElementById("solicitud-subcategoria");
    const sOficina = document.getElementById("solicitud-oficina");

    const modalTriage = document.getElementById("modal-registro-solicitud-triage");
    const trRut = document.getElementById("tr-rut");
    const trNombre = document.getElementById("tr-nombre");
    const trTelefono = document.getElementById("tr-telefono");
    const trDireccion = document.getElementById("tr-direccion");
    const trCategoria = document.getElementById("tr-categoria");
    const trSubcategoria = document.getElementById("tr-subcategoria");
    const trOficina = document.getElementById("tr-oficina");
    const trPrioridad = document.getElementById("tr-prioridad");
    const trDescripcion = document.getElementById("tr-descripcion");
    
    const btnGuardarSolicitudFinal = document.getElementById("btn-guardar-solicitud-final");
    const btnIrCrearVecino = document.getElementById("btn-ir-crear-vecino");
    const btnLimpiarTriage = document.getElementById("btn-limpiar-triage");

    const sSectorTerritorial = document.getElementById("vecino-sector-territorial");
    const sUnidadVecinal = document.getElementById("vecino-unidad-vecinal");
    const sJuntaVecinos = document.getElementById("vecino-junta-vecinal");
    const inputBarrioPopular = document.getElementById("vecino-barrio-popular");

    if (formVecino) { formVecino.addEventListener("submit", (e) => e.preventDefault()); }

    const resetCascadaTerritorial = () => {
        if (sUnidadVecinal) { sUnidadVecinal.innerHTML = `<option value="">Seleccione primero el sector</option>`; sUnidadVecinal.disabled = true; }
        if (sJuntaVecinos) { sJuntaVecinos.innerHTML = `<option value="">Seleccione primero la UV</option>`; sJuntaVecinos.disabled = true; }
    };

    const cerrarYLimpiar = () => {
        if (modalIngreso) modalIngreso.style.display = "none";
        if (formVecino) formVecino.reset();
        if (sSub) { sSub.innerHTML = `<option value="">Seleccione categoría</option>`; sSub.disabled = true; }
        resetCascadaTerritorial();
        if (btnGuardarVecino) btnGuardarVecino.disabled = true;
        archivoFotoSeleccionado = null; archivoDocSeleccionado = null;
    };

    if (sMotivo && sSub && sOficina) {
        sMotivo.addEventListener("change", (e) => {
            const v = e.target.value; sSub.innerHTML = ""; sOficina.value = "";
            if (v && MAPA_CLASIFICACION_SIGEV[v]) {
                sOficina.value = MAPA_CLASIFICACION_SIGEV[v].depName;
                let h = `<option value="">Seleccione subcategoría</option>`;
                Object.keys(MAPA_CLASIFICACION_SIGEV[v].subs).forEach(s => { h += `<option value="${s}">${s}</option>`; });
                sSub.innerHTML = h; sSub.disabled = false;
            } else { sSub.innerHTML = `<option value="">Seleccione categoría</option>`; sSub.disabled = true; }
        });
    }

    if (sSectorTerritorial && sUnidadVecinal && sJuntaVecinos) {
        sSectorTerritorial.addEventListener("change", (e) => {
            const sector = e.target.value;
            sUnidadVecinal.innerHTML = '<option value="">Seleccione UV</option>';
            sJuntaVecinos.innerHTML = '<option value="">Seleccione Junta</option>';
            sJuntaVecinos.disabled = true;

            if (sector && MAPEO_TERRITORIAL[sector]) {
                MAPEO_TERRITORIAL[sector].uvs.forEach(uv => { sUnidadVecinal.innerHTML += `<option value="${uv}">${uv}</option>`; });
                sUnidadVecinal.disabled = false;
            } else { sUnidadVecinal.disabled = true; }
        });

        sUnidadVecinal.addEventListener("change", (e) => {
            const sector = sSectorTerritorial.value;
            const uv = e.target.value;
            sJuntaVecinos.innerHTML = '<option value="">Seleccione Junta</option>';

            if (sector && uv && MAPEO_TERRITORIAL[sector]?.juntas[uv]) {
                MAPEO_TERRITORIAL[sector].juntas[uv].forEach(junta => { sJuntaVecinos.innerHTML += `<option value="${junta}">${junta}</option>`; });
                sJuntaVecinos.disabled = false;
            } else { sJuntaVecinos.disabled = true; }
        });
    }

    if (btnAbrirModal && modalTriage) {
        btnAbrirModal.addEventListener("click", () => {
            if (trRut) trRut.value = "";
            if (trNombre) { trNombre.value = "Esperando RUN..."; trNombre.style.color = "#64748b"; }
            if (trTelefono) trTelefono.value = "";
            if (trDireccion) trDireccion.value = "";
            if (trCategoria) trCategoria.value = "";
            if (trOficina) trOficina.value = "";
            if (trSubcategoria) { trSubcategoria.innerHTML = '<option value="">Seleccione primero categoría...</option>'; trSubcategoria.disabled = true; }
            if (trPrioridad) trPrioridad.value = "Media";
            if (trDescripcion) trDescripcion.value = "";
            
            if (btnGuardarSolicitudFinal) { btnGuardarSolicitudFinal.disabled = true; btnGuardarSolicitudFinal.style.display = "block"; btnGuardarSolicitudFinal.innerText = "🚀 Crear Solicitud Presencial"; }
            if (btnIrCrearVecino) btnIrCrearVecino.style.display = "none";

            modalTriage.style.display = "flex";
            if (trRut) trRut.focus();
        });
    }

    const guardarTriageOficial = async () => {
        const cat = trCategoria.value; const sub = trSubcategoria.value;
        const prio = trPrioridad.value;
        const desc = trDescripcion.value.trim();
        const fono = trTelefono ? trTelefono.value.trim() : "";
        const direcc = trDireccion ? trDireccion.value.trim() : "";

        if (!cat || !sub || !desc || !vDataActual) { 
            alert("Por favor complete los campos obligatorios (*) antes de realizar el despacho."); 
            return; 
        }

        btnGuardarSolicitudFinal.disabled = true;
        btnGuardarSolicitudFinal.innerText = "Registrando...";

        try {
            let userRoleCache = sessionStorage.getItem('SIGEV_USER_ROLE');
            const currentUser = auth.currentUser;
            let baseName = currentUser ? (currentUser.displayName || currentUser.email) : "Equipo Territorial";
            const loggedName = (userRoleCache === "super_admin" || userRoleCache === "superadmin") ? "ADMINISTRADOR" : baseName;
            
            const loggedPhoto = currentUser?.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=50";

            const hoy = new Date();
            const yy = String(hoy.getFullYear()).slice(-2);
            const mm = String(hoy.getMonth() + 1).padStart(2, '0');
            const dd = String(hoy.getDate()).padStart(2, '0');
            const fechaStr = `${yy}${mm}${dd}`;

            // NUEVO SISTEMA DE CONTADOR: 1 Documento por Tenant
            const counterRef = doc(db, "counters_diarios", CURRENT_TENANT_ID);
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
            let codigoInterno = codigoPublico;

            if (MAPA_CLASIFICACION_SIGEV[cat]) {
                const dataCat = MAPA_CLASIFICACION_SIGEV[cat];
                codigoInterno = `${codigoPublico}-${dataCat.depCod || "GEN"}-${dataCat.catCod || "GEN"}-${dataCat.subs[sub] || "GEN"}`;
            }

            const payload = {
                tenantId: CURRENT_TENANT_ID, idVecino: vDataActual.id,
                vecinoNombre: vDataActual.nombreCompleto, nombreVecino: vDataActual.nombreCompleto, 
                vecinoRut: vDataActual.rut, rutVecino: vDataActual.rut,
                vecinoTelefono: fono || vDataActual.telefono || "S/R",
                vecinoDireccion: direcc || vDataActual.direccion || "S/R",
                codigo: codigoPublico, codigoInterno: codigoInterno,
                categoria: cat, motivo: cat, subcategoria: sub,
                oficinaDerivada: trOficina.value, prioridad: prio, descripcion: desc,
                estado: "Clasificado", estadoGestion: "En revisión", fechaClasificacion: serverTimestamp(),
                origen: "Registro Presencial", fechaCreacion: serverTimestamp(),
                registradaPorNombre: loggedName, registradaPorFoto: loggedPhoto, asignadoA: loggedName, adjuntos: []
            };

            const newRef = doc(collection(db, "solicitudes"));
            await setDoc(newRef, payload);

            if (modalTriage) modalTriage.style.display = "none";
            
            mostrarAlertaTicketCreado(vDataActual.nombreCompleto, vDataActual.rut, codigoPublico);
            
            if (trSubcategoria) trSubcategoria.disabled = true;

            renderizarMetricasServidor(); await ejecutarMotorCargaSolicitudes();
        } catch (err) {
            console.error("Error crítico al despachar solicitud manual:", err);
            mostrarAlertaPersonalizada("Error de conexión al guardar el caso.", "error");
        } finally {
            btnGuardarSolicitudFinal.disabled = false; btnGuardarSolicitudFinal.innerText = "🚀 Crear Solicitud Presencial";
        }
    };

    const comprobarIdentidadVecinoTriage = async (rutTipeado, esBlur = false) => {
        if (!rutTipeado) return;
        const raw = rutTipeado.replace(/[^0-9kK]/g, "").toUpperCase();
        
        if (raw.length < 8) {
            vDataActual = null;
            if (trNombre) { trNombre.value = "Esperando RUN..."; trNombre.style.color = "#64748b"; }
            if (btnGuardarSolicitudFinal) {
                btnGuardarSolicitudFinal.disabled = true;
                btnGuardarSolicitudFinal.style.display = "block";
                btnGuardarSolicitudFinal.innerText = "🚀 Crear Solicitud Presencial";
            }
            if (btnIrCrearVecino) btnIrCrearVecino.style.display = "none";
            return;
        }

        const formatB = raw.length > 1 ? (raw.slice(0, -1) + "-" + raw.slice(-1)) : raw;

        try {
            const q = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID), where("rut", "in", [raw, formatB, rutTipeado]));
            const snap = await getDocs(q);

            if (!snap.empty) {
                const vecinoDoc = snap.docs[0];
                vDataActual = { id: vecinoDoc.id, ...vecinoDoc.data() };
                if (trNombre) { trNombre.value = "✓ " + vDataActual.nombreCompleto; trNombre.style.color = "#059669"; }
                if (trTelefono) trTelefono.value = vDataActual.telefono || "";
                if (trDireccion) trDireccion.value = vDataActual.direccion || "";

                if (btnIrCrearVecino) btnIrCrearVecino.style.display = "none";
                if (btnGuardarSolicitudFinal) {
                    btnGuardarSolicitudFinal.style.display = "block";
                    btnGuardarSolicitudFinal.disabled = false;
                    btnGuardarSolicitudFinal.innerText = "🚀 Crear Solicitud Presencial";
                    btnGuardarSolicitudFinal.onclick = guardarTriageOficial; 
                }
            } else {
                vDataActual = null;
                if (trNombre) { trNombre.value = "✗ No Registrado"; trNombre.style.color = "#ef4444"; }
                if (trTelefono) trTelefono.value = "";
                if (trDireccion) trDireccion.value = "";
                
                if (btnGuardarSolicitudFinal) btnGuardarSolicitudFinal.style.display = "none";
                
                if (btnIrCrearVecino) {
                    btnIrCrearVecino.style.display = "block";
                    btnIrCrearVecino.onclick = () => {
                        if (modalTriage) modalTriage.style.display = "none";
                        const modVecino = document.getElementById("modal-ingreso-vecino");
                        if (modVecino) {
                            modVecino.style.display = "flex";
                            const inputR = document.getElementById("vecino-rut");
                            if(inputR) { inputR.value = rutTipeado; inputR.focus(); }
                        }
                    };
                }
            }
        } catch (err) {
            console.error("Error intermitente al interrogar Firestore:", err);
            if (trNombre) trNombre.value = "Error de conexión";
        }
    };

    if (trRut) {
        trRut.addEventListener("input", async (e) => {
            let value = e.target.value.replace(/[^0-9kK]/g, '');
            if (value.length > 1) { e.target.value = value.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + value.slice(-1).toUpperCase(); } 
            else { e.target.value = value.toUpperCase(); }
            await comprobarIdentidadVecinoTriage(e.target.value, false);
        });
        trRut.addEventListener("blur", async (e) => { await comprobarIdentidadVecinoTriage(e.target.value, true); });
    }

    if (trCategoria && trSubcategoria && trOficina) {
        trCategoria.innerHTML = '<option value="">Seleccione Categoría...</option>';
        Object.keys(MAPA_CLASIFICACION_SIGEV).forEach(cat => {
            const opt = document.createElement("option"); opt.value = cat; opt.textContent = cat;
            trCategoria.appendChild(opt);
        });

        trCategoria.onchange = (e) => {
            const cat = e.target.value;
            trSubcategoria.innerHTML = '<option value="">Seleccione subcategoría...</option>'; trOficina.value = "";
            if (cat && MAPA_CLASIFICACION_SIGEV[cat]) {
                trOficina.value = MAPA_CLASIFICACION_SIGEV[cat].depName;
                Object.keys(MAPA_CLASIFICACION_SIGEV[cat].subs).forEach(s => {
                    const opt = document.createElement("option"); opt.value = s; opt.textContent = s;
                    trSubcategoria.appendChild(opt);
                });
                trSubcategoria.disabled = false;
            } else {
                trSubcategoria.disabled = true;
            }
        };
    }

    document.querySelectorAll(".close-triage").forEach(btn => {
        btn.onclick = () => { if (modalTriage) modalTriage.style.display = "none"; };
    });

    if (btnLimpiarTriage) {
        btnLimpiarTriage.onclick = () => {
            if (trRut) trRut.value = "";
            if (trNombre) { trNombre.value = "Esperando RUN..."; trNombre.style.color = "#64748b"; }
            if (trTelefono) trTelefono.value = "";
            if (trDireccion) trDireccion.value = "";
            if (trCategoria) trCategoria.value = "";
            if (trOficina) trOficina.value = "";
            if (trSubcategoria) { trSubcategoria.innerHTML = '<option value="">Seleccione primero categoría...</option>'; trSubcategoria.disabled = true; }
            if (trPrioridad) trPrioridad.value = "Media";
            if (trDescripcion) trDescripcion.value = "";
            if (btnIrCrearVecino) btnIrCrearVecino.style.display = "none";
            if (btnGuardarSolicitudFinal) { btnGuardarSolicitudFinal.style.display = "block"; btnGuardarSolicitudFinal.disabled = true; btnGuardarSolicitudFinal.innerText = "🚀 Crear Solicitud Presencial"; }
        };
    }

    if (btnCerrarIngreso && modalIngreso) { btnCerrarIngreso.addEventListener("click", () => { modalIngreso.style.display = "none"; }); }
    window.addEventListener("click", (e) => { if (e.target === modalIngreso) { modalIngreso.style.display = "none"; } if (e.target === modalTriage) modalTriage.style.display = "none"; });

    if (btnGuardarVecino) {
        btnGuardarVecino.addEventListener("click", async (e) => {
            e.preventDefault();
            const nom = document.getElementById("vecino-nombre")?.value.trim() || "";
            const rut = inputRutIngreso.value.trim() || "";
            
            if (!nom || !rut) { mostrarAlertaPersonalizada("El campo 'Nombre' y 'RUT' son obligatorios.", "error"); return; }
            btnGuardarVecino.disabled = true; btnGuardarVecino.innerText = "Sincronizando...";

            try {
                const vecinoData = { 
                    nombreCompleto: nom, rut: rut, telefono: document.getElementById("vecino-telefono")?.value.trim() || "", 
                    sectorTerritorial: document.getElementById("vecino-sector-territorial")?.value || "Sin Información",
                    unidadVecinal: document.getElementById("vecino-unidad-vecinal")?.value || "Sin Información",
                    juntaVecinos: document.getElementById("vecino-junta-vecinal")?.value || "Sin Información",
                    barrioPopular: document.getElementById("vecino-barrio-popular")?.value.trim() || "Sin Información",
                    tenantId: CURRENT_TENANT_ID, fechaRegistro: serverTimestamp() 
                };
                
                await addDoc(collection(db, "vecinos"), vecinoData);
                
                if (modalIngreso) modalIngreso.style.display = "none";
                document.getElementById("form-vecino")?.reset();
                mostrarAlertaPersonalizada("Vecino creado con éxito. Ahora puedes ingresarle su solicitud.", "success");
                
                if (modalTriage) {
                    modalTriage.style.display = "flex";
                    if (trRut) {
                        trRut.value = rut;
                        trRut.focus();
                        trRut.blur(); 
                    }
                }
            } catch (err) { 
                console.error(err); mostrarAlertaPersonalizada("Hubo un error al sincronizar con la nube.", "error");
            } finally { 
                btnGuardarVecino.disabled = false; btnGuardarVecino.innerText = "Guardar vecino"; 
            }
        });
    }
}