// ==============================================================================
// SIGEV-AGUAYO - CONTROLADOR CENTRAL DEL BUZÓN CIUDADANO (TRIAGE INTELIGENTE)
// ==============================================================================
import { auth, db } from "./app.js";
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { actualizarPerfilLayout } from "./layout.js";

const urlParamsBuzon = new URLSearchParams(window.location.search);
const tenantPasaporte = urlParamsBuzon.get('t');
const subdominioDetectado = window.location.hostname.split('.')[0];
const TENANT_ID = tenantPasaporte || sessionStorage.getItem('SIGEV_ACTIVE_TENANT') || ((subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado);

let listaRegistrosBuzon = [];
let registroSeleccionadoId = null;
let filtroEstadoActual = "Nuevo"; 

let vecinoIdActualDetectado = null; 
let vecinoVerificadoData = null; 
let datosUsuarioConectado = null; 

const tablaCuerpo = document.querySelector("#tabla-buzon tbody");
const searchInput = document.getElementById("buzon-search");
const selectTipo = document.getElementById("buzon-filter-tipo");
const sidebarDetalle = document.getElementById("buzon-detail-sidebar");

auth.onAuthStateChanged(async (user) => {
    if (user) {
        actualizarPerfilLayout(user);
        try {
            const userSnap = await getDoc(doc(db, "usuarios", user.uid));
            if (userSnap.exists()) {
                datosUsuarioConectado = userSnap.data();
                inicializarComponentesBuzon();
                escucharColeccionBuzonCloud();
                escucharContadorEscaneosQR(); 
            } else {
                window.location.href = "index.html";
            }
        } catch (error) {
            console.error("Error inicializando entorno seguro de concejalía:", error);
        }
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

    const btnArchivar = document.getElementById("action-archivar");
    if(btnArchivar) btnArchivar.onclick = () => actualizarEstadoTicketSeleccionado("Archivado");
    
    const btnCrearVecino = document.getElementById("action-crear-vecino");
    if(btnCrearVecino) btnCrearVecino.onclick = clonarFichaVecinal;
    
    const btnClasificar = document.getElementById("action-clasificar-ticket");
    if(btnClasificar) btnClasificar.onclick = abrirModalClasificacion;
}

function escucharColeccionBuzonCloud() {
    const q = query(collection(db, "buzon_ciudadano"), where("tenantId", "==", TENANT_ID));
    
    onSnapshot(q, (snapshot) => {
        listaRegistrosBuzon = [];
        
        let countNuevo = 0;
        let countDerivados = 0;
        let countPorResponder = 0; 
        
        // Contadores analíticos digitales en memoria local
        let totalTickets = 0;
        let clasificados = 0;
        let ingresosHoy = 0;
        let ingresosAyer = 0;
        let tiposFrecuencia = {};

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfYesterday = startOfToday - 86400000;

        let esAdmin = false;
        if (datosUsuarioConectado && datosUsuarioConectado.rol) {
            const rolNormalizado = datosUsuarioConectado.rol.toUpperCase();
            if (rolNormalizado.includes("ADMIN")) esAdmin = true;
        }

        snapshot.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            if (!esAdmin && datosUsuarioConectado && data.concejalId !== datosUsuarioConectado.concejalId) return;

            listaRegistrosBuzon.push(data);
            totalTickets++;
            
            const eOrig = data.estado || "Nuevo";
            const eGest = data.estadoGestion || "";

            // 1. Clasificación interna para la barra de pestañas operativa
            if (eOrig === "Nuevo") countNuevo++;
            
            if (eGest === "Derivada" || eGest === "En gestión") {
                if (eOrig !== "Resuelto" && eOrig !== "Archivado") countDerivados++; 
            }
            
            if (eGest === "Finalizado en espera de respuesta") {
                countPorResponder++; 
            }

            // 2. Tasa de Triage Exitoso
            if (eOrig === "Clasificado" || eOrig === "Resuelto" || eGest !== "") {
                clasificados++;
            }

            // 3. Frecuencia de Categorías Compactadas
            const tipoCompacto = obtenerTipoCompacto(data.tipo);
            tiposFrecuencia[tipoCompacto] = (tiposFrecuencia[tipoCompacto] || 0) + 1;

            // 4. Registro de tiempos para ingresos
            const fechaMs = data.fecha ? data.fecha.seconds * 1000 : 0;
            if (fechaMs >= startOfToday) ingresosHoy++;
            else if (fechaMs >= startOfYesterday && fechaMs < startOfToday) ingresosAyer++;
        });

        // 📊 REDIBUJAR PANEL DE INDICADORES DIGITALES SUPERIORES

        // Indicador 1: Nuevos Ingresos Digitales con Tendencia
        let trendHTML = `<span style="font-size:10px; font-weight:700; padding:2px 6px; border-radius:10px; background:#f1f5f9; color:#475569;">= 0%</span>`;
        if (ingresosAyer > 0) {
            const perc = Math.round(((ingresosHoy - ingresosAyer) / ingresosAyer) * 100);
            if (perc > 0) trendHTML = `<span style="font-size:10px; font-weight:700; padding:2px 6px; border-radius:10px; background:#fef2f2; color:#ef4444;">▲ +${perc}%</span>`;
            else if (perc < 0) trendHTML = `<span style="font-size:10px; font-weight:700; padding:2px 6px; border-radius:10px; background:#f0fdf4; color:#16a34a;">▼ ${perc}%</span>`;
        } else if (ingresosHoy > 0) {
             trendHTML = `<span style="font-size:10px; font-weight:700; padding:2px 6px; border-radius:10px; background:#fef2f2; color:#ef4444;">▲ +100%</span>`;
        }
        const uiHoy = document.getElementById("stat-ingresos-hoy");
        if(uiHoy) uiHoy.innerHTML = `${ingresosHoy} ${trendHTML}`;

        // Indicador 2: Canal Más Frecuente
        let tipoTop = "Ninguno"; let maxTipo = 0;
        for (const [t, count] of Object.entries(tiposFrecuencia)) {
            if (count > maxTipo) { maxTipo = count; tipoTop = t; }
        }
        const elTipoTop = document.getElementById("kpi-digital-tipo-top");
        if (elTipoTop) elTipoTop.innerText = tipoTop;
        const elTipoSub = document.getElementById("kpi-digital-tipo-sub");
        if (elTipoSub) elTipoSub.innerText = totalTickets > 0 ? `${maxTipo} mensajes de este tipo` : "Sin requerimientos";

        // Indicador 3: Tasa de Clasificación de Triage
        const tasaClasif = totalTickets > 0 ? Math.round((clasificados / totalTickets) * 100) : 0;
        const elTasa = document.getElementById("kpi-digital-tasa");
        if (elTasa) elTasa.innerText = `${tasaClasif}%`;
        const elTasaSub = document.getElementById("kpi-digital-tasa-sub");
        if (elTasaSub) elTasaSub.innerText = `${clasificados} de ${totalTickets} procesados`;

        // Burbujas operativas de las pestañas inferiores
        const bNuevo = document.getElementById("badge-count-nuevo");
        const bRevision = document.getElementById("badge-count-revision"); 
        const bResponder = document.getElementById("badge-count-por-responder"); 
        
        if (bNuevo) bNuevo.innerText = countNuevo;
        if (bRevision) bRevision.innerText = countDerivados;
        if (bResponder) bResponder.innerText = countPorResponder; 

        renderizarTablaBuzonFiltrada();
        
        if (registroSeleccionadoId) {
            const actualizado = listaRegistrosBuzon.find(r => r.id === registroSeleccionadoId);
            if (actualizado) desplegarBarraLateralDetalle(actualizado);
        }
    });
}

function escucharContadorEscaneosQR() {
    if (!datosUsuarioConectado) return;
    let idMetricaTarget = datosUsuarioConectado.concejalId;
    
    const rolNormalizado = (datosUsuarioConectado.rol || "").toUpperCase();
    if (rolNormalizado.includes("ADMIN")) {
        if (TENANT_ID === "aguayo") idMetricaTarget = "ID_CONCEJAL_AGUAYO_LC";
        if (TENANT_ID === "paz") idMetricaTarget = "ID_CONCEJAL_PAZ_LC"; 
    }
    if (!idMetricaTarget) return;

    onSnapshot(doc(db, "metricas_qr", idMetricaTarget), (docSnap) => {
        if (docSnap.exists()) {
            const contenedorMetrica = document.getElementById("stat-qr-scans");
            if (contenedorMetrica) contenedorMetrica.innerText = docSnap.data().scans || 0;
        }
    });
}

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
        let matchesEstado = false;
        const eOrig = reg.estado || "Nuevo";
        const eGest = reg.estadoGestion || "";
        const filtroLow = filtroEstadoActual.toLowerCase();

        if (filtroLow.includes("nuevo")) {
            matchesEstado = (eOrig === "Nuevo");
        } else if (filtroLow.includes("revisión") || filtroLow.includes("clasificado")) {
            matchesEstado = (eOrig === "Clasificado" && (eGest === "En revisión" || eGest === ""));
        } else if (filtroLow === "derivado" || filtroLow === "derivados" || filtroLow.includes("gestión")) {
            matchesEstado = (eGest === "Derivada" || eGest === "En gestión");
        } else if (filtroLow.includes("responder")) {
            matchesEstado = (eGest === "Finalizado en espera de respuesta");
        } else if (filtroLow.includes("finalizado") || filtroLow.includes("resuelto")) {
            matchesEstado = (eOrig === "Resuelto" || eGest.includes("Respondido") || eGest === "Finalizada (Caso Resuelto)");
        } else if (filtroLow.includes("archivado")) {
            matchesEstado = (eOrig === "Archivado");
        } else if (filtroLow.includes("rechazado")) {
            matchesEstado = (eOrig === "Rechazado");
        } else {
            matchesEstado = (eOrig === filtroEstadoActual);
        }

        const tipoCompactado = obtenerTipoCompacto(reg.tipo);
        const matchesTipo = tipoFiltrado === "Todos" || tipoCompactado === tipoFiltrado;
        
        const nombreSafe = (reg.nombre || "").toLowerCase();
        const asuntoSafe = (reg.asunto || "").toLowerCase();
        const descSafe = (reg.descripcion || "").toLowerCase();

        const matchesBusqueda = !textoBuscar || 
                                nombreSafe.includes(textoBuscar) || 
                                asuntoSafe.includes(textoBuscar) || 
                                descSafe.includes(textoBuscar);
                                
        return matchesEstado && matchesTipo && matchesBusqueda;
    });

    if (registrosFiltrados.length === 0) {
        tablaCuerpo.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">No se registran elementos en esta bandeja con los filtros seleccionados.</td></tr>`;
        return;
    }

    let html = "";
    registrosFiltrados.forEach(reg => {
        const fechaFormateada = reg.fecha ? new Date(reg.fecha.seconds * 1000).toLocaleDateString('es-CL') : 'Pendiente';
        
        const tipoCompactado = obtenerTipoCompacto(reg.tipo);
        let tipoBadge = { text: "••• OTROS", bg: "#f1f5f9", color: "#475569" };

        if (tipoCompactado === "Apoyo") tipoBadge = { text: "🎁 Apoyo", bg: "#eff6ff", color: "#1d4ed8" };
        else if (tipoCompactado === "Reclamo") tipoBadge = { text: "⚠️ Reclamo", bg: "#fff7ed", color: "#c2410c" };
        else if (tipoCompactado === "Iniciativa") tipoBadge = { text: "💡 Iniciativa", bg: "#fef8e7", color: "#b45309" };
        else if (tipoCompactado === "Agradecimiento") tipoBadge = { text: "❤️ Agradecimiento", bg: "#fdf2f8", color: "#be185d" };
        else if (tipoCompactado === "Denuncia") tipoBadge = { text: "📣 Denuncia", bg: "#fef2f2", color: "#b91c1c" };

        const tieneExpediente = reg.tieneExpediente === true || reg.expedienteExiste === true;
        const estiloRut = tieneExpediente ? "color: #059669; font-weight: 700; background: #f0fdf4; padding: 4px 8px; border-radius: 6px; font-size: 12.5px;" : "color: #334155; font-weight: 500; font-size: 12.5px;";

        const badgeFilaEstado = reg.estadoGestion ? reg.estadoGestion : reg.estado;

        html += `
            <tr data-id="${reg.id}" class="buzon-row-item" style="cursor: pointer; border-bottom: 1px solid #f1f5f9;">
                <td style="font-family: monospace; font-weight: 600; padding: 14px 16px; font-size: 13px; color: #64748b;">${fechaFormateada}</td>
                <td style="padding: 14px 16px; font-size: 13px; color: #0f172a; font-weight: 600;">${reg.nombre || 'Desconocido'}</td>
                <td style="padding: 14px 16px;"><span style="${estiloRut}">${reg.rut || 'Sin RUN'}</span></td>
                <td style="padding: 14px 16px;">
                    <span style="background: ${tipoBadge.bg}; color: ${tipoBadge.color}; padding: 5px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                        ${tipoBadge.text}
                    </span>
                </td>
                <td style="padding: 14px 16px; font-size: 13px; color: #334155; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${reg.asunto || ''}">${reg.asunto || 'Sin Asunto'}</td>
                <td style="padding: 14px 16px;">
                    <span style="background: #f1f5f9; color: #475569; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase;">
                        ${badgeFilaEstado}
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
    vecinoVerificadoData = null; 

    let btnCerrarM = document.getElementById("btn-cerrar-panel-mobile");
    if (!btnCerrarM) {
        btnCerrarM = document.createElement("button");
        btnCerrarM.id = "btn-cerrar-panel-mobile";
        btnCerrarM.style.cssText = "position: absolute; top: 16px; right: 16px; background: #f1f5f9; border: none; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #475569; z-index: 10;";
        btnCerrarM.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        btnCerrarM.onmouseover = () => btnCerrarM.style.background = "#e2e8f0";
        btnCerrarM.onmouseleave = () => btnCerrarM.style.background = "#f1f5f9";
        sidebarDetalle.appendChild(btnCerrarM);
    }
    
    const checkMobileVisibility = () => {
        if(window.innerWidth > 1200) btnCerrarM.style.display = "none";
        else btnCerrarM.style.display = "flex";
    };
    checkMobileVisibility();
    window.addEventListener('resize', checkMobileVisibility);

    btnCerrarM.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        sidebarDetalle.style.display = "none";
        document.querySelectorAll(".buzon-row-item").forEach(r => r.style.background = "");
    };

    document.getElementById("detail-codigo").innerText = reg.codigo || "S/N";
    document.getElementById("detail-asunto").innerText = reg.asunto;
    document.getElementById("detail-tipo").innerText = reg.tipo;
    document.getElementById("detail-fecha").innerText = reg.fecha ? new Date(reg.fecha.seconds * 1000).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : 'Recién ingresado';
    document.getElementById("detail-nombre").innerText = reg.nombre;
    document.getElementById("detail-rut").innerText = reg.rut || "No proporcionado";
    document.getElementById("detail-telefono").innerText = reg.telefono;
    document.getElementById("detail-email").innerText = (reg.email === "undefined" || !reg.email) ? "No proporcionado" : reg.email;
    document.getElementById("detail-direccion").innerText = reg.direccion;
    document.getElementById("detail-descripcion").innerText = reg.descripcion;

    const badgeEstado = document.getElementById("detail-estado-badge");
    badgeEstado.innerText = reg.estadoGestion ? reg.estadoGestion : reg.estado;
    
    if (reg.estado === "Clasificado" || reg.estado === "En Gestión" || reg.estado === "Resuelto" || reg.estado === "Archivado") {
        badgeEstado.style.background = "#dcfce7";
        badgeEstado.style.color = "#166534";
    } else {
        badgeEstado.style.background = "#fef3c7";
        badgeEstado.style.color = "#92400e";
    }

    const clasifBox = document.getElementById("detail-clasificacion-box");
    if (reg.codigoInterno && reg.codigoInterno !== "Pendiente de Clasificación") {
        clasifBox.style.display = "block";
        document.getElementById("detail-clasif-id").innerText = reg.codigoInterno;
        document.getElementById("detail-clasif-dep").innerText = reg.departamentoAsignado || "No especificado";
        document.getElementById("detail-clasif-resp").innerText = reg.responsableNombre || "No asignado";
        document.getElementById("action-clasificar-ticket").innerHTML = "🔄 RECLASIFICAR REQUERIMIENTO";
    } else {
        clasifBox.style.display = "none";
        document.getElementById("action-clasificar-ticket").innerHTML = "📊 CLASIFICAR REQUERIMIENTO";
    }

    const statusContainer = document.getElementById("detail-vecino-status");
    if (statusContainer) {
        statusContainer.innerHTML = `<span style="font-size: 11px; color: var(--text-muted); font-style: italic; margin-left: 6px;">⏳ Verificando...</span>`;
        verificarInscripcionVecinoBaseCentral(reg.rut, statusContainer);
    }

    const gridAdjuntos = document.getElementById("detail-adjuntos-grid");
    gridAdjuntos.innerHTML = "";
    if (reg.adjuntos && reg.adjuntos.length > 0) {
        reg.adjuntos.forEach((url) => {
            gridAdjuntos.innerHTML += `<a href="${url}" target="_blank" style="width: 70px; height: 50px; border-radius: 4px; overflow:hidden; border: 1px solid var(--border-color); display: inline-block;"><img src="${url}" style="width: 100%; height: 100%; object-fit: cover;"></a>`;
        });
    } else {
        gridAdjuntos.innerHTML = `<span style="font-size: 11px; color: var(--text-muted); font-style: italic;">Sin archivos adjuntos</span>`;
    }

    let panelGestion = document.getElementById("panel-gestion-dinamico");
    if (!panelGestion) {
        panelGestion = document.createElement("div");
        panelGestion.id = "panel-gestion-dinamico";
        panelGestion.style.cssText = "margin-bottom: 20px; background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #cbd5e1;";
        
        const btnHistorial = document.getElementById("btn-ver-historial");
        if (btnHistorial) {
            btnHistorial.parentElement.insertBefore(panelGestion, btnHistorial);
        } else {
            sidebarDetalle.appendChild(panelGestion);
        }
    }

    if (reg.estado !== "Nuevo" && reg.estado !== "Archivado" && reg.estado !== "Rechazado") {
        panelGestion.style.display = "block";
        const estadoGest = reg.estadoGestion || "En revisión";
        const depto = reg.departamentoAsignado || "el departamento";
        
        let selectOptions = "";
        if (estadoGest === "En revisión") selectOptions += `<option value="En revisión" selected>En revisión</option>`; else selectOptions += `<option value="En revisión">En revisión</option>`;
        if (estadoGest === "Derivada") selectOptions += `<option value="Derivada" selected>Derivada</option>`; else selectOptions += `<option value="Derivada">Derivada</option>`;
        if (estadoGest === "En gestión") selectOptions += `<option value="En gestión" selected>En gestión</option>`; else selectOptions += `<option value="En gestión">En gestión</option>`;
        
        if (estadoGest.includes("Finalizada") || estadoGest.includes("espera")) {
            selectOptions += `<option value="Finalizada" selected>Finalizada</option>`; 
        } else {
            selectOptions += `<option value="Finalizada">Finalizada</option>`;
        }

        panelGestion.innerHTML = `
            <h4 style="font-size: 11px; text-transform: uppercase; color: #334155; letter-spacing: 0.5px; margin-bottom: 12px; text-align: center; font-weight: 800;">⚙️ Gestión del Caso</h4>
            <label style="font-size: 11px; font-weight: 700; color: #1e293b; display: block; margin-bottom: 4px;">ESTADO DE GESTIÓN</label>
            <select id="sel-estado-gestion" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; margin-bottom: 12px; background: white;">
                ${selectOptions}
            </select>
            
            <div id="info-box-gestion" style="padding: 10px; border-radius: 6px; font-size: 11.5px; margin-bottom: 12px; background: #ffffff; border: 1px dashed #94a3b8; color: #475569; line-height: 1.4;"></div>
            
            <div id="caja-respuesta-vecino" style="display: none; margin-bottom: 12px;"></div>

            <button id="btn-guardar-gestion" class="btn btn-primary" style="width: 100%; font-size: 12px; padding: 10px; justify-content: center; background: #0f172a; border: none; border-radius: 6px; color: white; font-weight: 700; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">💾 Guardar Avance de Gestión</button>
        `;

        const selEstadoG = document.getElementById("sel-estado-gestion");
        const infoBox = document.getElementById("info-box-gestion");
        const cajaResp = document.getElementById("caja-respuesta-vecino");
        const btnGuardarG = document.getElementById("btn-guardar-gestion");

        const updateInfoBox = () => {
            const v = selEstadoG.value;
            if (v === "En revisión") {
                infoBox.innerHTML = "<b>Revisión:</b> El ticket ha sido classified formalmente, pero aún no se le avisa ni deriva la gestión al departamento operativo correspondiente.";
                cajaResp.style.display = "none";
            } else if (v === "Derivada") {
                infoBox.innerHTML = `<b>Derivada:</b> El requerimiento ha sido notificado y despachado formalmente a <b>${depto}</b> para su toma de conocimiento.`;
                cajaResp.style.display = "none";
            } else if (v === "En gestión") {
                infoBox.innerHTML = `<b>En Gestión:</b> El departamento <b>${depto}</b> ha recepcionado el caso y se encuentra trabajando activamente en la resolución técnica.`;
                cajaResp.style.display = "none";
            } else if (v === "Finalizada") {
                if (!reg.detalleInternoResolucion) {
                    infoBox.innerHTML = `<b>Caso Resuelto:</b> Acción municipal ejecutada con éxito. Por favor redacta la resolución del caso.`;
                    cajaResp.style.display = "block";
                    cajaResp.innerHTML = `
                        <label style="font-size: 11px; font-weight: 700; color: #b45309; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span>DETALLE INTERNO DEL CASO (Para formular respuesta al vecino) *</span>
                        </label>
                        <textarea id="txt-detalle-interno" rows="3" placeholder="Escribe aquí los detalles de cómo se resolvió la solicitud..." style="width: 100%; padding: 10px; border: 1px solid #fde68a; border-radius: 6px; font-size: 13px; resize: vertical; outline: none; background: #fffbeb;"></textarea>
                    `;
                } else {
                    infoBox.innerHTML = `<b>Respuesta Final:</b> Redacta la respuesta oficial que será enviada y visible para el vecino en su portal.`;
                    cajaResp.style.display = "block";
                    
                    const detReadonly = reg.detalleInternoResolucion ? "readonly" : "";
                    const btnEditDet = reg.detalleInternoResolucion ? `<button type="button" onclick="document.getElementById('txt-detalle-interno').readOnly=false; document.getElementById('txt-detalle-interno').focus(); this.style.display='none';" style="background:none; border:none; color:#b45309; cursor:pointer; font-size:11px; font-weight:bold; text-decoration:underline; outline:none; padding:0;">✏️ Editar</button>` : "";
                    
                    const respReadonly = reg.respuestaVecino ? "readonly" : "";
                    const btnEditResp = reg.respuestaVecino ? `<button type="button" onclick="document.getElementById('txt-respuesta-vecino').readOnly=false; document.getElementById('txt-respuesta-vecino').focus(); this.style.display='none';" style="background:none; border:none; color:#166534; cursor:pointer; font-size:11px; font-weight:bold; text-decoration:underline; outline:none; padding:0;">✏️ Editar</button>` : "";

                    cajaResp.innerHTML = `
                        <div style="margin-bottom: 16px;">
                            <label style="font-size: 11px; font-weight: 700; color: #b45309; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span>📝 RESOLUCIÓN DEL CASO (Interno)</span>
                                ${btnEditDet}
                            </label>
                            <textarea id="txt-detalle-interno" ${detReadonly} rows="3" style="width: 100%; padding: 10px; border: 1px dashed #f59e0b; border-radius: 6px; font-size: 13px; resize: vertical; outline: none; background: #fef3c7; color: #92400e; transition: 0.2s;">${reg.detalleInternoResolucion || ''}</textarea>
                        </div>

                        <div>
                            <label style="font-size: 11px; font-weight: 700; color: #166534; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span>RESPUESTA FINAL AL VECINO *</span>
                                ${btnEditResp}
                            </label>
                            <textarea id="txt-respuesta-vecino" ${respReadonly} rows="3" placeholder="Redacta la resolución oficial que visualizará el vecino..." style="width: 100%; padding: 10px; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 13px; resize: vertical; outline: none; background: #f0fdf4; transition: 0.2s;">${reg.respuestaVecino || ''}</textarea>
                        </div>
                    `;
                }
            }
        };

        selEstadoG.addEventListener("change", updateInfoBox);
        updateInfoBox();

        btnGuardarG.onclick = async () => {
            let nuevoE = selEstadoG.value;
            const respEl = document.getElementById("txt-respuesta-vecino");
            const resp = respEl ? respEl.value.trim() : "";
            
            const detEl = document.getElementById("txt-detalle-interno");
            const detalle = detEl ? detEl.value.trim() : "";

            if (nuevoE === "Finalizada") {
                if (!reg.detalleInternoResolucion && !detalle) { 
                    alert("Debes ingresar la resolución del caso para avanzar.");
                    return; 
                }
            }

            btnGuardarG.disabled = true;
            btnGuardarG.innerText = "Guardando...";

            let rolEtiqueta = "Administrador";
            if (datosUsuarioConectado) {
                const rolM = (datosUsuarioConectado.rol || "").toUpperCase();
                if (rolM.includes("ADMIN")) rolEtiqueta = "Administrador";
                else if (rolM === "CONCEJAL") rolEtiqueta = "Concejal " + datosUsuarioConectado.nombre;
                else rolEtiqueta = datosUsuarioConectado.nombre;
            }

            const payload = { ultimaGestionPor: rolEtiqueta };

            if (nuevoE === "Derivada" && !reg.fechaDerivada) payload.fechaDerivada = serverTimestamp();
            if (nuevoE === "En gestión" && !reg.fechaEnGestion) payload.fechaEnGestion = serverTimestamp();
            
            if (nuevoE === "Finalizada") {
                if (!reg.detalleInternoResolucion && !resp) {
                    payload.estadoGestion = "Finalizado en espera de respuesta";
                    payload.detalleInternoResolucion = detalle;
                    payload.estado = "En Gestión"; 
                    if (!reg.fechaResueltoInterno) payload.fechaResueltoInterno = serverTimestamp();
                } else if (resp) {
                    payload.estadoGestion = "Finalizada (Caso Respondido)";
                    payload.detalleInternoResolucion = detalle; 
                    payload.respuestaVecino = resp;
                    payload.estado = "Resuelto"; 
                    if (!reg.fechaFinalizada) payload.fechaFinalizada = serverTimestamp();
                } else {
                    payload.estadoGestion = "Finalizado en espera de respuesta";
                    payload.detalleInternoResolucion = detalle;
                }
            } else {
                payload.estadoGestion = nuevoE;
            }

            try {
                await updateDoc(doc(db, "buzon_ciudadano", reg.id), payload);
                const alertaNativa = document.createElement("div");
                alertaNativa.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999999; padding: 16px;";
                alertaNativa.innerHTML = `
                    <div style="background: #ffffff; border-radius: 12px; padding: 24px; max-width: 400px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); font-family: system-ui, sans-serif; text-align: center; animation: modalFadeIn 0.2s ease-out;">
                        <div style="width: 48px; height: 48px; background: #eff6ff; color: #2563eb; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <h3 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a; font-weight: 800;">Gestión Guardada</h3>
                        <p style="margin: 0 0 24px 0; font-size: 14px; color: #475569;">El estado interno del caso ha avanzado correctamente.</p>
                        <button id="btn-cerrar-alerta-gestion" style="width: 100%; background: #2563eb; color: #ffffff; padding: 12px; border: none; border-radius: 6px; font-weight: 700; font-size: 14px; cursor: pointer; transition: background 0.2s;">Aceptar</button>
                    </div>
                `;
                document.body.appendChild(alertaNativa);
                alertaNativa.querySelector("#btn-cerrar-alerta-gestion").onclick = () => alertaNativa.remove();
                
                Object.assign(reg, payload);
                updateInfoBox();
                
                btnGuardarG.disabled = false; 
                btnGuardarG.innerText = "💾 Guardar Avance de Gestión";
            } catch (err) {
                console.error(err);
                btnGuardarG.disabled = false;
                btnGuardarG.innerText = "💾 Guardar Avance de Gestión";
                alert("Ocurrió un error de conexión al actualizar la gestión.");
            }
        };

    } else {
        if(panelGestion) panelGestion.style.display = "none";
    }

    const btnHistorial = document.getElementById("btn-ver-historial");
    if (btnHistorial) {
        btnHistorial.onclick = () => {
            const overlay = document.createElement("div");
            overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 999999; padding: 16px;";
            
            let events = [];

            events.push({
                color: "#2563eb", textColor: "#1e40af", title: "Ingreso Digital",
                date: reg.fecha ? new Date(reg.fecha.seconds * 1000).toLocaleString('es-CL') : 'Fecha desconocida',
                author: "Vecino",
                desc: `Ticket público <b>${reg.codigo || 'S/N'}</b> despachado exitosamente mediante la plataforma web.`
            });

            if (reg.codigoInterno && reg.codigoInterno !== "Pendiente de Clasificación") {
                events.push({
                    color: "#16a34a", textColor: "#166534", title: "Clasificación Técnica Realizada",
                    date: reg.fechaClasificacion ? new Date(reg.fechaClasificacion.seconds * 1000).toLocaleString('es-CL') : 'Reciente',
                    author: reg.clasificadoPor || "Administrador",
                    desc: `Requerimiento derivado a <b>${reg.departamentoAsignado || 'N/A'}</b> bajo el ID interno oficial <b>${reg.codigoInterno}</b>. Asignado a <b>${reg.responsableNombre || 'N/A'}</b>.`
                });
            }

            if (reg.fechaDerivada) {
                events.push({
                    color: "#eab308", textColor: "#ca8a04", title: "Ticket Derivado Formalmente",
                    date: new Date(reg.fechaDerivada.seconds * 1000).toLocaleString('es-CL'),
                    author: reg.ultimaGestionPor || "Gestor",
                    desc: `Se ha notificado al departamento encargado.`
                });
            }

            if (reg.fechaEnGestion) {
                events.push({
                    color: "#f97316", textColor: "#c2410c", title: "Trabajando en el Caso",
                    date: new Date(reg.fechaEnGestion.seconds * 1000).toLocaleString('es-CL'),
                    author: reg.ultimaGestionPor || "Gestor",
                    desc: `El departamento correspondiente ha iniciado la resolución activa.`
                });
            }
            
            if (reg.fechaResueltoInterno) {
                events.push({
                    color: "#f59e0b", textColor: "#b45309", title: "Resolución Interna",
                    date: new Date(reg.fechaResueltoInterno.seconds * 1000).toLocaleString('es-CL'),
                    author: reg.ultimaGestionPor || "Gestor",
                    desc: `Acción técnica completada. A la espera de la redacción oficial del Concejal.`
                });
            }

            if ((reg.estadoGestion && reg.estadoGestion.includes("Finalizada")) || reg.estado === "Resuelto") {
                events.push({
                    color: "#8b5cf6", textColor: "#6d28d9", title: reg.estadoGestion || "Gestión Finalizada",
                    date: reg.fechaFinalizada ? new Date(reg.fechaFinalizada.seconds * 1000).toLocaleString('es-CL') : 'Reciente',
                    author: reg.ultimaGestionPor || "Gestor",
                    desc: `Caso cerrado operativamente.<br><div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px; margin-top: 6px; font-style: italic; color: #475569;">" ${reg.respuestaVecino || 'Requerimiento procesado exitosamente.'} "</div>`
                });
            } else if (reg.estado === "Archivado") {
                events.push({
                    color: "#94a3b8", textColor: "#475569", title: "Cierre Administrativo",
                    date: "Cierre Directo",
                    author: reg.archivadoPor || "Administrador",
                    desc: `El ticket fue archivado sin requerir acción ni gestión municipal.`
                });
            }

            let timelineHTML = "";
            events.forEach((ev, index) => {
                const isLast = (index === events.length - 1);
                const borderStyle = isLast ? "border-left: 2px solid transparent;" : "border-left: 2px solid #cbd5e1;";
                const pb = isLast ? "padding-bottom: 0px;" : "padding-bottom: 16px;";
                const mb = isLast ? "margin-bottom: 0px;" : "margin-bottom: 16px;";

                timelineHTML += `
                    <div style="${borderStyle} padding-left: 16px; position: relative; ${mb} ${pb}">
                        <span style="position:absolute; left:-7px; top:2px; width:12px; height:12px; background:${ev.color}; border-radius:50%; border: 2px solid #fff;"></span>
                        <div style="font-size: 11px; color: #64748b; font-weight: 700; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="color: ${ev.textColor};">${ev.date}</span>
                            <span style="color: ${ev.color}; font-weight: 800;">- ${ev.author}</span>
                        </div>
                        <div style="font-size: 13px; color: #0f172a; margin-top: 4px; line-height: 1.4;">
                            <b>${ev.title}:</b> ${ev.desc}
                        </div>
                    </div>
                `;
            });

            overlay.innerHTML = `
                <div style="background: #ffffff; border-radius: 12px; padding: 24px; max-width: 480px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); font-family: system-ui, sans-serif; animation: modalFadeIn 0.2s ease-out;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <div>
                            <h3 style="margin: 0; font-size: 18px; color: #0f172a; font-weight: 800;">Trazabilidad del Caso</h3>
                            <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b;">Secuencia de eventos y progreso de gestión</p>
                        </div>
                        <button class="btn-close-hist" style="background: #f1f5f9; border: none; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; cursor: pointer; color: #64748b; transition: all 0.2s;">&times;</button>
                    </div>
                    <div style="margin-bottom: 24px; max-height: 50vh; overflow-y: auto; padding-top: 8px;">
                        ${timelineHTML}
                    </div>
                    <button class="btn-close-hist-ok" style="width: 100%; background: #0f172a; color: #ffffff; padding: 12px; border: none; border-radius: 6px; font-weight: 700; font-size: 14px; cursor: pointer; transition: background 0.2s;">Entendido</button>
                </div>
                <style>
                    @keyframes modalFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                    .btn-close-hist:hover { background: #e2e8f0 !important; color: #0f172a !important; }
                    .btn-close-hist-ok:hover { background: #334155 !important; }
                </style>
            `;
            document.body.appendChild(overlay);
            const cerrar = () => overlay.remove();
            overlay.querySelectorAll(".btn-close-hist, .btn-close-hist-ok").forEach(b => b.onclick = cerrar);
        };
    }
}

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

        const q = query(collection(db, "vecinos"), where("tenantId", "==", TENANT_ID), where("rut", "in", rutsMatrizBusqueda));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const vecinoDoc = snap.docs[0];
            const vData = vecinoDoc.data();
            vecinoIdActualDetectado = vecinoDoc.id; 
            vecinoVerificadoData = { id: vecinoDoc.id, nombreReal: vData.nombreCompleto, shortId: vecinoDoc.id.substring(0, 6).toUpperCase() };
            element.innerHTML = `<a href="vecinos.html?rut=${clean}" class="badge" style="background: #e6f4ea; color: #137333; margin-left: 6px; font-size: 10px; font-weight: 800; border: 1px solid #10b981; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="Abrir expediente del vecino">✓ Vecino Registrado 📂</a>`;
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

async function actualizarEstadoTicketSeleccionado(nuevoEstado) {
    if (!registroSeleccionadoId) return;
    try {
        let rolEtiqueta = "Administrador";
        if (datosUsuarioConectado) {
            const rolM = (datosUsuarioConectado.rol || "").toUpperCase();
            if (rolM.includes("ADMIN")) rolEtiqueta = "Administrador";
            else if (rolM === "CONCEJAL") rolEtiqueta = "Concejal " + datosUsuarioConectado.nombre;
            else rolEtiqueta = datosUsuarioConectado.nombre;
        }

        const docRef = doc(db, "buzon_ciudadano", registroSeleccionadoId);
        await updateDoc(docRef, { estado: nuevoEstado, archivadoPor: rolEtiqueta });
        
        const alertaNativa = document.createElement("div");
        alertaNativa.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999999; padding: 16px;";
        alertaNativa.innerHTML = `
            <div style="background: #ffffff; border-radius: 12px; padding: 24px; max-width: 400px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); font-family: system-ui, sans-serif; text-align: center; animation: modalFadeIn 0.2s ease-out;">
                <div style="width: 48px; height: 48px; background: #eff6ff; color: #2563eb; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <h3 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a; font-weight: 800;">Ticket Actualizado</h3>
                <p style="margin: 0 0 24px 0; font-size: 14px; color: #475569;">El caso ha sido movido exitosamente al estado: <b>${nuevoEstado}</b>.</p>
                <button id="btn-cerrar-alerta-nativa" style="width: 100%; background: #2563eb; color: #ffffff; padding: 12px; border: none; border-radius: 6px; font-weight: 700; font-size: 14px; cursor: pointer; transition: background 0.2s;">Aceptar</button>
            </div>
        `;
        document.body.appendChild(alertaNativa);
        alertaNativa.querySelector("#btn-cerrar-alerta-nativa").onclick = () => alertaNativa.remove();

        sidebarDetalle.style.display = "none";
        registroSeleccionadoId = null;
    } catch (err) { console.error(err); }
}

const MAPA_CLASIFICACION_SIGEV = {
    "AYUDA SOCIAL": { depCod: "DID", depName: "DIDESO", catCod: "SOC", subs: {"Giftcard":"GIF", "Apoyo económico":"ECO", "Medicamentos":"MED", "Pago cuentas básicas":"CUE", "Subsidios económicos":"SUB"} },
    "ALUMBRADO": { depCod: "OBR", depName: "OBRAS", catCod: "ALU", subs: {"Robo de cable":"ROB", "Solicitud punto lumínico":"PUN", "Solicitud de despeje cono lumínico":"CON", "Mantención luminarias":"MAN", "Reparación juegos":"JUE"} },
    "ASEO Y BASURA": { depCod: "DMA", depName: "DIMAO", catCod: "ASE", subs: {"Solicitud fumigación":"FUM", "Basura acumulada":"BAS", "Microbasural":"MIC", "Retiro escombros":"ESC"} },
    "ÁREAS VERDES": { depCod: "DMA", depName: "DIMAO", catCod: "VER", subs: {"Poda árboles":"POD", "Árbol peligroso":"PEL", "Mantención plaza":"PLA"} },
    "SEGURIDAD": { depCod: "SEG", depName: "SEGURIDAD MUNICIPAL", catCod: "SEG", subs: {"Ruidos molestos":"RUI", "Consumo drogas":"DRO", "Peleas":"PEL", "Vehículos abandonados":"VEH", "Patrullaje":"PAT", "Cámaras seguridad":"CAM", "Alarmas comunitarias":"ALA"} },
    "MASCOTAS": { depCod: "DMA", depName: "DIMAO", catCod: "MAS", subs: {"Esterilización":"EST", "Vacunación":"VAC", "Operativo veterinario":"VET"} },
    "ESTRUCTURA VIAL": { depCod: "TRA", depName: "TRÁNSITO", catCod: "VIA", subs: {"Señalética y demarcación vial":"SEN", "Alumbrado paradero":"PAR", "Baches":"BAC", "Veredas rotas":"VER", "Semáforos":"SEM", "Accesibilidad":"ACC"} },
    "TRÁMITES MUNICIPALES": { depCod: "CON", depName: "OFICINA DEL CONCEJAL", catCod: "TRA", subs: {"Orientación municipal":"ORI", "Certificados":"CER", "Permisos":"PER", "Patentes":"PAT", "Derivaciones":"DER"} },
    "OPERATIVO TERRITORIAL": { depCod: "OPE", depName: "OPERATIVO TERRITORIAL", catCod: "OPT", subs: {"Oftalmológico":"OFT", "Salud":"SAL", "Podología":"POD"} }
};

async function abrirModalClasificacion() {
    if (!registroSeleccionadoId) return;
    const reg = listaRegistrosBuzon.find(r => r.id === registroSeleccionadoId);
    if (!reg) return;

    const modalOverlay = document.createElement("div");
    modalOverlay.className = "profile-modal-overlay";
    modalOverlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 999999;";

    let opcionesResponsables = '<option value="">Seleccione un Responsable...</option>';
    try {
        const q = query(collection(db, "usuarios"), where("tenantId", "==", TENANT_ID));
        const snap = await getDocs(q);
        snap.forEach(doc => {
            const u = doc.data();
            const rolNormalizado = (u.rol || "").toLowerCase();
            if (rolNormalizado !== "pendiente" && rolNormalizado !== "super_admin" && rolNormalizado !== "superadmin") {
                const isSelected = (reg.responsableId === doc.id) ? "selected" : "";
                opcionesResponsables += `<option value="${doc.id}" data-nombre="${u.nombre}" ${isSelected}>${u.nombre}</option>`;
            }
        });
    } catch(e) { console.error("Error cargando responsables", e); }

    let opcionesCat = '<option value="">Seleccione Categoría...</option>';
    for (const cat in MAPA_CLASIFICACION_SIGEV) {
        const isCatSelected = (reg.categoriaOficial === cat) ? "selected" : "";
        opcionesCat += `<option value="${cat}" ${isCatSelected}>${cat}</option>`;
    }

    modalOverlay.innerHTML = `
        <div class="profile-modal-card" style="background: #ffffff; max-width: 540px; width: 92%; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden; font-family: system-ui, sans-serif;">
            <div class="profile-modal-header" style="background-color: #0b438c; padding: 18px 24px; position: relative;">
                <div class="profile-header-info">
                    <h3 style="font-size: 16px; color: #fff; font-weight: 700; margin: 0;">Clasificar Requerimiento</h3>
                    <p style="color: rgba(255,255,255,0.8); font-size: 11.5px; margin: 4px 0 0 0;">Ticket Público: <b>${reg.codigo || 'S/N'}</b></p>
                </div>
                <button class="btn-close-clasif" style="color: #fff; font-size: 22px; position:absolute; top: 12px; right: 20px; background: none; border: none; cursor: pointer;">&times;</button>
            </div>
            
            <div class="profile-modal-body" style="padding: 24px; background: #fff;">
                <div style="display: flex; flex-direction: column; gap: 16px;">
                    <div>
                        <label style="font-size: 11px; font-weight: 700; color: #1e293b; display: block; margin-bottom: 4px; text-transform: uppercase;">Categoría de Clasificación *</label>
                        <select id="clasif-cat" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; outline: none; background: #ffffff;" required>${opcionesCat}</select>
                    </div>
                    <div>
                        <label style="font-size: 11px; font-weight: 700; color: #1e293b; display: block; margin-bottom: 4px; text-transform: uppercase;">Subcategoría Específica *</label>
                        <select id="clasif-sub" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; outline: none; background: #ffffff;" required ${reg.categoriaOficial ? '' : 'disabled'}>
                            <option value="">Seleccione Subcategoría...</option>
                        </select>
                    </div>
                    <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px dashed #cbd5e1;">
                        <label style="font-size: 11px; font-weight: 700; color: #64748b; display: block; margin-bottom: 4px; text-transform: uppercase;">Departamento Encargado</label>
                        <input type="text" id="clasif-dep-nombre" value="${reg.departamentoAsignado || 'Esperando clasificación...'}" readonly style="width: 100%; padding: 8px 10px; border: none; background: transparent; font-size: 13.5px; font-weight: 700; color: #0f172a; outline: none;">
                        <input type="hidden" id="clasif-dep-cod" value="">
                        <input type="hidden" id="clasif-cat-cod" value="">
                        <input type="hidden" id="clasif-sub-cod" value="">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="font-size: 11px; font-weight: 700; color: #1e293b; display: block; margin-bottom: 4px; text-transform: uppercase;">Responsable de Seguimiento *</label>
                            <select id="clasif-responsable" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; outline: none; background: #ffffff;" required>${opcionesResponsables}</select>
                        </div>
                        <div>
                            <label style="font-size: 11px; font-weight: 700; color: #1e293b; display: block; margin-bottom: 4px; text-transform: uppercase;">Prioridad Operativa *</label>
                            <select id="clasif-prioridad" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; outline: none; background: #ffffff;" required>
                                <option value="Alta" ${reg.prioridad === 'Alta' ? 'selected' : ''}>🔴 Alta</option>
                                <option value="Media" ${(!reg.prioridad || reg.prioridad === 'Media') ? 'selected' : ''}>🟡 Media</option>
                                <option value="Baja" ${reg.prioridad === 'Baja' ? 'selected' : ''}>🟢 Baja</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label style="font-size: 11px; font-weight: 700; color: #1e293b; display: block; margin-bottom: 4px; text-transform: uppercase;">Notas Internas / Resoluciones Operativas</label>
                        <textarea id="clasif-notas" rows="3" placeholder="Ingresa instrucciones o resoluciones para el equipo..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12.5px; resize: vertical; outline: none;">${reg.notasInternas || ''}</textarea>
                    </div>
                </div>
            </div>
            <div style="padding: 16px 24px; background: #f1f5f9; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" class="btn-cancel-clasif" style="font-size: 12px; padding: 10px 16px; background: white; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; color: #475569; font-weight: 600;">Cancelar</button>
                <button type="button" id="btn-submit-clasif" style="background-color: #2563eb; font-size: 12px; padding: 10px 20px; color: white; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">🚀 ${reg.codigoInterno ? 'Guardar Re-Clasificación' : 'Clasificar e Iniciar Gestión'}</button>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);

    const selCat = modalOverlay.querySelector("#clasif-cat");
    const selSub = modalOverlay.querySelector("#clasif-sub");
    const outDepNombre = modalOverlay.querySelector("#clasif-dep-nombre");
    const hidDepCod = modalOverlay.querySelector("#clasif-dep-cod");
    const hidCatCod = modalOverlay.querySelector("#clasif-cat-cod");
    const hidSubCod = modalOverlay.querySelector("#clasif-sub-cod");

    function renderizarSubcategorias(catAForzar, subAForzar) {
        selSub.innerHTML = '<option value="">Seleccione Subcategoría...</option>';
        if (catAForzar && MAPA_CLASIFICACION_SIGEV[catAForzar]) {
            const dataCat = MAPA_CLASIFICACION_SIGEV[catAForzar];
            outDepNombre.value = dataCat.depName; 
            hidDepCod.value = dataCat.depCod;
            hidCatCod.value = dataCat.catCod;
            for (const sub in dataCat.subs) {
                const isSelected = (subAForzar === sub) ? "selected" : "";
                selSub.innerHTML += `<option value="${sub}" data-subcod="${dataCat.subs[sub]}" ${isSelected}>${sub}</option>`;
                if(isSelected) hidSubCod.value = dataCat.subs[sub];
            }
            selSub.disabled = false;
        } else {
            selSub.disabled = true;
            outDepNombre.value = "Esperando clasificación...";
            hidDepCod.value = ""; hidCatCod.value = ""; hidSubCod.value = "";
        }
    }

    if (reg.categoriaOficial) renderizarSubcategorias(reg.categoriaOficial, reg.subcategoriaOficial);

    selCat.addEventListener("change", (e) => renderizarSubcategorias(e.target.value, null));

    selSub.addEventListener("change", (e) => {
        const selectedOpt = e.target.options[e.target.selectedIndex];
        hidSubCod.value = (selectedOpt && selectedOpt.value !== "") ? selectedOpt.getAttribute("data-subcod") : "";
    });

    const closeModals = () => modalOverlay.remove();
    modalOverlay.querySelector(".btn-close-clasif").onclick = closeModals;
    modalOverlay.querySelector(".btn-cancel-clasif").onclick = closeModals;

    const btnSubmit = modalOverlay.querySelector("#btn-submit-clasif");
    btnSubmit.onclick = async () => {
        const categoria = selCat.value;
        const subcategoria = selSub.value;
        const responsableId = modalOverlay.querySelector("#clasif-responsable").value;
        const prioridad = modalOverlay.querySelector("#clasif-prioridad").value;
        const notasInternas = modalOverlay.querySelector("#clasif-notas").value.trim();
        
        if (!categoria || !subcategoria || !responsableId) {
            alert("Por favor, completa la Categoría, Subcategoría y selecciona un Responsable operativo.");
            return;
        }

        const responsableNombre = modalOverlay.querySelector("#clasif-responsable").options[modalOverlay.querySelector("#clasif-responsable").selectedIndex].getAttribute("data-nombre");

        let baseCodigo = reg.codigo;
        if (!baseCodigo) {
            const d = reg.fecha ? new Date(reg.fecha.seconds * 1000) : new Date();
            const fStr = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
            baseCodigo = `SIG-${fStr}-${reg.id.substring(0,4).toUpperCase()}`;
        }
        baseCodigo = baseCodigo.replace("#", "SIG-");
        const nuevoCodigoInterno = `${baseCodigo}-${hidDepCod.value}-${hidCatCod.value}-${hidSubCod.value}`;

        btnSubmit.disabled = true;
        btnSubmit.innerText = "Sincronizando Nube...";

        try {
            let rolEtiqueta = "Administrador";
            if (datosUsuarioConectado) {
                const rolM = (datosUsuarioConectado.rol || "").toUpperCase();
                if (rolM.includes("ADMIN")) rolEtiqueta = "Administrador";
                else if (rolM === "CONCEJAL") rolEtiqueta = "Concejal " + datosUsuarioConectado.nombre;
                else rolEtiqueta = datosUsuarioConectado.nombre;
            }

            const payloadActualizado = {
                tenantId: TENANT_ID,
                codigoInterno: nuevoCodigoInterno,
                codigoPublico: baseCodigo,
                vecinoNombre: vecinoVerificadoData ? vecinoVerificadoData.nombreReal : reg.nombre,
                vecinoRut: reg.rut || "No proporcionado",
                vecinoDireccion: reg.direccion,
                asunto: reg.asunto,
                descripcion: reg.descripcion,
                categoria: categoria,
                subcategoria: subcategoria,
                oficinaDerivada: outDepNombre.value,
                responsableId: responsableId,
                responsableNombre: responsableNombre,
                estado: "Abierta",
                prioridad: prioridad,
                notasInternas: notasInternas,
                origen: "Buzón Ciudadano",
                adjuntos: reg.adjuntos || [],
                idVecino: vecinoIdActualDetectado || "No enlazado (Nuevo)"
            };

            if (!reg.codigoInterno || reg.codigoInterno === "Pendiente de Clasificación") {
                payloadActualizado.fechaCreacion = serverTimestamp();
                await addDoc(collection(db, "solicitudes"), payloadActualizado);
            }

            await updateDoc(doc(db, "buzon_ciudadano", registroSeleccionadoId), {
                estado: "Clasificado",
                estadoGestion: "En revisión",
                codigo: baseCodigo,
                codigoInterno: nuevoCodigoInterno,
                categoriaOficial: categoria,
                subcategoriaOficial: subcategoria,
                departamentoAsignado: outDepNombre.value,
                responsableId: responsableId,
                responsableNombre: responsableNombre,
                prioridad: prioridad,
                notasInternas: notasInternas,
                fechaClasificacion: serverTimestamp(),
                clasificadoPor: rolEtiqueta 
            });

            modalOverlay.remove();
            
            const alertaNativa = document.createElement("div");
            alertaNativa.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999999; padding: 16px;";
            alertaNativa.innerHTML = `
                <div style="background: #ffffff; border-radius: 12px; padding: 24px; max-width: 400px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); font-family: system-ui, sans-serif; text-align: center; animation: modalFadeIn 0.2s ease-out;">
                    <div style="width: 48px; height: 48px; background: #f0fdf4; color: #16a34a; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <h3 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a; font-weight: 800;">¡Ticket Clasificado!</h3>
                    <p style="margin: 0 0 6px 0; font-size: 14px; color: #475569;">Actualizada la clasificación ID: <br><strong style="color: #0f172a;">${nuevoCodigoInterno}</strong></p>
                    <p style="margin: 0 0 24px 0; font-size: 14px; color: #475569;">Responsable de seguimiento: <br><strong style="color: #0f172a;">${responsableNombre}</strong></p>
                    <button id="btn-cerrar-alerta-nativa" style="width: 100%; background: #2563eb; color: #ffffff; padding: 12px; border: none; border-radius: 6px; font-weight: 700; font-size: 14px; cursor: pointer; transition: background 0.2s;">Aceptar</button>
                </div>
            `;
            document.body.appendChild(alertaNativa);
            alertaNativa.querySelector("#btn-cerrar-alerta-nativa").onclick = () => alertaNativa.remove();
            
            sidebarDetalle.style.display = "none";
            registroSeleccionadoId = null;

        } catch (error) {
            console.error("Error crítico al clasificar:", error);
            btnSubmit.disabled = false;
            btnSubmit.innerText = "🚀 Clasificar e Iniciar Gestión";
            
            const errNativa = document.createElement("div");
            errNativa.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999999; padding: 16px;";
            errNativa.innerHTML = `
                <div style="background: #ffffff; border-radius: 12px; padding: 24px; max-width: 400px; width: 100%; text-align: center; font-family: system-ui, sans-serif;">
                    <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #ef4444; font-weight: 800;">Error de Conexión</h3>
                    <p style="margin: 0 0 24px 0; font-size: 14px; color: #475569;">Ocurrió un problema de red al procesar la clasificación. Intenta nuevamente.</p>
                    <button id="btn-cerrar-err" style="width: 100%; background: #ef4444; color: #ffffff; padding: 10px; border: none; border-radius: 6px; font-weight: 700; cursor: pointer;">Cerrar</button>
                </div>
            `;
            document.body.appendChild(errNativa);
            errNativa.querySelector("#btn-cerrar-err").onclick = () => errNativa.remove();
        }
    };
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
    } catch (err) { console.error(err); }
}