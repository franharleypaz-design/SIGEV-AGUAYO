// ============================================================================
// SIGEV-AGUAYO - MOTOR CONTROLADOR PRINCIPAL DEL DASHBOARD GENERAL (V67 - MOBILE FIX)
// ============================================================================
import { auth, db, app } from "./app.js";
import { 
    collection, addDoc, doc, getDoc, updateDoc, serverTimestamp, getDocs, query, where, onSnapshot, runTransaction, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, uploadBytes, getDownloadURL, ref } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { inyectarEstructuraGlobal, actualizarPerfilLayout } from "./layout.js";
import { MAPEO_MUNICIPAL, MAPEO_TERRITORIAL } from "./mapeoMunicipal.js";

const storage = getStorage(app);
let vDataActual = null; 

// 🕵️‍♂️ DETECTOR MULTI-TENANT DINÁMICO
const subdominioDetectado = window.location.hostname.split('.')[0].toLowerCase();
const subdominioLimpio = subdominioDetectado.replace('sigev-', ''); 
const CURRENT_TENANT_ID = sessionStorage.getItem('SIGEV_ACTIVE_TENANT') || ((subdominioLimpio === 'localhost' || subdominioLimpio === '127' || !subdominioLimpio) ? "paz" : subdominioLimpio);

let totalVecinosMemory = [];
let totalSolicitudesMemory = [];
let totalDonacionesMemory = [];
let totalBuzonMemory = [];
let qrScansGlobalCount = 0;
let urlVisitsGlobalCount = 0;
let miniMapaDashboard = null;
let pinMarcadorDashboard = null;

const ETIQUETAS_SECTORES = {
    "Sector Territorial 1": "Sector Territorial 1 (UV 1)",
    "Sector Territorial 2": "Sector Territorial 2 (UV 2-3)",
    "Sector Territorial 3": "Sector Territorial 3 (UV 4-5)",
    "Sector Territorial 4": "Sector Territorial 4 (UV 14-15)",
    "Sector Territorial 5": "Sector Territorial 5 (UV 16-17)",
    "Sector Territorial 6": "Sector Territorial 6 (UV 18)",
    "Sin Información": "Sin Información",
    "No Sabe / Sin Información": "No Sabe / Sin Información",
    "Pendiente de Georreferenciación": "Pendiente de Mapeo"
};

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

// ============================================================================
// 🛠️ HERRAMIENTAS GLOBALES
// ============================================================================
function obtenerAvatarVecinoHTML(id, nombreCompleto, fotoPerfil, sizeClass = "sm") {
    if (fotoPerfil && fotoPerfil !== "") {
        const dimension = sizeClass === "lg" ? "width:72px; height:72px;" : "width:28px; height:28px;";
        return `<img src="${fotoPerfil}" alt="Avatar" style="${dimension} border-radius:50%; object-fit:cover; border:1px solid var(--border-color); flex-shrink:0;">`;
    }
    const COLORES_AVATAR = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#6366f1", "#14b8a6"];
    const colorAvatar = COLORES_AVATAR[id.charCodeAt(0) % COLORES_AVATAR.length];
    let iniciales = "NN";
    if (nombreCompleto) {
        const parts = nombreCompleto.trim().split(" ");
        if (parts.length === 1) iniciales = parts[0].substring(0, 2).toUpperCase();
        else iniciales = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    const styleLG = "width:72px; height:72px; font-size:20px;";
    const styleSM = "width:28px; height:28px; font-size:11px;";
    const currentStyle = sizeClass === "lg" ? styleLG : styleSM;
    return `<div class="v-avatar-initials" style="background:${colorAvatar}; ${currentStyle} border-radius:50%; display:inline-flex; align-items:center; justify-content:center; color:#fff; font-weight:700; border:1px solid #cbd5e1; box-shadow:0 2px 4px rgba(0,0,0,0.02); flex-shrink:0;">${iniciales}</div>`;
}

function validarRutChileno(rutCompleto) {
    if (!rutCompleto) return false;
    const rutLimpio = rutCompleto.replace(/[^0-9kK]/g, "");
    if (rutLimpio.length < 8) return false;
    const cuerpo = rutLimpio.slice(0, -1);
    const dv = rutLimpio.slice(-1).toUpperCase();
    let suma = 0; let multiplo = 2;
    for (let i = 1; i <= cuerpo.length; i++) {
        const index = multiplo * cuerpo.charAt(cuerpo.length - i);
        suma = suma + index;
        if (multiplo < 7) { multiplo = multiplo + 1; } else { multiplo = 2; }
    }
    const dvEsperado = 11 - (suma % 11);
    const dvCalculado = (dvEsperado === 11) ? "0" : (dvEsperado === 10) ? "K" : dvEsperado.toString();
    return dv === dvCalculado;
}

function parseFirestoreDate(fDate) {
    if (!fDate) return new Date();
    if (fDate.toDate) return fDate.toDate();
    if (fDate.seconds) return new Date(fDate.seconds * 1000);
    const d = new Date(fDate);
    return isNaN(d.getTime()) ? new Date() : d;
}

function mostrarAlertaPersonalizada(mensaje, tipo = "success", alAceptar = null) {
    const overlay = document.createElement("div"); overlay.className = "custom-alert-overlay";
    let iconSvg = ""; let titleText = ""; let iconStyles = "";
    if (tipo === "success") { iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`; titleText = "¡Operación Exitosa!"; iconStyles = "background-color: rgba(16, 185, 129, 0.1); color: #10b981;"; } 
    else if (tipo === "info") { iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="12" x2="12" y2="16"></line></svg>`; titleText = "Notificación del Sistema"; iconStyles = "background-color: rgba(37, 99, 235, 0.1); color: #2563eb;"; } 
    else { iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`; titleText = "Acción Requerida"; iconStyles = "background-color: rgba(239, 68, 68, 0.1); color: #ef4444;"; }
    overlay.innerHTML = `<div class="custom-alert-card"><div class="custom-alert-icon" style="${iconStyles}">${iconSvg}</div><div class="custom-alert-title">${titleText}</div><div class="custom-alert-message">${mensaje}</div><button class="btn-alert-confirm" style="width: 100%; background: #2563eb; color: #ffffff; border: none; padding: 12px; font-size: 15px; font-weight: 700; border-radius: 8px; cursor: pointer;">Aceptar</button></div>`;
    document.body.appendChild(overlay);
    const btnAceptar = overlay.querySelector(".btn-alert-confirm");
    if (btnAceptar) btnAceptar.focus();
    btnAceptar.onclick = () => { overlay.remove(); if (alAceptar) alAceptar(); };
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
                <div><h3 style="margin: 0; font-size: 20px; font-weight: 800; color: #0f172a;">¡Operación Exitosa!</h3><p style="margin: 8px 0 0 0; font-size: 14px; color: #475569; line-height: 1.5;">Solicitud realizada y agregada al expediente del vecino<br><b>${nombre}</b> (RUT: ${rut}).</p></div>
                <div style="width: 100%; background: #f8fafc; border: 2px dashed #cbd5e1; padding: 16px; border-radius: 12px; display: flex; flex-direction: column; gap: 6px; position: relative;">
                    <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 800;">Código del Vecino</span>
                    <strong style="font-size: 26px; color: #0b438c; font-family: monospace;">${codigo}</strong>
                </div>
            </div>
            <div style="background: #f8fafc; padding: 16px 32px 24px 32px; border-top: 1px solid #e2e8f0; display: flex; justify-content: center;">
                <button id="btn-alerta-exito-ok" style="width: 100%; background: #2563eb; color: #ffffff; border: none; padding: 12px; font-size: 15px; font-weight: 700; border-radius: 8px; cursor: pointer;">Aceptar</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#btn-alerta-exito-ok").onclick = () => { overlay.remove(); };
}

function autoDetectarSector(lat, lng) {
    const poligonos = [
        { id: "Sector Territorial 1", coords: [[-33.514685, -70.658115], [-33.517251, -70.644833], [-33.528565, -70.647510], [-33.526514, -70.661431]] },
        { id: "Sector Territorial 2", coords: [[-33.526514, -70.661431], [-33.528565, -70.647510], [-33.539865, -70.651231], [-33.537272, -70.664437]] },
        { id: "Sector Territorial 3", coords: [[-33.537272, -70.664437], [-33.539865, -70.651231], [-33.548759, -70.652888], [-33.545409, -70.668255], [-33.543457, -70.666568]] },
        { id: "Sector Territorial 4", coords: [[-33.510680, -70.671022], [-33.514685, -70.658115], [-33.526514, -70.661431], [-33.521247, -70.676092]] },
        { id: "Sector Territorial 5", coords: [[-33.521247, -70.676092], [-33.526514, -70.661431], [-33.537272, -70.664437], [-33.531880, -70.681551]] },
        { id: "Sector Territorial 6", coords: [[-33.531880, -70.681551], [-33.537272, -70.664437], [-33.543457, -70.666568], [-33.545409, -70.668255], [-33.539123, -70.685379]] }
    ];
    let x = Number(lat), y = Number(lng);
    for (let p of poligonos) {
        let inside = false;
        for (let i = 0, j = p.coords.length - 1; i < p.coords.length; j = i++) {
            let xi = p.coords[i][0], yi = p.coords[i][1];
            let xj = p.coords[j][0], yj = p.coords[j][1];
            let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        if (inside) return p.id;
    }
    return "Sin Información"; 
}

function mostrarLoaderBloqueante(mensaje) {
    const exist = document.getElementById("global-loader-sigev");
    if (exist) exist.remove();
    const loader = document.createElement("div");
    loader.id = "global-loader-sigev";
    loader.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.8); backdrop-filter:blur(4px); z-index:9999; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#fff;";
    loader.innerHTML = `
        <div class="loader-spinner" style="width:50px; height:50px; border:4px solid rgba(255,255,255,0.3); border-top-color:#3b82f6; border-radius:50%; animation:spin 1s linear infinite; margin-bottom:16px;"></div>
        <h3 style="margin:0; font-size:16px; font-weight:700;">${mensaje}</h3>
        <style>@keyframes spin { 100% { transform:rotate(360deg); } }</style>
    `;
    document.body.appendChild(loader);
}

function ocultarLoaderBloqueante() {
    const loader = document.getElementById("global-loader-sigev");
    if (loader) loader.remove();
}

// ============================================================================
// INICIALIZACIÓN PRINCIPAL
// ============================================================================
inyectarEstructuraGlobal();
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log("Dashboard activo y conectado.");
        actualizarPerfilLayout(user);
        inicializarRelojMundial();
        construirInterfazEstructuraDashboard();
        vincularEscuchadoresTiempoRealSaaS();
    } else {
        window.location.href = "index.html";
    }
});

function inicializarRelojMundial() {
    const clockContainer = document.getElementById("live-clock");
    if (!clockContainer) return;
    const render = () => {
        const ahora = new Date();
        clockContainer.innerText = `|   ${ahora.toLocaleDateString('es-CL')}  ${ahora.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    };
    render(); setInterval(render, 1000);
}

function vincularEscuchadoresTiempoRealSaaS() {
    onSnapshot(query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID)), (snap) => {
        totalVecinosMemory = []; snap.forEach(d => totalVecinosMemory.push({ id: d.id, ...d.data() }));
        procesarYRenderizarMetricasDashboard();
    });
    onSnapshot(query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID)), (snap) => {
        totalSolicitudesMemory = []; snap.forEach(d => totalSolicitudesMemory.push({ id: d.id, ...d.data() }));
        procesarYRenderizarMetricasDashboard();
    });
    onSnapshot(query(collection(db, "donaciones"), where("tenantId", "==", CURRENT_TENANT_ID)), (snap) => {
        totalDonacionesMemory = []; snap.forEach(d => totalDonacionesMemory.push({ id: d.id, ...d.data() }));
        procesarYRenderizarMetricasDashboard();
    });
    onSnapshot(query(collection(db, "buzon_ciudadano"), where("tenantId", "==", CURRENT_TENANT_ID)), (snap) => {
        totalBuzonMemory = []; snap.forEach(d => totalBuzonMemory.push({ id: d.id, ...d.data() }));
        procesarYRenderizarMetricasDashboard();
    });
    const idMetricaTarget = CURRENT_TENANT_ID === "paz" ? "ID_CONCEJAL_PAZ_LC" : "ID_CONCEJAL_AGUAYO_LC";
    onSnapshot(doc(db, "metricas_qr", idMetricaTarget), (docSnap) => {
        if (docSnap.exists()) { 
            const data = docSnap.data();
            qrScansGlobalCount = data.scans || 0; 
            urlVisitsGlobalCount = data.visitasUrl || 0;
            procesarYRenderizarMetricasDashboard(); 
        }
    });
}

// ============================================================================
// CONSTRUCTOR ARQUITECTÓNICO DE LA INTERFAZ CENTRAL DEL DASHBOARD (VERSIÓN FIX ACORDEONES)
// ============================================================================
function construirInterfazEstructuraDashboard() {
    const bodyContainer = document.querySelector(".dashboard-body");
    if (!bodyContainer) return;

    // 🚀 ALERTA DE CAMBIO: Aquí integramos las tarjetas plegables para móvil
    bodyContainer.innerHTML = `
        <div style="margin-bottom: 24px;">
            <h2 style="font-size: 20px; font-weight: 700; color: var(--text-dark);">Resumen del Workspace</h2>
            <p style="font-size: 13px; color: var(--text-light); margin-top: 2px;">Indicadores de control territorial y actividades comunales activas</p>
        </div>

        <div class="kpi-dashboard-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 32px;">
            <div class="kpi-card" style="background: var(--card-bg); border-radius: 12px; padding: 24px; border: 1px solid var(--border-color); display: flex; flex-direction: column; align-items: flex-start; gap: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.015); justify-content: center;">
                <div style="font-size: 11px; font-weight: 700; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                    <span>👥</span> VECINOS REGISTRADOS
                </div>
                <h3 id="kpi-txt-vecinos" style="font-size: 26px; font-weight: 700; color: var(--text-dark); line-height: 1.1; letter-spacing: -0.5px; margin: 0;">0</h3>
                <span class="kpi-trend" id="kpi-sub-vecinos" style="font-size: 11px; font-weight: 600; color: #10b981; display: flex; align-items: center; gap: 2px;">+0 vecinos hoy</span>
            </div>
            
            <div class="kpi-card" style="background: var(--card-bg); border-radius: 12px; padding: 24px; border: 1px solid var(--border-color); display: flex; flex-direction: column; align-items: flex-start; gap: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.015); justify-content: center;">
                <div style="font-size: 11px; font-weight: 700; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                    <span>📂</span> SOLICITUDES ABIERTAS
                </div>
                <h3 id="kpi-txt-solicitudes" style="font-size: 26px; font-weight: 700; color: var(--text-dark); line-height: 1.1; letter-spacing: -0.5px; margin: 0;">0</h3>
                <span id="kpi-sub-solicitudes" style="font-size: 11px; font-weight: 600; color: #f59e0b; display: flex; align-items: center; gap: 2px;">0 en espera de respuesta</span>
            </div>

            <div class="kpi-card" style="background: var(--card-bg); border-radius: 12px; padding: 24px; border: 1px solid var(--border-color); display: flex; flex-direction: column; align-items: flex-start; gap: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.015); justify-content: center;">
                <div style="font-size: 11px; font-weight: 700; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                    <span>📥</span> NUEVOS DEL BUZÓN
                </div>
                <h3 id="kpi-txt-buzon" style="font-size: 26px; font-weight: 700; color: var(--text-dark); line-height: 1.1; letter-spacing: -0.5px; margin: 0;">0</h3>
                <span id="kpi-sub-buzon" style="font-size: 11px; font-weight: 600; color: #2563eb; display: flex; align-items: center; gap: 2px;">0 nuevos por clasificar</span>
            </div>

            <div class="kpi-card" style="background: var(--card-bg); border-radius: 12px; padding: 24px; border: 1px solid var(--border-color); display: flex; flex-direction: column; align-items: flex-start; gap: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.015); justify-content: center;">
                <div style="font-size: 11px; font-weight: 700; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                    <span>📊</span> VISITAS POR QR
                </div>
                <h3 id="kpi-txt-qr" style="font-size: 26px; font-weight: 700; color: var(--text-dark); line-height: 1.1; letter-spacing: -0.5px; margin: 0;">0</h3>
                <span id="kpi-sub-url-directa" style="font-size: 11px; font-weight: 600; color: #64748b; display: flex; align-items: center; gap: 2px;">Visitas por URL a la página: 0</span>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 340px; gap: 24px; align-items: stretch;" class="content-layout-grid">
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: stretch;" class="bottom-tables-grid">
                
                <div class="section-card tarjeta-plegada" id="card-vecinos-recientes" style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:24px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); display: flex; flex-direction: column;">
                    <div style="margin-bottom:16px;" class="table-title-row">
                        <h3 style="margin:0; font-size:16px; font-weight:800; color:#0f172a;">Últimos Ingresos</h3>
                        <p style="margin:2px 0 0 0; font-size:12.5px; color:#64748b;">Registro global de la plataforma</p>
                    </div>
                    <div id="unified-feed-list" style="display:flex; flex-direction:column; flex: 1;">
                        <div style="text-align:center; padding: 20px; color: #94a3b8; font-size: 13px;">Sincronizando ingresos...</div>
                    </div>
                </div>

                <div class="section-card tarjeta-plegada" id="card-solicitudes-recientes" style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:24px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); display: flex; flex-direction: column;">
                    <div style="margin-bottom:16px;" class="table-title-row">
                        <h3 style="margin:0; font-size:16px; font-weight:800; color:#0f172a;">Agenda Territorial</h3>
                        <p style="margin:2px 0 0 0; font-size:12.5px; color:#64748b;">Actividades y compromisos</p>
                    </div>
                    <div id="agenda-list" style="display:flex; flex-direction:column; flex: 1; justify-content: center; align-items: center;">
                        <div style="text-align:center; padding: 20px; color: #94a3b8; font-size: 13px; line-height: 1.5;">
                            <i>No hay eventos o actividades programadas para los próximos días.</i>
                        </div>
                    </div>
                    <button onclick="window.location.href='calendario.html'" style="margin-top:16px; width:100%; padding:10px; background:#f1f5f9; color:#2563eb; border:none; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; transition: 0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">
                        Ir al Calendario Completo
                    </button>
                </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:24px;" class="side-panel-wrapper">
                <div class="section-card" id="card-acciones-rapidas" style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:24px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                    <h3 style="margin:0; font-size:14px; font-weight:800; color:#0f172a; text-transform:uppercase; letter-spacing:0.5px;">Acciones Rápidas</h3>
                    <div style="display:flex; flex-direction:column; gap:10px; margin-top:16px;">
                        <button id="btn-quick-add-vecino-new" style="width:100%; text-decoration:none; text-align:left; border:1px solid #e2e8f0; padding:12px; background:#f8fafc; border-radius:8px; display:flex; align-items:center; gap:10px; color:#334155; font-size:13px; font-weight:700; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='#eff6ff'; this.style.borderColor='#bfdbfe';" onmouseout="this.style.background='#f8fafc'; this.style.borderColor='#e2e8f0';">
                            <span style="font-size:16px;">👤</span> Registrar nuevo vecino
                        </button>
                        <button id="btn-quick-add-solicitud-new" style="width:100%; text-decoration:none; text-align:left; border:1px solid #e2e8f0; padding:12px; background:#f8fafc; border-radius:8px; display:flex; align-items:center; gap:10px; color:#334155; font-size:13px; font-weight:700; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='#fff7ed'; this.style.borderColor='#fed7aa';" onmouseout="this.style.background='#f8fafc'; this.style.borderColor='#e2e8f0';">
                            <span style="font-size:16px;">📝</span> Registrar nueva solicitud
                        </button>
                        <button id="btn-quick-add-donacion-new" style="width:100%; text-decoration:none; text-align:left; border:1px solid #e2e8f0; padding:12px; background:#f8fafc; border-radius:8px; display:flex; align-items:center; gap:10px; color:#334155; font-size:13px; font-weight:700; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='#f0fdf4'; this.style.borderColor='#bbf7d0';" onmouseout="this.style.background='#f8fafc'; this.style.borderColor='#e2e8f0';">
                            <span style="font-size:16px;">🤝</span> Registrar nueva donación
                        </button>
                    </div>
                </div>

                <div class="section-card" id="card-qr" style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:24px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                    <h3 style="margin:0; font-size:14px; font-weight:800; color:#0f172a; text-transform:uppercase; letter-spacing:0.5px;">Herramientas Avanzadas</h3>
                    <div style="display:flex; flex-direction:column; gap:10px; margin-top:16px;">
                        <button id="btn-trigger-report-center" style="width:100%; border:none; text-align:left; padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; display:flex; align-items:center; gap:10px; color:#334155; font-size:13px; font-weight:700; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='#f5f3ff'; this.style.borderColor='#ddd6fe';" onmouseout="this.style.background='#f8fafc'; this.style.borderColor='#e2e8f0';">
                            <span style="font-size:16px;">📥</span> Centro de Descargas y Reportes
                        </button>
                        <button id="btn-trigger-qr-viewer" style="width:100%; border:none; text-align:left; padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; display:flex; align-items:center; gap:10px; color:#334155; font-size:13px; font-weight:700; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='#ecfeff'; this.style.borderColor='#a5f3fc';" onmouseout="this.style.background='#f8fafc'; this.style.borderColor='#e2e8f0';">
                            <span style="font-size:16px;">🖨️</span> Ver QR de Captación Vecinal
                        </button>
                        <a href="https://docs.sigev.cl/manual/#/" target="_blank" style="text-decoration:none; width:100%; border:none; text-align:left; padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; display:flex; align-items:center; gap:10px; color:#334155; font-size:13px; font-weight:700; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='#fdf4ff'; this.style.borderColor='#e879f9';" onmouseout="this.style.background='#f8fafc'; this.style.borderColor='#e2e8f0';">
                            <span style="font-size:16px;">📖</span> Manual de Usuario Oficial
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;

    inicializarEventosModalesHerramientas();

    const btnQuickVecino = document.getElementById("btn-quick-add-vecino-new");
    if (btnQuickVecino) btnQuickVecino.onclick = () => abrirConsolaVerificacionRutVecino();

    const btnQuickSolicitud = document.getElementById("btn-quick-add-solicitud-new");
    if (btnQuickSolicitud) btnQuickSolicitud.onclick = () => abrirModalNuevaSolicitudTriage();

    const btnQuickDonacion = document.getElementById("btn-quick-add-donacion-new");
    if (btnQuickDonacion) btnQuickDonacion.onclick = () => abrirModalNuevaDonacionDashboard();
}

// ============================================================================
// LÓGICA DEL FEED UNIFICADO
// ============================================================================
function procesarYRenderizarMetricasDashboard() {
    const ahora = new Date(); const hoyStr = ahora.toLocaleDateString('es-CL');
    const vecinosHoy = totalVecinosMemory.filter(v => {
        if (!v.fechaRegistro) return false;
        const d = v.fechaRegistro.toDate ? v.fechaRegistro.toDate() : new Date(v.fechaRegistro);
        return d.toLocaleDateString('es-CL') === hoyStr;
    }).length;

    const elVecinos = document.getElementById("kpi-txt-vecinos");
    const elVecinosSub = document.getElementById("kpi-sub-vecinos");
    if (elVecinos) elVecinos.innerText = totalVecinosMemory.length.toLocaleString();
    if (elVecinosSub) elVecinosSub.innerText = `+${vecinosHoy} vecinos hoy`;

    const abiertas = totalSolicitudesMemory.filter(s => ["Abierta", "En revisión", "En gestión", "Clasificado"].includes(s.estado)).length;
    const porResponder = totalSolicitudesMemory.filter(s => s.estadoGestion === "Finalizado en espera de respuesta" || s.estado === "Clasificado").length;
    const elSolicitudes = document.getElementById("kpi-txt-solicitudes");
    const elSolicitudesSub = document.getElementById("kpi-sub-solicitudes");
    if (elSolicitudes) elSolicitudes.innerText = abiertas;
    if (elSolicitudesSub) elSolicitudesSub.innerText = `${porResponder} en espera de respuesta`;

    const nuevosBuzon = totalBuzonMemory.filter(b => b.estado === "Nuevo" || b.estado === "Pendiente" || !b.estado).length;
    const elBuzon = document.getElementById("kpi-txt-buzon");
    const elBuzonSub = document.getElementById("kpi-sub-buzon");
    if (elBuzon) elBuzon.innerText = totalBuzonMemory.length.toLocaleString();
    if (elBuzonSub) elBuzonSub.innerText = `${nuevosBuzon} nuevos por clasificar`;

    const elQr = document.getElementById("kpi-txt-qr");
    const elUrlSub = document.getElementById("kpi-sub-url-directa");
    if (elQr) elQr.innerText = qrScansGlobalCount.toLocaleString();
    
    if (elUrlSub) {
        elUrlSub.innerText = `Visitas por URL a la página: ${urlVisitsGlobalCount}`;
    }

    renderizarFeedUnificado();
}

function renderizarFeedUnificado() {
    const container = document.getElementById("unified-feed-list");
    if (!container) return;

    let unified = [];

    // 1. Agregar Vecinos
    totalVecinosMemory.forEach(v => {
        if (!v.fechaRegistro) return;
        unified.push({
            type: 'Nuevo Vecino',
            icon: '👤', bg: '#eff6ff', color: '#2563eb',
            title: v.nombreCompleto || 'Vecino Anónimo',
            subtitle: `RUT: ${v.rut || 'S/I'}`,
            dateObj: parseFirestoreDate(v.fechaRegistro)
        });
    });

    // 2. Agregar Solicitudes
    totalSolicitudesMemory.forEach(s => {
        if (!s.fechaCreacion) return;
        unified.push({
            type: 'Solicitud Terreno',
            icon: '📝', bg: '#fff7ed', color: '#ea580c',
            title: s.motivo || s.categoria || 'Solicitud Ingresada',
            subtitle: `${s.vecinoNombre || s.nombreVecino || 'Vecino'} • #${s.codigo || 'S/N'}`,
            dateObj: parseFirestoreDate(s.fechaCreacion)
        });
    });

    // 3. Agregar Donaciones
    totalDonacionesMemory.forEach(d => {
        if (!d.fechaCreacion) return;
        unified.push({
            type: 'Aporte Social',
            icon: '🤝', bg: '#f0fdf4', color: '#16a34a',
            title: d.tipoDonacion || 'Ayuda Registrada',
            subtitle: `${d.nombreVecino || 'Vecino'} • Cant: ${d.cantidad || 1}`,
            dateObj: parseFirestoreDate(d.fechaCreacion)
        });
    });

    // 4. Agregar Buzón Web
    totalBuzonMemory.forEach(b => {
        if (!b.fecha) return;
        unified.push({
            type: 'Buzón Digital',
            icon: '📥', bg: '#f5f3ff', color: '#7c3aed',
            title: b.asunto || b.tipo || 'Mensaje Ciudadano',
            subtitle: `${b.nombre || 'Anónimo'}`,
            dateObj: parseFirestoreDate(b.fecha)
        });
    });

    // Ordenar de más reciente a más antiguo
    unified.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

    // Extraer los últimos 5
    const top5 = unified.slice(0, 5);

    if (top5.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 20px; color: #94a3b8; font-size: 13px;">No hay ingresos recientes en la plataforma.</div>`;
        return;
    }

    let html = "";
    const hoyStr = new Date().toLocaleDateString('es-CL');

    top5.forEach(item => {
        const itemDateStr = item.dateObj.toLocaleDateString('es-CL');
        const timeStr = item.dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        const dayLabel = itemDateStr === hoyStr ? "Hoy" : itemDateStr;

        html += `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:12px; overflow:hidden;">
                    <div style="width:36px; height:36px; border-radius:8px; background:${item.bg}; color:${item.color}; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0;">
                        ${item.icon}
                    </div>
                    <div style="overflow:hidden;">
                        <strong style="font-size:13px; color:#0f172a; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.title}</strong>
                        <span style="font-size:11.5px; color:#64748b; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.type} • ${item.subtitle}</span>
                    </div>
                </div>
                <div style="text-align:right; flex-shrink:0;">
                    <span style="font-size:11px; font-weight:700; color:#475569;">${timeStr}</span>
                    <small style="display:block; font-size:10px; color:#94a3b8; font-weight:600;">${dayLabel}</small>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ============================================================================
// 🚀 HERRAMIENTAS AVANZADAS: REPORTE EXCEL (.XLSX) DINÁMICO Y VISOR QR
// ============================================================================
function inicializarEventosModalesHerramientas() {
    const btnReport = document.getElementById("btn-trigger-report-center");
    if (btnReport) {
        btnReport.onclick = () => {
            const overlay = document.createElement("div"); overlay.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.4); backdrop-filter:blur(4px); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;";
            overlay.innerHTML = `
                <div style="background:#fff; border-radius:16px; width:100%; max-width:440px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); overflow:hidden; font-family:inherit; animation:popM 0.25s ease;">
                    <div style="background:#0b438c; padding:20px 24px; color:#fff; position:relative;">
                        <h3 style="margin:0; font-size:16px; font-weight:800;">Centro de Descargas y Reportes</h3>
                        <p style="margin:4px 0 0 0; font-size:12px; opacity:0.85;">Exportación de matrices de datos a formato Excel (.xlsx)</p>
                        <button id="close-rep-mdl" style="position:absolute; top:18px; right:20px; background:none; border:none; color:#fff; font-size:22px; cursor:pointer;">&times;</button>
                    </div>
                    <div style="padding:24px; display:flex; flex-direction:column; gap:12px; background:#fafafa;">
                        <button class="btn-exp-excel" data-type="vecinos" style="width:100%; padding:12px; background:#fff; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-weight:700; color:#334155; text-align:left; cursor:pointer; display:flex; justify-content:space-between; align-items:center;"><span>📊 Exportar Padrón de Vecinos</span><small style="color:#64748b;">${totalVecinosMemory.length} filas</small></button>
                        <button class="btn-exp-excel" data-type="solicitudes" style="width:100%; padding:12px; background:#fff; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-weight:700; color:#334155; text-align:left; cursor:pointer; display:flex; justify-content:space-between; align-items:center;"><span>📝 Exportar Matriz de Solicitudes</span><small style="color:#64748b;">${totalSolicitudesMemory.length} filas</small></button>
                        <button class="btn-exp-excel" data-type="donaciones" style="width:100%; padding:12px; background:#fff; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-weight:700; color:#334155; text-align:left; cursor:pointer; display:flex; justify-content:space-between; align-items:center;"><span>🤝 Exportar Historial de Donaciones</span><small style="color:#64748b;">${totalDonacionesMemory.length} filas</small></button>
                        <button class="btn-exp-excel" data-type="buzon" style="width:100%; padding:12px; background:#fff; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-weight:700; color:#334155; text-align:left; cursor:pointer; display:flex; justify-content:space-between; align-items:center;"><span>📥 Exportar Registros del Buzón Web</span><small style="color:#64748b;">${totalBuzonMemory.length} filas</small></button>
                    </div>
                </div>`;
            document.body.appendChild(overlay); overlay.querySelector("#close-rep-mdl").onclick = () => overlay.remove();
            overlay.querySelectorAll(".btn-exp-excel").forEach(btn => { btn.onclick = () => ejecutarProcesamientoYExportacionExcel(btn.getAttribute("data-type")); });
        };
    }

    const btnQr = document.getElementById("btn-trigger-qr-viewer");
    if (btnQr) {
        btnQr.onclick = () => {
            const urlDestinoUnico = `https://${CURRENT_TENANT_ID}.sigev.cl/index.html?c=${CURRENT_TENANT_ID}`;
            const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(urlDestinoUnico)}`;
            const overlay = document.createElement("div"); overlay.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.4); backdrop-filter:blur(4px); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;";
            overlay.innerHTML = `
                <div style="background:#fff; border-radius:16px; width:100%; max-width:400px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); overflow:hidden; font-family:inherit; text-align:center;">
                    <div style="background:#0b438c; padding:20px 24px; color:#fff; position:relative; text-align:left;">
                        <h3 style="margin:0; font-size:16px; font-weight:800;">Código QR de Captación Vecinal</h3>
                        <p style="margin:4px 0 0 0; font-size:12px; opacity:0.85;">Enlace de ruteo inteligente del tenant</p>
                        <button id="close-qr-mdl" style="position:absolute; top:18px; right:20px; background:none; border:none; color:#fff; font-size:22px; cursor:pointer;">&times;</button>
                    </div>
                    <div style="padding:32px 24px; display:flex; flex-direction:column; align-items:center; gap:20px;">
                        <div style="padding:16px; background:#f8fafc; border:2px dashed #cbd5e1; border-radius:12px; width:200px; height:200px; box-sizing:content-box;">
                            <img src="${qrApiUrl}" style="width:100%; height:100%; object-fit:contain;">
                        </div>
                        <div style="width:100%;">
                            <input type="text" value="${urlDestinoUnico}" readonly style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; font-family:monospace; text-align:center; background:#f1f5f9; color:#475569; outline:none; margin-bottom:12px;">
                            <div style="display:flex; gap:10px;">
                                <button id="btn-copy-link-dash" style="flex:1; padding:10px; background:#fff; border:1px solid #cbd5e1; border-radius:6px; font-size:12.5px; font-weight:700; color:#475569; cursor:pointer;">📋 Copiar Enlace</button>
                                <a href="${qrApiUrl}" download="QR_SIGEV_${CURRENT_TENANT_ID.toUpperCase()}.png" target="_blank" style="flex:1; text-decoration:none; text-align:center; padding:10px; background:#2563eb; color:#fff; border-radius:6px; font-size:12.5px; font-weight:700;">🚀 Descargar (.png)</a>
                            </div>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(overlay); overlay.querySelector("#close-qr-mdl").onclick = () => overlay.remove();
            const btnCopy = overlay.querySelector("#btn-copy-link-dash");
            btnCopy.onclick = () => {
                navigator.clipboard.writeText(urlDestinoUnico).then(() => {
                    btnCopy.innerText = "¡Copiado con éxito!"; btnCopy.style.background = "#f0fdf4"; btnCopy.style.color = "#16a34a"; btnCopy.style.borderColor = "#86efac";
                    setTimeout(() => { btnCopy.innerText = "📋 Copiar Enlace"; btnCopy.style.background = "#fff"; btnCopy.style.color = "#475569"; btnCopy.style.borderColor = "#cbd5e1"; }, 2000);
                });
            };
        };
    }
}

// 🚀 EXPORTADOR INTELIGENTE A FORMATO EXCEL (.xlsx) USANDO SHEETJS
async function ejecutarProcesamientoYExportacionExcel(tipo) {
    if (typeof XLSX === 'undefined') {
        mostrarLoaderBloqueante("Cargando motor de Excel...");
        try {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        } catch (e) {
            ocultarLoaderBloqueante();
            mostrarAlertaPersonalizada("Error de red al descargar el motor de Excel.", "error");
            return;
        }
        ocultarLoaderBloqueante();
    }

    let dataset = []; 
    let headers = []; 
    let filename = `REPORTE_SIGEV_${tipo.toUpperCase()}_${CURRENT_TENANT_ID.toUpperCase()}.xlsx`;

    if (tipo === "vecinos") {
        headers = ["Correlativo", "Nombre Completo", "RUT", "Teléfono", "Correo", "Sexo", "Dirección", "Sector", "UV", "Junta Vecinal", "Previsión Salud", "Tipo Solicitante", "Fecha Registro"];
        let dataOrdenada = [...totalVecinosMemory].sort((a, b) => (b.correlativo || 0) - (a.correlativo || 0));
        
        dataset = dataOrdenada.map(v => [
            v.correlativo || 'N/A', v.nombreCompleto, v.rut, v.telefono, v.correoElectronico || v.correo, 
            v.sexo, v.direccion, v.sectorTerritorial, v.unidadVecinal, v.juntaVecinos, v.previsionSalud, v.tipoSolicitante,
            v.fechaRegistro ? parseFirestoreDate(v.fechaRegistro).toLocaleDateString('es-CL') : 'S/I'
        ]);
    } else if (tipo === "solicitudes") {
        headers = ["Código Público", "ID Interno", "Nombre Vecino", "RUT", "Categoría", "Subcategoría", "Departamento", "Prioridad", "Estado", "Gestión", "Fecha Ingreso"];
        let dataOrdenada = [...totalSolicitudesMemory].sort((a, b) => parseFirestoreDate(b.fechaCreacion) - parseFirestoreDate(a.fechaCreacion));
        
        dataset = dataOrdenada.map(s => [
            s.codigo, s.codigoInterno, s.nombreVecino || s.vecinoNombre, s.rutVecino || s.vecinoRut, 
            s.categoria, s.subcategoria, s.oficinaDerivada, s.prioridad, s.estado, s.estadoGestion,
            s.fechaCreacion ? parseFirestoreDate(s.fechaCreacion).toLocaleDateString('es-CL') : 'S/I'
        ]);
    } else if (tipo === "donaciones") {
        headers = ["Código", "RUT Beneficiario", "Nombre", "Tipo Ayuda", "Cantidad", "Monto Gasto", "Estado", "Registrado Por", "Fecha"];
        let dataOrdenada = [...totalDonacionesMemory].sort((a, b) => parseFirestoreDate(b.fechaCreacion) - parseFirestoreDate(a.fechaCreacion));
        
        dataset = dataOrdenada.map(d => [
            d.codigoPublico || d.codigo, d.rutVecino, d.nombreVecino, d.tipoDonacion, d.cantidad, d.montoGasto, 
            d.estado, d.registradoPor, d.fechaCreacion ? parseFirestoreDate(d.fechaCreacion).toLocaleDateString('es-CL') : 'S/I'
        ]);
    } else if (tipo === "buzon") {
        headers = ["Código", "Nombre", "RUT", "Teléfono", "Correo", "Asunto", "Tipo Requerimiento", "Estado", "Estado Gestión", "Fecha"];
        let dataOrdenada = [...totalBuzonMemory].sort((a, b) => parseFirestoreDate(b.fecha) - parseFirestoreDate(a.fecha));
        
        dataset = dataOrdenada.map(b => [
            b.codigo, b.nombre, b.rut, b.telefono, b.correo, b.asunto, b.tipo, b.estado, b.estadoGestion,
            b.fecha ? parseFirestoreDate(b.fecha).toLocaleDateString('es-CL') : 'S/I'
        ]);
    }

    if (dataset.length === 0) { 
        mostrarAlertaPersonalizada(`La matriz de ${tipo} no contiene datos disponibles para exportar.`, "info"); 
        return; 
    }

    const wsData = [headers, ...dataset];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Auto-ajuste básico de columnas
    const colWidths = headers.map(h => ({ wch: Math.max(h.length, 18) }));
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, "Reporte_SIGEV");
    XLSX.writeFile(wb, filename);
}

// ============================================================================
// MODALES DE INYECCIÓN (VECINOS, SOLICITUDES Y DONACIONES)
// ============================================================================

function abrirConsolaVerificacionRutVecino() {
    const overlayVerify = document.createElement("div"); overlayVerify.className = "profile-modal-overlay"; overlayVerify.style.zIndex = "1500";
    overlayVerify.innerHTML = `
        <div class="profile-modal-card" style="max-width: 580px; width: 90%;">
            <div class="profile-modal-header" style="background: linear-gradient(135deg, #1e293b, #0b438c); padding: 20px 32px;">
                <div class="profile-header-info">
                    <h3 style="font-size: 18px; color: #fff; margin:0;">Validación de RUN Vecinal</h3>
                    <p style="color: rgba(255,255,255,0.8); font-weight: 500; margin: 4px 0 0 0; font-size:12px;">Comprobación de identidad y duplicados en el padrón</p>
                </div>
                <button class="btn-profile-close btn-cerrar-verify-x" style="top: 16px; right: 16px; background:none; border:none; font-size:24px; color:#fff; cursor:pointer;">&times;</button>
            </div>
            <div class="profile-modal-body" style="padding: 32px; background:#fff;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    <div>
                        <label style="font-size:12px; font-weight:600;">RUT <span style="color:#ef4444;">*</span></label>
                        <input type="text" id="v-rut-verif" placeholder="Ej. 18.478.241-3" autocomplete="off" style="margin-top:6px; width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none;">
                    </div>
                    <div>
                        <label style="font-size:12px; font-weight:600; color:#64748b;">NOMBRE BENEFICIARIO</label>
                        <input type="text" id="v-nombre-verif" readonly value="Esperando RUN..." style="margin-top:6px; background:#f8fafc; color:#64748b; cursor:not-allowed; font-weight:600; border:1px dashed #cbd5e1; width: 100%; padding: 10px; border-radius: 6px; outline: none;">
                    </div>
                </div>
            </div>
            <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px; border-bottom-left-radius:8px; border-bottom-right-radius:8px;">
                <button type="button" class="btn btn-secondary btn-cancelar-verify" style="padding: 10px 16px; border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; cursor: pointer; color: #475569; font-weight: 600;">Cancelar</button>
                <button type="button" id="btn-avanzar-alta-vecino" class="btn btn-primary" style="background-color:#0b438c; padding: 10px 16px; border: none; color: #fff; border-radius: 6px; cursor: pointer; font-weight: 600;" disabled>Avanzar al Registro</button>
            </div>
        </div>`;
    document.body.appendChild(overlayVerify);

    const inputRut = overlayVerify.querySelector("#v-rut-verif");
    const inputNombre = overlayVerify.querySelector("#v-nombre-verif");
    const btnAvanzar = overlayVerify.querySelector("#btn-avanzar-alta-vecino");

    inputRut.addEventListener("input", (e) => {
        btnAvanzar.disabled = true; let value = e.target.value.replace(/[^0-9kK]/g, '');
        if (value.length > 1) { e.target.value = value.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + value.slice(-1).toUpperCase(); } else { e.target.value = value.toUpperCase(); }
    });

    inputRut.addEventListener("blur", () => {
        setTimeout(async () => {
            const r = inputRut.value.trim(); if (!r) return;
            const raw = r.replace(/[^0-9kK]/g, "").toUpperCase();
            if(!validarRutChileno(raw)) { inputNombre.value = "RUT Inválido"; inputNombre.style.color = "#ef4444"; return; }
            
            const formatB = raw.length > 1 ? (raw.slice(0, -1) + "-" + raw.slice(-1)) : raw;
            const match = totalVecinosMemory.find(v => v.rut === raw || v.rut === formatB || v.rut === r);
            
            if (match) {
                inputNombre.value = "✓ " + match.nombreCompleto; inputNombre.style.color = "#059669";
                mostrarAlertaPersonalizada(`El RUT ya figura registrado. Si necesitas editar su ficha, ve al padrón de vecinos.`, "info");
            } else {
                inputNombre.value = "No enrolado"; inputNombre.style.color = "#2563eb";
                btnAvanzar.disabled = false;
                btnAvanzar.onclick = () => { overlayVerify.remove(); abrirConsolaAltaAvanzadaVecinoCompleto(null, { rut: r }); };
            }
        }, 200);
    });

    overlayVerify.querySelector(".btn-cerrar-verify-x").onclick = () => overlayVerify.remove();
    overlayVerify.querySelector(".btn-cancelar-verify").onclick = () => overlayVerify.remove();
}

function abrirConsolaAltaAvanzadaVecinoCompleto(idVecino = null, dataExistente = {}) {
    const overlayAvanzado = document.createElement("div");
    overlayAvanzado.className = "profile-modal-overlay";
    overlayAvanzado.style.zIndex = "3500";

    let opcionesSectoresHTML = `<option value="">Seleccione Sector</option>`;
    if (typeof MAPEO_TERRITORIAL !== 'undefined') {
        Object.keys(MAPEO_TERRITORIAL).forEach(sec => { opcionesSectoresHTML += `<option value="${sec}">${sec}</option>`; });
    }

    overlayAvanzado.innerHTML = `
        <div class="profile-modal-card" style="max-width: 760px; width: 95%;">
            <div class="profile-modal-header" style="background-color: #0b438c; padding: 20px 32px;">
                <div class="profile-header-info">
                    <h3 style="font-size: 18px; color: #fff; font-weight: 700; margin: 0;">Ingreso de Nuevo Vecino</h3>
                    <p style="color: rgba(255,255,255,0.8); font-weight: 500; margin: 4px 0 0 0; font-size: 12.5px;">Sistema de Gestión - Formulario de Registro Territorial Avanzado</p>
                </div>
                <button type="button" class="btn-profile-close btn-close-fast-v" style="color:#fff; position:absolute; top: 16px; right: 16px; border:none; background:transparent; font-size:24px; cursor:pointer;">&times;</button>
            </div>
            
            <div class="profile-modal-tabs" style="display: flex; gap: 24px; padding: 0 32px; border-bottom: 1px solid #e2e8f0; background: #fff;">
                <div class="profile-tab active" data-target="fast-panel-basicos" style="padding: 16px 0; font-size: 13px; font-weight: 700; color: #0b438c; border-bottom: 2px solid #0b438c; cursor: pointer;">Datos Básicos</div>
                <div class="profile-tab" data-target="fast-panel-solicitudes" style="padding: 16px 0; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer;">Solicitudes</div>
                <div class="profile-tab" data-target="fast-panel-documentos" style="padding: 16px 0; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer;">Documentos</div>
            </div>

            <div class="profile-modal-body" style="padding: 24px 32px; background: #fff; max-height: 60vh; overflow-y: auto;">
                <form id="form-alta-avanzada-vecino">
                    <div class="profile-panel active" id="fast-panel-basicos" style="display: block;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                            <div class="form-group" style="margin: 0;"><label style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom:4px; display:block;">RUT *</label><input type="text" id="v-rut" value="${dataExistente.rut || ''}" readonly style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; color: #0f172a; font-weight: 700; outline:none; cursor:not-allowed;"></div>
                            <div class="form-group" style="margin: 0;"><label style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom:4px; display:block;">Nombre completo *</label><input type="text" id="v-nombre" placeholder="Ej. Juan Pérez" required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 600; outline:none; color: #0f172a;"></div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom:4px; display:block;">Teléfono Celular</label>
                                <div style="display:flex; align-items:stretch; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; background:#fff;">
                                    <span style="background:#f8fafc; padding:10px 12px; color:#475569; font-weight:700; border-right:1px solid #cbd5e1; display:flex; align-items:center; white-space:nowrap;">+56 9</span>
                                    <input type="text" id="v-telefono" placeholder="12345678" maxlength="8" style="border:none; width:100%; padding:10px; outline:none; font-weight:600; color:var(--text-dark); background:transparent;">
                                </div>
                            </div>
                            <div class="form-group" style="margin: 0;"><label style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom:4px; display:block;">Fecha de nacimiento</label><input type="date" id="v-nacimiento" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 600; outline:none; font-family:inherit;"></div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                            <div class="form-group" style="margin: 0;"><label style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom:4px; display:block;">Correo electrónico</label><input type="email" id="v-correo" placeholder="ej. juan@email.com" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 600; outline:none;"></div>
                            <div class="form-group" style="margin: 0;"><label style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom:4px; display:block;">Ocupación / Oficio</label><input type="text" id="v-ocupacion" placeholder="Ej: Constructor, Consultor..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 600; outline:none;"></div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                            <div class="form-group" style="padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin: 0;">
                                <label style="margin-bottom: 8px; display: block; font-size: 11px; font-weight: 800; color: #0f172a;">Sexo *</label>
                                <div style="display: flex; gap: 24px; align-items: center; flex-wrap: wrap;">
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 600; color: #475569;"><input type="radio" name="v-sexo" value="Femenino" style="accent-color: #8b5cf6;"> Femenino</label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 600; color: #475569;"><input type="radio" name="v-sexo" value="Masculino" style="accent-color: #3b82f6;"> Masculino</label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 600; color: #475569;"><input type="radio" name="v-sexo" value="Otro" style="accent-color: #cbd5e1;"> Otro</label>
                                </div>
                            </div>
                            <div class="form-group" style="padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin: 0;">
                                <label style="margin-bottom: 8px; display: block; font-size: 11px; font-weight: 800; color: #0f172a;">Canal de contacto preferido</label>
                                <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 600; color: #475569;"><input type="radio" name="v-canal" value="WhatsApp" checked style="accent-color: #10b981;"> WhatsApp</label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 600; color: #475569;"><input type="radio" name="v-canal" value="Llamada" style="accent-color: #3b82f6;"> Llamada</label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 600; color: #475569;"><input type="radio" name="v-canal" value="Correo" style="accent-color: #f59e0b;"> Correo</label>
                                </div>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; padding: 14px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 11px; font-weight: 800; color: #166534; margin-bottom:4px; display:block;">Previsión de Salud</label>
                                <select id="v-prevision-salud" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; font-weight:600; background:#fff; outline:none; color: #166534;">
                                    <option value="Ninguna-Particular">Ninguna-Particular</option>
                                    <option value="FONASA">FONASA</option>
                                    <option value="ISAPRE">ISAPRE</option>
                                    <option value="DIPRECA">DIPRECA</option>
                                    <option value="CAPREDENA">CAPREDENA</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 11px; font-weight: 800; color: #166534; margin-bottom:4px; display:block;">Tramo / Letra / Isapre</label>
                                <input type="text" id="v-tramo-salud" placeholder="Ej: A, B, Colmena, Cruz Blanca" style="width:100%; padding:10px; border-radius:6px; border:1px solid #bbf7d0; font-weight:600; background:#fff; outline:none; color: #166534;">
                            </div>
                        </div>

                        <div style="margin-bottom: 16px; padding: 14px; background: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe;">
                            <div class="form-group full-width" style="margin: 0;">
                                <label style="font-size: 11px; font-weight: 800; color: #1e40af; margin-bottom:4px; display:block;">Tipo de Solicitante</label>
                                <select id="v-tipo-solicitante" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; font-weight:600; background:#fff; outline:none;">
                                    <option value="Vecino/a">Vecino/a (Particular por defecto)</option>
                                    <option value="Organización Comunitaria">Organización Comunitaria</option>
                                    <option value="Institución">Institución (Colegio, Cesfam, etc.)</option>
                                    <option value="Empresa o Comercio">Empresa o Comercio</option>
                                    <option value="Autoridad o Funcionario">Autoridad o Funcionario</option>
                                </select>
                            </div>
                            <div id="v-grupo-organizacion" style="display: none; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 14px;">
                                <div class="form-group" style="margin: 0;">
                                    <label style="font-size: 11px; font-weight: 800; color: #1e40af; margin-bottom:4px; display:block;">Tipo de Organización</label>
                                    <select id="v-tipo-organizacion" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; background:#fff; outline:none;">
                                        ${['Junta de Vecinos', 'Comité de Seguridad', 'Comité de Vivienda', 'Comité de Adelanto', 'Club Deportivo', 'Club de Adulto Mayor', 'Centro Cultural', 'Centro de Padres', 'Fundación', 'Grupo Scout', 'Org. Animalista', 'Condominio Organizado', 'Otra'].map(org => `<option value="${org}">${org}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="form-group" style="margin: 0;">
                                    <label style="font-size: 11px; font-weight: 800; color: #1e40af; margin-bottom:4px; display:block;">Nombre de la Organización</label>
                                    <input type="text" id="v-nombre-organizacion" placeholder="Ej: Club de Adulto Mayor Las Camelias" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; background:#fff; outline:none;">
                                </div>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; padding: 14px; background: #faf5ff; border-radius: 8px; border: 1px solid #e9d5ff;">
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 11px; font-weight: 800; color: #6b21a8; margin-bottom:4px; display:block;">Cantidad de Integrantes</label>
                                <input type="number" id="v-hogar-integrantes" value="1" min="1" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; background:#fff; outline:none;">
                            </div>
                            <div class="form-group" style="display: flex; align-items: center; margin-top: 24px; margin-bottom: 0;">
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; font-weight: 700; color: #6b21a8;">
                                    <input type="checkbox" id="v-hogar-jefe" style="width: 18px; height: 18px; accent-color: #8b5cf6;"> ¿Es Jefe/a de Hogar?
                                </label>
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom: 16px;">
                            <label style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom:4px; display:block;">Observaciones o Notas Críticas de Terreno</label>
                            <textarea id="v-observaciones" rows="3" placeholder="Detalles de vulnerabilidad territorial, requerimientos especiales..." style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; background:#fff; outline:none; resize:vertical; font-family:inherit;"></textarea>
                        </div>
                        
                        <div style="margin-bottom: 16px; margin-top:24px; padding-top:16px; border-top: 1px solid #e2e8f0;">
                            <label style="font-size: 12px; font-weight: 800; color: #0b438c; margin-bottom:12px; display:block;">📍 Ubicación Cartográfica</label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                                <div class="form-group" style="margin: 0;">
                                    <label style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom:4px; display:block;">Dirección Principal *</label>
                                    <input type="text" id="v-direccion" placeholder="Ej. Av. Principal 1234" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; background:#fff; outline:none;">
                                </div>
                                <div class="form-group" style="margin: 0;">
                                    <label style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom:4px; display:block;">Dirección Complementaria (Inmueble Interno)</label>
                                    <input type="text" id="v-direccion-complementaria" placeholder="Ej. Block 4, Depto 201, Casa A" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; background:#fff; outline:none;">
                                </div>
                            </div>
                            <div id="v-mini-mapa-picker" style="width: 100%; height: 210px; border: 1px solid #cbd5e1; border-radius: 6px; margin-top: 6px; z-index: 10;"></div>
                            <input type="hidden" id="v-lat" value=""><input type="hidden" id="v-lng" value="">
                        </div>

                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom: 16px;">
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom:4px; display:block;">Sector Territorial (Automático)</label>
                                <select id="v-sector" disabled style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; background:#f1f5f9; outline:none; font-weight:700; color:#0b438c; cursor:not-allowed;">${opcionesSectoresHTML}</select>
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom:4px; display:block;">Unidad Vecinal (UV)</label>
                                <select id="v-uv" disabled style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; background:#f8fafc; outline:none;"><option value="">Seleccione primero el sector</option></select>
                            </div>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom: 0;">
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom:4px; display:block;">Junta de Vecinos</label>
                                <select id="v-junta" disabled style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; background:#f8fafc; outline:none;"><option value="">Seleccione primero la UV</option></select>
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom:4px; display:block;">Sector / Barrio Popular (Manual)</label>
                                <input type="text" id="v-barrio" placeholder="Ej. Villa Los Troncos..." style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; background:#fff; outline:none;">
                            </div>
                        </div>
                    </div>
                    
                    <div class="profile-panel" id="v-panel-solicitudes" style="display: none; padding: 20px; text-align: center;">
                        <p style="color: #64748b; font-size: 13px;">Las solicitudes estarán disponibles una vez que el vecino sea registrado en la plataforma.</p>
                    </div>

                    <div class="profile-panel" id="v-panel-documentos" style="display: none; padding: 20px; text-align: center;">
                        <p style="color: #64748b; font-size: 13px;">Los documentos podrán adjuntarse desde la ficha principal del vecino una vez guardado.</p>
                    </div>
                </form>
            </div>
            
            <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                <button type="button" class="btn-close-fast-v" style="padding: 10px 16px; border-radius: 6px; font-weight: 700; font-size: 13.5px; border: 1px solid #cbd5e1; background: #fff; color: #475569; cursor: pointer;">Cancelar</button>
                <button type="button" class="btn-guardar-fast-v" style="padding: 10px 24px; border-radius: 6px; font-weight: 700; font-size: 13.5px; border: none; background: #0b438c; color: #fff; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(11, 67, 140, 0.2);">Guardar Vecino y Continuar</button>
            </div>
        </div>`;

    document.body.appendChild(overlayAvanzado);

    const tabs = overlayAvanzado.querySelectorAll(".profile-tab");
    const panels = overlayAvanzado.querySelectorAll(".profile-panel");
    tabs.forEach(t => t.addEventListener("click", () => {
        tabs.forEach(tab => {
            tab.classList.remove("active");
            tab.style.borderBottom = "none";
            tab.style.color = "#64748b";
            tab.style.fontWeight = "600";
        });
        panels.forEach(p => p.style.display = "none");
        
        t.classList.add("active");
        t.style.borderBottom = "2px solid #0b438c";
        t.style.color = "#0b438c";
        t.style.fontWeight = "700";
        overlayAvanzado.querySelector(`#${t.getAttribute("data-target")}`).style.display = "block";
    }));

    const sTipoSol = overlayAvanzado.querySelector("#v-tipo-solicitante");
    const grupoOrg = overlayAvanzado.querySelector("#v-grupo-organizacion");
    sTipoSol.addEventListener("change", (e) => {
        if (e.target.value === "Organización Comunitaria") {
            grupoOrg.style.display = "grid";
        } else {
            grupoOrg.style.display = "none";
        }
    });

    const telInput = overlayAvanzado.querySelector("#v-telefono");
    if (telInput) { telInput.addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, '').substring(0, 8); }); }

    setTimeout(() => {
        const mapContainer = overlayAvanzado.querySelector("#v-mini-mapa-picker"); 
        if (!mapContainer) return;
        const baseLat = -33.537; const baseLng = -70.664; const baseZoom = 14;
        
        try {
            const miniMapa = L.map(mapContainer, { zoomControl: true }).setView([baseLat, baseLng], baseZoom);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(miniMapa);
            setTimeout(() => miniMapa.invalidateSize(), 60); setTimeout(() => miniMapa.invalidateSize(), 300);
            
            let pinMarcador = null;
            const SVG_MARKER = L.divIcon({ html: `<div class="custom-pin-wrapper"><svg class="pin-vector" width="28" height="38" viewBox="0 0 24 24" fill="#2563eb" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`, className: 'leaflet-marker-custom', iconSize: [28, 38], iconAnchor: [14, 38] });
            
            miniMapa.on('click', async (e) => {
                const { lat, lng } = e.latlng; overlayAvanzado.querySelector("#v-lat").value = lat.toFixed(6); overlayAvanzado.querySelector("#v-lng").value = lng.toFixed(6);
                if (pinMarcador) { pinMarcador.setLatLng(e.latlng); } else { pinMarcador = L.marker(e.latlng, { icon: SVG_MARKER }).addTo(miniMapa); }
                const sectorDetectado = autoDetectarSector(lat, lng); const sSector = overlayAvanzado.querySelector("#v-sector");
                if (sectorDetectado && sectorDetectado !== "Sin Información" && sSector) { sSector.value = sectorDetectado; sSector.dispatchEvent(new Event('change')); } else if (sSector) { sSector.value = "No Sabe / Sin Información"; sSector.dispatchEvent(new Event('change')); }
                
                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`); const dataRes = await response.json();
                    if (dataRes && dataRes.address) {
                        const calle = dataRes.address.road || dataRes.address.pedestrian || "Calle sin nombre"; const numero = dataRes.address.house_number || "";
                        const inputDirModal = overlayAvanzado.querySelector("#v-direccion"); if (inputDirModal) { inputDirModal.value = numero ? `${calle} ${numero}` : calle; }
                    }
                } catch (err) { console.error("Error Nominatim:", err); }
            });

            const inputDireccion = overlayAvanzado.querySelector("#v-direccion");
            if (inputDireccion) {
                inputDireccion.addEventListener("blur", async () => {
                    const direccionTexto = inputDireccion.value.trim(); if (!direccionTexto) return;
                    try {
                        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(direccionTexto + ", La Cisterna, Santiago, Chile")}`); 
                        const dataRes = await response.json();
                        if (dataRes && dataRes.length > 0) {
                            const latGeocodificada = parseFloat(dataRes[0].lat); const lngGeocodificada = parseFloat(dataRes[0].lon);
                            overlayAvanzado.querySelector("#v-lat").value = latGeocodificada.toFixed(6); overlayAvanzado.querySelector("#v-lng").value = lngGeocodificada.toFixed(6);
                            const nuevaPosicionLatLng = new L.LatLng(latGeocodificada, lngGeocodificada); miniMapa.setView(nuevaPosicionLatLng, 16);
                            if (pinMarcador) { pinMarcador.setLatLng(nuevaPosicionLatLng); } else { pinMarcador = L.marker(nuevaPosicionLatLng, { icon: SVG_MARKER }).addTo(miniMapa); }
                            const sectorDetectado = autoDetectarSector(latGeocodificada, lngGeocodificada); const sSector = overlayAvanzado.querySelector("#v-sector");
                            if (sectorDetectado && sectorDetectado !== "Sin Información" && sSector) { sSector.value = sectorDetectado; sSector.dispatchEvent(new Event('change')); } else if (sSector) { sSector.value = "No Sabe / Sin Información"; sSector.dispatchEvent(new Event('change')); }
                        }
                    } catch (err) { console.error(err); }
                });
            }
            
            const tabsMap = overlayAvanzado.querySelectorAll(".profile-tab"); 
            tabsMap.forEach(t => t.addEventListener("click", () => { 
                if (t.getAttribute("data-target") === "v-panel-basicos") { setTimeout(() => miniMapa.invalidateSize(), 50); } 
            }));
        } catch (leafletError) {
            console.warn("Leaflet no cargado o error en mapa: ", leafletError);
            mapContainer.innerHTML = "<p style='color:#64748b; font-size:12px; text-align:center; padding:20px;'>Mapa no disponible en esta vista.</p>";
        }
    }, 120);

    const sSector = overlayAvanzado.querySelector("#v-sector");
    const sUv = overlayAvanzado.querySelector("#v-uv");
    const sJunta = overlayAvanzado.querySelector("#v-junta");

    sSector.addEventListener("change", (e) => {
        const sector = e.target.value;
        sUv.innerHTML = '<option value="">Seleccione UV</option>';
        sJunta.innerHTML = '<option value="">Seleccione Junta</option>';
        sJunta.disabled = true;
        sJunta.style.background = "#f8fafc";

        if (sector && typeof MAPEO_TERRITORIAL !== 'undefined' && MAPEO_TERRITORIAL[sector] && sector !== "No Sabe / Sin Información") {
            MAPEO_TERRITORIAL[sector].uvs.forEach(uv => { sUv.innerHTML += `<option value="${uv}">${uv}</option>`; });
            sUv.disabled = false;
            sUv.style.background = "#fff";
        } else { 
            sUv.disabled = true; 
            sUv.style.background = "#f8fafc";
        }
    });

    sUv.addEventListener("change", (e) => {
        const sector = sSector.value;
        const uv = e.target.value;
        sJunta.innerHTML = '<option value="">Seleccione Junta</option>';

        if (sector && uv && typeof MAPEO_TERRITORIAL !== 'undefined' && MAPEO_TERRITORIAL[sector]?.juntas[uv]) {
            MAPEO_TERRITORIAL[sector].juntas[uv].forEach(j => { sJunta.innerHTML += `<option value="${j}">${j}</option>`; });
            sJunta.disabled = false;
            sJunta.style.background = "#fff";
        } else { 
            sJunta.disabled = true; 
            sJunta.style.background = "#f8fafc";
        }
    });

    const cerrarYLimpiarFast = () => {
        overlayAvanzado.remove();
        mostrarAlertaPersonalizada("Registro cancelado.", "info");
    };
    overlayAvanzado.querySelectorAll(".btn-close-fast-v").forEach(btn => btn.onclick = cerrarYLimpiarFast);

    const btnGuardarFast = overlayAvanzado.querySelector(".btn-guardar-fast-v");
    btnGuardarFast.onclick = async () => {
        const rutV = overlayAvanzado.querySelector("#v-rut").value.trim();
        if (!validarRutChileno(rutV)) {
            mostrarAlertaPersonalizada("El RUT ingresado no es válido matemáticamente. Por favor, corríjalo.", "error");
            overlayAvanzado.querySelector("#v-rut").style.borderColor = "#ef4444";
            return;
        }

        const nombreV = overlayAvanzado.querySelector("#v-nombre").value.trim();
        if (!nombreV) {
            overlayAvanzado.querySelector("#v-nombre").style.borderColor = "#ef4444";
            return;
        }

        const dirPrincipal = overlayAvanzado.querySelector("#v-direccion").value.trim() || "No registrada";
        const dirComplementaria = overlayAvanzado.querySelector("#v-direccion-complementaria").value.trim();
        const baseString = `${dirPrincipal}-${dirComplementaria}`;
        const idHogarCalculado = "HOG-" + baseString.toLowerCase().trim().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");

        btnGuardarFast.disabled = true;
        btnGuardarFast.innerText = "Guardando...";

        try {
            const sexoSelect = overlayAvanzado.querySelector('input[name="v-sexo"]:checked')?.value || "No especificado";
            const canalSelect = overlayAvanzado.querySelector('input[name="v-canal"]:checked')?.value || "WhatsApp";
            const fonoBase = overlayAvanzado.querySelector("#v-telefono").value.trim();
            const telFinal = fonoBase ? `+56 9 ${fonoBase}` : "No registrado";
            
            const tipoSol = sTipoSol.value;
            const orgTipo = tipoSol === "Organización Comunitaria" ? overlayAvanzado.querySelector("#v-tipo-organizacion").value : "";
            const orgNombre = tipoSol === "Organización Comunitaria" ? overlayAvanzado.querySelector("#v-nombre-organizacion").value.trim() : "";
            const latVal = overlayAvanzado.querySelector("#v-lat").value; 
            const lngVal = overlayAvanzado.querySelector("#v-lng").value;

            const nombreNormalizado = nombreV.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const posibleFantasma = totalVecinosMemory.find(v => {
                if (v.rut && v.rut.startsWith("S/R-")) {
                    const nombreFantasma = (v.nombreCompleto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    const fonoMatch = (telFinal !== "No registrado" && v.telefono === telFinal);
                    const nombreMatch = (nombreFantasma === nombreNormalizado);
                    return fonoMatch || nombreMatch;
                }
                return false;
            });

            if (posibleFantasma) {
                mostrarAlertaPersonalizada(
                    `<div style="text-align: left;">
                        <span style="font-weight:800; color:#b91c1c;">¡Posible Perfil Duplicado Detectado!</span><br><br>
                        Encontramos un expediente sin RUT que coincide con el <b>Nombre</b> o <b>Teléfono</b> que estás ingresando:<br>
                        • Nombre: ${posibleFantasma.nombreCompleto}<br>
                        • ID Actual: ${posibleFantasma.rut}<br><br>
                        Te sugerimos buscar a este vecino en el módulo territorial y editar su perfil para actualizar su RUT real antes de seguir.
                    </div>`,
                    "error"
                );
                overlayAvanzado.remove();
                return;
            }

            const ejecutarGuardadoFinal = async (idHogarFinal) => {
                try {
                    const nuevoVecinoPayload = {
                        nombreCompleto: nombreV,
                        rut: rutV,
                        telefono: telFinal,
                        fechaNacimiento: overlayAvanzado.querySelector("#v-nacimiento").value || "",
                        correo: overlayAvanzado.querySelector("#v-correo").value.trim() || "",
                        ocupacion: overlayAvanzado.querySelector("#v-ocupacion").value.trim() || "",
                        sexo: sexoSelect,
                        canalPreferencia: canalSelect,
                        previsionSalud: overlayAvanzado.querySelector("#v-prevision-salud").value || "Ninguna-Particular",
                        tramoLetraIsapre: overlayAvanzado.querySelector("#v-tramo-salud").value.trim() || "",
                        tipoSolicitante: tipoSol,
                        tipoOrganizacion: orgTipo,
                        nombreOrganizacion: orgNombre,
                        idHogar: idHogarFinal,
                        cantidadIntegrantes: parseInt(overlayAvanzado.querySelector("#v-hogar-integrantes").value) || 1,
                        jefeHogar: overlayAvanzado.querySelector("#v-hogar-jefe").checked,
                        direccion: dirPrincipal,
                        direccionComplementaria: dirComplementaria,
                        sectorTerritorial: sSector.value || "No Sabe / Sin Información",
                        unidadVecinal: sUv.value || "Sin Información",
                        juntaVecinos: sJunta.value || "Sin Información",
                        barrioPopular: overlayAvanzado.querySelector("#v-barrio").value.trim() || "Sin Información",
                        observaciones: overlayAvanzado.querySelector("#v-observaciones").value.trim() || "",
                        fotoPerfil: "",
                        lat: latVal ? Number(latVal) : "",
                        lng: lngVal ? Number(lngVal) : "",
                        tenantId: CURRENT_TENANT_ID,
                        fechaRegistro: serverTimestamp()
                    };

                    let nuevoIdSeguro = "";
                    const hoy = new Date(); const yy = String(hoy.getFullYear()).slice(-2); const mm = String(hoy.getMonth() + 1).padStart(2, '0'); const dd = String(hoy.getDate()).padStart(2, '0'); const fechaStr = `${yy}${mm}${dd}`;
                    const counterRef = doc(db, "counters_diarios", String(CURRENT_TENANT_ID));
                    
                    await runTransaction(db, async (transaction) => {
                        const counterDoc = await transaction.get(counterRef); 
                        let currentCount = 0; 
                        if (counterDoc.exists() && counterDoc.data().vecinosTotal) { currentCount = counterDoc.data().vecinosTotal; }
                        const newCount = currentCount + 1; 
                        transaction.set(counterRef, { vecinosTotal: newCount }, { merge: true });
                        nuevoVecinoPayload.correlativo = newCount; 
                        
                        const nuevoVecinoRef = doc(collection(db, "vecinos")); 
                        transaction.set(nuevoVecinoRef, nuevoVecinoPayload);
                        nuevoIdSeguro = nuevoVecinoRef.id;
                    });
                    
                    overlayAvanzado.remove();
                    
                    mostrarAlertaPersonalizada(`Expediente creado con éxito para ${nombreV}.`, "success");
                } catch(errorInt) {
                    console.error("Fallo interno guardando:", errorInt);
                    btnGuardarFast.disabled = false;
                    btnGuardarFast.innerText = "Guardar Vecino y Continuar";
                    mostrarAlertaPersonalizada("Error al escribir el registro en la base de datos.", "error");
                }
            };

            const matchFamiliar = totalVecinosMemory.find(v => v.idHogar && v.idHogar.startsWith(idHogarCalculado));
            if (matchFamiliar && dirPrincipal !== "No registrada" && dirPrincipal !== "S/R" && dirPrincipal !== "Sin Información") {
                mostrarModalShieldFamiliar(matchFamiliar.nombreCompleto, dirPrincipal, () => {
                    ejecutarGuardadoFinal(matchFamiliar.idHogar).catch(e => { console.error(e); btnGuardarFast.disabled = false; btnGuardarFast.innerText = "Guardar Vecino y Continuar"; });
                }, () => {
                    ejecutarGuardadoFinal(idHogarCalculado + "-IND-" + Date.now().toString().substring(7)).catch(e => { console.error(e); btnGuardarFast.disabled = false; btnGuardarFast.innerText = "Guardar Vecino y Continuar"; });
                });
            } else {
                await ejecutarGuardadoFinal(idHogarCalculado);
            }

        } catch (err) {
            console.error("Error en try principal:", err);
            btnGuardarFast.disabled = false;
            btnGuardarFast.innerText = "Guardar Vecino y Continuar";
            mostrarAlertaPersonalizada("Error inesperado en los datos de entrada.", "error");
        }
    };
}

function abrirModalNuevaSolicitudTriage() {
    const modalTriage = document.createElement("div"); modalTriage.className = "profile-modal-overlay"; modalTriage.style.zIndex = "1600";
    modalTriage.innerHTML = `
        <div class="profile-modal-card" style="max-width: 660px; width: 92%;">
            <div class="profile-modal-header" style="background: linear-gradient(135deg, #1e293b, #0b438c); padding: 20px 32px; position:relative;">
                <div class="profile-header-info">
                    <h3 style="font-size:18px; color:#fff; margin:0; font-weight:800;">Registrar Requerimiento Presencial</h3>
                    <p style="color: rgba(255,255,255,0.8); font-weight: 500; margin: 4px 0 0 0; font-size:12px;">Despacho rápido y clasificación directa de solicitudes de terreno</p>
                </div>
                <button type="button" class="btn-profile-close btn-cerrar-triage" style="top:16px; right:20px; background:none; border:none; font-size:24px; color:#fff; cursor:pointer;">&times;</button>
            </div>
            <div class="profile-modal-body" style="padding:24px 32px; background:#fff; max-height:65vh; overflow-y:auto;">
                <form id="form-triage-dashboard" onsubmit="event.preventDefault();">
                    <div class="form-row-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div class="form-group"><label style="font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 6px; display: block;">RUT Vecino *</label><input type="text" id="tr-rut" placeholder="Ej: 18.478.241-3" required autocomplete="off" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none;"></div>
                        <div class="form-group"><label style="font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 6px; display: block;">Nombre Beneficiario</label><input type="text" id="tr-nombre" readonly value="Esperando RUN..." style="background-color:#f1f5f9; font-weight:700; cursor:not-allowed; color:#64748b; width: 100%; padding: 10px; border: 1px dashed #cbd5e1; border-radius: 6px; outline: none;"></div>
                    </div>
                    <div class="form-row-grid" style="margin-top:14px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div class="form-group"><label style="font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 6px; display: block;">Teléfono Celular de Respaldo</label><input type="text" id="tr-telefono" placeholder="Ej. 91234567" autocomplete="off" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none;"></div>
                        <div class="form-group"><label style="font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 6px; display: block;">Dirección del Incidente</label><input type="text" id="tr-direccion" placeholder="Ej. Av. El Parrón 450" autocomplete="off" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none;"></div>
                    </div>
                    <div style="height:1px; background:#e2e8f0; margin:20px 0;"></div>
                    <div class="form-row-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div class="form-group"><label style="font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 6px; display: block;">Categoría Municipal *</label><select id="tr-categoria" required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none;"><option value="">Seleccione Categoría...</option></select></div>
                        <div class="form-group"><label style="font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 6px; display: block;">Subcategoría *</label><select id="tr-subcategoria" disabled required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none;"><option value="">Seleccione primero categoría...</option></select></div>
                    </div>
                    <div class="form-row-grid" style="margin-top:14px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div class="form-group"><label style="font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 6px; display: block;">Oficina / Unidad Derivada</label><input type="text" id="tr-oficina" readonly style="background:#f1f5f9; font-weight:600; color:#334155; width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none;"></div>
                        <div class="form-group"><label style="font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 6px; display: block;">Prioridad Operativa *</label><select id="tr-prioridad" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none;"><option value="Baja">🟢 Baja</option><option value="Media" selected>🟡 Media</option><option value="Alta">🔴 Alta</option></select></div>
                    </div>
                    <div class="form-row-grid" style="margin-top:14px;">
                        <div class="form-group full-width"><label style="font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 6px; display: block;">Descripción detallada del requerimiento *</label><textarea id="tr-descripcion" rows="3" required placeholder="Describe la problemática planteada por el vecino..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; resize: vertical;"></textarea></div>
                    </div>
                </form>
            </div>
            <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px; border-bottom-left-radius:8px; border-bottom-right-radius:8px;">
                <button type="button" class="btn btn-secondary btn-limpiar-triage-local" style="padding: 10px 16px; border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; cursor: pointer; color: #475569; font-weight: 600;">Limpiar</button>
                <button type="button" class="btn btn-secondary btn-ir-crear-vecino-local" style="display:none; padding: 10px 16px; border: 1px solid #bfdbfe; background: #eff6ff; border-radius: 6px; cursor: pointer; color: #2563eb; font-weight: 700;">+ Enrolar Vecino</button>
                <button type="button" id="btn-guardar-solicitud-final" class="btn btn-primary" style="background-color:#0b438c; padding: 10px 16px; border: none; color: #fff; border-radius: 6px; cursor: pointer; font-weight: 600;" disabled>🚀 Crear Solicitud Presencial</button>
            </div>
        </div>`;
    document.body.appendChild(modalTriage);

    const inputRut = modalTriage.querySelector("#tr-rut");
    const inputNombre = modalTriage.querySelector("#tr-nombre");
    const inputTelefono = modalTriage.querySelector("#tr-telefono");
    const inputDireccion = modalTriage.querySelector("#tr-direccion");
    const sCat = modalTriage.querySelector("#tr-categoria");
    const sSub = modalTriage.querySelector("#tr-subcategoria");
    const iOfi = modalTriage.querySelector("#tr-oficina");
    const sPrio = modalTriage.querySelector("#tr-prioridad");
    const tDesc = modalTriage.querySelector("#tr-descripcion");
    
    const btnGuardar = modalTriage.querySelector("#btn-guardar-solicitud-final");
    const btnEnrolar = modalTriage.querySelector(".btn-ir-crear-vecino-local");
    const btnLimpiar = modalTriage.querySelector(".btn-limpiar-triage-local");

    Object.keys(MAPA_CLASIFICACION_SIGEV).forEach(cat => {
        const opt = document.createElement("option"); opt.value = cat; opt.textContent = cat; sCat.appendChild(opt);
    });

    sCat.onchange = (e) => {
        const cat = e.target.value; sSub.innerHTML = '<option value="">Seleccione subcategoría...</option>'; iOfi.value = "";
        if (cat && MAPA_CLASIFICACION_SIGEV[cat]) {
            iOfi.value = MAPA_CLASIFICACION_SIGEV[cat].depName;
            Object.keys(MAPA_CLASIFICACION_SIGEV[cat].subs).forEach(s => {
                const opt = document.createElement("option"); opt.value = s; opt.textContent = s; sSub.appendChild(opt);
            });
            sSub.disabled = false;
        } else { sSub.disabled = true; }
    };

    const verificarIdentidad = async (rutTipeado) => {
        if(!rutTipeado) return;
        const raw = rutTipeado.replace(/[^0-9kK]/g, "").toUpperCase();
        if (raw.length < 8) {
            vDataActual = null; inputNombre.value = "Esperando RUN..."; inputNombre.style.color = "#64748b"; btnGuardar.disabled = true; btnEnrolar.style.display = "none"; return;
        }
        const formatB = raw.length > 1 ? (raw.slice(0, -1) + "-" + raw.slice(-1)) : raw;
        try {
            const match = totalVecinosMemory.find(v => v.rut === raw || v.rut === formatB || v.rut === rutTipeado);
            if(match) {
                vDataActual = match;
                inputNombre.value = "✓ " + vDataActual.nombreCompleto; inputNombre.style.color = "#059669";
                inputTelefono.value = vDataActual.telefono || "";
                inputDireccion.value = vDataActual.direccion || "";
                btnEnrolar.style.display = "none"; btnGuardar.disabled = false;
            } else {
                vDataActual = null; inputNombre.value = "✗ No Registrado"; inputNombre.style.color = "#ef4444"; btnGuardar.style.display = "none"; btnEnrolar.style.display = "block";
            }
        } catch(e) {}
    };

    inputRut.addEventListener("input", (e) => {
        let value = e.target.value.replace(/[^0-9kK]/g, '');
        if (value.length > 1) { e.target.value = value.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + value.slice(-1).toUpperCase(); } else { e.target.value = value.toUpperCase(); }
        verificarIdentidad(e.target.value);
    });

    btnEnrolar.onclick = () => {
        modalTriage.remove(); abrirConsolaAltaAvanzadaVecinoCompleto(null, { rut: inputRut.value });
    };

    btnLimpiar.onclick = () => {
        inputRut.value = ""; inputNombre.value = "Esperando RUN..."; inputNombre.style.color = "#64748b"; inputTelefono.value = ""; inputDireccion.value = "";
        sCat.value = ""; sSub.innerHTML = '<option value="">Seleccione primero categoría...</option>'; sSub.disabled = true; iOfi.value = ""; tDesc.value = "";
        btnEnrolar.style.display = "none"; btnGuardar.style.display = "block"; btnGuardar.disabled = true;
    };

    btnGuardar.onclick = async () => {
        const cat = sCat.value; const sub = sSub.value; const desc = tDesc.value.trim();
        if (!cat || !sub || !desc || !vDataActual) return;

        btnGuardar.disabled = true; btnGuardar.innerText = "Registrando...";
        try {
            const currentUser = auth.currentUser;
            let baseName = currentUser ? (currentUser.displayName || currentUser.email) : "Equipo Territorial";
            const hoy = new Date(); const yy = String(hoy.getFullYear()).slice(-2); const mm = String(hoy.getMonth() + 1).padStart(2, '0'); const dd = String(hoy.getDate()).padStart(2, '0'); const fechaStr = `${yy}${mm}${dd}`;
            const tnt = CURRENT_TENANT_ID.substring(0, 4).toUpperCase();

            const counterRef = doc(db, "counters_diarios", CURRENT_TENANT_ID);
            let correlativoNumerico = 1;
            await runTransaction(db, async (transaction) => {
                const counterSnap = await transaction.get(counterRef);
                if (counterSnap.exists()) {
                    const data = counterSnap.data(); if (data[fechaStr]) { correlativoNumerico = data[fechaStr] + 1; }
                    transaction.set(counterRef, { [fechaStr]: correlativoNumerico }, { merge: true });
                } else { transaction.set(counterRef, { [fechaStr]: 1 }); }
            });

            const correlativoStr = String(correlativoNumerico).padStart(4, '0');
            const codigoPublico = `SIG-${fechaStr}-${correlativoStr}`;
            let codigoInterno = `SIG-${tnt}-${fechaStr}-${correlativoStr}`;

            if (MAPA_CLASIFICACION_SIGEV[cat]) {
                const dataCat = MAPA_CLASIFICACION_SIGEV[cat];
                codigoInterno += `-${dataCat.depCod || "GEN"}-${dataCat.catCod || "GEN"}-${dataCat.subs[sub] || "GEN"}`;
            }

            const payload = {
                tenantId: CURRENT_TENANT_ID, idVecino: vDataActual.id, vecinoNombre: vDataActual.nombreCompleto, nombreVecino: vDataActual.nombreCompleto, vecinoRut: vDataActual.rut, rutVecino: vDataActual.rut,
                vecinoTelefono: inputTelefono.value.trim() || vDataActual.telefono || "S/R", vecinoDireccion: inputDireccion.value.trim() || vDataActual.direccion || "S/R",
                codigo: codigoPublico, codigoInterno: codigoInterno, categoria: cat, motivo: cat, subcategoria: sub, oficinaDerivada: iOfi.value, prioridad: sPrio.value, descripcion: desc,
                estado: "Clasificado", estadoGestion: "En revisión", fechaClasificacion: serverTimestamp(), origen: "Registro Presencial", fechaCreacion: serverTimestamp(), registradaPorNombre: baseName, asignadoA: baseName, adjuntos: []
            };

            await setDoc(doc(collection(db, "solicitudes")), payload);
            modalTriage.remove();
            mostrarAlertaTicketCreado(vDataActual.nombreCompleto, vDataActual.rut, codigoPublico);
        } catch(e) { btnGuardar.disabled = false; btnGuardar.innerText = "🚀 Crear Solicitud Presencial"; }
    };

    modalTriage.querySelector(".btn-cerrar-triage").onclick = () => modalTriage.remove();
}

function abrirModalNuevaDonacionDashboard(rutPredefinido = "") {
    const overlay = document.createElement("div"); overlay.className = "profile-modal-overlay"; overlay.style.zIndex = "3000";
    const baseCats = ["Canasta de Alimentos", "Insumos Médicos / Pañales", "Materiales de Construcción", "Mediagua / Vivienda Emergencia", "Silla de Ruedas / Ayuda Técnica", "Subvención Económica Directa"];
    const optCats = baseCats.map(c => `<option value="${c.trim()}">${c.trim()}</option>`).join("");

    overlay.innerHTML = `
        <div class="profile-modal-card" style="max-width: 600px; width: 90%;">
            <div class="profile-modal-header" style="background: linear-gradient(135deg, #1e293b, #0b438c); padding: 20px 32px;">
                <div class="profile-header-info">
                    <h3 style="font-size: 18px; color: #fff; margin: 0; font-weight: 800;">Registrar Petición de Aporte</h3>
                    <p style="color: rgba(255,255,255,0.8); font-weight: 500; margin: 4px 0 0 0; font-size:12px;">La solicitud ingresará a revisión para la posterior validación del Concejal</p>
                </div>
                <button class="btn-profile-close btn-close-don" style="color:#fff; top: 16px; right: 16px; border:none; background:transparent; font-size:24px; cursor:pointer;">&times;</button>
            </div>
            <div class="profile-modal-body" style="padding: 24px 32px; background: #fff;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                    <div>
                        <label style="font-size: 11px; font-weight: 800; color: #0f172a;">RUT BENEFICIARIO *</label>
                        <input type="text" id="new-don-rut" placeholder="Ej: 17.443.221-K" maxlength="12" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 700; outline:none;">
                    </div>
                    <div>
                        <label style="font-size: 11px; font-weight: 800; color: #64748b;">NOMBRE BENEFICIARIO</label>
                        <input type="text" id="new-don-nombre" readonly placeholder="Validando RUT..." style="width: 100%; padding: 10px; border: 1px dashed #cbd5e1; border-radius: 6px; background: #f8fafc; color: #475569; font-weight: 600; outline:none; cursor:not-allowed;">
                        <input type="hidden" id="new-don-idvecino" value="SIN_EXPEDIENTE_VINCULADO">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                    <div>
                        <label style="font-size: 11px; font-weight: 800; color: #0f172a;">TIPO DE DONACIÓN *</label>
                        <select id="new-don-tipo" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 600; outline:none; background:#fff;">
                            <option value="">Seleccione tipo...</option>
                            ${optCats}
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 11px; font-weight: 800; color: #0f172a;">CANTIDAD / VOLUMEN *</label>
                        <input type="text" id="new-don-cant" placeholder="Ej: 2 unidades, 1 silla" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 600; outline:none;">
                    </div>
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="font-size: 11px; font-weight: 800; color: #0f172a;">MONTO O COSTO ESTIMADO ($) *</label>
                    <input type="number" id="new-don-monto" placeholder="Ej: 45000" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 700; color:#166534; outline:none; background:#f0fdf4; border-color:#bbf7d0;">
                </div>
                <div>
                    <label style="font-size: 11px; font-weight: 800; color: #0f172a;">JUSTIFICACIÓN DE LA PETICIÓN</label>
                    <textarea id="new-don-obs" rows="3" placeholder="Ingresa los motivos por los que el vecino requiere esta ayuda..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; outline:none; resize:vertical; font-family:inherit;"></textarea>
                </div>
            </div>
            <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;">
                <button type="button" class="btn btn-secondary btn-cancelar-don" style="padding: 10px 16px; border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; cursor: pointer; color: #475569; font-weight: 600;">Cancelar</button>
                <button type="button" id="btn-ejecutar-creacion-don" class="btn btn-primary" style="background: #0b438c; padding: 10px 16px; border: none; color: #fff; border-radius: 6px; cursor: pointer; font-weight: 600;" disabled>Registrar Aporte</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const iRut = overlay.querySelector("#new-don-rut");
    const iNom = overlay.querySelector("#new-don-nombre");
    const iIdV = overlay.querySelector("#new-don-idvecino");
    const btnEje = overlay.querySelector("#btn-ejecutar-creacion-don");

    const verificarHijoDonacion = async (rutTipeado) => {
        const raw = rutTipeado.replace(/[^0-9kK]/g, "").toUpperCase();
        if(raw.length < 8) { btnEje.disabled = true; iNom.value = "Validando RUT..."; return; }
        const formatB = raw.length > 1 ? (raw.slice(0, -1) + "-" + raw.slice(-1)) : raw;
        const vec = totalVecinosMemory.find(v => v.rut === raw || v.rut === formatB || v.rut === rutTipeado);

        if (vec) {
            iNom.value = vec.nombreCompleto; iIdV.value = vec.id;
            iNom.style.color = "#16a34a"; iNom.style.background = "#dcfce7"; iNom.style.border = "1px solid #86efac"; btnEje.disabled = false;
        } else {
            iNom.value = ""; iIdV.value = "SIN_EXPEDIENTE_VINCULADO"; btnEje.disabled = true;
            mostrarAlertaPersonalizada("El RUT ingresado no figura en el padrón. Se levantará el formulario para dar de alta al vecino antes de procesar la donación.", "info", () => {
                overlay.remove(); abrirConsolaAltaAvanzadaVecinoCompleto(null, { rut: rutTipeado });
            });
        }
    };

    iRut.addEventListener("input", (e) => {
        let value = e.target.value.replace(/[^0-9kK]/g, '').substring(0, 9);
        if (value.length > 1) { e.target.value = value.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + value.slice(-1).toUpperCase(); } else { e.target.value = value.toUpperCase(); }
        verificarHijoDonacion(e.target.value);
    });

    if (rutPredefinido) { iRut.value = rutPredefinido; setTimeout(() => iRut.dispatchEvent(new Event('input')), 100); }

    btnEje.onclick = async () => {
        const tRut = iRut.value.trim(); const tTipo = overlay.querySelector("#new-don-tipo").value; const tCant = overlay.querySelector("#new-don-cant").value.trim(); const tMonto = overlay.querySelector("#new-don-monto").value.trim(); const tObs = overlay.querySelector("#new-don-obs").value.trim();
        if (!tRut || !tTipo || !tCant || !tMonto) return;

        btnEje.disabled = true; btnEje.innerText = "Guardando...";
        try {
            const currentUser = auth.currentUser;
            let baseName = currentUser ? (currentUser.displayName || currentUser.email) : "Equipo Territorial";
            const hoy = new Date(); const yy = String(hoy.getFullYear()).slice(-2); const mm = String(hoy.getMonth() + 1).padStart(2, '0'); const dd = String(hoy.getDate()).padStart(2, '0'); const fechaStr = `${yy}${mm}${dd}`;
            const counterRef = doc(db, "counters_diarios", CURRENT_TENANT_ID);
            let nuevoCorrelativo = 1;

            await runTransaction(db, async (transaction) => {
                const cDoc = await transaction.get(counterRef); if (cDoc.exists() && cDoc.data()[fechaStr]) { nuevoCorrelativo = cDoc.data()[fechaStr] + 1; }
                transaction.set(counterRef, { [fechaStr]: nuevoCorrelativo }, { merge: true });
            });

            const tnt = CURRENT_TENANT_ID.substring(0, 4).toUpperCase();
            const num = String(nuevoCorrelativo).padStart(4, '0');
            const codigoPublico = `SIG-${fechaStr}-${num}`;
            const codigoInterno = `SIG-${tnt}-${fechaStr}-${num}-DON-GEN-DASH`;

            const payload = {
                tenantId: CURRENT_TENANT_ID, idVecino: iIdV.value, rutVecino: tRut, nombreVecino: iNom.value,
                codigoPublico: codigoPublico, codigoInterno: codigoInterno, codigo: codigoPublico, tipoDonacion: tTipo, cantidad: tCant, montoGasto: Number(tMonto) || 0, detalle: tObs, estado: "En revisión", fechaCreacion: serverTimestamp(), registradoPor: baseName
            };

            await addDoc(collection(db, "donaciones"), payload);
            overlay.remove();
            mostrarAlertaPersonalizada(`Aporte ingresado exitosamente bajo el ID secuencial: ${codigoPublico}`, "success");
        } catch(e) { btnEje.disabled = false; btnEje.innerText = "Registrar Aporte"; }
    };

    overlay.querySelector(".btn-close-don").onclick = () => overlay.remove();
    overlay.querySelector(".btn-cancelar-don").onclick = () => overlay.remove();
}