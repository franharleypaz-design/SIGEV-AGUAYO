// ==============================================================================
// 👑 CONTROLADOR GLOBAL DE MODALES (INYECCIÓN DIRECTA)
// ==============================================================================
window.abrirModalG = function(id) {
    const modal = document.getElementById(id);
    if(modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('open'), 10);
        document.body.classList.add('modal-open');
    } else {
        console.error("No se encontró el modal con ID:", id);
    }
};

window.cerrarModalG = function(id) {
    const modal = document.getElementById(id);
    if(modal) {
        modal.classList.remove('open');
        document.body.classList.remove('modal-open');
        setTimeout(() => modal.style.display = 'none', 300); 
    }
};

// Cerrar modales al hacer clic fuera del recuadro
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('profile-modal-overlay')) {
        window.cerrarModalG(e.target.id);
    }
});

// ==============================================================================
// 👑 LÓGICA DE EDICIÓN Y CREACIÓN DE SESIÓN MAESTRA
// ==============================================================================
window.sesionEditandoId = null;

window.prepararNuevaSesion = function() {
    window.sesionEditandoId = null;
    document.getElementById("form-maestro-sesion").reset();
    const btnGuardar = document.getElementById("btn-guardar-sesion-maestra");
    if(btnGuardar) btnGuardar.innerText = "Sincronizar y Consolidar Acta";
    document.getElementById("lbl-pdf-name").innerText = "📄 Haz clic aquí para adjuntar el acta en PDF";
    document.getElementById("lbl-pdf-name").style.color = "#475569";
    document.getElementById("lbl-pdf-name").style.fontWeight = "normal";
    
    // Limpiar sub-formulario de votos
    const subformList = document.getElementById("votaciones-dinamicas-list");
    if(subformList) subformList.innerHTML = "";
    
    window.abrirModalG("modal-sesion-form");
};

// Asignar evento al botón de nueva sesión
document.addEventListener("DOMContentLoaded", () => {
    const btnNueva = document.getElementById("btn-trigger-nueva-sesion");
    if(btnNueva) {
        btnNueva.addEventListener("click", window.prepararNuevaSesion);
    }
});

window.abrirEdicionSesion = function(idSesion) {
    window.sesionEditandoId = idSesion;
    const sesion = sesionesMemory.find(s => s.id === idSesion);
    if (!sesion) return;

    // Poblar datos maestros
    document.getElementById("s-numero").value = sesion.numeroSesion || "";
    document.getElementById("s-fecha").value = sesion.fecha || "";
    document.getElementById("s-tipo").value = sesion.tipo || "Ordinaria";
    document.getElementById("s-resumen").value = sesion.resumenEjecutivo || "";
    
    // PDF
    const lblPdf = document.getElementById("lbl-pdf-name");
    if(sesion.pdfActaUrl) {
        lblPdf.innerText = "✅ Acta guardada en la nube";
        lblPdf.style.color = "#0b438c";
        lblPdf.style.fontWeight = "bold";
    } else {
        lblPdf.innerText = "📄 Haz clic aquí para adjuntar el acta en PDF";
        lblPdf.style.color = "#475569";
        lblPdf.style.fontWeight = "normal";
    }

    // Poblar las votaciones vinculadas
    const subformList = document.getElementById("votaciones-dinamicas-list");
    if(subformList) {
        subformList.innerHTML = "";
        const votosAsociados = votacionesMemory.filter(v => v.idSesion === idSesion);
        votosAsociados.forEach(v => {
            window.inyectarFilaVotacionDinamica();
            
            const nodos = subformList.querySelectorAll(".subform-vote-row-box");
            const lastNodo = nodos[nodos.length - 1];
            
            if(lastNodo) {
                lastNodo.querySelector(".input-v-tema").value = v.tema || "";
                lastNodo.querySelector(".select-v-categoria").value = v.categoria || "Todos";
                lastNodo.querySelector(".select-v-resultado").value = v.resultadoGeneral || "Aprobado";
                lastNodo.querySelector(".select-v-aguayo").value = v.votoAguayo || "A Favor";
                lastNodo.querySelector(".input-v-comentario").value = v.comentarioExplicacion || "";
                lastNodo.dataset.votoId = v.id;
            }
        });
    }

    const btnGuardar = document.getElementById("btn-guardar-sesion-maestra");
    if(btnGuardar) btnGuardar.innerText = "Actualizar Acta";

    window.abrirModalG("modal-sesion-form");
};

// ==============================================================================
// SIGEV-AGUAYO - MOTOR CONTROLADOR DE CONCEJOS Y ACUERDOS LEGISLATIVOS
// ==============================================================================
import { app, auth, db } from "./app.js";
import { 
    collection, getDocs, doc, query, where, addDoc, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getStorage, ref, uploadBytes, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// 🕵️‍♂️ DETECTOR MULTI-TENANT DINÁMICO CON OVERRIDE DE SESIÓN
const subdominioDetectado = window.location.hostname.split('.')[0];
const CURRENT_TENANT_ID = sessionStorage.getItem('SIGEV_ACTIVE_TENANT') || ((subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado);

// Cachés globales en memoria para cruces instantáneos
let sesionesMemory = [];
let votacionesMemory = [];
let subformVotacionContador = 0;

// Elementos de Control del Entorno
const tabsBotones = document.querySelectorAll(".concejo-tab-btn");
const panelesContenido = document.querySelectorAll(".concejo-panel-content");
const modalForm = document.getElementById("modal-sesion-form");
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
    document.getElementById("filter-voto-busqueda").addEventListener("input", (e) => {
        if(e.target.value.length > 2 || e.target.value.length === 0) filtrarYRenderizarTablaVotos();
    });

    // Controles del formulario
    document.getElementById("btn-append-voto-row").addEventListener("click", inyectarFilaVotacionDinamica);
    document.getElementById("btn-guardar-sesion-maestra").addEventListener("click", ejecutarGuardadoSesionConcejo);
}

// --- CAPA DE EXTRACCIÓN DE DATOS FIREBASE CLOUD FIRESTORE ---
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
        console.error("Error sincronizando concejo:", err);
    }
}

// --- LÓGICA DE CÁLCULO DE DASHBOARD DE KPIS ---
function calcularDashboardIndicadores() {
    const stats = { total: 0, favor: 0, contra: 0, abstencion: 0, ausente: 0 };
    votacionesMemory.forEach(v => {
        stats.total++;
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
            
            let badgeAsistencia = (s.asistencia === 'Asiste' || !s.asistencia) 
                ? '<div style="display: flex; align-items: center; gap: 6px;"><div style="width: 8px; height: 8px; border-radius: 50%; background-color: #10b981; box-shadow: 0 0 0 3px #d1fae5;"></div><span style="color: #065f46; font-size: 12.5px; font-weight: 700;">Concejal Presente</span></div>' 
                : '<div style="display: flex; align-items: center; gap: 6px;"><div style="width: 8px; height: 8px; border-radius: 50%; background-color: #ef4444; box-shadow: 0 0 0 3px #fee2e2;"></div><span style="color: #991b1b; font-size: 12.5px; font-weight: 700;">Concejal Ausente</span></div>';

            let linkExpediente = `<button onclick="window.abrirVistaExpediente('${s.id}')" style="background: linear-gradient(135deg, #0b438c, #1e3a8a); border: none; cursor: pointer; color: white; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 16px; border-radius: 8px; width: 100%; box-shadow: 0 2px 4px rgba(11,67,140,0.2); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)';" onmouseout="this.style.transform='scale(1)';">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                Expediente de la Sesión
               </button>`;

            let leftBorderColor = (s.asistencia === 'Asiste' || !s.asistencia) ? '#10b981' : '#ef4444';

            htmlS += `
                <div style="display: flex; flex-wrap: wrap; align-items: center; background: #ffffff; padding: 18px 24px; border-radius: 10px; border: 1px solid #e2e8f0; border-left: 5px solid ${leftBorderColor}; box-shadow: 0 2px 6px rgba(0,0,0,0.03); transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); gap: 24px; position: relative;" onmouseover="this.style.boxShadow='0 8px 15px rgba(0,0,0,0.05)'; this.style.transform='translateY(-2px)';" onmouseout="this.style.boxShadow='0 2px 6px rgba(0,0,0,0.03)'; this.style.transform='translateY(0)';">
                    
                    <div style="flex: 0 0 auto; text-align: center; background: #f8fafc; padding: 12px 16px; border-radius: 8px; border: 1px solid #f1f5f9;">
                        <span style="display: block; font-size: 10px; color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Sesión Nº</span>
                        <span style="display: block; font-size: 20px; color: #0b438c; font-weight: 900; line-height: 1.1; margin: 4px 0;">${s.numeroSesion}</span>
                        <span style="display: block; font-size: 11px; color: #475569; font-weight: 600;">${fFormatted}</span>
                    </div>

                    <div style="flex: 1 1 300px; display: flex; flex-direction: column; justify-content: center;">
                        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
                            <span style="background: #eff6ff; color: #1d4ed8; padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">TIPO: ${s.tipo}</span>
                            ${badgeAsistencia}
                        </div>
                        <p style="font-size: 13.5px; color: #334155; margin: 0; font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.5;">${s.resumenEjecutivo || '<i>No se ha registrado un resumen ejecutivo para esta jornada legislativa.</i>'}</p>
                    </div>

                    <div style="flex: 0 0 auto; display: flex; flex-direction: column; gap: 10px; min-width: 170px;">
                        ${linkExpediente}
                    </div>
                </div>
            `;
        });
        
        canvasSesiones.style.display = 'flex';
        canvasSesiones.style.flexDirection = 'column';
        canvasSesiones.style.gap = '12px';

        canvasSesiones.innerHTML = htmlS || `<div style="text-align:center; padding:30px; color:var(--text-light); background: white; border-radius: 8px; border: 1px dashed #cbd5e1;">No se registran actas municipales ingresadas.</div>`;
    }
    filtrarYRenderizarTablaVotos();
}

window.kpiFiltroActivo = "Todos";
window.aplicarFiltroKPI = function(tipoVoto, elemento) {
    window.kpiFiltroActivo = tipoVoto;
    const tarjetas = document.querySelectorAll('.kpi-mini-card');
    tarjetas.forEach(t => {
        t.style.opacity = '0.5';
        t.style.transform = 'scale(0.98)';
        t.style.border = 'none';
        t.style.boxShadow = 'none';
    });
    if(elemento) {
        elemento.style.opacity = '1';
        elemento.style.transform = 'scale(1.02)';
        elemento.style.border = '1px solid #0f172a';
        elemento.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    }
    filtrarYRenderizarTablaVotos();
};

function filtrarYRenderizarTablaVotos() {
    const catFiltro = document.getElementById("filter-voto-categoria").value;
    const searchTexto = document.getElementById("filter-voto-busqueda").value.toLowerCase().trim();
    const tbody = document.querySelector("#tabla-global-votaciones tbody");
    if (!tbody) return;

    const filtrados = votacionesMemory.filter(v => {
        const coincideCat = (catFiltro === "Todos") || (v.categoria === catFiltro);
        const coincideBusqueda = !searchTexto || v.tema.toLowerCase().includes(searchTexto) || (v.comentarioExplicacion || "").toLowerCase().includes(searchTexto);
        const coincideKPI = (window.kpiFiltroActivo === "Todos") || (v.votoAguayo === window.kpiFiltroActivo);
        return coincideCat && coincideBusqueda && coincideKPI;
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
                <td style="text-align: center; vertical-align: middle;">
                    <button onclick="window.abrirVistaVotoUnico('${v.id}')" style="background: white; border: 1px solid #cbd5e1; color: #475569; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;" onmouseover="this.style.background='#f1f5f9'; this.style.color='#0f172a'; this.style.borderColor='#94a3b8';" onmouseout="this.style.background='white'; this.style.color='#475569'; this.style.borderColor='#cbd5e1';">
                        👁️ Ver / Editar
                    </button>
                </td>
            </tr>`;
    });

    tbody.innerHTML = htmlV || `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-light);">No se registran votaciones bajo este filtro de búsqueda.</td></tr>`;
}

// --- FLUJO OPERACIONAL MÁSTER: ESCRITURA RELACIONAL EN FIREBASE ---
async function ejecutarGuardadoSesionConcejo() {
    const numSesion = document.getElementById("s-numero").value;
    const fechaSesion = document.getElementById("s-fecha").value;
    const tipoSesion = document.getElementById("s-tipo").value;
    const resumen = document.getElementById("s-resumen").value.trim();

    if (!numSesion || !fechaSesion) return;

    const btnGuardar = document.getElementById("btn-guardar-sesion-maestra");
    btnGuardar.disabled = true; btnGuardar.innerText = "Subiendo archivo y consolidando...";

    // 🚀 LÓGICA DE SUBIDA DE PDF A FIREBASE STORAGE (Con variable "app" incluida)
    const fileInput = document.getElementById("s-acta-file");
    let urlActa = "";
    
    try {
        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const storage = getStorage(app); // Obtiene la instancia de Storage asociada a TU cuenta logueada
            const fileRef = ref(storage, `concejos/${CURRENT_TENANT_ID}/actas/${Date.now()}_${file.name}`);
            
            // Subir el archivo a Firebase Storage
            const snapshot = await uploadBytes(fileRef, file);
            // Obtener la URL de descarga pública
            urlActa = await getDownloadURL(snapshot.ref);
        } else if (window.sesionEditandoId) {
            // Si estamos editando y no subió archivo nuevo, mantenemos la URL antigua
            const sesionAntigua = sesionesMemory.find(s => s.id === window.sesionEditandoId);
            if (sesionAntigua && sesionAntigua.pdfActaUrl) urlActa = sesionAntigua.pdfActaUrl;
        }
    } catch (error) {
        console.error("Error al subir PDF a Storage:", error);
        alert("Hubo un problema al subir el PDF a la nube. Revisa las reglas de Storage en Firebase o tu conexión a internet.");
        btnGuardar.disabled = false; btnGuardar.innerText = "Sincronizar y Consolidar Acta";
        return; // Detener guardado si el PDF falla para evitar datos rotos
    }

    try {
        const payloadSesion = {
            numeroSesion: Number(numSesion), fecha: fechaSesion, tipo: tipoSesion,
            pdfActaUrl: urlActa, resumenEjecutivo: resumen, tenantId: CURRENT_TENANT_ID,
            fechaUltimaModificacion: serverTimestamp()
        };
        
        let targetSesionId = window.sesionEditandoId;
        const batch = writeBatch(db);

        if (targetSesionId) {
            const docRefSesion = doc(db, "sesiones_concejo", targetSesionId);
            batch.update(docRefSesion, payloadSesion);
            
            const votosAsociados = votacionesMemory.filter(v => v.idSesion === targetSesionId);
            votosAsociados.forEach(v => {
                const refVieja = doc(db, "votaciones_concejo", v.id);
                batch.delete(refVieja);
            });
        } else {
            payloadSesion.fechaCargaPlataforma = serverTimestamp();
            const docRefSesion = await addDoc(collection(db, "sesiones_concejo"), payloadSesion);
            targetSesionId = docRefSesion.id;
        }

        const subformNodos = subformListContainer.querySelectorAll(".subform-vote-row-box");
        if (subformNodos.length > 0) {
            subformNodos.forEach(nodo => {
                const subPayload = {
                    idSesion: targetSesionId,
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
        }
        
        await batch.commit(); 

        window.cerrarModalG("modal-sesion-form");
        window.sesionEditandoId = null;
        await sincronizarDatosBaseConcejo();
        calcularDashboardIndicadores();
        renderizarPanelesActivos();
    } catch (err) {
        console.error(err);
    } finally {
        btnGuardar.disabled = false; btnGuardar.innerText = "Sincronizar y Consolidar Acta";
    }
}

function inyectarFilaVotacionDinamica() {
    subformVotacionContador++;
    const rowHTML = `
        <div class="subform-vote-row-box" id="voto-row-${subformVotacionContador}">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <h5 style="font-size:12px; margin:0; color:var(--text-dark);">Punto en Tabla de Sesión</h5>
                <button type="button" style="background:none; border:none; color:#ef4444; font-size:16px; cursor:pointer;" onclick="document.getElementById('voto-row-${subformVotacionContador}').remove()">&times;</button>
            </div>
            <div class="form-row-grid">
                <div class="form-group" style="flex:2;"><label>Tema Tratado / Proyecto</label><input type="text" class="input-v-tema" placeholder="Ej: Adjudicación licitación áreas verdes..." required></div>
                <div class="form-group" style="flex:1;">
                    <label>Categoría</label>
                    <select class="select-v-categoria">
                        <option value="Todos">General</option>
                        <option value="Seguridad">Seguridad Comunal</option>
                        <option value="Educación">Educación</option>
                        <option value="Salud">Salud</option>
                        <option value="Áreas Verdes">Áreas Verdes y Ornato</option>
                        <option value="Tránsito">Tránsito y Transporte</option>
                        <option value="Presupuesto">Presupuesto y Finanzas</option>
                        <option value="Patentes">Patentes de Alcoholes/Comerciales</option>
                        <option value="Urbanismo">Urbanismo y Obras públicas</option>
                    </select>
                </div>
            </div>
            <div class="form-row-grid">
                <div class="form-group">
                    <label>Resultado General Concejo</label>
                    <select class="select-v-resultado">
                        <option value="Aprobado">✅ Aprobado</option>
                        <option value="Rechazado">❌ Rechazado</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Mi Voto Emitido</label>
                    <select class="select-v-aguayo" style="font-weight:700;">
                        <option value="A Favor" style="color:#10b981;">A Favor</option>
                        <option value="En Contra" style="color:#ef4444;">En Contra</option>
                        <option value="Abstención" style="color:#f59e0b;">Abstención</option>
                        <option value="Ausente" style="color:#64748b;">Ausente en Sala</option>
                    </select>
                </div>
                <div class="form-group" style="flex:2;"><label>Comentario / Justificación Ciudadana</label><input type="text" class="input-v-comentario" placeholder="Argumento del voto para el público..."></div>
            </div>
        </div>
    `;
    subformListContainer.insertAdjacentHTML('beforeend', rowHTML);
}

window.inyectarFilaVotacionDinamica = inyectarFilaVotacionDinamica;

// ==============================================================================
// 👑 LÓGICA DE VISTA DE EXPEDIENTE LECTURA
// ==============================================================================
window.abrirVistaExpediente = function(idSesion) {
    const sesion = sesionesMemory.find(s => s.id === idSesion);
    if (!sesion) return;

    document.getElementById("exp-tipo-sesion").innerText = sesion.tipo || "ORDINARIA";
    document.getElementById("exp-num-sesion").innerText = "#" + (sesion.numeroSesion || "");
    
    const elFecha = document.getElementById("exp-fecha-sesion");
    if(elFecha) elFecha.innerText = sesion.fecha ? sesion.fecha.split("-").reverse().join("/") : "S/F";
    
    document.getElementById("exp-resumen").innerHTML = sesion.resumenEjecutivo || '<i>No se ha registrado un resumen ejecutivo para esta jornada legislativa.</i>';

    const asisCont = document.getElementById("exp-asistencia");
    if(sesion.asistencia === 'Asiste' || !sesion.asistencia) {
        asisCont.innerHTML = "✅ Presente";
        asisCont.style.color = "#16a34a"; asisCont.style.background = "#f0fdf4"; asisCont.style.borderColor = "#bbf7d0";
    } else {
        asisCont.innerHTML = "❌ Ausente";
        asisCont.style.color = "#dc2626"; asisCont.style.background = "#fef2f2"; asisCont.style.borderColor = "#fecaca";
    }

    const pdfCont = document.getElementById("exp-pdf-container");
    // Escondemos el visor por defecto cada vez que se abre el expediente
    const viewer = document.getElementById("exp-pdf-viewer");
    if(viewer) viewer.style.display = "none";

    if(sesion.pdfActaUrl) {
        pdfCont.innerHTML = `
            <div style="display: flex; gap: 8px;">
                <button onclick="window.togglePdfPreview('${sesion.pdfActaUrl}')" style="display: inline-flex; align-items: center; gap: 6px; background: #0f172a; border: none; cursor: pointer; color: white; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; transition: all 0.2s;">
                    👁️ Previsualizar Acta
                </button>
                <a href="${sesion.pdfActaUrl}" target="_blank" style="display: inline-flex; align-items: center; gap: 6px; background: #f1f5f9; color: #0f172a; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; text-decoration: none; border: 1px solid #cbd5e1;">
                    ⬇️ Descargar
                </a>
            </div>
        `;
    } else {
        pdfCont.innerHTML = `<span style="font-size: 12px; color: #94a3b8; font-weight: 600; display: block; padding: 8px 0;">No se ha subido el documento original.</span>`;
    }

    const tbodyVotos = document.getElementById("exp-lista-votaciones");
    const votosAsociados = votacionesMemory.filter(v => v.idSesion === idSesion);
    
    if(votosAsociados.length > 0) {
        let htmlV = "";
        votosAsociados.forEach(v => {
            let badgeClass = v.votoAguayo === "A Favor" ? "background:#f0fdf4; color:#16a34a; border: 1px solid #bbf7d0;" : 
                             v.votoAguayo === "En Contra" ? "background:#fef2f2; color:#dc2626; border: 1px solid #fecaca;" : 
                             v.votoAguayo === "Abstención" ? "background:#fdf2f8; color:#db2777; border: 1px solid #fbcfe8;" : 
                             "background:#f1f5f9; color:#64748b; border: 1px solid #e2e8f0;";
                             
            let resGralClass = v.resultadoGeneral === "Aprobado" ? "background: #f0fdf4; color: #16a34a;" : "background: #fef2f2; color: #dc2626;";

            htmlV += `<tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 16px; font-size: 12px; font-weight: 700; color: #0ea5e9;">${v.categoria}</td>
                        <td style="padding: 16px;">
                            <p style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0;">${v.tema}</p>
                            <p style="font-size: 11px; color: #64748b; margin: 0; font-style: italic;">"${v.comentarioExplicacion || 'Sin justificación registrada.'}"</p>
                        </td>
                        <td style="padding: 16px; text-align: center;"><span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; ${resGralClass}">${v.resultadoGeneral}</span></td>
                        <td style="padding: 16px; text-align: center;"><span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 800; ${badgeClass}">${v.votoAguayo}</span></td>
                    </tr>`;
        });
        if(tbodyVotos) tbodyVotos.innerHTML = htmlV;
    } else {
        if(tbodyVotos) tbodyVotos.innerHTML = `<tr><td colspan="4" style="padding: 24px; text-align: center; color: #94a3b8; font-size: 12px;">No se registraron temas o votaciones en esta sesión.</td></tr>`;
    }

    const btnEditar = document.getElementById("exp-btn-editar-modal");
    if(btnEditar) {
        btnEditar.onclick = function() {
            window.cerrarModalG('modal-expediente-sesion');
            setTimeout(() => {
                window.abrirEdicionSesion(idSesion);
            }, 350); 
        };
    }

    window.abrirModalG("modal-expediente-sesion");
};

// ==============================================================================
// 👑 LÓGICA DE VISTA Y EDICIÓN DE VOTO ÚNICO
// ==============================================================================
window.votoUnicoEditandoId = null;
window.sesionAsociadaAlVotoId = null;

window.abrirVistaVotoUnico = function(idVoto) {
    const voto = votacionesMemory.find(v => v.id === idVoto);
    if (!voto) return;
    
    window.votoUnicoEditandoId = idVoto;
    window.sesionAsociadaAlVotoId = voto.idSesion;

    window.cancelarEdicionVotoUnico();

    document.getElementById("mv-categoria").innerText = voto.categoria || "General";
    document.getElementById("mv-tema-title").innerText = voto.tema || "Sin título";

    const fFormatted = voto.fecha ? voto.fecha.split("-").reverse().join("/") : "S/F";
    document.getElementById("mv-num-sesion").innerText = voto.numeroSesion || "";
    document.getElementById("mv-fecha-sesion").innerText = fFormatted;

    document.getElementById("mv-input-tema").value = voto.tema || "";
    document.getElementById("mv-input-categoria").value = voto.categoria || "Todos";
    document.getElementById("mv-input-resultado").value = voto.resultadoGeneral || "Aprobado";
    document.getElementById("mv-input-aguayo").value = voto.votoAguayo || "A Favor";
    document.getElementById("mv-input-comentario").value = voto.comentarioExplicacion || "";

    const selectAguayo = document.getElementById("mv-input-aguayo");
    selectAguayo.style.color = voto.votoAguayo === "A Favor" ? "#10b981" : 
                               voto.votoAguayo === "En Contra" ? "#ef4444" : 
                               voto.votoAguayo === "Abstención" ? "#f59e0b" : "#64748b";

    window.abrirModalG("modal-voto-single");
};

window.activarEdicionVotoUnico = function() {
    const inputs = document.querySelectorAll(".modo-vista-lectura");
    inputs.forEach(input => {
        if(input.tagName === "SELECT") {
            input.removeAttribute("disabled");
        } else {
            input.removeAttribute("readonly");
        }
    });

    document.getElementById("mv-input-aguayo").style.color = "#0f172a";
    document.getElementById("btn-activar-edicion-voto").style.display = "none";
    document.getElementById("mv-acciones-guardar").style.display = "block";
};

window.cancelarEdicionVotoUnico = function() {
    const inputs = document.querySelectorAll(".modo-vista-lectura");
    inputs.forEach(input => {
        if(input.tagName === "SELECT") {
            input.setAttribute("disabled", "true");
        } else {
            input.setAttribute("readonly", "true");
        }
    });

    document.getElementById("btn-activar-edicion-voto").style.display = "flex";
    document.getElementById("mv-acciones-guardar").style.display = "none";
    
    if(window.votoUnicoEditandoId) {
        const voto = votacionesMemory.find(v => v.id === window.votoUnicoEditandoId);
        if(voto) {
            const selectAguayo = document.getElementById("mv-input-aguayo");
            selectAguayo.style.color = voto.votoAguayo === "A Favor" ? "#10b981" : 
                                       voto.votoAguayo === "En Contra" ? "#ef4444" : 
                                       voto.votoAguayo === "Abstención" ? "#f59e0b" : "#64748b";
        }
    }
};

window.guardarEdicionVotoUnico = async function() {
    if(!window.votoUnicoEditandoId) return;

    const btnSubmit = document.querySelector("#mv-acciones-guardar button[type='submit']");
    btnSubmit.disabled = true;
    btnSubmit.innerText = "Guardando...";

    try {
        const payload = {
            tema: document.getElementById("mv-input-tema").value.trim(),
            categoria: document.getElementById("mv-input-categoria").value,
            resultadoGeneral: document.getElementById("mv-input-resultado").value,
            votoAguayo: document.getElementById("mv-input-aguayo").value,
            comentarioExplicacion: document.getElementById("mv-input-comentario").value.trim()
        };

        const batch = writeBatch(db);
        const refVoto = doc(db, "votaciones_concejo", window.votoUnicoEditandoId);
        batch.update(refVoto, payload);
        await batch.commit();

        window.cerrarModalG("modal-voto-single");
        await sincronizarDatosBaseConcejo();
        calcularDashboardIndicadores();
        filtrarYRenderizarTablaVotos();
        renderizarPanelesActivos(); 
    } catch(err) {
        console.error("Error actualizando voto", err);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = "Guardar Cambios del Voto";
    }
};

window.irAExpedienteDesdeVoto = function() {
    if(window.sesionAsociadaAlVotoId) {
        window.cerrarModalG("modal-voto-single");
        setTimeout(() => {
            window.abrirVistaExpediente(window.sesionAsociadaAlVotoId);
        }, 350);
    }
};

// ==============================================================================
// 👑 LÓGICA DE PREVISUALIZACIÓN DE PDF TIPO BLOB (ANTI-BLOQUEOS)
// ==============================================================================
window.togglePdfPreview = async function(url) {
    const viewer = document.getElementById("exp-pdf-viewer");
    const iframe = document.getElementById("exp-pdf-iframe");
    
    if (viewer.style.display === "none") {
        viewer.style.display = "block";
        iframe.src = ""; // Limpiamos visor anterior
        
        // Animación de carga visual (Base64 SVG)
        viewer.style.background = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"xMidYMid\" width=\"40\" height=\"40\" style=\"margin:auto; display:block;\"><circle cx=\"50\" cy=\"50\" fill=\"none\" stroke=\"%230b438c\" stroke-width=\"8\" r=\"35\" stroke-dasharray=\"164.93361431346415 56.97787143782138\"><animateTransform attributeName=\"transform\" type=\"rotate\" repeatCount=\"indefinite\" dur=\"1s\" values=\"0 50 50;360 50 50\" keyTimes=\"0;1\"></animateTransform></circle></svg>') center center no-repeat #f8fafc";
        
        try {
            // Descargamos el documento como Blob para saltarnos el bloqueo de CORS y X-Frame-Options de Google
            const response = await fetch(url);
            const blob = await response.blob();
            
            // Creamos una URL local temporal en el navegador y la inyectamos
            const objectUrl = URL.createObjectURL(blob);
            iframe.src = objectUrl;
            
        } catch(e) {
            console.error("Error al cargar la previsualización del PDF:", e);
            // Plan B en caso de que las reglas de red fallen
            iframe.src = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
        }
    } else {
        iframe.src = "";
        viewer.style.display = "none";
    }
};