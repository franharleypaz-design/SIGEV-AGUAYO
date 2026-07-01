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
    document.getElementById("lbl-pdf-name").innerText = "📄 Haz clic aquí para adjuntar el acta en PDF";
    document.getElementById("lbl-pdf-name").style.color = "#475569";
    document.getElementById("lbl-pdf-name").style.fontWeight = "normal";
    document.getElementById("votaciones-dinamicas-list").innerHTML = "";
    document.getElementById("s-acta-file").required = true;
    window.abrirModalG('modal-sesion-form');
};

document.getElementById('btn-trigger-nueva-sesion')?.addEventListener('click', window.prepararNuevaSesion);
document.getElementById('btn-close-form-x')?.addEventListener('click', () => window.cerrarModalG('modal-sesion-form'));
document.getElementById('btn-cancelar-sesion')?.addEventListener('click', () => window.cerrarModalG('modal-sesion-form'));

// Lógica de Formulario Dinámico de Temas (Sub-Votaciones)
document.getElementById('btn-append-voto-row')?.addEventListener('click', () => {
    const container = document.getElementById("votaciones-dinamicas-list");
    const count = container.children.length + 1;
    
    const div = document.createElement("div");
    div.className = "voto-row-item";
    div.style.cssText = "background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin-bottom: 12px; position: relative;";
    
    div.innerHTML = `
        <button type="button" onclick="this.parentElement.remove()" style="position: absolute; top: 12px; right: 16px; color: #ef4444; background: none; border: none; font-size: 16px; cursor: pointer;" title="Eliminar este tema">&times;</button>
        <h5 style="margin: 0 0 12px 0; font-size: 11px; color: #64748b; text-transform: uppercase;">Tema #${count}</h5>
        
        <div class="form-row-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 12px;">
            <div class="form-group" style="margin: 0;">
                <label style="font-size: 11px;">Categoría *</label>
                <select class="din-cat" required style="font-size: 13px;">
                    <option value="">Seleccione...</option>
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
            <div class="form-group" style="margin: 0;">
                <label style="font-size: 11px;">Resultado del Concejo *</label>
                <select class="din-res" required style="font-size: 13px;">
                    <option value="Aprobado">Aprobado</option>
                    <option value="Rechazado">Rechazado</option>
                </select>
            </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="font-size: 11px;">Descripción del Tema / Proyecto *</label>
            <input type="text" class="din-tema" placeholder="Ej: Aprobación trato directo luminarias" required style="font-size: 13px;">
        </div>
        
        <div class="form-row-grid" style="display: grid; grid-template-columns: 1fr 2fr; gap: 16px; align-items: start;">
            <div class="form-group" style="margin: 0;">
                <label style="font-size: 11px;">Mi Voto *</label>
                <select class="din-voto" required style="font-size: 13px;">
                    <option value="Pendiente">Pendiente de Votar</option>
                    <option value="A Favor">A Favor</option>
                    <option value="En Contra">En Contra</option>
                    <option value="Abstención">Abstención</option>
                    <option value="Ausente">Ausente en Sala</option>
                </select>
            </div>
            <div class="form-group" style="margin: 0;">
                <label style="font-size: 11px;">Argumentación (Opcional)</label>
                <textarea class="din-com" rows="2" placeholder="Motivo del voto..." style="font-size: 13px;"></textarea>
            </div>
        </div>
    `;
    container.appendChild(div);
});

// ==============================================================================
// 👑 LÓGICA DE FIRESTORE (GUARDAR Y CARGAR)
// ==============================================================================
import { auth, db, app } from "./app.js";
import { collection, addDoc, doc, getDoc, updateDoc, getDocs, query, where, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const storage = getStorage(app);
const subdominioCrudo = window.location.hostname.split('.')[0].toLowerCase();
const subdominioLimpio = subdominioCrudo.replace('sigev-', ''); 
const CURRENT_TENANT_ID = sessionStorage.getItem('SIGEV_ACTIVE_TENANT') || ((subdominioLimpio === 'localhost' || subdominioLimpio === '127' || subdominioLimpio === 'landing' || !subdominioLimpio) ? "paz" : subdominioLimpio);

let memorySesiones = [];
let memoryVotaciones = [];

// Función para subir archivos a Firebase Storage
async function subirActaPDF(file, sessionId) {
    if (!file) return null;
    const storageRef = ref(storage, `actas_concejo/${CURRENT_TENANT_ID}/${sessionId}_${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
}

// Guardar / Actualizar Sesión Maestra
document.getElementById('btn-guardar-sesion-maestra')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-guardar-sesion-maestra');
    
    const sNum = document.getElementById("s-numero").value;
    const sFec = document.getElementById("s-fecha").value;
    const sTip = document.getElementById("s-tipo").value;
    const sRes = document.getElementById("s-resumen").value.trim();
    const fileInput = document.getElementById("s-acta-file");
    
    if(!sNum || !sFec || !sTip) {
        alert("Faltan datos maestros obligatorios.");
        return;
    }

    if (!window.sesionEditandoId && fileInput.files.length === 0) {
        alert("Debe adjuntar el archivo PDF del acta.");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Sincronizando...";

    try {
        let pdfUrl = null;
        let finalSessionId = window.sesionEditandoId;

        // 1. Crear o Actualizar Documento Maestro de la Sesión
        if (finalSessionId) {
            // Modo Edición
            const updatePayload = {
                numero: parseInt(sNum),
                fechaIso: sFec,
                tipo: sTip,
                resumen: sRes,
                ultimaModificacion: serverTimestamp()
            };
            if (fileInput.files.length > 0) {
                updatePayload.urlActa = await subirActaPDF(fileInput.files[0], finalSessionId);
            }
            await updateDoc(doc(db, "sesiones_concejo", finalSessionId), updatePayload);
        } else {
            // Modo Creación
            const newRef = doc(collection(db, "sesiones_concejo"));
            finalSessionId = newRef.id;
            
            pdfUrl = await subirActaPDF(fileInput.files[0], finalSessionId);
            
            const createPayload = {
                tenantId: CURRENT_TENANT_ID,
                numero: parseInt(sNum),
                fechaIso: sFec,
                tipo: sTip,
                resumen: sRes,
                urlActa: pdfUrl,
                estado: "Cerrada", 
                fechaRegistro: serverTimestamp()
            };
            await setDoc(newRef, createPayload);
        }

        // 2. Procesar Sub-Votaciones (Temas de la sesión)
        const temasNodes = document.querySelectorAll(".voto-row-item");
        let contadorA = 0; let contadorC = 0; let contadorAbs = 0; let contadorAus = 0;

        for (let i = 0; i < temasNodes.length; i++) {
            const node = temasNodes[i];
            const cat = node.querySelector(".din-cat").value;
            const res = node.querySelector(".din-res").value;
            const tem = node.querySelector(".din-tema").value.trim();
            const vot = node.querySelector(".din-voto").value;
            const com = node.querySelector(".din-com").value.trim();

            if(!cat || !tem || !vot) continue; 

            if (vot === "A Favor") contadorA++;
            if (vot === "En Contra") contadorC++;
            if (vot === "Abstención") contadorAbs++;
            if (vot === "Ausente") contadorAus++;

            const payloadVoto = {
                tenantId: CURRENT_TENANT_ID,
                sessionId: finalSessionId,
                sesionNum: parseInt(sNum),
                sesionFecha: sFec,
                categoria: cat,
                resultadoConcejo: res,
                tema: tem,
                miVoto: vot,
                comentario: com,
                fechaRegistro: serverTimestamp()
            };

            await addDoc(collection(db, "votos_concejo"), payloadVoto);
        }

        // 3. Actualizar contadores totales de la sesión
        await updateDoc(doc(db, "sesiones_concejo", finalSessionId), {
            votosAFavor: contadorA,
            votosEnContra: contadorC,
            votosAbstencion: contadorAbs,
            votosAusente: contadorAus,
            totalTemas: temasNodes.length
        });

        window.cerrarModalG('modal-sesion-form');
        window.cargarDatosMaestrosConcejo(); 
        
    } catch(err) {
        console.error("Error guardando sesión:", err);
        alert("Ocurrió un error al procesar el acta.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Sincronizar y Consolidar Acta";
    }
});

// Cargar Todos los Datos (Sesiones y Votaciones)
window.cargarDatosMaestrosConcejo = async function() {
    try {
        const qSesiones = query(collection(db, "sesiones_concejo"), where("tenantId", "==", CURRENT_TENANT_ID));
        const sSnap = await getDocs(qSesiones);
        memorySesiones = [];
        sSnap.forEach(d => memorySesiones.push({ id: d.id, ...d.data() }));
        memorySesiones.sort((a, b) => new Date(b.fechaIso) - new Date(a.fechaIso));

        const qVotos = query(collection(db, "votos_concejo"), where("tenantId", "==", CURRENT_TENANT_ID));
        const vSnap = await getDocs(qVotos);
        memoryVotaciones = [];
        vSnap.forEach(d => memoryVotaciones.push({ id: d.id, ...d.data() }));
        memoryVotaciones.sort((a, b) => new Date(b.sesionFecha) - new Date(a.sesionFecha));

        renderizarGrillaSesiones();
        renderizarTablaVotaciones(memoryVotaciones);
        actualizarKPIsVotaciones(memoryVotaciones);

    } catch (e) {
        console.error("Error leyendo datos del concejo:", e);
    }
};

// Renderizar Tarjetas de Sesiones
function renderizarGrillaSesiones() {
    const canvas = document.getElementById("lista-sesiones-canvas");
    if (!canvas) return;

    if (memorySesiones.length === 0) {
        canvas.innerHTML = `<div style="text-align:center; padding: 40px; color: #64748b; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; width: 100%;">No hay sesiones de concejo registradas en la plataforma.</div>`;
        return;
    }

    let html = "";
    memorySesiones.forEach(s => {
        let fStr = "00/00/0000";
        if(s.fechaIso) {
            const p = s.fechaIso.split("-");
            fStr = `${p[2]}/${p[1]}/${p[0]}`;
        }

        const statsA = s.votosAFavor || 0;
        const statsC = s.votosEnContra || 0;
        const statsTot = s.totalTemas || 0;

        html += `
        <div class="session-card">
            <div class="session-card-header">
                <div class="session-id">SESIÓN Nº ${s.numero || "S/N"}</div>
                <div class="session-type">${s.tipo || "General"}</div>
            </div>
            
            <div class="session-date-row">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                Celebrada el ${fStr}
            </div>

            <div class="session-abstract">
                ${s.resumen || "<i>Sin resumen ingresado.</i>"}
            </div>

            <div class="session-kpi-row">
                <div class="s-kpi"><span class="val">${statsTot}</span><span class="lbl">Temas Tratados</span></div>
                <div class="s-kpi"><span class="val a-favor">${statsA}</span><span class="lbl">Votos Favor</span></div>
                <div class="s-kpi"><span class="val en-contra">${statsC}</span><span class="lbl">Votos Contra</span></div>
            </div>

            <button class="btn-ver-expediente" onclick="window.abrirExpedienteMaestro('${s.id}')">
                Abrir Expediente y Acta
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
            </button>
        </div>
        `;
    });

    canvas.innerHTML = html;
}

// ==============================================================================
// 👑 LÓGICA DEL EXPEDIENTE MAESTRO DE LECTURA (SESIÓN COMPLETA)
// ==============================================================================
window.sesionExpedienteActiva = null; 
window.urlActaCache = null;

window.abrirExpedienteMaestro = async function(id) {
    const s = memorySesiones.find(x => x.id === id);
    if(!s) return;
    
    window.sesionExpedienteActiva = s;
    window.urlActaCache = s.urlActa; 
    
    document.getElementById("exp-num-sesion").innerText = `#${s.numero || "S/N"}`;
    document.getElementById("exp-tipo-sesion").innerText = (s.tipo || "General").toUpperCase();
    
    let fStr = "Desconocida";
    if(s.fechaIso) {
        const p = s.fechaIso.split("-");
        fStr = `${p[2]}/${p[1]}/${p[0]}`;
    }
    document.getElementById("exp-fecha-sesion").innerText = fStr;
    
    document.getElementById("exp-resumen").innerHTML = s.resumen ? s.resumen.replace(/\n/g, '<br>') : "<i>Sin resumen ejecutivo ingresado.</i>";

    let asistenciaHtml = "Asistió y Votó";
    if (s.totalTemas > 0 && s.votosAusente === s.totalTemas) {
        asistenciaHtml = "<span style='color:#ef4444;'>❌ Ausente en Sesión</span>";
    } else {
        asistenciaHtml = "✅ Presente y Votando";
    }
    document.getElementById("exp-asistencia").innerHTML = asistenciaHtml;

    // Descargador directo de PDF
    const url = s.urlActa;
    const container = document.getElementById("exp-pdf-container");
    
    if (url) {
        container.style.display = "block";
        container.innerHTML = `
            <a href="${url}" target="_blank" style="background:#f8fafc; border:1px solid #cbd5e1; padding:12px 16px; border-radius:6px; display:inline-flex; align-items:center; gap:8px; color:#0b438c; text-decoration:none; font-size:13px; font-weight:700; transition:0.2s;" onmouseover="this.style.background='#f1f5f9'; this.style.borderColor='#94a3b8';" onmouseout="this.style.background='#f8fafc'; this.style.borderColor='#cbd5e1';">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><polyline points="9 15 12 18 15 15"></polyline></svg> 
                Descargar Acta Digital PDF
            </a>
        `;
    } else {
        container.innerHTML = `<span style="font-size: 13px; color: #94a3b8; font-style: italic;">Sin archivo adjunto</span>`;
    }

    // Llenar tabla de votaciones hijas
    const tbody = document.getElementById("exp-lista-votaciones");
    const votosHijos = memoryVotaciones.filter(v => v.sessionId === id);
    
    if (votosHijos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: #64748b;">No hay temas ni votaciones registradas para esta sesión.</td></tr>`;
    } else {
        let html = "";
        votosHijos.forEach(v => {
            let safeCat = v.categoria || v.area || "General";
            let safeTema = v.tema || v.titulo || "Sin descripción registrada";
            let resConcejo = v.resultadoConcejo || v.resultado || "Pendiente";
            let mVoto = v.miVoto || "Pendiente";

            let resBadge = resConcejo === "Aprobado" 
                ? `<span style="background: #f0fdf4; color: #16a34a; padding: 4px 10px; border-radius: 4px; font-size: 11.5px; font-weight: 700; border: 1px solid #bbf7d0;">Aprobado</span>` 
                : `<span style="background: #fef2f2; color: #ef4444; padding: 4px 10px; border-radius: 4px; font-size: 11.5px; font-weight: 700; border: 1px solid #fca5a5;">Rechazado</span>`;
            
            let miVotoBadge = "";
            if(mVoto === "A Favor") miVotoBadge = `<span style="background: #f0fdf4; color: #16a34a; padding: 4px 10px; border-radius: 4px; font-size: 11.5px; font-weight: 800; border: 1px solid #bbf7d0;">🟢 A Favor</span>`;
            else if(mVoto === "En Contra") miVotoBadge = `<span style="background: #fef2f2; color: #ef4444; padding: 4px 10px; border-radius: 4px; font-size: 11.5px; font-weight: 800; border: 1px solid #fca5a5;">🔴 En Contra</span>`;
            else if(mVoto === "Abstención") miVotoBadge = `<span style="background: #fffbeb; color: #d97706; padding: 4px 10px; border-radius: 4px; font-size: 11.5px; font-weight: 800; border: 1px solid #fde68a;">🟡 Abstención</span>`;
            else if(mVoto === "Ausente") miVotoBadge = `<span style="background: #f8fafc; color: #64748b; padding: 4px 10px; border-radius: 4px; font-size: 11.5px; font-weight: 800; border: 1px solid #e2e8f0;">⚫ Ausente</span>`;
            else miVotoBadge = `<span style="background: #f1f5f9; color: #94a3b8; padding: 4px 10px; border-radius: 4px; font-size: 11.5px; font-weight: 800; border: 1px solid #cbd5e1;">⚪ Pendiente</span>`;

            html += `
            <tr style="border-bottom: 1px solid #e2e8f0; background: #ffffff;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
                <td style="padding: 14px 16px; font-size: 12.5px; font-weight: 700; color: #0b438c; width: 15%; white-space: nowrap;">${safeCat}</td>
                <td style="padding: 14px 16px; font-size: 13.5px; color: #334155; line-height: 1.5; width: 55%; font-weight: 500;">${safeTema}</td>
                <td style="padding: 14px 16px; text-align: center; width: 15%; white-space: nowrap;">${resBadge}</td>
                <td style="padding: 14px 16px; text-align: center; width: 15%; white-space: nowrap;">${miVotoBadge}</td>
            </tr>
            `;
        });
        tbody.innerHTML = html;
    }

    window.abrirModalG("modal-expediente-sesion");
};

// ==============================================================================
// 👑 LÓGICA DE TABLA GENERAL DE VOTACIONES Y SUS FILTROS
// ==============================================================================
function renderizarTablaVotaciones(lista) {
    const tbody = document.querySelector("#tabla-global-votaciones tbody");
    if (!tbody) return;

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #64748b;">No se encontraron registros de votaciones.</td></tr>`;
        return;
    }

    let html = "";
    lista.forEach(v => {
        let fStr = "00/00/0000";
        if(v.sesionFecha) {
            const p = v.sesionFecha.split("-");
            fStr = `${p[2]}/${p[1]}/${p[0]}`;
        }

        let safeCat = v.categoria || v.area || "General";
        let safeTema = v.tema || v.titulo || "Sin descripción registrada";
        let resConcejo = v.resultadoConcejo || v.resultado || "Pendiente";
        let mVoto = v.miVoto || "Pendiente";

        let resBadge = resConcejo === "Aprobado" 
            ? `<span style="background:#f0fdf4; color:#16a34a; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:700;">Aprobado</span>` 
            : `<span style="background:#fef2f2; color:#ef4444; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:700;">Rechazado</span>`;
        
        let miVotoBadge = "";
        if(mVoto === "A Favor") miVotoBadge = `<span style="color:#16a34a; font-weight:800; font-size:13px;">🟢 A Favor</span>`;
        else if(mVoto === "En Contra") miVotoBadge = `<span style="color:#ef4444; font-weight:800; font-size:13px;">🔴 En Contra</span>`;
        else if(mVoto === "Abstención") miVotoBadge = `<span style="color:#f59e0b; font-weight:800; font-size:13px;">🟡 Abstención</span>`;
        else if(mVoto === "Ausente") miVotoBadge = `<span style="color:#64748b; font-weight:800; font-size:13px;">⚫ Ausente</span>`;
        else miVotoBadge = `<span style="color:#94a3b8; font-weight:800; font-size:13px;">⚪ Pendiente</span>`;

        html += `
        <tr style="border-bottom: 1px solid #f1f5f9; background: #fff;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">
            <td style="padding: 14px 16px; font-size: 13px; color: #475569; font-weight: 600; white-space: nowrap;">
                Sesión ${v.sesionNum || "S/N"}<br>
                <span style="font-size: 11px; font-weight: normal;">${fStr}</span>
            </td>
            <td style="padding: 14px 16px; font-size: 13px; color: #0f172a; font-weight: 500; line-height: 1.4; max-width: 250px;">
                ${safeTema}
            </td>
            <td style="padding: 14px 16px; font-size: 12.5px; color: #0b438c; font-weight: 700;">
                ${safeCat}
            </td>
            <td style="padding: 14px 16px; text-align: center;">
                ${resBadge}
            </td>
            <td style="padding: 14px 16px; text-align: center;">
                ${miVotoBadge}
            </td>
            <td style="padding: 14px 16px; font-size: 12px; color: #64748b; font-style: italic; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${v.comentario || 'Sin observaciones'}">
                ${v.comentario || 'Sin nota...'}
            </td>
            <td style="padding: 14px 16px; text-align: center;">
                <button onclick="window.abrirDetalleVotoUnico('${v.id}')" style="background: transparent; border: 1px solid #cbd5e1; color: #475569; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; transition: 0.2s;" onmouseover="this.style.color='#0f172a'; this.style.background='#f1f5f9';">
                    Ver Detalle
                </button>
            </td>
        </tr>
        `;
    });

    tbody.innerHTML = html;
}

function actualizarKPIsVotaciones(lista) {
    document.getElementById("stat-total-votes").innerText = lista.length;
    document.getElementById("stat-favor-votes").innerText = lista.filter(x => x.miVoto === "A Favor").length;
    document.getElementById("stat-contra-votes").innerText = lista.filter(x => x.miVoto === "En Contra").length;
    document.getElementById("stat-abstencion-votes").innerText = lista.filter(x => x.miVoto === "Abstención").length;
    document.getElementById("stat-ausente-votes").innerText = lista.filter(x => x.miVoto === "Ausente").length;
}

// Motor de Filtros de Votaciones
let currentKpiFilterVotos = "Todos";

window.aplicarFiltroKPI = function(valor, element) {
    currentKpiFilterVotos = valor;
    document.querySelectorAll(".kpi-mini-card").forEach(c => {
        c.style.opacity = "0.5";
        c.style.border = "none";
        c.style.transform = "scale(1)";
    });
    element.style.opacity = "1";
    element.style.border = "1px solid #0b438c";
    element.style.transform = "scale(1.02)";
    filtrarVotacionesMaestro();
};

document.getElementById("filter-voto-categoria")?.addEventListener("change", filtrarVotacionesMaestro);
document.getElementById("filter-voto-busqueda")?.addEventListener("input", filtrarVotacionesMaestro);

document.getElementById("btn-clear-vote-filters")?.addEventListener("click", () => {
    document.getElementById("filter-voto-categoria").value = "Todos";
    document.getElementById("filter-voto-busqueda").value = "";
    document.querySelector(".kpi-mini-card.total-votes").click(); 
});

function filtrarVotacionesMaestro() {
    const cat = document.getElementById("filter-voto-categoria")?.value || "Todos";
    const search = document.getElementById("filter-voto-busqueda")?.value.toLowerCase().trim() || "";

    const filtrados = memoryVotaciones.filter(v => {
        let pKpi = true;
        if (currentKpiFilterVotos !== "Todos") {
            pKpi = v.miVoto === currentKpiFilterVotos;
        }

        let pCat = true;
        if (cat !== "Todos") {
            pCat = (v.categoria || v.area || "") === cat;
        }

        let pSearch = true;
        if (search) {
            pSearch = (v.tema || v.titulo || "").toLowerCase().includes(search) || (v.comentario || "").toLowerCase().includes(search);
        }

        return pKpi && pCat && pSearch;
    });

    renderizarTablaVotaciones(filtrados);
}


// ==============================================================================
// 👑 LÓGICA DE DETALLE Y EDICIÓN DE VOTO ÚNICO (MODAL POPUP)
// ==============================================================================
window.votoActivoId = null;

window.abrirDetalleVotoUnico = function(id) {
    const v = memoryVotaciones.find(x => x.id === id);
    if (!v) return;

    window.votoActivoId = v.id;
    
    const sesionPadre = memorySesiones.find(s => s.id === v.sessionId);
    window.sesionExpedienteActiva = sesionPadre || null;

    let safeTema = v.tema || v.titulo || "Tema Registrado";
    let safeCat = v.categoria || v.area || "GENERAL";
    let resConcejo = v.resultadoConcejo || v.resultado || "Pendiente";

    document.getElementById("mv-tema-title").innerText = safeTema;
    document.getElementById("mv-categoria").innerText = safeCat.toUpperCase();
    document.getElementById("mv-num-sesion").innerText = v.sesionNum || "S/N";
    
    let fStr = "00/00/0000";
    if(v.sesionFecha) {
        const p = v.sesionFecha.split("-");
        fStr = `${p[2]}/${p[1]}/${p[0]}`;
    }
    document.getElementById("mv-fecha-sesion").innerText = fStr;

    document.getElementById("mv-input-tema").value = safeTema;
    
    const catSelect = document.getElementById("mv-input-categoria");
    let optionExists = Array.from(catSelect.options).some(opt => opt.value === safeCat);
    catSelect.value = optionExists ? safeCat : "Todos";
    
    document.getElementById("mv-input-resultado").value = resConcejo;
    document.getElementById("mv-input-aguayo").value = v.miVoto || "Pendiente";
    document.getElementById("mv-input-comentario").value = v.comentario || "";

    window.cancelarEdicionVotoUnico();

    window.abrirModalG("modal-voto-single");
};

// FUNCIÓN CORREGIDA: Fuerza estilos visuales y remueve bloqueos
window.activarEdicionVotoUnico = function() {
    const inputs = ["mv-input-tema", "mv-input-categoria", "mv-input-resultado", "mv-input-aguayo", "mv-input-comentario"];
    
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.removeAttribute("readonly");
            el.removeAttribute("disabled");
            el.style.border = "1px solid #cbd5e1";
            el.style.background = "#ffffff";
            el.style.paddingLeft = "12px";
            el.style.pointerEvents = "auto";
        }
    });

    document.getElementById("btn-activar-edicion-voto").style.display = "none";
    document.getElementById("mv-acciones-guardar").style.display = "block";
};

// FUNCIÓN CORREGIDA: Devuelve a modo estricto de lectura
window.cancelarEdicionVotoUnico = function() {
    const inputs = ["mv-input-tema", "mv-input-categoria", "mv-input-resultado", "mv-input-aguayo", "mv-input-comentario"];
    
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === "SELECT") {
                el.setAttribute("disabled", true);
            } else {
                el.setAttribute("readonly", true);
            }
            // Restaurar estilos de lectura
            el.style.border = "1px solid transparent";
            el.style.background = "transparent";
            el.style.paddingLeft = "0";
            el.style.pointerEvents = "none";
        }
    });

    document.getElementById("btn-activar-edicion-voto").style.display = "flex";
    document.getElementById("mv-acciones-guardar").style.display = "none";

    // Si cancela, devolvemos los valores originales
    if(window.votoActivoId) {
        const v = memoryVotaciones.find(x => x.id === window.votoActivoId);
        if(v) {
            let safeTema = v.tema || v.titulo || "Tema Registrado";
            let safeCat = v.categoria || v.area || "GENERAL";

            document.getElementById("mv-input-tema").value = safeTema;
            
            const catSelect = document.getElementById("mv-input-categoria");
            let optionExists = Array.from(catSelect.options).some(opt => opt.value === safeCat);
            catSelect.value = optionExists ? safeCat : "Todos";

            document.getElementById("mv-input-resultado").value = v.resultadoConcejo || v.resultado || "Pendiente";
            document.getElementById("mv-input-aguayo").value = v.miVoto || "Pendiente";
            document.getElementById("mv-input-comentario").value = v.comentario || "";
        }
    }
};

window.irAExpedienteDesdeVoto = function() {
    window.cerrarModalG("modal-voto-single");
    if(window.sesionExpedienteActiva) {
        setTimeout(() => {
            window.abrirExpedienteMaestro(window.sesionExpedienteActiva.id);
        }, 300);
    }
};

window.guardarEdicionVotoUnico = async function() {
    if (!window.votoActivoId) return;

    const nTema = document.getElementById("mv-input-tema").value.trim();
    const nCat = document.getElementById("mv-input-categoria").value;
    const nRes = document.getElementById("mv-input-resultado").value;
    const nVoto = document.getElementById("mv-input-aguayo").value;
    const nCom = document.getElementById("mv-input-comentario").value.trim();

    if(!nTema) { alert("El tema no puede estar vacío."); return; }

    const vRef = doc(db, "votos_concejo", window.votoActivoId);

    try {
        await updateDoc(vRef, {
            tema: nTema,
            categoria: nCat,
            resultadoConcejo: nRes,
            miVoto: nVoto,
            comentario: nCom
        });

        const obj = memoryVotaciones.find(x => x.id === window.votoActivoId);
        if(obj) {
            if (obj.miVoto !== nVoto) {
                await recalcularEstadisticasSesion(obj.sessionId);
            }

            obj.tema = nTema;
            obj.categoria = nCat;
            obj.resultadoConcejo = nRes;
            obj.miVoto = nVoto;
            obj.comentario = nCom;
        }

        filtrarVotacionesMaestro(); 
        window.cancelarEdicionVotoUnico();
        alert("Voto modificado con éxito.");
        
    } catch(e) {
        console.error("Error al actualizar voto:", e);
        alert("Hubo un error al guardar los cambios.");
    }
};

async function recalcularEstadisticasSesion(sessionId) {
    const hijos = memoryVotaciones.filter(x => x.sessionId === sessionId);
    
    let aF = 0; let eC = 0; let aB = 0; let aU = 0;
    hijos.forEach(h => {
        let votoEvaluado = h.miVoto || "Pendiente";
        if(votoEvaluado === "A Favor") aF++;
        if(votoEvaluado === "En Contra") eC++;
        if(votoEvaluado === "Abstención") aB++;
        if(votoEvaluado === "Ausente") aU++;
    });

    try {
        await updateDoc(doc(db, "sesiones_concejo", sessionId), {
            votosAFavor: aF,
            votosEnContra: eC,
            votosAbstencion: aB,
            votosAusente: aU
        });
        
        const sObj = memorySesiones.find(x => x.id === sessionId);
        if(sObj) {
            sObj.votosAFavor = aF;
            sObj.votosEnContra = eC;
            sObj.votosAbstencion = aB;
            sObj.votosAusente = aU;
        }
        
        renderizarGrillaSesiones();
        
    } catch(e) {
        console.error("Error recalculando metadatos de sesión:", e);
    }
}

document.querySelectorAll(".concejo-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".concejo-tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".concejo-panel-content").forEach(p => p.classList.remove("active"));
        
        btn.classList.add("active");
        document.getElementById(btn.getAttribute("data-target")).classList.add("active");
    });
});

// INIT
auth.onAuthStateChanged((user) => {
    if (user) {
        window.cargarDatosMaestrosConcejo();
    }
});