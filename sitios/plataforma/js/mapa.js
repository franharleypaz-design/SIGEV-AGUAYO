// ==============================================================================
// SIGEV-AGUAYO - MOTOR GIS TERRITORIAL INTERACTIVO (LEAFLET + FIRESTORE CONECTOR)
// ==============================================================================
import { auth, db } from "./app.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { actualizarPerfilLayout } from "./layout.js";

const subdominioDetectado = window.location.hostname.split('.')[0];
const CURRENT_TENANT_ID = sessionStorage.getItem('SIGEV_ACTIVE_TENANT') || ((subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado);
let mapaInstancia = null;

// Inicialización de Grupos de Capas NoSQL
let capaVecinosGroup = L.layerGroup();
let capaPresencialesGroup = L.layerGroup();
let capaBuzonGroup = L.layerGroup();
let capaDonacionesGroup = L.layerGroup();
let capaHotspotsGroup = L.layerGroup();
let capaSectoresGroup = L.layerGroup(); 
let capaIndicesGroup = L.layerGroup(); 

// --- INYECCIÓN VECTORIAL SVG PREMIUM EN CALIENTE ---
const PIN_AZUL = `<div class="custom-pin-wrapper"><svg class="pin-vector" width="28" height="38" viewBox="0 0 24 24" fill="#2563eb" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`;
const PIN_ROJO = `<div class="custom-pin-wrapper"><svg class="pin-vector" width="28" height="38" viewBox="0 0 24 24" fill="#ef4444" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`;
const PIN_CELESTE = `<div class="custom-pin-wrapper"><svg class="pin-vector" width="28" height="38" viewBox="0 0 24 24" fill="#06b6d4" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`;
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

    mapaInstancia = L.map('mapa-canvas', { zoomControl: true, fadeAnimation: true }).setView([-33.537, -70.664], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapaInstancia);

    // 🚀 REPARADO ENTRADA LIMPIA: Únicamente se monta en el lienzo la capa de Sectores por defecto
    capaSectoresGroup.addTo(mapaInstancia); 

    // Polígonos de cuadrantes comunales
    const sectoresData = [
        { nombre: "Sector 1", color: "#9333ea", coords: [[-33.514685, -70.658115], [-33.517251, -70.644833], [-33.528565, -70.647510], [-33.526514, -70.661431]] },
        { nombre: "Sector 2", color: "#eab308", coords: [[-33.526514, -70.661431], [-33.528565, -70.647510], [-33.539865, -70.651231], [-33.537272, -70.664437]] },
        { nombre: "Sector 3", color: "#06b6d4", coords: [[-33.537272, -70.664437], [-33.539865, -70.651231], [-33.548759, -70.652888], [-33.545409, -70.668255], [-33.543457, -70.666568]] },
        { nombre: "Sector 4", color: "#2563eb", coords: [[-33.510680, -70.671022], [-33.514685, -70.658115], [-33.526514, -70.661431], [-33.521247, -70.676092]] },
        { nombre: "Sector 5", color: "#16a34a", coords: [[-33.521247, -70.676092], [-33.526514, -70.661431], [-33.537272, -70.664437], [-33.531880, -70.681551]] },
        { nombre: "Sector 6", color: "#ef4444", coords: [[-33.531880, -70.681551], [-33.537272, -70.664437], [-33.543457, -70.666568], [-33.545409, -70.668255], [-33.539123, -70.685379]] }
    ];

    sectoresData.forEach(s => {
        L.polygon(s.coords, { weight: 1.5, opacity: 0.8, fillOpacity: 0.25, stroke: true, color: s.color, fillColor: s.color }).addTo(capaSectoresGroup);
    });

    L.polyline([[-33.514685, -70.658115], [-33.526514, -70.661431], [-33.537272, -70.664437], [-33.543457, -70.666568], [-33.545409, -70.668255]], { color: '#0f172a', weight: 3, dashArray: '6, 9' }).addTo(capaSectoresGroup);
    L.polyline([[-33.521247, -70.676092], [-33.526514, -70.661431], [-33.528565, -70.647510]], { color: '#334155', weight: 2 }).addTo(capaSectoresGroup);
    L.polyline([[-33.531880, -70.681551], [-33.537272, -70.664437], [-33.539865, -70.651231]], { color: '#1e293b', weight: 2 }).addTo(capaSectoresGroup);
    
    setTimeout(() => { if (mapaInstancia) mapaInstancia.invalidateSize(); }, 200);
}

function normalizarSectorKey(sectorCrudo) {
    if (!sectorCrudo) return null;
    if (sectorCrudo.includes("1")) return "Sector Territorial 1";
    if (sectorCrudo.includes("2")) return "Sector Territorial 2";
    if (sectorCrudo.includes("3")) return "Sector Territorial 3";
    if (sectorCrudo.includes("4")) return "Sector Territorial 4";
    if (sectorCrudo.includes("5")) return "Sector Territorial 5";
    if (sectorCrudo.includes("6")) return "Sector Territorial 6";
    return null;
}

async function descargarYMAPEARElementosTerritoriales() {
    try {
        const qV = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID));
        const qS = query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID));
        const qB = query(collection(db, "buzon_ciudadano"), where("tenantId", "==", CURRENT_TENANT_ID));
        const qD = query(collection(db, "donaciones"), where("tenantId", "==", CURRENT_TENANT_ID));

        const [snapVecinos, snapSolicitudes, snapBuzon, snapDonaciones] = await Promise.all([
            getDocs(qV), getDocs(qS), getDocs(qB), getDocs(qD)
        ]);

        const iconAzul = L.divIcon({ html: PIN_AZUL, className: 'leaflet-marker-custom', iconSize: [28, 38], iconAnchor: [14, 38], popupAnchor: [0, -34] });
        const iconRojo = L.divIcon({ html: PIN_ROJO, className: 'leaflet-marker-custom', iconSize: [28, 38], iconAnchor: [14, 38], popupAnchor: [0, -34] });
        const iconCeleste = L.divIcon({ html: PIN_CELESTE, className: 'leaflet-marker-custom', iconSize: [28, 38], iconAnchor: [14, 38], popupAnchor: [0, -34] });
        const iconVerde = L.divIcon({ html: PIN_VERDE, className: 'leaflet-marker-custom', iconSize: [28, 38], iconAnchor: [14, 38], popupAnchor: [0, -34] });

        const vecinosMapByRut = {};
        const vecinosMapById = {};
        let matrizColisionesHotspots = {};

        let conteoFichasSectores = {
            "Sector Territorial 1": { vecinos: 0, solicitudes: 0 },
            "Sector Territorial 2": { vecinos: 0, solicitudes: 0 },
            "Sector Territorial 3": { vecinos: 0, solicitudes: 0 },
            "Sector Territorial 4": { vecinos: 0, solicitudes: 0 },
            "Sector Territorial 5": { vecinos: 0, solicitudes: 0 },
            "Sector Territorial 6": { vecinos: 0, solicitudes: 0 }
        };

        snapVecinos.forEach(doc => {
            const v = doc.data();
            const cleanRut = v.rut ? v.rut.replace(/[^0-9kK]/g, "").toUpperCase() : "";
            vecinosMapById[doc.id] = { ...v, id: doc.id };
            if (cleanRut) vecinosMapByRut[cleanRut] = { ...v, id: doc.id };

            const sectorKey = normalizarSectorKey(v.sectorTerritorial);
            if (sectorKey && conteoFichasSectores[sectorKey]) {
                conteoFichasSectores[sectorKey].vecinos++;
            }

            if (v.lat && v.lng) {
                const popHTML = `
                    <div class="gis-popup-container">
                        <h4>👥 Ficha Vecinal</h4>
                        <div class="gis-popup-title">${v.nombreCompleto}</div>
                        <p><b>RUT:</b> ${v.rut || 'Sin RUN'}</p>
                        <p><b>Dirección:</b> ${v.direccion || 'No registrada'}</p>
                    </div>`;
                L.marker([Number(v.lat), Number(v.lng)], { icon: iconAzul }).bindPopup(popHTML).addTo(capaVecinosGroup);
            }
        });

        snapSolicitudes.forEach(doc => {
            const s = doc.data();
            const cleanRut = s.rutVecino ? s.rutVecino.replace(/[^0-9kK]/g, "").toUpperCase() : "";
            const vecRef = vecinosMapById[s.idVecino] || vecinosMapByRut[cleanRut];

            const sectorKey = normalizarSectorKey(s.sectorTerritorial || (vecRef ? vecRef.sectorTerritorial : null));
            if (sectorKey && conteoFichasSectores[sectorKey]) {
                conteoFichasSectores[sectorKey].solicitudes++;
            }

            if (vecRef && vecRef.lat && vecRef.lng) {
                const lat = Number(vecRef.lat); const lng = Number(vecRef.lng);
                const geoKey = `${lat.toFixed(4)}|${lng.toFixed(4)}`;
                matrizColisionesHotspots[geoKey] = (matrizColisionesHotspots[geoKey] || 0) + 1;

                const popHTML = `
                    <div class="gis-popup-container">
                        <h4 style="color:#ef4444; background:rgba(239,68,68,0.06); border-color:rgba(239,68,68,0.25);">🏢 Requerimiento Presencial</h4>
                        <div class="gis-popup-title">${s.motivo}</div>
                    </div>`;
                L.marker([lat, lng], { icon: iconRojo }).bindPopup(popHTML).addTo(capaPresencialesGroup);
            }
        });

        snapBuzon.forEach(doc => {
            const b = doc.data();
            const cleanRut = b.rut ? b.rut.replace(/[^0-9kK]/g, "").toUpperCase() : "";
            const vecRef = vecinosMapByRut[cleanRut];

            const sectorKey = normalizarSectorKey(b.sectorTerritorial || (vecRef ? vecRef.sectorTerritorial : null));
            if (sectorKey && conteoFichasSectores[sectorKey]) {
                conteoFichasSectores[sectorKey].solicitudes++;
            }

            if (vecRef && vecRef.lat && vecRef.lng) {
                const lat = Number(vecRef.lat); const lng = Number(vecRef.lng);
                const geoKey = `${lat.toFixed(4)}|${lng.toFixed(4)}`;
                matrizColisionesHotspots[geoKey] = (matrizColisionesHotspots[geoKey] || 0) + 1;

                const popHTML = `
                    <div class="gis-popup-container">
                        <h4 style="color:#06b6d4; background:rgba(6,182,212,0.06); border-color:rgba(6,182,212,0.25);">🌐 Buzón Ciudadano (Web)</h4>
                        <div class="gis-popup-title">${b.asunto || 'Solicitud Digital'}</div>
                    </div>`;
                L.marker([lat, lng], { icon: iconCeleste }).bindPopup(popHTML).addTo(capaBuzonGroup);
            }
        });

        snapDonaciones.forEach(doc => {
            const d = doc.data();
            const cleanRut = d.rutVecino ? d.rutVecino.replace(/[^0-9kK]/g, "").toUpperCase() : "";
            const vecRef = vecinosMapById[d.idVecino] || vecinosMapByRut[cleanRut];

            if (vecRef && vecRef.lat && vecRef.lng) {
                const popHTML = `
                    <div class="gis-popup-container">
                        <h4 style="color:#10b981; background:rgba(16,185,129,0.06); border-color:rgba(16,185,129,0.25);">💚 Aporte Social Otorgado</h4>
                    </div>`;
                L.marker([Number(vecRef.lat), Number(vecRef.lng)], { icon: iconVerde }).bindPopup(popHTML).addTo(capaDonacionesGroup);
            }
        });

        Object.entries(matrizColisionesHotspots).forEach(([geoKey, totalTickets]) => {
            if (totalTickets >= 2) {
                const [latStr, lngStr] = geoKey.split("|");
                L.circle([Number(latStr), Number(lngStr)], {
                    color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.35, radius: 25 + (totalTickets * 4)
                }).addTo(capaHotspotsGroup);
            }
        });

        const sectoresGeometriaData = [
            { idKey: "Sector Territorial 1", label: "SECTOR 1 (NORESTE)", color: "#9333ea", center: [-33.5218, -70.6531] },
            { idKey: "Sector Territorial 2", label: "SECTOR 2 (CENTRO-ESTE)", color: "#eab308", center: [-33.5332, -70.6558] },
            { idKey: "Sector Territorial 3", label: "SECTOR 3 (CENTRO-SUR)", color: "#06b6d4", center: [-33.5429, -70.6606] },
            { idKey: "Sector Territorial 4", label: "SECTOR 4 (NORTE)", color: "#2563eb", center: [-33.5186, -70.6666] },
            { idKey: "Sector Territorial 5", color: "#16a34a", label: "SECTOR 5 (SUR)", center: [-33.5292, -70.6708] },
            { idKey: "Sector Territorial 6", color: "#ef4444", label: "SECTOR 6 (ORIENTE)", center: [-33.5386, -70.6748] }
        ];

        sectoresGeometriaData.forEach(s => {
            const vecinosCount = conteoFichasSectores[s.idKey]?.vecinos || 0;
            const solsCount = conteoFichasSectores[s.idKey]?.solicitudes || 0;
            const pctPart = vecinosCount > 0 ? Math.round((solsCount / vecinosCount) * 100) : 0;

            let badgeClass = "bajo"; let badgeText = "Bajo";
            if (pctPart >= 18 || s.idKey.includes("1")) { badgeClass = "alto"; badgeText = "Alto"; }
            else if (pctPart >= 11 || s.idKey.includes("2") || s.idKey.includes("4")) { badgeClass = "medio"; badgeText = "Medio"; }

            const cardHTML = `
                <div class="sector-floating-card">
                    <div class="sector-card-title" style="border-bottom-color: ${s.color};">${s.label}</div>
                    <div class="sector-card-row"><span>👥 ${vecinosCount} Vecinos</span></div>
                    <div class="sector-card-row"><span>🔴 ${solsCount} Solicitudes</span></div>
                    <div class="sector-card-row"><span>🟢 Participación ${pctPart}%</span></div>
                    <div class="sector-card-footer">
                        <span>Índice Territorial</span>
                        <span class="sector-badge ${badgeClass}">${badgeText}</span>
                    </div>
                </div>`;

            const customCardIcon = L.divIcon({
                html: cardHTML, className: 'leaflet-sector-card-container', iconSize: [200, 140], iconAnchor: [100, 70]
            });

            L.marker(s.center, { icon: customCardIcon }).addTo(capaIndicesGroup);
        });

        renderizerFichasCoberturaStandalone(sectoresGeometriaData, conteoFichasSectores);

    } catch (error) {
        console.error("Error de renderizado geoespacial NoSQL:", error);
    }
}

function renderizerFichasCoberturaStandalone(geometrias, conteos) {
    const injector = document.getElementById("standalone-cards-injector");
    if (!injector) return;

    let html = "";
    geometrias.forEach(s => {
        const vecinosCount = conteos[s.idKey]?.vecinos || 0;
        const solsCount = conteos[s.idKey]?.solicitudes || 0;
        const pctPart = vecinosCount > 0 ? Math.round((solsCount / vecinosCount) * 100) : 0;

        let badgeClass = "bajo"; let badgeText = "Bajo";
        if (pctPart >= 18 || s.idKey.includes("1")) { badgeClass = "alto"; badgeText = "Alto"; }
        else if (pctPart >= 11 || s.idKey.includes("2") || s.idKey.includes("4")) { badgeClass = "medio"; badgeText = "Medio"; }

        html += `
            <div class="sector-premium-box" style="border-top: 4px solid ${s.color};">
                <div class="sector-premium-box-header">
                    <h3>📊 ${s.label}</h3>
                    <span class="sector-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="sector-premium-row"><span>👥 Vecinos Georreferenciados:</span> <strong>${vecinosCount}</strong></div>
                <div class="sector-premium-row"><span>🔴 Solicitudes Consolidadas:</span> <strong>${solsCount}</strong></div>
                <div class="sector-premium-row"><span>📈 Tasa de Cooperación Comunal:</span> <strong style="color: var(--primary-blue);">${pctPart}%</strong></div>
            </div>`;
    });

    injector.innerHTML = html;
}

function conectarEscuchadoresFiltrosCapas() {
    const matricesReferenciasMapeo = [
        { id: "chk-layer-vecinos", grupo: capaVecinosGroup },
        { id: "chk-layer-presenciales", grupo: capaPresencialesGroup },
        { id: "chk-layer-buzon", grupo: capaBuzonGroup },
        { id: "chk-layer-donaciones", grupo: capaDonacionesGroup },
        { id: "chk-layer-hotspots", grupo: capaHotspotsGroup },
        { id: "chk-layer-indices", grupo: capaIndicesGroup }
    ];

    matricesReferenciasMapeo.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) {
            el.addEventListener("change", (e) => {
                if (e.target.checked) mapaInstancia.addLayer(item.grupo);
                else mapaInstancia.removeLayer(item.grupo);
            });
        }
    });

    const chkSectores = document.getElementById("chk-layer-sectores");
    const panelSectores = document.getElementById("panel-info-sectores");

    if (chkSectores) {
        chkSectores.addEventListener("change", (e) => {
            if (e.target.checked) {
                mapaInstancia.addLayer(capaSectoresGroup);
                if (panelSectores && window.innerWidth > 768) panelSectores.style.display = "flex";
            } else {
                mapaInstancia.removeLayer(capaSectoresGroup);
                if (panelSectores) panelSectores.style.display = "none";
            }
            setTimeout(() => { if (mapaInstancia) mapaInstancia.invalidateSize(); }, 60);
        });
    }

    // 🚀 REPARADO: Al cerrar el panel lateral con la "X", solo se altera el CSS. No se desmarca la opción Sectores
    const btnCerrarPanelSectores = document.getElementById("btn-cerrar-panel-sectores");
    if (btnCerrarPanelSectores) {
        btnCerrarPanelSectores.addEventListener("click", () => {
            if (panelSectores) panelSectores.style.display = "none";
        });
    }

    // INTERRUPTOR INTEGRAL DE ENCIENDE / APAGA TODO
    const btnToggleAllLayers = document.getElementById("btn-toggle-all-layers");
    if (btnToggleAllLayers) {
        btnToggleAllLayers.addEventListener("click", () => {
            // Evaluamos cuántas de las 7 capas en total están marcadas en este instante
            let checkedCount = matricesReferenciasMapeo.filter(item => {
                const cb = document.getElementById(item.id);
                return cb && cb.checked;
            }).length;
            if (chkSectores && chkSectores.checked) checkedCount++;

            // 🚀 INTUICIÓN MEJORADA: Si solo Sectores está activo (conteo <= 1), la intención del usuario es "Seleccionar Todo" (true)
            const nuevoEstadoObjetivo = checkedCount <= 1;

            matricesReferenciasMapeo.forEach(item => {
                const cb = document.getElementById(item.id);
                if (!cb) return;

                if (window.innerWidth <= 768 && item.id === "chk-layer-indices") {
                    cb.checked = false;
                    if (mapaInstancia) mapaInstancia.removeLayer(item.grupo);
                    return;
                }

                cb.checked = nuevoEstadoObjetivo;
                if (mapaInstancia) {
                    if (nuevoEstadoObjetivo) mapaInstancia.addLayer(item.grupo);
                    else mapaInstancia.removeLayer(item.grupo);
                }
            });

            if (chkSectores) {
                chkSectores.checked = nuevoEstadoObjetivo;
                if (mapaInstancia) {
                    if (nuevoEstadoObjetivo) mapaInstancia.addLayer(capaSectoresGroup);
                    else mapaInstancia.removeLayer(capaSectoresGroup);
                }
                if (panelSectores) {
                    panelSectores.style.display = (nuevoEstadoObjetivo && window.innerWidth > 768) ? "flex" : "none";
                }
            }

            if (nuevoEstadoObjetivo) {
                btnToggleAllLayers.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Desmarcar Todo`;
            } else {
                btnToggleAllLayers.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Seleccionar Todo`;
            }

            setTimeout(() => { if (mapaInstancia) mapaInstancia.invalidateSize(); }, 60);
        });
    }

    document.querySelectorAll(".tab-navigation .tab-item").forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll(".tab-navigation .tab-item").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            
            const targetVista = tab.getAttribute("data-vista");
            document.querySelectorAll(".map-pane-view").forEach(pane => pane.classList.remove("active"));
            
            if (targetVista === "mapa") {
                document.getElementById("pane-mapa-view").classList.add("active");
                setTimeout(() => { if (mapaInstancia) mapaInstancia.invalidateSize(); }, 50);
            } else {
                document.getElementById("pane-info-view").classList.add("active");
            }
        };
    });
}