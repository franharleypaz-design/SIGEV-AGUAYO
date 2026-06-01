// 1. Importamos las instancias seguras compartidas desde app.js
import { auth, db, app } from "./app.js";

// 2. Importamos los métodos oficiales de Cloud Firestore
import { 
    collection, 
    addDoc, 
    doc,
    getDoc,
    updateDoc,
    serverTimestamp, 
    getDocs, 
    query, 
    orderBy, 
    limit,
    where,
    getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 3. Importamos los métodos de Firebase Storage para subida de archivos
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// 4. Importamos el Layout y LOS DICCIONARIOS MAESTROS TERRITORIALES
import { inyectarEstructuraGlobal, actualizarPerfilLayout } from "./layout.js";
import { MAPEO_MUNICIPAL, MAPEO_TERRITORIAL } from "./mapeoMunicipal.js";

// Inicializar el servicio de almacenamiento de Firebase
const storage = getStorage(app);
let archivoFotoSeleccionado = null; 
let archivoDocSeleccionado = null; 
let estaGuardando = false; 

// ARQUITECTURA TENANT: Identificador maestro de aislamiento corporativo
const CURRENT_TENANT_ID = "aguayo";

// Variables para el Mini-Calendario del Dashboard
let fechaActualDashboard = new Date();
let eventosDashboardMemory = [];

// Controles globales para la instancia del mapa interno del Dashboard
let miniMapaDashboard = null;
let pinMarcadorDashboard = null;

// --- DICCIONARIO VISUAL DE SECTORES (Para mostrar los paréntesis en modales) ---
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

// Carga paralela inmediata al detectar la sesión activa
auth.onAuthStateChanged(async (user) => {
    if (user) {
        console.log("Dashboard activo y conectado para el usuario:", user.email);
        
        actualizarPerfilLayout(user);
        inicializarManejadorFormularioEstatico();
        inicializarAccionesRapidasGrid();
        inicializarNavegacionMiniCalendario();
        inicializarRelojMundial();

        await Promise.all([
            renderizarMetricasKPI(),
            cargarTablasDinamicas(),
            cargarEventosDashboard() // Cargamos los eventos de Firebase
        ]);
        
        renderizarMiniCalendario(); // Dibujamos la grilla y los eventos reales
    }
});

// --- NUEVO: MOTOR CARTOGRÁFICO DE ASIGNACIÓN INTERNA DEL DASHBOARD ---
function despertarMapaDashboard() {
    const mapContainer = document.getElementById("v-mini-mapa-picker");
    if (!mapContainer) return;

    if (!miniMapaDashboard) {
        miniMapaDashboard = L.map(mapContainer, { zoomControl: true }).setView([-33.537, -70.664], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(miniMapaDashboard);

        const SVG_MARKER_TEMPLATE = L.divIcon({
            html: `<div class="custom-pin-wrapper"><svg class="pin-vector" width="28" height="38" viewBox="0 0 24 24" fill="#2563eb" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`,
            className: 'leaflet-marker-custom', iconSize: [28, 38], iconAnchor: [14, 38]
        });

        // Geocodificación Inversa: Clic en mapa -> Captura Coordenadas y escribe Dirección
        miniMapaDashboard.on('click', async (e) => {
            const { lat, lng } = e.latlng;
            const inputLat = document.getElementById("v-lat");
            const inputLng = document.getElementById("v-lng");
            if (inputLat) inputLat.value = lat.toFixed(6);
            if (inputLng) inputLng.value = lng.toFixed(6);

            if (pinMarcadorDashboard) { 
                pinMarcadorDashboard.setLatLng(e.latlng); 
            } else { 
                pinMarcadorDashboard = L.marker(e.latlng, { icon: SVG_MARKER_TEMPLATE }).addTo(miniMapaDashboard); 
            }

            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
                const dataRes = await response.json();
                if (dataRes && dataRes.address) {
                    const calle = dataRes.address.road || dataRes.address.pedestrian || "Calle sin nombre";
                    const numero = dataRes.address.house_number || "";
                    const inputDir = document.getElementById("vecino-direccion");
                    if (inputDir) inputDir.value = numero ? `${calle} ${numero}` : calle;
                }
            } catch (err) { console.error("Error en geocodificación inversa Nominatim:", err); }
        });

        // Geocodificación Directa: Escribe Dirección -> Mueve el marcador y actualiza Coordenadas
        const inputDireccion = document.getElementById("vecino-direccion");
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

                        const inputLat = document.getElementById("v-lat");
                        const inputLng = document.getElementById("v-lng");
                        if (inputLat) inputLat.value = latGeocodificada.toFixed(6);
                        if (inputLng) inputLng.value = lngGeocodificada.toFixed(6);

                        const nuevaPosicionLatLng = new L.LatLng(latGeocodificada, lngGeocodificada);
                        miniMapaDashboard.setView(nuevaPosicionLatLng, 16);

                        if (pinMarcadorDashboard) {
                            pinMarcadorDashboard.setLatLng(nuevaPosicionLatLng);
                        } else {
                            pinMarcadorDashboard = L.marker(nuevaPosicionLatLng, { icon: SVG_MARKER_TEMPLATE }).addTo(miniMapaDashboard);
                        }
                    }
                } catch (err) {
                    console.error("Error en geocodificación automática Nominatim:", err);
                }
            });
        }
    }

    setTimeout(() => miniMapaDashboard.invalidateSize(), 60);
    setTimeout(() => miniMapaDashboard.invalidateSize(), 250);
}

// --- FUNCIÓN DEL RELOJ DIGITAL EN TIEMPO REAL ---
function inicializarRelojMundial() {
    const clockContainer = document.getElementById("live-clock");
    if (!clockContainer) return;
    const render = () => {
        const ahora = new Date();
        clockContainer.innerText = `|   ${ahora.toLocaleDateString('es-CL')}  ${ahora.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
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
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="12" x2="12" y2="16"></line><line x1="12" y1="12" x2="12" y2="16"></line></svg>`;
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

// --- LÓGICA DE LECTURA DE LA COLECCIÓN DE EVENTOS FILTRADA POR TENANT ---
async function cargarEventosDashboard() {
    try {
        const q = query(collection(db, "eventos"), where("tenantId", "==", CURRENT_TENANT_ID));
        const snap = await getDocs(q);
        eventosDashboardMemory = [];
        snap.forEach(doc => {
            eventosDashboardMemory.push({ id: doc.id, ...doc.data() });
        });

        // Actualizamos el KPI de "Eventos próximos"
        const hoy = new Date();
        const hoyFormateado = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
        const eventosProximos = eventosDashboardMemory.filter(ev => ev.fecha >= hoyFormateado);
        
        const kpiEventos = document.getElementById("count-finalizadas"); 
        if (kpiEventos) kpiEventos.innerText = eventosProximos.length;

    } catch (error) {
        console.error("Error cargando eventos para el dashboard:", error);
    }
}

function inicializarNavegacionMiniCalendario() {
    const navBotones = document.querySelectorAll(".calendar-nav button");
    if (navBotones.length >= 3) {
        navBotones[0].addEventListener("click", () => { fechaActualDashboard = new Date(); renderizarMiniCalendario(); });
        navBotones[1].addEventListener("click", () => { fechaActualDashboard.setMonth(fechaActualDashboard.getMonth() - 1); renderizarMiniCalendario(); });
        navBotones[2].addEventListener("click", () => { fechaActualDashboard.setMonth(fechaActualDashboard.getMonth() + 1); renderizarMiniCalendario(); });
    }
}

function renderizarMiniCalendario() {
    const contenedor = document.querySelector(".calendar-grid");
    const tituloMes = document.querySelector(".calendar-nav h4");
    if (!contenedor) return;

    const año = fechaActualDashboard.getFullYear();
    const mes = fechaActualDashboard.getMonth();

    const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    if (tituloMes) tituloMes.innerText = `${nombresMeses[mes]} ${año}`;

    const primerDiaMes = new Date(año, mes, 1);
    const ultimoDiaMes = new Date(año, mes + 1, 0);
    const totalDias = ultimoDiaMes.getDate();
    
    let diaInicioSemana = primerDiaMes.getDay();
    diaInicioSemana = diaInicioSemana === 0 ? 6 : diaInicioSemana - 1;

    const diasPrevios = new Date(año, mes, 0).getDate();

    let html = `
        <div class="calendar-day-label">Lun</div>
        <div class="calendar-day-label">Mar</div>
        <div class="calendar-day-label">Mié</div>
        <div class="calendar-day-label">Jue</div>
        <div class="calendar-day-label">Vie</div>
        <div class="calendar-day-label">Sáb</div>
        <div class="calendar-day-label">Dom</div>
    `;

    for (let i = diaInicioSemana - 1; i >= 0; i--) {
        html += `<div class="calendar-cell muted"><div class="cell-number">${diasPrevios - i}</div></div>`;
    }

    const hoy = new Date();
    for (let dia = 1; dia <= totalDias; dia++) {
        const esHoy = (dia === hoy.getDate() && mes === hoy.getMonth() && año === hoy.getFullYear());
        
        const fechaStr = `${año}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const eventosDelDia = eventosDashboardMemory.filter(ev => ev.fecha === fechaStr);
        
        let htmlEventos = "";
        eventosDelDia.forEach(ev => {
            const horaTooltip = ev.hora ? `\n${ev.hora}` : '';
            htmlEventos += `<div class="calendar-event ${ev.tipo}" title="${ev.titulo}${horaTooltip}" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size: 10.5px;">${ev.titulo}</div>`;
        });

        const styleCeldaHoy = esHoy ? 'background-color: rgba(37, 99, 235, 0.05);' : '';
        const styleNumeroHoy = esHoy ? 'background-color: var(--primary-blue); color: #fff; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; margin: 0 auto 5px auto;' : '';

        html += `
            <div class="calendar-cell" style="${styleCeldaHoy}">
                <div class="cell-number" style="${styleNumeroHoy}">${dia}</div>
                ${htmlEventos}
            </div>
        `;
    }

    const celdasTotales = diaInicioSemana + totalDias;
    const celdasFaltantes = (7 - (celdasTotales % 7)) % 7;
    for (let i = 1; i <= celdasFaltantes; i++) {
        html += `<div class="calendar-cell muted"><div class="cell-number">${i}</div></div>`;
    }

    contenedor.innerHTML = html;
}

// --- ACTIVADOR DEL PANEL DE ACCIONES RÁPIDAS ---
function inicializarAccionesRapidasGrid() {
    const modalIngreso = document.getElementById("modal-ingreso-vecino");
    const btnGuardarVecino = document.getElementById("btn-guardar-vecino");
    
    const quickRegistrar = document.getElementById("btn-quick-registrar");
    const quickSolicitudes = document.getElementById("btn-quick-solicitudes");
    const quickButtons = document.querySelectorAll(".quick-actions-grid .action-block-btn");
    const btnModalNuevoVecino = document.getElementById("btn-modal-nuevo-vecino");

    if (quickRegistrar) {
        quickRegistrar.addEventListener("click", () => {
            resetearPanelesModalIngreso();
            if (btnGuardarVecino) btnGuardarVecino.disabled = true;
            if (modalIngreso) modalIngreso.style.display = "flex";
            despertarMapaDashboard();
        });
    }

    if (btnModalNuevoVecino) {
        btnModalNuevoVecino.addEventListener("click", () => {
            resetearPanelesModalIngreso();
            if (btnGuardarVecino) btnGuardarVecino.disabled = true;
            if (modalIngreso) modalIngreso.style.display = "flex";
            despertarMapaDashboard();
        });
    }

    if (quickSolicitudes) {
        quickSolicitudes.addEventListener("click", () => {
            window.location.href = "solicitudes.html";
        });
    }

    quickButtons.forEach(btn => {
        const txt = btn.innerText.trim();
        if (txt.includes("Reportes") || txt.includes("Generar reporte")) {
            btn.addEventListener("click", () => { mostrarAlertaPersonalizada("El módulo de Reportes Avanzados e Índices Territoriales se encuentra en desarrollo técnico.", "info"); });
        } else if (txt.includes("Usuarios")) {
            btn.addEventListener("click", () => { window.location.href = "usuarios.html"; });
        } else if (txt.includes("Exportar")) {
            btn.addEventListener("click", () => { mostrarAlertaPersonalizada("Generando volcado de datos consolidado... La descarga del archivo territorial (.xlsx) comenzará automáticamente.", "success"); });
        }
    });
}

function resetearPanelesModalIngreso() {
    const modalIngreso = document.getElementById("modal-ingreso-vecino"); if (!modalIngreso) return;
    const tabs = modalIngreso.querySelectorAll(".tab-item"); const panels = modalIngreso.querySelectorAll(".profile-panel");
    tabs.forEach(t => t.classList.remove("active")); panels.forEach(p => p.classList.remove("active"));
    if (tabs[0]) tabs[0].classList.add("active"); if (panels[0]) panels[0].classList.add("active");
}

// --- FUNCIÓN: MODAL VISOR DE PERFIL VECINAL FILTRADO ---
async function abrirVisorVecino(id) {
    try {
        const docRef = doc(db, "vecinos", id); const docSnap = await getDoc(docRef); if (!docSnap.exists()) return;
        const data = docSnap.data(); const fotoSrc = data.fotoPerfil || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100";
        const fNacimientoFormatted = data.fechaNacimiento ? data.fechaNacimiento.split("-").reverse().join("/") : "No registrada";

        // Filtro Tenant integrado en las solicitudes históricas del visor
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

        const tabs = modalOverlay.querySelectorAll(".profile-tab");
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

// --- MODAL DE EDICIÓN AVANZADO COMPLETO (ESCRITURA CON TENANT) ---
async function abrirEditorVecino(id) {
    try {
        const docRef = doc(db, "vecinos", id); const docSnap = await getDoc(docRef); if (!docSnap.exists()) return;
        const data = docSnap.data(); const fotoSrc = data.fotoPerfil || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100";
        let fotoEdicionLocal = null; let docEdicionLocal = null; let eliminarDocMarcado = false;
        const modalOverlay = document.createElement("div"); modalOverlay.className = "profile-modal-overlay";

        // Preparamos las opciones para el selector de motivos municipales
        let opcionesCategoriasHTML = `<option value="">Ninguna</option>`;
        Object.keys(MAPEO_MUNICIPAL).forEach(cat => { opcionesCategoriasHTML += `<option value="${cat}">${cat}</option>`; });

        // --- CONSTRUCCIÓN DINÁMICA DE LA CASCADA DE INTELIGENCIA TERRITORIAL ---
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

        // Cargamos todas las solicitudes filtradas por el TenantId correspondiente
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
                    <div class="profile-tab" data-target="e-panel-avanzados">Datos Avanzados</div>
                    <div class="profile-tab" data-target="e-panel-adicional">Info Adicional</div>
                    <div class="profile-tab" data-target="e-panel-documentos">Documentos</div>
                </div>
                <div class="profile-modal-body">
                    <div class="profile-panel active" id="e-panel-basicos">
                        <div class="form-row-grid" style="margin-bottom: 14px;">
                            <div class="form-group"><label>Nombre completo</label><input type="text" id="e-vecino-nombre" value="${data.nombreCompleto || ''}"></div>
                            <div class="form-group"><label>Teléfono celular</label><input type="text" id="e-vecino-telefono" value="${data.telefono || ''}"></div>
                        </div>
                        <div class="form-row-grid" style="margin-bottom: 14px;">
                            <div class="form-group"><label>Fecha de nacimiento</label><input type="date" id="e-vecino-fecha" value="${data.fechaNacimiento || ''}"></div>
                            <div class="form-group"><label>Correo electrónico</label><input type="email" id="e-vecino-correo" value="${data.correoElectronico || ''}"></div>
                        </div>
                        <div class="form-row-grid" style="margin-bottom: 14px;">
                            <div class="form-group full-width"><label>Dirección particular</label><input type="text" id="e-vecino-direccion" value="${data.direccion || ''}"></div>
                        </div>
                        <div class="form-row-grid" style="margin-bottom: 14px;">
                            <div class="form-group">
                                <label>Sector Territorial</label>
                                <select id="e-vecino-sector-territorial">${opcionesSectoresHTML}</select>
                            </div>
                            <div class="form-group">
                                <label>Unidad Vecinal (UV)</label>
                                <select id="e-vecino-unidad-vecinal" ${data.sectorTerritorial ? '' : 'disabled'}>${opcionesUvsHTML}</select>
                            </div>
                        </div>
                        <div class="form-row-grid" style="margin-bottom: 14px;">
                            <div class="form-group">
                                <label>Junta de Vecinos</label>
                                <select id="e-vecino-junta-vecinal" ${data.unidadVecinal ? '' : 'disabled'}>${opcionesJuntasTerritorialesHTML}</select>
                            </div>
                            <div class="form-group">
                                <label>Barrio / Villa Popular (Manual)</label>
                                <input type="text" id="e-vecino-barrio-popular" value="${data.barrioPopular || ''}" placeholder="Ej. El Parrón">
                            </div>
                        </div>
                    </div>
                    
                    <div class="profile-panel" id="e-panel-solicitudes">
                        <div id="lista-solicitudes-container" style="max-height: 220px; overflow-y: auto; margin-bottom: 12px; padding-right: 5px;">
                            ${solicitudesRenderHTML}
                        </div>
                        <button type="button" id="btn-nueva-solicitud-tab" class="btn btn-secondary" style="width: 100%; font-size: 12px; background-color: #f1f5f9; color: var(--primary-blue); border: 1px dashed var(--primary-blue);">+ Ingresar nueva solicitud territorial</button>
                        
                        <div id="editor-solicitudes-form" style="display: none; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid var(--border-color);">
                            <h4 id="editor-solicitudes-form-title" style="font-size: 13.5px; font-weight: 700; color: var(--text-dark); margin-bottom: 14px;">Nueva Solicitud</h4>
                            <input type="hidden" id="e-solicitud-id-val">
                            
                            <div class="form-row-grid">
                                <div class="form-group"><label>Categoría Principal</label><select id="e-solicitud-motivo">${opcionesCategoriasHTML}</select></div>
                                <div class="form-group"><label>Subcategoría específica</label><select id="e-solicitud-subcategoria" disabled><option value="">Seleccione categoría</option></select></div>
                            </div>
                            <div class="form-row-grid" style="margin-top: 14px;">
                                <div class="form-group"><label>Oficina Receptora</label><input type="text" id="e-solicitud-oficina" readonly style="background-color: #f1f5f9; font-weight:600;"></div>
                                <div class="form-group">
                                    <label>Prioridad</label>
                                    <select id="e-solicitud-prioridad">
                                        <option value="Baja">Baja</option>
                                        <option value="Media" selected>Media</option>
                                        <option value="Alta">Alta</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-row-grid" style="margin-top: 14px;"><div class="form-group full-width"><label>Descripción del caso</label><textarea id="e-solicitud-descripcion" rows="3"></textarea></div></div>
                            <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
                                <button type="button" id="btn-cancelar-sol-form" class="btn btn-secondary" style="font-size: 11px; padding: 6px 12px;">Descartar / Volver a la lista</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="profile-panel" id="e-panel-avanzados">
                        <div class="form-row-grid"><div class="form-group full-width"><label>Ocupación / Oficio</label><input type="text" id="e-vecino-ocupacion" value="${data.ocupacion || ''}"></div></div>
                    </div>
                    <div class="profile-panel" id="e-panel-adicional">
                        <div class="form-row-grid"><div class="form-group full-width"><label>Observaciones de Terreno</label><textarea id="e-vecino-observaciones" rows="4">${data.observaciones || ''}</textarea></div></div>
                    </div>
                    <div class="profile-panel" id="e-panel-documentos">
                        ${data.urlDocumento ? `
                            <div id="edit-modal-existing-doc-row" style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; background: #f8fafc; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 14px;">
                                <span id="edit-modal-doc-label-name" style="font-size: 13.5px; font-weight: 600; color: var(--text-dark);">${data.nombreDocumento || "Documento de Respaldo"}</span>
                                <div style="display: flex; align-items: center; gap: 16px; color: #94a3b8;">
                                    <a href="${data.urlDocumento}" target="_blank" style="color: inherit; display: flex; align-items: center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></a>
                                    <svg id="btn-edit-cambiar-doc" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15" style="cursor:pointer;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    <svg id="btn-edit-eliminar-doc" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15" style="cursor:pointer; color: #ef4444;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </div>
                            </div>` : ''}
                        <div id="edit-modal-doc-form-container" style="${data.urlDocumento ? 'display: none;' : ''}">
                            <div class="form-row-grid" style="margin-bottom: 14px;"><div class="form-group full-width"><label>Nombre del documento</label><input type="text" id="e-documento-nombre" value="${data.nombreDocumento || ''}"></div></div>
                            <div class="form-group style-group"><div class="file-dropzone" id="edit-modal-doc-dropzone" style="padding: 24px;"><p class="drop-text">Haga clic aquí para cargar archivo</p><span class="drop-subtext">PDF, JPG, PNG (Máx. 10MB)</span><input type="file" id="edit-modal-doc-input" accept=".pdf,image/*" style="display: none;"></div></div>
                        </div>
                        <div style="margin-top: 12px;"><button type="button" id="btn-edit-trigger-upload" class="btn btn-secondary" style="font-size:12px; ${data.urlDocumento ? '' : 'display: none;'}">+ Subir Nuevo Documento</button></div>
                    </div>
                </div>
                <div style="padding: 16px 32px; background: #f8fafc; display: flex; justify-content: flex-end; gap: 12px;">
                    <button class="btn btn-secondary btn-modal-cancel">Cancelar</button>
                    <button class="btn btn-primary btn-modal-save" style="background-color: #0b438c;">Guardar cambios</button>
                </div>
            </div>`;
        document.body.appendChild(modalOverlay);

        const eMotivo = modalOverlay.querySelector("#e-solicitud-motivo"); const eSub = modalOverlay.querySelector("#e-solicitud-subcategoria"); const eOficina = modalOverlay.querySelector("#e-solicitud-oficina");
        const listContainer = modalOverlay.querySelector("#lista-solicitudes-container"); const formContainer = modalOverlay.querySelector("#editor-solicitudes-form");
        const btnNuevaSol = modalOverlay.querySelector("#btn-nueva-solicitud-tab"); const btnCancelarSol = modalOverlay.querySelector("#btn-cancelar-sol-form");
        const inputSolId = modalOverlay.querySelector("#e-solicitud-id-val"); const formTitle = modalOverlay.querySelector("#editor-solicitudes-form-title");

        // Nodos Dinámicos de la Cascada Territorial en Edición
        const eSecTerr = modalOverlay.querySelector("#e-vecino-sector-territorial");
        const eUvTerr = modalOverlay.querySelector("#e-vecino-unidad-vecinal");
        const eJuntTerr = modalOverlay.querySelector("#e-vecino-junta-vecinal");

        // Escuchadores Dinámicos para la Cascada Territorial del Editor
        eSecTerr.addEventListener("change", (e) => {
            const sec = e.target.value;
            eUvTerr.innerHTML = '<option value="">Seleccione UV</option>';
            eJuntTerr.innerHTML = '<option value="">Seleccione Junta</option>';
            eJuntTerr.disabled = true;
            if (sec && MAPEO_TERRITORIAL[sec]) {
                MAPEO_TERRITORIAL[sec].uvs.forEach(uv => { eUvTerr.innerHTML += `<option value="${uv}">${uv}</option>`; });
                eUvTerr.disabled = false;
            } else { eUvTerr.disabled = true; }
        });

        eUvTerr.addEventListener("change", (e) => {
            const sec = eSecTerr.value; const uv = e.target.value;
            eJuntTerr.innerHTML = '<option value="">Seleccione Junta</option>';
            if (sec && uv && MAPEO_TERRITORIAL[sec]?.juntas[uv]) {
                MAPEO_TERRITORIAL[sec].juntas[uv].forEach(j => { eJuntTerr.innerHTML += `<option value="${j}">${j}</option>`; });
                eJuntTerr.disabled = false;
            } else { eJuntTerr.disabled = true; }
        });

        const poblarSubcategoriasEditor = (cat, valorPreestablecido = "") => {
            eSub.innerHTML = "";
            if (cat && MAPEO_MUNICIPAL[cat]) {
                eOficina.value = MAPEO_MUNICIPAL[cat].oficina; let h = `<option value="">Seleccione subcategoría</option>`;
                MAPEO_MUNICIPAL[cat].subcategorias.forEach(s => { h += `<option value="${s}" ${s === valorPreestablecido ? 'selected' : ''}>${s}</option>`; });
                eSub.innerHTML = h; eSub.disabled = false;
            } else { eOficina.value = ""; eSub.innerHTML = `<option value="">Seleccione categoría</option>`; eSub.disabled = true; }
        };

        eMotivo.addEventListener("change", (e) => poblarSubcategoriasEditor(e.target.value));

        btnNuevaSol.addEventListener("click", () => {
            listContainer.style.display = "none"; btnNuevaSol.style.display = "none";
            formContainer.style.display = "block"; formTitle.innerText = "Ingresando Nueva Solicitud";
            inputSolId.value = ""; eMotivo.value = ""; poblarSubcategoriasEditor("");
            modalOverlay.querySelector("#e-solicitud-prioridad").value = "Media";
            modalOverlay.querySelector("#e-solicitud-descripcion").value = "";
        });

        btnCancelarSol.addEventListener("click", () => {
            listContainer.style.display = "block"; btnNuevaSol.style.display = "block"; formContainer.style.display = "none";
        });

        modalOverlay.querySelectorAll(".btn-edit-sol-item").forEach(btn => {
            btn.addEventListener("click", () => {
                listContainer.style.display = "none"; btnNuevaSol.style.display = "none";
                formContainer.style.display = "block"; formTitle.innerText = "Editando Solicitud Existente";
                inputSolId.value = btn.getAttribute("data-id"); eMotivo.value = btn.getAttribute("data-motivo");
                poblarSubcategoriasEditor(eMotivo.value, btn.getAttribute("data-sub"));
                modalOverlay.querySelector("#e-solicitud-prioridad").value = btn.getAttribute("data-prio") || "Media";
                modalOverlay.querySelector("#e-solicitud-descripcion").value = btn.getAttribute("data-desc");
            });
        });

        const tabs = modalOverlay.querySelectorAll(".profile-tab"); const panels = modalOverlay.querySelectorAll(".profile-panel");
        tabs.forEach(t => t.addEventListener("click", () => {
            tabs.forEach(tab => tab.classList.remove("active")); panels.forEach(p => p.classList.remove("active"));
            t.classList.add("active"); modalOverlay.querySelector(`#${t.getAttribute("data-target")}`).classList.add("active");
        }));

        const fileInput = modalOverlay.querySelector("#edit-modal-file-input"); const previewImg = modalOverlay.querySelector("#edit-modal-preview");
        modalOverlay.querySelector(".modal-avatar-wrapper").addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (e) => { if (e.target.files[0]) { fotoEdicionLocal = e.target.files[0]; previewImg.src = URL.createObjectURL(e.target.files[0]); } });

        const dropzone = modalOverlay.querySelector("#edit-modal-doc-dropzone"); const docInput = modalOverlay.querySelector("#edit-modal-doc-input");
        if (dropzone && docInput) {
            dropzone.addEventListener("click", () => docInput.click());
            docInput.addEventListener("change", (e) => {
                if (e.target.files[0]) {
                    docEdicionLocal = e.target.files[0]; eliminarDocMarcado = false;
                    dropzone.querySelector(".drop-text").innerText = "¡Archivo cargado!"; dropzone.querySelector(".drop-subtext").innerText = e.target.files[0].name;
                }
            });
        }

        const existingRow = modalOverlay.querySelector("#edit-modal-existing-doc-row"); const formContainerDoc = modalOverlay.querySelector("#edit-modal-doc-form-container"); const btnTriggerUpload = modalOverlay.querySelector("#btn-edit-trigger-upload");
        if (modalOverlay.querySelector("#btn-edit-cambiar-doc")) modalOverlay.querySelector("#btn-edit-cambiar-doc").addEventListener("click", () => { formContainerDoc.style.display = "block"; if (btnTriggerUpload) btnTriggerUpload.style.display = "none"; });
        if (btnTriggerUpload) btnTriggerUpload.addEventListener("click", () => { formContainerDoc.style.display = "block"; btnTriggerUpload.style.display = "none"; });
        if (modalOverlay.querySelector("#btn-edit-eliminar-doc")) modalOverlay.querySelector("#btn-edit-eliminar-doc").addEventListener("click", () => { eliminarDocMarcado = true; docEdicionLocal = null; if (existingRow) existingRow.remove(); formContainerDoc.style.display = "block"; if (btnTriggerUpload) btnTriggerUpload.remove(); });

        const btnSave = modalOverlay.querySelector(".btn-modal-save");
        btnSave.addEventListener("click", async () => {
            const nuevoNombre = modalOverlay.querySelector("#e-vecino-nombre").value.trim();
            if (!nuevoNombre) return;
            btnSave.disabled = true; btnSave.innerText = "Sincronizando...";

            try {
                let urlFotoFinal = data.fotoPerfil || ""; let urlDocFinal = data.urlDocumento || "";
                if (fotoEdicionLocal) {
                    const storageRef = ref(storage, `fotos_vecinos/${data.rut}_${Date.now()}_${fotoEdicionLocal.name}`);
                    await uploadBytes(storageRef, fotoEdicionLocal); urlFotoFinal = await getDownloadURL(storageRef);
                }
                if (eliminarDocMarcado) { urlDocFinal = ""; } 
                else if (docEdicionLocal) {
                    const storageRefDoc = ref(storage, `documentos_vecinos/${data.rut}_${Date.now()}_${docEdicionLocal.name}`);
                    await uploadBytes(storageRefDoc, docEdicionLocal); urlDocFinal = await getDownloadURL(storageRefDoc);
                }

                const updatePayload = {
                    nombreCompleto: nuevoNombre, telefono: modalOverlay.querySelector("#e-vecino-telefono").value.trim(),
                    fechaNacimiento: modalOverlay.querySelector("#e-vecino-fecha").value, correoElectronico: modalOverlay.querySelector("#e-vecino-correo").value.trim(),
                    direccion: modalOverlay.querySelector("#e-vecino-direccion").value.trim(), fotoPerfil: urlFotoFinal, urlDocumento: urlDocFinal, nombreDocumento: modalOverlay.querySelector("#e-documento-nombre")?.value.trim() || "",
                    ocupacion: modalOverlay.querySelector("#e-vecino-ocupacion")?.value.trim() || "", observaciones: modalOverlay.querySelector("#e-vecino-observaciones")?.value.trim() || "",
                    
                    // Salvaguarda Unificada de Datos Político-Territoriales
                    sectorTerritorial: eSecTerr.value || "Sin Información",
                    unidadVecinal: eUvTerr.value || "Sin Información",
                    juntaVecinos: eJuntTerr.value || "Sin Información",
                    barrioPopular: modalOverlay.querySelector("#e-vecino-barrio-popular").value.trim() || "Sin Información"
                };

                await updateDoc(docRef, updatePayload);

                const solFormVisible = formContainer.style.display === "block";
                if (solFormVisible) {
                    const cat = eMotivo.value; const sub = eSub.value; const ofi = eOficina.value;
                    const prio = modalOverlay.querySelector("#e-solicitud-prioridad").value;
                    const desc = modalOverlay.querySelector("#e-solicitud-descripcion").value.trim();
                    const editId = inputSolId.value;

                    const currentUser = auth.currentUser;
                    const loggedName = currentUser ? (currentUser.displayName || currentUser.email) : "Equipo Territorial";
                    const loggedPhoto = currentUser ? currentUser.photoURL : "";

                    if (cat) {
                        if (editId) {
                            await updateDoc(doc(db, "solicitudes", editId), { motivo: cat, subcategoria: sub, oficinaDerivada: ofi, prioridad: prio, descripcion: desc });
                        } else {
                            await addDoc(collection(db, "solicitudes"), { 
                                idVecino: id, nombreVecino: nuevoNombre, rutVecino: data.rut, motivo: cat, subcategoria: sub, oficinaDerivada: ofi, prioridad: prio, descripcion: desc, 
                                estado: "En revisión", fechaCreacion: serverTimestamp(), tenantId: CURRENT_TENANT_ID, // ◄ Multi-tenant acuñado
                                asignadoA: loggedName, registradaPorNombre: loggedName, registradaPorFoto: loggedPhoto
                            });
                        }
                    }
                } else {
                    // FIJADO DE SEGURIDAD: Añadido filtro estricto por tenantId al actualizar cascadas de nombres históricos
                    const snapSols = await getDocs(query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID), where("idVecino", "==", id)));
                    snapSols.forEach(async (s) => {
                        if(s.data().nombreVecino !== nuevoNombre) { await updateDoc(doc(db, "solicitudes", s.id), { nombreVecino: nuevoNombre }); }
                    });
                }

                modalOverlay.remove(); mostrarAlertaPersonalizada("Expediente territorial actualizado con éxito.", "success");
                await renderizarMetricasKPI(); cargarTablasDinamicas();
            } catch (err) { console.error(err); btnSave.disabled = false; }
        });

        modalOverlay.querySelector(".btn-profile-close").addEventListener("click", () => modalOverlay.remove());
        modalOverlay.querySelector(".btn-modal-cancel").addEventListener("click", () => modalOverlay.remove());
    } catch (e) { console.error(e); }
}

// Métricas calculadas en el servidor mediante getCountFromServer() filtradas por TenantId
async function renderizarMetricasKPI() {
    try {
        const [sV, sA, sC] = await Promise.all([
            getCountFromServer(query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID))),
            getCountFromServer(query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID), where("estado", "in", ["Abierta", "En revisión", "En gestión"]))),
            getCountFromServer(query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID), where("estado", "==", "Finalizada")))
        ]);
        const cards = document.querySelectorAll(".kpi-card h3");
        if (cards.length >= 3) {
            cards[0].innerText = sV.data().count.toLocaleString();
            cards[1].innerText = sA.data().count.toLocaleString();
            cards[2].innerText = sC.data().count.toLocaleString();
        }
    } catch (error) { console.error(error); }
}

// --- TABLAS DINÁMICAS ESTILIZADAS CON FILTRADO MAESTRO POR INQUILINO ---
async function cargarTablasDinamicas() {
    try {
        const qV = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID));
        const qS = query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID));

        const [snapshotVecinos, snapSol] = await Promise.all([getDocs(qV), getDocs(qS)]);
        
        let listaVecinosMemory = [];
        snapshotVecinos.forEach((vDoc) => { listaVecinosMemory.push({ id: vDoc.id, ...vDoc.data() }); });
        
        listaVecinosMemory.sort((a, b) => {
            const timeA = a.fechaRegistro?.seconds || a.fechaRegistration?.seconds || 0;
            const timeB = b.fechaRegistro?.seconds || b.fechaRegistration?.seconds || 0;
            return timeB - timeA;
        });
        const vecinosLimitados = listaVecinosMemory.slice(0, 5);

        let listaSolicitudesMemory = [];
        snapSol.forEach((sDoc) => { listaSolicitudesMemory.push({ id: sDoc.id, ...sDoc.data() }); });
        
        listaSolicitudesMemory.sort((a, b) => (b.fechaCreacion?.seconds || 0) - (a.fechaCreacion?.seconds || 0));
        const solicitudesLimitadas = listaSolicitudesMemory.slice(0, 5);

        const tablas = document.querySelectorAll(".custom-data-table tbody");
        
        if (tablas.length > 0) {
            let htmlVecinos = ""; let htmlSolicitudes = "";

            vecinosLimitados.forEach((data) => {
                const dateRaw = data.fechaRegistro || data.fechaRegistration;
                const fRegistro = dateRaw ? new Date(dateRaw.seconds * 1000).toLocaleDateString('es-CL') : "Reciente";
                const fotoSrc = data.fotoPerfil || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100";
                
                const sectorVisual = data.barrioPopular || data.sectorTerritorial || data.sector || "S/S";

                htmlVecinos += `
                    <tr>
                        <td>
                            <div class="table-user-cell">
                                <img src="${fotoSrc}" alt="Avatar" class="table-user-avatar">
                                <span>${data.nombreCompleto}</span>
                            </div>
                        </td>
                        <td>${data.rut}</td>
                        <td style="white-space:nowrap;">${data.telefono || "S/R"}</td>
                        <td>${sectorVisual}</td>
                        <td>${fRegistro}</td>
                        <td>
                            <div class="action-icons-group">
                                <svg class="btn-ver-vecino" data-id="${data.id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" style="cursor:pointer;" title="Ver Perfil"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                <svg class="btn-editar-vecino" data-id="${data.id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" style="cursor:pointer;" title="Editar Expediente"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </div>
                        </td>
                    </tr>`;
            });

            const currentUser = auth.currentUser;
            const currentName = currentUser ? (currentUser.displayName || currentUser.email) : "Equipo Territorial";
            const currentPhoto = currentUser?.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=50";

            solicitudesLimitadas.forEach((sol) => {
                const dateObj = sol.fechaCreacion ? new Date(sol.fechaCreacion.seconds * 1000) : new Date();
                const classEstado = sol.estado === "En revisión" || sol.estado === "Abierta" ? "revision" : sol.estado === "En gestión" ? "gestion" : "finalizada";
                const idTicketInteligente = `${(sol.idVecino || "000").substring(0, 4).toUpperCase()}-${String(dateObj.getDate()).padStart(2, '0')}${String(dateObj.getMonth() + 1).padStart(2, '0')}-${sol.id.substring(0, 3).toUpperCase()}`;

                let nombreEncargado = sol.asignadoA || sol.registradaPorNombre;
                if (!nombreEncargado || nombreEncargado === "Equipo Territorial") { nombreEncargado = currentName; }

                let avatarEncargado = sol.registradaPorFoto;
                if (!avatarEncargado || avatarEncargado === "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=50") { avatarEncargado = currentPhoto; }

                htmlSolicitudes += `
                    <tr>
                        <td style="white-space: nowrap;"><a href="solicitudes.html" class="ticket-id" style="color:var(--primary-blue); font-weight:700;">#${idTicketInteligente}</a></td>
                        <td>${sol.nombreVecino}</td>
                        <td><b>${sol.motivo}</b><span class="stacked-cell-secondary" style="font-size:11px; display:block;">${sol.subcategoria || 'General'}</span></td>
                        <td><span class="badge-status ${classEstado}" style="padding:4px 10px; font-size:11px; font-weight:600; border-radius:20px;">${sol.estado}</span></td>
                        <td style="white-space: nowrap;">${dateObj.toLocaleDateString('es-CL')}</td>
                    </tr>`;
            });

            if (tablas[0]) { 
                tablas[0].innerHTML = htmlVecinos || '<tr><td colspan="6" style="text-align:center; padding: 20px;">No se registran vecinos</td></tr>'; 
                document.querySelectorAll(".btn-editar-vecino").forEach(b => b.onclick = () => abrirEditorVecino(b.getAttribute("data-id"))); 
                document.querySelectorAll(".btn-ver-vecino").forEach(b => b.onclick = () => abrirVisorVecino(b.getAttribute("data-id"))); 
            }
            if (tablas[1]) tablas[1].innerHTML = htmlSolicitudes || '<tr><td colspan="5" style="text-align:center; padding: 20px;">No se registran solicitudes</td></tr>';
        }
    } catch (error) { console.error("Error cargando tablas:", error); }
}

function presidentialTimerMockup() {
    // Espacio reservado para futuras implementaciones
}

function inicializarManejadorFormularioEstatico() {
    const sMotivo = document.getElementById("solicitud-motivo"); const sSub = document.getElementById("solicitud-subcategoria"); const sOficina = document.getElementById("solicitud-oficina"); const btnGuardar = document.getElementById("btn-guardar-vecino"); const inputRut = document.getElementById("vecino-rut");
    const photoContainer = document.querySelector(".photo-upload-container"); const docContainer = document.querySelector("#form-panel-documentos .file-dropzone");
    const modalIngreso = document.getElementById("modal-ingreso-vecino");

    const sSectorTerritorial = document.getElementById("vecino-sector-territorial");
    const sUnidadVecinal = document.getElementById("vecino-unidad-vecinal");
    const sJuntaVecinos = document.getElementById("vecino-junta-vecinal");
    const inputBarrioPopular = document.getElementById("vecino-barrio-popular");

    const btnCerrarIngreso = document.getElementById("btn-cerrar-ingreso");
    
    const resetCascadaTerritorial = () => {
        if (sUnidadVecinal) { sUnidadVecinal.innerHTML = `<option value="">Seleccione primero el sector</option>`; sUnidadVecinal.disabled = true; }
        if (sJuntaVecinos) { sJuntaVecinos.innerHTML = `<option value="">Seleccione primero la UV</option>`; sJuntaVecinos.disabled = true; }
    };

    // FUNCIÓN DE LIMPIEZA CARTOGRÁFICA INTERNA AL REINICIAR FORMULARIO
    const clearMapMarkerInputs = () => {
        if (pinMarcadorDashboard && miniMapaDashboard) {
            miniMapaDashboard.removeLayer(pinMarcadorDashboard);
            pinMarcadorDashboard = null;
        }
        const inputLat = document.getElementById("v-lat");
        const inputLng = document.getElementById("v-lng");
        if (inputLat) inputLat.value = "";
        if (inputLng) inputLng.value = "";
    };

    if (btnCerrarIngreso) {
        btnCerrarIngreso.onclick = () => {
            if (modalIngreso) modalIngreso.style.display = "none";
            document.getElementById("form-vecino")?.reset();
            if (sSub) { sSub.innerHTML = `<option value="">Seleccione categoría</option>`; sSub.disabled = true; }
            resetCascadaTerritorial();
            clearMapMarkerInputs();
            archivoFotoSeleccionado = null; archivoDocSeleccionado = null;
        };
    }

    const btnLimpiarIngreso = document.getElementById("btn-limpiar-ingreso");
    if (btnLimpiarIngreso) {
        btnLimpiarIngreso.onclick = () => {
            document.getElementById("form-vecino")?.reset();
            if (sSub) { sSub.innerHTML = `<option value="">Seleccione categoría</option>`; sSub.disabled = true; }
            if (btnGuardar) btnGuardar.disabled = true;
            resetCascadaTerritorial();
            clearMapMarkerInputs();
            archivoFotoSeleccionado = null; archivoDocSeleccionado = null;
        };
    }

    window.addEventListener("click", (e) => {
        if (e.target === modalIngreso) {
            modalIngreso.style.display = "none";
            document.getElementById("form-vecino")?.reset();
            if (sSub) { sSub.innerHTML = `<option value="">Seleccione categoría</option>`; sSub.disabled = true; }
            resetCascadaTerritorial();
            clearMapMarkerInputs();
            archivoFotoSeleccionado = null; archivoDocSeleccionado = null;
        }
    });

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

    if (modalIngreso) {
        modalIngreso.querySelectorAll(".tab-item").forEach((tab) => {
            tab.onclick = () => {
                modalIngreso.querySelectorAll(".tab-item").forEach((item) => item.classList.remove("active")); tab.classList.add("active");
                const targetId = tab.getAttribute("data-target");
                if (targetId) {
                    modalIngreso.querySelectorAll(".profile-panel").forEach(p => p.classList.remove("active"));
                    modalIngreso.querySelector(`#${targetId}`)?.classList.add("active");
                }
            };
        });
    }

    if (sMotivo && sSub && sOficina) {
        sMotivo.addEventListener("change", (e) => {
            const v = e.target.value; sSub.innerHTML = ""; sOficina.value = "";
            if (v && MAPEO_MUNICIPAL[v]) {
                sOficina.value = MAPEO_MUNICIPAL[v].oficina; let h = `<option value="">Seleccione subcategoría</option>`;
                MAPEO_MUNICIPAL[v].subcategorias.forEach(s => { h += `<option value="${s}">${s}</option>`; });
                sSub.innerHTML = h; sSub.disabled = false;
            } else { sSub.innerHTML = `<option value="">Seleccione categoría</option>`; sSub.disabled = true; }
        });
    }

    if (photoContainer) {
        const hInput = document.createElement("input"); hInput.type = "file"; hInput.accept = "image/*"; hInput.style.display = "none"; photoContainer.appendChild(hInput);
        photoContainer.onclick = () => hInput.click();
        hInput.addEventListener("change", (e) => {
            if (e.target.files[0]) {
                if (e.target.files[0].size > 5 * 1024 * 1024) { mostrarAlertaPersonalizada("La foto excede los 5MB.", "error"); return; }
                photoContainer.querySelector("span").innerText = "¡Foto Lista!"; photoContainer.querySelector("p").innerText = e.target.files[0].name;
                archivoFotoSeleccionado = e.target.files[0];
            }
        });
    }

    if (docContainer) {
        const hDoc = document.createElement("input"); hDoc.type = "file"; hDoc.accept = ".pdf,image/*"; hDoc.style.display = "none"; docContainer.appendChild(hDoc);
        docContainer.onclick = () => hDoc.click();
        hDoc.addEventListener("change", (e) => {
            if (e.target.files[0]) {
                if (e.target.files[0].size > 10 * 1024 * 1024) { mostrarAlertaPersonalizada("El archivo excede los 10MB.", "error"); return; }
                docContainer.querySelector("p").innerText = "¡Documento listo!"; docContainer.querySelector("span").innerText = e.target.files[0].name;
                archivoDocSeleccionado = e.target.files[0];
            }
        });
    }

    if (inputRut && btnGuardar) {
        inputRut.addEventListener("input", (e) => {
            btnGuardar.disabled = true;
            let value = e.target.value.replace(/[^0-9kK]/g, '');
            if (value.length > 1) { e.target.value = value.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + value.slice(-1).toUpperCase(); }
            else { e.target.value = value.toUpperCase(); }
        });

        inputRut.addEventListener("blur", () => {
            setTimeout(async () => {
                if (estaGuardando) return;
                const r = inputRut.value.trim(); if (!r) return;
                const raw = r.replace(/[^0-9kK]/g, "").toUpperCase();
                const formatB = raw.length > 1 ? (raw.slice(0, -1) + "-" + raw.slice(-1)) : raw;

                try {
                    // Consulta de validación adaptada al aislamiento por Tenant
                    const qD = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID), where("rut", "in", [raw, formatB, r]));
                    const snap = await getDocs(qD);
                    if (!snap.empty) {
                        if (modalIngreso) modalIngreso.style.display = "none"; 
                        document.getElementById("form-vecino")?.reset();
                        clearMapMarkerInputs();
                        archivoFotoSeleccionado = null; archivoDocSeleccionado = null;

                        if (photoContainer) {
                            const span = photoContainer.querySelector("span"); if (span) span.innerText = "Subir foto";
                            const p = photoContainer.querySelector("p"); if (p) p.innerText = "PNG, JPG hasta 5MB";
                        }
                        if (docContainer) {
                            const p = docContainer.querySelector("p"); if (p) p.innerText = "Haga clic aquí para cargar";
                            const span = docContainer.querySelector("span"); if (span) span.innerText = "Formatos autorizados: PDF, JPG, PNG (Máx. 10MB)";
                        }

                        mostrarAlertaPersonalizada(`El RUT ya figura a nombre de: ${snap.docs[0].data().nombreCompleto}. Abriendo ficha...`, "info");
                        await abrirEditorVecino(snap.docs[0].id);
                    } else {
                        mostrarAlertaPersonalizada("El RUT no se encuentra en el sistema. Puede proceder a completar la información territorial.", "success");
                        btnGuardar.disabled = false;
                    }
                } catch (err) { console.error("Error al validar RUT duplicado:", err); }
            }, 250);
        });
    }

    if (btnGuardar) {
        btnGuardar.addEventListener("click", async (e) => {
            e.preventDefault();
            const nom = document.getElementById("vecino-nombre").value.trim(); const rut = inputRut.value.trim(); const cat = sMotivo.value; const sub = sSub.value; const ofi = sOficina.value; const prio = document.getElementById("solicitud-prioridad").value; const desc = document.getElementById("solicitud-descripcion").value.trim();

            if (!nom || !rut) return;

            estaGuardando = true; btnGuardar.disabled = true; btnGuardar.innerText = "Sincronizando...";

            // Rescate dinámico de las casillas de latitud y longitud numéricas
            const latVal = document.getElementById("v-lat")?.value;
            const lngVal = document.getElementById("v-lng")?.value;

            try {
                let urlFotoFinal = ""; let urlDocFinal = "";
                if (archivoFotoSeleccionado) {
                    const refF = ref(storage, `fotos_vecinos/${rut}_${Date.now()}_${archivoFotoSeleccionado.name}`);
                    await uploadBytes(refF, archivoFotoSeleccionado); urlFotoFinal = await getDownloadURL(refF);
                }
                if (archivoDocSeleccionado) {
                    const refD = ref(storage, `documentos_vecinos/${rut}_${Date.now()}_${archivoDocSeleccionado.name}`);
                    await uploadBytes(refD, archivoDocSeleccionado); urlDocFinal = await getDownloadURL(refD);
                }

                const vData = { 
                    nombreCompleto: nom, rut: rut, telefono: document.getElementById("vecino-telefono").value.trim(), 
                    fechaNacimiento: document.getElementById("vecino-fecha-nacimiento").value, correoElectronico: document.getElementById("vecino-correo").value.trim(),
                    direccion: document.getElementById("vecino-direccion").value.trim(),
                    lat: latVal ? Number(latVal) : "", // ◄ NUEVO: Inserción de latitud permanente
                    lng: lngVal ? Number(lngVal) : "", // ◄ NUEVO: Inserción de longitud permanente
                    fotoPerfil: urlFotoFinal, urlDocumento: urlDocFinal, nombreDocumento: document.getElementById("vecino-documento-nombre")?.value.trim() || "",
                    fechaRegistro: serverTimestamp(),
                    tenantId: CURRENT_TENANT_ID, 
                    
                    sectorTerritorial: sSectorTerritorial ? sSectorTerritorial.value : "Sin Información",
                    unidadVecinal: sUnidadVecinal ? sUnidadVecinal.value : "Sin Información",
                    juntaVecinos: sJuntaVecinos ? sJuntaVecinos.value : "Sin Información",
                    barrioPopular: inputBarrioPopular ? inputBarrioPopular.value.trim() : "Sin Información"
                };

                const vRef = await addDoc(collection(db, "vecinos"), vData);
                
                if (cat) {
                    const currentUser = auth.currentUser;
                    const loggedName = currentUser ? (currentUser.displayName || currentUser.email) : "Equipo Territorial";
                    const loggedPhoto = currentUser ? currentUser.photoURL : "";

                    await addDoc(collection(db, "solicitudes"), { 
                        idVecino: vRef.id, 
                        nombreVecino: nom, 
                        rutVecino: rut, 
                        motivo: cat, 
                        subcategoria: sub, 
                        oficinaDerivada: ofi, 
                        prioridad: prio, 
                        descripcion: desc, 
                        estado: "En revisión", 
                        fechaCreacion: serverTimestamp(),
                        tenantId: CURRENT_TENANT_ID, 
                        asignadoA: loggedName, 
                        registradaPorNombre: loggedName, 
                        registradaPorFoto: loggedPhoto,
                        lat: latVal ? Number(latVal) : "", // Amarra las coordenadas a la solicitud inicial
                        lng: lngVal ? Number(lngVal) : ""
                    });
                }
                
                if (modalIngreso) modalIngreso.style.display = "none"; 
                document.getElementById("form-vecino").reset();
                if (sSub) { sSub.innerHTML = `<option value="">Seleccione categoría</option>`; sSub.disabled = true; }
                resetCascadaTerritorial();
                clearMapMarkerInputs();
                mostrarAlertaPersonalizada("Vecino y Solicitud Territorial guardados correctamente.", "success");
                
                archivoFotoSeleccionado = null; archivoDocSeleccionado = null;
                await renderizarMetricasKPI(); cargarTablasDinamicas();
                await cargarEventosDashboard(); renderizarMiniCalendario();
            } catch (err) { console.error(err); } 
            finally { estaGuardando = false; btnGuardar.disabled = false; btnGuardar.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Guardar vecino`; }
        });
    }
}