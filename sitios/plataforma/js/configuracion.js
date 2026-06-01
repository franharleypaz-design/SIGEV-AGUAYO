// ==============================================================================
// SIGEV-AGUAYO - MOTOR CENTRALIZADOR DE CONFIGURACIÓN PARAMÉTRICA (CONECTOR)
// ==============================================================================
import { auth, db, app } from "./app.js";
import { doc, getDoc, setDoc, collection, getDocs, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { actualizarPerfilLayout } from "./layout.js";

const storage = getStorage(app);
const CURRENT_TENANT_ID = "aguayo";

// Variables para almacenar las imágenes en memoria antes de guardarlas
let archivoLogoSidebarPendiente = null;
let archivoLogoPortalPendiente = null;

const menuItems = document.querySelectorAll(".config-menu-item");
const paneViews = document.querySelectorAll(".config-pane-view");
const btnCompileBackup = document.getElementById("btn-trigger-backup-compile");

auth.onAuthStateChanged(async (user) => {
    if (user) {
        actualizarPerfilLayout(user);
        inicializarNavegacionConsola();
        inicializarCargaImagenLogo();
        await cargarParametrosGlobalesWorkspace();
        await renderizarBitacoraAuditoriaSimulada();
    }
});

function inicializarNavegacionConsola() {
    menuItems.forEach(item => {
        item.onclick = () => {
            menuItems.forEach(i => i.classList.remove("active"));
            paneViews.forEach(p => p.classList.remove("active"));

            item.classList.add("active");
            document.getElementById(item.getAttribute("data-target")).classList.add("active");
        };
    });

    document.querySelectorAll(".btn-save-config-master").forEach(btn => {
        btn.onclick = () => ejecutarPersistenciaConfiguracionFirestore();
    });

    if (btnCompileBackup) btnCompileBackup.onclick = ejecutarCompilacionDescargaBackupJSON;
}

function inicializarCargaImagenLogo() {
    // 1. Lógica para la visualización del Logo del Menú Lateral (Sidebar)
    const sidebarLogoFile = document.getElementById("cfg-sidebar-logo-file");
    if (sidebarLogoFile) {
        sidebarLogoFile.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                archivoLogoSidebarPendiente = file;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    document.getElementById("cfg-sidebar-logo-preview").src = ev.target.result;
                    document.getElementById("cfg-sidebar-logo-preview").style.display = "block";
                    document.getElementById("cfg-sidebar-logo-placeholder").style.display = "none";
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // 2. Lógica para la visualización del Logo del Portal Público (NUEVO)
    const portalLogoFile = document.getElementById("cfg-portal-logo-file");
    if (portalLogoFile) {
        portalLogoFile.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                archivoLogoPortalPendiente = file;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    document.getElementById("cfg-portal-logo-preview").src = ev.target.result;
                    document.getElementById("cfg-portal-logo-preview").style.display = "block";
                    document.getElementById("cfg-portal-logo-placeholder").style.display = "none";
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

async function cargarParametrosGlobalesWorkspace() {
    try {
        const docRef = doc(db, "configuracion_tenant", CURRENT_TENANT_ID);
        const snap = await getDoc(docRef);

        if (snap.exists()) {
            const c = snap.data();
            
            // Cargar datos Sidebar
            document.getElementById("cfg-sidebar-title").value = c.sidebarTitle || "";
            document.getElementById("cfg-sidebar-subtitle").value = c.sidebarSubtitle || "";
            if (c.sidebarLogoUrl) {
                document.getElementById("cfg-sidebar-logo-preview").src = c.sidebarLogoUrl;
                document.getElementById("cfg-sidebar-logo-preview").style.display = "block";
                document.getElementById("cfg-sidebar-logo-placeholder").style.display = "none";
            }

            // Cargar Logo del Portal Público
            if (c.portalLogoUrl) {
                const portalPreview = document.getElementById("cfg-portal-logo-preview");
                const portalPlaceholder = document.getElementById("cfg-portal-logo-placeholder");
                if(portalPreview && portalPlaceholder) {
                    portalPreview.src = c.portalLogoUrl;
                    portalPreview.style.display = "block";
                    portalPlaceholder.style.display = "none";
                }
            }
            
            // Cargar Opción de Tema (Claro / Oscuro)
            document.getElementById("cfg-app-theme").value = c.temaPlataforma || "oscuro";

            // Reloj
            document.getElementById("cfg-reloj-estilo").value = c.estiloReloj || "1";

            // Prevención de errores por campos eliminados (Dirección y WhatsApp)
            const elDir = document.getElementById("cfg-contacto-dir");
            if(elDir) elDir.value = c.contactoDireccion || "";
            const elWsp = document.getElementById("cfg-contacto-wsp");
            if(elWsp) elWsp.value = c.contactoWhatsapp || "";

            document.getElementById("cfg-territorio-sectores").value = c.sectoresTerritoriales ? c.sectoresTerritoriales.join("\n") : "";
            document.getElementById("cfg-territorio-uvs").value = c.unidadesVecinales ? c.unidadesVecinales.join("\n") : "";
            document.getElementById("cfg-concejo-sesiones").value = c.tiposSesionConcejo ? c.tiposSesionConcejo.join(", ") : "Ordinaria, Extraordinaria, Solemne";

            document.getElementById("cfg-solicitudes-cat").value = c.categoriasSolicitudes ? c.categoriasSolicitudes.join(", ") : "";
            document.getElementById("cfg-solicitudes-estados").value = c.estadosTickets ? c.estadosTickets.join(", ") : "";
            document.getElementById("cfg-donaciones-tipos").value = c.lineasAyudaSocial ? c.lineasAyudaSocial.join(", ") : "";
            document.getElementById("cfg-donaciones-campanas").value = c.campanasActivas ? c.campanasActivas.join(", ") : "";
            document.getElementById("cfg-docs-tipos").value = c.documentosAdmitidos ? c.documentosAdmitidos.join(", ") : "";

            document.getElementById("cfg-dash-chk-solicitudes").checked = c.showSolAbiertas !== false;
            document.getElementById("cfg-dash-chk-vecinos").checked = c.showVecinosReg !== false;
            document.getElementById("cfg-dash-chk-donaciones").checked = c.showInversionSocial !== false;
            document.getElementById("cfg-dash-chk-actas").checked = c.showActasConcejo !== false;
            document.getElementById("cfg-auto-email-crear").checked = c.notificarUrgentesEmail === true;
            document.getElementById("cfg-auto-alerta-tiempo").checked = c.alertaTicketsTreintaDias === true;
        } else {
            document.getElementById("cfg-app-theme").value = "oscuro";
            document.getElementById("cfg-reloj-estilo").value = "1";
        }
    } catch (err) {
        console.error("Error cargando configuración paramétrica:", err);
    }
}

async function ejecutarPersistenciaConfiguracionFirestore() {
    const overlayCarga = document.createElement("div");
    overlayCarga.className = "custom-alert-overlay";
    overlayCarga.innerHTML = `<div class="custom-alert-card"><h4>Sincronizando Workspace...</h4><p style="font-size:12px;color:var(--text-light);">Resguardando matrices de control en la nube.</p></div>`;
    document.body.appendChild(overlayCarga);

    try {
        const payload = {
            sidebarTitle: document.getElementById("cfg-sidebar-title").value.trim(),
            sidebarSubtitle: document.getElementById("cfg-sidebar-subtitle").value.trim(),
            
            temaPlataforma: document.getElementById("cfg-app-theme").value,
            estiloReloj: document.getElementById("cfg-reloj-estilo").value,

            // Prevención de error por captura de IDs eliminados
            contactoDireccion: document.getElementById("cfg-contacto-dir")?.value.trim() || "",
            contactoWhatsapp: document.getElementById("cfg-contacto-wsp")?.value.trim() || "",

            sectoresTerritoriales: document.getElementById("cfg-territorio-sectores").value.split("\n").map(s => s.trim()).filter(s => s !== ""),
            unidadesVecinales: document.getElementById("cfg-territorio-uvs").value.split("\n").map(u => u.trim()).filter(u => u !== ""),
            tiposSesionConcejo: document.getElementById("cfg-concejo-sesiones").value.split(",").map(s => s.trim()).filter(s => s !== ""),

            categoriasSolicitudes: document.getElementById("cfg-solicitudes-cat").value.split(",").map(c => c.trim()).filter(c => c !== ""),
            estadosTickets: document.getElementById("cfg-solicitudes-estados").value.split(",").map(e => e.trim()).filter(e => e !== ""),
            lineasAyudaSocial: document.getElementById("cfg-donaciones-tipos").value.split(",").map(t => t.trim()).filter(t => t !== ""),
            campanasActivas: document.getElementById("cfg-donaciones-campanas").value.split(",").map(c => c.trim()).filter(c => c !== ""),
            documentosAdmitidos: document.getElementById("cfg-docs-tipos").value.split(",").map(d => d.trim()).filter(d => d !== ""),

            showSolAbiertas: document.getElementById("cfg-dash-chk-solicitudes").checked,
            showVecinosReg: document.getElementById("cfg-dash-chk-vecinos").checked,
            showInversionSocial: document.getElementById("cfg-dash-chk-donaciones").checked,
            showActasConcejo: document.getElementById("cfg-dash-chk-actas").checked,
            notificarUrgentesEmail: document.getElementById("cfg-auto-email-crear").checked,
            alertaTicketsTreintaDias: document.getElementById("cfg-auto-alerta-tiempo").checked,
            
            ultimaModificacionSaaS: serverTimestamp()
        };

        // 1. Guardar Logo del Sidebar si hubo cambios
        if (archivoLogoSidebarPendiente) {
            const storageRef = ref(storage, `branding/sidebar_logo_${CURRENT_TENANT_ID}`);
            await uploadBytes(storageRef, archivoLogoSidebarPendiente);
            payload.sidebarLogoUrl = await getDownloadURL(storageRef);
            archivoLogoSidebarPendiente = null; 
        }

        // 2. Guardar Logo del Portal Público si hubo cambios (NUEVO)
        if (archivoLogoPortalPendiente) {
            const storageRef = ref(storage, `branding/portal_logo_${CURRENT_TENANT_ID}`);
            await uploadBytes(storageRef, archivoLogoPortalPendiente);
            payload.portalLogoUrl = await getDownloadURL(storageRef);
            archivoLogoPortalPendiente = null; 
        }

        await setDoc(doc(db, "configuracion_tenant", CURRENT_TENANT_ID), payload, { merge: true });
        overlayCarga.remove();
        
        const alertBox = document.createElement("div");
        alertBox.className = "custom-alert-overlay";
        alertBox.innerHTML = `
            <div class="custom-alert-card">
                <div class="custom-alert-icon" style="background-color:rgba(16,185,129,0.1); color:#10b981;">✓</div>
                <div class="custom-alert-title">¡Sincronización Exitosa!</div>
                <div class="custom-alert-message">La arquitectura de tu Workspace ha sido reconfigurada en la nube con éxito.</div>
                <button class="btn btn-primary alert-close-btn" style="background-color:#0b438c; margin-top:14px; width:100%;">Aceptar</button>
            </div>`;
        document.body.appendChild(alertBox);
        alertBox.querySelector(".alert-close-btn").onclick = () => {
            alertBox.remove();
            window.location.reload(); 
        };

    } catch (err) {
        console.error(err);
        overlayCarga.remove();
    }
}

async function ejecutarCompilacionDescargaBackupJSON() {
    btnCompileBackup.disabled = true;
    btnCompileBackup.innerText = "Recopilando colecciones NoSQL...";

    try {
        const coleccionesObjetivos = ["vecinos", "solicitudes", "donaciones", "sesiones_concejo"];
        const backupMasterObject = {
            tenantId: CURRENT_TENANT_ID,
            fechaCompilacionRespaldo: new Date().toISOString(),
            data: {}
        };

        for (const colName of coleccionesObjetivos) {
            const q = query(collection(db, colName), where("tenantId", "==", CURRENT_TENANT_ID));
            const snap = await getDocs(q);
            backupMasterObject.data[colName] = [];
            snap.forEach(doc => {
                backupMasterObject.data[colName].push({ id: doc.id, ...doc.data() });
            });
        }

        const jsonString = JSON.stringify(backupMasterObject, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        a.download = `RESPALDO_MASTER_SIGEV_${CURRENT_TENANT_ID.toUpperCase()}_2026.json`;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (err) {
        console.error("Fallo de empaquetado de respaldo:", err);
    } finally {
        btnCompileBackup.disabled = false;
        btnCompileBackup.innerText = "📦 Compilar Copia de Seguridad Completa (.json)";
    }
}

async function renderizarBitacoraAuditoriaSimulada() {
    const tbody = document.querySelector("#tabla-config-auditoria tbody");
    if (!tbody) return;

    const logs = [
        { fecha: "30-05-2026 19:42", user: "👑 Gonzalo Aguayo", accion: "Actualizó Ficha de Vecino", ref: "#VEC-8QRPXK" },
        { fecha: "30-05-2026 18:07", user: "🎩 Franchesca Paz", accion: "Modificó Permisos de Funcionario", ref: "#USR-MWF04X" },
        { fecha: "29-05-2026 14:15", user: "👑 Gonzalo Aguayo", accion: "Consolidó Acta de Sesión #124", ref: "#CON-SEC124" },
        { fecha: "28-05-2026 11:32", user: "⭐ Mayne Navarro", accion: "Ingresó Ticket de Requerimiento", ref: "#SOL-U7GMU" }
    ];

    let html = "";
    logs.forEach(l => {
        html += `
            <tr>
                <td style="font-family:monospace; font-weight:600; color:var(--text-light);">${l.fecha}</td>
                <td style="font-weight:700; color:var(--text-dark);">${l.user}</td>
                <td><span style="font-weight:600; font-size:12px; background:#f1f5f9; padding:2px 8px; border-radius:4px; color:#334155;">${l.accion}</span></td>
                <td style="font-family:monospace; font-weight:700; color:var(--primary-blue);">${l.ref}</td>
            </tr>`;
    });
    tbody.innerHTML = html;
}

window.inyectarFilaVotacionDinamica = () => {};