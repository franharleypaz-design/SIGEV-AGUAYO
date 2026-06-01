// ==============================================================================
// SIGEV-AGUAYO - MOTOR CONTROLADOR DE CONCEJOS Y ACUERDOS LEGISLATIVOS
// ==============================================================================
import { auth, db } from "./app.js";
import { 
    collection, getDocs, doc, query, where, addDoc, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const CURRENT_TENANT_ID = "aguayo";

// Cachés globales en memoria para cruces instantáneos
let sesionesMemory = [];
let votacionesMemory = [];
let subformVotacionContador = 0;

// Elementos de Control del Entorno
const tabsBotones = document.querySelectorAll(".concejo-tab-btn");
const panelesContenido = document.querySelectorAll(".concejo-panel-content");
const modalForm = document.getElementById("modal-sesion-form");
const btnTriggerNuevaSesion = document.getElementById("btn-trigger-nueva-sesion");
const subformListContainer = document.getElementById("votaciones-dinamicas-list");

auth.onAuthStateChanged(async (user) => {
    if (user) {
        inicializarComponentesConcejo();
        await sincronizarDatosBaseConcejo();
        calcularDashboardIndicadores();
        renderizarPanelesActivos();
    }
});

function inicializarComponentesConcejo() {
    // Control de Navegación de Pestañas
    tabsBotones.forEach(btn => {
        btn.addEventListener("click", () => {
            tabsBotones.forEach(t => t.classList.remove("active"));
            panelesContenido.forEach(p => p.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById(btn.getAttribute("data-target")).classList.add("active");
        });
    });

    // Filtros de búsqueda en tiempo real
    document.getElementById("filter-voto-categoria").addEventListener("change", filtrarYRenderizarTablaVotos);
    document.getElementById("filter-voto-busqueda").addEventListener("input", filtrarYRenderizarTablaVotos);
    document.getElementById("btn-clear-vote-filters").onclick = () => {
        document.getElementById("filter-voto-categoria").value = "Todos";
        document.getElementById("filter-voto-busqueda").value = "";
        filtrarYRenderizarTablaVotos();
    };

    // Apertura y Cierre del Formulario Maestro
    btnTriggerNuevaSesion.onclick = () => {
        document.getElementById("form-maestro-sesion").reset();
        subformListContainer.innerHTML = "";
        subformVotacionContador = 0;
        inyectarFilaVotacionDinamica(); // Inicia con una fila por defecto
        modalForm.style.display = "flex";
    };

    document.getElementById("btn-close-form-x").onclick = () => modalForm.style.display = "none";
    document.getElementById("btn-cancelar-sesion").onclick = () => modalForm.style.display = "none";
    document.getElementById("btn-append-voto-row").onclick = () => inyectarFilaVotacionDinamica();

    // Guardado Relacional Transaccional Anidado
    document.getElementById("btn-guardar-sesion-maestra").onclick = ejecutarGuardadoSesionConcejo;
}

// --- DESCARGA DE INFORMACIÓN LEGISLATIVA ---
async function sincronizarDatosBaseConcejo() {
    try {
        const qS = query(collection(db, "sesiones_concejo"), where("tenantId", "==", CURRENT_TENANT_ID));
        const qV = query(collection(db, "votaciones_concejo"), where("tenantId", "==", CURRENT_TENANT_ID));

        const [snapSesiones, snapVotaciones] = await Promise.all([getDocs(qS), getDocs(qV)]);

        sesionesMemory = [];
        snapSesiones.forEach(d => sesionesMemory.push({ id: d.id, ...d.data() }));
        sesionesMemory.sort((a, b) => Number(b.numeroSesion) - Number(a.numeroSesion));

        votacionesMemory = [];
        snapVotaciones.forEach(d => votacionesMemory.push({ id: d.id, ...d.data() }));
        votacionesMemory.sort((a, b) => b.fecha.localeCompare(a.fecha));
    } catch (err) {
        console.error("Error sincronizando Concejo:", err);
    }
}

// --- GENERADOR DEL SUBFORMULARIO REPETIBLE ---
function inyectarFilaVotacionDinamica() {
    subformVotacionContador++;
    const rowId = `v-row-${subformVotacionContador}`;
    
    const div = document.createElement("div");
    div.className = "subform-vote-row-box";
    div.id = rowId;
    div.innerHTML = `
        <button type="button" class="btn-remove-subform" onclick="document.getElementById('${rowId}').remove()">&times;</button>
        <div class="form-group"><label>Tema / Acuerdo a Votar *</label><input type="text" class="input-v-tema" placeholder="Ej: Aprobación de presupuesto áreas verdes para sector sur" required></div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-top:10px;">
            <div class="form-group">
                <label>Área Temática *</label>
                <select class="select-v-categoria">
                    <option value="Seguridad">Seguridad</option><option value="Educación">Educación</option>
                    <option value="Salud">Salud</option><option value="Áres Verdes">Áreas Verdes</option>
                    <option value="Tránsito">Tránsito</option><option value="Presupuesto">Presupuesto</option>
                    <option value="Patentes">Patentes</option><option value="Urbanismo">Urbanismo</option>
                </select>
            </div>
            <div class="form-group">
                <label>Resultado General *</label>
                <select class="select-v-resultado"><option value="Aprobado">Aprobado</option><option value="Rechazado">Rechazado</option><option value="Pendiente">Pendiente</option></select>
            </div>
            <div class="form-group">
                <label>Voto Gonzalo Aguayo *</label>
                <select class="select-v-aguayo"><option value="A Favor">A Favor</option><option value="En Contra">En Contra</option><option value="Abstención">Abstención</option><option value="Ausente">Ausente</option></select>
            </div>
        </div>
        <div class="form-group" style="margin-top:10px;"><label>Explicación del Voto / Comentario Ciudadano</label><input type="text" class="input-v-comentario" placeholder="Ej: Se aprueba por mitigar el déficit lumínico en plazas..."></div>
    `;
    subformListContainer.appendChild(div);
}

// --- CÁLCULO DE DASHBOARD EN TIEMPO REAL ---
function calcularDashboardIndicadores() {
    const stats = { total: votacionesMemory.length, favor: 0, contra: 0, abstencion: 0, ausente: 0 };
    votacionesMemory.forEach(v => {
        if (v.votoAguayo === "A Favor") stats.favor++;
        else if (v.votoAguayo === "En Contra") stats.contra++;
        else if (v.votoAguayo === "Abstención") stats.abstencion++;
        else if (v.votoAguayo === "Ausente") stats.ausente++;
    });

    document.getElementById("stat-total-votes").innerText = stats.total;
    document.getElementById("stat-favor-votes").innerText = stats.favor;
    document.getElementById("stat-contra-votes").innerText = stats.contra;
    document.getElementById("stat-abstencion-votes").innerText = stats.abstencion;
    document.getElementById("stat-ausente-votes").innerText = stats.ausente;
}

// --- DISPARADORES DE RENDERIZADO GENERAL ---
function renderizarPanelesActivos() {
    // Renderizado Panel 1: Sesiones Actas
    const canvasSesiones = document.getElementById("lista-sesiones-canvas");
    if (canvasSesiones) {
        let htmlS = "";
        sesionesMemory.forEach(s => {
            const fFormatted = s.fecha ? s.fecha.split("-").reverse().join("/") : "S/F";
            htmlS += `
                <div class="session-acta-card">
                    <div>
                        <div class="session-card-header">
                            <span class="session-badge-num">Sesión #${s.numeroSesion}</span>
                            <span style="font-size:11.5px; color:var(--text-light); font-weight:600;">${fFormatted}</span>
                        </div>
                        <h4 style="font-size:14px; font-weight:700; color:var(--text-dark); margin: 0 0 6px 0;">Acta de Carácter ${s.tipo}</h4>
                        <p style="font-size:12.5px; color:var(--text-dark); line-height:1.4; margin:0; min-height:40px;">${s.resumenEjecutivo || 'No se registra resumen resumido de la jornada legislativa.'}</p>
                    </div>
                    <div style="margin-top:14px; display:flex; gap:10px;">
                        ${s.pdfActaUrl ? `<a href="${s.pdfActaUrl}" target="_blank" class="btn btn-secondary" style="padding:6px 12px; font-size:11.5px; text-decoration:none; text-align:center; flex:1;">📄 Ver Acta PDF</a>` : '<span style="font-size:11px; color:var(--text-light); font-weight:600; line-height:2.4;">Documento escaneado pendiente</span>'}
                    </div>
                </div>`;
        });
        canvasSesiones.innerHTML = htmlS || `<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-light);">No se registran actas municipales ingresadas.</div>`;
    }
    filtrarYRenderizarTablaVotos();
}

function filtrarYRenderizarTablaVotos() {
    const catFiltro = document.getElementById("filter-voto-categoria").value;
    const searchTexto = document.getElementById("filter-voto-busqueda").value.toLowerCase().trim();
    const tbody = document.querySelector("#tabla-global-votaciones tbody");
    if (!tbody) return;

    const filtrados = votacionesMemory.filter(v => {
        const coincideCat = (catFiltro === "Todos") || (v.categoria === catFiltro);
        const coincideBusqueda = !searchTexto || v.tema.toLowerCase().includes(searchTexto) || (v.comentarioExplicacion || "").toLowerCase().includes(searchTexto);
        return coincideCat && coincideBusqueda;
    });

    let htmlV = "";
    filtrados.forEach(v => {
        const fFormatted = v.fecha ? v.fecha.split("-").reverse().join("/") : "S/F";
        let badgeClass = v.votoAguayo === "A Favor" ? "favor" : v.votoAguayo === "En Contra" ? "contra" : v.votoAguayo === "Abstención" ? "abstencion" : "ausente";
        let statusGralClass = v.resultadoGeneral === "Aprobado" ? "color:#10b981; font-weight:700;" : "color:#ef4444; font-weight:700;";

        htmlV += `
            <tr>
                <td>
                    <span style="display:block; font-weight:700; color:var(--text-dark); font-size:12.5px;">${fFormatted}</span>
                    <span style="font-size:11px; color:var(--text-light); font-weight:600;">Ordinaria #${v.numeroSesion}</span>
                </td>
                <td style="font-weight:600; font-size:13px; color:var(--text-dark); max-width:280px; line-height:1.4;">${v.tema}</td>
                <td><span style="font-size:12px; font-weight:600; background:#f1f5f9; padding:3px 8px; border-radius:4px; color:#475569;">${v.categoria}</span></td>
                <td style="text-align:center; font-size:12.5px; ${statusGralClass}">${v.resultadoGeneral}</td>
                <td style="text-align:center;"><span class="vote-pill ${badgeClass}">${v.votoAguayo}</span></td>
                <td style="font-size:12px; color:var(--text-light); font-style:italic; max-width:240px; line-height:1.35;">"${v.comentarioExplicacion || 'Sin observaciones anexas.'}"</td>
            </tr>`;
    });

    tbody.innerHTML = htmlV || `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-light);">No se registran votaciones bajo este filtro de búsqueda.</td></tr>`;
}

// --- FLUJO OPERACIONAL MÁSTER: ESCRITURA RELACIONAL EN FIREBASE ---
async function ejecutarGuardadoSesionConcejo() {
    const numSesion = document.getElementById("s-numero").value;
    const fechaSesion = document.getElementById("s-fecha").value;
    const tipoSesion = document.getElementById("s-tipo").value;
    const urlActa = document.getElementById("s-acta-url").value.trim();
    const resumen = document.getElementById("s-resumen").value.trim();

    if (!numSesion || !fechaSesion) return;

    const btnGuardar = document.getElementById("btn-guardar-sesion-maestra");
    btnGuardar.disabled = true; btnGuardar.innerText = "Sincronizando transacciones...";

    try {
        // 1. Guardar Maestro: Sesión global
        const payloadSesion = {
            numeroSesion: Number(numSesion), fecha: fechaSesion, tipo: tipoSesion,
            pdfActaUrl: urlActa, resumenEjecutivo: resumen, tenantId: CURRENT_TENANT_ID,
            fechaCargaPlataforma: serverTimestamp()
        };
        const docRefSesion = await addDoc(collection(db, "sesiones_concejo"), payloadSesion);
        const generatedIdSesion = docRefSesion.id;

        // 2. Extraer y estructurar el sub-arreglo dinámico de temas votados
        const subformNodos = subformListContainer.querySelectorAll(".subform-vote-row-box");
        if (subformNodos.length > 0) {
            const batch = writeBatch(db);
            
            subformNodos.forEach(nodo => {
                const subPayload = {
                    idSesion: generatedIdSesion,
                    numeroSesion: Number(numSesion),
                    fecha: fechaSesion,
                    tema: nodo.querySelector(".input-v-tema").value.trim(),
                    categoria: nodo.querySelector(".select-v-categoria").value,
                    resultadoGeneral: nodo.querySelector(".select-v-resultado").value,
                    votoAguayo: nodo.querySelector(".select-v-aguayo").value,
                    comentarioExplicacion: nodo.querySelector(".input-v-comentario").value.trim(),
                    tenantId: CURRENT_TENANT_ID
                };
                const docRefRefNewVoto = doc(collection(db, "votaciones_concejo"));
                batch.set(docRefRefNewVoto, subPayload);
            });
            await batch.commit(); // Inserción atómica paralela en Firebase
        }

        modalForm.style.display = "none";
        await sincronizarDatosBaseConcejo();
        calcularDashboardIndicadores();
        renderizarPanelesActivos();
    } catch (err) {
        console.error(err);
    } finally {
        btnGuardar.disabled = false; btnGuardar.innerText = "Sincronizar y Consolidar Acta";
    }
}

// Inyección limpia al objeto window para mitigar aislamiento del módulo de compilación de ES6 en HTML
window.inyectarFilaVotacionDinamica = inyectarFilaVotacionDinamica;