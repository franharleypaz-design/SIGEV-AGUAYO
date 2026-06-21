// ==============================================================================
// SIGEV-AGUAYO - MOTOR CONTROLADOR DEL MÓDULO DE DONACIONES TERRITORIALES VINCULADAS
// ==============================================================================
import { auth, db } from "./app.js";
import {
    collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { actualizarPerfilLayout } from "./layout.js";
import { MAPEO_TERRITORIAL } from "./mapeoMunicipal.js";

let donacionesMemory = [];
const subdominioDetectado = window.location.hostname.split('.')[0];
// 🕵️‍♂️ DETECTOR MULTI-TENANT DINÁMICO CON OVERRIDE DE SESIÓN GLOBAL (PASAPORTE SUPREMO)
const CURRENT_TENANT_ID = sessionStorage.getItem('SIGEV_ACTIVE_TENANT') || ((subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado);
let vecinoVinculadoId = null;
let estadoFiltroKPIActivo = "Todos";
let registroSeleccionadoId = null;

// --- DICCIONARIO VISUAL DE SECTORES ---
const ETIQUETAS_SECTORES = {
    "Sector Territorial 1": "Sector Territorial 1 (UV 1)",
    "Sector Territorial 2": "Sector Territorial 2 (UV 2-3)",
    "Sector Territorial 3": "Sector Territorial 3 (UV 4-5)",
    "Sector Territorial 4": "Sector Territorial 4 (UV 14-15)",
    "Sector Territorial 5": "Sector Territorial 5 (UV 16-17)",
    "Sector Territorial 6": "Sector Territorial 6 (UV 18)",
    "No Sabe / Sin Información": "No Sabe / Sin Información"
};

const modalDonacion = document.getElementById("modal-ingreso-donacion");

// --- RECEPTOR DE AUTENTICACIÓN ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        actualizarPerfilLayout(user);
        await cargarDonacionesFirebase();
        inicializarComponentesDonaciones();
    }
});

// --- MOTOR DE CONTROL CENTRAL (COMPONENTES Y FILTROS) ---
function inicializarComponentesDonaciones() {
    // ⚙️ MANEJADOR DE ACORDEÓN PARA FILTROS EN CELULARES
    const btnToggleFiltros = document.getElementById("btn-toggle-filters-mobile");
    const tarjetaFiltros = document.querySelector(".filter-panel-card");
    if (btnToggleFiltros && tarjetaFiltros) {
        btnToggleFiltros.onclick = (e) => {
            e.preventDefault();
            tarjetaFiltros.classList.toggle("filters-expanded");
        };
    }

    const inputRut = document.getElementById("donacion-vecino-rut");
    const inputNombre = document.getElementById("donacion-vecino-nombre");
    const btnGuardar = document.getElementById("btn-guardar-donacion");
    const btnLimpiar = document.getElementById("btn-limpiar-donacion");
    const form = document.getElementById("form-donacion");

    document.getElementById("btn-trigger-new-donacion").onclick = () => { if (modalDonacion) modalDonacion.style.display = "flex"; };
    document.getElementById("btn-cerrar-ingreso").onclick = () => { if (modalDonacion) modalDonacion.style.display = "none"; };
    window.onclick = (e) => { if (e.target === modalDonacion) modalDonacion.style.display = "none"; };

    document.getElementById("filter-donacion-codigo").addEventListener("input", aplicarFiltrosCruzados);
    document.getElementById("filter-tipo").addEventListener("change", aplicarFiltrosCruzados);
    document.getElementById("filter-fecha-desde").addEventListener("change", aplicarFiltrosCruzados);
    document.getElementById("filter-fecha-hasta").addEventListener("change", aplicarFiltrosCruzados);

    document.getElementById("btn-reset-filters").onclick = () => {
        document.getElementById("filter-donacion-codigo").value = "";
        document.getElementById("filter-tipo").value = "Todos";
        document.getElementById("filter-fecha-desde").value = "";
        document.getElementById("filter-fecha-hasta").value = "";
        estadoFiltroKPIActivo = "Todos";
        document.querySelectorAll(".mini-kpi-card").forEach(c => c.style.borderColor = "var(--border-color)");
        aplicarFiltrosCruzados();
    };

    document.querySelectorAll(".mini-kpi-card").forEach(card => {
        card.addEventListener("click", () => {
            document.querySelectorAll(".mini-kpi-card").forEach(c => c.style.borderColor = "var(--border-color)");
            const targetFilter = card.getAttribute("data-filter");
            if (estadoFiltroKPIActivo === targetFilter) {
                estadoFiltroKPIActivo = "Todos";
            } else {
                estadoFiltroKPIActivo = targetFilter;
                card.style.borderColor = "#0b438c";
            }
            aplicarFiltrosCruzados();
        });
    });

    if (inputRut) {
        inputRut.addEventListener("input", (e) => {
            let value = e.target.value.replace(/[^0-9kK]/g, '');
            if (value.length > 1) {
                e.target.value = value.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + value.slice(-1).toUpperCase();
            } else { e.target.value = value.toUpperCase(); }
        });

        inputRut.addEventListener("blur", async () => {
            const rutTipeado = inputRut.value.trim();
            if (!rutTipeado) return;
            const raw = rutTipeado.replace(/[^0-9kK]/g, "").toUpperCase();
            const formatB = raw.length > 1 ? (raw.slice(0, -1) + "-" + raw.slice(-1)) : raw;

            try {
                const qV = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID), where("rut", "in", [raw, formatB, rutTipeado]));
                const snapVecino = await getDocs(qV);

                if (!snapVecino.empty) {
                    const vecinoDoc = snapVecino.docs[0];
                    vecinoVinculadoId = vecinoDoc.id;
                    if (inputNombre) inputNombre.value = vecinoDoc.data().nombreCompleto;
                    if (btnGuardar) btnGuardar.disabled = false;
                } else {
                    vecinoVinculadoId = null;
                    if (inputNombre) inputNombre.value = "";
                    if (btnGuardar) btnGuardar.disabled = true;

                    mostrarAlertaPersonalizada(
                        "El RUT ingresado no figura en el padrón. Se abrirá la ficha de registro territorial avanzado para dar de alta al vecino antes de procesar la donación.",
                        "info",
                        () => {
                            abrirConsolaAltaAvanzadaVecino(rutTipeado);
                        }
                    );
                }
            } catch (err) { console.error(err); }
        });
    }

    if (btnLimpiar) {
        btnLimpiar.onclick = () => { if (form) form.reset(); vecinoVinculadoId = null; btnGuardar.disabled = true; };
    }

    if (btnGuardar) {
        btnGuardar.onclick = async () => {
            const tipo = document.getElementById("donacion-tipo").value;
            const cantidad = document.getElementById("donacion-cantidad").value.trim();
            const gastoInput = document.getElementById("donacion-gasto").value.trim();
            const detalle = document.getElementById("donacion-detalle").value.trim();
            const estadoForm = document.getElementById("donacion-estado").value;

            if (!vecinoVinculadoId || !tipo || !cantidad) return;
            btnGuardar.disabled = true; btnGuardar.innerText = "Sincronizando...";

            try {
                const payload = {
                    idVecino: vecinoVinculadoId,
                    nombreVecino: inputNombre.value,
                    rutVecino: inputRut.value,
                    tipoDonacion: tipo,
                    cantidad: cantidad,
                    montoGasto: Number(gastoInput) || 0,
                    detalle: detalle,
                    estado: estadoForm,
                    tenantId: CURRENT_TENANT_ID,
                    fechaRegistro: serverTimestamp(),
                    registradoPor: auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email) : "Equipo Territorial"
                };

                await addDoc(collection(db, "donaciones"), payload);
                if (modalDonacion) modalDonacion.style.display = "none";
                if (form) form.reset();
                vecinoVinculadoId = null;
                btnGuardar.disabled = true;

                mostrarAlertaPersonalizada("El aporte social ha sido registrado y adjudicado en la bitácora del vecino.", "success");
                await cargarDonacionesFirebase();
                aplicarFiltrosCruzados();
            } catch (err) { console.error(err); btnGuardar.disabled = false; }
            finally { btnGuardar.innerText = "Registrar Aporte"; }
        };
    }

    aplicarFiltrosCruzados();
}

// --- MOTOR DE ALERTAS PREMIUM ---
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

// --- INYECTOR DEL FORMULARIO DE REGISTRO TERRITORIAL AVANZADO ---
function abrirConsolaAltaAvanzadaVecino(rutAsignado) {
    const overlayAvanzado = document.createElement("div");
    overlayAvanzado.className = "profile-modal-overlay";
    overlayAvanzado.style.zIndex = "1600";

    let opcionesSectoresHTML = `<option value="">Seleccione Sector</option>`;
    Object.keys(MAPEO_TERRITORIAL).forEach(sec => {
        opcionesSectoresHTML += `<option value="${sec}">${sec}</option>`;
    });

    overlayAvanzado.innerHTML = `
        <div class="profile-modal-card" style="max-width: 760px; width: 95%;">
            <div class="profile-modal-header" style="background-color: #0b438c; padding: 20px 32px;">
                <div class="profile-header-info">
                    <h3 style="font-size: 18px; color: #fff;">Ingreso de Nuevo Vecino</h3>
                    <p style="color: rgba(255,255,255,0.8); font-weight: 500;">SIGEV-AGUAYO - Formulario de Registro Territorial Advanced</p>
                </div>
                <button class="btn-profile-close btn-close-fast-v" style="top: 16px; right: 16px;">&times;</button>
            </div>
            
            <div class="profile-modal-tabs" style="padding: 0 32px; background: #fff; border-bottom: 1px solid var(--border-color);">
                <div class="profile-tab active" data-target="fast-panel-basicos">Datos Básicos</div>
                <div class="profile-tab" data-target="fast-panel-avanzados">Datos Avanzados</div>
                <div class="profile-tab" data-target="fast-panel-adicional">Información Adicional</div>
                <div class="profile-tab" data-target="fast-panel-documentos">Documentos</div>
            </div>

            <div class="profile-modal-body" style="padding: 24px 32px; background: #fff; max-height: 480px; overflow-y: auto;">
                <form id="form-alta-avanzada-v">
                    
                    <div class="profile-panel active" id="fast-panel-basicos">
                        <div style="display: flex; gap: 20px; margin-bottom: 16px; flex-wrap: wrap;">
                            <div style="width: 140px; height: 140px; border: 2px dashed #cbd5e1; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #64748b; font-size: 11px; text-align: center; padding: 10px; cursor: not-allowed; background: #f8fafc;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom:6px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                                <b>Subir foto</b><br>PNG, JPG hasta 5MB
                            </div>
                            <div style="flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; min-width: 280px;">
                                <div class="form-group"><label>RUT *</label><input type="text" id="fast-v-rut" value="${rutAsignado}" readonly style="background-color: #f1f5f9; cursor: not-allowed; font-weight: 700;"></div>
                                <div class="form-group"><label>Nombre completo *</label><input type="text" id="fast-v-nombre" placeholder="Ej. Juan Pérez" required></div>
                                <div class="form-group"><label>Teléfono</label><input type="text" id="fast-v-telefono" placeholder="Ej. +56 9 1234 5678"></div>
                                <div class="form-group"><label>Fecha de nacimiento</label><input type="date" id="fast-v-nacimiento"></div>
                            </div>
                        </div>
                        <div class="form-row-grid" style="margin-bottom: 16px;">
                            <div class="form-group full-width"><label>Correo electrónico</label><input type="email" id="fast-v-correo" placeholder="ej. juan@email.com"></div>
                        </div>
                        <div class="form-row-grid" style="margin-bottom: 16px;">
                            <div class="form-group full-width"><label>Dirección</label><input type="text" id="fast-v-direccion" placeholder="Ej. Av. Lo Ovalle 1234"></div>
                        </div>
                        <div class="form-row-grid" style="margin-bottom: 16px;">
                            <div class="form-group"><label>Sector Territorial</label><select id="fast-v-sector">${opcionesSectoresHTML}</select></div>
                            <div class="form-group"><label>Unidad Vecinal (UV)</label><select id="fast-v-uv" disabled><option value="">Seleccione primero el sector</option></select></div>
                        </div>
                        <div class="form-row-grid" style="margin-bottom: 0;">
                            <div class="form-group"><label>Junta de Vecinos</label><select id="fast-v-junta" disabled><option value="">Seleccione primero la UV</option></select></div>
                            <div class="form-group"><label>Sector / Barrio Popular</label><input type="text" id="fast-v-barrio" placeholder="Ej. El Parrón, Villa Los Troncos..."></div>
                        </div>
                    </div>

                    <div class="profile-panel" id="fast-panel-avanzados">
                        <div class="form-row-grid"><div class="form-group full-width"><label>Ocupación / Oficio</label><input type="text" id="fast-v-ocupacion" placeholder="Ej: Carpintero, Asesora, Jubilado..."></div></div>
                    </div>

                    <div class="profile-panel" id="fast-panel-adicional">
                        <div class="form-row-grid"><div class="form-group full-width"><label>Observaciones Críticas de Terreno</label><textarea id="fast-v-observaciones" rows="4" placeholder="Detalles de vulnerabilidad, condiciones de salud..."></textarea></div></div>
                    </div>

                    <div class="profile-panel" id="fast-panel-documentos">
                        <div style="text-align: center; padding: 20px; border: 2px dashed #cbd5e1; border-radius: 6px; background: #f8fafc; color: #64748b;">
                            <p style="font-size: 13px; margin: 0;">Los archivos adjuntos se podrán indexar editando el perfil una vez consolidada el alta básica.</p>
                        </div>
                    </div>

                </form>
            </div>
            
            <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                <button type="button" class="btn btn-secondary btn-close-fast-v">Limpiar</button>
                <button type="button" class="btn btn-primary btn-guardar-fast-v" style="background-color: #0b438c;">Guardar vecino</button>
            </div>
        </div>`;

    document.body.appendChild(overlayAvanzado);

    const tabs = overlayAvanzado.querySelectorAll(".profile-tab");
    const panels = overlayAvanzado.querySelectorAll(".profile-panel");
    tabs.forEach(t => t.addEventListener("click", () => {
        tabs.forEach(tab => tab.classList.remove("active"));
        panels.forEach(p => p.classList.remove("active"));
        t.classList.add("active");
        overlayAvanzado.querySelector(`#${t.getAttribute("data-target")}`).classList.add("active");
    }));

    const sSector = overlayAvanzado.querySelector("#fast-v-sector");
    const sUv = overlayAvanzado.querySelector("#fast-v-uv");
    const sJunta = overlayAvanzado.querySelector("#fast-v-junta");

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

    const cerrarYLimpiarFast = () => {
        overlayAvanzado.remove();
        document.getElementById("donacion-vecino-rut").value = "";
        document.getElementById("donacion-vecino-rut").focus();
    };
    overlayAvanzado.querySelectorAll(".btn-close-fast-v").forEach(btn => btn.onclick = cerrarYLimpiarFast);

    const btnGuardarFast = overlayAvanzado.querySelector(".btn-guardar-fast-v");
    btnGuardarFast.onclick = async () => {
        const nombreV = overlayAvanzado.querySelector("#fast-v-nombre").value.trim();
        if (!nombreV) {
            overlayAvanzado.querySelector("#fast-v-nombre").style.borderColor = "#ef4444";
            return;
        }

        btnGuardarFast.disabled = true;
        btnGuardarFast.innerText = "Sincronizando...";

        try {
            const nuevoVecinoPayload = {
                nombreCompleto: nombreV,
                rut: rutAsignado,
                telefono: overlayAvanzado.querySelector("#fast-v-telefono").value.trim() || "No registrado",
                fechaNacimiento: overlayAvanzado.querySelector("#fast-v-nacimiento").value || "",
                correo: overlayAvanzado.querySelector("#fast-v-correo").value.trim() || "",
                direccion: overlayAvanzado.querySelector("#fast-v-direccion").value.trim() || "No registrada",
                sectorTerritorial: sSector.value || "No Sabe / Sin Información",
                unidadVecinal: sUv.value || "Sin Información",
                juntaVecinos: sJunta.value || "Sin Información",
                barrioPopular: overlayAvanzado.querySelector("#fast-v-barrio").value.trim() || "Sin Información",
                ocupacion: overlayAvanzado.querySelector("#fast-v-ocupacion").value.trim() || "",
                observaciones: overlayAvanzado.querySelector("#fast-v-observaciones").value.trim() || "",
                fotoPerfil: "",
                tenantId: CURRENT_TENANT_ID,
                fechaRegistro: serverTimestamp()
            };

            const docRefNewVecino = await addDoc(collection(db, "vecinos"), nuevoVecinoPayload);

            vecinoVinculadoId = docRefNewVecino.id;
            document.getElementById("donacion-vecino-nombre").value = nombreV;
            document.getElementById("btn-guardar-donacion").disabled = false;

            overlayAvanzado.remove();
            mostrarAlertaPersonalizada(`Expediente avanzado creado con éxito para ${nombreV}. La donación ya puede ser procesada.`, "success");
        } catch (err) {
            console.error(err);
            btnGuardarFast.disabled = false;
            btnGuardarFast.innerText = "Guardar vecino";
        }
    };
}

async function cargarDonacionesFirebase() {
    try {
        const q = query(collection(db, "donaciones"), where("tenantId", "==", CURRENT_TENANT_ID));
        const snap = await getDocs(q);
        donacionesMemory = [];
        snap.forEach(dDoc => {
            donacionesMemory.push({ id: dDoc.id, ...dDoc.data() });
        });
        donacionesMemory.sort((a, b) => (b.fechaRegistro?.seconds || 0) - (a.fechaRegistro?.seconds || 0));
        renderizarMetricasKPI();
    } catch (error) {
        console.error("Error al compilar bitácora de donaciones:", error);
    }
}

function renderizarMetricasKPI() {
    let totales = { "Todos": 0, "En revisión": 0, "En gestión": 0, "Finalizada": 0, "Vencida": 0 };
    donacionesMemory.forEach(d => {
        totales["Todos"]++;
        let st = d.estado || "Finalizada";
        if (totales[st] !== undefined) totales[st]++;
    });
    document.getElementById("count-total").innerText = totales["Todos"];
    document.getElementById("count-revision").innerText = totales["En revisión"];
    document.getElementById("count-gestion").innerText = totales["En gestión"];
    document.getElementById("count-finalizadas").innerText = totales["Finalizada"];
    document.getElementById("count-vencidas").innerText = totales["Vencida"];
}

function aplicarFiltrosCruzados() {
    const codFiltro = document.getElementById("filter-donacion-codigo").value.toLowerCase();
    const tipoSelect = document.getElementById("filter-tipo").value;
    const fDesde = document.getElementById("filter-fecha-desde").value;
    const fHasta = document.getElementById("filter-fecha-hasta").value;

    let filtrados = donacionesMemory.filter(d => {
        const dateObj = d.fechaRegistro ? new Date(d.fechaRegistro.seconds * 1000) : new Date();
        const fDay = String(dateObj.getDate()).padStart(2, '0');
        const fMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
        const fYear = String(dateObj.getFullYear()).slice(-2);

        const ticketCodigo = `#${d.idVecino.substring(0, 4).toUpperCase()}-${fDay}${fMonth}${fYear}-${d.id.substring(0, 3).toUpperCase()}`.toLowerCase();

        let st = d.estado || "Finalizada";

        if (codFiltro && !ticketCodigo.includes(codFiltro)) return false;
        if (estadoFiltroKPIActivo !== "Todos" && st !== estadoFiltroKPIActivo) return false;
        if (tipoSelect !== "Todos" && d.tipoDonacion !== tipoSelect) return false;

        if (d.fechaRegistro) {
            const fechaDonacion = new Date(d.fechaRegistro.seconds * 1000);
            if (fDesde) {
                const desde = new Date(fDesde + "T00:00:00");
                if (fechaDonacion < desde) return false;
            }
            if (fHasta) {
                const hasta = new Date(fHasta + "T23:59:59");
                if (fechaDonacion > hasta) return false;
            }
        }
        return true;
    });

    renderizarFilasTabla(filtrados);
}

function renderizarFilasTabla(lista) {
    const tbody = document.querySelector("#tabla-global-donaciones tbody") || document.querySelector("#tabla-donaciones tbody"); if (!tbody) return;

    const currentUser = auth.currentUser;
    const loggedName = currentUser ? (currentUser.displayName || currentUser.email) : "Equipo Territorial";
    const loggedPhoto = currentUser?.photoURL || "https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=50";

    let html = "";
    lista.forEach(d => {
        const dateObj = d.fechaRegistro ? new Date(d.fechaRegistro.seconds * 1000) : new Date();
        const fDay = String(dateObj.getDate()).padStart(2, '0');
        const fMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
        const fYear = String(dateObj.getFullYear()).slice(-2);

        const idTicket = `${d.idVecino.substring(0, 4).toUpperCase()}-${fDay}${fMonth}${fYear}-${d.id.substring(0, 3).toUpperCase()}`;

        let st = d.estado || "Finalizada";
        let classEstado = "finalizada";
        let textoEstado = "Entregado ✔";

        if (st === "En revisión") { classEstado = "revision"; textoEstado = "En revisión"; }
        else if (st === "En gestión") { classEstado = "gestion"; textoEstado = "En gestión"; }
        else if (st === "Vencida") { classEstado = "finalizada"; textoEstado = "Retrasado ⏳"; }

        const totalGastoFormateado = d.montoGasto ? `$${Number(d.montoGasto).toLocaleString('es-CL')}` : "$0";

        html += `
            <tr data-id="${d.id}" class="donacion-row-item" style="cursor: pointer; border-bottom: 1px solid #f1f5f9;">
                <td><input type="checkbox" onclick="event.stopPropagation();"></td>
                <td style="white-space: nowrap; font-weight:700;"><span style="color:var(--primary-blue);">&#35;${idTicket}</span></td>
                <td><span class="stacked-cell-primary">${dateObj.toLocaleDateString('es-CL')}</span><span class="stacked-cell-secondary">${dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span></td>
                <td><span class="stacked-cell-primary">${d.nombreVecino}</span><span class="stacked-cell-secondary">RUT: ${d.rutVecino}</span></td>
                <td><span class="badge-donacion-tipo">${d.tipoDonacion}</span></td>
                <td>
                    <span class="stacked-cell-primary" style="font-weight:700;">${d.cantidad}</span>
                    <span class="stacked-cell-secondary" style="color:var(--primary-blue); font-weight:700;">Costo: ${totalGastoFormateado}</span>
                </td>
                <td style="text-align:center;"><span class="badge-status ${classEstado}">${textoEstado}</span></td>
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <img src="${loggedPhoto}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">
                        <span style="font-size:12.5px; font-weight:600;">${d.registradoPor || loggedName}</span>
                    </div>
                </td>
                <td style="text-align:center; color:#94a3b8; font-weight:bold; cursor:pointer;" class="btn-editar-donacion-trigger" data-id="${d.id}">...</td>
            </tr>`;
    });

    tbody.innerHTML = html || `<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-light);">No se registran donaciones bajo este filtro.</td></tr>`;
    document.getElementById("pagination-info-text").innerText = `Mostrando 1 a ${lista.length} de ${lista.length} aportes`;

    tbody.querySelectorAll(".btn-editar-donacion-trigger").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            abrirEditorEspecificoDonacion(btn.getAttribute("data-id"));
        });
    });

    // ASIGNACIÓN RECOLECTORA REACTIVA DEL CLIC EN LA FILA
    document.querySelectorAll(".donacion-row-item").forEach(row => {
        row.onclick = (e) => {
            if (e.target.type === "checkbox" || e.target.classList.contains("btn-editar-donacion-trigger")) return;

            document.querySelectorAll(".donacion-row-item").forEach(r => r.style.background = "");
            row.style.background = "rgba(37, 99, 235, 0.04)";

            const id = row.getAttribute("data-id");
            const registro = donacionesMemory.find(d => d.id === id);
            if (registro) {
                registroSeleccionadoId = id;
                
                // Forzar despliegue estructural en móviles antes de inyectar datos
                const panelContenido = document.getElementById("panel-contenido-donaciones");
                if (panelContenido) panelContenido.style.setProperty("display", "flex", "important");

                desplegarBarraLateralDonacion(registro);
            }
        };
    });
}

function desplegarBarraLateralDonacion(don) {
    document.getElementById("panel-vacio-donaciones").style.display = "none";
    const panelContenido = document.getElementById("panel-contenido-donaciones");
    panelContenido.style.display = "flex";

    // 🚀 INYECCIÓN DINÁMICA DE LA "X" DE CIERRE ADAPTADA PARA POP-UP MÓVIL (OCULTA EN PC)
    let btnCerrarM = document.getElementById("btn-cerrar-panel-mobile");
    if (!btnCerrarM) {
        btnCerrarM = document.createElement("button");
        btnCerrarM.id = "btn-cerrar-panel-mobile";
        btnCerrarM.style.display = "none"; 
        btnCerrarM.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" width="16" height="16">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
        panelContenido.appendChild(btnCerrarM);
    }
    btnCerrarM.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        panelContenido.style.display = "none";
        document.querySelectorAll(".donacion-row-item").forEach(r => r.style.background = "");
    };

    const dateObj = don.fechaRegistro ? new Date(don.fechaRegistro.seconds * 1000) : new Date();
    const fDay = String(dateObj.getDate()).padStart(2, '0');
    const fMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
    const fYear = String(dateObj.getFullYear()).slice(-2);
    const idTicket = `${don.idVecino.substring(0, 4).toUpperCase()}-${fDay}${fMonth}${fYear}-${don.id.substring(0, 3).toUpperCase()}`;

    document.getElementById("detail-donacion-tipo").innerText = don.tipoDonacion || "Ayuda Social";
    document.getElementById("detail-donacion-codigo").innerText = idTicket;
    document.getElementById("detail-donacion-vecino").innerText = don.nombreVecino || "No registrado";
    document.getElementById("detail-donacion-rut").innerText = don.rutVecino || "Sin RUN asignado";
    document.getElementById("detail-donacion-asignado").innerText = don.registradoPor || "Gabinete en Terreno";
    document.getElementById("detail-donacion-cantidad").innerText = don.cantidad || "1 Unidad";

    const costo = don.montoGasto || 0;
    document.getElementById("detail-donacion-costo").innerText = costo > 0 ? `$${Number(costo).toLocaleString('es-CL')}` : "$0";

    document.getElementById("detail-donacion-notas").innerText = don.detalle || "Sin observaciones adicionales.";

    const elEstado = document.getElementById("detail-donacion-estado");
    let st = don.estado || "Finalizada";

    if (st === "En revisión") {
        elEstado.innerText = "En revisión";
        elEstado.style.cssText = "margin-left: auto; background: #fff7ed; color: #c2410c; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px;";
    } else if (st === "En gestión") {
        elEstado.innerText = "En gestión";
        elEstado.style.cssText = "margin-left: auto; background: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px;";
    } else if (st === "Vencida") {
        elEstado.innerText = "Retrasado ⏳";
        elEstado.style.cssText = "margin-left: auto; background: #fef2f2; color: #991b1b; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px;";
    } else {
        elEstado.innerText = "Entregado ✔";
        elEstado.style.cssText = "margin-left: auto; background: #f0fdf4; color: #166534; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px;";
    }

    // 🚀 DISPARAR EL EDITOR AVANZADO MODAL AL PRESIONAR "ACTUALIZAR ESTADO"
    const btnActualizarEstado = document.getElementById("action-donacion-entregar");
    if (btnActualizarEstado) {
        btnActualizarEstado.onclick = () => {
            // Cierra temporalmente el panel lateral en móviles para no solapar modales
            const panelCont = document.getElementById("panel-contenido-donaciones");
            if (window.innerWidth <= 768 && panelCont) {
                panelCont.style.display = "none";
            }
            abrirEditorEspecificoDonacion(don.id);
        };
    }

    // 🚀 CONECTAR EL BOTÓN "VER FICHA VECINO" (AHORA ABRE EL MODAL VISOR)
    const btnVerVecino = document.getElementById("action-ver-vecino-donacion");
    if (btnVerVecino) {
        btnVerVecino.onclick = () => {
            if (don.idVecino) {
                // Cierra temporalmente el panel lateral en móviles
                const panelCont = document.getElementById("panel-contenido-donaciones");
                if (window.innerWidth <= 768 && panelCont) {
                    panelCont.style.display = "none";
                }
                // Abre el visor del expediente
                abrirVisorVecino(don.idVecino);
            } else {
                mostrarAlertaPersonalizada("Esta donación no tiene un expediente de vecino enlazado.", "error");
            }
        };
    }
}

async function abrirEditorEspecificoDonacion(idDonacion) {
    try {
        const docRef = doc(db, "donaciones", idDonacion);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return;

        const d = docSnap.data();

        const modalOverlay = document.createElement("div");
        modalOverlay.className = "profile-modal-overlay";
        modalOverlay.style.zIndex = "1600";

        modalOverlay.innerHTML = `
            <div class="profile-modal-card" style="max-width: 540px;">
                <div class="profile-modal-header" style="background: linear-gradient(135deg, #1e293b, #0b438c); padding: 20px 32px;">
                    <div class="profile-header-info">
                        <h3 style="font-size: 18px; color: #fff;">Gestionar Aporte Entregado</h3>
                        <p style="color: rgba(255,255,255,0.8);">Beneficiario: ${d.nombreVecino} (RUT: ${d.rutVecino})</p>
                    </div>
                    <button class="btn-profile-close" style="top: 16px; right: 16px;">&times;</button>
                </div>
                <div class="profile-modal-body" style="padding: 24px 32px; background: #fff;">
                    <div class="form-row-grid" style="margin-bottom: 16px;">
                        <div class="form-group">
                            <label style="font-weight:700;">Cantidad / Volumen</label>
                            <input type="text" id="edit-donacion-cantidad" value="${d.cantidad}">
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700;">Monto Gasto ($)</label>
                            <input type="number" id="edit-donacion-gasto" value="${d.montoGasto || 0}">
                        </div>
                    </div>
                    <div class="form-row-grid" style="margin-bottom: 16px;">
                        <div class="form-group full-width">
                            <label style="font-weight:700;">Estado de la Entrega</label>
                            <select id="edit-donacion-estado" style="font-weight:700; color:#0b438c;">
                                <option value="En revisión" ${d.estado === 'En revisión' ? 'selected' : ''}>En revisión / Proceso de asignación</option>
                                <option value="En gestión" ${d.estado === 'En gestión' ? 'selected' : ''}>En gestión / Distribución en ruta</option>
                                <option value="Finalizada" ${d.estado === 'Finalizada' ? 'selected' : ''}>Finalizada / Entregado ✔</option>
                                <option value="Vencida" ${d.estado === 'Vencida' ? 'selected' : ''}>Vencida / Pendiente crítico</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row-grid" style="margin-bottom: 0;">
                        <div class="form-group full-width">
                            <label style="font-weight:600;">Detalles u Observaciones de Terreno</label>
                            <textarea id="edit-donacion-detalle" rows="2">${d.detalle || ''}</textarea>
                        </div>
                    </div>
                </div>
                <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                    <button type="button" class="btn btn-secondary btn-close-ed">Cancelar</button>
                    <button type="button" class="btn btn-primary btn-save-ed" style="background-color: #0b438c;">Actualizar Aporte</button>
                </div>
            </div>`;

        document.body.appendChild(modalOverlay);

        const cerrarEd = () => modalOverlay.remove();
        modalOverlay.querySelector(".btn-profile-close").onclick = cerrarEd;
        modalOverlay.querySelector(".btn-close-ed").onclick = cerrarEd;

        const btnSave = modalOverlay.querySelector(".btn-save-ed");
        btnSave.onclick = async () => {
            btnSave.disabled = true; btnSave.innerText = "Guardando...";
            try {
                const upData = {
                    cantidad: modalOverlay.querySelector("#edit-donacion-cantidad").value.trim(),
                    montoGasto: Number(modalOverlay.querySelector("#edit-donacion-gasto").value) || 0,
                    estado: modalOverlay.querySelector("#edit-donacion-estado").value,
                    detalle: modalOverlay.querySelector("#edit-donacion-detalle").value.trim()
                };
                await updateDoc(docRef, upData);
                cerrarEd();
                mostrarAlertaPersonalizada("El registro de la donación ha sido modificado y sincronizado correctamente.", "success");
                await cargarDonacionesFirebase();
                aplicarFiltrosCruzados();

                if (registroSeleccionadoId === idDonacion) {
                    const reqRefresh = donacionesMemory.find(item => item.id === idDonacion);
                    if (reqRefresh) desplegarBarraLateralDonacion(reqRefresh);
                }
            } catch (err) { console.error(err); btnSave.disabled = false; btnSave.innerText = "Actualizar Aporte"; }
        };

    } catch (error) { console.error("Error al desplegar editor de donación:", error); }
}

// 🚀 FUNCIÓN: MODAL VISOR DE PERFIL VECINAL (ESTILO EXPEDIENTE DIGITAL)
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