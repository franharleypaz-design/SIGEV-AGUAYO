// ==============================================================================
// SIGEV-AGUAYO - MOTOR CONTROLADOR DEL MÓDULO DE DONACIONES TERRITORIALES
// ==============================================================================
import { auth, db, app } from "./app.js";
import { 
    collection, getDocs, doc, getDoc, updateDoc, query, where, serverTimestamp, setDoc, addDoc, runTransaction 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { inyectarEstructuraGlobal, actualizarPerfilLayout } from "./layout.js";
import { MAPEO_MUNICIPAL, MAPEO_TERRITORIAL } from "./mapeoMunicipal.js";

const storage = getStorage(app);

// 🚀 VARIABLES GLOBALES DE MEMORIA
let vecinosMemory = [];
let donacionesMemory = []; 
let paginaActual = 1;
let itemsPorPagina = 10;
let donacionesFiltradasGlobal = [];
let filtroKPIActivo = "Todos";
let CATEGORIAS_AYUDA_SIGEV = [];

// 🕵️‍♂️ DETECTOR MULTI-TENANT SEGURO
const subdominioCrudo = window.location.hostname.split('.')[0].toLowerCase();
const subdominioLimpio = subdominioCrudo.replace('sigev-', ''); 
const CURRENT_TENANT_ID = sessionStorage.getItem('SIGEV_ACTIVE_TENANT') || ((subdominioLimpio === 'localhost' || subdominioLimpio === '127' || subdominioLimpio === 'landing' || !subdominioLimpio) ? "paz" : subdominioLimpio);

const COLORES_AVATAR = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#6366f1", "#14b8a6"];
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

inyectarEstructuraGlobal();

// --- VALIDADOR MATEMÁTICO DE RUT CHILENO (MÓDULO 11) ---
function validarRutChileno(rutCompleto) {
    if (!rutCompleto) return false;
    const rutLimpio = rutCompleto.replace(/[^0-9kK]/g, "");
    if (rutLimpio.length < 8) return false;
    
    const cuerpo = rutLimpio.slice(0, -1);
    const dv = rutLimpio.slice(-1).toUpperCase();
    
    let suma = 0;
    let multiplo = 2;
    
    for (let i = 1; i <= cuerpo.length; i++) {
        const index = multiplo * cuerpo.charAt(cuerpo.length - i);
        suma = suma + index;
        if (multiplo < 7) { multiplo = multiplo + 1; } else { multiplo = 2; }
    }
    
    const dvEsperado = 11 - (suma % 11);
    const dvCalculado = (dvEsperado === 11) ? "0" : (dvEsperado === 10) ? "K" : dvEsperado.toString();
    
    return dv === dvCalculado;
}

// --- GENERADOR UNIFICADO DE CÓDIGOS SIGEV ---
function generarCodigosSIG(tenantId, fechaStr, correlativoDiario, tipoAyuda, asignado = "S/A") {
    const rawTenant = tenantId ? String(tenantId).trim() : "PAZ";
    const tnt = rawTenant.substring(0, 4).toUpperCase(); 
    const num = String(correlativoDiario).padStart(4, '0');
    
    let encargado = "S/A";
    if (asignado && asignado !== "Sin Asignar") {
        encargado = String(asignado).replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase();
        if (!encargado) encargado = "S/A";
    }
    
    const catMap = {
        "Canasta de Alimentos": "ALI", "Insumos Médicos / Pañales": "MED", "Materiales de Construcción": "MAT",
        "Mediagua / Vivienda Emergencia": "VIV", "Silla de Ruedas / Ayuda Técnica": "TEC", "Subvención Económica Directa": "SUB"
    };
    const tipoSeguro = tipoAyuda ? String(tipoAyuda) : "GEN";
    const triageStr = catMap[tipoSeguro] || tipoSeguro.substring(0, 3).toUpperCase();

    // 🚀 ESTÁNDAR MAESTRO APLICADO (Código Público Corto y Código Interno Largo)
    const codigoPublico = `SIG-${fechaStr}-${num}`;
    const codigoInterno = `SIG-${tnt}-${fechaStr}-${num}-DON-${triageStr}-${encargado}`;

    return { publico: codigoPublico, interno: codigoInterno };
}

// ============================================================================
// 1. INICIALIZACIÓN Y FLUJO DE CARGA
// ============================================================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        actualizarPerfilLayout(user);
        inicializarRelojMundial();
        await cargarParametrosGlobales();
        await cargarDatosCore();
        inicializarEventosFiltros();
        actualizarMetricasKpi();
        aplicarFiltrosYRenderizar();
    } else {
        window.location.href = "index.html";
    }
});

function parseFirestoreDate(fDate) {
    if (!fDate) return new Date();
    if (fDate.toDate) return fDate.toDate();
    if (fDate.seconds) return new Date(fDate.seconds * 1000);
    const d = new Date(fDate);
    return isNaN(d.getTime()) ? new Date() : d;
}

function inicializarRelojMundial() {
    const clockContainer = document.getElementById("live-clock");
    if (!clockContainer) return;
    const render = () => {
        const ahora = new Date();
        clockContainer.innerText = `|   ${ahora.toLocaleDateString('es-CL')}   ${ahora.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    };
    render(); setInterval(render, 1000);
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

function mostrarAlertaPersonalizada(mensaje, tipo = "success", alAceptar = null) {
    const overlay = document.createElement("div");
    overlay.className = "custom-alert-overlay";
    let iconSvg = ""; let titleText = ""; let iconStyles = "";

    if (tipo === "success") {
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        titleText = "Operación Exitosa";
        iconStyles = "background-color: rgba(16, 185, 129, 0.1); color: #10b981;";
    } else if (tipo === "error") {
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        titleText = "Atención Requerida";
        iconStyles = "background-color: rgba(239, 68, 68, 0.1); color: #ef4444;";
    } else {
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="12" x2="12" y2="16"></line></svg>`;
        titleText = "Notificación del Sistema";
        iconStyles = "background-color: rgba(37, 99, 235, 0.1); color: #2563eb;";
    }

    overlay.innerHTML = `
        <div class="custom-alert-card">
            <div class="custom-alert-icon" style="${iconStyles}">${iconSvg}</div>
            <div class="custom-alert-title">${titleText}</div>
            <div class="custom-alert-message">${mensaje}</div>
            <button class="btn-alert-confirm">Aceptar</button>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector(".btn-alert-confirm").onclick = () => {
        overlay.remove();
        if (alAceptar) alAceptar();
    };
}

async function cargarParametrosGlobales() {
    try {
        const docRef = doc(db, "configuracion_tenant", CURRENT_TENANT_ID);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const c = snap.data();
            if (c.lineasAyudaSocial && c.lineasAyudaSocial.length > 0) {
                CATEGORIAS_AYUDA_SIGEV = c.lineasAyudaSocial;
            }
        }
        
        const selTipo = document.getElementById("filter-tipo") || document.getElementById("filter-don-tipo");
        if (selTipo) {
            const baseCats = ["Canasta de Alimentos", "Insumos Médicos / Pañales", "Materiales de Construcción", "Mediagua / Vivienda Emergencia", "Silla de Ruedas / Ayuda Técnica", "Subvención Económica Directa"];
            const catsToUse = (CATEGORIAS_AYUDA_SIGEV && CATEGORIAS_AYUDA_SIGEV.length > 0) ? CATEGORIAS_AYUDA_SIGEV : baseCats;
            selTipo.innerHTML = `<option value="Todos">Todos los aportes</option>` + catsToUse.map(cat => `<option value="${cat.trim()}">${cat.trim()}</option>`).join("");
        }
    } catch (e) {
        console.error("Error cargando parámetros globales:", e);
    }
}

async function cargarDatosCore() {
    mostrarLoaderBloqueante("Sincronizando expedientes y aportes...");
    try {
        const qV = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID));
        const snapV = await getDocs(qV);
        vecinosMemory = [];
        snapV.forEach(d => vecinosMemory.push({ id: d.id, ...d.data() }));

        const qD = query(collection(db, "donaciones"), where("tenantId", "==", CURRENT_TENANT_ID));
        const snapD = await getDocs(qD);
        donacionesMemory = [];
        snapD.forEach(dDoc => donacionesMemory.push({ id: dDoc.id, ...dDoc.data() }));

        donacionesMemory.sort((a, b) => (b.fechaCreacion?.seconds || 0) - (a.fechaCreacion?.seconds || 0));
    } catch(e) { 
        console.error("Error cargando DB:", e); 
    } finally {
        ocultarLoaderBloqueante();
    }
}

// ============================================================================
// 2. KPIS Y FILTROS 
// ============================================================================
function actualizarMetricasKpi() {
    let totales = { "Todos": 0, "En revisión": 0, "En gestión": 0, "Autorizada": 0, "Entregada": 0, "Vencida": 0, "Finalizada": 0 };
    let totalMonto = 0;
    donacionesMemory.forEach(d => {
        totales["Todos"]++;
        let st = d.estado || "En revisión";
        if (st === "Entregada" || st === "Finalizada") totales["Finalizada"]++;
        else if (st === "Autorizada") totales["Autorizada"]++;
        else if (st === "En gestión") totales["En gestión"]++;
        else if (st === "Vencida") totales["Vencida"]++;
        else totales["En revisión"]++;

        if ((st === "Autorizada" || st === "Entregada" || st === "Finalizada") && d.montoGasto) totalMonto += Number(d.montoGasto) || 0;
    });

    const fMoneda = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });
    if (document.getElementById("count-total")) document.getElementById("count-total").innerText = totales["Todos"];
    if (document.getElementById("count-revision")) document.getElementById("count-revision").innerText = totales["En revisión"];
    if (document.getElementById("count-gestion")) document.getElementById("count-gestion").innerText = totales["En gestión"];
    if (document.getElementById("count-finalizadas")) document.getElementById("count-finalizadas").innerText = totales["Finalizada"];
    if (document.getElementById("count-vencidas")) document.getElementById("count-vencidas").innerText = totales["Vencida"];
    if(document.getElementById("kpi-don-revision")) document.getElementById("kpi-don-revision").innerText = totales["En revisión"];
    if(document.getElementById("kpi-don-autorizadas")) document.getElementById("kpi-don-autorizadas").innerText = totales["Autorizada"];
    if(document.getElementById("kpi-don-entregadas")) document.getElementById("kpi-don-entregadas").innerText = totales["Finalizada"];
    if(document.getElementById("kpi-don-monto")) document.getElementById("kpi-don-monto").innerText = fMoneda.format(totalMonto);

    // 🚀 NUEVO: Calcular contadores para las 6 pestañas unificadas al estilo solicitudes
    let cPorClasificar = 0, cClasificados = 0, cDerivados = 0, cPorResponder = 0, cFinalizados = 0;

    donacionesMemory.forEach(d => {
        let st = d.estado || "En revisión";
        if (st === "En revisión") cPorClasificar++;
        else if (st === "Autorizada") cClasificados++;
        else if (st === "En gestión") cDerivados++;
        else if (st === "Vencida" || st === "Rechazada") cPorResponder++; // Casos que requieren atención o respuesta
        else if (st === "Entregada" || st === "Finalizada") cFinalizados++;
    });

    const updateTab = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    updateTab("tab-count-don-todos", donacionesMemory.length);
    updateTab("tab-count-don-revision", cPorClasificar);
    updateTab("tab-count-don-autorizadas", cClasificados);
    updateTab("tab-count-don-derivados", cDerivados);
    updateTab("tab-count-don-responder", cPorResponder);
    updateTab("tab-count-don-finalizados", cFinalizados);
}

function inicializarEventosFiltros() {
    const inptCodigo = document.getElementById("filter-donacion-codigo");
    const selectTipo = document.getElementById("filter-tipo");
    const fDesde = document.getElementById("filter-fecha-desde");
    const fHasta = document.getElementById("filter-fecha-hasta");
    const btnReset = document.getElementById("btn-reset-filters");

    if (inptCodigo) inptCodigo.addEventListener("input", aplicarFiltrosYRenderizar);
    if (selectTipo) selectTipo.addEventListener("change", aplicarFiltrosYRenderizar);
    if (fDesde) fDesde.addEventListener("change", aplicarFiltrosYRenderizar);
    if (fHasta) fHasta.addEventListener("change", aplicarFiltrosYRenderizar);

    if (btnReset) {
        btnReset.onclick = () => {
            if (inptCodigo) inptCodigo.value = "";
            if (selectTipo) selectTipo.value = "Todos";
            if (fDesde) fDesde.value = "";
            if (fHasta) fHasta.value = "";
            filtroKPIActivo = "Todos";
            
            // Limpiamos los estilos de las tarjetas superiores
            document.querySelectorAll(".mini-kpi-card").forEach(c => c.style.borderColor = "var(--border-color)");
            
            // Limpiamos los estilos de las sub-tabs inferiores
            document.querySelectorAll(".tab-filtro-donacion").forEach(t => t.classList.remove("active"));
            const tabTodos = document.querySelector(".tab-filtro-donacion[data-estado='Todos']");
            if(tabTodos) tabTodos.classList.add("active");

            aplicarFiltrosYRenderizar();
        };
    }

    // 🚀 NUEVO: Escuchador para las Sub-Tabs de Donaciones
    document.querySelectorAll(".tab-filtro-donacion").forEach(tab => {
        tab.addEventListener("click", () => {
            // Reiniciar estado visual de todas las pestañas
            document.querySelectorAll(".tab-filtro-donacion").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            
            // Actualizar la variable global
            filtroKPIActivo = tab.getAttribute("data-estado");
            
            // Apagar las tarjetas superiores (KPI) si se usó este sub-menú
            document.querySelectorAll(".mini-kpi-card").forEach(c => c.style.borderColor = "var(--border-color)");

            aplicarFiltrosYRenderizar();
        });
    });

    // Escuchador de las tarjetas KPI superiores
    document.querySelectorAll(".mini-kpi-card").forEach(card => {
        card.addEventListener("click", () => {
            document.querySelectorAll(".mini-kpi-card").forEach(c => c.style.borderColor = "var(--border-color)");
            
            // Apagar el estilo de las sub-tabs inferiores
            document.querySelectorAll(".tab-filtro-donacion").forEach(t => t.classList.remove("active"));

            const targetFilter = card.getAttribute("data-filter");
            if (filtroKPIActivo === targetFilter) {
                filtroKPIActivo = "Todos";
                const tabTodos = document.querySelector(".tab-filtro-donacion[data-estado='Todos']");
                if(tabTodos) tabTodos.classList.add("active");
            } else {
                filtroKPIActivo = targetFilter;
                card.style.borderColor = "#0b438c";
            }
            aplicarFiltrosYRenderizar();
        });
    });

    const limitSelect = document.getElementById("don-limit-entries");
    if (limitSelect) {
        limitSelect.addEventListener("change", (e) => {
            itemsPorPagina = parseInt(e.target.value);
            paginaActual = 1;
            inyectarFilasTablaDonaciones();
        });
    }

    const prevBtn = document.getElementById("don-pag-prev");
    const nextBtn = document.getElementById("don-pag-next");
    if (prevBtn) prevBtn.addEventListener("click", () => { if (paginaActual > 1) { paginaActual--; inyectarFilasTablaDonaciones(); } });
    if (nextBtn) nextBtn.addEventListener("click", () => { const maxPage = Math.ceil(donacionesFiltradasGlobal.length / itemsPorPagina); if (paginaActual < maxPage) { paginaActual++; inyectarFilasTablaDonaciones(); } });

    const btnNueva = document.getElementById("btn-trigger-new-donacion");
    if (btnNueva) btnNueva.onclick = () => window.abrirModalNuevaDonacion();
}

function aplicarFiltrosYRenderizar() {
    const iSearch = document.getElementById("filter-donacion-codigo");
    const term = iSearch ? iSearch.value.toLowerCase().trim() : "";
    const iTipo = document.getElementById("filter-tipo");
    const tipoSelect = iTipo ? iTipo.value : "Todos";
    const fDesde = document.getElementById("filter-fecha-desde");
    const fHasta = document.getElementById("filter-fecha-hasta");

    donacionesFiltradasGlobal = donacionesMemory.filter(d => {
        const searchString = `${d.codigoPublico || ''} ${d.codigoInterno || ''} ${d.codigo || ''} ${d.rutVecino || ''} ${d.nombreVecino || ''}`.toLowerCase();
        let st = d.estado || "En revisión";

        if (term && !searchString.includes(term)) return false;
        
        if (filtroKPIActivo !== "Todos") {
            let matchesEstado = false;
            if (filtroKPIActivo === "Por Clasificar") {
                matchesEstado = (st === "En revisión");
            } else if (filtroKPIActivo === "Clasificados") {
                matchesEstado = (st === "Autorizada");
            } else if (filtroKPIActivo === "Derivados") {
                matchesEstado = (st === "En gestión");
            } else if (filtroKPIActivo === "Por Responder") {
                matchesEstado = (st === "Vencida" || st === "Rechazada");
            } else if (filtroKPIActivo === "Finalizados") {
                matchesEstado = (st === "Entregada" || st === "Finalizada");
            } else {
                matchesEstado = (st === filtroKPIActivo);
            }
            if (!matchesEstado) return false;
        }

        if (tipoSelect !== "Todos" && tipoSelect !== "Todos los aportes" && d.tipoDonacion !== tipoSelect) return false;

        if (d.fechaCreacion) {
            const fechaDonacion = d.fechaCreacion.toDate ? d.fechaCreacion.toDate() : new Date(d.fechaCreacion.seconds * 1000);
            
            // Ignorar la hora para la comparación de fechas
            fechaDonacion.setHours(0, 0, 0, 0);

            if (fDesde && fDesde.value) {
                const desde = new Date(fDesde.value + "T00:00:00");
                if (fechaDonacion < desde) return false;
            }
            if (fHasta && fHasta.value) {
                const hasta = new Date(fHasta.value + "T00:00:00");
                if (fechaDonacion > hasta) return false;
            }
        } else {
            // Si no tiene fecha y hay filtros de fecha aplicados, se oculta
            if ((fDesde && fDesde.value) || (fHasta && fHasta.value)) return false;
        }
        
        return true;
    });

    paginaActual = 1;
    inyectarFilasTablaDonaciones();
}

function getInitials(name) {
    if (!name) return "NN";
    const parts = String(name).trim().split(" ");
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function inyectarFilasTablaDonaciones() {
    const tbody = document.querySelector("#tabla-global-donaciones tbody") || document.querySelector("#tabla-donaciones tbody"); 
    if (!tbody) return;

    const inicio = (paginaActual - 1) * itemsPorPagina;
    const fin = inicio + itemsPorPagina;
    const paginada = donacionesFiltradasGlobal.slice(inicio, fin);

    let html = "";
    paginada.forEach(d => {
        const dateObj = d.fechaCreacion ? new Date(d.fechaCreacion.seconds * 1000) : new Date();
        const idTicket = d.codigoPublico || d.codigo || 'APO-S/N';

        let st = d.estado || "En revisión";
        let classEstado = "revision";
        if (st === "Autorizada" || st === "En gestión") { st = "Autorizada"; classEstado = "gestion"; }
        else if (st === "Entregada" || st === "Finalizada") { st = "Entregada"; classEstado = "finalizada"; }
        else if (st === "Rechazada") { classEstado = "revisada"; }
        else if (st === "Vencida") { classEstado = "revisada"; }

        const totalGastoFormateado = d.montoGasto ? `$${Number(d.montoGasto).toLocaleString('es-CL')}` : "Sin Costo";
        const asignadoUser = d.registradoPor || 'S/A';

        html += `
            <tr class="table-row-clickable" data-id="${d.id}" style="cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.1s;">
                <td style="width: 40px; text-align: center;"><input type="checkbox" class="row-selector-checkbox" style="width: 16px; height: 16px; accent-color: #2563eb; cursor: pointer;"></td>
                <td style="white-space: nowrap; font-weight:700;"><span style="color:#0b438c; font-family:monospace; font-size:13px;">${idTicket}</span></td>
                <td>
                    <span class="stacked-cell-primary">${dateObj.toLocaleDateString('es-CL')}</span>
                    <span class="stacked-cell-secondary">${dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
                </td>
                <td style="min-width: 160px;">
                    <span class="stacked-cell-primary" style="font-weight: 700; color: #0f172a;">${d.nombreVecino || 'Sin Nombre'}</span>
                    <span class="stacked-cell-secondary">RUT: ${d.rutVecino || "S/R"}</span>
                </td>
                <td style="min-width: 140px;">
                    <span class="stacked-cell-primary" style="font-weight: 700; color: #1e3a8a; background: #e0e7ff; padding: 2px 6px; border-radius: 4px; display: inline-block;">${d.tipoDonacion || 'Aporte General'}</span>
                </td>
                <td>
                    <span class="stacked-cell-primary">Cant: ${d.cantidad || '1'}</span>
                    <span class="stacked-cell-secondary" style="color:#059669; font-weight:800;">${totalGastoFormateado}</span>
                </td>
                <td style="text-align:center;">
                    <span class="badge-status ${classEstado}">${st}</span>
                </td>
                <td>
                    <span style="font-size: 11px; font-weight: 700; color: #475569; background: #f1f5f9; padding: 4px 8px; border-radius: 6px; border: 1px solid #e2e8f0; display: inline-block; max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${asignadoUser}</span>
                </td>
            </tr>`;
    });

    tbody.innerHTML = html || `<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--text-light);">No se registran donaciones con estos filtros.</td></tr>`;
    
    if (document.getElementById("don-pagination-text")) { document.getElementById("don-pagination-text").innerText = `Mostrando ${inicio + 1} a ${Math.min(fin, donacionesFiltradasGlobal.length)} de ${donacionesFiltradasGlobal.length} aportes`; }
    if (document.getElementById("pagination-info-text")) { document.getElementById("pagination-info-text").innerText = `Mostrando ${inicio + 1} a ${Math.min(fin, donacionesFiltradasGlobal.length)} de ${donacionesFiltradasGlobal.length} aportes`; }

    const prevBtn = document.getElementById("don-pag-prev") || document.querySelector(".pagination-controls-buttons button:first-child");
    const nextBtn = document.getElementById("don-pag-next") || document.querySelector(".pagination-controls-buttons button:last-child");
    if (prevBtn) prevBtn.style.opacity = paginaActual === 1 ? "0.3" : "1";
    if (nextBtn) nextBtn.style.opacity = paginaActual >= Math.ceil(donacionesFiltradasGlobal.length / itemsPorPagina) ? "0.3" : "1";

    document.querySelectorAll(".table-row-clickable").forEach(row => {
        row.onclick = (e) => {
            if(e.target.tagName.toLowerCase() === 'input') return; // Ignora clics en checkbox
            document.querySelectorAll(".table-row-clickable").forEach(r => { r.classList.remove("active-row"); r.style.background = "#fff"; r.style.borderLeft = "none"; });
            row.classList.add("active-row");
            row.style.background = "#eff6ff";
            row.style.borderLeft = "4px solid #2563eb";

            const id = row.getAttribute("data-id");
            mostrarDetallesEnPanel(donacionesMemory.find(d => d.id === id));
        };
    });

    if (paginada.length > 0) {
        tbody.querySelector(".table-row-clickable").click();
    } else {
        const emptyState = document.getElementById("panel-vacio-don") || document.getElementById("panel-vacio-donaciones");
        const panelContenido = document.getElementById("panel-contenido-don") || document.getElementById("panel-contenido-donaciones");
        if (emptyState) emptyState.style.display = "flex";
        if (panelContenido) panelContenido.style.display = "none";
    }
}

// 🚀 RESTAURANDO TOOLTIP INTELIGENTE
if (!window.mostrarTooltipTicket) {
    window.mostrarTooltipTicket = function(e, codigo, motivo, desc, oficina, fecha, estado, bgCol, txtCol) {
        let tooltip = document.getElementById("global-ticket-tooltip");
        if (!tooltip) {
            tooltip = document.createElement("div");
            tooltip.id = "global-ticket-tooltip";
            tooltip.style.cssText = "position:fixed; width:340px; background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); padding:16px; z-index:99999; pointer-events:none; font-family:system-ui, -apple-system, sans-serif; opacity: 0; transform: translateX(10px); transition: opacity 0.2s ease, transform 0.2s ease;";
            document.body.appendChild(tooltip);
        }
        tooltip.innerHTML = `
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #e2e8f0; padding-bottom:10px; margin-bottom:12px; align-items:flex-start;">
                <span style="font-weight:800; color:#0b438c; font-family:monospace; font-size:14px; letter-spacing:0.5px;">${codigo}</span>
                <span style="background:${bgCol}; color:${txtCol}; font-size:9px; font-weight:800; padding:4px 8px; border-radius:6px; text-transform:uppercase; max-width:50%; text-align:right; line-height:1.2;">${estado}</span>
            </div>
            <h4 style="margin:0 0 8px 0; font-size:14px; color:#0f172a; font-weight:800; line-height:1.3;">${motivo}</h4>
            <p style="margin:0 0 16px 0; font-size:12.5px; color:#475569; line-height:1.5; border-left:3px solid #cbd5e1; padding-left:10px; font-style:italic;">"${desc}"</p>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:11.5px; background:#f8fafc; padding:12px; border-radius:6px; border:1px solid #e2e8f0;">
                <div><span style="color:#64748b; display:block; font-weight:700; margin-bottom:2px;">Derivado a:</span><span style="color:#0f172a; font-weight:700;">${oficina}</span></div>
                <div><span style="color:#64748b; display:block; font-weight:700; margin-bottom:2px;">Fecha Ingreso:</span><span style="color:#0f172a; font-weight:700;">${fecha}</span></div>
            </div>
        `;
        
        const rect = e.currentTarget.getBoundingClientRect();
        let left = rect.left - 360; 
        if (left < 10) left = 10; 
        let top = rect.top;
        
        tooltip.style.display = "block";
        setTimeout(() => {
            if (top + tooltip.offsetHeight > window.innerHeight) { top = window.innerHeight - tooltip.offsetHeight - 20; }
            tooltip.style.left = left + "px";
            tooltip.style.top = top + "px";
            tooltip.style.opacity = "1";
            tooltip.style.transform = "translateX(0)";
        }, 10);
    };

    window.ocultarTooltipTicket = function() {
        const tooltip = document.getElementById("global-ticket-tooltip");
        if (tooltip) {
            tooltip.style.opacity = "0";
            tooltip.style.transform = "translateX(10px)";
            setTimeout(() => { tooltip.style.display = "none"; }, 200);
        }
    };
}

// ============================================================================
// 3. DETALLE Y GESTIÓN EN PANEL DERECHO
// ============================================================================
function mostrarDetallesEnPanel(don) {
    if (!don) return;
    const emptyState = document.getElementById("panel-vacio-don") || document.getElementById("panel-vacio-donaciones");
    const panelContenido = document.getElementById("panel-contenido-don") || document.getElementById("panel-contenido-donaciones");
    if (emptyState) emptyState.style.display = "none";
    if (!panelContenido) return;
    
    panelContenido.style.display = "flex";
    panelContenido.style.cssText = "display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; font-family: system-ui, -apple-system, sans-serif;";

    const fCreacionObj = parseFirestoreDate(don.fechaCreacion);
    const fechaStr = fCreacionObj.toLocaleDateString('es-CL');
    const horaStr = fCreacionObj.toLocaleTimeString('es-CL', {hour: '2-digit', minute:'2-digit'});

    const estadoVisual = don.estado || "En revisión";
    let bgBadge = "#fef3c7", colorBadge = "#d97706";
    if (estadoVisual === "Autorizada" || estadoVisual === "En gestión") { bgBadge = "#dbeafe"; colorBadge = "#2563eb"; }
    else if (estadoVisual === "Entregada" || estadoVisual === "Finalizada") { bgBadge = "#dcfce7"; colorBadge = "#059669"; }
    else if (estadoVisual === "Rechazada") { bgBadge = "#fee2e2"; colorBadge = "#ef4444"; }

    let rutBadge = don.idVecino && don.idVecino !== "SIN_EXPEDIENTE_VINCULADO" 
        ? `<span style="background: #dcfce7; color: #059669; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 800; border: 1px solid #6ee7b7; margin-left:8px; display:inline-flex; align-items:center; gap:4px;">✓ Registrado</span>` 
        : ``;

    const fMoneda = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });
    const montoText = don.montoGasto ? fMoneda.format(don.montoGasto) : "$0";

    let historialHtml = `<span style="color: #64748b; font-weight: 600;">Primer aporte solicitado.</span>`;
    if (don.idVecino && don.idVecino !== "SIN_EXPEDIENTE_VINCULADO") {
        const previas = donacionesMemory.filter(d => d.idVecino === don.idVecino && d.id !== don.id);
        if (previas.length > 0) {
            historialHtml = `<span style="color: #ef4444; font-weight: 800;">⚠️ Ha recibido ${previas.length} aporte(s) previamente.</span>`;
        }
    }

    const codPublico = don.codigoPublico || don.codigo || 'APORTE-S/N';
    const codInterno = don.codigoInterno || '---';

    panelContenido.innerHTML = `
        <button id="btn-cerrar-panel-mobile" style="position:absolute; top:16px; right:16px; background:#f1f5f9; border:none; width:32px; height:32px; border-radius:50%; display:none; align-items:center; justify-content:center; color:#475569; z-index:10; cursor:pointer;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        <div style="padding: 24px; border-bottom: 1px solid #e2e8f0; display: flex; gap: 16px; align-items: flex-start; position: relative; flex-shrink: 0; background: #fff;">
            <div style="width: 42px; height: 42px; background: #fef3c7; color: #d97706; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
            </div>
            <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                    <div>
                        <div style="font-size: 13px; font-weight: 800; color: #d97706; margin-bottom: 2px; font-family: monospace;">${codPublico}</div>
                        <div style="font-size: 10px; font-weight: 600; color: #94a3b8; font-family: monospace; margin-bottom: 4px;">REF: ${codInterno}</div>
                        <h2 style="font-size: 16px; font-weight: 800; color: #0f172a; line-height: 1.3; margin: 0;">${don.tipoDonacion || "Aporte Solidario"}</h2>
                    </div>
                    <span style="background: ${bgBadge}; color: ${colorBadge}; font-size: 11px; padding: 4px 8px; border-radius: 4px; font-weight: 800; text-transform: uppercase;">${estadoVisual}</span>
                </div>
                <div style="font-size: 12px; color: #64748b; margin-top: 4px; font-weight:600;">
                    Registrado el ${fechaStr} a las ${horaStr}
                </div>
            </div>
        </div>

        <div style="padding: 24px; overflow-y: auto; flex: 1; min-height: 0; background: #fafafa;">
            
            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                <h4 style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin: 0 0 12px 0;">Beneficiario</h4>
                <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px 16px; font-size: 13px;">
                    <span style="color: #64748b;">Nombre:</span> <span style="color: #0f172a; font-weight: 700;">${don.nombreVecino || 'Desconocido'}</span>
                    <span style="color: #64748b;">RUT:</span> <span style="color: #0f172a; font-weight: 700; display:flex; align-items:center;">${don.rutVecino || 'S/R'} ${rutBadge}</span>
                    <span style="color: #64748b;">Historial:</span> <span>${historialHtml}</span>
                </div>
            </div>

            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                <h4 style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin: 0 0 12px 0;">Detalles de la Petición</h4>
                <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px 16px; font-size: 13px; margin-bottom: 12px;">
                    <span style="color: #64748b;">Cantidad:</span> <span style="color: #0f172a; font-weight: 700;">${don.cantidad || 1} unidades</span>
                    <span style="color: #64748b;">Costo Est.:</span> <span style="color: #166534; font-weight: 800;">${montoText}</span>
                </div>
                <div style="padding: 12px; background: #f8fafc; border-radius: 6px; font-size: 12.5px; color: #334155; line-height: 1.5; border: 1px solid #e2e8f0; font-style: italic;">
                    "${don.detalle || 'Sin justificación ni observaciones detalladas.'}"
                </div>
            </div>

            <button id="btn-ver-ficha-rapida" style="background: #2563eb; color: white; border: none; padding: 10px; border-radius: 6px; font-weight: 600; font-size: 13px; width: 100%; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 32px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                Ver Ficha Vecino
            </button>

            <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <h4 style="font-size: 12px; font-weight: 800; color: #0b438c; text-transform: uppercase; margin: 0 0 16px 0; text-align: center;">
                    ⚙️ Resolución de la Autoridad
                </h4>
                
                <label style="font-size: 11px; font-weight: 800; color: #0f172a; display: block; margin-bottom: 6px;">DECISIÓN DEL CONCEJAL / EQUIPO</label>
                <select id="sel-estado-don" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; font-weight:600; margin-bottom: 12px; background: #f8fafc; outline: none;">
                    <option value="En revisión" ${estadoVisual === 'En revisión' ? 'selected' : ''}>⏳ En revisión (Pendiente de evaluación)</option>
                    <option value="Autorizada" ${estadoVisual === 'Autorizada' ? 'selected' : ''}>✅ Autorizada (Aprobada para entrega)</option>
                    <option value="Entregada" ${estadoVisual === 'Entregada' ? 'selected' : ''}>🤝 Entregada (Proceso finalizado)</option>
                    <option value="Rechazada" ${estadoVisual === 'Rechazada' ? 'selected' : ''}>❌ Rechazada / Denegada</option>
                </select>

                <div id="don-nota-box" style="margin-bottom: 16px; display: none;">
                    <label style="font-size: 11px; font-weight: 800; color: #0f172a; display: block; margin-bottom: 6px;">NOTA DE RESOLUCIÓN (Opcional)</label>
                    <textarea id="txt-nota-don" rows="2" placeholder="Motivo de aprobación, fecha de entrega acordada o razón del rechazo..." style="width: 100%; padding: 10px; border: 1px dashed #cbd5e1; border-radius: 6px; font-size: 12.5px; outline: none; resize:vertical;"></textarea>
                </div>

                <button id="btn-guardar-don" style="background: #0f172a; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: 700; font-size: 13px; width: 100%; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background 0.2s;">
                    Guardar Resolución
                </button>
            </div>
        </div>
    `;

    const btnCerrarM = document.getElementById("btn-cerrar-panel-mobile");
    if (btnCerrarM && window.innerWidth <= 1024) {
        btnCerrarM.style.display = "flex";
        btnCerrarM.onclick = () => { panelContenido.style.display = "none"; document.querySelectorAll(".table-row-clickable").forEach(r => r.classList.remove("active-row")); };
    }

    const btnVerVecino = document.getElementById("btn-ver-ficha-rapida");
    if(btnVerVecino && don.idVecino && don.idVecino !== "SIN_EXPEDIENTE_VINCULADO") {
        btnVerVecino.onclick = () => { window.abrirVisorVecino(don.idVecino); };
    } else if (btnVerVecino) { btnVerVecino.disabled = true; btnVerVecino.style.opacity = "0.5"; }

    const selEstado = document.getElementById("sel-estado-don");
    const boxNota = document.getElementById("don-nota-box");
    const txtNota = document.getElementById("txt-nota-don");
    const btnGuardar = document.getElementById("btn-guardar-don");

    const chequearNota = () => {
        if (selEstado.value !== "En revisión") boxNota.style.display = "block";
        else boxNota.style.display = "none";
        
        if (don.resolucionNota) txtNota.value = don.resolucionNota;
    };
    selEstado.addEventListener("change", chequearNota);
    chequearNota();

    btnGuardar.onclick = async () => {
        const nuevoE = selEstado.value;
        const nota = txtNota.value.trim();

        btnGuardar.disabled = true;
        btnGuardar.innerText = "Guardando...";

        try {
            let payload = { estado: nuevoE };
            if (nuevoE !== "En revisión" && nota !== "") payload.resolucionNota = nota;

            if (nuevoE === "Autorizada" && !don.fechaAutorizacion) payload.fechaAutorizacion = serverTimestamp();
            if (nuevoE === "Entregada" && !don.fechaEntrega) payload.fechaEntrega = serverTimestamp();
            if (nuevoE === "Rechazada" && !don.fechaRechazo) payload.fechaRechazo = serverTimestamp();

            await updateDoc(doc(db, "donaciones", don.id), payload);
            
            Object.assign(don, payload);
            mostrarAlertaPersonalizada("La resolución del aporte ha sido actualizada con éxito.", "success");
            
            actualizarMetricasKpi();
            aplicarFiltrosYRenderizar(); 
            
            btnGuardar.disabled = false;
            btnGuardar.innerText = "Guardar Resolución";
        } catch (err) {
            console.error("Error guardando donación:", err);
            mostrarAlertaPersonalizada("Error al guardar en el servidor.", "error");
            btnGuardar.disabled = false;
            btnGuardar.innerText = "Guardar Resolución";
        }
    };
}

// ============================================================================
// 4. CREACIÓN Y MODALES GLOBALES
// ============================================================================
function abrirModalNuevaDonacion(rutPredefinido = "") {
    const overlay = document.createElement("div");
    overlay.className = "profile-modal-overlay";
    overlay.style.zIndex = "3000";

    const baseCats = ["Canasta de Alimentos", "Insumos Médicos / Pañales", "Materiales de Construcción", "Mediagua / Vivienda Emergencia", "Silla de Ruedas / Ayuda Técnica", "Subvención Económica Directa"];
    const catsToUse = (CATEGORIAS_AYUDA_SIGEV && CATEGORIAS_AYUDA_SIGEV.length > 0) ? CATEGORIAS_AYUDA_SIGEV : baseCats;
    const optCats = catsToUse.map(c => `<option value="${c.trim()}">${c.trim()}</option>`).join("");

    overlay.innerHTML = `
        <div class="profile-modal-card" style="max-width: 600px; width: 90%;">
            <div class="profile-modal-header" style="background: linear-gradient(135deg, #1e293b, #0b438c); padding: 20px 32px;">
                <div class="profile-header-info">
                    <h3 style="font-size: 18px; color: #fff; margin: 0; font-weight: 800;">Registrar Petición de Aporte</h3>
                    <p style="color: rgba(255,255,255,0.8); font-weight: 500; margin: 4px 0 0 0;">La solicitud ingresará a revisión para autorización del Concejal</p>
                </div>
                <button class="btn-profile-close" style="color:#fff; top: 16px; right: 16px; border:none; background:transparent; font-size:24px; cursor:pointer;">&times;</button>
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
                    <textarea id="new-don-obs" rows="3" placeholder="Ingresa los motivos por los que el vecino requiere esta ayuda para que sea evaluada..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; outline:none; resize:vertical;"></textarea>
                </div>
            </div>
            <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;">
                <button type="button" class="btn-cerrar-mdl" style="padding: 10px 16px; border-radius: 6px; font-weight: 700; font-size: 13.5px; border: 1px solid #cbd5e1; background: #fff; color: #475569; cursor: pointer;">Cancelar</button>
                <button type="button" id="btn-ejecutar-creacion" style="padding: 10px 24px; border-radius: 6px; font-weight: 700; font-size: 13.5px; border: none; background: #0b438c; color: #fff; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(11, 67, 140, 0.2);" disabled>Registrar Aporte</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const iRut = overlay.querySelector("#new-don-rut");
    const iNom = overlay.querySelector("#new-don-nombre");
    const iIdV = overlay.querySelector("#new-don-idvecino");
    const btnEje = overlay.querySelector("#btn-ejecutar-creacion");

    iRut.addEventListener("input", (e) => {
        let value = e.target.value.replace(/[^0-9kK]/g, '').substring(0, 9);
        if (value.length > 1) { 
            e.target.value = value.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + value.slice(-1).toUpperCase(); 
        } else { 
            e.target.value = value.toUpperCase(); 
        }
        btnEje.disabled = value.length < 8;
    });

    iRut.addEventListener("blur", () => {
        const rutT = iRut.value.trim();
        if(!rutT) return;
        
        if (!validarRutChileno(rutT)) {
            iNom.value = "RUT Inválido";
            iNom.style.color = "#ef4444";
            iNom.style.background = "#fee2e2";
            iNom.style.border = "1px solid #fca5a5";
            btnEje.disabled = true;
            return;
        }

        iNom.value = "Validando...";
        
        const raw = rutT.replace(/[^0-9kK]/g, "").toUpperCase();
        const vec = vecinosMemory.find(v => {
            const vr = (v.rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
            return vr === raw;
        });

        if (vec) {
            iNom.value = vec.nombreCompleto;
            iIdV.value = vec.id;
            iNom.style.color = "#16a34a";
            iNom.style.background = "#dcfce7";
            iNom.style.border = "1px solid #86efac";
            btnEje.disabled = false;
        } else {
            iNom.value = "";
            iIdV.value = "SIN_EXPEDIENTE_VINCULADO";
            iNom.style.color = "#475569";
            iNom.style.background = "#f8fafc";
            iNom.style.border = "1px dashed #cbd5e1";
            btnEje.disabled = true;

            mostrarAlertaPersonalizada(
                "El RUT ingresado no figura en el padrón. Se abrirá la ficha de registro territorial avanzado para dar de alta al vecino antes de procesar la donación.",
                "info",
                () => { overlay.remove(); window.abrirConsolaAltaAvanzadaVecino(rutT); }
            );
        }
    });

    if (rutPredefinido) {
        iRut.value = rutPredefinido;
        btnEje.disabled = rutPredefinido.length < 8;
        setTimeout(() => iRut.dispatchEvent(new Event('blur')), 150);
    }

    overlay.querySelector(".btn-cerrar-mdl").onclick = () => overlay.remove();
    overlay.querySelector(".btn-profile-close").onclick = () => overlay.remove();

    btnEje.onclick = async () => {
        const tRut = iRut.value.trim();
        const tTipo = overlay.querySelector("#new-don-tipo").value;
        const tCant = overlay.querySelector("#new-don-cant").value.trim();
        const tMonto = overlay.querySelector("#new-don-monto").value.trim();
        const tObs = overlay.querySelector("#new-don-obs").value.trim();

        if (!tRut || !tTipo || !tCant || !tMonto) {
            mostrarAlertaPersonalizada("Debes completar todos los campos obligatorios (*).", "error");
            return;
        }

        btnEje.disabled = true;
        btnEje.innerText = "Guardando...";

        try {
            // 🚀 NUEVO FORMATO DIARIO
            const hoy = new Date();
            const yy = String(hoy.getFullYear()).slice(-2);
            const mm = String(hoy.getMonth() + 1).padStart(2, '0');
            const dd = String(hoy.getDate()).padStart(2, '0');
            const fechaStr = `${yy}${mm}${dd}`;

            const counterRef = doc(db, "counters_diarios", String(CURRENT_TENANT_ID));
            let nuevoCorrelativo = 1;
            
            await runTransaction(db, async (transaction) => {
                const cDoc = await transaction.get(counterRef);
                if (cDoc.exists() && cDoc.data()[fechaStr]) {
                    nuevoCorrelativo = cDoc.data()[fechaStr] + 1;
                }
                transaction.set(counterRef, { [fechaStr]: nuevoCorrelativo }, { merge: true });
            });

            const nomReal = iNom.value.includes("No figura") ? "Vecino No Enrolado" : iNom.value;
            const asignadoUser = auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email) : "Equipo Territorial";
            
            // 🚀 Generar ambos códigos de forma segura
            const codigos = generarCodigosSIG(CURRENT_TENANT_ID, fechaStr, nuevoCorrelativo, tTipo, asignadoUser);

            const payload = {
                tenantId: CURRENT_TENANT_ID,
                idVecino: iIdV.value,
                rutVecino: tRut,
                nombreVecino: nomReal,
                codigoPublico: codigos.publico,
                codigoInterno: codigos.interno,
                codigo: codigos.publico, 
                tipoDonacion: tTipo,
                cantidad: tCant,
                montoGasto: Number(tMonto) || 0,
                detalle: tObs,
                estado: "En revisión",
                fechaCreacion: serverTimestamp(),
                registradoPor: asignadoUser
            };

            const docRef = await addDoc(collection(db, "donaciones"), payload);
            
            payload.id = docRef.id;
            payload.fechaCreacion = new Date(); 
            donacionesMemory.unshift(payload);
            
            overlay.remove();
            mostrarAlertaPersonalizada(`Aporte ingresado exitosamente con el ID: ${codigos.publico}`, "success");
            
            actualizarMetricasKpi();
            aplicarFiltrosYRenderizar();
            
        } catch (e) {
            console.error(e);
            mostrarAlertaPersonalizada("Error al conectar con la base de datos.", "error");
            btnEje.disabled = false;
            btnEje.innerText = "Registrar Aporte";
        }
    };
}
window.abrirModalNuevaDonacion = abrirModalNuevaDonacion;

function abrirConsolaAltaAvanzadaVecino(rutAsignado) {
    const overlayAvanzado = document.createElement("div");
    overlayAvanzado.className = "profile-modal-overlay";
    overlayAvanzado.style.zIndex = "3500";

    let opcionesSectoresHTML = `<option value="">Seleccione Sector</option>`;
    if (typeof MAPEO_TERRITORIAL !== 'undefined') {
        Object.keys(MAPEO_TERRITORIAL).forEach(sec => {
            opcionesSectoresHTML += `<option value="${sec}">${sec}</option>`;
        });
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
                            <div class="form-group" style="margin: 0;"><label style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom:4px; display:block;">RUT *</label><input type="text" id="v-rut" value="${rutAsignado}" readonly style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; color: #0f172a; font-weight: 700; outline:none; cursor:not-allowed;"></div>
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

    // 🚀 LÓGICA DEL MAPA LEAFLET Y GEOCODING
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
        window.abrirModalNuevaDonacion(rutAsignado);
    };
    overlayAvanzado.querySelectorAll(".btn-close-fast-v").forEach(btn => btn.onclick = cerrarYLimpiarFast);

    const btnGuardarFast = overlayAvanzado.querySelector(".btn-guardar-fast-v");
    btnGuardarFast.onclick = async () => {
        const rutV = overlayAvanzado.querySelector("#v-rut").value.trim() || rutAsignado;
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
            const posibleFantasma = vecinosMemory.find(v => {
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
                window.abrirModalNuevaDonacion(rutAsignado);
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
                    
                    vecinosMemory.push({ id: nuevoIdSeguro, ...nuevoVecinoPayload });
                    overlayAvanzado.remove();
                    
                    mostrarAlertaPersonalizada(`Expediente creado con éxito para ${nombreV}. Retomando el aporte...`, "success", () => {
                        window.abrirModalNuevaDonacion(nuevoVecinoPayload.rut);
                    });
                } catch(errorInt) {
                    console.error("Fallo interno guardando:", errorInt);
                    btnGuardarFast.disabled = false;
                    btnGuardarFast.innerText = "Guardar Vecino y Continuar";
                    mostrarAlertaPersonalizada("Error al escribir el registro en la base de datos.", "error");
                }
            };

            const matchFamiliar = vecinosMemory.find(v => v.idHogar && v.idHogar.startsWith(idHogarCalculado));
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
window.abrirConsolaAltaAvanzadaVecino = abrirConsolaAltaAvanzadaVecino;

async function abrirVisorVecino(id) {
    try {
        const docRef = doc(db, "vecinos", id); const docSnap = await getDoc(docRef); if (!docSnap.exists()) return;
        const data = docSnap.data(); const fotoSrc = data.fotoPerfil || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100";
        const fNacimientoFormatted = data.fechaNacimiento ? data.fechaNacimiento.split("-").reverse().join("/") : "No registrada";

        const snapDonaciones = await getDocs(query(collection(db, "donaciones"), where("tenantId", "==", CURRENT_TENANT_ID), where("idVecino", "==", id)));
        let listaAportes = []; snapDonaciones.forEach(sDoc => { listaAportes.push({ id: sDoc.id, ...sDoc.data() }); });
        listaAportes.sort((a, b) => (b.fechaRegistro?.seconds || 0) - (a.fechaRegistro?.seconds || 0));

        const modalOverlay = document.createElement("div"); 
        modalOverlay.className = "profile-modal-overlay";
        modalOverlay.style.zIndex = "2500"; 
        
        let historialHTML = "";
        if (listaAportes.length > 0) {
            listaAportes.forEach(don => {
                const fRegObj = don.fechaRegistro ? new Date(don.fechaRegistro.seconds * 1000) : new Date();
                const d = String(fRegObj.getDate()).padStart(2, '0'); const m = String(fRegObj.getMonth() + 1).padStart(2, '0'); const a = String(fRegObj.getFullYear()).slice(-2);
                const codigoTicket = `${(don.idVecino || "000").substring(0, 4).toUpperCase()}-${d}${m}${a}-${don.id.substring(0, 3).toUpperCase()}`;

                historialHTML += `
                    <div style="padding: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <div style="font-weight: 700; font-size: 14px; color: #1e3a8a;">#${codigoTicket} - ${don.tipoDonacion}</div>
                            <span style="font-size: 11px; padding: 4px 10px; border-radius: 12px; font-weight: bold; background: #f1f5f9; color: #475569;">${don.estado}</span>
                        </div>
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 8px;">Ingresado el ${fRegObj.toLocaleDateString('es-CL')} | Cantidad: <b style="color: #334155;">${don.cantidad}</b></div>
                        <p style="color: #0f172a; margin: 0; font-size: 13px; line-height: 1.5;">${don.detalle || 'Sin observaciones de terreno.'}</p>
                    </div>`;
            });
        } else { 
            historialHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-size: 13px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px;">Este vecino no registra donaciones históricas.</div>`; 
        }

        const sectorVisorLabel = ETIQUETAS_SECTORES[data.sectorTerritorial] || data.sectorTerritorial || "Sin Información";

        let docHTML = "";
        if (data.urlDocumento) {
            docHTML = `
                <div style="padding: 16px 20px; background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid #8b5cf6; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-size: 14px; font-weight: 600; color: #0f172a;">${data.nombreDocumento || "Documento de Respaldo"}</span>
                    <a href="${data.urlDocumento}" target="_blank" style="color: #2563eb; display: flex; align-items: center; font-weight: 600; font-size: 13px; text-decoration: none;" title="Ver documento">
                        Ver archivo <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="margin-left: 4px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </a>
                </div>`;
        } else {
            docHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-size: 13px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px;">No se registran archivos PDF o documentos anexos en este expediente.</div>`;
        }

        modalOverlay.innerHTML = `
            <div class="profile-modal-card" style="max-width: 760px; width: 95%; border-radius: 12px; overflow: hidden; background: #fff; display: flex; flex-direction: column;">
                
                <div style="background: #154c8a; padding: 20px 24px; color: white; position: relative;">
                    <h2 style="margin: 0; font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px;">Expediente Digital</h2>
                    <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.85;">SIGEV-AGUAYO - Visualización de Hoja de Vida Territorial</p>
                    <button class="btn-profile-close" style="position: absolute; top: 16px; right: 16px; background: rgba(255,255,255,0.15); border: none; color: white; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">&times;</button>
                </div>
                
                <div class="profile-modal-tabs" style="display: flex; gap: 24px; padding: 0 24px; border-bottom: 1px solid #e2e8f0; background: #fff;">
                    <div class="profile-tab active" data-target="v-panel-basicos" style="padding: 16px 0; font-size: 13px; font-weight: 600; color: #154c8a; border-bottom: 2px solid #154c8a; cursor: pointer;">Datos Básicos</div>
                    <div class="profile-tab" data-target="v-panel-historial" style="padding: 16px 0; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer;">Aportes Recibidos</div>
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
                            <div style="border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                                ID: ${id.substring(0, 6).toUpperCase()}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px;">
                            <div><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">TELÉFONO</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${data.telefono || 'No registrado'}</p></div>
                            <div><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">FECHA NACIMIENTO</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${fNacimientoFormatted}</p></div>
                            <div style="grid-column: span 2;"><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">DIRECCIÓN</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${data.direccion || 'No registrada'}</p></div>
                            <div><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">SECTOR TERRITORIAL</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${sectorVisorLabel}</p></div>
                            <div><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">UNIDAD VECINAL (UV)</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${data.unidadVecinal || 'Sin Información'}</p></div>
                            <div><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">JUNTA DE VECINOS</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${data.juntaVecinos || 'Sin Información'}</p></div>
                            <div style="grid-column: span 2;"><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">BARRIO / VILLA POPULAR</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${data.barrioPopular || 'Sin Información'}</p></div>
                        </div>
                        
                        <div>
                            <label style="font-size: 11px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; display: flex; align-items: center; gap: 6px; margin-bottom: 12px; letter-spacing: 0.5px;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                UBICACIÓN GEORREFERENCIADA
                            </label>
                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; height: 160px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 12px; font-weight: 500;">
                                Este vecino no registra georreferenciación en su expediente.
                            </div>
                        </div>
                    </div>
                    
                    <div class="profile-panel" id="v-panel-historial" style="display: none;">${historialHTML}</div>
                    
                    <div class="profile-panel" id="v-panel-avanzados" style="display: none;">
                        <div style="display: grid; gap: 24px;">
                            <div><label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">OCUPACIÓN / OFICIO</label><p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${data.ocupacion || "No registrada"}</p></div>
                        </div>
                    </div>

                    <div class="profile-panel" id="v-panel-adicional" style="display: none;">
                        <div style="display: grid; gap: 16px;">
                            <div>
                                <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">OBSERVACIONES CRÍTICAS DE TERRENO</label>
                                <div style="margin-top: 12px; font-size: 13.5px; line-height: 1.6; color: #334155; white-space: pre-wrap; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">${data.observaciones || "No se registran observaciones adicionales del equipo territorial."}</div>
                            </div>
                        </div>
                    </div>

                    <div class="profile-panel" id="v-panel-documentos" style="display: none;">
                        ${docHTML}
                    </div>
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
window.abrirVisorVecino = abrirVisorVecino;