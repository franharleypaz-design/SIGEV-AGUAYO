// ==============================================================================
// SIGEV-AGUAYO - MOTOR CONTROLADOR DEL PADRÓN DE VECINOS Y EXPEDIENTES
// ==============================================================================
import { auth, db, app } from "./app.js";
import { 
    collection, getDocs, doc, getDoc, query, where, addDoc, updateDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { inyectarEstructuraGlobal, actualizarPerfilLayout } from "./layout.js";
import { MAPEO_MUNICIPAL, MAPEO_TERRITORIAL } from "./mapeoMunicipal.js";

const storage = getStorage(app);
let vecinosMemory = [];
let solicitudesMemory = []; // Caché global para cruce instantáneo de expedientes
const hoverCard = document.getElementById("vecino-hover-card");

// ARQUITECTURA TENANT: Identificador maestro de aislamiento corporativo
const subdominioDetectado = window.location.hostname.split('.')[0];
const CURRENT_TENANT_ID = (subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado;

const ETIQUETAS_SECTORES = {
    "Sector Territorial 1": "Sector Territorial 1 (UV 1)",
    "Sector Territorial 2": "Sector Territorial 2 (UV 2-3)",
    "Sector Territorial 3": "Sector Territorial 3 (UV 4-5)",
    "Sector Territorial 4": "Sector Territorial 4 (UV 14-15)",
    "Sector Territorial 5": "Sector Territorial 5 (UV 16-17)",
    "Sector Territorial 6": "Sector Territorial 6 (UV 18)",
    "Sin Información": "Sin Información",
    "No Sabe / Sin Información": "No Sabe / Sin Información"
};

inyectarEstructuraGlobal();

auth.onAuthStateChanged(async (user) => {
    if (user) {
        actualizarPerfilLayout(user);
        await cargarDatosFirebase();
        inicializarComponentesVecinos();
        // 🚀 GATILLO DE TRIAGE: Verificación cruzada instantánea al llegar desde el Buzón Ciudadano
        await verificarYFocalizarExpedienteDesdeBuzon();
    }
});

// --- MOTOR DE ALERTAS PREMIUM (CON SOPORTE CALLBACK) ---
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
    } else if (tipo === "info") {
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        titleText = "Sincronización Territorial";
        iconStyles = "background-color: rgba(37, 99, 235, 0.1); color: #2563eb;";
    } else {
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="12" x2="12" y2="16"></line></svg>`;
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

// ==============================================================================
// 🔍 CONSOLA DE VERIFICACIÓN CON MODAL Y FORMATO ESPEJO DE DONACIONES
// ==============================================================================
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

        // --- FLUJO COMPLETO EN TIEMPO REAL AL SALIR DE LA CASILLA DE RUN ---
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
                    
                    // Si existe, esperamos un breve delay estético y abre de inmediato su expediente digital
                    setTimeout(() => {
                        overlayVerify.remove();
                        mostrarAlertaPersonalizada(`Vecino localizado en el padrón: ${vecinoDoc.data().nombreCompleto}. Abriendo expediente permanente...`, "info", () => {
                            abrirConsolaAltaAvanzadaVecinoCompleto(vecinoDoc.id, vecinoDoc.data());
                        });
                    }, 500);

                } else {
                    if (inputNombreStatus) inputNombreStatus.value = "No encontrado";
                    
                    // Si no existe, avisa y levanta el formulario avanzado macro
                    setTimeout(() => {
                        overlayVerify.remove();
                        mostrarAlertaPersonalizada(
                            "El RUT ingresado no figura en el padrón. Se abrirá la ficha de registro territorial avanzado para dar de alta al nuevo vecino.",
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

    // Botón de respaldo por si el usuario prefiere hacer clic manual en vez de gatillar el blur
    btnEjecutar.onclick = () => {
        if (inputRut) inputRut.blur();
    };

    overlayVerify.querySelector(".btn-cancelar-verify").onclick = () => overlayVerify.remove();
    overlayVerify.querySelector(".btn-cerrar-verify-x").onclick = () => overlayVerify.remove();
}

// --- CONSOLA MAESTRA GRANDE: FORMULARIO AVANZADO COMPLETO CON MAPA Y CASCADAS ---
function abrirConsolaAltaAvanzadaVecinoCompleto(idVecino = null, dataExistente = {}) {
    const overlayAvanzado = document.createElement("div");
    overlayAvanzado.className = "profile-modal-overlay";
    overlayAvanzado.style.zIndex = "1550";

    let opcionesSectoresHTML = `<option value="">Seleccione Sector</option>`;
    Object.keys(MAPEO_TERRITORIAL).forEach(sec => {
        opcionesSectoresHTML += `<option value="${sec}" ${dataExistente.sectorTerritorial === sec ? 'selected' : ''}>${ETIQUETAS_SECTORES[sec] || sec}</option>`;
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
        solicitadasFiltradas.forEach(sol => {
            solicitudesRenderHTML += `<div style="padding:12px; background:#f8fafc; border:1px solid var(--border-color); border-radius:6px; margin-bottom:8px; font-size:12.5px; color:var(--text-dark);"><b style="color:var(--primary-blue);">#Ticket - ${sol.motivo}</b> (${sol.estado})<br><span style="font-size:11px; color:var(--text-light);">${sol.descripcion || ''}</span></div>`;
        });
        if (solicitudesFiltradas.length === 0) {
            solicitudesRenderHTML = `<div class="no-data-placeholder"><p>Este vecino no registra requerimientos territoriales históricos.</p></div>`;
        }
    } else {
        solicitudesRenderHTML = `<div class="no-data-placeholder"><p>Las solicitudes históricas se desplegarán una vez consolidado el alta del vecino.</p></div>`;
    }

    overlayAvanzado.innerHTML = `
        <div class="profile-modal-card" style="max-width: 760px; width: 95%;">
            <div class="profile-modal-header" style="background-color: #0b438c; padding: 20px 32px;">
                <div class="profile-header-info">
                    <h3 style="font-size: 18px; color: #fff; font-weight: 700; margin: 0;">${idVecino ? 'Modificando Expediente' : 'Ingreso de Nuevo Vecino'}</h3>
                    <p style="color: rgba(255,255,255,0.8); font-weight: 500; margin: 4px 0 0 0;">SIGEV-AGUAYO - Formulario de Registro Territorial Avanzado</p>
                </div>
                <button class="btn-profile-close btn-close-avanzado" style="top: 16px; right: 16px; color:#fff; font-size:24px;">&times;</button>
            </div>
            
            <div class="profile-modal-tabs" style="padding: 0 32px; background: #fff; border-bottom: 1px solid var(--border-color);">
                <div class="profile-tab active" data-target="v-panel-basicos">Datos Básicos</div>
                <div class="profile-tab" data-target="v-panel-solicitudes">Solicitudes</div>
                <div class="profile-tab" data-target="v-panel-avanzados">Datos Avanzados</div>
                <div class="profile-tab" data-target="v-panel-adicional">Info Adicional</div>
                <div class="profile-tab" data-target="v-panel-documentos">Documentos</div>
            </div>

            <div class="profile-modal-body" style="padding: 24px 32px; background: #fff; max-height: 480px; overflow-y: auto;">
                <form id="form-alta-avanzada-vecino">
                    
                    <div class="profile-panel active" id="v-panel-basicos">
                        <div style="display: flex; gap: 20px; margin-bottom: 16px; flex-wrap: wrap;">
                            <div style="width: 140px; height: 140px; border: 2px dashed #cbd5e1; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #64748b; font-size: 11px; text-align: center; padding: 10px; background: #f8fafc;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom:6px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                                <b>Subir foto</b><br>PNG, JPG hasta 5MB
                            </div>
                            <div style="flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; min-width: 280px;">
                                <div class="form-group"><label>RUT *</label><input type="text" id="v-rut" value="${dataExistente.rut || ''}" readonly style="background-color: #f1f5f9; cursor: not-allowed; font-weight: 700;"></div>
                                <div class="form-group"><label>Nombre completo *</label><input type="text" id="v-nombre" value="${dataExistente.nombreCompleto || ''}" placeholder="Ej. Juan Pérez" required></div>
                                <div class="form-group"><label>Teléfono</label><input type="text" id="v-telefono" value="${dataExistente.telefono && dataExistente.telefono !== 'No registrado' && dataExistente.telefono !== 'S/R' ? dataExistente.telefono : ''}" placeholder="Ej. +56 9 1234 5678"></div>
                                <div class="form-group"><label>Fecha de nacimiento</label><input type="date" id="v-nacimiento" value="${dataExistente.fechaNacimiento || ''}"></div>
                            </div>
                        </div>
                        <div class="form-row-grid" style="margin-bottom: 16px;">
                            <div class="form-group full-width"><label>Correo electrónico</label><input type="email" id="v-correo" value="${dataExistente.correo || ''}" placeholder="ej. juan@email.com"></div>
                        </div>
                        <div class="form-row-grid" style="margin-bottom: 16px;">
                            <div class="form-group full-width"><label>Dirección</label><input type="text" id="v-direccion" value="${dataExistente.direccion && dataExistente.direccion !== 'No registrada' ? dataExistente.direccion : ''}" placeholder="Ej. Av. Lo Ovalle 1234"></div>
                        </div>
                        
                        <div class="form-row-grid" style="margin-bottom: 16px;">
                            <div class="form-group full-width">
                                <label style="font-weight: 700; color: #0b438c;">📍 Ubicación Cartográfica (Haz clic para fijar la casa en el mapa)</label>
                                <div id="v-mini-mapa-picker" style="width: 100%; height: 210px; border: 1px solid #cbd5e1; border-radius: 6px; margin-top: 6px; z-index: 10;"></div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px;">
                                    <div><label style="font-size: 11px; color: #64748b;">Latitud</label><input type="text" id="v-lat" value="${dataExistente.lat || ''}" readonly style="background-color: #f1f5f9; font-size: 12px; font-family: monospace;"></div>
                                    <div><label style="font-size: 11px; color: #64748b;">Longitud</label><input type="text" id="v-lng" value="${dataExistente.lng || ''}" readonly style="background-color: #f1f5f9; font-size: 12px; font-family: monospace;"></div>
                                </div>
                            </div>
                        </div>

                        <div class="form-row-grid" style="margin-bottom: 16px;">
                            <div class="form-group"><label>Sector Territorial</label><select id="v-sector">${opcionesSectoresHTML}</select></div>
                            <div class="form-group"><label>Unidad Vecinal (UV)</label><select id="v-uv" ${idVecino ? '' : 'disabled'}>${opcionesUvsHTML}</select></div>
                        </div>
                        <div class="form-row-grid" style="margin-bottom: 0;">
                            <div class="form-group"><label>Junta de Vecinos</label><select id="v-junta" ${idVecino ? '' : 'disabled'}>${opcionesJuntasHTML}</select></div>
                            <div class="form-group"><label>Sector / Barrio Popular (Reconocimiento manual)</label><input type="text" id="v-barrio" value="${dataExistente.barrioPopular && dataExistente.barrioPopular !== 'Sin Información' ? dataExistente.barrioPopular : ''}" placeholder="Ej. El Parrón, Villa Los Troncos..."></div>
                        </div>
                    </div>

                    <div class="profile-panel" id="v-panel-solicitudes">
                        ${solicitudesRenderHTML}
                    </div>

                    <div class="profile-panel" id="v-panel-avanzados">
                        <div class="form-row-grid"><div class="form-group full-width"><label>Ocupación / Oficio</label><input type="text" id="v-ocupacion" value="${dataExistente.ocupacion || ''}" placeholder="Ej: Carpintero, Asesora del hogar..."></div></div>
                    </div>

                    <div class="profile-panel" id="v-panel-adicional">
                        <div class="form-row-grid"><div class="form-group full-width"><label>Observaciones Críticas de Terreno</label><textarea id="v-observaciones" rows="4" placeholder="Detalles de vulnerabilidad territorial...">${dataExistente.observaciones || ''}</textarea></div></div>
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

    // --- INSTANCIACIÓN DE MAPA EN SEGUNDO PLANO SEGURO ---
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

                const consultaGeocoding = `${direccionTexto}, La Cisterna, Region Metropolitana, Chile`;

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
                    }
                } catch (err) {
                    console.error(err);
                }
            });
        }

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

        if (sector && MAPEO_TERRITORIAL[sector]) {
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

        btnGuardar.disabled = true;
        btnGuardar.innerText = "Sincronizando...";

        const latVal = overlayAvanzado.querySelector("#v-lat").value;
        const lngVal = overlayAvanzado.querySelector("#v-lng").value;

        try {
            const payload = {
                nombreCompleto: nombreV,
                rut: dataExistente.rut,
                telefono: overlayAvanzado.querySelector("#v-telefono").value.trim() || "No registrado",
                fechaNacimiento: overlayAvanzado.querySelector("#v-nacimiento").value || "",
                correo: overlayAvanzado.querySelector("#v-correo").value.trim() || "",
                direccion: overlayAvanzado.querySelector("#v-direccion").value.trim() || "No registrada",
                lat: latVal ? Number(latVal) : "", 
                lng: lngVal ? Number(lngVal) : "", 
                sectorTerritorial: sSector.value || "No Sabe / Sin Información",
                unidadVecinal: sUv.value || "Sin Información",
                juntaVecinos: sJunta.value || "Sin Información",
                barrioPopular: overlayAvanzado.querySelector("#v-barrio").value.trim() || "Sin Información",
                ocupacion: overlayAvanzado.querySelector("#v-ocupacion").value.trim() || "",
                observaciones: overlayAvanzado.querySelector("#v-observaciones").value.trim() || "",
                tenantId: CURRENT_TENANT_ID
            };

            if (idVecino) {
                await updateDoc(doc(db, "vecinos", idVecino), payload);
                mostrarAlertaPersonalizada("Expediente territorial actualizado con éxito.", "success");
            } else {
                payload.fechaIncremento = serverTimestamp();
                payload.fotoPerfil = "";
                await addDoc(collection(db, "vecinos"), payload);
                mostrarAlertaPersonalizada(`Vecino ${nombreV} incorporado al padrón de la comuna.`, "success");
            }

            overlayAvanzado.remove();
            await cargarDatosFirebase();
            aplicarFiltrosVecinos();
        } catch (err) {
            console.error(err);
            btnGuardar.disabled = false;
            btnGuardar.innerText = "Guardar vecino";
        }
    };
}

async function cargarDatosFirebase() {
    try {
        const qVecinos = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID));
        const qSolicitudes = query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID));

        const [snapVecinos, snapSolicitudes] = await Promise.all([
            getDocs(qVecinos),
            getDocs(qSolicitudes)
        ]);

        vecinosMemory = [];
        snapVecinos.forEach(vDoc => {
            vecinosMemory.push({ id: vDoc.id, ...vDoc.data() });
        });

        solicitudesMemory = [];
        snapSolicitudes.forEach(sDoc => {
            solicitudesMemory.push({ id: sDoc.id, ...sDoc.data() });
        });
    } catch (error) {
        console.error("Error cargando base de datos territorial:", error);
    }
}

function inicializarComponentesVecinos() {
    document.getElementById("filter-vecino-busqueda").addEventListener("input", aplicarFiltrosVecinos);
    document.getElementById("filter-vecino-sector").addEventListener("change", aplicarFiltrosVecinos);
    document.getElementById("filter-vecino-uv").addEventListener("input", aplicarFiltrosVecinos);
    
    const btnToggleMobile = document.getElementById("btn-toggle-filters-mobile");
    if (btnToggleMobile) {
        btnToggleMobile.addEventListener("click", () => {
            const panelCard = btnToggleMobile.closest(".filter-panel-card");
            if (panelCard) panelCard.classList.toggle("filters-expanded");
        });
    }

    document.getElementById("btn-reset-filters-vecinos").addEventListener("click", () => {
        document.getElementById("filter-vecino-busqueda").value = "";
        document.getElementById("filter-vecino-sector").value = "Todos";
        document.getElementById("filter-vecino-uv").value = "";
        aplicarFiltrosVecinos();
    });

    const btnNuevo = document.getElementById("btn-trigger-nuevo-vecino-modulo");
    if (btnNuevo) {
        btnNuevo.addEventListener("click", (e) => {
            e.preventDefault();
            abrirConsolaVerificacionRutVecino();
        });
    }

    const modalSVecino = document.getElementById("modal-solicitudes-vecino");
    if (modalSVecino) {
        document.getElementById("btn-cerrar-modal-s-vecino").addEventListener("click", () => modalSVecino.style.display = "none");
        document.getElementById("btn-ok-modal-s-vecino").addEventListener("click", () => modalSVecino.style.display = "none");
        window.addEventListener("click", (e) => { if (e.target === modalSVecino) modalSVecino.style.display = "none"; });
    }

    aplicarFiltrosVecinos();
}

function aplicarFiltrosVecinos() {
    const busqueda = document.getElementById("filter-vecino-busqueda").value.toLowerCase();
    const sector = document.getElementById("filter-vecino-sector").value;
    const uv = document.getElementById("filter-vecino-uv").value.trim();

    let filtrados = vecinosMemory.filter(v => {
        const coincideBusqueda = !busqueda || 
            v.nombreCompleto?.toLowerCase().includes(busqueda) || 
            v.rut?.toLowerCase().includes(busqueda) || 
            v.telefono?.includes(busqueda);
            
        const coincideSector = (sector === "Todos") || (v.sectorTerritorial === sector);
        const coincideUv = !uv || String(v.unidadVecinal).includes(uv);

        return coincideBusqueda && coincideSector && coincideUv;
    });

    renderizarTablaVecinos(filtrados);
}

function renderizarTablaVecinos(lista) {
    const tbody = document.querySelector("#tabla-global-vecinos tbody");
    if (!tbody) return;

    let html = "";
    lista.forEach(v => {
        const fotoSrc = v.fotoPerfil || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100";
        let sectorVisual = v.sectorTerritorial || "Sin Información";
        if (v.barrioPopular && v.barrioPopular !== "Sin Información" && v.barrioPopular !== "") {
            sectorVisual = `${sectorVisual} - ${v.barrioPopular}`;
        }
        
        const uvVisual = v.unidadVecinal || "S/I";
        const solicitudesActivas = solicitudesMemory.filter(s => {
            if (!s.rutVecino || !v.rut) return false;
            return s.rutVecino.replace(/[^0-9kK]/g, "").toUpperCase() === v.rut.replace(/[^0-9kK]/g, "").toUpperCase() && 
                   !["completada", "cerrada", "finalizada", "rechazada"].includes(s.estado?.toLowerCase() || "");
        });

        const totalActivas = solicitudesActivas.length;
        let botonSolicitudes = totalActivas > 0 ? 
            `<button class="btn-ver-solicitudes-badge" data-id="${v.id}" style="background: rgba(234, 88, 12, 0.1); color: #ea580c; padding: 5px 14px; font-size: 11.5px; font-weight: 700; border-radius: 20px; border: 1px solid rgba(234, 88, 12, 0.25); cursor: pointer; min-width: 85px;">${totalActivas} activas</button>` :
            `<button class="btn-ver-solicitudes-badge" data-id="${v.id}" style="background: rgba(100, 116, 139, 0.08); color: #64748b; padding: 5px 14px; font-size: 11.5px; font-weight: 600; border-radius: 20px; border: 1px solid rgba(100, 116, 139, 0.15); cursor: pointer; min-width: 85px;">Ninguna</button>`;

        html += `
            <tr>
                <td>
                    <div class="table-user-cell user-hover-trigger" data-id="${v.id}" style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                        <img src="${fotoSrc}" class="table-user-avatar" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0;">
                        <div>
                            <span style="display:block; font-weight:700; color:var(--text-dark); font-size:13px;">${v.nombreCompleto}</span>
                            <span style="font-size:11px; color:var(--text-light); font-weight:600;">#${v.id.substring(0,6).toUpperCase()}</span>
                        </div>
                    </div>
                </td>
                <td style="font-weight:600; font-size:12.5px; white-space:nowrap;">${v.rut}</td>
                <td style="white-space:nowrap; font-weight:500;">${v.telefono || "S/R"}</td>
                <td style="font-size:12.5px; color:var(--text-dark); font-weight:500;">${sectorVisual}</td>
                <td style="text-align:center; font-weight:700; color:var(--primary-blue);">${uvVisual}</td>
                <td style="text-align:center;">${botonSolicitudes}</td>
                <td>
                    <div style="display: flex; justify-content: center; gap: 6px;">
                        <button class="btn-accion-v v-edit" data-id="${v.id}" title="Editar expediente">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
    });

    tbody.innerHTML = html || `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-light);">No se registran vecinos bajo este filtro.</td></tr>`;
    document.getElementById("pag-info-vecinos").innerText = `Mostrando 1 a ${lista.length} de ${lista.length} vecinos registrados`;

    configurarManejadoresHoverYBotones();
}

function abrirModalSolicitudesVecino(idVecino) {
    const vecino = vecinosMemory.find(v => v.id === idVecino);
    if (!vecino) return;

    document.getElementById("msv-titulo").innerText = `Solicitudes Activas: ${vecino.nombreCompleto}`;
    const tbodyMini = document.querySelector("#tabla-mini-solicitudes-vecino tbody");
    if (!tbodyMini) return;

    const solicitudesFiltradas = solicitudesMemory.filter(s => {
        if (!s.rutVecino || !vecino.rut) return false;
        return s.rutVecino.replace(/[^0-9kK]/g, "").toUpperCase() === vecino.rut.replace(/[^0-9kK]/g, "").toUpperCase() && 
               !["completada", "cerrada", "finalizada"].includes(s.estado?.toLowerCase() || "");
    });

    let htmlMini = "";
    solicitudesFiltradas.forEach(s => {
        const dateObj = s.fechaCreacion ? new Date(s.fechaCreacion.seconds * 1000) : new Date();
        const ticketCodigo = `${idVecino.substring(0, 4).toUpperCase()}-${String(dateObj.getDate()).padStart(2, '0')}-${s.id.substring(0, 3).toUpperCase()}`;
        const clasePrio = s.prioridad === "Alta" ? "badge-status finalizada" : s.prioridad === "Media" ? "badge-status gestion" : "badge-status revision";

        htmlMini += `
            <tr>
                <td style="font-weight:700; color:var(--primary-blue); font-size:12.5px; white-space:nowrap;">#${ticketCodigo}</td>
                <td>
                    <span style="display:block; font-weight:600; color:var(--text-dark);">${s.motivo}</span>
                    <span style="font-size:11px; color:var(--text-light); font-weight:600;">${s.subcategoria || 'General'}</span>
                </td>
                <td style="font-weight:500; font-size:12.5px; color:var(--text-dark);">${s.oficinaDerivada || 'No asignada'}</td>
                <td style="text-align:center;"><span class="${clasePrio}" style="padding:3px 8px; font-size:10.5px; border-radius:12px;">${s.prioridad || 'Media'}</span></td>
                <td><div style="font-size:12px; color:var(--text-dark); max-width:260px; max-height:60px; overflow-y:auto; line-height:1.4; white-space:pre-wrap;">${s.descripcion}</div></td>
            </tr>`;
    });

    tbodyMini.innerHTML = htmlMini || `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-light); font-weight:500;">Este vecino no registra solicitudes pendientes en el territorio.</td></tr>`;
    document.getElementById("modal-solicitudes-vecino").style.display = "flex";
}

// ==============================================================================
// 📋 VISOR RECTIFICADO: FORMATO ESPEJO INTEGRAL DE TEXTO CON MAPA INCORPORADO
// ==============================================================================
async function abrirVisorVecino(id) {
    try {
        const docRef = doc(db, "vecinos", id); const docSnap = await getDoc(docRef); if (!docSnap.exists()) return;
        const data = docSnap.data(); const fotoSrc = data.fotoPerfil || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100";
        const fNacimientoFormatted = data.fechaNacimiento ? data.fechaNacimiento.split("-").reverse().join("/") : "No registrada";

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

        // --- EXTRACCIÓN DEL IDENTIFICADOR CORTO DE SEIS DÍGITOS ---
        const shortId = id.substring(0, 6).toUpperCase();

        // --- ENCABEZADO EXPEDIENTE DIGITAL ---
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
                        ${data.urlDocumento ? `<div class="profile-solicitud-box" style="margin-top:0; border-left-color: var(--kpi-purple); display: flex; align-items: center; justify-content: space-between; padding: 14px 18px;"><span style="font-size: 13.5px; font-weight: 600; color: var(--text-dark);">${data.nombreDocumento || "Documento de Respaldo"}</span><a href="${data.urlDocumento}" target="_blank" style="color: var(--primary-blue); font-weight: 600; font-size: 12px; text-decoration: none;">Ver archivo</a></div>` : `<div class="no-data-placeholder"><p>No se registran archivos PDF anexos.</p></div>`}
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modalOverlay);

        // --- MANEJADOR DEL EVENTO COPIAR AL PORTAPAPELES COPIANDO CÓDIGO NORMALIZADO ---
        modalOverlay.querySelector(".btn-copy-id").onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(shortId).then(() => {
                const iconBtn = modalOverlay.querySelector(".btn-copy-id");
                iconBtn.style.color = "#10b981"; 
                setTimeout(() => { iconBtn.style.color = "#64748b"; }, 1000);
            }).catch(err => console.error("Error al copiar identificador territorial:", err));
        };

        // --- RENDERIZADO ASÍNCRONO DEL MAPA EN EXPEDIENTE DIGITAL ---
        if (data.lat && data.lng) {
            setTimeout(() => {
                const mapVisorContainer = modalOverlay.querySelector("#v-visor-mapa");
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

async function abrirEditorVecino(id) {
    try {
        const docRef = doc(db, "vecinos", id); const docSnap = await getDoc(docRef); if (!docSnap.exists()) return;
        const data = docSnap.data(); const fotoSrc = data.fotoPerfil || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100";
        const modalOverlay = document.createElement("div"); modalOverlay.className = "profile-modal-overlay";

        let opcionesCategoriasHTML = `<option value="">Ninguna</option>`;
        Object.keys(MAPEO_MUNICIPAL).forEach(cat => { opcionesCategoriasHTML += `<option value="${cat}">${cat}</option>`; });

        let opcionesSectoresHTML = `<option value="">Seleccione Sector</option>`;
        Object.keys(MAPEO_TERRITORIAL).forEach(sec => { opcionesSectoresHTML += `<option value="${sec}" ${data.sectorTerritorial === sec ? 'selected' : ''}>${ETIQUETAS_SECTORES[sec] || sec}</option>`; });

        let opcionesUvsHTML = `<option value="">Seleccione UV</option>`;
        if (data.sectorTerritorial && MAPEO_TERRITORIAL[data.sectorTerritorial]) { MAPEO_TERRITORIAL[data.sectorTerritorial].uvs.forEach(uv => { opcionesUvsHTML += `<option value="${uv}" ${data.unidadVecinal === uv ? 'selected' : ''}>${uv}</option>`; }); }

        let opcionesJuntasTerritorialesHTML = `<option value="">Seleccione Junta</option>`;
        if (data.sectorTerritorial && data.unidadVecinal && MAPEO_TERRITORIAL[data.sectorTerritorial]?.juntas[data.unidadVecinal]) { MAPEO_TERRITORIAL[data.sectorTerritorial].juntas[data.unidadVecinal].forEach(j => { opcionesJuntasTerritorialesHTML += `<option value="${j}">${j}</option>`; }); }

        const qSolsEdit = query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID), where("idVecino", "==", id));
        const snapSolicitudesEdit = await getDocs(qSolsEdit);
        let solicitudesListaEdit = []; snapSolicitudesEdit.forEach(sDoc => { solicitudesListaEdit.push({ id: sDoc.id, ...sDoc.data() }); });

        let solicitudesRenderHTML = "";
        solicitudesListaEdit.forEach(sol => {
            solicitudesRenderHTML += `<div style="padding:10px; background:#fff; border:1px solid var(--border-color); border-radius:6px; margin-bottom:6px;"><b>#Ticket - ${sol.motivo}</b> (${sol.estado})</div>`;
        });

        modalOverlay.innerHTML = `
            <div class="profile-modal-card">
                <div class="profile-modal-header" style="background: linear-gradient(135deg, #1e293b, #475569);">
                    <div class="modal-avatar-wrapper" style="position: relative; cursor: pointer;">
                        <img src="${fotoSrc}" class="profile-modal-avatar" id="edit-modal-preview">
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
                    <div class="form-row-grid">
                        <div class="form-group"><label>Nombre completo</label><input type="text" id="e-vecino-nombre" value="${data.nombreCompleto || ''}"></div>
                        <div class="form-group"><label>Teléfono celular</label><input type="text" id="e-vecino-telefono" value="${data.telefono || ''}"></div>
                    </div>
                    <div class="form-row-grid" style="margin-top:10px;">
                        <div class="form-group"><label>Sector Territorial</label><select id="e-vecino-sector-territorial">${opcionesSectoresHTML}</select></div>
                        <div class="form-group"><label>Unidad Vecinal</label><select id="e-vecino-unidad-vecinal">${opcionesUvsHTML}</select></div>
                    </div>
                    <div class="form-row-grid" style="margin-top:10px;">
                        <div class="form-group"><label>Junta de Vecinos</label><select id="e-vecino-junta-vecinal">${opcionesJuntasTerritorialesHTML}</select></div>
                        <div class="form-group"><label>Barrio / Villa</label><input type="text" id="e-vecino-barrio-popular" value="${data.barrioPopular || ''}"></div>
                    </div>
                </div>
                <div style="padding:16px; background:#f8fafc; display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn btn-secondary btn-modal-cancel">Cancelar</button>
                    <button class="btn btn-primary btn-modal-save" style="background-color:#0b438c;">Guardar cambios</button>
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
                modalOverlay.remove(); await cargarDatosFirebase(); aplicarFiltrosVecinos();
            } catch (err) { console.error(err); btnSave.disabled = false; }
        };
    } catch (e) { console.error(e); }
}

function configurarManejadoresHoverYBotones() {
    document.querySelectorAll(".btn-ver-solicitudes-badge").forEach(btn => {
        btn.addEventListener("click", (e) => { abrirModalSolicitudesVecino(e.currentTarget.getAttribute("data-id")); });
    });

    document.querySelectorAll(".v-edit").forEach(btn => {
        btn.addEventListener("click", (e) => { 
            const id = e.currentTarget.getAttribute("data-id");
            const vec = vecinosMemory.find(item => item.id === id);
            if (vec) abrirConsolaAltaAvanzadaVecinoCompleto(id, vec);
        });
    });

    const triggers = document.querySelectorAll(".table-user-cell.user-hover-trigger");
    triggers.forEach(el => {
        el.addEventListener("click", (e) => { abrirVisorVecino(el.getAttribute("data-id")); });
        el.addEventListener("mouseenter", (e) => {
            const id = el.getAttribute("data-id"); const vecino = vecinosMemory.find(v => v.id === id); if (!vecino) return;
            const foto = vecino.fotoPerfil || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100";
            if (hoverCard) {
                hoverCard.innerHTML = `<div style="display:flex; align-items:center; gap:12px;"><img src="${foto}" style="width:45px; height:45px; border-radius:50%; object-fit:cover;"><div><h5 style="margin:0; font-size:13px;">${vecino.nombreCompleto}</h5><p style="margin:2px 0 0 0; font-size:11px;">RUT: ${vecino.rut}</p></div></div>`;
                const rect = el.getBoundingClientRect(); hoverCard.style.top = `${rect.top + window.scrollY - 20}px`; hoverCard.style.left = `${rect.left + window.scrollX + 160}px`; hoverCard.style.display = "block";
            }
        });
        el.addEventListener("mouseleave", () => { if (hoverCard) hoverCard.style.display = "none"; });
    });
}

// ==============================================================================
// 🔌 RECEPTOR INTERNO EXCLUSIVO: INTERCEPCIÓN ASÍNCROMA MULTI-FORMATO CHILENO
// ==============================================================================
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
            
            rutsMatriz.push(`${cuerpoConPuntos}-${dv}`); // Variante clásica: 18.478.241-3
            rutsMatriz.push(`${cuerpo}-${dv}`);          // Variante limpia: 18478241-3
        }

        rutsMatriz = Array.from(new Set(rutsMatriz));

        // 1. Intentar localizar directamente en la memoria caché reactiva local ya hidratada
        let vecinoEncontrado = vecinosMemory.find(v => 
            v.rut && rutsMatriz.some(r => v.rut.replace(/[.\-\s]/g, "").toUpperCase() === r.replace(/[.\-\s]/g, "").toUpperCase())
        );

        // 2. Si no ha cargado aún en memoria por latencia, interrogar a Firestore de forma directa
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
            // 3. Escribir el RUT directamente en la barra de búsqueda nativa del módulo
            const buscadorLocalInput = document.getElementById("filter-vecino-busqueda");
            if (buscadorLocalInput) {
                buscadorLocalInput.value = vecinoEncontrado.rut;
                aplicarFiltrosVecinos(); // Ejecutar filtros inmediatos en la grilla visual
            }
            
            // 4. Levantar la hoja de vida territorial completa de forma automatizada
            abrirVisorVecino(vecinoEncontrado.id);
        } else {
            console.warn("No se localizó ningún expediente territorial con el RUT suministrado.");
        }
    } catch (error) {
        console.error("Error al ejecutar el enlace cruzado de expedientes:", error);
    }
}