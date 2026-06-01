// ==============================================================================
// SIGEV-AGUAYO - MOTOR GIS TERRITORIAL INTERACTIVO (LEAFLET + FIRESTORE CONECTOR)
// ==============================================================================
import { auth, db } from "./app.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { actualizarPerfilLayout } from "./layout.js";

const subdominioDetectado = window.location.hostname.split('.')[0];
const CURRENT_TENANT_ID = (subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado;
let mapaInstancia = null;

// Inicialización de contenedores lógicos aislados para evitar sobrecargar la GPU
let capaVecinosGroup = L.layerGroup();
let capaSolicitudesGroup = L.layerGroup();
let capaDonacionesGroup = L.layerGroup();

// --- INYECCIÓN VECTORIAL SVG (PREVIENE FALLOS DE RUTA DE ASSETS EN CDN) ---
const PIN_AZUL = `<div class="custom-pin-wrapper"><svg class="pin-vector" width="28" height="38" viewBox="0 0 24 24" fill="#2563eb" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`;
const PIN_ROJO = `<div class="custom-pin-wrapper"><svg class="pin-vector" width="28" height="38" viewBox="0 0 24 24" fill="#ef4444" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`;
const PIN_VERDE = `<div class="custom-pin-wrapper"><svg class="pin-vector" width="28" height="38" viewBox="0 0 24 24" fill="#10b981" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`;

auth.onAuthStateChanged(async (user) => {
    if (user) {
        actualizarPerfilLayout(user);
        inicializarLienzoCartograficoBase();
        await descargarYMAPEARElementosTerritoriales();
        conectarEscuchadoresFiltrosCapas();
    }
});

function inicializarLienzoCartograficoBase() {
    if (mapaInstancia) return;

    // Foco geográfico por defecto: Centro neurálgico de La Cisterna, Santiago de Chile
    mapaInstancia = L.map('mapa-canvas', {
        zoomControl: true,
        fadeAnimation: true
    }).setView([-33.537, -70.664], 14);

    // Carga de capa asfáltica urbana pública desde los servidores de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(mapaInstancia);

    // Adjuntar los grupos a la visualización inicial de forma predeterminada
    capaVecinosGroup.addTo(mapaInstancia);
    capaSolicitudesGroup.addTo(mapaInstancia);
    capaDonacionesGroup.addTo(mapaInstancia);
}

async function descargarYMAPEARElementosTerritoriales() {
    try {
        const qV = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID));
        const qS = query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID));
        const qD = query(collection(db, "donaciones"), where("tenantId", "==", CURRENT_TENANT_ID));

        const [snapVecinos, snapSolicitudes, snapDonaciones] = await Promise.all([
            getDocs(qV), getDocs(qS), getDocs(qD)
        ]);

        // Transformación de los SVGs a DivIcons inyectables nativos
        const iconAzul = L.divIcon({ html: PIN_AZUL, className: 'leaflet-marker-custom', iconSize: [28, 38], iconAnchor: [14, 38], popupAnchor: [0, -34] });
        const iconRojo = L.divIcon({ html: PIN_ROJO, className: 'leaflet-marker-custom', iconSize: [28, 38], iconAnchor: [14, 38], popupAnchor: [0, -34] });
        const iconVerde = L.divIcon({ html: PIN_VERDE, className: 'leaflet-marker-custom', iconSize: [28, 38], iconAnchor: [14, 38], popupAnchor: [0, -34] });

        // Contenedores de indexación temporal para el cruce de georreferenciación heredada
        const vecinosMapByRut = {};
        const vecinosMapById = {};

        // --- 1. PROCESAMIENTO Y MAPEADO DE VECINOS ---
        snapVecinos.forEach(doc => {
            const v = doc.data();
            const id = doc.id;
            const cleanRut = v.rut ? v.rut.replace(/[^0-9kK]/g, "").toUpperCase() : "";
            
            // Indexación estricta para resolver fallbacks de capas superiores
            vecinosMapById[id] = { ...v, id };
            if (cleanRut) vecinosMapByRut[cleanRut] = { ...v, id };

            // Resguardo contra expedientes antiguos o sin georreferencia explícita
            if (v.lat && v.lng) {
                const popHTML = `
                    <div class="gis-popup-container">
                        <h4>👥 Ficha Vecinal</h4>
                        <div class="gis-popup-title">${v.nombreCompleto}</div>
                        <p><b>RUT:</b> ${v.rut || 'S/R'}</p>
                        <p><b>Teléfono:</b> ${v.telefono || 'S/R'}</p>
                        <p><b>Dirección:</b> ${v.direccion || 'No registrada'}</p>
                        <p style="margin-top:4px; border-top:1px solid #e2e8f0; padding-top:4px; font-size:10px; color:#94a3b8;">Sector: ${v.sectorTerritorial || 'S/I'} | UV: ${v.unidadVecinal || 'S/I'}</p>
                    </div>`;
                L.marker([Number(v.lat), Number(v.lng)], { icon: iconAzul }).bindPopup(popHTML).addTo(capaVecinosGroup);
            }
        });

        // --- 2. PROCESAMIENTO Y MAPEADO DE SOLICITUDES (ASOCIADO ESTRICTO A COORDENADAS DEL VECINO) ---
        snapSolicitudes.forEach(doc => {
            const s = doc.data();
            const cleanRut = s.rutVecino ? s.rutVecino.replace(/[^0-9kK]/g, "").toUpperCase() : "";
            
            // Cruzar datos de forma mandatoria para heredar el geoposicionamiento del vecino
            const vecRef = vecinosMapById[s.idVecino] || vecinosMapByRut[cleanRut];

            if (vecRef && vecRef.lat && vecRef.lng) {
                const dateObj = s.fechaCreacion ? new Date(s.fechaCreacion.seconds * 1000) : new Date();
                const fDay = String(dateObj.getDate()).padStart(2, '0');
                const fMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
                const fYear = String(dateObj.getFullYear()).slice(-2);
                const codTicket = `${(s.idVecino || "VEC").substring(0,4).toUpperCase()}-${fDay}${fMonth}${fYear}-${doc.id.substring(0,3).toUpperCase()}`;

                const popHTML = `
                    <div class="gis-popup-container">
                        <h4 style="color:#ef4444; background:rgba(239,68,68,0.06); border-color:rgba(239,68,68,0.25);">🔴 Requerimiento Territorial</h4>
                        <div class="gis-popup-title">#${codTicket}</div>
                        <p><b>Vecino:</b> ${s.nombreVecino || vecRef.nombreCompleto || 'Inscrito'}</p>
                        <p><b>Motivo:</b> <span style="color:#b91c1c; font-weight:700;">${s.motivo}</span></p>
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:6px; margin:6px 0; font-size:11px; color:#475569; max-height:50px; overflow-y:auto; line-height:1.35;">"${s.descripcion || 'Sin descripción'}"</div>
                        <p style="font-size:10px; color:#64748b;">Estado actual: <b>${s.estado || 'Abierta'}</b></p>
                    </div>`;
                L.marker([Number(vecRef.lat), Number(vecRef.lng)], { icon: iconRojo }).bindPopup(popHTML).addTo(capaSolicitudesGroup);
            }
        });

        // --- 3. PROCESAMIENTO Y MAPEADO DE DONACIONES (ASOCIADO ESTRICTO A COORDENADAS DEL VECINO) ---
        snapDonaciones.forEach(doc => {
            const d = doc.data();
            const rBeneficiario = d.rutVecino || d.rutBeneficiario || "";
            const cleanRut = rBeneficiario ? rBeneficiario.replace(/[^0-9kK]/g, "").toUpperCase() : "";
            const idBeneficiario = d.idVecino || d.idBeneficiario || "";
            
            // Cruzar datos de forma mandatoria para heredar el geoposicionamiento del vecino
            const vecRef = vecinosMapById[idBeneficiario] || vecinosMapByRut[cleanRut];

            if (vecRef && vecRef.lat && vecRef.lng) {
                const gastoFormateado = d.montoGasto ? `$${Number(d.montoGasto).toLocaleString('es-CL')}` : "$0";
                const popHTML = `
                    <div class="gis-popup-container">
                        <h4 style="color:#10b981; background:rgba(16,185,129,0.06); border-color:rgba(16,185,129,0.25);">💚 Aporte Social Otorgado</h4>
                        <div class="gis-popup-title">${d.tipoDonacion}</div>
                        <p><b>Beneficiario:</b> ${d.nombreVecino || d.nombreBeneficiario || vecRef.nombreCompleto || 'Inscrito'}</p>
                        <p><b>Volumen entregado:</b> ${d.cantidad || '1 unidad'}</p>
                        <p><b>Inversión Territorial:</b> <span style="color:#059669; font-weight:700;">${gastoFormateado}</span></p>
                        <p style="font-size:10px; color:#64748b; margin-top:4px;">Asignado por: ${d.registradoPor || 'Equipo'}</p>
                    </div>`;
                L.marker([Number(vecRef.lat), Number(vecRef.lng)], { icon: iconVerde }).bindPopup(popHTML).addTo(capaDonacionesGroup);
            }
        });

    } catch (error) {
        console.error("Error compilando capas GIS en lienzo:", error);
    }
}

function conectarEscuchadoresFiltrosCapas() {
    // Encendido y apagado dinámico de capas de memoria sin volver a consultar a la BD
    document.getElementById("chk-layer-vecinos").addEventListener("change", (e) => {
        if (e.target.checked) mapaInstancia.addLayer(capaVecinosGroup);
        else mapaInstancia.removeLayer(capaVecinosGroup);
    });

    document.getElementById("chk-layer-solicitudes").addEventListener("change", (e) => {
        if (e.target.checked) mapaInstancia.addLayer(capaSolicitudesGroup);
        else mapaInstancia.removeLayer(capaSolicitudesGroup);
    });

    document.getElementById("chk-layer-donaciones").addEventListener("change", (e) => {
        if (e.target.checked) mapaInstancia.addLayer(capaDonacionesGroup);
        else mapaInstancia.removeLayer(capaDonacionesGroup);
    });
}