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
const CURRENT_TENANT_ID = "aguayo";
let vecinoVinculadoId = null;
let estadoFiltroKPIActivo = "Todos";

const modalDonacion = document.getElementById("modal-ingreso-donacion");

auth.onAuthStateChanged(async (user) => {
    if (user) {
        actualizarPerfilLayout(user);
        await cargarDonacionesFirebase();
        inicializarComponentesDonaciones();
    }
});

// --- MOTOR DE ALERTAS PREMIUM (ACTUALIZADO CON MANEJADOR CALLBACK) ---
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
        if (alAceptar) alAceptar(); // Ejecuta el paso siguiente de forma fluida
    };
}

// --- INYECTOR DEL FORMULARIO DE REGISTRO TERRITORIAL AVANZADO (MODAL GRANDE) ---
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
                    <p style="color: rgba(255,255,255,0.8); font-weight: 500;">SIGEV-AGUAYO - Formulario de Registro Territorial Avanzado</p>
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
                            <div class="form-group"><label>Sector / Barrio Popular (Reconocimiento manual)</label><input type="text" id="fast-v-barrio" placeholder="Ej. El Parrón, Villa Los Troncos..."></div>
                        </div>
                    </div>

                    <div class="profile-panel" id="fast-panel-avanzados">
                        <div class="form-row-grid"><div class="form-group full-width"><label>Ocupación / Oficio</label><input type="text" id="fast-v-ocupacion" placeholder="Ej: Carpintero, Asesora del hogar, Jubilado..."></div></div>
                    </div>

                    <div class="profile-panel" id="fast-panel-adicional">
                        <div class="form-row-grid"><div class="form-group full-width"><label>Observaciones Críticas de Terreno</label><textarea id="fast-v-observaciones" rows="4" placeholder="Detalles de vulnerabilidad, condiciones de salud o apuntes de asistencia..."></textarea></div></div>
                    </div>

                    <div class="profile-panel" id="fast-panel-documentos">
                        <div style="text-align: center; padding: 20px; border: 2px dashed #cbd5e1; border-radius: 6px; background: #f8fafc; color: #64748b;">
                            <p style="font-size: 13px; margin: 0;">Los archivos adjuntos y escaneos de cédula digital se podrán indexar editando el perfil una vez consolidada el alta básica.</p>
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
        donacionesMemory.sort((a,b) => (b.fechaRegistro?.seconds || 0) - (a.fechaRegistro?.seconds || 0));
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

function inicializarComponentesDonaciones() {
    const inputRut = document.getElementById("donacion-vecino-rut");
    const inputNombre = document.getElementById("donacion-vecino-nombre");
    const btnGuardar = document.getElementById("btn-guardar-donacion");
    const btnLimpiar = document.getElementById("btn-limpiar-donacion");
    const form = document.getElementById("form-donacion");

    document.getElementById("btn-trigger-new-donacion").onclick = () => { if(modalDonacion) modalDonacion.style.display = "flex"; };
    document.getElementById("btn-cerrar-ingreso").onclick = () => { if(modalDonacion) modalDonacion.style.display = "none"; };
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
                    
                    // --- MODIFICADO: ALERTA INTERMEDIA ANTES DE DESPLEGAR EL EXPEDIENTE AVANZADO ---
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
        
        const ticketCodigo = `#${d.idVecino.substring(0,4).toUpperCase()}-${fDay}${fMonth}${fYear}-${d.id.substring(0,3).toUpperCase()}`.toLowerCase();

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
    const tbody = document.querySelector("#tabla-global-donaciones tbody");
    if (!tbody) return;

    const currentUser = auth.currentUser;
    const loggedName = currentUser ? (currentUser.displayName || currentUser.email) : "Equipo Territorial";
    const loggedPhoto = currentUser?.photoURL || "https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=50";

    let html = "";
    lista.forEach(d => {
        const dateObj = d.fechaRegistro ? new Date(d.fechaRegistro.seconds * 1000) : new Date();
        const fDay = String(dateObj.getDate()).padStart(2, '0');
        const fMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
        const fYear = String(dateObj.getFullYear()).slice(-2);
        
        const idTicket = `${d.idVecino.substring(0,4).toUpperCase()}-${fDay}${fMonth}${fYear}-${d.id.substring(0,3).toUpperCase()}`;

        let st = d.estado || "Finalizada";
        let classEstado = "finalizada";
        let textoEstado = "Entregado ✔";

        if (st === "En revisión") { classEstado = "revision"; textoEstado = "En revisión"; }
        else if (st === "En gestión") { classEstado = "gestion"; textoEstado = "En gestión"; }
        else if (st === "Vencida") { classEstado = "finalizada"; textoEstado = "Retrasado ⏳"; }

        const totalGastoFormateado = d.montoGasto ? `$${Number(d.montoGasto).toLocaleString('es-CL')}` : "$0";

        html += `
            <tr>
                <td><input type="checkbox"></td>
                <td style="white-space: nowrap; font-weight:700;"><a href="#" class="ticket-id donacion-hover-trigger" data-id="${d.id}" style="color:var(--primary-blue);">&#35;${idTicket}</a></td>
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
        btn.addEventListener("click", () => abrirEditorEspecificoDonacion(btn.getAttribute("data-id")));
    });

    configurarManejadoresHoverDonacion();
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
                await updateDoc(docRef, {
                    cantidad: modalOverlay.querySelector("#edit-donacion-cantidad").value.trim(),
                    montoGasto: Number(modalOverlay.querySelector("#edit-donacion-gasto").value) || 0,
                    estado: modalOverlay.querySelector("#edit-donacion-estado").value,
                    detalle: modalOverlay.querySelector("#edit-donacion-detalle").value.trim()
                });
                cerrarEd();
                mostrarAlertaPersonalizada("El registro de la donación ha sido modificado y sincronizado correctamente.", "success");
                await cargarDonacionesFirebase();
                aplicarFiltrosCruzados();
            } catch (err) { console.error(err); btnSave.disabled = false; btnSave.innerText = "Actualizar Aporte"; }
        };

    } catch (error) { console.error("Error al desplegar editor de donación:", error); }
}

function configurarManejadoresHoverDonacion() {
    const triggers = document.querySelectorAll(".donacion-hover-trigger");
    const hoverCard = document.getElementById("donacion-hover-card");
    if (!hoverCard) return;

    triggers.forEach(el => {
        el.addEventListener("mouseenter", (e) => {
            const id = e.currentTarget.getAttribute("data-id");
            const d = donacionesMemory.find(item => item.id === id);
            if (!d) return;

            hoverCard.innerHTML = `
                <div style="margin-bottom: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px;">
                    <h5 style="margin:0; font-size:13px; font-weight:700; color:var(--primary-blue);">Detalle de Entrega</h5>
                </div>
                <div style="font-size:11.5px; color:var(--text-dark); line-height:1.4;">
                    <div><b>Otorgado a:</b> ${d.nombreVecino}</div>
                    <div style="margin-top:4px; padding:6px; background:#f8fafc; border:1px solid var(--border-color); border-radius:4px; font-size:11px; white-space:pre-wrap;">${d.detalle || 'Sin observaciones registradas.'}</div>
                </div>`;

            const rect = e.currentTarget.getBoundingClientRect();
            hoverCard.style.top = `${rect.top + window.scrollY - 30}px`;
            hoverCard.style.left = `${rect.left + window.scrollX + 140}px`;
            hoverCard.style.display = "block";
        });

        el.addEventListener("mouseleave", () => { hoverCard.style.display = "none"; });
    });
}