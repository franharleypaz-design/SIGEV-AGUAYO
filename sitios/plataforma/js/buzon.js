// ==============================================================================
// SIGEV-AGUAYO - CONTROLADOR CENTRAL DEL BUZÓN CIUDADANO (TRIAGE INTELIGENTE)
// ==============================================================================
import { auth, db } from "./app.js";
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { actualizarPerfilLayout } from "./layout.js";

const TENANT_ID = "aguayo";
let listaRegistrosBuzon = [];
let registroSeleccionadoId = null;
let filtroEstadoActual = "Nuevo";

// Variables maestras de rastreo de expediente verificado
let vecinoIdActualDetectado = null; 
let vecinoVerificadoData = null; // Almacena Nombre Real e ID de Expediente central

const tablaCuerpo = document.querySelector("#tabla-buzon tbody");
const searchInput = document.getElementById("buzon-search");
const selectTipo = document.getElementById("buzon-filter-tipo");
const sidebarDetalle = document.getElementById("buzon-detail-sidebar");

auth.onAuthStateChanged((user) => {
    if (user) {
        actualizarPerfilLayout(user);
        inicializarComponentesBuzon();
        escucharColeccionBuzonCloud();
    } else {
        window.location.href = "index.html";
    }
});

function inicializarComponentesBuzon() {
    document.querySelectorAll(".tab-navigation .tab-item").forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll(".tab-navigation .tab-item").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            filtroEstadoActual = tab.getAttribute("data-estado");
            renderizarTablaBuzonFiltrada();
        };
    });

    if (searchInput) searchInput.oninput = renderizarTablaBuzonFiltrada;
    if (selectTipo) selectTipo.onchange = renderizarTablaBuzonFiltrada;

    // Vinculación de estados base
    document.getElementById("btn-cambiar-revision").onclick = marcarTicketEnRevision;
    document.getElementById("action-archivar").onclick = () => actualizarEstadoTicketSeleccionado("Archivado");
    document.getElementById("action-crear-vecino").onclick = clonarFichaVecinal;
    document.getElementById("action-cambiar-clasificacion").onclick = cambiarClasificacionOrigen;
    
    // Conexión de motores de triage avanzados hacia Firebase
    document.getElementById("action-convertir-solicitud").onclick = transformarEnSolicitudMunicipal;
    document.getElementById("action-crear-donacion").onclick = transformarEnDonacionTerritorial;
    document.getElementById("action-caso-social").onclick = transformarEnCasoSocial;
}

function escucharColeccionBuzonCloud() {
    const q = query(collection(db, "buzon_ciudadano"), where("tenantId", "==", TENANT_ID));
    
    onSnapshot(q, (snapshot) => {
        listaRegistrosBuzon = [];
        let countNuevo = 0;
        let countRevision = 0;

        snapshot.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            listaRegistrosBuzon.push(data);

            if (data.estado === "Nuevo") countNuevo++;
            if (data.estado === "En Revisión") countRevision++;
        });

        const bNuevo = document.getElementById("badge-count-nuevo");
        const bRevision = document.getElementById("badge-count-revision");
        if (bNuevo) bNuevo.innerText = countNuevo;
        if (bRevision) bRevision.innerText = countRevision;

        renderizarTablaBuzonFiltrada();
        
        if (registroSeleccionadoId) {
            const actualizado = listaRegistrosBuzon.find(r => r.id === registroSeleccionadoId);
            if (actualizado) desplegarBarraLateralDetalle(actualizado);
        }
    });
}

// 🌐 FUNCIÓN DE AUXILIO EN NORMALIZACIÓN DE CATEGORÍAS (Para filtrado y renders limpios)
function obtenerTipoCompacto(tipoOriginal) {
    if (!tipoOriginal) return "Otro";
    if (tipoOriginal.includes("Apoyo") || tipoOriginal === "Petición") return "Apoyo";
    if (tipoOriginal.includes("Reclamo") || tipoOriginal === "Reclamo") return "Reclamo";
    if (tipoOriginal.includes("Idea") || tipoOriginal.includes("Iniciativa") || tipoOriginal === "Sugerencia") return "Iniciativa";
    if (tipoOriginal.includes("agradecimiento") || tipoOriginal === "Felicitación") return "Agradecimiento";
    if (tipoOriginal.includes("Denuncia")) return "Denuncia";
    return "Otro";
}

function renderizarTablaBuzonFiltrada() {
    if (!tablaCuerpo) return;
    
    const textoBuscar = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const tipoFiltrado = selectTipo ? selectTipo.value : "Todos";

    const registrosFiltrados = listaRegistrosBuzon.filter(reg => {
        const matchesEstado = reg.estado === filtroEstadoActual;
        
        // Normalizar tipo de datos dinámicos antes de pasar las reglas de discriminación del filtro select
        const tipoCompactado = obtenerTipoCompacto(reg.tipo);
        const matchesTipo = tipoFiltrado === "Todos" || tipoCompactado === tipoFiltrado;
        
        const matchesBusqueda = !textoBuscar || 
                                reg.nombre.toLowerCase().includes(textoBuscar) || 
                                reg.asunto.toLowerCase().includes(textoBuscar) || 
                                reg.descripcion.toLowerCase().includes(textoBuscar);
        return matchesEstado && matchesTipo && matchesBusqueda;
    });

    if (registrosFiltrados.length === 0) {
        tablaCuerpo.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">No se registran elementos en esta bandeja con los filtros seleccionados.</td></tr>`;
        return;
    }

    let html = "";
    registrosFiltrados.forEach(reg => {
        const fechaFormateada = reg.fecha ? new Date(reg.fecha.seconds * 1000).toLocaleDateString('es-CL') : 'Pendiente';
        
        // Configuración mapeada de insignias estéticas de categoría
        const tipoCompactado = obtenerTipoCompacto(reg.tipo);
        let tipoBadge = { text: "••• OTROS", bg: "#f1f5f9", color: "#475569" };

        if (tipoCompactado === "Apoyo") {
            tipoBadge = { text: "🎁 Apoyo", bg: "#eff6ff", color: "#1d4ed8" };
        } else if (tipoCompactado === "Reclamo") {
            tipoBadge = { text: "⚠️ Reclamo", bg: "#fff7ed", color: "#c2410c" };
        } else if (tipoCompactado === "Iniciativa") {
            tipoBadge = { text: "💡 Iniciativa", bg: "#fef8e7", color: "#b45309" };
        } else if (tipoCompactado === "Agradecimiento") {
            tipoBadge = { text: "❤️ Agradecimiento", bg: "#fdf2f8", color: "#be185d" };
        } else if (tipoCompactado === "Denuncia") {
            tipoBadge = { text: "📣 Denuncia", bg: "#fef2f2", color: "#b91c1c" };
        }

        // CONTROL VISUAL EN VERDE SI POSEE UN EXPEDIENTE DE VECINO ACTIVADO
        const tieneExpediente = reg.tieneExpediente === true || reg.expedienteExiste === true;
        const estiloRut = tieneExpediente 
            ? "color: #059669; font-weight: 700; background: #f0fdf4; padding: 4px 8px; border-radius: 6px; font-size: 12.5px;" 
            : "color: #334155; font-weight: 500; font-size: 12.5px;";

        html += `
            <tr data-id="${reg.id}" class="buzon-row-item" style="cursor: pointer; border-bottom: 1px solid #f1f5f9;">
                <td style="font-family: monospace; font-weight: 600; padding: 14px 16px; font-size: 13px; color: #64748b;">${fechaFormateada}</td>
                <td style="padding: 14px 16px; font-size: 13px; color: #0f172a; font-weight: 600;">${reg.nombre}</td>
                <td style="padding: 14px 16px;"><span style="${estiloRut}">${reg.rut || 'Sin RUN'}</span></td>
                <td style="padding: 14px 16px;">
                    <span style="background: ${tipoBadge.bg}; color: ${tipoBadge.color}; padding: 5px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                        ${tipoBadge.text}
                    </span>
                </td>
                <td style="padding: 14px 16px; font-size: 13px; color: #334155; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${reg.asunto}">${reg.asunto}</td>
                <td style="padding: 14px 16px;">
                    <span style="background: #f1f5f9; color: #475569; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase;">
                        ${reg.estado}
                    </span>
                </td>
            </tr>`;
    });

    tablaCuerpo.innerHTML = html;

    document.querySelectorAll(".buzon-row-item").forEach(row => {
        row.onclick = () => {
            document.querySelectorAll(".buzon-row-item").forEach(r => r.style.background = "");
            row.style.background = "rgba(37, 99, 235, 0.04)";
            
            const id = row.getAttribute("data-id");
            const registro = listaRegistrosBuzon.find(r => r.id === id);
            if (registro) {
                registroSeleccionadoId = id;
                desplegarBarraLateralDetalle(registro);
            }
        };
    });
}

function desplegarBarraLateralDetalle(reg) {
    sidebarDetalle.style.display = "block";
    vecinoIdActualDetectado = null; 
    vecinoVerificadoData = null; // Resetear caché operativa previa

    document.getElementById("detail-asunto").innerText = reg.asunto;
    document.getElementById("detail-tipo").innerText = reg.tipo;
    document.getElementById("detail-fecha").innerText = reg.fecha ? new Date(reg.fecha.seconds * 1000).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : 'Recién ingresado';
    document.getElementById("detail-nombre").innerText = reg.nombre;
    
    document.getElementById("detail-rut").innerText = reg.rut || "No proporcionado";
    document.getElementById("detail-telefono").innerText = reg.telefono;
    
    document.getElementById("detail-email").innerText = (reg.email === "undefined" || !reg.email) ? "No proporcionado" : reg.email;
    document.getElementById("detail-direccion").innerText = reg.direccion;
    document.getElementById("detail-descripcion").innerText = reg.descripcion;

    document.getElementById("btn-cambiar-revision").style.display = reg.estado === "Nuevo" ? "block" : "none";

    const statusContainer = document.getElementById("detail-vecino-status");
    if (statusContainer) {
        statusContainer.innerHTML = `<span style="font-size: 11px; color: var(--text-muted); font-style: italic; margin-left: 6px;">⏳ Verificando...</span>`;
        verificarInscripcionVecinoBaseCentral(reg.rut, statusContainer);
    }

    const gridAdjuntos = document.getElementById("detail-adjuntos-grid");
    gridAdjuntos.innerHTML = "";
    if (reg.adjuntos && reg.adjuntos.length > 0) {
        reg.adjuntos.forEach((url) => {
            gridAdjuntos.innerHTML += `
                <a href="${url}" target="_blank" style="width: 70px; height: 50px; border-radius: 4px; overflow:hidden; border: 1px solid var(--border-color); display: inline-block;">
                    <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;">
                </a>`;
        });
    } else {
        gridAdjuntos.innerHTML = `<span style="font-size: 11px; color: var(--text-muted); font-style: italic;">Sin archivos adjuntos</span>`;
    }

    const timeline = document.getElementById("detail-timeline");
    timeline.innerHTML = `
        <div style="border-left: 2px solid #cbd5e1; padding-left: 12px; position: relative; margin-bottom: 6px; padding-bottom: 2px;">
            <span style="position:absolute; left:-6px; top:4px; width:10px; height:10px; background:#2563eb; border-radius:50%; box-shadow: 0 0 0 2px #fff;"></span>
            <strong>Ingreso Digital:</strong> Formulario despachado con éxito. Estado actual: <span style="color:#2563eb; font-weight:700;">${reg.estado}</span>.
        </div>`;
}

// ==============================================================================
// 👥 CAPTURA MULTI-FORMATO DE DATOS REALES DE EXPEDIENTE CENTRAL
// ==============================================================================
async function verificarInscripcionVecinoBaseCentral(rutInput, element) {
    const btnCrearVecino = document.getElementById("action-crear-vecino");
    
    if (!rutInput || rutInput === "No proporcionado") {
        element.innerHTML = `<span class="badge" style="background: #f1f5f9; color: #475569; margin-left: 6px; font-size: 10px;">Sin RUT</span>`;
        if (btnCrearVecino) btnCrearVecino.style.display = "none";
        return;
    }
    try {
        let clean = rutInput.replace(/[.\-\s]/g, "").trim();
        let rutsMatrizBusqueda = [rutInput, clean];

        if (clean.length > 1) {
            let dv = clean.slice(-1).toUpperCase();
            let cuerpo = clean.slice(0, -1);
            let cuerpoConPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            
            rutsMatrizBusqueda.push(`${cuerpoConPuntos}-${dv}`);
            rutsMatrizBusqueda.push(clean.toUpperCase());
            rutsMatrizBusqueda.push(`${cuerpo}-${dv.toLowerCase()}`);
        }

        rutsMatrizBusqueda = Array.from(new Set(rutsMatrizBusqueda));

        const q = query(
            collection(db, "vecinos"), 
            where("tenantId", "==", TENANT_ID), 
            where("rut", "in", rutsMatrizBusqueda)
        );
        
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            const vecinoDoc = snap.docs[0];
            const vData = vecinoDoc.data();
            
            vecinoIdActualDetectado = vecinoDoc.id; 
            
            // 🎯 CAPTURA AVANZADA DE IDENTIDAD REAL PARA EL FORMULARIO DE TRIAGE
            vecinoVerificadoData = {
                id: vecinoDoc.id,
                nombreReal: vData.nombreCompleto,
                shortId: vecinoDoc.id.substring(0, 6).toUpperCase()
            };
            
            element.innerHTML = `
                <a href="vecinos.html?rut=${clean}" class="badge" style="background: #e6f4ea; color: #137333; margin-left: 6px; font-size: 10px; font-weight: 800; border: 1px solid #10b981; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="Abrir expediente del vecino">
                    ✓ Vecino Registrado 📂
                </a>`;
            
            if (btnCrearVecino) btnCrearVecino.style.display = "none";
        } else {
            vecinoIdActualDetectado = null;
            vecinoVerificadoData = null;
            
            element.innerHTML = `<span class="badge" style="background: #fce8e6; color: #c5221f; margin-left: 6px; font-size: 10px; font-weight: 800; border: 1px solid #ef4444;">✗ No Registrado</span>`;
            if (btnCrearVecino) btnCrearVecino.style.display = "block";
        }
    } catch (err) {
        console.error("Error validando expediente del vecino:", err);
        element.innerHTML = "";
    }
}

// 🎯 RECONVERTIDO POR COMPLETO: MODAL DE RECLASIFICACIÓN PURA MEDIANTE ALTERNATIVAS SIN TECLADO
async function cambiarClasificacionOrigen() {
    if (!registroSeleccionadoId) return;
    const reg = listaRegistrosBuzon.find(r => r.id === registroSeleccionadoId);
    if (!reg) return;

    const modalOverlay = document.createElement("div");
    modalOverlay.style.cssText = "position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(15, 23, 42, 0.3) !important; backdrop-filter: blur(4px) !important; display: flex !important; align-items: center !important; justify-content: center !important; z-index: 999999 !important; padding: 20px !important; box-sizing: border-box !important;";

    modalOverlay.innerHTML = `
        <div style="background: #ffffff !important; border-radius: 16px !important; padding: 28px !important; max-width: 440px !important; width: 100% !important; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1) !important; display: flex !important; flex-direction: column !important; box-sizing: border-box !important; font-family: system-ui, -apple-system, sans-serif !important;">
            <div style="display: flex !important; justify-content: space-between !important; align-items: center !important; margin-bottom: 16px !important;">
                <h3 style="margin: 0 !important; font-size: 17px !important; font-weight: 700 !important; color: #0f172a !important;">🔄 Reclasificar Tipo de Origen</h3>
                <button class="btn-close-reclasificar" style="background: none !important; border: none !important; font-size: 22px !important; color: #94a3b8 !important; cursor: pointer !important; padding: 0 !important; line-height: 1 !important;">&times;</button>
            </div>
            <p style="margin: 0 0 18px 0 !important; font-size: 13px !important; color: #475569 !important; line-height: 1.4 !important;">
                Selecciona la categoría correcta de las alternativas del sistema para actualizar la clasificación técnica de este ticket:
            </p>
            
            <div style="margin-bottom: 24px !important;">
                <label style="font-size: 11px !important; font-weight: 700 !important; color: #1e293b !important; display: block !important; margin-bottom: 6px !important; text-transform: uppercase !important;">Nueva Clasificación Autorizada *</label>
                <select id="select-nueva-clasificacion" style="width: 100% !important; padding: 10px !important; border: 1px solid #cbd5e1 !important; border-radius: 8px !important; font-size: 14px !important; color: #0f172a !important; background: #fff !important; outline: none !important; cursor: pointer !important;">
                    <option value="Petición" ${reg.tipo === "Petición" ? "selected" : ""}>🎁 Solicitar Apoyo Solidario / Petición</option>
                    <option value="Reclamo" ${reg.tipo === "Reclamo" ? "selected" : ""}>⚠️ Reportar un Problema o Reclamo</option>
                    <option value="Sugerencia" ${reg.tipo === "Sugerencia" ? "selected" : ""}>💡 Enviar una Idea o Iniciativa Vecinal</option>
                    <option value="Felicitación" ${reg.tipo === "Felicitación" ? "selected" : ""}>❤️ Enviar un mensaje de agradecimiento</option>
                    <option value="Denuncia" ${reg.tipo === "Denuncia" ? "selected" : ""}>📣 Realizar una Denuncia Ciudadana</option>
                    <option value="Otro" ${reg.tipo === "Otro" || reg.tipo.includes("Otro") ? "selected" : ""}>••• Otro Asunto o Consulta</option>
                </select>
            </div>

            <div style="display: flex !important; gap: 10px !important; justify-content: flex-end !important;">
                <button class="btn-cancelar-reclasificar" style="background: #f1f5f9 !important; color: #475569 !important; border: none !important; padding: 10px 16px !important; font-size: 13px !important; font-weight: 600 !important; border-radius: 8px !important; cursor: pointer !important;">Cancelar</button>
                <button id="btn-guardar-reclasificar" style="background: #f59e0b !important; color: #ffffff !important; border: none !important; padding: 10px 20px !important; font-size: 13px !important; font-weight: 700 !important; border-radius: 8px !important; cursor: pointer !important; transition: background 0.2s ease !important;">🔄 Guardar Cambios</button>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);

    modalOverlay.querySelector(".btn-close-reclasificar").onclick = () => modalOverlay.remove();
    modalOverlay.querySelector(".btn-cancelar-reclasificar").onclick = () => modalOverlay.remove();

    const btnGuardarReclasificar = modalOverlay.querySelector("#btn-guardar-reclasificar");
    btnGuardarReclasificar.onclick = async () => {
        const tipoSeleccionado = modalOverlay.querySelector("#select-nueva-clasificacion").value;
        
        btnGuardarReclasificar.disabled = true;
        btnGuardarReclasificar.innerText = "Guardando...";

        try {
            const docRef = doc(db, "buzon_ciudadano", registroSeleccionadoId);
            await updateDoc(docRef, { tipo: tipoSeleccionado });
            modalOverlay.remove();
        } catch (err) {
            console.error("Error al reclasificar caso en la nube:", err);
            btnGuardarReclasificar.disabled = false;
            btnGuardarReclasificar.innerText = "🔄 Guardar Cambios";
        }
    };
}

async function marcarTicketEnRevision() {
    if (!registroSeleccionadoId) return;
    try {
        const docRef = doc(db, "buzon_ciudadano", registroSeleccionadoId);
        await updateDoc(docRef, { estado: "En Revisión" });
    } catch (err) {
        console.error("Error al actualizar a En Revisión:", err);
    }
}

async function actualizarEstadoTicketSeleccionado(nuevoEstado) {
    if (!registroSeleccionadoId) return;
    try {
        const docRef = doc(db, "buzon_ciudadano", registroSeleccionadoId);
        await updateDoc(docRef, { estado: nuevoEstado });
        alert(`¡Registro gestionado con éxito! El caso fue archivado o derivado al estado: ${nuevoEstado}`);
        sidebarDetalle.style.display = "none";
        registroSeleccionadoId = null;
    } catch (err) {
        console.error(err);
    }
}

// ==============================================================================
// 1. Despachar a Colección "solicitudes"
// ==============================================================================
async function transformarEnSolicitudMunicipal() {
    if (!registroSeleccionadoId) return;
    const reg = listaRegistrosBuzon.find(r => r.id === registroSeleccionadoId);
    if (!reg) return;

    const bannerAsociacion = vecinoVerificadoData
        ? `✓ <b>Expediente Vinculado:</b> Esta solicitud quedará asociada de forma automática al historial del vecino verificado: <b>${vecinoVerificadoData.nombreReal}</b> (ID Exp: <b>#${vecinoVerificadoData.shortId}</b>).`
        : `⚠️ <b>Usuario Externo:</b> El RUN no figura en el padrón central. Se creará una solicitud para un vecino no registrado de forma externa: <b>${reg.nombre}</b>.`;

    const modalOverlay = document.createElement("div");
    modalOverlay.className = "profile-modal-overlay";
    modalOverlay.style.zIndex = "1600";

    modalOverlay.innerHTML = `
        <div class="profile-modal-card" style="max-width: 520px; width: 90%;">
            <div class="profile-modal-header" style="background-color: #0b438c; padding: 18px 24px;">
                <div class="profile-header-info">
                    <h3 style="font-size: 16px; color: #fff; font-weight: 700; margin: 0;">Clasificar Solicitud Ciudadana</h3>
                    <p style="color: rgba(255,255,255,0.8); font-size: 11.5px; margin: 4px 0 0 0;">SIGEV - Panel de Triage Técnico Municipal</p>
                </div>
                <button class="btn-profile-close btn-close-triage-x" style="color: #fff; font-size: 22px; top: 12px; right: 16px; background: none; border: none; cursor: pointer;">&times;</button>
            </div>
            
            <div class="profile-modal-body" style="padding: 20px 24px; background: #fff;">
                <div style="background: ${vecinoVerificadoData ? '#e6f4ea' : '#fffdf0'}; border: 1px solid ${vecinoVerificadoData ? '#10b981' : '#fef08a'}; padding: 12px; border-radius: 8px; font-size: 12px; color: #334155; margin-bottom: 16px; line-height: 1.45;">
                    ${bannerAsociacion}
                </div>

                <form id="form-triage-solicitud" style="display: flex; flex-direction: column; gap: 14px;">
                    <div class="form-group">
                        <label style="font-size: 11px; font-weight: 700; color: #1e293b; display: block; margin-bottom: 4px; text-transform: uppercase;">Categoría Municipal *</label>
                        <select id="triage-categoria" required>
                            <option value="Luminarias">💡 Luminarias e Iluminación Pública</option>
                            <option value="Aseo y Ornato">🌿 Aseo, Ornato y Áreas Verdes</option>
                            <option value="Seguridad Ciudadana">🛡️ Seguridad Vecinal y Vecindario</option>
                            <option value="Obras Públicas">🛣️ Pavimentación, Baches y Calles</option>
                            <option value="Social / Ayudas">📦 Ayuda Social y Casos Críticos</option>
                            <option value="Otros">••• Otros Requerimientos</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label style="font-size: 11px; font-weight: 700; color: #1e293b; display: block; margin-bottom: 4px; text-transform: uppercase;">Departamento / Oficina Derivada *</label>
                        <select id="triage-oficina" required>
                            <option value="Dirección de Operaciones">Dirección de Operaciones e Infraestructura</option>
                            <option value="Departamento de Aseo y Ornato">Departamento de Aseo y Ornato</option>
                            <option value="Oficina de Seguridad Comunitaria">Oficina de Seguridad Comunitaria</option>
                            <option value="DIDECO (Social)">Dirección de Desarrollo Comunitario (DIDECO)</option>
                            <option value="Gabinete de Terreno">Gabinete de Terreno Concejalía</option>
                        </select>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0;">
                        <div class="form-group">
                            <label style="font-size: 11px; font-weight: 700; color: #1e293b; display: block; margin-bottom: 4px; text-transform: uppercase;">Tipo de Requerimiento</label>
                            <input type="text" id="triage-subcategoria" value="${reg.tipo}" placeholder="Ej: Reparación, Corte, Reemplazo...">
                        </div>
                        <div class="form-group">
                            <label style="font-size: 11px; font-weight: 700; color: #1e293b; display: block; margin-bottom: 4px; text-transform: uppercase;">Prioridad Operativa</label>
                            <select id="triage-prioridad">
                                <option value="Alta" ${reg.prioridad === "Alta" ? "selected" : ""}>🔴 Alta</option>
                                <option value="Media" ${reg.prioridad === "Media" ? "selected" : ""}>🟡 Media</option>
                                <option value="Baja" ${reg.prioridad === "Baja" ? "selected" : ""}>🟢 Baja</option>
                            </select>
                        </div>
                    </div>
                </form>
            </div>

            <div style="padding: 14px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                <button type="button" class="btn btn-secondary btn-close-triage" style="font-size: 12px; padding: 8px 16px;">Cancelar</button>
                <button type="button" id="btn-submit-triage" class="btn btn-primary" style="background-color: #2563eb; font-size: 12px; padding: 8px 16px; color: white; font-weight: 700; border: none; border-radius: 6px; cursor: pointer;">🚀 Despachar y Crear Solicitud</button>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);

    modalOverlay.querySelector(".btn-close-triage-x").onclick = () => modalOverlay.remove();
    modalOverlay.querySelector(".btn-close-triage").onclick = () => modalOverlay.remove();

    const btnSubmitTriage = modalOverlay.querySelector("#btn-submit-triage");
    btnSubmitTriage.onclick = async () => {
        const categoria = modalOverlay.querySelector("#triage-categoria").value;
        const oficina = modalOverlay.querySelector("#triage-oficina").value;
        const subcategoria = modalOverlay.querySelector("#triage-subcategoria").value.trim();
        const prioridad = modalOverlay.querySelector("#triage-prioridad").value;

        btnSubmitTriage.disabled = true;
        btnSubmitTriage.innerText = "Emitiendo Solicitud...";

        try {
            const payload = {
                tenantId: TENANT_ID,
                vecinoNombre: vecinoVerificadoData ? vecinoVerificadoData.nombreReal : reg.nombre,
                vecinoRut: reg.rut || "No proporcionado",
                vecinoDireccion: reg.direccion,
                asunto: reg.asunto,
                descripcion: reg.descripcion,
                categoria: categoria,
                subcategoria: subcategoria || reg.tipo,
                oficinaDerivada: oficina,
                prioridad: prioridad,
                estado: "Abierta",
                fechaCreacion: serverTimestamp(),
                origen: "Buzón Ciudadano",
                adjuntos: reg.adjuntos || [],
                idVecino: vecinoIdActualDetectado || "No enlazado (Nuevo)"
            };

            await addDoc(collection(db, "solicitudes"), payload);
            modalOverlay.remove();
            await actualizarEstadoTicketSeleccionado("Clasificado");
        } catch (error) {
            console.error("Error guardando triage dinámico:", error);
            btnSubmitTriage.disabled = false;
            btnSubmitTriage.innerText = "🚀 Despachar y Crear Solicitud";
        }
    };
}

// 2. Despachar a Colección "donaciones"
async function transformarEnDonacionTerritorial() {
    if (!registroSeleccionadoId) return;
    const reg = listaRegistrosBuzon.find(r => r.id === registroSeleccionadoId);
    if (!reg) return;

    const nombreAviso = vecinoVerificadoData ? vecinoVerificadoData.nombreReal : reg.nombre;

    if (confirm(`¿Confirmas la clonación automática de este registro hacia el Padrón de Donaciones asociado al vecino verificado ${nombreAviso}?`)) {
        try {
            const payload = {
                tenantId: TENANT_ID,
                donanteNombre: nombreAviso,
                donanteRut: reg.rut || "No proporcionado",
                asunto: reg.asunto,
                detalleDonacion: reg.descripcion,
                estado: "Recibida",
                fechaRegistro: serverTimestamp(),
                origen: "Buzón Ciudadano",
                idVecino: vecinoIdActualDetectado || "No enlazado (Nuevo)"
            };

            await addDoc(collection(db, "donaciones"), payload);
            await actualizarEstadoTicketSeleccionado("Clasificado");
        } catch (error) {
            console.error("Error al procesar el triage de donación:", error);
        }
    }
}

// 3. Despachar a Colección "casos_sociales"
async function transformarEnCasoSocial() {
    if (!registroSeleccionadoId) return;
    const reg = listaRegistrosBuzon.find(r => r.id === registroSeleccionadoId);
    if (!reg) return;

    const nombreAviso = vecinoVerificadoData ? vecinoVerificadoData.nombreReal : reg.nombre;

    if (confirm(`¿Confirmas la apertura de un Expediente de Caso Social basado en el requerimiento del vecino verificado ${nombreAviso}?`)) {
        try {
            const payload = {
                tenantId: TENANT_ID,
                beneficiarioNombre: nombreAviso,
                beneficiarioRut: reg.rut || "No proporcionado",
                descripcionCaso: reg.descripcion,
                estado: "En Evaluación",
                fechaApertura: serverTimestamp(),
                origen: "Buzón Ciudadano",
                idVecino: vecinoIdActualDetectado || "No enlazado (Nuevo)"
            };

            await addDoc(collection(db, "casos_sociales"), payload);
            await actualizarEstadoTicketSeleccionado("Clasificado");
        } catch (error) {
            console.error("Error al procesar el triage de caso social:", error);
        }
    }
}

async function clonarFichaVecinal() {
    if (!registroSeleccionadoId) return;
    const reg = listaRegistrosBuzon.find(r => r.id === registroSeleccionadoId);
    if (!reg) return;

    try {
        const nuevaFichaVecino = {
            tenantId: TENANT_ID,
            nombreCompleto: reg.nombre, 
            rut: reg.rut || "",
            telefono: reg.telefono,
            correo: (reg.email === "undefined" || !reg.email) ? "" : reg.email,
            direccion: reg.direccion === "No proporcionada" ? "" : reg.direccion,
            fechaInscripcion: serverTimestamp(),
            estadoExpediente: "Activo"
        };

        await addDoc(collection(db, "vecinos"), nuevaFichaVecino);
        alert(`¡Ficha vecinal de ${reg.nombre} creada con éxito en la base de datos central de terreno!`);
        
        desplegarBarraLateralDetalle(reg);
    } catch (err) {
        console.error(err);
    }
}