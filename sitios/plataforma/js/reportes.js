// ==============================================================================
// SIGEV-AGUAYO - MOTOR INTEGRADO DE INTELIGENCIA TERRITORIAL (SaaS MULTI-TENANT)
// ==============================================================================
import { auth, db } from "./app.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { actualizarPerfilLayout } from "./layout.js";

const subdominioDetectado = window.location.hostname.split('.')[0];
const CURRENT_TENANT_ID = sessionStorage.getItem('SIGEV_ACTIVE_TENANT') || ((subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado);

// Memoria central analítica
let universoSolicitudesMemory = [];
let universoVecinosMemory = [];
let pestañaActivaReportes = "ejecutivo";

auth.onAuthStateChanged(async (user) => {
    if (user) {
        actualizarPerfilLayout(user);
        configurarFechasPorDefecto();
        await descargarYCompilarUniversoSaaS();
        vincularEscuchadoresReportes();
    } else {
        window.location.href = "index.html";
    }
});

function configurarFechasPorDefecto() {
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    document.getElementById("repo-filter-desde").value = primerDia.toISOString().split('T')[0];
    document.getElementById("repo-filter-hasta").value = hoy.toISOString().split('T')[0];
}

async function descargarYCompilarUniversoSaaS() {
    try {
        const [snapSols, snapBuzon, snapVecinos] = await Promise.all([
            getDocs(query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID))),
            getDocs(query(collection(db, "buzon_ciudadano"), where("tenantId", "==", CURRENT_TENANT_ID))),
            getDocs(query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID)))
        ]);

        universoSolicitudesMemory = [];
        universoVecinosMemory = [];

        // 1. Compilar base de vecinos registrados
        snapVecinos.forEach(doc => {
            const d = doc.data();
            universoVecinosMemory.push({
                id: doc.id,
                fecha: d.fechaRegistro ? d.fechaRegistro.toDate() : new Date(),
                sector: d.sectorTerritorial || "Sin Información",
                activo: d.estadoExpediente === "Activo",
                ...d // <-- Agregamos toda la metadata para la exportación a Excel
            });
        });

        // 2. Compilar solicitudes presenciales
        snapSols.forEach(doc => {
            const d = doc.data();
            universoSolicitudesMemory.push({
                id: doc.id,
                origen: "Presencial",
                codigo: d.codigo || "SIG-PRE",
                fecha: d.fechaCreacion ? d.fechaCreacion.toDate() : new Date(),
                categoria: (d.motivo || d.categoria || "TRÁMITES MUNICIPALES").toUpperCase(),
                sector: d.sectorTerritorial || "Sin Información",
                depto: d.oficinaDerivada || "Equipo Territorial",
                estado: d.estadoGestion || d.estado || "En revisión",
                prioridad: d.prioridad || "Media",
                usuario: d.registradaPorNombre || "Funcionario"
            });
        });

        // 3. Compilar solicitudes digitales (Buzón)
        snapBuzon.forEach(doc => {
            const d = doc.data();
            let catFix = "TRÁMITES MUNICIPALES";
            if ((d.tipo || "").includes("Apoyo")) catFix = "AYUDA SOCIAL";
            else if ((d.tipo || "").includes("Reclamo")) catFix = "ASEO Y BASURA";
            else if ((d.tipo || "").includes("Denuncia")) catFix = "SEGURIDAD";

            universoSolicitudesMemory.push({
                id: doc.id,
                origen: "Digital",
                codigo: d.codigo || "SIG-BUZ",
                fecha: d.fecha ? d.fecha.toDate() : new Date(),
                categoria: (d.categoriaOficial || catFix).toUpperCase(),
                sector: d.sectorTerritorial || "Vía Portal Web",
                depto: d.departamentoAsignado || "Secretaría",
                estado: d.estadoGestion || d.estado || "Nuevo",
                prioridad: d.prioridad || "Media",
                usuario: "Vecino Digital"
            });
        });

        procesarCalculosEstrategicos();

    } catch (e) {
        console.error("Fallo de infraestructura analítica NoSQL:", e);
    }
}

function procesarCalculosEstrategicos() {
    const fDesdeStr = document.getElementById("repo-filter-desde").value;
    const fHastaStr = document.getElementById("repo-filter-hasta").value;

    const inicioDia = new Date(fDesdeStr + "T00:00:00");
    const finDia = new Date(fHastaStr + "T23:59:59");

    const filtradasSols = universoSolicitudesMemory.filter(s => s.fecha >= inicioDia && s.fecha <= finDia);
    const filtradosVecinos = universoVecinosMemory.filter(v => v.fecha >= inicioDia && v.fecha <= finDia);

    actualizarKPIsGlobales(filtradasSols, filtradosVecinos);
    
    if (pestañaActivaReportes === "ejecutivo") {
        renderizarModuloEjecutivo(filtradasSols, filtradosVecinos);
    } else if (pestañaActivaReportes === "territorial") {
        renderizarModuloTerritorial(filtradasSols, filtradosVecinos);
    } else if (pestañaActivaReportes === "rendimiento") {
        renderizarModuloRendimiento(filtradasSols);
    }
}

function actualizarKPIsGlobales(sols, vecinos) {
    const cerradas = sols.filter(s => ["completada", "cerrada", "finalizada", "resuelta"].includes(s.estado.toLowerCase())).length;
    const abiertas = sols.length - cerradas;
    const tasa = sols.length > 0 ? Math.round((cerradas / sols.length) * 100) : 0;

    const prevSols = universoSolicitudesMemory.filter(s => s.fecha < new Date(document.getElementById("repo-filter-desde").value)).length;
    const prevVec = universoVecinosMemory.filter(v => v.fecha < new Date(document.getElementById("repo-filter-desde").value)).length;

    const diffSols = sols.length - prevSols;
    const diffVec = vecinos.length - prevVec;

    if(document.getElementById("rkpi-total-casos")) {
        document.getElementById("rkpi-total-casos").innerText = sols.length;
        document.getElementById("rkpi-total-casos-tendencia").innerHTML = diffSols >= 0 ? `↑ ${diffSols} vs mes ant.` : `↓ ${Math.abs(diffSols)} vs mes ant.`;
        document.getElementById("rkpi-total-casos-tendencia").style.color = diffSols >= 0 ? "#10b981" : "#ef4444";
    }

    if(document.getElementById("rkpi-resolucion")) {
        document.getElementById("rkpi-resolucion").innerText = `${tasa}%`;
        const diffTasa = tasa - 50; 
        document.getElementById("rkpi-resolucion-tendencia").innerHTML = diffTasa >= 0 ? `↑ Efectividad alta` : `↓ Requiere atención`;
        document.getElementById("rkpi-resolucion-tendencia").style.color = diffTasa >= 0 ? "#10b981" : "#d97706";
    }

    if(document.getElementById("rkpi-casos-abiertos")) {
        document.getElementById("rkpi-casos-abiertos").innerText = abiertas;
    }

    if(document.getElementById("rkpi-nuevos-vecinos")) {
        document.getElementById("rkpi-nuevos-vecinos").innerText = vecinos.length;
        document.getElementById("rkpi-nuevos-vecinos-tendencia").innerHTML = diffVec >= 0 ? `↑ ${diffVec} vs ant.` : `↓ ${Math.abs(diffVec)} vs ant.`;
        document.getElementById("rkpi-nuevos-vecinos-tendencia").style.color = diffVec >= 0 ? "#10b981" : "#ef4444";
    }
}

// ==============================================================================
// MÓDULO 1: RESUMEN EJECUTIVO
// ==============================================================================
function renderizarModuloEjecutivo(sols, vecinos) {
    const content = document.getElementById("reporte-content-area");
    if (!content) return;

    // Conteo por Categoría Oficial
    const conteoCat = {};
    sols.forEach(s => { conteoCat[s.categoria] = (conteoCat[s.categoria] || 0) + 1; });
    const topCats = Object.entries(conteoCat).sort((a,b) => b[1] - a[1]).slice(0, 5);

    let htmlTopCats = topCats.length === 0 ? `<p style="font-size:12px; color:var(--text-light);">No hay datos.</p>` : "";
    topCats.forEach((c, idx) => {
        const perc = Math.round((c[1] / sols.length) * 100);
        const colores = ["#2563eb", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"];
        htmlTopCats += `
            <div style="margin-bottom: 12px;">
                <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:700; margin-bottom:4px; color:var(--text-dark);">
                    <span>${c[0]}</span><span>${c[1]} <small style="color:var(--text-light)">(${perc}%)</small></span>
                </div>
                <div style="width:100%; height:6px; background:#f1f5f9; border-radius:3px;">
                    <div style="width:${perc}%; height:100%; background:${colores[idx]}; border-radius:3px;"></div>
                </div>
            </div>`;
    });

    // Origen de Solicitudes
    let pPresencial = 0; let pDigital = 0;
    if (sols.length > 0) {
        const pres = sols.filter(s => s.origen === "Presencial").length;
        pPresencial = Math.round((pres / sols.length) * 100);
        pDigital = 100 - pPresencial;
    }

    content.innerHTML = `
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
            <div class="section-card">
                <h4 style="font-size: 13px; font-weight: 800; color: var(--text-dark); margin: 0 0 16px 0; text-transform: uppercase;">Top 5: Demandas Ciudadanas</h4>
                ${htmlTopCats}
            </div>
            
            <div class="section-card">
                <h4 style="font-size: 13px; font-weight: 800; color: var(--text-dark); margin: 0 0 16px 0; text-transform: uppercase;">Canal de Ingreso</h4>
                <div style="display:flex; align-items:center; justify-content:center; gap:20px; height: 120px;">
                    <div style="width:100px; height:100px; border-radius:50%; background: conic-gradient(#2563eb 0% ${pPresencial}%, #8b5cf6 ${pPresencial}% 100%);"></div>
                    <div>
                        <div style="font-size:12px; font-weight:700; margin-bottom:8px;"><span style="color:#2563eb;">●</span> Presencial: ${pPresencial}%</div>
                        <div style="font-size:12px; font-weight:700;"><span style="color:#8b5cf6;">●</span> Digital (Buzón): ${pDigital}%</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ==============================================================================
// MÓDULO 2: DESPLIEGUE TERRITORIAL
// ==============================================================================
function renderizarModuloTerritorial(sols, vecinos) {
    const content = document.getElementById("reporte-content-area");
    if (!content) return;

    // Calcular distribución por sector
    const conteoSectores = { "S1":0, "S2":0, "S3":0, "S4":0, "S5":0, "S6":0, "Sin Info":0 };
    sols.forEach(s => {
        if (s.sector.includes("1")) conteoSectores["S1"]++;
        else if (s.sector.includes("2")) conteoSectores["S2"]++;
        else if (s.sector.includes("3")) conteoSectores["S3"]++;
        else if (s.sector.includes("4")) conteoSectores["S4"]++;
        else if (s.sector.includes("5")) conteoSectores["S5"]++;
        else if (s.sector.includes("6")) conteoSectores["S6"]++;
        else conteoSectores["Sin Info"]++;
    });

    const maxVal = Math.max(...Object.values(conteoSectores), 1);
    const coloresBarras = ["#2563eb", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4", "#ef4444", "#cbd5e1"];
    
    let htmlBarras = `<div style="display:flex; align-items:flex-end; justify-content:space-between; height:160px; padding-top:20px; gap:8px;">`;
    Object.keys(conteoSectores).forEach((key, idx) => {
        const val = conteoSectores[key];
        const h = Math.max((val / maxVal) * 100, 5); // Mínimo 5% visual
        htmlBarras += `
            <div style="display:flex; flex-direction:column; align-items:center; flex:1;">
                <span style="font-size:11px; font-weight:800; color:var(--text-dark); margin-bottom:6px;">${val}</span>
                <div style="width:100%; max-width:40px; height:${h}%; background:${coloresBarras[idx]}; border-radius:4px 4px 0 0;"></div>
                <span style="font-size:10px; font-weight:700; color:var(--text-light); margin-top:8px;">${key}</span>
            </div>
        `;
    });
    htmlBarras += `</div>`;

    content.innerHTML = `
        <div class="section-card">
            <h4 style="font-size: 13px; font-weight: 800; color: var(--text-dark); margin: 0 0 16px 0; text-transform: uppercase;">Incidencias por Sector Territorial</h4>
            ${htmlBarras}
            <div style="margin-top: 20px; padding: 12px; background: #f8fafc; border-radius: 6px; font-size: 12px; color: var(--text-light);">
                <strong>Nota Analítica:</strong> El gráfico representa la distribución geográfica de los tickets en las unidades vecinales del período seleccionado.
            </div>
        </div>
    `;
}

// ==============================================================================
// MÓDULO 3: RENDIMIENTO Y DERIVACIONES
// ==============================================================================
function renderizarModuloRendimiento(sols) {
    const content = document.getElementById("reporte-content-area");
    if (!content) return;

    const deptoCount = {};
    sols.forEach(s => { deptoCount[s.depto] = (deptoCount[s.depto] || 0) + 1; });
    const topDeptos = Object.entries(deptoCount).sort((a,b) => b[1] - a[1]);

    let htmlDeptos = "";
    topDeptos.forEach(d => {
        htmlDeptos += `
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px; font-weight: 600; color: #0f172a; font-size: 12.5px;">${d[0]}</td>
            <td style="padding: 10px; text-align: right; font-weight: 800; color: #2563eb; font-size: 12.5px;">${d[1]}</td>
        </tr>`;
    });

    content.innerHTML = `
        <div class="section-card">
            <h4 style="font-size: 13px; font-weight: 800; color: var(--text-dark); margin: 0 0 16px 0; text-transform: uppercase;">Top Oficinas / Derivaciones</h4>
            <div style="max-height: 250px; overflow-y: auto; padding-right: 10px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: #fff; z-index: 1;">
                        <tr style="border-bottom: 2px solid #e2e8f0;">
                            <th style="text-align: left; padding: 8px 10px; font-size: 11px; color: var(--text-light); text-transform: uppercase;">Departamento</th>
                            <th style="text-align: right; padding: 8px 10px; font-size: 11px; color: var(--text-light); text-transform: uppercase;">Tickets Asignados</th>
                        </tr>
                    </thead>
                    <tbody>${htmlDeptos || `<tr><td colspan="2" style="text-align:center; padding: 20px; color: #94a3b8; font-size: 12px;">Sin datos.</td></tr>`}</tbody>
                </table>
            </div>
        </div>
    `;
}

function mostrarAlertaPersonalizada(mensaje, tipo = "success") {
    const overlay = document.createElement("div"); overlay.className = "custom-alert-overlay";
    let iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    
    if (tipo === "error") {
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    }

    overlay.innerHTML = `
        <div class="custom-alert-card">
            <div class="custom-alert-icon" style="background-color: ${tipo === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; color: ${tipo === 'success' ? '#10b981' : '#ef4444'};">${iconSvg}</div>
            <div class="custom-alert-title">¡Información del Sistema!</div>
            <div class="custom-alert-message">${mensaje}</div>
            <button class="btn-alert-confirm" style="background-color: #0b438c; width: 100%; border-radius: 8px;">Aceptar</button>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".btn-alert-confirm").onclick = () => overlay.remove();
}

function vincularEscuchadoresReportes() {
    document.getElementById("repo-filter-desde")?.addEventListener("change", procesarCalculosEstrategicos);
    document.getElementById("repo-filter-hasta")?.addEventListener("change", procesarCalculosEstrategicos);

    document.getElementById("btn-repo-reset")?.addEventListener("click", () => { configurarFechasPorDefecto(); procesarCalculosEstrategicos(); });

    document.getElementById("btn-redirect-auditoria")?.addEventListener("click", () => {
        window.location.href = "configuracion.html";
        sessionStorage.setItem("sigev_pestaña_activa", "pane-auditoria");
    });

    document.querySelectorAll(".tab-navigation .tab-item").forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll(".tab-navigation .tab-item").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            pestañaActivaReportes = tab.getAttribute("data-reporte");
            procesarCalculosEstrategicos();
        };
    });

    document.querySelectorAll(".btn-repo-download").forEach(btn => {
        btn.onclick = () => {
            const type = btn.getAttribute("data-type");
            let msg = "Generando descarga del archivo consolidado...";
            if (type.includes("pdf")) msg = "Compilando reporte de cobertura en PDF... La descarga comenzará automáticamente.";
            else if (type.includes("excel")) msg = "Procesando matrices NoSQL de terreno... Exportando a formato Excel (.xlsx).";
            mostrarAlertaPersonalizada(msg, "success");
        };
    });

    // 🚀 BINDEAR EL NUEVO BOTÓN DE DESCARGA DE PADRÓN DE VECINOS
    const btnDescargarPadron = document.getElementById("btn-exportar-padron-excel");
    if (btnDescargarPadron) {
        btnDescargarPadron.addEventListener("click", exportarPadronVecinosExcel);
    }
}

// ==============================================================================
// 🚀 EXPORTACIÓN MASIVA: PADRÓN DE VECINOS A EXCEL
// ==============================================================================
function calcularEdad(fechaNacimiento) {
    if (!fechaNacimiento || fechaNacimiento === "No registrada" || fechaNacimiento === "") return "S/R";
    const hoy = new Date();
    const cumpleanos = new Date(fechaNacimiento + "T00:00:00");
    if (isNaN(cumpleanos.getTime())) return "S/R";
    let edad = hoy.getFullYear() - cumpleanos.getFullYear();
    const m = hoy.getMonth() - cumpleanos.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < cumpleanos.getDate())) {
        edad--;
    }
    return edad;
}

function exportarPadronVecinosExcel() {
    if (typeof XLSX === "undefined") {
        alert("Error: La librería XLSX (SheetJS) no está cargada en el navegador.");
        return;
    }

    if (universoVecinosMemory.length === 0) {
        mostrarAlertaPersonalizada("No hay vecinos registrados en la base de datos para exportar.", "error");
        return;
    }

    mostrarAlertaPersonalizada("Procesando matriz de vecinos... Descargando Padrón Completo en formato Excel (.xlsx).", "success");

    // Mapear los datos ordenados tipo reporte
    const dataAExportar = universoVecinosMemory.map(v => {
        let fNacimiento = v.fechaNacimiento || "No registrada";
        let fRegistro = v.fechaRegistro && v.fechaRegistro.seconds ? new Date(v.fechaRegistro.seconds * 1000).toLocaleDateString("es-CL") : (v.fechaRegistro ? new Date(v.fechaRegistro).toLocaleDateString("es-CL") : "No registrada");

        return {
            "ID Vecino": v.correlativo ? `SIG-VEC-${String(v.correlativo).padStart(5, '0')}` : v.id.substring(0,6).toUpperCase(),
            "RUT": v.rut || "Sin RUT",
            "Nombre Completo": v.nombreCompleto || "S/R",
            "Teléfono": v.telefono || "S/R",
            "Correo Electrónico": v.correo || "S/R",
            "Sexo": v.sexo || "S/R",
            "Fecha Nacimiento": fNacimiento,
            "Edad": calcularEdad(fNacimiento),
            "Dirección Principal": v.direccion || "S/R",
            "Dirección Complementaria": v.direccionComplementaria || "",
            "Sector Territorial": v.sectorTerritorial || "S/R",
            "Unidad Vecinal (UV)": v.unidadVecinal || "S/R",
            "Junta de Vecinos": v.juntaVecinos || "S/R",
            "Barrio / Villa Popular": v.barrioPopular || "S/R",
            "Previsión de Salud": v.previsionSalud || "S/R",
            "Tramo / Isapre": v.tramoLetraIsapre || "",
            "Ocupación / Oficio": v.ocupacion || "",
            "Tipo Solicitante": v.tipoSolicitante || "Vecino/a",
            "Tipo Organización": v.tipoOrganizacion || "",
            "Nombre Organización": v.nombreOrganizacion || "",
            "Jefe de Hogar": v.jefeHogar ? "SÍ" : "NO",
            "Integrantes Hogar": v.cantidadIntegrantes || 1,
            "ID Grupo Familiar": v.idHogar || "",
            "Latitud": v.lat || "",
            "Longitud": v.lng || "",
            "Fecha Registro": fRegistro,
            "Notas / Observaciones": v.observaciones || ""
        };
    });

    const ws = XLSX.utils.json_to_sheet(dataAExportar);
    
    // Auto-ajustar ancho de columnas para que el Excel se vea profesional
    const wscols = [
        {wch: 15}, {wch: 15}, {wch: 35}, {wch: 18}, {wch: 30}, {wch: 12}, {wch: 18}, {wch: 8}, 
        {wch: 35}, {wch: 25}, {wch: 25}, {wch: 20}, {wch: 25}, {wch: 25}, {wch: 20}, {wch: 18},
        {wch: 25}, {wch: 25}, {wch: 25}, {wch: 30}, {wch: 15}, {wch: 18}, {wch: 30}, {wch: 15}, 
        {wch: 15}, {wch: 15}, {wch: 50}
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Padrón Total");

    const fechaHoy = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `Reporte_Padron_Completo_${CURRENT_TENANT_ID.toUpperCase()}_${fechaHoy}.xlsx`);
}