// 1. Importamos las instancias seguras compartidas desde app.js
import { auth, db, app } from "./app.js";

// 2. Importamos los métodos oficiales de Cloud Firestore
import { 
    collection, 
    addDoc,
    doc,
    getDoc,
    updateDoc,
    getDocs, 
    query, 
    orderBy, 
    limit,
    where,
    serverTimestamp,
    getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 3. Importamos los métodos de Firebase Storage para subida de archivos
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// 4. Importamos Layout y Diccionarios Maestros
import { inyectarEstructuraGlobal, actualizarPerfilLayout } from "./layout.js";
import { MAPEO_MUNICIPAL, MAPEO_TERRITORIAL } from "./mapeoMunicipal.js";

// Inicializar de forma segura el canal de almacenamiento compartido
const storage = getStorage(app);
let archivoFotoSeleccionado = null; 
let archivoDocSeleccionado = null; 
let estaGuardando = false; 
let solicitudesGlobalesMemory = []; 
let estadoFiltroKPIActivo = "Todos";
let vDataActual = null; // Caché operativa global para auto-asociación de expediente verificado

// ARQUITECTURA TENANT: Identificador maestro de aislamiento corporativo
const CURRENT_TENANT_ID = "aguayo";

// --- DICCIONARIO VISUAL DE SECTORES (Para mostrar los paréntesis en los selectores dinámicos) ---
const ETIQUETAS_SECTORES = {
    "Sector Territorial 1": "Sector Territorial 1 (UV 1)",
    "Sector Territorial 2": "Sector Territorial 2 (UV 2-3)",
    "Sector Territorial 3": "Sector Territorial 3 (UV 4-5)",
    "Sector Territorial 4": "Sector Territorial 4 (UV 14-15)",
    "Sector Territorial 5": "Sector Territorial 5 (UV 16-17)",
    "Sector Territorial 6": "Sector Territorial 6 (UV 18)",
    "No Sabe / Sin Información": "No Sabe / Sin Información"
};

// Validar inicio de sesión e inicializar componentes de control territorial
inyectarEstructuraGlobal();

auth.onAuthStateChanged((user) => {
    if (user) {
        console.log("Módulo de solicitudes y validador territorial unificado conectados con éxito.");
        actualizarPerfilLayout(user);
        inicializarRelojMundial();
        ejecutarMotorCargaSolicitudes();
        inicializarEscuchadoresFiltros();
        inicializarManejadorModalIngreso();
    }
});

// --- FUNCIÓN DEL RELOJ DIGITAL EN TIEMPO REAL ---
function inicializarRelojMundial() {
    const clockContainer = document.getElementById("live-clock");
    if (!clockContainer) return;
    const render = () => {
        const ahora = new Date();
        clockContainer.innerText = `|   ${ahora.toLocaleDateString('es-CL')}   ${ahora.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    };
    render();
    setInterval(render, 1000);
}

// --- FUNCIÓN CENTRAL PARA INYECTAR ALERTAS ---
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
        </div>
    `;

    document.body.appendChild(overlay);
    const btnAceptar = overlay.querySelector(".btn-alert-confirm");
    if (btnAceptar) btnAceptar.focus();
    btnAceptar.addEventListener("click", () => overlay.remove());
}

// --- FUNCIÓN: MODAL VISOR DE PERFIL VECINAL ---
async function abrirVisorVecino(id) {
    try {
        const docRef = doc(db, "vecinos", id); const docSnap = await getDoc(docRef); if (!docSnap.exists()) return;
        const data = docSnap.data(); const fotoSrc = data.fotoPerfil || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100";
        const fNacimientoFormatted = data.fechaNacimiento ? data.fechaNacimiento.split("-").reverse().join("/") : "No registrada";

        const snapSolicitudes = await getDocs(query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID), where("idVecino", "==", id)));
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

        modalOverlay.innerHTML = `
            <div class="profile-modal-card">
                <div class="profile-modal-header">
                    <img src="${fotoSrc}" class="profile-modal-avatar">
                    <div class="profile-header-info"><h3>${data.nombreCompleto}</h3><p>RUT: ${data.rut}</p></div>
                    <button class="btn-profile-close">&times;</button>
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
                        <div class="profile-data-grid">
                            <div class="profile-data-item"><label>Teléfono</label><p>${data.telefono || "No registrado"}</p></div>
                            <div class="profile-data-item"><label>Fecha Nacimiento</label><p>${fNacimientoFormatted}</p></div>
                            <div class="profile-data-item"><label>Dirección</label><p>${data.direccion || "No registrada"}</p></div>
                            <div class="profile-data-item"><label>Sector Territorial</label><p>${sectorVisorLabel}</p></div>
                            <div class="profile-data-item"><label>Unidad Vecinal (UV)</label><p>${data.unidadVecinal || "Sin Información"}</p></div>
                            <div class="profile-data-item"><label>Junta de Vecinos</label><p>${data.juntaVecinos || "Sin Información"}</p></div>
                            <div class="profile-data-item"><label>Barrio / Villa Popular</label><p>${data.barrioPopular || "Sin Información"}</p></div>
                        </div>
                    </div>
                    <div class="profile-panel" id="v-panel-solicitudes">${solicitudesHTML}</div>
                    
                    <div class="profile-panel" id="v-panel-avanzados">
                        <div class="profile-data-grid">
                            <div class="profile-data-item full-width"><label>Ocupación / Oficio</label><p>${data.ocupacion || "No registrada"}</p></div>
                        </div>
                    </div>
                    
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
        document.body.appendChild(modalOverlay);

        const tabs = modalOverlay.querySelectorAll(".profile-modal-tabs div");
        const panels = modalOverlay.querySelectorAll(".profile-panel");
        tabs.forEach(t => t.addEventListener("click", () => {
            tabs.forEach(tab => tab.classList.remove("active")); 
            panels.forEach(p => p.classList.remove("active"));
            t.classList.add("active"); 
            modalOverlay.querySelector(`#${t.getAttribute("data-target")}`).classList.add("active");
        }));

        modalOverlay.querySelector(".btn-profile-close").addEventListener("click", () => modalOverlay.remove());
    } catch (error) { console.error(error); }
}

// --- MODAL DE EDICIÓN AVANZADO DE EXPEDIENTE ---
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
        let fotoEdicionLocal = null;
        let docEdicionLocal = null;
        let eliminarDocMarcado = false; 

        const modalOverlay = document.createElement("div");
        modalOverlay.className = "profile-modal-overlay";

        let opcionesCategoriasHTML = `<option value="">Ninguna</option>`;
        Object.keys(MAPEO_MUNICIPAL).forEach(cat => {
            const selected = data.solicitudAsociada?.motivo === cat ? 'selected' : '';
            opcionesCategoriasHTML += `<option value="${cat}" ${selected}>${cat}</option>`;
        });

        let opcionesSectoresHTML = `<option value="">Seleccione Sector</option>`;
        Object.keys(MAPEO_TERRITORIAL).forEach(sec => {
            const labelStr = ETIQUETAS_SECTORES[sec] || sec;
            opcionesSectoresHTML += `<option value="${sec}" ${data.sectorTerritorial === sec ? 'selected' : ''}>${labelStr}</option>`;
        });

        let opcionesUvsHTML = `<option value="">Seleccione UV</option>`;
        if (data.sectorTerritorial && MAPEO_TERRITORIAL[data.sectorTerritorial]) {
            MAPEO_TERRITORIAL[data.sectorTerritorial].uvs.forEach(uv => {
                opcionesUvsHTML += `<option value="${uv}" ${data.unidadVecinal === uv ? 'selected' : ''}>${uv}</option>`;
            });
        }

        let opcionesJuntasTerritorialesHTML = `<option value="">Seleccione Junta</option>`;
        if (data.sectorTerritorial && data.unidadVecinal && MAPEO_TERRITORIAL[data.sectorTerritorial]?.juntas[data.unidadVecinal]) {
            MAPEO_TERRITORIAL[data.sectorTerritorial].juntas[data.unidadVecinal].forEach(j => {
                opcionesJuntasTerritorialesHTML += `<option value="${j}" ${data.juntaVecinos === j ? 'selected' : ''}>${j}</option>`;
            });
        }

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
                const codigoTicket = `${(sol.idVecino || "000").substring(0, 4).toUpperCase()}-${d}${m}${a}-${sol.id.substring(0, 3).toUpperCase()}`;

                solicitudesRenderHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #fff; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                        <div>
                            <div style="font-weight: 700; font-size: 13px; color: var(--primary-blue); margin-bottom: 3px;">#${codigoTicket}</div>
                            <div style="font-weight: 600; font-size: 12.5px; color: var(--text-dark);">${sol.motivo} <span style="font-weight: normal; color: var(--text-light);">(${sol.subcategoria || 'Gral'})</span></div>
                            <div style="font-size: 11px; color: var(--text-light); margin-top: 4px;">Estado: <b style="color: var(--text-dark);">${sol.estado}</b> | Prioridad: <b>${sol.prioridad || 'Media'}</b></div>
                        </div>
                        <button type="button" class="btn-edit-sol-item" data-id="${sol.id}" data-motivo="${sol.motivo}" data-sub="${sol.subcategoria}" data-ofi="${sol.oficinaDerivada}" data-prio="${sol.prioridad}" data-desc="${sol.descripcion}" style="background: none; border: none; cursor: pointer; color: #64748b; padding: 6px; border-radius: 4px; transition: 0.2s;" title="Editar Solicitud">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                    </div>`;
            });
        } else {
            solicitudesRenderHTML = `<div class="no-data-placeholder"><p>No se registran solicitudes activas para este vecino.</p></div>`;
        }

        modalOverlay.innerHTML = `
            <div class="profile-modal-card">
                <div class="profile-modal-header" style="background: linear-gradient(135deg, #1e293b, #475569);">
                    <div class="modal-avatar-wrapper" style="position: relative; cursor: pointer;" title="Cambiar Foto">
                        <img src="${fotoSrc}" class="profile-modal-avatar" id="edit-modal-preview">
                        <div style="position: absolute; bottom: 0; background: rgba(0,0,0,0.6); width: 100%; text-align: center; font-size: 10px; padding: 3px 0; border-bottom-left-radius: 50%; border-bottom-right-radius: 50%; color: #fff; font-weight: 600;">CAMBIAR</div>
                        <input type="file" id="edit-modal-file-input" accept="image/*" style="display: none;">
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

// --- CARGA Y COMPILACIÓN PARALELA DE DATOS (CON REPARACIÓN DE ORDENAMIENTO EN JS) ---
async function ejecutarMotorCargaSolicitudes() {
    try {
        renderizarMetricasServidor();
        const snapGlobal = await getDocs(query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID)));
        solicitudesGlobalesMemory = [];
        snapGlobal.forEach(sDoc => { solicitudesGlobalesMemory.push({ id: sDoc.id, ...sDoc.data() }); });
        
        solicitudesGlobalesMemory.sort((a, b) => {
            const timeA = a.fechaCreacion?.seconds || 0;
            const timeB = b.fechaCreacion?.seconds || 0;
            return timeB - timeA;
        });

        aplicarFiltrosCruzadosInterfaz();
    } catch (err) { console.error(err); }
}

// --- OPTIMIZACIÓN DE MÉTRICAS CON GETCOUNTFROMSERVER CON FILTRADO TENANT ---
async function renderizarMetricasServidor() {
    try {
        const refCol = collection(db, "solicitudes");
        const [snapTotal, snapRev, snapGest, snapFin] = await Promise.all([
            getCountFromServer(query(refCol, where("tenantId", "==", CURRENT_TENANT_ID))),
            getCountFromServer(query(refCol, where("tenantId", "==", CURRENT_TENANT_ID), where("estado", "==", "En revisión"))),
            getCountFromServer(query(refCol, where("tenantId", "==", CURRENT_TENANT_ID), where("estado", "==", "En gestión"))),
            getCountFromServer(query(refCol, where("tenantId", "==", CURRENT_TENANT_ID), where("estado", "==", "Finalizada")))
        ]);
        document.getElementById("count-total").innerText = snapTotal.data().count;
        document.getElementById("count-revision").innerText = snapRev.data().count;
        document.getElementById("count-gestion").innerText = snapGest.data().count;
        document.getElementById("count-finalizadas").innerText = snapFin.data().count;
        document.getElementById("count-vencidas").innerText = "0"; 
    } catch(e) { console.error(e); }
}

// --- PROCESAMIENTO FILTRADO EN MEMORIA LOCAL ---
function aplicarFiltrosCruzadosInterfaz() {
    const codFiltro = document.getElementById("filter-solicitud-codigo").value.toLowerCase();
    const tipoSelect = document.getElementById("filter-tipo").value;
    const prioSelect = document.getElementById("filter-prioridad").value;
    const fDesde = document.getElementById("filter-fecha-desde").value;
    const fHasta = document.getElementById("filter-fecha-hasta").value;

    let filtrados = solicitudesGlobalesMemory.filter(sol => {
        const dateObj = sol.fechaCreacion ? new Date(sol.fechaCreacion.seconds * 1000) : new Date();
        const d = String(dateObj.getDate()).padStart(2, '0'); 
        const m = String(dateObj.getMonth() + 1).padStart(2, '0'); 
        const a = String(dateObj.getFullYear()).slice(-2);
        const ticketCodigo = `#${(sol.idVecino || "000").substring(0, 4).toUpperCase()}-${d}${m}${a}-${sol.id.substring(0, 3).toUpperCase()}`.toLowerCase();

        if (codFiltro && !ticketCodigo.includes(codFiltro)) return false;
        if (estadoFiltroKPIActivo !== "Todos" && sol.estado !== estadoFiltroKPIActivo) return false;
        if (tipoSelect !== "Todos" && sol.motivo !== tipoSelect) return false;
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
    inyectarFilasTablaSolicitudes(filtrados);
}

// --- RENDERIZADOR DE FILAS ---
function inyectarFilasTablaSolicitudes(listaTickets) {
    const tbody = document.querySelector("#tabla-global-solicitudes tbody"); if (!tbody) return;
    let html = "";
    
    const currentUser = auth.currentUser;
    const loggedName = currentUser ? (currentUser.displayName || currentUser.email) : "Equipo Territorial";
    const loggedPhoto = currentUser?.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=50";

    listaTickets.forEach(sol => {
        const dateObj = sol.fechaCreacion ? new Date(sol.fechaCreacion.seconds * 1000) : new Date();
        const idTicket = `${(sol.idVecino || "000").substring(0, 4).toUpperCase()}-${String(dateObj.getDate()).padStart(2, '0')}${String(dateObj.getMonth() + 1).padStart(2, '0')}${String(dateObj.getFullYear()).slice(-2)}-${sol.id.substring(0, 3).toUpperCase()}`;
        const classEstado = sol.estado === "En revisión" ? "revision" : sol.estado === "En gestión" ? "gestion" : "finalizada";
        
        let nombreEncargado = sol.asignadoA || sol.registradaPorNombre;
        if (!nombreEncargado || nombreEncargado === "Equipo Territorial") { nombreEncargado = loggedName; }

        let avatarEncargado = sol.registradaPorFoto;
        if (!avatarEncargado || avatarEncargado === "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=50") { avatarEncargado = loggedPhoto; }

        html += `
            <tr>
                <td><input type="checkbox" class="row-selector-checkbox"></td>
                <td style="white-space: nowrap; font-weight:700;"><a href="#" class="ticket-id solicitud-hover-trigger" data-id="${sol.id}" style="color:var(--primary-blue);">#${idTicket}</a></td>
                <td><span class="stacked-cell-primary">${dateObj.toLocaleDateString('es-CL')}</span><span class="stacked-cell-secondary">${dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span></td>
                <td><span class="stacked-cell-primary">${sol.vecinoNombre || sol.nombreVecino}</span><span class="stacked-cell-secondary">RUT: ${sol.vecinoRut || sol.rutVecino || "S/R"}</span></td>
                <td><b>${sol.categoria || sol.motivo || "Petición"}</b><span class="stacked-cell-secondary">${sol.subcategoria || "Gral"}</span></td>
                <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${sol.descripcion}">${sol.descripcion || "Sin asunto"}</td>
                <td><span class="stacked-cell-primary" style="font-size:12px; font-weight:600;">${sol.oficinaDerivada || "Equipo Territorial"}</span></td>
                <td><span class="badge-status ${classEstado}">${sol.estado}</span></td>
                <td><span class="badge-priority ${(sol.prioridad || "Media").toLowerCase()}">${sol.prioridad || "Media"}</span></td>
                <td>
                    <div class="table-assignee-cell" style="display: flex; align-items: center; gap: 8px;">
                        <img src="${avatarEncargado}" class="assignee-avatar" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">
                        <span class="assignee-name" style="font-size: 12.5px; font-weight: 600;">${nombreEncargado}</span>
                    </div>
                </td>
                <td style="text-align: center; color:#94a3b8; font-weight:bold; cursor:pointer;" class="btn-editar-trigger" data-id="${sol.id}">...</td>
            </tr>`;
    });
    tbody.innerHTML = html || `<tr><td colspan="11" style="text-align:center; padding:30px; color:var(--text-light);">No se encontraron solicitudes.</td></tr>`;
    document.getElementById("pagination-info-text").innerText = `Mostrando 1 a ${listaTickets.length} de ${listaTickets.length} solicitudes`;
    
    tbody.querySelectorAll(".btn-editar-trigger").forEach(btn => {
        btn.addEventListener("click", async () => await abrirEditorEspecificoSolicitud(btn.getAttribute("data-id")));
    });

    configurarManejadoresHoverSolicitud();
}

// --- MOTOR DE HOVER INTERACTIVO PARA SOLICITUDES ---
function configurarManejadoresHoverSolicitud() {
    const triggers = document.querySelectorAll(".solicitud-hover-trigger");
    const solHoverCard = document.getElementById("solicitud-hover-card");
    if (!solHoverCard) return;

    triggers.forEach(el => {
        el.addEventListener("mouseenter", (e) => {
            const id = e.currentTarget.getAttribute("data-id");
            const sol = solicitudesGlobalesMemory.find(s => s.id === id);
            if (!sol) return;

            const dateObj = sol.fechaCreacion ? new Date(sol.fechaCreacion.seconds * 1000) : new Date();
            const d = String(dateObj.getDate()).padStart(2, '0');
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const a = String(dateObj.getFullYear()).slice(-2);
            const ticketCodigo = `#${(sol.idVecino || "000").substring(0, 4).toUpperCase()}-${d}${m}${a}-${sol.id.substring(0, 3).toUpperCase()}`;

            solHoverCard.innerHTML = `
                <div style="margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
                    <h5 style="margin:0; font-size:13.5px; font-weight:700; color:var(--primary-blue);">${ticketCodigo}</h5>
                    <p style="margin:2px 0 0 0; font-size:11px; color:var(--text-light); font-weight:600;">📋 ${sol.categoria || sol.motivo} (${sol.subcategoria || 'General'})</p>
                </div>
                <div style="font-size:11.5px; color:var(--text-dark); line-height:1.4; display:flex; flex-direction:column; gap:4px;">
                    <div>👤 <b>Vecino:</b> ${sol.vecinoNombre || sol.nombreVecino || 'No registrado'}</div>
                    <div>🏢 <b>Oficina:</b> ${sol.oficinaDerivada || 'DIDECO'}</div>
                    <div>🚨 <b>Prioridad:</b> ${sol.prioridad || 'Media'}</div>
                    <div style="margin-top: 6px; padding: 8px; background: #f8fafc; border-radius: 6px; border: 1px solid var(--border-color); font-size:11px; color:#334155; max-height: 90px; overflow-y: auto; white-space: pre-wrap; line-height:1.4;">📄 <b>Descripción:</b><br>${sol.descripcion || 'Sin observaciones.'}</div>
                </div>`;

            const rect = e.currentTarget.getBoundingClientRect();
            solHoverCard.style.top = `${rect.top + window.scrollY - 30}px`;
            solHoverCard.style.left = `${rect.left + window.scrollX + 160}px`;
            solHoverCard.style.display = "block";
        });

        el.addEventListener("mouseleave", () => {
            solHoverCard.style.display = "none";
        });
    });
}

// --- ESCUCHADORES DE FILTRADO ---
export function inicializarEscuchadoresFiltros() {
    const inputCodigo = document.getElementById("filter-solicitud-codigo");
    
    const btnToggleMobile = document.getElementById("btn-toggle-filters-mobile");
    if (btnToggleMobile) {
        btnToggleMobile.addEventListener("click", () => {
            const panelCard = btnToggleMobile.closest(".filter-panel-card");
            if (panelCard) {
                panelCard.classList.toggle("filters-expanded");
            }
        });
    }

    if (inputCodigo) {
        inputCodigo.addEventListener("input", (e) => {
            let val = e.target.value.replace(/\s+/g, '');

            if (val.length === 0) {
                e.target.value = "";
                aplicarFiltrosCruzadosInterfaz();
                return;
            }

            let limpio = val.replace(/#/g, "").toUpperCase();
            e.target.value = "#" + limpio;

            aplicarFiltrosCruzadosInterfaz();
        });

        inputCodigo.addEventListener("keydown", (e) => {
            if (e.key === "Backspace" && e.target.value === "#") {
                e.target.value = "";
                setTimeout(aplicarFiltrosCruzadosInterfaz, 10);
            }
        });
    }

    // Inyectar dinámicamente las categorías del Mapeo Municipal en el filtro superior
    const selectFiltroTipo = document.getElementById("filter-tipo");
    if (selectFiltroTipo && selectFiltroTipo.children.length === 1) {
        Object.keys(MAPEO_MUNICIPAL).forEach(cat => {
            const opt = document.createElement("option");
            opt.value = cat; opt.textContent = cat;
            selectFiltroTipo.appendChild(opt);
        });
    }

    document.getElementById("filter-tipo").addEventListener("change", aplicarFiltrosCruzadosInterfaz);
    document.getElementById("filter-prioridad").addEventListener("change", aplicarFiltrosCruzadosInterfaz);
    document.getElementById("filter-fecha-desde").addEventListener("change", aplicarFiltrosCruzadosInterfaz);
    document.getElementById("filter-fecha-hasta").addEventListener("change", aplicarFiltrosCruzadosInterfaz);

    document.getElementById("btn-reset-filters").addEventListener("click", () => {
        if (inputCodigo) inputCodigo.value = "";
        document.getElementById("filter-tipo").value = "Todos";
        document.getElementById("filter-prioridad").value = "Todos";
        document.getElementById("filter-fecha-desde").value = "";
        document.getElementById("filter-fecha-hasta").value = "";
        estadoFiltroKPIActivo = "Todos";
        document.querySelectorAll(".mini-kpi-card").forEach(c => c.style.borderColor = "var(--border-color)");
        aplicarFiltrosCruzadosInterfaz();
    });

    document.querySelectorAll(".mini-kpi-card").forEach(card => {
        card.addEventListener("click", () => {
            document.querySelectorAll(".mini-kpi-card").forEach(c => c.style.borderColor = "var(--border-color)");
            const targetFilter = card.getAttribute("data-filter");
            if (estadoFiltroKPIActivo === targetFilter) { estadoFiltroKPIActivo = "Todos"; } 
            else { estadoFiltroKPIActivo = targetFilter; card.style.borderColor = "var(--sidebar-active)"; }
            aplicarFiltrosCruzadosInterfaz();
        });
    });
}

// =================================================================================
// MODAL EXCLUSIVO PARA GESTIONAR LA SOLICITUD DESDE LOS 3 PUNTITOS (ASIGNACIÓN LIBRE)
// ==============================================================================
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
        const smartTicketId = `${(sol.idVecino || "000").substring(0, 4).toUpperCase()}-${d}${m}${a}-${idSolicitud.substring(0, 3).toUpperCase()}`;

        let opcionesCategoriasHTML = `<option value="">Seleccione Categoría</option>`;
        Object.keys(MAPEO_MUNICIPAL).forEach(cat => {
            opcionesCategoriasHTML += `<option value="${cat}" ${(sol.categoria || sol.motivo) === cat ? 'selected' : ''}>${cat}</option>`;
        });

        const modalOverlay = document.createElement("div");
        modalOverlay.className = "profile-modal-overlay";

        modalOverlay.innerHTML = `
            <div class="profile-modal-card" style="max-width: 600px;">
                <div class="profile-modal-header" style="background: linear-gradient(135deg, var(--sidebar-blue), var(--primary-blue)); padding: 20px 32px;">
                    <div class="profile-header-info">
                        <h3 style="font-size: 18px; color: #fff;">Gestión de Solicitud #${smartTicketId}</h3>
                        <p style="color: rgba(255,255,255,0.8);">Vecino: ${sol.vecinoNombre || sol.nombreVecino} (RUT: ${sol.vecinoRut || sol.rutVecino})</p>
                    </div>
                    <button class="btn-profile-close" style="top: 16px; right: 16px;">&times;</button>
                </div>

                <div class="profile-modal-body" style="padding: 24px 32px; background: #fff;">
                    <div class="form-row-grid" style="margin-bottom: 14px;">
                        <div class="form-group">
                            <label>Categoría</label>
                            <select id="es-motivo">${opcionesCategoriasHTML}</select>
                        </div>
                        <div class="form-group">
                            <label>Subcategoría</label>
                            <select id="es-subcategoria"></select>
                        </div>
                    </div>

                    <div class="form-row-grid" style="margin-bottom: 14px;">
                        <div class="form-group">
                            <label>Oficina Derivada</label>
                            <input type="text" id="es-oficina" value="${sol.oficinaDerivada || ''}">
                        </div>
                        <div class="form-group">
                            <label>Personal Asignado</label>
                            <select id="es-asignado" style="font-weight: 600; color: var(--text-dark);">
                                <option value="Equipo Territorial" ${(!sol.asignadoA || sol.asignadoA === 'Equipo Territorial') ? 'selected' : ''}>Equipo Territorial</option>
                                <option value="Gonzalo Aguayo" ${sol.asignadoA === 'Gonzalo Aguayo' ? 'selected' : ''}>Gonzalo Aguayo</option>
                                <option value="Franchesca Paz" ${sol.asignadoA === 'Franchesca Paz' ? 'selected' : ''}>Franchesca Paz</option>
                                <option value="Camila Rojas" ${sol.asignadoA === 'Camila Rojas' ? 'selected' : ''}>Camila Rojas</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-row-grid" style="margin-bottom: 14px;">
                        <div class="form-group">
                            <label>Estado de la gestión</label>
                            <select id="es-estado" style="font-weight: 700; color: var(--primary-blue);">
                                <option value="Abierta" ${sol.estado === 'Abierta' ? 'selected' : ''}>Abierta / Ingresada</option>
                                <option value="En revisión" ${sol.estado === 'En revisión' ? 'selected' : ''}>En revisión</option>
                                <option value="En gestión" ${sol.estado === 'En gestión' ? 'selected' : ''}>En gestión territorial</option>
                                <option value="Finalizada" ${sol.estado === 'Finalizada' ? 'selected' : ''}>Finalizada</option>
                                <option value="Vencida" ${sol.estado === 'Vencida' ? 'selected' : ''}>Vencida / Sin solución</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Prioridad</label>
                            <select id="es-prioridad">
                                <option value="Baja" ${sol.prioridad === 'Baja' ? 'selected' : ''}>Baja</option>
                                <option value="Media" ${sol.prioridad === 'Media' ? 'selected' : ''}>Media</option>
                                <option value="Alta" ${sol.prioridad === 'Alta' ? 'selected' : ''}>Alta</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-row-grid" style="margin-bottom: 14px;">
                        <div class="form-group full-width">
                            <label>Descripción Original del Vecino</label>
                            <textarea id="es-descripcion" rows="2">${sol.descripcion || ''}</textarea>
                        </div>
                    </div>

                    <div class="form-row-grid" style="margin-bottom: 0;">
                        <div class="form-group full-width">
                            <label style="color: var(--kpi-purple);">Notas Internas de Gestión / Resoluciones</label>
                            <textarea id="es-notas-gestion" rows="3" placeholder="Registra las llamadas, correos o acciones tomadas por el equipo territorial...">${sol.notasGestion || ''}</textarea>
                        </div>
                    </div>
                </div>

                <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                    <button type="button" id="btn-modal-cancel" class="btn btn-secondary">Cancelar</button>
                    <button type="button" id="btn-modal-save" class="btn btn-primary" style="background-color: #0b438c;">Actualizar Solicitud</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);

        const eMotivo = modalOverlay.querySelector("#es-motivo");
        const eSub = modalOverlay.querySelector("#es-subcategoria");
        const eOfi = modalOverlay.querySelector("#es-oficina");

        const poblarSub = (cat, defaultVal = "") => {
            eSub.innerHTML = "";
            if (cat && MAPEO_MUNICIPAL[cat]) {
                eOfi.value = MAPEO_MUNICIPAL[cat].oficina;
                let h = `<option value="">Seleccione subcategoría</option>`;
                MAPEO_MUNICIPAL[cat].subcategorias.forEach(s => { h += `<option value="${s}" ${s === defaultVal ? 'selected' : ''}>${s}</option>`; });
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
                if (nombreAsignadoElegido.includes("Camila")) {
                    fotoEncargadoElegido = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=50";
                } else if (nombreAsignadoElegido.includes("Franchesca")) {
                    fotoEncargadoElegido = "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=50";
                } else if (nombreAsignadoElegido.includes("Gonzalo")) {
                    fotoEncargadoElegido = "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=50";
                }

                const updatePayload = {
                    motivo: eMotivo.value,
                    categoria: eMotivo.value,
                    subcategoria: eSub.value,
                    oficinaDerivada: eOfi.value.trim(),
                    asignadoA: nombreAsignadoElegido,
                    registradaPorFoto: fotoEncargadoElegido,
                    estado: modalOverlay.querySelector("#es-estado").value,
                    prioridad: modalOverlay.querySelector("#es-prioridad").value,
                    descripcion: modalOverlay.querySelector("#es-descripcion").value.trim(),
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
                btnSave.innerText = "Actualizar Solicitud";
            }
        });

    } catch (err) { console.error(err); }
}

// --- MANEJADOR DEL MODAL FLOTANTE DE INGRESO PRINCIPAL (SISTEMA DE UN SOLO PASO ADAPTADO CON CORRECCIÓN EMBAJADA) ---
function inicializarManejadorModalIngreso() {
    const modalIngreso = document.getElementById("modal-ingreso-vecino");
    // 🎯 IDENTIFICADOR CORREGIDO UNIFICADO: Escucha con exactitud el gatillo de la barra de filtros del HTML
    const btnAbrirModal = document.getElementById("btn-trigger-new-solicitud");
    const btnCerrarIngreso = document.getElementById("btn-cerrar-ingreso");
    const btnLimpiarIngreso = document.getElementById("btn-limpiar-ingreso");
    const btnGuardarVecino = document.getElementById("btn-guardar-vecino");
    const inputRutIngreso = document.getElementById("vecino-rut");
    const formVecino = document.getElementById("form-vecino");

    const sMotivo = document.getElementById("solicitud-motivo");
    const sSub = document.getElementById("solicitud-subcategoria");
    const sOficina = document.getElementById("solicitud-oficina");

    // ELEMENTOS DE LA CONSOLA DE TRIAGE TÉCNICO INTERACTIVO DIRECTO (PASO ÚNICO EN CALIENTE)
    const modalTriage = document.getElementById("modal-registro-solicitud-triage");
    const trRut = document.getElementById("tr-rut");
    const trNombre = document.getElementById("tr-nombre");
    const trCategoria = document.getElementById("tr-categoria");
    const trSubcategoria = document.getElementById("tr-subcategoria");
    const trOficina = document.getElementById("tr-oficina");
    const btnGuardarSolicitudFinal = document.getElementById("btn-guardar-solicitud-final");
    const btnLimpiarTriage = document.getElementById("btn-limpiar-triage");

    // ELEMENTOS DEL FORMULARIO TERRITORIAL
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
            if (v && MAPEO_MUNICIPAL[v]) {
                sOficina.value = MAPEO_MUNICIPAL[v].oficina;
                let h = `<option value="">Seleccione subcategoría</option>`;
                MAPEO_MUNICIPAL[v].subcategorias.forEach(s => { h += `<option value="${s}">${s}</option>`; });
                sSub.innerHTML = h; sSub.disabled = false;
            } else { sSub.innerHTML = `<option value="">Seleccione categoría</option>`; sSub.disabled = true; }
        });
    }

    // Lógica de Cascada Territorial Dinámica Activa
    if (sSectorTerritorial && sUnidadVecinal && sJuntaVecinos) {
        sSectorTerritorial.addEventListener("change", (e) => {
            const sector = e.target.value;
            sUnidadVecinal.innerHTML = '<option value="">Seleccione UV</option>';
            sJuntaVecinos.innerHTML = '<option value="">Seleccione Junta</option>';
            sJuntaVecinos.disabled = true;

            if (sector && MAPEO_TERRITORIAL[sector]) {
                MAPEO_TERRITORIAL[sector].uvs.forEach(uv => {
                    sUnidadVecinal.innerHTML += `<option value="${uv}">${uv}</option>`;
                });
                sUnidadVecinal.disabled = false;
            } else {
                sUnidadVecinal.disabled = true;
            }
        });

        sUnidadVecinal.addEventListener("change", (e) => {
            const sector = sSectorTerritorial.value;
            const uv = e.target.value;
            sJuntaVecinos.innerHTML = '<option value="">Seleccione Junta</option>';

            if (sector && uv && MAPEO_TERRITORIAL[sector]?.juntas[uv]) {
                MAPEO_TERRITORIAL[sector].juntas[uv].forEach(junta => {
                    sJuntaVecinos.innerHTML += `<option value="${junta}">${junta}</option>`;
                });
                sJuntaVecinos.disabled = false;
            } else {
                sJuntaVecinos.disabled = true;
            }
        });
    }

    // 🔥 VÍNCULO DIRECTO: Levanta INMEDIATAMENTE la consola de triage al hacer clic
    if (btnAbrirModal && modalTriage) {
        btnAbrirModal.addEventListener("click", () => {
            if (trRut) trRut.value = "";
            if (trNombre) { trNombre.value = "Esperando RUN..."; trNombre.style.color = "#64748b"; }
            if (trCategoria) trCategoria.value = "";
            if (trOficina) trOficina.value = "";
            if (trSubcategoria) { trSubcategoria.innerHTML = '<option value="">Seleccione primero categoría...</option>'; trSubcategoria.disabled = true; }
            document.getElementById("tr-prioridad").value = "Media";
            document.getElementById("tr-descripcion").value = "";
            if (btnGuardarSolicitudFinal) btnGuardarSolicitudFinal.disabled = true;

            modalTriage.style.display = "flex";
            if (trRut) trRut.focus();
        });
    }

    // Función asíncrona dedicada a validar el RUN ingresado contra la colección de vecinos
    const comprobarIdentidadVecinoTriage = async (rutTipeado, esBlur = false) => {
        if (!rutTipeado) return;
        const raw = rutTipeado.replace(/[^0-9kK]/g, "").toUpperCase();
        
        // Bloque de escape silencioso si el operador está digitando caracteres parciales
        if (raw.length < 8) {
            vDataActual = null;
            if (trNombre) { trNombre.value = "Esperando RUN..."; trNombre.style.color = "#64748b"; }
            if (btnGuardarSolicitudFinal) btnGuardarSolicitudFinal.disabled = true;
            return;
        }

        const formatB = raw.length > 1 ? (raw.slice(0, -1) + "-" + raw.slice(-1)) : raw;

        try {
            const q = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID), where("rut", "in", [raw, formatB, rutTipeado]));
            const snap = await getDocs(q);

            if (!snap.empty) {
                const vecinoDoc = snap.docs[0];
                vDataActual = { id: vecinoDoc.id, ...vecinoDoc.data() };
                if (trNombre) {
                    trNombre.value = "✓ " + vDataActual.nombreCompleto;
                    trNombre.style.color = "#059669"; // Verde esmeralda éxito
                }
                if (btnGuardarSolicitudFinal) btnGuardarSolicitudFinal.disabled = false;
            } else {
                vDataActual = null;
                if (trNombre) {
                    trNombre.value = "✗ Vecino no registrado";
                    trNombre.style.color = "#ef4444"; // Rojo error de validación
                }
                if (btnGuardarSolicitudFinal) btnGuardarSolicitudFinal.disabled = true;
                
                // 🚀 DISPARO SELECTIVO: Alerta premium estilizada únicamente gatillada en el evento blur de salida
                if (esBlur) {
                    mostrarAlertaPersonalizada("Atención: El RUT ingresado no figura en el padrón vecinal. Por favor, registre al vecino en el módulo 'Vecinos' antes de emitir una solicitud técnica oficial.", "error");
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
            if (value.length > 1) { 
                e.target.value = value.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + value.slice(-1).toUpperCase(); 
            } else { 
                e.target.value = value.toUpperCase(); 
            }
            // Validación silenciosa mientras el operador escribe
            await comprobarIdentidadVecinoTriage(e.target.value, false);
        });

        trRut.addEventListener("blur", async (e) => {
            // Validación estricta con modal estructurado al salir de la casilla
            await comprobarIdentidadVecinoTriage(e.target.value, true);
        });
    }

    // --- DINÁMICA DE CASCADA MUNICIPAL EN LA CONSOLA DE TRIAGE ---
    if (trCategoria && trSubcategoria && trOficina) {
        trCategoria.innerHTML = '<option value="">Seleccione Categoría...</option>';
        Object.keys(MAPEO_MUNICIPAL).forEach(cat => {
            const opt = document.createElement("option");
            opt.value = cat; opt.textContent = cat;
            trCategoria.appendChild(opt);
        });

        trCategoria.onchange = (e) => {
            const cat = e.target.value;
            trSubcategoria.innerHTML = '<option value="">Seleccione subcategoría...</option>';
            trOficina.value = "";
            
            if (cat && MAPEO_MUNICIPAL[cat]) {
                trOficina.value = MAPEO_MUNICIPAL[cat].oficina;
                MAPEO_MUNICIPAL[cat].subcategorias.forEach(s => {
                    const opt = document.createElement("option");
                    opt.value = s; opt.textContent = s;
                    trSubcategoria.appendChild(opt);
                });
                trSubcategoria.disabled = false;
            } else {
                trSubcategoria.disabled = true;
            }
        };
    }

    // Escuchadores de cierre e interactividad de la Consola Técnica
    document.querySelectorAll(".close-triage").forEach(btn => {
        btn.onclick = () => { if (modalTriage) modalTriage.style.display = "none"; };
    });

    if (btnLimpiarTriage) {
        btnLimpiarTriage.onclick = () => {
            if (trCategoria) trCategoria.value = "";
            if (trOficina) trOficina.value = "";
            if (trSubcategoria) { trSubcategoria.innerHTML = '<option value="">Seleccione primero categoría...</option>'; trSubcategoria.disabled = true; }
            document.getElementById("tr-prioridad").value = "Media";
            document.getElementById("tr-descripcion").value = "";
        };
    }

    // --- GUARDADO DEFINITIVO DE LA CONSOLA DE TRIAGE HACIA LA NUBE ---
    if (btnGuardarSolicitudFinal) {
        btnGuardarSolicitudFinal.onclick = async () => {
            const cat = trCategoria.value;
            const sub = trSubcategoria.value;
            const prio = document.getElementById("tr-prioridad").value;
            const desc = document.getElementById("tr-descripcion").value.trim();

            if (!cat || !sub || !vDataActual) { 
                alert("Por favor complete los campos obligatorios (*) antes de realizar el despacho."); 
                return; 
            }

            btnGuardarSolicitudFinal.disabled = true;
            btnGuardarSolicitudFinal.innerText = "Registrando...";

            try {
                const currentUser = auth.currentUser;
                const loggedName = currentUser ? (currentUser.displayName || currentUser.email) : "Equipo Territorial";
                const loggedPhoto = currentUser?.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=50";

                const payload = {
                    tenantId: CURRENT_TENANT_ID,
                    idVecino: vDataActual.id,
                    vecinoNombre: vDataActual.nombreCompleto,
                    nombreVecino: vDataActual.nombreCompleto, 
                    vecinoRut: vDataActual.rut,
                    rutVecino: vDataActual.rut,
                    vecinoDireccion: vDataActual.direccion || "S/R",
                    categoria: cat,
                    motivo: cat,
                    subcategoria: sub,
                    oficinaDerivada: trOficina.value,
                    prioridad: prio,
                    descripcion: desc,
                    estado: "Abierta",
                    origen: "Registro Manual Interno",
                    fechaCreacion: serverTimestamp(),
                    registradaPorNombre: loggedName,
                    registradaPorFoto: loggedPhoto,
                    asignadoA: loggedName,
                    adjuntos: []
                };

                await addDoc(collection(db, "solicitudes"), payload);
                if (modalTriage) modalTriage.style.display = "none";
                
                mostrarAlertaPersonalizada(`¡Excelente! Solicitud técnica archivada con éxito para el vecino ${vDataActual.nombreCompleto}.`, "success");
                
                if (document.getElementById("form-nueva-solicitud")) document.getElementById("form-nueva-solicitud").reset();
                if (trSubcategoria) trSubcategoria.disabled = true;

                renderizarMetricasServidor();
                await ejecutarMotorCargaSolicitudes();
            } catch (err) {
                console.error("Error crítico al despachar solicitud manual:", err);
            } finally {
                btnGuardarSolicitudFinal.disabled = false;
                btnGuardarSolicitudFinal.innerText = "Registrar Solicitud";
            }
        };
    }

    if (btnCerrarIngreso && modalIngreso) { btnCerrarIngreso.addEventListener("click", cerrarYLimpiar); }
    
    if (btnLimpiarIngreso) { 
        btnLimpiarIngreso.addEventListener("click", () => {
            const rutActualPreservado = inputRutIngreso ? inputRutIngreso.value : "";
            if (formVecino) formVecino.reset();
            if (sSub) { sSub.innerHTML = `<option value="">Seleccione categoría</option>`; sSub.disabled = true; }
            resetCascadaTerritorial();
            if (inputRutIngreso && rutActualPreservado) {
                inputRutIngreso.value = rutActualPreservado;
                if (btnGuardarVecino) btnGuardarVecino.disabled = false;
            }
            archivoFotoSeleccionado = null; archivoDocSeleccionado = null;
            mostrarAlertaPersonalizada("Formulario vaciado con éxito.", "info");
        }); 
    }

    window.addEventListener("click", (e) => {
        if (e.target === modalIngreso) { cerrarYLimpiar(); }
        if (e.target === modalTriage) modalTriage.style.display = "none";
    });

    if (modalIngreso) {
        const tabItems = modalIngreso.querySelectorAll(".tab-item");
        tabItems.forEach((tab) => {
            tab.addEventListener("click", () => {
                tabItems.forEach((item) => item.classList.remove("active")); tab.classList.add("active");
                const targetId = tab.getAttribute("data-target");
                if (targetId) {
                    modalIngreso.querySelectorAll(".profile-panel").forEach(p => p.classList.remove("active"));
                    modalIngreso.querySelector(`#${targetId}`)?.classList.add("active");
                }
            });
        });
    }

    if (inputRutIngreso && btnGuardarVecino) {
        inputRutIngreso.addEventListener("input", (e) => {
            btnGuardarVecino.disabled = true;
            let value = e.target.value.replace(/[^0-9kK]/g, '');
            if (value.length > 1) { e.target.value = value.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + value.slice(-1).toUpperCase(); }
            else { e.target.value = value.toUpperCase(); }
        });

        inputRutIngreso.addEventListener("blur", () => {
            setTimeout(async () => {
                if (estaGuardando) return;
                const rutIngresado = inputRutIngreso.value.trim(); if (!rutIngresado) return;
                const raw = rutIngresado.replace(/[^0-9kK]/g, "").toUpperCase();
                const formatB = raw.length > 1 ? (raw.slice(0, -1) + "-" + raw.slice(-1)) : raw;

                try {
                    const snapExistente = await getDocs(query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID), where("rut", "in", [raw, formatB, rutIngresado])));
                    if (!snapExistente.empty) {
                        const vEncontrado = snapExistente.docs[0];
                        cerrarYLimpiar();
                        mostrarAlertaPersonalizada(`El RUT ingresado ya figura a nombre de: ${vEncontrado.data().nombreCompleto}. Abriendo expediente...`, "info");
                        await abrirEditorVecino(vEncontrado.id);
                    } else {
                        btnGuardarVecino.disabled = false;
                    }
                } catch (err) { console.error(err); }
            }, 250);
        });
    }

    if (btnGuardarVecino) {
        btnGuardarVecino.addEventListener("click", async (e) => {
            e.preventDefault();
            const nom = document.getElementById("vecino-nombre")?.value.trim() || "";
            const rut = inputRutIngreso.value.trim() || "";
            const cat = sMotivo.value; const sub = sSub.value; const ofi = sOficina.value;
            const prioridad = document.getElementById("solicitud-prioridad")?.value || "";
            const descripcion = document.getElementById("solicitud-descripcion")?.value.trim() || "";

            if (!nom) {
                mostrarAlertaPersonalizada("El campo 'Nombre completo' es un requerimiento obligatorio para generar el expediente.", "error");
                document.getElementById("vecino-nombre").focus();
                return;
            }
            if (!rut) {
                mostrarAlertaPersonalizada("El campo 'RUT del vecino' es obligatorio.", "error");
                inputRutIngreso.focus();
                return;
            }

            estaGuardando = true; 
            btnGuardarVecino.disabled = true;
            btnGuardarVecino.innerText = "Sincronizando...";

            try {
                const vecinoData = { 
                    nombreCompleto: nom, 
                    rut: rut, 
                    telefono: document.getElementById("vecino-telefono").value.trim(), 
                    sectorTerritorial: sSectorTerritorial ? sSectorTerritorial.value : "Sin Información",
                    unidadVecinal: sUnidadVecinal ? sUnidadVecinal.value : "Sin Información",
                    juntaVecinos: sJuntaVecinos ? sJuntaVecinos.value : "Sin Información",
                    barrioPopular: inputBarrioPopular ? inputBarrioPopular.value.trim() : "Sin Información",
                    tenantId: CURRENT_TENANT_ID, 
                    fechaRegistro: serverTimestamp() 
                };

                const docRefVecino = await addDoc(collection(db, "vecinos"), vecinoData);

                if (cat) {
                    const currentUser = auth.currentUser;
                    const loggedName = currentUser ? (currentUser.displayName || currentUser.email) : "Equipo Territorial";
                    const loggedPhoto = currentUser?.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=50";

                    await addDoc(collection(db, "solicitudes"), {
                        idVecino: docRefVecino.id, 
                        nombreVecino: nom, 
                        vecinoNombre: nom,
                        rutVecino: rut, 
                        vecinoRut: rut,
                        vecinoDireccion: vecinoData.direccion || "S/R",
                        motivo: cat, 
                        categoria: cat,
                        subcategoria: sub, 
                        oficinaDerivada: ofi, 
                        prioridad, 
                        descripcion, 
                        estado: "Abierta", 
                        fechaCreacion: serverTimestamp(),
                        tenantId: CURRENT_TENANT_ID, 
                        registradaPorNombre: loggedName,
                        registradaPorFoto: loggedPhoto,
                        asignadoA: loggedName,
                        origen: "Registro Manual Interno Limited",
                        adjuntos: []
                    });
                }

                cerrarYLimpiar();
                mostrarAlertaPersonalizada("Vecino e Inteligencia Territorial ingresados con éxito.", "success");
                await ejecutarMotorCargaSolicitudes();
            } catch (err) { 
                console.error(err); 
            } finally { 
                estaGuardando = false; 
                btnGuardarVecino.disabled = false;
                btnGuardarVecino.innerText = "Guardar vecino";
            }
        });
    }
}