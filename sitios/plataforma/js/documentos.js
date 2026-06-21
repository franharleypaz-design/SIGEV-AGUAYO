// ==============================================================================
// SIGEV-AGUAYO - MOTOR CONTROLADOR DEL CENTRO DOCUMENTAL POR CARPETAS
// ==============================================================================
import { auth, db } from "./app.js";
import { 
    collection, getDocs, doc, getDoc, query, where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 🕵️‍♂️ DETECTOR MULTI-TENANT DINÁMICO CON OVERRIDE DE SESIÓN GLOBAL (PASAPORTE SUPREMO)
const subdominioDetectado = window.location.hostname.split('.')[0];
const CURRENT_TENANT_ID = sessionStorage.getItem('SIGEV_ACTIVE_TENANT') || ((subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado);

// Caché global del módulo documental
let vecinosDocumentalMemory = [];
let vecinoSeleccionadoCargado = null;

// SVG Corporativo para carpetas amarillas
const SVG_FOLDER_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`;

// Selectores del Entorno
const inputBusqueda = document.getElementById("filter-doc-busqueda");
const btnLimpiarFiltro = document.getElementById("btn-clear-doc-search");

// Selectores de la Ventana Flotante (Modal)
const modalFolder = document.getElementById("modal-folder-view");
const modalTitle = document.getElementById("modal-folder-title");
const modalSubtitle = document.getElementById("modal-folder-subtitle");
const modalPhotoBox = document.getElementById("modal-folder-photo-box");
const modalDocBox = document.getElementById("modal-folder-doc-box");
const btnCloseModalX = document.getElementById("btn-close-folder-modal");
const btnCloseModalFooter = document.getElementById("btn-modal-folder-close-footer");
const btnRedirectFicha = document.getElementById("btn-modal-folder-redirect");

auth.onAuthStateChanged(async (user) => {
    if (user) {
        inicializarEcosistemaDocumental();
        await descargarPadronInquilino();
        filtrarYRenderizarCarpetas();
    }
});

function inicializarEcosistemaDocumental() {
    inputBusqueda.addEventListener("input", filtrarYRenderizarCarpetas);

    btnLimpiarFiltro.onclick = () => {
        inputBusqueda.value = "";
        filtrarYRenderizarCarpetas();
        inputBusqueda.focus();
    };

    // Escuchador maestro para elementos desplegables (Accordion)
    const itemsAcordeon = modalFolder.querySelectorAll(".accordion-header");
    itemsAcordeon.forEach(header => {
        header.onclick = () => {
            const itemPadre = header.closest(".accordion-item");
            const panelContenido = itemPadre.querySelector(".accordion-content");
            const estaAbierto = itemPadre.classList.contains("open");

            if (estaAbierto) {
                itemPadre.classList.remove("open");
                panelContenido.style.display = "none";
            } else {
                itemPadre.classList.add("open");
                panelContenido.style.display = "block";
            }
        };
    });

    const cerrarYResetearModal = () => {
        modalFolder.style.display = "none";
        modalFolder.querySelectorAll(".accordion-item").forEach(item => {
            item.classList.remove("open");
            item.querySelector(".accordion-content").style.display = "none";
        });
    };

    if (btnCloseModalX) btnCloseModalX.onclick = cerrarYResetearModal;
    if (btnCloseModalFooter) btnCloseModalFooter.onclick = cerrarYResetearModal;
    window.addEventListener("click", (e) => { if (e.target === modalFolder) cerrarYResetearModal(); });
    
    if (btnRedirectFicha) {
        btnRedirectFicha.onclick = () => {
            if (vecinoSeleccionadoCargado && vecinoSeleccionadoCargado.id) {
                cerrarYResetearModal();
                abrirVisorExpedienteDigitalMaestro(vecinoSeleccionadoCargado.id);
            }
        };
    }
}

async function descargarPadronInquilino() {
    try {
        const q = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID));
        const snap = await getDocs(q);
        vecinosDocumentalMemory = [];
        snap.forEach(doc => {
            vecinosDocumentalMemory.push({ id: doc.id, ...doc.data() });
        });
        vecinosDocumentalMemory.sort((a, b) => (a.nombreCompleto || "").localeCompare(b.nombreCompleto || ""));
    } catch (err) {
        console.error("Error descargar padrón:", err);
    }
}

function filtrarYRenderizarCarpetas() {
    const busquedaTexto = inputBusqueda.value.toLowerCase().trim();
    
    const busquedaLimpiaAlfanumerica = busquedaTexto.replace(/[^a-z0-9kK]/g, "");
    const busquedaIdLimpio = busquedaTexto.startsWith('#') ? busquedaTexto.substring(1) : busquedaTexto;

    const filtrados = vecinosDocumentalMemory.filter(v => {
        if (!busquedaTexto) return true;

        const matchNombre = (v.nombreCompleto || "").toLowerCase().includes(busquedaTexto);

        const rutRecordLimpio = (v.rut || "").toLowerCase().replace(/[^a-z0-9kK]/g, "");
        const matchRut = rutRecordLimpio.includes(busquedaLimpiaAlfanumerica);

        const shortIdRecord = (v.id || "").substring(0, 6).toLowerCase();
        const matchId = shortIdRecord.includes(busquedaIdLimpio.toLowerCase());

        return matchNombre || matchRut || matchId;
    });

    renderizarGridCarpetas(filtrados);
}

function renderizarGridCarpetas(lista) {
    const contenedor = document.getElementById("folders-master-container");
    if (!contenedor) return;

    if (lista.length === 0) {
        contenedor.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-light); font-weight:500;">No se localizaron carpetas territoriales con esos datos.</div>`;
        return;
    }

    let html = "";
    lista.forEach(v => {
        const shortIdExposed = v.id.substring(0, 6).toUpperCase();
        html += `
            <div class="neighbor-folder-card trigger-folder-open" data-id="${v.id}">
                <div class="folder-svg-icon-container">${SVG_FOLDER_ICON}</div>
                <h4>${v.nombreCompleto}</h4>
                <p>${v.rut || 'ID Provisional'}</p>
                <span class="folder-card-badge-id">#${shortIdExposed}</span>
            </div>`;
    });

    contenedor.innerHTML = html;

    contenedor.querySelectorAll(".trigger-folder-open").forEach(card => {
        card.onclick = () => abrirVentanaFlotanteCarpeta(card.getAttribute("data-id"));
    });
}

function abrirVentanaFlotanteCarpeta(id) {
    const vecino = vecinosDocumentalMemory.find(item => item.id === id);
    if (!vecino) return;

    vecinoSeleccionadoCargado = vecino;
    const shortIdExposed = vecino.id.substring(0, 6).toUpperCase();

    modalTitle.innerText = `Ficha de Vecino: ${vecino.nombreCompleto}`;
    modalSubtitle.innerText = `RUN: ${vecino.rut || 'No registrado'} | Código: #${shortIdExposed}`;

    if (vecino.fotoPerfil && vecino.fotoPerfil.trim() !== "") {
        modalPhotoBox.innerHTML = `
            <a href="${vecino.fotoPerfil}" target="_blank" class="folder-download-row-btn">
                <div style="display:flex; align-items:center; gap:8px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16" style="color:var(--primary-blue);"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                    <span>Fotografía de Perfil (${vecino.nombreCompleto}.jpg)</span>
                </div>
                <span style="color:var(--primary-blue); font-size:12px; font-weight:700;">Abrir en otra pestaña &rarr;</span>
            </a>`;
    } else {
        modalPhotoBox.innerHTML = `<p style="margin:0; color:var(--text-light); font-size:12.5px; font-weight:500;">Esta carpeta no registra archivos de imagen de perfil.</p>`;
    }

    if (vecino.urlDocumento && vecino.urlDocumento.trim() !== "") {
        const docLabelName = vecino.nombreDocumento && vecino.nombreDocumento.trim() !== "" ? vecino.nombreDocumento : "Ficha Territorial Adjunta";
        modalDocBox.innerHTML = `
            <a href="${vecino.urlDocumento}" target="_blank" class="folder-download-row-btn">
                <div style="display:flex; align-items:center; gap:8px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16" style="color:var(--primary-blue);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    <span>${docLabelName} (Documento de Respaldo)</span>
                </div>
                <span style="color:var(--primary-blue); font-size:12px; font-weight:700;">Abrir en otra pestaña &rarr;</span>
            </a>`;
    } else {
        modalDocBox.innerHTML = `<p style="margin:0; color:var(--text-light); font-size:12.5px; font-weight:500;">Esta carpeta no registra archivos PDF o escaneos digitales de respaldo.</p>`;
    }

    modalFolder.style.display = "flex";
}

// ==============================================================================
// 📋 RÉPLICA FIEL Y CLONACIÓN INTEGRAL DEL VISOR DE VECINOS
// ==============================================================================
async function abrirVisorExpedienteDigitalMaestro(id) {
    try {
        const docRef = doc(db, "vecinos", id); const docSnap = await getDoc(docRef); if (!docSnap.exists()) return;
        const data = docSnap.data(); const fotoSrc = data.fotoPerfil || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100";
        const fNacimientoFormatted = data.fechaNacimiento ? data.fechaNacimiento.split("-").reverse().join("/") : "No registrada";

        const qSols = query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID), where("idVecino", "==", id));
        const snapSolicitudes = await getDocs(qSols);
        let solicitudesLista = []; snapSolicitudes.forEach(sDoc => { solicitudesLista.push({ id: sDoc.id, ...sDoc.data() }); });
        solicitudesLista.sort((a, b) => (b.fechaCreacion?.seconds || 0) - (a.fechaCreacion?.seconds || 0));

        const visorOverlay = document.createElement("div"); visorOverlay.className = "profile-modal-overlay";
        visorOverlay.style.zIndex = "2600";
        
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

        const ETIQUETAS_SECTORES_LOCAL = {
            "Sector Territorial 1": "Sector Territorial 1 (UV 1)",
            "Sector Territorial 2": "Sector Territorial 2 (UV 2-3)",
            "Sector Territorial 3": "Sector Territorial 3 (UV 4-5)",
            "Sector Territorial 4": "Sector Territorial 4 (UV 14-15)",
            "Sector Territorial 5": "Sector Territorial 5 (UV 16-17)",
            "Sector Territorial 6": "Sector Territorial 6 (UV 18)",
            "Sin Información": "Sin Información",
            "No Sabe / Sin Información": "No Sabe / Sin Información"
        };
        const sectorVisorLabel = ETIQUETAS_SECTORES_LOCAL[data.sectorTerritorial] || data.sectorTerritorial || "Sin Información";

        const shortId = id.substring(0, 6).toUpperCase();

        // Estructuración exacta unificada (Copia fiel del Padrón de Vecinos)
        visorOverlay.innerHTML = `
            <div class="profile-modal-card">
                <div class="profile-modal-header" style="background-color: #0b438c; padding: 20px 32px;">
                    <div class="profile-header-info">
                        <h3 style="font-size: 18px; color: #fff; font-weight: 700; margin: 0;">Expediente Digital</h3>
                        <p style="color: rgba(255,255,255,0.8); font-weight: 500; margin: 4px 0 0 0;">SIGEV-AGUAYO - Visualización de Hoja de Vida Territorial</p>
                    </div>
                    <button class="btn-profile-close" style="color: #fff; font-size: 24px; top: 16px; right: 16px; position: absolute; background: none; border: none; cursor: pointer;">&times;</button>
                </div>
                <div class="profile-modal-tabs">
                    <div class="profile-tab active" data-target="v-panel-basicos">Datos Básicos</div>
                    <div class="profile-tab" data-target="v-panel-solicitudes">Solicitudes</div>
                    <div class="profile-tab" data-target="v-panel-avanzados">Datos Avanzados</div>
                    <div class="profile-tab" data-target="v-panel-adicional">Info Adicional</div>
                    <div class="profile-tab" data-target="v-panel-documentos">Documentos</div>
                </div>
                <div class="profile-modal-body">
                    <div class="profile-panel active" id="v-panel-basicos">
                        
                        <div style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px;">
                            <img src="${fotoSrc}" style="width: 72px; height: 72px; border-radius: 50%; object-fit: cover; border: 2px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
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
                            <div class="profile-data-item"><label>Fecha Nacimiento</label><p>${fNacimientoFormatted}</p></div>
                            <div class="profile-data-item"><label>Dirección</label><p>${data.direccion || "No registrada"}</p></div>
                            <div class="profile-data-item"><label>Sector Territorial</label><p>${sectorVisorLabel}</p></div>
                            <div class="profile-data-item"><label>Unidad Vecinal (UV)</label><p>${data.unidadVecinal || "Sin Información"}</p></div>
                            <div class="profile-data-item"><label>Junta de Vecinos</label><p>${data.juntaVecinos || "Sin Información"}</p></div>
                            <div class="profile-data-item"><label>Barrio / Villa Popular</label><p>${data.barrioPopular || "Sin Información"}</p></div>
                        </div>

                        <div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                            <label style="font-size: 11px; text-transform: uppercase; color: var(--text-light); font-weight: 700; display: block; margin-bottom: 6px;">📍 Ubicación Georreferenciada</label>
                            <div id="v-visor-mapa" style="width: 100%; height: 210px; border: 1px solid #cbd5e1; border-radius: 8px; background: #e5e7eb;"></div>
                        </div>
                    </div>
                    <div class="profile-panel" id="v-panel-solicitudes">${solicitudesHTML}</div>
                    <div class="profile-panel" id="v-panel-avanzados"><div class="profile-data-grid"><div class="profile-data-item full-width"><label>Ocupación / Oficio</label><p>${data.ocupacion || "No registrada"}</p></div></div></div>
                    <div class="profile-panel" id="v-panel-adicional">
                        <div style="padding: 10px 0;">
                            <label style="font-size: 11px; text-transform: uppercase; color: var(--text-light); font-weight: 700; display: block; margin-bottom: 6px;">Observaciones Críticas de Terreno</label>
                            <p style="font-size: 13.5px; color: var(--text-dark); line-height: 1.5; white-space: pre-wrap;">${data.observaciones || "No se registran observaciones adicionales del equipo territorial."}</p>
                        </div>
                    </div>
                    <div class="profile-panel" id="v-panel-documentos">
                        ${data.urlDocumento ? `
                            <div class="profile-solicitud-box" style="margin-top:0; border-left-color: var(--kpi-purple); display: flex; align-items: center; justify-content: space-between; padding: 14px 18px;">
                                <span style="font-size: 13.5px; font-weight: 600; color: var(--text-dark);">${data.nombreDocumento || "Documento de Respaldo"}</span>
                                <a href="${data.urlDocumento}" target="_blank" style="color: var(--primary-blue); display: flex; align-items: center; font-weight: 600; font-size: 12px; text-decoration: none;" title="Ver documento">
                                    Ver archivo <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="margin-left: 4px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                </a>
                            </div>
                        ` : `
                            <div class="no-data-placeholder">
                                <p>No se registran archivos PDF o documentos anexos en este expediente.</p>
                            </div>
                        `}
                    </div>
                </div>
            </div>`;
        document.body.appendChild(visorOverlay);

        const tabsVisor = visorOverlay.querySelectorAll(".profile-tab");
        const panelsVisor = visorOverlay.querySelectorAll(".profile-panel");

        // --- MANEJADOR DEL EVENTO COPIAR AL PORTAPAPELES VINCULADO AL ID CORTO ---
        visorOverlay.querySelector(".btn-copy-id").onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(shortId).then(() => {
                const iconBtn = visorOverlay.querySelector(".btn-copy-id");
                iconBtn.style.color = "#10b981";
                setTimeout(() => { iconBtn.style.color = "#64748b"; }, 1000);
            }).catch(err => console.error("Error al copiar identificador territorial:", err));
        };

        if (data.lat && data.lng) {
            setTimeout(() => {
                const mapVisorContainer = visorOverlay.querySelector("#v-visor-mapa");
                if (mapVisorContainer) {
                    const mapaVisor = L.map(mapVisorContainer, { 
                        zoomControl: true,
                        dragging: true,
                        touchZoom: true,
                        scrollWheelZoom: false,
                        doubleClickZoom: false
                    }).setView([Number(data.lat), Number(data.lng)], 16);
                    
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapaVisor);
                    
                    const SVG_MARKER = L.divIcon({
                        html: `<div class="custom-pin-wrapper"><svg class="pin-vector" width="28" height="38" viewBox="0 0 24 24" fill="#2563eb" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`,
                        className: 'leaflet-marker-custom', iconSize: [28, 38], iconAnchor: [14, 38]
                    });
                    
                    L.marker([Number(data.lat), Number(data.lng)], { icon: SVG_MARKER }).addTo(mapaVisor);
                    
                    setTimeout(() => mapaVisor.invalidateSize(), 60);
                    setTimeout(() => mapaVisor.invalidateSize(), 250);
                    
                    tabsVisor.forEach(t => t.addEventListener("click", () => {
                        if (t.getAttribute("data-target") === "v-panel-basicos") { setTimeout(() => mapaVisor.invalidateSize(), 50); }
                    }));
                }
            }, 150);
        } else {
            const mapVisorContainer = visorOverlay.querySelector("#v-visor-mapa");
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

        tabsVisor.forEach(t => t.addEventListener("click", () => {
            tabsVisor.forEach(tab => tab.classList.remove("active")); panelsVisor.forEach(p => p.classList.remove("active"));
            t.classList.add("active"); visorOverlay.querySelector(`#${t.getAttribute("data-target")}`).classList.add("active");
        }));
        
        visorOverlay.querySelector(".btn-profile-close").onclick = () => visorOverlay.remove();
    } catch (error) { console.error(error); }
}