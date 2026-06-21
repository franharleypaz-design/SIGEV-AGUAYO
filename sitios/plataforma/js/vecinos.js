// ==============================================================================
// SIGEV-AGUAYO - MOTOR CONTROLADOR DEL PADRÓN DE VECINOS Y EXPEDIENTES (V52)
// ==============================================================================
import { auth, db, app } from "./app.js";
import { 
    collection, getDocs, doc, getDoc, query, where, addDoc, updateDoc, serverTimestamp, runTransaction, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { inyectarEstructuraGlobal, actualizarPerfilLayout } from "./layout.js";
import { MAPEO_MUNICIPAL, MAPEO_TERRITORIAL } from "./mapeoMunicipal.js";

const storage = getStorage(app);
let vecinosMemory = [];
let solicitudesMemory = []; 

// Variables de Paginación y Filtros de Chips
let paginaActual = 1;
let itemsPorPagina = 10;
let filtroChipActual = "Todos";
let vecinosFiltradosGlobal = [];

const subdominioDetectado = window.location.hostname.split('.')[0];
const CURRENT_TENANT_ID = sessionStorage.getItem('SIGEV_ACTIVE_TENANT') || ((subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado);

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

auth.onAuthStateChanged(async (user) => {
    if (user) {
        actualizarPerfilLayout(user);
        await cargarDatosFirebase();
        inicializarComponentesVecinos();
        actualizarKpisSuperiores();
        generarGraficosInferiores();
        await verificarYFocalizarExpedienteDesdeBuzon();
    }
});

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
        titleText = "Falta Validación Vecinal";
        iconStyles = "background-color: rgba(239, 68, 68, 0.1); color: #ef4444;";
    } else {
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        titleText = "Sincronización Territorial";
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

async function cargarDatosFirebase() {
    try {
        const qVecinos = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID));
        const qSolicitudes = query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID));

        const [snapVecinos, snapSolicitudes] = await Promise.all([ getDocs(qVecinos), getDocs(qSolicitudes) ]);

        vecinosMemory = [];
        snapVecinos.forEach(vDoc => { vecinosMemory.push({ id: vDoc.id, ...vDoc.data() }); });

        solicitudesMemory = [];
        snapSolicitudes.forEach(sDoc => { solicitudesMemory.push({ id: sDoc.id, ...sDoc.data() }); });
    } catch (error) { console.error("Error cargando DB territorial:", error); }
}

function inicializarComponentesVecinos() {
    const mainTabs = document.querySelectorAll(".v-main-tab");
    mainTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            mainTabs.forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".v-tab-content").forEach(c => c.style.display = "none");
            
            tab.classList.add("active");
            const targetId = tab.getAttribute("data-target");
            const targetEl = document.getElementById(targetId);
            if(targetEl) targetEl.style.display = "block";

            if (targetId === "tab-metricas") {
                generarGraficosInferiores();
            }
        });
    });

    const sideTabs = document.querySelectorAll(".v-side-tab");
    sideTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            sideTabs.forEach(t => {
                t.classList.remove("active");
                t.style.color = "var(--text-light)";
                t.style.borderBottomColor = "transparent";
            });
            document.querySelectorAll(".side-tab-content").forEach(c => c.style.display = "none");
            
            tab.classList.add("active");
            tab.style.color = "#2563eb";
            tab.style.borderBottomColor = "#2563eb";
            const targetId = tab.getAttribute("data-target");
            const targetEl = document.getElementById(targetId);
            if(targetEl) targetEl.style.display = "block";
        });
    });

    document.getElementById("filter-vecino-busqueda").addEventListener("input", aplicarFiltrosVecinos);
    document.getElementById("filter-vecino-sector").addEventListener("change", aplicarFiltrosVecinos);
    
    document.getElementById("btn-reset-filters-vecinos").addEventListener("click", () => {
        document.getElementById("filter-vecino-busqueda").value = "";
        document.getElementById("filter-vecino-sector").selectedIndex = 0; 
        
        const chips = document.querySelectorAll('.v-chip');
        chips.forEach(c => c.classList.remove('active'));
        if(chips.length > 0) chips[0].classList.add('active');
        filtroChipActual = "Todos";
        
        aplicarFiltrosVecinos();
    });

    const btnNuevo = document.getElementById("btn-trigger-nuevo-vecino-modulo");
    if (btnNuevo) btnNuevo.addEventListener("click", (e) => { e.preventDefault(); abrirConsolaVerificacionRutVecino(); });

    const btnPendientes = document.getElementById("btn-ver-pendientes-geo");
    if (btnPendientes) {
        btnPendientes.addEventListener("click", (e) => {
            e.preventDefault();
            document.querySelectorAll('.v-chip').forEach(c => c.classList.remove('active'));
            btnPendientes.classList.add('active');
            
            document.getElementById("filter-vecino-busqueda").value = "";
            document.getElementById("filter-vecino-sector").selectedIndex = 0;
            
            filtroChipActual = "Pendientes_Especial"; 
            aplicarFiltrosVecinos();
        });
    }

    const chipsRapidos = document.querySelectorAll('.v-chip:not(#btn-ver-pendientes-geo)');
    chipsRapidos.forEach(chip => {
        chip.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.v-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filtroChipActual = chip.innerText.trim();
            aplicarFiltrosVecinos();
        });
    });

    const selectLimit = document.getElementById("limit-entries-vecinos");
    if(selectLimit) {
        selectLimit.addEventListener("change", (e) => {
            itemsPorPagina = parseInt(e.target.value);
            paginaActual = 1;
            renderizarTablaVecinos(vecinosFiltradosGlobal);
        });
    }
    
    const btnPrev = document.getElementById("pag-vecinos-prev");
    const btnNext = document.getElementById("pag-vecinos-next");
    
    if(btnPrev) {
        btnPrev.addEventListener("click", () => {
            if(paginaActual > 1) {
                paginaActual--;
                renderizarTablaVecinos(vecinosFiltradosGlobal);
            }
        });
    }
    if(btnNext) {
        btnNext.addEventListener("click", () => {
            const maxPage = Math.ceil(vecinosFiltradosGlobal.length / itemsPorPagina);
            if(paginaActual < maxPage) {
                paginaActual++;
                renderizarTablaVecinos(vecinosFiltradosGlobal);
            }
        });
    }

    aplicarFiltrosVecinos();
}

function aplicarFiltrosVecinos() {
    const busqueda = (document.getElementById("filter-vecino-busqueda").value || "").toLowerCase();
    const sector = document.getElementById("filter-vecino-sector").value;
    let pendientesContador = 0;

    vecinosFiltradosGlobal = vecinosMemory.filter(v => {
        if (v.sectorTerritorial === "Pendiente de Georreferenciación") pendientesContador++;

        const shortIdStr = v.correlativo ? `sig-vec-${String(v.correlativo).padStart(5, '0')}` : '';
        const nombreStr = (v.nombreCompleto || "").toLowerCase();
        const rutStr = (v.rut || "").toLowerCase();
        const fonoStr = (v.telefono || "").toLowerCase();
        const idStr = (v.id || "").toLowerCase();

        const coincideBusqueda = !busqueda || 
            nombreStr.includes(busqueda) || 
            rutStr.includes(busqueda) || 
            fonoStr.includes(busqueda) ||
            idStr.includes(busqueda) ||
            shortIdStr.includes(busqueda);
            
        let coincideSector = true;
        if (sector && sector !== "Todos" && sector !== "Todos los sectores") {
             coincideSector = (v.sectorTerritorial === sector);
        }

        let coincideChip = true;
        const chipTxt = (filtroChipActual || "").toLowerCase();

        if (chipTxt === "pendientes_especial") {
            coincideChip = (v.sectorTerritorial === "Pendiente de Georreferenciación");
        } else if (!chipTxt.includes("todo")) {
            const metrics = calcularMetricasVecino(v.rut);
            if (chipTxt.includes("activo")) coincideChip = (metrics.index > 70);
            else if (chipTxt.includes("abierta")) coincideChip = (metrics.abiertas > 0);
            else if (chipTxt.includes("sin")) coincideChip = (metrics.total === 0);
            else if (chipTxt.includes("nuevo")) {
                const hoy = new Date();
                const d = v.fechaRegistro ? new Date(v.fechaRegistro.seconds * 1000) : new Date(0);
                coincideChip = (d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear());
            }
        }

        return coincideBusqueda && coincideSector && coincideChip;
    });

    const btnPendientes = document.getElementById("btn-ver-pendientes-geo");
    if (btnPendientes) {
        if (pendientesContador > 0) {
            document.getElementById("txt-pendientes-geo").innerText = `${pendientesContador} Pendientes`;
            btnPendientes.style.display = "inline-flex";
        } else { btnPendientes.style.display = "none"; }
    }

    const pagTitulo = document.getElementById("pag-info-titulo-vecinos");
    if(pagTitulo) {
        pagTitulo.innerText = `LISTA DE VECINOS (${vecinosFiltradosGlobal.length})`;
        
        let bannerGeo = document.getElementById("banner-georef-masiva");
        if (pendientesContador > 0) {
            if (!bannerGeo) {
                bannerGeo = document.createElement("button");
                bannerGeo.id = "banner-georef-masiva";
                bannerGeo.style.cssText = "background: #8b5cf6; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-size: 12.5px; font-weight: 700; cursor: pointer; margin-left: 16px; box-shadow: 0 4px 6px -1px rgba(139, 92, 246, 0.3); display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s ease; vertical-align: middle;";
                bannerGeo.onclick = () => procesarMapeoMasivo();
                pagTitulo.parentNode.insertBefore(bannerGeo, pagTitulo.nextSibling);
            }
            bannerGeo.style.display = "inline-flex";
            bannerGeo.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> Autocompletar Mapeo (${pendientesContador})`;
        } else if (bannerGeo) {
            bannerGeo.style.display = "none";
        }
    }
    
    paginaActual = 1; 
    renderizarTablaVecinos(vecinosFiltradosGlobal);
}
// 🚀 NUEVO MODAL CUSTOM PARA EL MAPEO SATELITAL (Reemplaza al feo confirm nativo)
function mostrarModalConfirmacionMapeo(cantidad, tiempoEst, onConfirm) {
    const overlay = document.createElement("div");
    overlay.className = "profile-modal-overlay";
    overlay.style.zIndex = "3000";

    overlay.innerHTML = `
        <div class="profile-modal-card" style="max-width: 460px; width: 90%; padding: 30px; text-align: center; border-radius: 12px; background: #fff; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
            <div style="width: 56px; height: 56px; background: #f3e8ff; color: #8b5cf6; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            </div>
            <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #0f172a;">Asistente de Mapeo Satelital</h3>
            <p style="margin: 0 0 20px 0; font-size: 13.5px; color: #475569; line-height: 1.5; text-align: left; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
                El sistema intentará ubicar automáticamente a los <strong>${cantidad} vecinos</strong> analizando sus direcciones registradas.<br><br>
                Para garantizar la estabilidad del servicio, este proceso tomará aproximadamente <strong>${tiempoEst} segundos</strong>.<br><br>
                ¿Deseas iniciar la georreferenciación ahora?
            </p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button type="button" class="btn-cancelar-map" style="flex: 1; padding: 12px; border-radius: 8px; font-size: 13.5px; font-weight: 700; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; cursor: pointer; transition: all 0.2s;">Cancelar</button>
                <button type="button" class="btn-ejecutar-map" style="flex: 1; padding: 12px; border-radius: 8px; font-size: 13.5px; font-weight: 700; background: #ef4444; color: white; border: none; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.2); transition: all 0.2s;">Aceptar</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);

    overlay.querySelector('.btn-cancelar-map').onclick = () => overlay.remove();
    overlay.querySelector('.btn-ejecutar-map').onclick = () => {
        overlay.remove();
        onConfirm();
    };
}

async function procesarMapeoMasivo() {
    const pendientes = vecinosMemory.filter(v => v.sectorTerritorial === "Pendiente de Georreferenciación");
    if (pendientes.length === 0) return;

    const tiempoEst = Math.ceil(pendientes.length * 1.5);
    
    // Llamada al modal visual en vez del confirm() nativo
    mostrarModalConfirmacionMapeo(pendientes.length, tiempoEst, async () => {
        
        const overlay = document.createElement("div");
        overlay.className = "custom-alert-overlay";
        overlay.style.zIndex = "3000";
        overlay.innerHTML = `
            <div class="custom-alert-card" style="width: 340px; padding: 24px;">
                <h4 style="margin:0 0 12px 0; color:#0f172a; font-size: 16px; font-weight: 800; display:flex; align-items:center; gap:8px;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    Mapeo Satelital en Curso
                </h4>
                <p id="geo-progreso-txt" style="font-size:12.5px; color:#64748b; margin-bottom: 16px; min-height: 36px; display:flex; align-items:center;">Inicializando conexión satelital...</p>
                <div style="width:100%; background:#e2e8f0; border-radius:6px; height:10px; overflow:hidden;">
                    <div id="geo-progreso-bar" style="width: 0%; height: 100%; background: #8b5cf6; transition: width 0.3s; border-radius: 6px;"></div>
                </div>
                <p id="geo-contadores" style="margin: 12px 0 0 0; font-size: 11.5px; font-weight: 700; color: #475569; text-align: right;">0 / ${pendientes.length}</p>
            </div>`;
        document.body.appendChild(overlay);

        const txt = overlay.querySelector("#geo-progreso-txt");
        const bar = overlay.querySelector("#geo-progreso-bar");
        const cont = overlay.querySelector("#geo-contadores");

        let exitosos = 0;
        let fallidos = 0;
        let batch = writeBatch(db);
        let batchCount = 0;

        for(let i = 0; i < pendientes.length; i++) {
            const v = pendientes[i];
            
            txt.innerHTML = `Analizando dirección:<br><strong style="color:#0f172a;">${v.direccion || "Sin dirección"}</strong>`;
            bar.style.width = `${((i+1)/pendientes.length)*100}%`;
            cont.innerText = `${i+1} / ${pendientes.length}`;

            if(v.direccion && v.direccion !== "No registrada" && v.direccion !== "Sin Información") {
                try {
                    // 🚀 BÚSQUEDA GENÉRICA PARA CUALQUIER COMUNA DE CHILE
                    const q = encodeURIComponent(`${v.direccion}, Chile`);
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`);
                    const data = await res.json();

                    if(data && data.length > 0) {
                        const lat = parseFloat(data[0].lat);
                        const lng = parseFloat(data[0].lon);
                        const sector = autoDetectarSector(lat, lng) || "Sin Información";

                        batch.update(doc(db, "vecinos", v.id), {
                            lat: lat,
                            lng: lng,
                            sectorTerritorial: sector
                        });
                        exitosos++;
                        batchCount++;

                        if(batchCount >= 400) {
                            await batch.commit();
                            batch = writeBatch(db);
                            batchCount = 0;
                        }
                    } else {
                        fallidos++;
                    }
                } catch(e) {
                    fallidos++;
                }
            } else {
                fallidos++;
            }
            
            await new Promise(r => setTimeout(r, 1200)); 
        }

        if(batchCount > 0) {
            await batch.commit();
        }

        overlay.remove();
        mostrarAlertaPersonalizada(
            `<div style="text-align: left; line-height: 1.6;">
                <span style="font-weight: 700; font-size: 15px; color: #0f172a;">Mapeo Masivo Finalizado.</span><br><br>
                ✅ <b>Éxito:</b> ${exitosos} vecinos ubicados.<br>
                ❌ <b>Fallidos:</b> ${fallidos} vecinos.<br><br>
                <span style="font-size: 12px; color: #64748b;">Los vecinos fallidos no tenían una calle reconocible y deberán ubicarse manualmente.</span>
            </div>`, 
            "success", 
            async () => {
                await cargarDatosFirebase();
                aplicarFiltrosVecinos();
            }
        );
    });
}

function getInitials(name) {
    if (!name) return "NN";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function obtenerTiempoRelativo(fechaSegundos) {
    if (!fechaSegundos) return "Sin actividad";
    const diffMs = new Date() - new Date(fechaSegundos * 1000);
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Hoy";
    if (diffDays === 1) return "Ayer";
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem.`;
    if (diffDays < 365) return `Hace ${Math.floor(diffDays / 30)} meses`;
    return `Hace ${Math.floor(diffDays / 365)} años`;
}

function calcularMetricasVecino(rut) {
    if (!rut) return { total: 0, abiertas: 0, cerradas: 0, index: 0, last: "Sin actividad" };
    const rutClean = rut.replace(/[^0-9kK]/g, "").toUpperCase();
    
    const sols = solicitudesMemory.filter(s => s.rutVecino && s.rutVecino.replace(/[^0-9kK]/g, "").toUpperCase() === rutClean);
    const cerradas = sols.filter(s => ["completada", "cerrada", "finalizada", "resuelta"].includes(s.estado?.toLowerCase() || "")).length;
    const abiertas = sols.length - cerradas;
    
    let index = Math.min(100, sols.length * 15); 
    let last = "Sin actividad";
    let lastAction = "";
    
    if (sols.length > 0) {
        sols.sort((a, b) => (b.fechaCreacion?.seconds || 0) - (a.fechaCreacion?.seconds || 0));
        last = obtenerTiempoRelativo(sols[0].fechaCreacion?.seconds);
        lastAction = sols[0].motivo || "Solicitud ingresada";
    }

    return { total: sols.length, abiertas, cerradas, index, last, lastAction };
}

function renderizarTablaVecinos(lista) {
    const tbody = document.querySelector("#tabla-global-vecinos tbody");
    if (!tbody) return;

    let html = "";
    const inicio = (paginaActual - 1) * itemsPorPagina;
    const fin = inicio + itemsPorPagina;
    const listaPaginada = lista.slice(inicio, fin);

    listaPaginada.forEach(v => {
        const initials = getInitials(v.nombreCompleto);
        const color = COLORES_AVATAR[v.id.charCodeAt(0) % COLORES_AVATAR.length];
        
        let avatarHtml = `<div class="v-avatar-initials sm" style="background:${color}; flex-shrink:0;">${initials}</div>`;

        let sectorVisual = v.sectorTerritorial || "Sin Información";
        let uvVisual = v.unidadVecinal || "S/I";
        
        if (v.sectorTerritorial === "Pendiente de Georreferenciación") {
            sectorVisual = "⚠️ Pendiente Excel"; uvVisual = "---";
        }

        const metrics = calcularMetricasVecino(v.rut);
        let interactColor = metrics.last === "Sin actividad" ? "var(--text-light)" : "#16a34a";
        
        let interaccionHtml = `
            <div style="display:flex; flex-direction:column; min-width: 0; width:100%; overflow:hidden;">
                <span style="font-weight:700; color:var(--text-dark); font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">
                    <span style="color:${interactColor}; font-size:10px; margin-right:4px;">●</span>${metrics.last}
                </span>
                ${metrics.lastAction ? `<span style="font-size:11px; color:var(--text-light); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${metrics.lastAction}</span>` : ''}
            </div>`;

        let badgeAbiertas = metrics.abiertas > 0 
            ? `<span style="background:#fee2e2; color:#ef4444; font-weight:800; padding:4px 10px; border-radius:20px; font-size:12px; white-space:nowrap;">${metrics.abiertas}</span>`
            : `<span style="background:#f1f5f9; color:#64748b; font-weight:700; padding:4px 10px; border-radius:20px; font-size:12px; white-space:nowrap;">0</span>`;

        const shortId = v.correlativo 
            ? `SIG-VEC-${String(v.correlativo).padStart(5, '0')}` 
            : `SIG-VEC-${v.id.substring(0, 6).toUpperCase()}`;

        html += `
            <tr class="v-row-trigger" data-id="${v.id}">
                <td style="width: 36%; max-width: 0;">
                    <div class="table-user-cell" style="display:flex; align-items:center; gap:12px; min-width:0; width:100%; overflow:hidden;">
                        ${avatarHtml}
                        <div style="display:flex; flex-direction:column; min-width: 0; flex: 1; overflow:hidden;">
                            <span style="font-weight:800; color:var(--text-dark); font-size:13.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;" title="${v.nombreCompleto}">${v.nombreCompleto}</span>
                            <span style="font-size:11.5px; color:var(--text-light); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;" title="${v.rut}"><b>#${shortId}</b> • ${v.rut}</span>
                        </div>
                    </div>
                </td>
                <td style="width: 24%; max-width: 0;">
                    <div style="display:flex; flex-direction:column; min-width: 0; width:100%; overflow:hidden;">
                        <span style="font-weight:700; color:${v.sectorTerritorial === 'Pendiente de Georreferenciación' ? '#ef4444' : 'var(--text-dark)'}; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${sectorVisual}</span>
                        <span style="font-size:11px; color:var(--text-light); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${uvVisual !== '---' ? 'Unidad Vecinal ' + uvVisual : 'Falta ubicar'}</span>
                    </div>
                </td>
                <td style="width: 20%; max-width: 0;">${interaccionHtml}</td>
                <td style="width: 12%; text-align:center;">${badgeAbiertas}</td>
                <td style="width: 8%; text-align:right; padding-right: 20px;">
                    <button class="btn-accion-v v-edit" data-id="${v.id}" title="Editar ficha territorial">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                </td>
            </tr>`;
    });

    tbody.innerHTML = html || `<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-light); font-weight:600; background: #f8fafc; border-radius: 8px;">No hay expedientes vecinales que coincidan con los filtros aplicados.</td></tr>`;
    
    const pagInfo = document.getElementById("pag-info-vecinos");
    if(pagInfo) {
        if(lista.length === 0) pagInfo.innerText = "Mostrando 0 vecinos";
        else pagInfo.innerText = `Mostrando ${inicio + 1} a ${Math.min(fin, lista.length)} de ${lista.length} vecinos`;
    }

    const btnPrev = document.getElementById("pag-vecinos-prev");
    const btnNext = document.getElementById("pag-vecinos-next");
    if(btnPrev) btnPrev.style.opacity = paginaActual === 1 ? "0.3" : "1";
    if(btnNext) btnNext.style.opacity = paginaActual >= Math.ceil(lista.length / itemsPorPagina) ? "0.3" : "1";

    document.querySelectorAll(".v-row-trigger").forEach(row => {
        row.addEventListener("click", (e) => {
            if(e.target.closest('.v-edit')) return; 
            document.querySelectorAll(".v-row-trigger").forEach(r => r.classList.remove("v-row-active"));
            row.classList.add("v-row-active");
            seleccionarVecinoPanelDerecho(row.getAttribute("data-id"));
        });
    });

    document.querySelectorAll(".v-edit").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = e.currentTarget.getAttribute("data-id");
            const vec = vecinosMemory.find(item => item.id === id);
            if (vec) abrirConsolaAltaAvanzadaVecinoCompleto(id, vec);
        });
    });

    if (listaPaginada.length > 0) seleccionarVecinoPanelDerecho(listaPaginada[0].id);
}

function seleccionarVecinoPanelDerecho(idVecino) {
    const vec = vecinosMemory.find(v => v.id === idVecino);
    if (!vec) return;

    const placeholder = document.getElementById("v-side-placeholder");
    const content = document.getElementById("v-side-content");
    if(placeholder) placeholder.style.display = "none";
    if(content) content.style.display = "flex";

    const initials = getInitials(vec.nombreCompleto);
    const color = COLORES_AVATAR[vec.id.charCodeAt(0) % COLORES_AVATAR.length];
    
    const avatarEl = document.getElementById("v-side-avatar");
    if(avatarEl) {
        avatarEl.innerHTML = initials;
        avatarEl.style.background = color;
    }

    if(document.getElementById("v-side-name")) document.getElementById("v-side-name").innerText = vec.nombreCompleto;
    if(document.getElementById("v-side-rut-txt")) document.getElementById("v-side-rut-txt").innerText = `RUN: ${vec.rut}`;
    
    const shortId = vec.correlativo 
        ? `SIG-VEC-${String(vec.correlativo).padStart(5, '0')}` 
        : `SIG-VEC-${vec.id.substring(0, 6).toUpperCase()}`;

    if(document.getElementById("v-side-short-id")) document.getElementById("v-side-short-id").innerText = shortId;

    if(document.getElementById("v-side-location")) document.getElementById("v-side-location").innerText = `${vec.sectorTerritorial !== 'Pendiente de Georreferenciación' ? vec.sectorTerritorial : 'Pendiente Mapeo'} • UV ${vec.unidadVecinal || 'S/I'}`;
    
    let regDate = "Desconocida";
    if (vec.fechaRegistro) {
        const d = new Date(vec.fechaRegistro.seconds * 1000);
        regDate = d.toLocaleDateString("es-CL");
    }
    if(document.getElementById("v-side-date")) document.getElementById("v-side-date").innerText = `Registrado el ${regDate}`;

    const metrics = calcularMetricasVecino(vec.rut);
    
    if(document.getElementById("v-side-tot-sol")) document.getElementById("v-side-tot-sol").innerText = metrics.total;
    if(document.getElementById("v-side-abiertas")) document.getElementById("v-side-abiertas").innerText = metrics.abiertas;
    if(document.getElementById("v-side-cerradas")) document.getElementById("v-side-cerradas").innerText = metrics.cerradas;
    if(document.getElementById("v-side-interaccion")) document.getElementById("v-side-interaccion").innerText = metrics.last;
    if(document.getElementById("v-side-canal")) document.getElementById("v-side-canal").innerText = vec.canalPreferencia || "WhatsApp";
    
    const indexTxt = document.getElementById("v-side-indice-txt");
    const indexBar = document.getElementById("v-side-indice-bar");
    if(indexTxt && indexBar) {
        indexTxt.innerText = `${metrics.index}%`;
        indexBar.style.width = `${metrics.index}%`;
        indexBar.style.backgroundColor = metrics.index > 70 ? '#16a34a' : metrics.index > 30 ? '#d97706' : '#ef4444';
    }

    const statusEl = document.getElementById("v-side-status");
    if(statusEl) {
        if (metrics.index > 70) { statusEl.innerText = "Actividad Alta"; statusEl.style.color = "#16a34a"; }
        else if (metrics.index > 30) { statusEl.innerText = "Actividad Media"; statusEl.style.color = "#d97706"; }
        else { statusEl.innerText = "Actividad Baja"; statusEl.style.color = "#ef4444"; }
    }

    const canalPreferido = vec.canalPreferencia || "WhatsApp";
    const tagsWrapper = document.getElementById("v-side-tags");
    if(tagsWrapper) {
        let tagsHtml = `<span class="v-tag" style="background:#e0e7ff; color:#3b82f6; border-color:#bfdbfe; font-size:10.5px; padding:4px 10px; border-radius:4px; border:1px solid transparent; font-weight:700;">Contacto: ${canalPreferido}</span>`;
        if (metrics.index > 70) tagsHtml += `<span class="v-tag" style="background:#dcfce7; color:#166534; border-color:#bbf7d0; font-size:10.5px; padding:4px 10px; border-radius:4px; border:1px solid transparent; font-weight:700;">Activo</span>`;
        if (metrics.abiertas > 0) tagsHtml += `<span class="v-tag" style="background:#fee2e2; color:#b91c1c; border-color:#fecaca; font-size:10.5px; padding:4px 10px; border-radius:4px; border:1px solid transparent; font-weight:700;">Caso Pendiente</span>`;
        if (vec.sectorTerritorial === "Pendiente de Georreferenciación") tagsHtml += `<span class="v-tag" style="background:#fef9c3; color:#b45309; border-color:#fde047; font-size:10.5px; padding:4px 10px; border-radius:4px; border:1px solid transparent; font-weight:700;">Ubicación Pendiente</span>`;
        if (metrics.index === 100) tagsHtml += `<span class="v-tag" style="background:#f3e8ff; color:#7e22ce; border-color:#e9d5ff; font-size:10.5px; padding:4px 10px; border-radius:4px; border:1px solid transparent; font-weight:700;">Líder territorial</span>`;
        tagsWrapper.innerHTML = tagsHtml;
    }

    const btnExpediente = document.getElementById("btn-abrir-expediente-completo");
    if(btnExpediente) btnExpediente.onclick = () => abrirVisorVecino(vec.id);
}

function actualizarKpisSuperiores() {
    const total = vecinosMemory.length;

    const hoy = new Date();
    const diaActual = hoy.getDate();
    const mesActual = hoy.getMonth();
    const añoActual = hoy.getFullYear();

    let nuevosHoy = 0;
    let contactables = 0;
    let georreferenciados = 0;
    
    // Diccionario base para los 6 sectores establecidos en el mapa
    const conteoSectores = { 
        "Sector Territorial 1": 0, "Sector Territorial 2": 0, 
        "Sector Territorial 3": 0, "Sector Territorial 4": 0, 
        "Sector Territorial 5": 0, "Sector Territorial 6": 0 
    };
    let sectoresDistintosActivos = new Set();

    vecinosMemory.forEach(v => {
        // 1. Cálculo Diario (Ingresados HOY)
        if (v.fechaRegistro) {
            const d = new Date(v.fechaRegistro.seconds ? v.fechaRegistro.seconds * 1000 : v.fechaRegistro);
            if (d.getDate() === diaActual && d.getMonth() === mesActual && d.getFullYear() === añoActual) {
                nuevosHoy++;
            }
        }

        // 2. Contactabilidad (Teléfono válido de mínimo 8 dígitos o correo electrónico existente)
        const tieneFonoValido = v.telefono && v.telefono.toLowerCase() !== "no registrado" && v.telefono.replace(/\D/g, '').length >= 8;
        const tieneCorreoValido = v.correo && v.correo.includes("@");
        if (tieneFonoValido || tieneCorreoValido) contactables++;

        // 3. Georreferenciados (Verificar coordenadas reales y que no esté marcado como pendiente)
        if (v.lat && v.lng && v.sectorTerritorial && v.sectorTerritorial !== "Pendiente de Georreferenciación") {
            georreferenciados++;
        }

        // 4. Distribución por Sectores Oficiales (1 al 6)
        if (v.sectorTerritorial && conteoSectores.hasOwnProperty(v.sectorTerritorial)) {
            conteoSectores[v.sectorTerritorial]++;
            sectoresDistintosActivos.add(v.sectorTerritorial);
        }
    });

    // --- CÁLCULO DE PORCENTAJES REALES ---
    const pContactabilidad = total > 0 ? Math.round((contactables / total) * 100) : 0;
    const pGeo = total > 0 ? Math.round((georreferenciados / total) * 100) : 0;

    // Determinar cuál es el sector con más vecinos asignados
    let maxSector = "Ninguno";
    let maxCount = 0;
    for (const [sec, count] of Object.entries(conteoSectores)) {
        if (count > maxCount) {
            maxCount = count;
            maxSector = sec.replace("Sector Territorial ", "Sec. "); // Acorta el nombre para prevenir desbordes
        }
    }
    const pTopSector = total > 0 ? Math.round((maxCount / total) * 100) : 0;
    const sectoresCubiertos = sectoresDistintosActivos.size;
    const pCobertura = Math.round((sectoresCubiertos / 6) * 100);

    // --- RENDEREADO SEGURO EN EL HTML ---
    if (document.getElementById("kpi-total-vecinos")) {
        document.getElementById("kpi-total-vecinos").innerText = total.toLocaleString('es-CL');
    }
    if (document.getElementById("kpi-nuevos-hoy")) {
        document.getElementById("kpi-nuevos-hoy").innerText = `+${nuevosHoy} vecinos hoy`;
    }
    if (document.getElementById("kpi-contactabilidad-porcentaje")) {
        document.getElementById("kpi-contactabilidad-porcentaje").innerText = `${pContactabilidad}%`;
    }
    if (document.getElementById("kpi-geo-porcentaje")) {
        document.getElementById("kpi-geo-porcentaje").innerText = `${pGeo}%`;
    }
    if (document.getElementById("kpi-sector-lider-nombre")) {
        document.getElementById("kpi-sector-lider-nombre").innerText = maxCount > 0 ? `${maxSector} lidera` : 'Sin datos';
    }
    if (document.getElementById("kpi-sector-lider-porcentaje")) {
        document.getElementById("kpi-sector-lider-porcentaje").innerText = maxCount > 0 ? `${pTopSector}%` : '0%';
    }
    if (document.getElementById("kpi-cobertura-txt")) {
        document.getElementById("kpi-cobertura-txt").innerText = `${sectoresCubiertos}/6`;
    }
    if (document.getElementById("kpi-cobertura-porcentaje")) {
        document.getElementById("kpi-cobertura-porcentaje").innerText = `${pCobertura}% Cob.`;
    }
}

function generarGraficosInferiores() {
    const chartSectores = document.getElementById("chart-sectores");
    const donutEstado = document.getElementById("donut-estado");
    const legendEstado = document.getElementById("legend-estado");
    const hbarContainer = document.querySelector('.v-hbar-chart-container');
    const donutCharts = document.querySelectorAll('.v-donut-chart');
    const donutLegends = document.querySelectorAll('.v-donut-legend');

    const totalVecinos = vecinosMemory.length;

    // 🚀 ESTADO CERO: Si no hay vecinos, limpiamos la data quemada del HTML
    if (totalVecinos === 0) {
        const emptyMsg = `<div style="grid-column: 1/-1; width: 100%; text-align: center; padding: 40px 10px; color: #94a3b8; font-size: 13px; font-weight: 500;">No hay expedientes suficientes para generar métricas.</div>`;
        
        if (chartSectores) chartSectores.innerHTML = emptyMsg;
        if (donutEstado) donutEstado.style.background = "#f1f5f9"; // Fondo gris vacío
        if (legendEstado) legendEstado.innerHTML = emptyMsg;
        if (hbarContainer) hbarContainer.innerHTML = emptyMsg;
        
        if (donutCharts.length > 1 && donutLegends.length > 1) {
            donutCharts[1].style.background = "#f1f5f9";
            donutLegends[1].innerHTML = emptyMsg;
        }
        return; // Detenemos la función aquí
    }

    // --- SI HAY VECINOS, GENERAMOS LOS GRÁFICOS REALES ---
    if (chartSectores) {
        const conteoSectores = { "S1": 0, "S2": 0, "S3": 0, "S4": 0, "S5": 0, "S6": 0 };
        vecinosMemory.forEach(v => {
            if (v.sectorTerritorial === "Sector Territorial 1") conteoSectores["S1"]++;
            else if (v.sectorTerritorial === "Sector Territorial 2") conteoSectores["S2"]++;
            else if (v.sectorTerritorial === "Sector Territorial 3") conteoSectores["S3"]++;
            else if (v.sectorTerritorial === "Sector Territorial 4") conteoSectores["S4"]++;
            else if (v.sectorTerritorial === "Sector Territorial 5") conteoSectores["S5"]++;
            else if (v.sectorTerritorial === "Sector Territorial 6") conteoSectores["S6"]++;
        });

        const maxVal = Math.max(...Object.values(conteoSectores), 1);
        const coloresBarras = ["#2563eb", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4", "#ef4444"];
        
        let htmlSectores = "";
        Object.keys(conteoSectores).forEach((key, idx) => {
            const val = conteoSectores[key];
            const h = (val / maxVal) * 100;
            htmlSectores += `<div class="v-bar-col"><span class="v-bar-val">${val}</span><div class="v-bar-fill" style="height:${h}%; background:${coloresBarras[idx]};"></div><span class="v-bar-lbl">${key}</span></div>`;
        });
        chartSectores.innerHTML = htmlSectores;
    }

    if (donutEstado && legendEstado) {
        let activos = 0, medios = 0, bajos = 0, sinActividad = 0;
        vecinosMemory.forEach(v => {
            const m = calcularMetricasVecino(v.rut);
            if (m.total === 0) sinActividad++;
            else if (m.index > 70) activos++;
            else if (m.index > 30) medios++;
            else bajos++;
        });

        const pActivos = (activos / totalVecinos) * 100;
        const pMedios = (medios / totalVecinos) * 100;
        const pBajos = (bajos / totalVecinos) * 100;
        const pSinActividad = (sinActividad / totalVecinos) * 100;

        const deg1 = pActivos;
        const deg2 = deg1 + pMedios;
        const deg3 = deg2 + pBajos;

        donutEstado.style.background = `conic-gradient(#10b981 0% ${deg1}%, #f59e0b ${deg1}% ${deg2}%, #ef4444 ${deg2}% ${deg3}%, #cbd5e1 ${deg3}% 100%)`;

        legendEstado.innerHTML = `
            <div class="legend-item"><span class="dot" style="background:#10b981;"></span>Activos <span class="val">${activos} <small>(${pActivos.toFixed(0)}%)</small></span></div>
            <div class="legend-item"><span class="dot" style="background:#f59e0b;"></span>Medios <span class="val">${medios} <small>(${pMedios.toFixed(0)}%)</small></span></div>
            <div class="legend-item"><span class="dot" style="background:#ef4444;"></span>Bajos <span class="val">${bajos} <small>(${pBajos.toFixed(0)}%)</small></span></div>
            <div class="legend-item"><span class="dot" style="background:#cbd5e1;"></span>Sin actividad <span class="val">${sinActividad} <small>(${pSinActividad.toFixed(0)}%)</small></span></div>
        `;
    }

    if (hbarContainer) {
        let r1 = 0, r2 = 0, r3 = 0, r4 = 0;
        const hoyAño = new Date().getFullYear();
        vecinosMemory.forEach(v => {
            if (v.fechaNacimiento) {
                const edad = hoyAño - new Date(v.fechaNacimiento).getFullYear();
                if (edad >= 18 && edad <= 30) r1++;
                else if (edad >= 31 && edad <= 45) r2++;
                else if (edad >= 46 && edad <= 60) r3++;
                else if (edad > 60) r4++;
            } else {
                r2++; 
            }
        });

        const totalConEdad = (r1 + r2 + r3 + r4) || 1;
        const p1 = (r1 / totalConEdad) * 100;
        const p2 = (r2 / totalConEdad) * 100;
        const p3 = (r3 / totalConEdad) * 100;
        const p4 = (r4 / totalConEdad) * 100;

        hbarContainer.innerHTML = `
            <div class="v-hbar-row">
                <span class="lbl">18 - 30 años</span>
                <div class="v-hbar-bg"><div class="v-hbar-fill" style="width: ${p1}%; background: #2563eb;"></div></div>
                <span class="val">${r1} <small>(${p1.toFixed(0)}%)</small></span>
            </div>
            <div class="v-hbar-row">
                <span class="lbl">31 - 45 años</span>
                <div class="v-hbar-bg"><div class="v-hbar-fill" style="width: ${p2}%; background: #2563eb;"></div></div>
                <span class="val">${r2} <small>(${p2.toFixed(0)}%)</small></span>
            </div>
            <div class="v-hbar-row">
                <span class="lbl">46 - 60 años</span>
                <div class="v-hbar-bg"><div class="v-hbar-fill" style="width: ${p3}%; background: #2563eb;"></div></div>
                <span class="val">${r3} <small>(${p3.toFixed(0)}%)</small></span>
            </div>
            <div class="v-hbar-row">
                <span class="lbl">+ 60 años</span>
                <div class="v-hbar-bg"><div class="v-hbar-fill" style="width: ${p4}%; background: #2563eb;"></div></div>
                <span class="val">${r4} <small>(${p4.toFixed(0)}%)</small></span>
            </div>
        `;
    }

    if (donutCharts.length > 1 && donutLegends.length > 1) {
        const donutGenero = donutCharts[1];
        const legendGenero = donutLegends[1];

        let mujeres = 0, hombres = 0, otro = 0;
        vecinosMemory.forEach(v => {
            if (v.sexo === 'Femenino') mujeres++;
            else if (v.sexo === 'Masculino') hombres++;
            else otro++;
        });

        const pMujeres = (mujeres / totalVecinos) * 100;
        const pHombres = (hombres / totalVecinos) * 100;
        const pOtro = (otro / totalVecinos) * 100;

        donutGenero.style.background = `conic-gradient(#8b5cf6 0% ${pMujeres}%, #3b82f6 ${pMujeres}% ${pMujeres + pHombres}%, #cbd5e1 ${pMujeres + pHombres}% 100%)`;

        legendGenero.innerHTML = `
            <div class="legend-item"><span class="dot" style="background:#8b5cf6;"></span>Mujeres <span class="val">${mujeres} <small>(${pMujeres.toFixed(0)}%)</small></span></div>
            <div class="legend-item"><span class="dot" style="background:#3b82f6;"></span>Hombres <span class="val">${hombres} <small>(${pHombres.toFixed(0)}%)</small></span></div>
            <div class="legend-item"><span class="dot" style="background:#cbd5e1;"></span>Otro <span class="val">${otro} <small>(${pOtro.toFixed(0)}%)</small></span></div>
        `;
    }
}

function abrirConsolaVerificacionRutVecino() {
    const overlayVerify = document.createElement("div");
    overlayVerify.className = "profile-modal-overlay";
    overlayVerify.style.zIndex = "1500";

    overlayVerify.innerHTML = `
        <div class="profile-modal-card" style="max-width: 580px; width: 90%;">
            <div class="profile-modal-header" style="background: linear-gradient(135deg, #1e293b, #0b438c); padding: 20px 32px;">
                <div class="profile-header-info">
                    <h3 style="font-size: 18px; color: #fff;">Validación de RUN Vecinal</h3>
                    <p style="color: rgba(255,255,255,0.8); font-weight: 500;">Comprobación de identidad y duplicados en el padrón del territorio</p>
                </div>
                <button class="btn-profile-close btn-cerrar-verify-x" style="top: 16px; right: 16px;">&times;</button>
            </div>
            <div class="profile-modal-body" style="padding: 24px 32px; background: #fff;">
                <form id="form-verificacion-previa" onsubmit="event.preventDefault();">
                    <div class="form-row-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 0;">
                        <div class="form-group">
                            <label style="font-weight:700;">RUT Vecino <span class="required" style="color:#ef4444;">*</span></label>
                            <input type="text" id="verify-v-rut" placeholder="Ej: 18.478.241-3" style="font-weight:600; width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;">
                        </div>
                        <div class="form-group">
                            <label style="font-weight:600; color:#64748b;">Nombre Beneficiario</label>
                            <input type="text" id="verify-v-nombre-status" readonly value="Esperando RUN..." style="background-color: #f1f5f9; color: #334155; cursor: not-allowed; font-weight: 700; width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;">
                        </div>
                    </div>
                </form>
            </div>
            <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                <button type="button" class="btn btn-secondary btn-cancelar-verify">Cancelar</button>
                <button type="button" id="btn-ejecutar-verify" class="btn btn-primary" style="background-color: #0b438c;" disabled>Verificar Vecino</button>
            </div>
        </div>`;

    document.body.appendChild(overlayVerify);

    const inputRut = overlayVerify.querySelector("#verify-v-rut");
    const inputNombreStatus = overlayVerify.querySelector("#verify-v-nombre-status");
    const btnEjecutar = overlayVerify.querySelector("#btn-ejecutar-verify");

    if (inputRut) {
        inputRut.focus();
        inputRut.addEventListener("input", (e) => {
            let value = e.target.value.replace(/[^0-9kK]/g, '');
            if (value.length > 1) { 
                e.target.value = value.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + value.slice(-1).toUpperCase(); 
            } else { e.target.value = value.toUpperCase(); }
            
            if (inputRut.value.trim().length >= 3) {
                btnEjecutar.disabled = false;
            } else {
                btnEjecutar.disabled = true;
            }
        });

        inputRut.addEventListener("blur", async () => {
            const rutTipeado = inputRut.value.trim();
            if (!rutTipeado) return;

            if (inputNombreStatus) inputNombreStatus.value = "Validando RUT...";
            
            const raw = rutTipeado.replace(/[^0-9kK]/g, "").toUpperCase();
            const formatB = raw.length > 1 ? (raw.slice(0, -1) + "-" + raw.slice(-1)) : raw;

            try {
                const qV = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID), where("rut", "in", [raw, formatB, rutTipeado]));
                const snapVecino = await getDocs(qV);

                if (!snapVecino.empty) {
                    const vecinoDoc = snapVecino.docs[0];
                    if (inputNombreStatus) inputNombreStatus.value = vecinoDoc.data().nombreCompleto;
                    
                    setTimeout(() => {
                        overlayVerify.remove();
                        mostrarAlertaPersonalizada(`Vecino localizado en el padrón: ${vecinoDoc.data().nombreCompleto}. Abriendo expediente permanente...`, "info", () => {
                            abrirConsolaAltaAvanzadaVecinoCompleto(vecinoDoc.id, vecinoDoc.data());
                        });
                    }, 500);

                } else {
                    if (inputNombreStatus) inputNombreStatus.value = "No encontrado";
                    
                    setTimeout(() => {
                        overlayVerify.remove();
                        mostrarAlertaPersonalizada(
                            "El RUN ingresado no figura en nuestros registros actuales. Te sugerimos enrolar a este vecino ahora mismo para iniciar su historial territorial.",
                            "info",
                            () => {
                                abrirConsolaAltaAvanzadaVecinoCompleto(null, { rut: rutTipeado });
                            }
                        );
                    }, 500);
                }
            } catch (err) { 
                console.error(err); 
                if (inputNombreStatus) inputNombreStatus.value = "Error de conexión";
            }
        });
    }

    btnEjecutar.onclick = () => {
        if (inputRut) inputRut.blur();
    };

    overlayVerify.querySelector(".btn-cancelar-verify").onclick = () => overlayVerify.remove();
    overlayVerify.querySelector(".btn-cerrar-verify-x").onclick = () => overlayVerify.remove();
}

function parsearFechaExcel(valor) {
    if (!valor) return "";
    const strVal = valor.toString().trim();
    if (!isNaN(strVal) && Number(strVal) > 10000) {
        const excelEpoch = new Date(1899, 11, 30);
        const msPorDia = 24 * 60 * 60 * 1000;
        const fechaJS = new Date(excelEpoch.getTime() + (Number(strVal) * msPorDia));
        const yyyy = fechaJS.getFullYear();
        const mm = String(fechaJS.getMonth() + 1).padStart(2, '0');
        const dd = String(fechaJS.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
    if (strVal.includes("/")) {
        const partes = strVal.split("/");
        if (partes.length === 3) return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
    }
    return strVal; 
}

function abrirConsolaAltaAvanzadaVecinoCompleto(idVecino = null, dataExistente = {}) {
    const overlayAvanzado = document.createElement("div");
    overlayAvanzado.className = "profile-modal-overlay";
    overlayAvanzado.style.zIndex = "1550";

    let currentSector = dataExistente.sectorTerritorial || "No Sabe / Sin Información";
    let opcionesSectoresHTML = `<option value="No Sabe / Sin Información" ${currentSector === 'No Sabe / Sin Información' ? 'selected' : ''}>No Sabe / Sin Información</option>`;
    
    Object.keys(MAPEO_TERRITORIAL).forEach(sec => {
        if(sec !== "No Sabe / Sin Información" && sec !== "Sin Información") {
            opcionesSectoresHTML += `<option value="${sec}" ${currentSector === sec ? 'selected' : ''}>${ETIQUETAS_SECTORES[sec] || sec}</option>`;
        }
    });

    let opcionesUvsHTML = `<option value="">Seleccione UV</option>`;
    if (dataExistente.sectorTerritorial && MAPEO_TERRITORIAL[dataExistente.sectorTerritorial]) {
        MAPEO_TERRITORIAL[dataExistente.sectorTerritorial].uvs.forEach(uv => {
            opcionesUvsHTML += `<option value="${uv}" ${dataExistente.unidadVecinal === uv ? 'selected' : ''}>${uv}</option>`;
        });
    }

    let opcionesJuntasHTML = `<option value="">Seleccione Junta</option>`;
    if (dataExistente.sectorTerritorial && dataExistente.unidadVecinal && MAPEO_TERRITORIAL[dataExistente.sectorTerritorial]?.juntas[dataExistente.unidadVecinal]) {
        MAPEO_TERRITORIAL[dataExistente.sectorTerritorial].juntas[dataExistente.unidadVecinal].forEach(j => {
            opcionesJuntasHTML += `<option value="${j}" ${dataExistente.juntaVecinos === j ? 'selected' : ''}>${j}</option>`;
        });
    }

    let solicitudesRenderHTML = "";
    if (idVecino) {
        const solicitudesFiltradas = solicitudesMemory.filter(s => s.idVecino === idVecino);
        solicitudesFiltradas.forEach(sol => {
            solicitudesRenderHTML += `<div style="padding:12px; background:#f8fafc; border:1px solid var(--border-color); border-radius:6px; margin-bottom:8px; font-size:12.5px; color:var(--text-dark);"><b style="color:var(--primary-blue);">#Ticket - ${sol.motivo}</b> (${sol.estado})<br><span style="font-size:11px; color:var(--text-light);">${sol.descripcion || ''}</span></div>`;
        });
        if (solicitudesFiltradas.length === 0) {
            solicitudesRenderHTML = `<div class="no-data-placeholder"><p>Este vecino no registra requerimientos territoriales históricos.</p></div>`;
        }
    } else {
        solicitudesRenderHTML = `<div class="no-data-placeholder"><p>Las solicitudes históricas se desplegarán una vez consolidado el alta del vecino.</p></div>`;
    }

    const headerTitle = idVecino ? (dataExistente.sectorTerritorial === "Pendiente de Georreferenciación" ? '📍 Resolviendo Ubicación Pendiente' : 'Modificando Expediente') : 'Ingreso de Nuevo Vecino';

    let fonoPuro = "";
    if (dataExistente.telefono && dataExistente.telefono !== 'No registrado' && dataExistente.telefono !== 'S/R') {
        fonoPuro = dataExistente.telefono.replace(/\D/g, '');
        if (fonoPuro.startsWith('569')) fonoPuro = fonoPuro.substring(3);
        if (fonoPuro.length > 8) fonoPuro = fonoPuro.substring(0,8);
    }
    
    let fechaNacInput = parsearFechaExcel(dataExistente.fechaNacimiento);

    const prefCanal = dataExistente.canalPreferencia || 'WhatsApp';
    const prefSexo = dataExistente.sexo || 'No especificado';

    overlayAvanzado.innerHTML = `
        <div class="profile-modal-card" style="max-width: 760px; width: 95%;">
            <div class="profile-modal-header" style="background-color: ${dataExistente.sectorTerritorial === 'Pendiente de Georreferenciación' ? '#b91c1c' : '#0b438c'}; padding: 20px 32px;">
                <div class="profile-header-info">
                    <h3 style="font-size: 18px; color: #fff; font-weight: 700; margin: 0;">${headerTitle}</h3>
                    <p style="color: rgba(255,255,255,0.8); font-weight: 500; margin: 4px 0 0 0;">Sistema de Gestión - Formulario de Registro Territorial Avanzado</p>
                </div>
                <button class="btn-profile-close btn-close-avanzado" style="top: 16px; right: 16px; color:#fff; font-size:24px;">&times;</button>
            </div>
            
            <div class="profile-modal-tabs" style="padding: 0 32px; background: #fff; border-bottom: 1px solid var(--border-color);">
                <div class="profile-tab active" data-target="v-panel-basicos">Datos Básicos</div>
                <div class="profile-tab" data-target="v-panel-solicitudes">Solicitudes</div>
                <div class="profile-tab" data-target="v-panel-documentos">Documentos</div>
            </div>

            <div class="profile-modal-body" style="padding: 24px 32px; background: #fff; max-height: 480px; overflow-y: auto;">
                <form id="form-alta-avanzada-vecino">
                    
                    <div class="profile-panel active" id="v-panel-basicos">
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                            <div class="form-group"><label>RUT *</label><input type="text" id="v-rut" value="${dataExistente.rut || ''}" readonly style="background-color: #f1f5f9; cursor: not-allowed; font-weight: 700;"></div>
                            <div class="form-group"><label>Nombre completo *</label><input type="text" id="v-nombre" value="${dataExistente.nombreCompleto || ''}" placeholder="Ej. Juan Pérez" required></div>
                            
                            <div class="form-group">
                                <label>Teléfono Celular</label>
                                <div style="display:flex; align-items:stretch; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; background:#fff;">
                                    <span style="background:#f8fafc; padding:10px 12px; color:#475569; font-weight:700; border-right:1px solid #cbd5e1; display:flex; align-items:center; white-space:nowrap;">+56 9</span>
                                    <input type="text" id="v-telefono" value="${fonoPuro}" placeholder="12345678" maxlength="8" style="border:none; width:100%; padding:10px; outline:none; font-weight:600; color:var(--text-dark); background:transparent;">
                                </div>
                            </div>
                            <div class="form-group"><label>Fecha de nacimiento</label><input type="date" id="v-nacimiento" value="${fechaNacInput}"></div>
                        </div>

                        <div class="form-row-grid" style="margin-bottom: 16px;">
                            <div class="form-group full-width"><label>Correo electrónico</label><input type="email" id="v-correo" value="${dataExistente.correo || ''}" placeholder="ej. juan@email.com"></div>
                        </div>

                        <div class="form-row-grid" style="margin-bottom: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <div class="form-group full-width" style="margin: 0;">
                                <label style="margin-bottom: 8px; display: block; font-weight: 700; color: #334155;">Sexo *</label>
                                <div style="display: flex; gap: 24px; align-items: center; flex-wrap: wrap;">
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600; color: #475569;">
                                        <input type="radio" name="v-sexo" value="Femenino" ${prefSexo === 'Femenino' ? 'checked' : ''} style="accent-color: #8b5cf6;"> Femenino
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600; color: #475569;">
                                        <input type="radio" name="v-sexo" value="Masculino" ${prefSexo === 'Masculino' ? 'checked' : ''} style="accent-color: #3b82f6;"> Masculino
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600; color: #475569;">
                                        <input type="radio" name="v-sexo" value="Otro" ${prefSexo === 'Otro' ? 'checked' : ''} style="accent-color: #cbd5e1;"> Otro
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div class="form-row-grid" style="margin-bottom: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <div class="form-group full-width" style="margin: 0;">
                                <label style="margin-bottom: 8px; display: block; font-weight: 700; color: #334155;">Canal de contacto preferido</label>
                                <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600; color: #475569;">
                                        <input type="radio" name="v-canal" value="WhatsApp" ${prefCanal === 'WhatsApp' ? 'checked' : ''} style="accent-color: #10b981;"> WhatsApp
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600; color: #475569;">
                                        <input type="radio" name="v-canal" value="Llamada" ${prefCanal === 'Llamada' ? 'checked' : ''} style="accent-color: #3b82f6;"> Llamada Telefónica
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600; color: #475569;">
                                        <input type="radio" name="v-canal" value="Correo" ${prefCanal === 'Correo' ? 'checked' : ''} style="accent-color: #f59e0b;"> Correo Electrónico
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div class="form-row-grid" style="margin-bottom: 16px;">
                            <div class="form-group full-width"><label>Ocupación / Oficio</label><input type="text" id="v-ocupacion" value="${dataExistente.ocupacion || ''}" placeholder="Ej: Carpintero, Asesora del hogar, Estudiante..."></div>
                        </div>

                        <div class="form-row-grid" style="margin-bottom: 16px;">
                            <div class="form-group full-width"><label>Observaciones o Notas Internas</label><textarea id="v-observaciones" rows="3" placeholder="Detalles de vulnerabilidad territorial, requerimientos especiales, o notas importantes...">${dataExistente.observaciones || ''}</textarea></div>
                        </div>
                        
                        <div class="form-row-grid" style="margin-bottom: 16px; margin-top:24px; padding-top:16px; border-top: 1px solid #e2e8f0;">
                            <div class="form-group full-width">
                                <label style="font-weight: 700; color: #0b438c;">📍 Ubicación Cartográfica (Haz clic para fijar la casa en el mapa)</label>
                                <input type="text" id="v-direccion" value="${dataExistente.direccion && dataExistente.direccion !== 'No registrada' ? dataExistente.direccion : ''}" placeholder="Ej. Av. Principal 1234" style="margin-bottom: 8px;">
                                <div id="v-mini-mapa-picker" style="width: 100%; height: 210px; border: 1px solid #cbd5e1; border-radius: 6px; margin-top: 6px; z-index: 10;"></div>
                                
                                <input type="hidden" id="v-lat" value="${dataExistente.lat || ''}">
                                <input type="hidden" id="v-lng" value="${dataExistente.lng || ''}">
                            </div>
                        </div>

                        <div class="form-row-grid" style="margin-bottom: 16px;">
                            <div class="form-group">
                                <label>Sector Territorial (Automático)</label>
                                <select id="v-sector" disabled style="background-color: #f1f5f9; cursor: not-allowed; font-weight: 700; color: #0b438c;">${opcionesSectoresHTML}</select>
                            </div>
                            <div class="form-group"><label>Unidad Vecinal (UV)</label><select id="v-uv" ${idVecino ? '' : 'disabled'}>${opcionesUvsHTML}</select></div>
                        </div>
                        <div class="form-row-grid" style="margin-bottom: 0;">
                            <div class="form-group"><label>Junta de Vecinos</label><select id="v-junta" ${idVecino ? '' : 'disabled'}>${opcionesJuntasHTML}</select></div>
                            <div class="form-group"><label>Sector / Barrio Popular (Reconocimiento manual)</label><input type="text" id="v-barrio" value="${dataExistente.barrioPopular && dataExistente.barrioPopular !== 'Sin Información' ? dataExistente.barrioPopular : ''}" placeholder="Ej. Villa Los Troncos..."></div>
                        </div>
                    </div>

                    <div class="profile-panel" id="v-panel-solicitudes">
                        ${solicitudesRenderHTML}
                    </div>

                    <div class="profile-panel" id="v-panel-documentos">
                        <div style="text-align: center; padding: 20px; border: 2px dashed #cbd5e1; border-radius: 6px; background: #f8fafc; color: #64748b;">
                            <p style="font-size: 13px; margin: 0;">La carga de documentos adjuntos y escaneos digitales se encuentra centralizada en los flujos principales de gestión.</p>
                        </div>
                    </div>

                </form>
            </div>
            
            <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                <button type="button" class="btn btn-secondary btn-close-avanzado">Cancelar</button>
                <button type="button" class="btn btn-primary btn-guardar-avanzado" style="background-color: #0b438c;">${idVecino ? 'Guardar Cambios' : 'Guardar Vecino'}</button>
            </div>
        </div>`;

    document.body.appendChild(overlayAvanzado);

    const telInput = overlayAvanzado.querySelector("#v-telefono");
    if (telInput) {
        telInput.addEventListener("input", (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').substring(0, 8);
        });
    }

    setTimeout(() => {
        const mapContainer = overlayAvanzado.querySelector("#v-mini-mapa-picker");
        if (!mapContainer) return;

        const baseLat = dataExistente.lat ? Number(dataExistente.lat) : -33.537;
        const baseLng = dataExistente.lng ? Number(dataExistente.lng) : -70.664;
        const baseZoom = dataExistente.lat ? 16 : 14;

        const miniMapa = L.map(mapContainer, { zoomControl: true }).setView([baseLat, baseLng], baseZoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(miniMapa);
        
        setTimeout(() => miniMapa.invalidateSize(), 60);
        setTimeout(() => miniMapa.invalidateSize(), 300);

        let pinMarcador = null;
        const SVG_MARKER = L.divIcon({
            html: `<div class="custom-pin-wrapper"><svg class="pin-vector" width="28" height="38" viewBox="0 0 24 24" fill="#2563eb" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`,
            className: 'leaflet-marker-custom', iconSize: [28, 38], iconAnchor: [14, 38]
        });

        if (dataExistente.lat && dataExistente.lng) {
            pinMarcador = L.marker([baseLat, baseLng], { icon: SVG_MARKER }).addTo(miniMapa);
        }

        miniMapa.on('click', async (e) => {
            const { lat, lng } = e.latlng;
            overlayAvanzado.querySelector("#v-lat").value = lat.toFixed(6);
            overlayAvanzado.querySelector("#v-lng").value = lng.toFixed(6);
            if (pinMarcador) { pinMarcador.setLatLng(e.latlng); } 
            else { pinMarcador = L.marker(e.latlng, { icon: SVG_MARKER }).addTo(miniMapa); }

            const sectorDetectado = autoDetectarSector(lat, lng);
            const sSector = overlayAvanzado.querySelector("#v-sector");
            
            if (sectorDetectado && sectorDetectado !== "Sin Información" && sSector) {
                sSector.value = sectorDetectado;
                sSector.dispatchEvent(new Event('change')); 
            } else if (sSector) {
                sSector.value = "No Sabe / Sin Información";
                sSector.dispatchEvent(new Event('change'));
            }

            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
                const dataRes = await response.json();
                if (dataRes && dataRes.address) {
                    const calle = dataRes.address.road || dataRes.address.pedestrian || "Calle sin nombre";
                    const numero = dataRes.address.house_number || "";
                    const direccionFormateada = numero ? `${calle} ${numero}` : calle;
                    
                    const inputDirModal = overlayAvanzado.querySelector("#v-direccion");
                    if (inputDirModal) {
                        inputDirModal.value = direccionFormateada;
                    }
                }
            } catch (err) {
                console.error("Error en geocodificación inversa Nominatim:", err);
            }
        });

        const inputDireccion = overlayAvanzado.querySelector("#v-direccion");
        if (inputDireccion) {
            inputDireccion.addEventListener("blur", async () => {
                const direccionTexto = inputDireccion.value.trim();
                if (!direccionTexto) return;

                const consultaGeocoding = `${direccionTexto}, Chile`;

                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(consultaGeocoding)}`);
                    const dataRes = await response.json();

                    if (dataRes && dataRes.length > 0) {
                        const latGeocodificada = parseFloat(dataRes[0].lat);
                        const lngGeocodificada = parseFloat(dataRes[0].lon);

                        overlayAvanzado.querySelector("#v-lat").value = latGeocodificada.toFixed(6);
                        overlayAvanzado.querySelector("#v-lng").value = lngGeocodificada.toFixed(6);

                        const nuevaPosicionLatLng = new L.LatLng(latGeocodificada, lngGeocodificada);
                        miniMapa.setView(nuevaPosicionLatLng, 16);

                        if (pinMarcador) {
                            pinMarcador.setLatLng(nuevaPosicionLatLng);
                        } else {
                            pinMarcador = L.marker(nuevaPosicionLatLng, { icon: SVG_MARKER }).addTo(miniMapa);
                        }

                        const sectorDetectado = autoDetectarSector(latGeocodificada, lngGeocodificada);
                        const sSector = overlayAvanzado.querySelector("#v-sector");
                        if (sectorDetectado && sectorDetectado !== "Sin Información" && sSector) {
                            sSector.value = sectorDetectado;
                            sSector.dispatchEvent(new Event('change'));
                        } else if (sSector) {
                            sSector.value = "No Sabe / Sin Información";
                            sSector.dispatchEvent(new Event('change'));
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
            });
        }

        const tabs = overlayAvanzado.querySelectorAll(".profile-tab");
        tabs.forEach(t => t.addEventListener("click", () => {
            if (t.getAttribute("data-target") === "v-panel-basicos") { setTimeout(() => miniMapa.invalidateSize(), 50); }
        }));
    }, 120);

    const tabs = overlayAvanzado.querySelectorAll(".profile-tab");
    const panels = overlayAvanzado.querySelectorAll(".profile-panel");
    tabs.forEach(t => t.addEventListener("click", () => {
        tabs.forEach(tab => tab.classList.remove("active"));
        panels.forEach(p => p.classList.remove("active"));
        t.classList.add("active");
        overlayAvanzado.querySelector(`#${t.getAttribute("data-target")}`).classList.add("active");
    }));

    const sSector = overlayAvanzado.querySelector("#v-sector");
    const sUv = overlayAvanzado.querySelector("#v-uv");
    const sJunta = overlayAvanzado.querySelector("#v-junta");

    sSector.addEventListener("change", (e) => {
        const sector = e.target.value;
        sUv.innerHTML = '<option value="">Seleccione UV</option>';
        sJunta.innerHTML = '<option value="">Seleccione Junta</option>';
        sJunta.disabled = true;

        if (sector && MAPEO_TERRITORIAL[sector] && sector !== "No Sabe / Sin Información") {
            MAPEO_TERRITORIAL[sector].uvs.forEach(uv => { sUv.innerHTML += `<option value="${uv}">${uv}</option>`; });
            sUv.disabled = false;
        } else { sUv.disabled = true; }
    });

    sUv.addEventListener("change", (e) => {
        const sector = sSector.value;
        const uv = e.target.value;
        sJunta.innerHTML = '<option value="">Seleccione Junta</option>';

        if (sector && uv && MAPEO_TERRITORIAL[sector]?.juntas[uv]) {
            MAPEO_TERRITORIAL[sector].juntas[uv].forEach(j => { sJunta.innerHTML += `<option value="${j}">${j}</option>`; });
            sJunta.disabled = false;
        } else { sJunta.disabled = true; }
    });

    overlayAvanzado.querySelectorAll(".btn-close-avanzado").forEach(btn => btn.onclick = () => overlayAvanzado.remove());

    const btnGuardar = overlayAvanzado.querySelector(".btn-guardar-avanzado");
    
    btnGuardar.onclick = async () => {
        const nombreV = overlayAvanzado.querySelector("#v-nombre").value.trim();
        if (!nombreV) {
            overlayAvanzado.querySelector("#v-nombre").style.borderColor = "#ef4444";
            return;
        }

        const sectorTerritorialElegido = sSector.value || "No Sabe / Sin Información";

        const fonoValue = overlayAvanzado.querySelector("#v-telefono").value.trim();
        let telefonoFinal = "No registrado";
        if (fonoValue.length > 0) {
            telefonoFinal = fonoValue.length === 8 ? `+56 9 ${fonoValue.substring(0,4)} ${fonoValue.substring(4)}` : `+56 9 ${fonoValue}`;
        }

        const canalEl = overlayAvanzado.querySelector('input[name="v-canal"]:checked');
        const canalPreferencia = canalEl ? canalEl.value : "WhatsApp";

        const sexoEl = overlayAvanzado.querySelector('input[name="v-sexo"]:checked');
        const sexoFinal = sexoEl ? sexoEl.value : "No especificado";

        btnGuardar.disabled = true;
        btnGuardar.innerText = "Sincronizando...";

        const latVal = overlayAvanzado.querySelector("#v-lat").value;
        const lngVal = overlayAvanzado.querySelector("#v-lng").value;

        try {
            const payload = {
                nombreCompleto: nombreV,
                rut: dataExistente.rut || overlayAvanzado.querySelector("#v-rut").value.trim(),
                telefono: telefonoFinal,
                canalPreferencia: canalPreferencia,
                sexo: sexoFinal, 
                fechaNacimiento: overlayAvanzado.querySelector("#v-nacimiento").value || "",
                correo: overlayAvanzado.querySelector("#v-correo").value.trim() || "",
                direccion: overlayAvanzado.querySelector("#v-direccion").value.trim() || "No registrada",
                lat: latVal ? Number(latVal) : "", 
                lng: lngVal ? Number(lngVal) : "", 
                sectorTerritorial: sectorTerritorialElegido,
                unidadVecinal: sUv.value || "Sin Información",
                juntaVecinos: sJunta.value || "Sin Información",
                barrioPopular: overlayAvanzado.querySelector("#v-barrio").value.trim() || "Sin Información",
                ocupacion: overlayAvanzado.querySelector("#v-ocupacion").value.trim() || "",
                observaciones: overlayAvanzado.querySelector("#v-observaciones").value.trim() || "",
                tenantId: CURRENT_TENANT_ID
            };

            if (payload.sectorTerritorial !== "Pendiente de Georreferenciación") {
                payload.etiquetas = []; 
            }

            if (idVecino) {
                await updateDoc(doc(db, "vecinos", idVecino), payload);
                mostrarAlertaPersonalizada("Expediente territorial actualizado con éxito.", "success");
            } else {
                payload.fechaRegistro = serverTimestamp();
                payload.fotoPerfil = "";

                const counterRef = doc(db, "counters_diarios", CURRENT_TENANT_ID);
                await runTransaction(db, async (transaction) => {
                    const counterDoc = await transaction.get(counterRef);
                    let currentCount = 0;
                    if (counterDoc.exists() && counterDoc.data().vecinosTotal) {
                        currentCount = counterDoc.data().vecinosTotal;
                    }
                    const newCount = currentCount + 1;
                    
                    transaction.set(counterRef, { vecinosTotal: newCount }, { merge: true });
                    payload.correlativo = newCount; 
                    
                    const nuevoVecinoRef = doc(collection(db, "vecinos"));
                    transaction.set(nuevoVecinoRef, payload);
                });

                mostrarAlertaPersonalizada(`Vecino ${nombreV} incorporado al padrón de la comuna.`, "success");
            }

            overlayAvanzado.remove();
            await cargarDatosFirebase();
            aplicarFiltrosVecinos();
            actualizarKpisSuperiores();
        } catch (err) {
            console.error(err);
            btnGuardar.disabled = false;
            btnGuardar.innerText = "Guardar vecino";
        }
    };
}

async function abrirVisorVecino(id) {
    try {
        const docRef = doc(db, "vecinos", id); const docSnap = await getDoc(docRef); if (!docSnap.exists()) return;
        const data = docSnap.data(); 
        
        let fNacimientoFormatted = "No registrada";
        let fechaCruda = parsearFechaExcel(data.fechaNacimiento);
        if (fechaCruda && fechaCruda.includes("-")) {
            fNacimientoFormatted = fechaCruda.split("-").reverse().join("/");
        } else if (fechaCruda) {
            fNacimientoFormatted = fechaCruda;
        }

        const qSols = query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID), where("idVecino", "==", id));
        const snapSolicitudes = await getDocs(qSols);
        let solicitudesLista = []; snapSolicitudes.forEach(sDoc => { solicitudesLista.push({ id: sDoc.id, ...sDoc.data() }); });
        solicitudesLista.sort((a, b) => (b.fechaCreacion?.seconds || 0) - (a.fechaCreacion?.seconds || 0));

        const modalOverlay = document.createElement("div"); modalOverlay.className = "profile-modal-overlay";
        let solicitudesHTML = "";
        if (solicitudesLista.length > 0) {
            solicitudesLista.forEach(sol => {
                const fCreacionObj = sol.fechaCreacion ? new Date(sol.fechaCreacion.seconds * 1000) : new Date();
                const badgeClass = sol.estado === "Abierta" || sol.estado === "En revisión" ? "open" : "review";
                const d = String(fCreacionObj.getDate()).padStart(2, '0'); const m = String(fCreacionObj.getMonth() + 1).padStart(2, '0'); const a = String(fCreacionObj.getFullYear()).slice(-2);
                const codigoTicket = `${(sol.idVecino || "000").substring(0, 4).toUpperCase()}-${d}${m}${a}-${sol.id.substring(0, 3).toUpperCase()}`;

                solicitudesHTML += `
                    <div class="profile-solicitud-box" style="margin-top: 0; margin-bottom: 16px;">
                        <h4><span>#${codigoTicket} - ${sol.motivo} (${sol.subcategoria || 'Gral'})</span><span class="badge ${badgeClass}">${sol.estado}</span></h4>
                        <p style="font-size: 11px; color: var(--text-light)">Derivada a: <b>${sol.oficinaDerivada || 'No asignada'}</b> el ${fCreacionObj.toLocaleDateString('es-CL')}</p>
                        <p style="color: var(--text-dark); margin-top: 6px; line-height: 1.4;">${sol.descripcion}</p>
                    </div>`;
            });
        } else { solicitudesHTML = `<div class="no-data-placeholder"><p>Este vecino no registra requerimientos territoriales históricos.</p></div>`; }

        const sectorVisorLabel = ETIQUETAS_SECTORES[data.sectorTerritorial] || data.sectorTerritorial || "Sin Información";
        
        const shortId = data.correlativo 
            ? `SIG-VEC-${String(data.correlativo).padStart(5, '0')}` 
            : `SIG-VEC-${id.substring(0, 6).toUpperCase()}`;

        modalOverlay.innerHTML = `
            <div class="profile-modal-card">
                <div class="profile-modal-header" style="background-color: #0b438c; padding: 20px 32px;">
                    <div class="profile-header-info">
                        <h3 style="font-size: 18px; color: #fff; font-weight: 700; margin: 0;">Expediente Digital</h3>
                        <p style="color: rgba(255,255,255,0.8); font-weight: 500; margin: 4px 0 0 0;">SIGEV-AGUAYO - Visualización de Hoja de Vida Territorial</p>
                    </div>
                    <button class="btn-profile-close" style="color: #fff; font-size: 24px; top: 16px; right: 16px;">&times;</button>
                </div>
                <div class="profile-modal-tabs">
                    <div class="profile-tab active" data-target="v-panel-basicos">Datos Básicos</div>
                    <div class="profile-tab" data-target="v-panel-solicitudes">Solicitudes</div>
                    <div class="profile-tab" data-target="v-panel-documentos">Documentos</div>
                </div>
                <div class="profile-modal-body">
                    <div class="profile-panel active" id="v-panel-basicos">
                        
                        <div style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px;">
                            <div class="v-avatar-initials lg" style="background:${COLORES_AVATAR[id.charCodeAt(0) % COLORES_AVATAR.length]}; border: 2px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.05); flex-shrink:0;">${getInitials(data.nombreCompleto)}</div>
                            <div>
                                <h4 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--text-dark);">${data.nombreCompleto}</h4>
                                <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-light); font-weight: 600;">RUN: ${data.rut}</p>
                            </div>
                            <div style="margin-left: auto; display: flex; align-items: center; gap: 8px; background: #f1f5f9; padding: 6px 12px; border-radius: 6px; border: 1px solid #cbd5e1;">
                                <span style="font-family: monospace; font-size: 12px; font-weight: 600; color: #475569;">ID: ${shortId}</span>
                                <button class="btn-copy-id" style="background: none; border: none; cursor: pointer; color: #64748b; display: flex; align-items: center; padding: 2px; border-radius: 4px; transition: color 0.15s ease;" title="Copiar ID al portapapeles">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                </button>
                            </div>
                        </div>

                        <div class="profile-data-grid">
                            <div class="profile-data-item"><label>Teléfono</label><p>${data.telefono || "No registrado"}</p></div>
                            <div class="profile-data-item"><label>Canal Preferido</label><p>${data.canalPreferencia || "WhatsApp"}</p></div>
                            <div class="profile-data-item"><label>Sexo</label><p>${data.sexo || "No especificado"}</p></div>
                            <div class="profile-data-item"><label>Fecha Nacimiento</label><p>${fNacimientoFormatted}</p></div>
                            <div class="profile-data-item"><label>Dirección</label><p>${data.direccion || "No registrada"}</p></div>
                            <div class="profile-data-item"><label>Sector Territorial</label><p>${sectorVisorLabel}</p></div>
                            <div class="profile-data-item"><label>Unidad Vecinal (UV)</label><p>${data.unidadVecinal || "Sin Información"}</p></div>
                            <div class="profile-data-item"><label>Junta de Vecinos</label><p>${data.juntaVecinos || "Sin Información"}</p></div>
                            <div class="profile-data-item"><label>Barrio / Villa Popular</label><p>${data.barrioPopular || "Sin Información"}</p></div>
                            <div class="profile-data-item"><label>Ocupación / Oficio</label><p>${data.ocupacion || "No registrada"}</p></div>
                        </div>

                        <div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                            <label style="font-size: 11px; text-transform: uppercase; color: var(--text-light); font-weight: 700; display: block; margin-bottom: 6px;">📝 Observaciones / Notas Críticas</label>
                            <p style="font-size: 13.5px; color: var(--text-dark); line-height: 1.5; white-space: pre-wrap;">${data.observaciones || "No se registran observaciones adicionales del equipo territorial."}</p>
                        </div>

                        <div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                            <label style="font-size: 11px; text-transform: uppercase; color: var(--text-light); font-weight: 700; display: block; margin-bottom: 6px;">📍 Ubicación Georreferenciada</label>
                            <div id="v-visor-mapa" style="width: 100%; height: 210px; border: 1px solid #cbd5e1; border-radius: 8px; background: #e5e7eb;"></div>
                        </div>
                    </div>
                    
                    <div class="profile-panel" id="v-panel-solicitudes">${solicitudesHTML}</div>
                    
                    <div class="profile-panel" id="v-panel-documentos">
                        ${data.urlDocumento ? `<div class="profile-solicitud-box" style="margin-top:0; border-left-color: var(--kpi-purple); display: flex; align-items: center; justify-content: space-between; padding: 14px 18px;"><span style="font-size: 13.5px; font-weight: 600; color: var(--text-dark);">${data.nombreDocumento || "Documento de Respaldo"}</span><a href="${data.urlDocumento}" target="_blank" style="color: var(--primary-blue); font-weight: 600; font-size: 12px; text-decoration: none;">Ver archivo</a></div>` : `<div class="no-data-placeholder"><p>No se registran archivos PDF anexos.</p></div>`}
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modalOverlay);

        modalOverlay.querySelector(".btn-copy-id").onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(shortId).then(() => {
                const iconBtn = modalOverlay.querySelector(".btn-copy-id");
                iconBtn.style.color = "#10b981"; 
                setTimeout(() => { iconBtn.style.color = "#64748b"; }, 1000);
            }).catch(err => console.error("Error al copiar identificador territorial:", err));
        };

        if (data.lat && data.lng) {
            setTimeout(() => {
                const mapVisorContainer = modalOverlay.querySelector("#v-visor-mapa");
                if (mapVisorContainer) {
                    const mapaVisor = L.map(mapVisorContainer, { 
                        zoomControl: true, dragging: true, touchZoom: true, scrollWheelZoom: false, doubleClickZoom: false
                    }).setView([Number(data.lat), Number(data.lng)], 16);
                    
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapaVisor);
                    
                    const SVG_MARKER = L.divIcon({
                        html: `<div class="custom-pin-wrapper"><svg class="pin-vector" width="28" height="38" viewBox="0 0 24 24" fill="#2563eb" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`,
                        className: 'leaflet-marker-custom', iconSize: [28, 38], iconAnchor: [14, 38]
                    });
                    
                    L.marker([Number(data.lat), Number(data.lng)], { icon: SVG_MARKER }).addTo(mapaVisor);
                    
                    setTimeout(() => mapaVisor.invalidateSize(), 60);
                    setTimeout(() => mapaVisor.invalidateSize(), 250);
                    
                    const tabs = modalOverlay.querySelectorAll(".profile-tab");
                    tabs.forEach(t => t.addEventListener("click", () => {
                        if (t.getAttribute("data-target") === "v-panel-basicos") { setTimeout(() => mapaVisor.invalidateSize(), 50); }
                    }));
                }
            }, 150);
        } else {
            const mapVisorContainer = modalOverlay.querySelector("#v-visor-mapa");
            if (mapVisorContainer) {
                mapVisorContainer.style.display = "flex";
                mapVisorContainer.style.alignItems = "center";
                mapVisorContainer.style.justifyContent = "center";
                mapVisorContainer.style.color = "#64748b";
                mapVisorContainer.style.fontSize = "12px";
                mapVisorContainer.style.background = "#f1f5f9";
                mapVisorContainer.innerHTML = "<p style='margin:0; font-weight:500;'>Este vecino no registra georreferenciación en su expediente.</p>";
            }
        }

        const tabs = modalOverlay.querySelectorAll(".profile-tab");
        const panels = modalOverlay.querySelectorAll(".profile-panel");
        tabs.forEach(t => t.addEventListener("click", () => {
            tabs.forEach(tab => tab.classList.remove("active")); panels.forEach(p => p.classList.remove("active"));
            t.classList.add("active"); modalOverlay.querySelector(`#${t.getAttribute("data-target")}`).classList.add("active");
        }));
        modalOverlay.querySelector(".btn-profile-close").onclick = () => modalOverlay.remove();
    } catch (error) { console.error(error); }
}

async function verificarYFocalizarExpedienteDesdeBuzon() {
    const urlParams = new URLSearchParams(window.location.search);
    const rutParam = urlParams.get('rut');

    if (!rutParam) return;

    console.log(`🎯 Capturando redirección del buzón. RUT objetivo: ${rutParam}`);

    try {
        let clean = rutParam.replace(/[.\-\s]/g, "").trim();
        let rutsMatriz = [rutParam, clean];
        
        if (clean.length > 1) {
            let dv = clean.slice(-1).toUpperCase();
            let cuerpo = clean.slice(0, -1);
            let cuerpoConPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            
            rutsMatriz.push(`${cuerpoConPuntos}-${dv}`);
            rutsMatriz.push(`${cuerpo}-${dv}`);         
        }

        rutsMatriz = Array.from(new Set(rutsMatriz));

        let vecinoEncontrado = vecinosMemory.find(v => 
            v.rut && rutsMatriz.some(r => v.rut.replace(/[.\-\s]/g, "").toUpperCase() === r.replace(/[.\-\s]/g, "").toUpperCase())
        );

        if (!vecinoEncontrado) {
            const q = query(
                collection(db, "vecinos"), 
                where("tenantId", "==", CURRENT_TENANT_ID), 
                where("rut", "in", rutsMatriz)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
                const docVecino = snap.docs[0];
                vecinoEncontrado = { id: docVecino.id, ...docVecino.data() };
            }
        }

        if (vecinoEncontrado) {
            const buscadorLocalInput = document.getElementById("filter-vecino-busqueda");
            if (buscadorLocalInput) {
                buscadorLocalInput.value = vecinoEncontrado.rut;
                aplicarFiltrosVecinos();
            }
            seleccionarVecinoPanelDerecho(vecinoEncontrado.id);
        } else {
            console.warn("No se localizó ningún expediente territorial con el RUT suministrado.");
        }
    } catch (error) {
        console.error("Error al ejecutar el enlace cruzado de expedientes:", error);
    }
}

function autoDetectarSector(lat, lng) {
    const poligonos = [
        { 
            id: "Sector Territorial 1", 
            coords: [
                [-33.514685, -70.658115], 
                [-33.517251, -70.644833], 
                [-33.528565, -70.647510], 
                [-33.526514, -70.661431]  
            ] 
        },
        { 
            id: "Sector Territorial 2", 
            coords: [
                [-33.526514, -70.661431], 
                [-33.528565, -70.647510], 
                [-33.539865, -70.651231], 
                [-33.537272, -70.664437]  
            ] 
        },
        { 
            id: "Sector Territorial 3", 
            coords: [
                [-33.537272, -70.664437], 
                [-33.539865, -70.651231], 
                [-33.548759, -70.652888], 
                [-33.545409, -70.668255], 
                [-33.543457, -70.666568]  
            ] 
        },
        { 
            id: "Sector Territorial 4", 
            coords: [
                [-33.510680, -70.671022], 
                [-33.514685, -70.658115], 
                [-33.526514, -70.661431], 
                [-33.521247, -70.676092]  
            ] 
        },
        { 
            id: "Sector Territorial 5", 
            coords: [
                [-33.521247, -70.676092], 
                [-33.526514, -70.661431], 
                [-33.537272, -70.664437], 
                [-33.531880, -70.681551]  
            ] 
        },
        { 
            id: "Sector Territorial 6", 
            coords: [
                [-33.531880, -70.681551], 
                [-33.537272, -70.664437], 
                [-33.543457, -70.666568], 
                [-33.545409, -70.668255], 
                [-33.539123, -70.685379]  
            ] 
        }
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