// ============================================================================
// SIGEV-AGUAYO - PANEL DE ADMINISTRACIÓN PARAMÉTRICA Y MIGRACIÓN (V54)
// ============================================================================
import { auth, db, app } from "./app.js";
import { doc, setDoc, getDoc, updateDoc, collection, writeBatch, getDocs, query, where, serverTimestamp, runTransaction, limit, orderBy, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { inyectarEstructuraGlobal, actualizarPerfilLayout } from "./layout.js";

const storage = getStorage(app);

let subdominioCrudo = window.location.hostname.split('.')[0].toLowerCase();
const subdominioLimpio = subdominioCrudo.replace('sigev-', ''); 
const CURRENT_TENANT_ID = sessionStorage.getItem('SIGEV_ACTIVE_TENANT') || ((subdominioLimpio === 'localhost' || subdominioLimpio === '127' || subdominioLimpio === 'landing') ? "paz" : subdominioLimpio);

let concejalActivoData = { id: "" };

let archivoLogoSidebarPendiente = null;
let archivoLogoPortalPendiente = null;
let archivoFotoAutoridadPendiente = null; 
let archivoBadgePendiente = null; 
let archivoHeroBgPendiente = null; 
let archivoFooterLogoPendiente = null; 
let archivoFooterBgPendiente = null; 

let universalCropperInstance = null; 
let actSaveCallback = null;
let actFormat = "image/png";
let actPreviewId = "";
let actPlaceholderId = "";

// 🚀 MATRICES GLOBALES PARA MIGRACIÓN
let excelVecinosDataGlobal = [];
let excelSolicitudesDataGlobal = [];

let auditoriaGlobalMemory = [];
let logsPaginaActual = 1;
const logsPorPagina = 12;

const btnCompileBackup = document.getElementById("btn-trigger-backup-compile");

auth.onAuthStateChanged(async (user) => {
    if (user) {
        actualizarPerfilLayout(user);
        inicializarNavegacionConsola();
        inicializarCargaImagenLogo();
        await cargarParametrosGlobalesWorkspace();
        await inicializarCentroAuditoriaMaster();
        inicializarModuloMigracionVecinos();
        inicializarModuloMigracionSolicitudes();
    }
});

function inicializarNavegacionConsola() {
    const menuItems = document.querySelectorAll(".config-menu-item");
    const paneViews = document.querySelectorAll(".config-pane-view");

    const pestañaGuardada = sessionStorage.getItem("sigev_pestaña_activa");
    if (pestañaGuardada) {
        menuItems.forEach(i => i.classList.remove("active"));
        paneViews.forEach(p => p.classList.remove("active"));

        const itemActivo = document.querySelector(`[data-target="${pestañaGuardada}"]`);
        const panelActivo = document.getElementById(pestañaGuardada);
        
        if (itemActivo && panelActivo) {
            itemActivo.classList.add("active");
            panelActivo.classList.add("active");
        }
    }

    menuItems.forEach(item => {
        item.onclick = () => {
            menuItems.forEach(i => i.classList.remove("active"));
            paneViews.forEach(p => p.classList.remove("active"));

            item.classList.add("active");
            const targetPane = item.getAttribute("data-target");
            const targetElement = document.getElementById(targetPane);
            if (targetElement) {
                targetElement.classList.add("active");
            }
            
            sessionStorage.setItem("sigev_pestaña_activa", targetPane);
        };
    });

    document.querySelectorAll(".btn-save-config-master").forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault(); 
            ejecutarPersistenciaConfiguracionFirestore();
        };
    });

    if (btnCompileBackup) btnCompileBackup.onclick = (e) => {
        e.preventDefault();
        ejecutarCompilacionDescargaBackupJSON();
    };

    const btnClearDB = document.getElementById("btn-clear-db");
    if (btnClearDB) {
        btnClearDB.addEventListener("click", () => {
            mostrarConfirmacionPeligrosa(
                "¿Estás completamente seguro de purgar el Padrón?", 
                "Esta acción borrará de forma irreversible a todos los vecinos y sus expedientes territoriales del tenant activo.", 
                limpiarBaseDeDatosVecinos
            );
        });
    }

    const btnClearMetrics = document.getElementById("btn-clear-metrics");
    if (btnClearMetrics) {
        btnClearMetrics.addEventListener("click", () => {
            mostrarConfirmacionPeligrosa(
                "¿Restablecer todas las métricas de gestión?", 
                "Esta acción eliminará el historial de solicitudes y restablecerá los KPIs territoriales a cero.", 
                limpiarMetricasGlobales
            );
        });
    }

    const btnGuardarBranding = document.getElementById("btn-guardar-branding");
    if (btnGuardarBranding) {
        btnGuardarBranding.addEventListener("click", guardarBrandingTenant);
    }
}

function bindUploader(inputId, previewId, placeholderId, cfg, saveCallback) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > cfg.maxMB * 1024 * 1024) {
            alert(`⚠️ Peso excedido: La imagen elegida excede el límite de ${cfg.maxMB}MB. Modifícala e intenta de nuevo para no saturar el servidor.`);
            input.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById("cropper-title").innerText = cfg.title;
            document.getElementById("cropper-desc").innerText = cfg.desc;
            
            actSaveCallback = saveCallback;
            actFormat = cfg.format;
            actPreviewId = previewId;
            actPlaceholderId = placeholderId;

            const modal = document.getElementById("universal-cropper-modal");
            const targetImage = document.getElementById("universal-cropper-image");
            targetImage.src = ev.target.result;
            modal.style.display = "flex";

            if (universalCropperInstance) universalCropperInstance.destroy();

            universalCropperInstance = new Cropper(targetImage, {
                aspectRatio: cfg.aspect,
                viewMode: 1,
                dragMode: 'move',
                responsive: true,
                restore: false,
                guides: true,
                center: true,
                highlight: false,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false
            });
        };
        reader.readAsDataURL(file);
    });
}

function inicializarCargaImagenLogo() {
    bindUploader("cfg-sidebar-logo-file", "cfg-sidebar-logo-preview", "cfg-sidebar-logo-placeholder", {
        aspect: NaN, title: "Recortar Logo del Menú Lateral", desc: "Ajusta libremente las proporciones del logo.", maxMB: 2, format: "image/png"
    }, (blob) => archivoLogoSidebarPendiente = new File([blob], `sidebar_logo_${CURRENT_TENANT_ID}.png`, { type: "image/png" }));

    bindUploader("cfg-portal-logo-file", "cfg-portal-logo-preview", "cfg-portal-logo-placeholder", {
        aspect: NaN, title: "Recortar Logo Principal Web", desc: "Ajusta libremente las dimensiones del logo principal de vecinos.", maxMB: 2, format: "image/png"
    }, (blob) => archivoLogoPortalPendiente = new File([blob], `portal_logo_${CURRENT_TENANT_ID}.png`, { type: "image/png" }));

    bindUploader("cfg-hero-bg-file", "cfg-hero-bg-preview", "cfg-hero-bg-placeholder", {
        aspect: 1920/600, title: "Recortar Fondo del Banner", desc: "Encuadra la imagen para que calce de forma panorámica simétrica.", maxMB: 4, format: "image/jpeg"
    }, (blob) => archivoHeroBgPendiente = new File([blob], `hero_bg_${CURRENT_TENANT_ID}.jpg`, { type: "image/jpeg", quality: 0.85 }));

    bindUploader("cfg-badge-file", "cfg-badge-preview", "cfg-badge-placeholder", {
        aspect: 1, title: "Recortar Pin Institucional", desc: "Encuadra el logo dentro del marco cuadrado para el pin circular.", maxMB: 1, format: "image/png"
    }, (blob) => archivoBadgePendiente = new File([blob], `badge_${CURRENT_TENANT_ID}.png`, { type: "image/png" }));

    bindUploader("cfg-authority-photo-file", "cfg-authority-photo-preview", "cfg-authority-photo-placeholder", {
        aspect: 1, title: "Recortar Foto de la Autoridad", desc: "Ajusta el encuadre tipo busto/credencial dentro del recuadro.", maxMB: 4, format: "image/png"
    }, (blob) => archivoFotoAutoridadPendiente = new File([blob], `authority_${CURRENT_TENANT_ID}.png`, { type: "image/png" }));

    bindUploader("cfg-footer-logo-file", "cfg-footer-logo-preview", "cfg-footer-logo-placeholder", {
        aspect: NaN, title: "Recortar Logo Inferior", desc: "Ajusta libremente las proporciones de marca del Footer.", maxMB: 2, format: "image/png"
    }, (blob) => archivoFooterLogoPendiente = new File([blob], `footer_logo_${CURRENT_TENANT_ID}.png`, { type: "image/png" }));

    bindUploader("cfg-footer-bg-file", "cfg-footer-bg-preview", "cfg-footer-bg-placeholder", {
        aspect: 1920/400, title: "Recortar Fondo del Pie de Página", desc: "Encuadra la franja que decorará la parte baja de la web.", maxMB: 4, format: "image/jpeg"
    }, (blob) => archivoFooterBgPendiente = new File([blob], `footer_bg_${CURRENT_TENANT_ID}.jpg`, { type: "image/jpeg", quality: 0.85 }));

    const btnApply = document.getElementById("btn-apply-universal-crop");
    const btnCancel = document.getElementById("btn-cancel-universal-crop");

    if (btnApply) {
        btnApply.onclick = () => {
            if (universalCropperInstance) {
                const canvas = universalCropperInstance.getCroppedCanvas({
                    imageSmoothingEnabled: true,
                    imageSmoothingQuality: 'high'
                });
                
                canvas.toBlob((blob) => {
                    actSaveCallback(blob);
                    
                    const previewImg = document.getElementById(actPreviewId);
                    if (previewImg) {
                        previewImg.src = canvas.toDataURL(actFormat, actFormat === "image/jpeg" ? 0.85 : undefined);
                        previewImg.style.display = "block";
                    }
                    const placeholder = document.getElementById(actPlaceholderId);
                    if (placeholder) placeholder.style.display = "none";
                    
                    document.getElementById("universal-cropper-modal").style.display = "none";
                    universalCropperInstance.destroy();
                    universalCropperInstance = null;
                }, actFormat, actFormat === "image/jpeg" ? 0.85 : undefined);
            }
        };
    }

    if (btnCancel) {
        btnCancel.onclick = () => {
            document.getElementById("universal-cropper-modal").style.display = "none";
            if (universalCropperInstance) {
                universalCropperInstance.destroy();
                universalCropperInstance = null;
            }
        };
    }
}

async function cargarParametrosGlobalesWorkspace() {
    try {
        const docRef = doc(db, "configuracion_tenant", CURRENT_TENANT_ID);
        const snap = await getDoc(docRef);

        if (snap.exists()) {
            const c = snap.data();
            concejalActivoData.id = c.concejalId || `ID_${CURRENT_TENANT_ID.toUpperCase()}`;

            if (document.getElementById("cfg-sidebar-title")) document.getElementById("cfg-sidebar-title").value = c.sidebarTitle || "";
            if (document.getElementById("cfg-sidebar-subtitle")) document.getElementById("cfg-sidebar-subtitle").value = c.sidebarSubtitle || "";
            if (c.sidebarLogoUrl && document.getElementById("cfg-sidebar-logo-preview")) {
                document.getElementById("cfg-sidebar-logo-preview").src = c.sidebarLogoUrl;
                document.getElementById("cfg-sidebar-logo-preview").style.display = "block";
                if(document.getElementById("cfg-sidebar-logo-placeholder")) document.getElementById("cfg-sidebar-logo-placeholder").style.display = "none";
            }

            const sidebarZone = document.getElementById("sidebar-container");
            if (sidebarZone) {
                sidebarZone.querySelectorAll("*").forEach(el => {
                    if (el.children.length === 0) {
                        const texto = (el.innerText || "").trim(); 
                        if (texto === "FRANCHESCA PAZ") el.innerText = c.sidebarTitle || "GONZALO AGUAYO";
                        if (texto === "Concejala de Pudahuel") el.innerText = c.sidebarSubtitle || "Concejal de La Cisterna";
                    }
                });
                
                if (c.sidebarLogoUrl) {
                    const iconoSidebar = sidebarZone.querySelector("#sidebar-profile-container img, #sidebar-profile-container svg");
                    
                    if (iconoSidebar && iconoSidebar.tagName === "svg") {
                        const imgNueva = document.createElement("img");
                        imgNueva.src = c.sidebarLogoUrl;
                        imgNueva.style.cssText = "width: 42px; height: 42px; object-fit: contain; border-radius: 6px;";
                        iconoSidebar.replaceWith(imgNueva);
                    } else if (iconoSidebar && iconoSidebar.tagName === "IMG") {
                        iconoSidebar.src = c.sidebarLogoUrl;
                    }
                }
            }

            if (c.portalLogoUrl) {
                const portalPreview = document.getElementById("cfg-portal-logo-preview");
                const portalPlaceholder = document.getElementById("cfg-portal-logo-placeholder");
                if (portalPreview && portalPlaceholder) {
                    portalPreview.src = c.portalLogoUrl;
                    portalPreview.style.display = "block";
                    portalPlaceholder.style.display = "none";
                }
            }
            
            if (c.portalHeroBgUrl && document.getElementById("cfg-hero-bg-preview")) {
                document.getElementById("cfg-hero-bg-preview").src = c.portalHeroBgUrl;
                document.getElementById("cfg-hero-bg-preview").style.display = "block";
                if (document.getElementById("cfg-hero-bg-placeholder")) {
                    document.getElementById("cfg-hero-bg-placeholder").style.display = "none";
                }
            }

            if (c.portalFooterLogoUrl && document.getElementById("cfg-footer-logo-preview")) {
                document.getElementById("cfg-footer-logo-preview").src = c.portalFooterLogoUrl;
                document.getElementById("cfg-footer-logo-preview").style.display = "block";
                if (document.getElementById("cfg-footer-logo-placeholder")) document.getElementById("cfg-footer-logo-placeholder").style.display = "none";
            }

            if (c.portalFooterBgUrl && document.getElementById("cfg-footer-bg-preview")) {
                document.getElementById("cfg-footer-bg-preview").src = c.portalFooterBgUrl;
                document.getElementById("cfg-footer-bg-preview").style.display = "block";
                if (document.getElementById("cfg-footer-bg-placeholder")) document.getElementById("cfg-footer-bg-placeholder").style.display = "none";
            }

            if (document.getElementById("conf-portal-titulo")) document.getElementById("conf-portal-titulo").value = c.portalHeroTitulo || "";
            if (document.getElementById("conf-portal-subtitulo")) document.getElementById("conf-portal-subtitulo").value = c.portalHeroSubtitulo || "";
            if (document.getElementById("conf-portal-nombre")) document.getElementById("conf-portal-nombre").value = c.portalNombre || "";
            if (document.getElementById("conf-portal-cargo")) document.getElementById("conf-portal-cargo").value = c.portalCargo || "";
            
            if (c.portalImagenUrl && document.getElementById("cfg-authority-photo-preview")) {
                document.getElementById("cfg-authority-photo-preview").src = c.portalImagenUrl;
                document.getElementById("cfg-authority-photo-preview").style.display = "block";
                if (document.getElementById("cfg-authority-photo-placeholder")) {
                    document.getElementById("cfg-authority-photo-placeholder").style.display = "none";
                }
            }

            if (c.portalBadgeUrl && document.getElementById("cfg-badge-preview")) {
                document.getElementById("cfg-badge-preview").src = c.portalBadgeUrl;
                document.getElementById("cfg-badge-preview").style.display = "block";
                if (document.getElementById("cfg-badge-placeholder")) {
                    document.getElementById("cfg-badge-placeholder").style.display = "none";
                }
            }
            
            if (document.getElementById("cfg-reloj-estilo")) document.getElementById("cfg-reloj-estilo").value = c.estiloReloj || "1";
            
            if (document.getElementById("cfg-contacto-dir")) document.getElementById("cfg-contacto-dir").value = c.contactoDireccion || "";
            if (document.getElementById("cfg-contacto-tel")) document.getElementById("cfg-contacto-tel").value = c.contactoTelefono || "";
            if (document.getElementById("cfg-contacto-wsp")) document.getElementById("cfg-contacto-wsp").value = c.contactoWhatsapp || "";
            if (document.getElementById("cfg-contacto-email")) document.getElementById("cfg-contacto-email").value = c.contactoEmail || "";

            if (document.getElementById("cfg-footer-mensaje")) document.getElementById("cfg-footer-mensaje").value = c.footerMensaje || "";
            if (document.getElementById("cfg-rrss-fb")) document.getElementById("cfg-rrss-fb").value = c.rrssFb || "";
            if (document.getElementById("cfg-rrss-ig")) document.getElementById("cfg-rrss-ig").value = c.rrssIg || "";
            if (document.getElementById("cfg-rrss-tiktok")) document.getElementById("cfg-rrss-tiktok").value = c.rrssTiktok || "";
            if (document.getElementById("cfg-rrss-web")) document.getElementById("cfg-rrss-web").value = c.rrssWeb || "";

            if (document.getElementById("cfg-territorio-sectores")) document.getElementById("cfg-territorio-sectores").value = c.sectoresTerritoriales ? c.sectoresTerritoriales.join("\n") : "";
            if (document.getElementById("cfg-territorio-uvs")) document.getElementById("cfg-territorio-uvs").value = c.unidadesVecinales ? c.unidadesVecinales.join("\n") : "";
            if (document.getElementById("cfg-concejo-sesiones")) document.getElementById("cfg-concejo-sesiones").value = c.tiposSesionConcejo ? c.tiposSesionConcejo.join(", ") : "Ordinaria, Extraordinaria, Solemne";
            if (document.getElementById("cfg-solicitudes-cat")) document.getElementById("cfg-solicitudes-cat").value = c.categoriasSolicitudes ? c.categoriasSolicitudes.join(", ") : "";
            if (document.getElementById("cfg-solicitudes-estados")) document.getElementById("cfg-solicitudes-estados").value = c.estadosTickets ? c.estadosTickets.join(", ") : "";
            if (document.getElementById("cfg-donaciones-tipos")) document.getElementById("cfg-donaciones-tipos").value = c.lineasAyudaSocial ? c.lineasAyudaSocial.join(", ") : "";
            if (document.getElementById("cfg-donaciones-campanas")) document.getElementById("cfg-donaciones-campanas").value = c.campanasActivas ? c.campanasActivas.join(", ") : "";
            if (document.getElementById("cfg-docs-tipos")) document.getElementById("cfg-docs-tipos").value = c.documentosAdmitidos ? c.documentosAdmitidos.join(", ") : "";

            if (document.getElementById("cfg-dash-chk-solicitudes")) document.getElementById("cfg-dash-chk-solicitudes").checked = c.showSolAbiertas !== false;
            if (document.getElementById("cfg-dash-chk-vecinos")) document.getElementById("cfg-dash-chk-vecinos").checked = c.showVecinosReg !== false;
            if (document.getElementById("cfg-dash-chk-donaciones")) document.getElementById("cfg-dash-chk-donaciones").checked = c.showInversionSocial !== false;
            if (document.getElementById("cfg-dash-chk-actas")) document.getElementById("cfg-dash-chk-actas").checked = c.showActasConcejo !== false;
            if (document.getElementById("cfg-auto-email-crear")) document.getElementById("cfg-auto-email-crear").checked = c.notificarUrgentesEmail === true;
            if (document.getElementById("cfg-auto-alerta-tiempo")) document.getElementById("cfg-auto-alerta-tiempo").checked = c.alertaTicketsTreintaDias === true;

            if (typeof renderizarConstructorTriage === "function") {
                renderizarConstructorTriage(c.mapaTriage);
            }
        } else {
            if (document.getElementById("cfg-reloj-estilo")) document.getElementById("cfg-reloj-estilo").value = "1";
            if (typeof renderizarConstructorTriage === "function") {
                renderizarConstructorTriage(null);
            }
        }
    } catch (err) {
        console.error("Error cargando configuración paramétrica:", err);
    }
}

async function cargarBrandingActual() {
    try {
        const tenantRef = doc(db, "tenants", CURRENT_TENANT_ID);
        const snap = await getDoc(tenantRef);
        if (snap.exists()) {
            const data = snap.data();
            if (data.nombreAutoridad && document.getElementById("conf-nombre-autoridad")) document.getElementById("conf-nombre-autoridad").value = data.nombreAutoridad;
            if (data.cargo && document.getElementById("conf-cargo-autoridad")) document.getElementById("conf-cargo-autoridad").value = data.cargo;
            if (data.colorPrimario && document.getElementById("conf-color-primario")) document.getElementById("conf-color-primario").value = data.colorPrimario;
        }
    } catch (e) {
        console.error("Error cargando configuración:", e);
    }
}

async function guardarBrandingTenant() {
    const btn = document.getElementById("btn-guardar-branding");
    btn.disabled = true;
    btn.innerText = "Guardando...";

    const nombre = document.getElementById("conf-nombre-autoridad").value;
    const cargo = document.getElementById("conf-cargo-autoridad").value;
    const colorPrimario = document.getElementById("conf-color-primario").value;
    const logoInput = document.getElementById("conf-logo-auth");

    try {
        const payload = {
            nombreAutoridad: nombre,
            cargo: cargo,
            colorPrimario: colorPrimario,
            updatedAt: serverTimestamp()
        };

        if (logoInput.files && logoInput.files.length > 0) {
            const file = logoInput.files[0];
            const storageRef = ref(storage, `branding/${CURRENT_TENANT_ID}/logo_${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            payload.logoUrl = url;
        }

        await setDoc(doc(db, "tenants", CURRENT_TENANT_ID), payload, { merge: true });
        mostrarAlertaGlobal("Identidad gráfica actualizada correctamente.", "success");
        setTimeout(() => location.reload(), 1500);

    } catch (e) {
        console.error(e);
        mostrarAlertaGlobal("Error al guardar la configuración visual.", "error");
    } finally {
        btn.disabled = false;
        btn.innerText = "Guardar Cambios y Aplicar";
    }
}

async function ejecutarPersistenciaConfiguracionFirestore() {
    const overlayCarga = document.createElement("div");
    overlayCarga.className = "custom-alert-overlay";
    overlayCarga.innerHTML = `<div class="custom-alert-card"><h4>Sincronizando Workspace...</h4><p style="font-size:12px;color:var(--text-light);">Resguardando matrices de control en la nube.</p></div>`;
    document.body.appendChild(overlayCarga);

    try {
        const payload = {
            sidebarTitle: document.getElementById("cfg-sidebar-title")?.value?.trim() || "",
            sidebarSubtitle: document.getElementById("cfg-sidebar-subtitle")?.value?.trim() || "",
            
            portalHeroTitulo: document.getElementById("conf-portal-titulo")?.value?.trim() || "",
            portalHeroSubtitulo: document.getElementById("conf-portal-subtitulo")?.value?.trim() || "",
            portalNombre: document.getElementById("conf-portal-nombre")?.value?.trim() || "",
            portalCargo: document.getElementById("conf-portal-cargo")?.value?.trim() || "",
            
            temaPlataforma: "claro", 
            estiloReloj: document.getElementById("cfg-reloj-estilo")?.value || "1",

            contactoDireccion: document.getElementById("cfg-contacto-dir")?.value?.trim() || "",
            contactoTelefono: document.getElementById("cfg-contacto-tel")?.value?.trim() || "",
            contactoWhatsapp: document.getElementById("cfg-contacto-wsp")?.value?.trim() || "",
            contactoEmail: document.getElementById("cfg-contacto-email")?.value?.trim() || "",

            footerMensaje: document.getElementById("cfg-footer-mensaje")?.value?.trim() || "",
            rrssFb: document.getElementById("cfg-rrss-fb")?.value?.trim() || "",
            rrssIg: document.getElementById("cfg-rrss-ig")?.value?.trim() || "",
            rrssTiktok: document.getElementById("cfg-rrss-tiktok")?.value?.trim() || "",
            rrssWeb: document.getElementById("cfg-rrss-web")?.value?.trim() || "",

            sectoresTerritoriales: document.getElementById("cfg-territorio-sectores")?.value?.split("\n").map(s => s.trim()).filter(s => s !== "") || [],
            unidadesVecinales: document.getElementById("cfg-territorio-uvs")?.value?.split("\n").map(u => u.trim()).filter(u => u !== "") || [],
            tiposSesionConcejo: document.getElementById("cfg-concejo-sesiones")?.value?.split(",").map(s => s.trim()).filter(s => s !== "") || [],

            categoriasSolicitudes: document.getElementById("cfg-solicitudes-cat")?.value?.split(",").map(c => c.trim()).filter(c => c !== "") || [],
            estadosTickets: document.getElementById("cfg-solicitudes-estados")?.value?.split(",").map(e => e.trim()).filter(e => e !== "") || [],
            lineasAyudaSocial: document.getElementById("cfg-donaciones-tipos")?.value?.split(",").map(t => t.trim()).filter(t => t !== "") || [],
            campanasActivas: document.getElementById("cfg-donaciones-campanas")?.value?.split(",").map(c => c.trim()).filter(c => c !== "") || [],
            documentosAdmitidos: document.getElementById("cfg-docs-tipos")?.value?.split(",").map(d => d.trim()).filter(d => d !== "") || [],

            showSolAbiertas: document.getElementById("cfg-dash-chk-solicitudes")?.checked || false,
            showVecinosReg: document.getElementById("cfg-dash-chk-vecinos")?.checked || false,
            showInversionSocial: document.getElementById("cfg-dash-chk-donaciones")?.checked || false,
            showActasConcejo: document.getElementById("cfg-dash-chk-actas")?.checked || false,
            notificarUrgentesEmail: document.getElementById("cfg-auto-email-crear")?.checked || false,
            alertaTicketsTreintaDias: document.getElementById("cfg-auto-alerta-tiempo")?.checked || false,
            mapaTriage: recolectarMapaTriageUI(),
            
            ultimaModificacionSaaS: serverTimestamp()
        };

        if (archivoLogoSidebarPendiente) {
            const storageRef = ref(storage, `branding/sidebar_logo_${CURRENT_TENANT_ID}`);
            await uploadBytes(storageRef, archivoLogoSidebarPendiente);
            payload.sidebarLogoUrl = await getDownloadURL(storageRef);
            archivoLogoSidebarPendiente = null; 
        }

        if (archivoLogoPortalPendiente) {
            const storageRef = ref(storage, `branding/portal_logo_${CURRENT_TENANT_ID}`);
            await uploadBytes(storageRef, archivoLogoPortalPendiente);
            payload.portalLogoUrl = await getDownloadURL(storageRef);
            archivoLogoPortalPendiente = null; 
        }

        if (archivoFotoAutoridadPendiente) {
            const storageRef = ref(storage, `branding/authority_photo_${CURRENT_TENANT_ID}`);
            await uploadBytes(storageRef, archivoFotoAutoridadPendiente);
            payload.portalImagenUrl = await getDownloadURL(storageRef);
            archivoFotoAutoridadPendiente = null; 
        }

        if (archivoBadgePendiente) {
            const storageRef = ref(storage, `branding/badge_logo_${CURRENT_TENANT_ID}`);
            await uploadBytes(storageRef, archivoBadgePendiente);
            payload.portalBadgeUrl = await getDownloadURL(storageRef);
            archivoBadgePendiente = null;
        }

        if (archivoHeroBgPendiente) {
            const storageRef = ref(storage, `branding/hero_bg_${CURRENT_TENANT_ID}`);
            await uploadBytes(storageRef, archivoHeroBgPendiente);
            payload.portalHeroBgUrl = await getDownloadURL(storageRef);
            archivoHeroBgPendiente = null;
        }

        if (archivoFooterLogoPendiente) {
            const storageRef = ref(storage, `branding/footer_logo_${CURRENT_TENANT_ID}`);
            await uploadBytes(storageRef, archivoFooterLogoPendiente);
            payload.portalFooterLogoUrl = await getDownloadURL(storageRef);
            archivoFooterLogoPendiente = null;
        }

        if (archivoFooterBgPendiente) {
            const storageRef = ref(storage, `branding/footer_bg_${CURRENT_TENANT_ID}`);
            await uploadBytes(storageRef, archivoFooterBgPendiente);
            payload.portalFooterBgUrl = await getDownloadURL(storageRef);
            archivoFooterBgPendiente = null;
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
        console.error("Error al persistir configuración:", err);
        overlayCarga.remove();
        alert("Ocurrió un error al guardar los cambios. Revisa la consola.");
    }
}

// ============================================================================
// PURGA DE BASE DE DATOS (DANGER ZONE)
// ============================================================================
async function limpiarBaseDeDatosVecinos() {
    try {
        mostrarLoaderBloqueante("Purgando padrón de vecinos...");
        let batch = writeBatch(db);
        const q = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID));
        const snap = await getDocs(q);
        
        let count = 0;
        snap.forEach(d => {
            batch.delete(doc(db, "vecinos", d.id));
            count++;
            if (count >= 400) {
                batch.commit();
                batch = writeBatch(db);
                count = 0;
            }
        });
        if (count > 0) await batch.commit();

        await setDoc(doc(db, "counters_diarios", CURRENT_TENANT_ID), { vecinosTotal: 0 }, { merge: true });

        ocultarLoaderBloqueante();
        mostrarAlertaGlobal("Padrón territorial purgado exitosamente.", "success");
    } catch (e) {
        console.error(e);
        ocultarLoaderBloqueante();
        mostrarAlertaGlobal("Error al eliminar los expedientes.", "error");
    }
}

async function limpiarMetricasGlobales() {
    try {
        mostrarLoaderBloqueante("Restableciendo métricas y solicitudes...");
        let batch = writeBatch(db);
        const q = query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID));
        const snap = await getDocs(q);
        
        let count = 0;
        snap.forEach(d => {
            batch.delete(doc(db, "solicitudes", d.id));
            count++;
            if (count >= 400) {
                batch.commit();
                batch = writeBatch(db);
                count = 0;
            }
        });
        if (count > 0) await batch.commit();

        await setDoc(doc(db, "counters_diarios", CURRENT_TENANT_ID), { correlativoSolicitudes: 0 }, { merge: true });

        ocultarLoaderBloqueante();
        mostrarAlertaGlobal("Métricas y Casos eliminados permanentemente.", "success");
    } catch (e) {
        console.error(e);
        ocultarLoaderBloqueante();
        mostrarAlertaGlobal("Error al purgar las métricas.", "error");
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

async function inicializarCentroAuditoriaMaster() {
    try {
        const logsRef = collection(db, "logs");
        
        const q = query(
            logsRef,
            where("tenant", "==", CURRENT_TENANT_ID),
            limit(150)
        );

        const snapshot = await getDocs(q);
        auditoriaGlobalMemory = [];
        
        snapshot.forEach(docSnap => {
            auditoriaGlobalMemory.push({ id: docSnap.id, ...docSnap.data() });
        });

        auditoriaGlobalMemory.sort((a, b) => {
            const timeA = a.timestamp?.seconds ? (a.timestamp.seconds * 1000) : new Date(a.timestamp || 0).getTime();
            const timeB = b.timestamp?.seconds ? (b.timestamp.seconds * 1000) : new Date(b.timestamp || 0).getTime();
            return timeB - timeA;
        });

        calcularMetricasDeAuditoria();
        vincularEscuchadoresAuditoria();
        filtrarYRenderizarTablaLogs();

    } catch (error) {
        console.error("Error real en la carga de auditoría:", error);
        const tbody = document.querySelector("#tabla-audit-logs tbody");
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 40px; color: #ef4444; font-weight: 600;">
                        ❌ Error de Infraestructura: Revisa las Reglas o la Consola.
                    </td>
                </tr>`;
        }
    }
}

function calcularMetricasDeAuditoria() {
    let totales = auditoriaGlobalMemory.length;
    let errores = 0;
    let logins = 0;
    let updates = 0;

    auditoriaGlobalMemory.forEach(log => {
        const crit = (log.criticidad || "INFO").toUpperCase();
        const acc = (log.accion || "").toUpperCase();

        if (crit === "ERROR" || crit === "CRITICAL") errores++;
        if (acc === "LOGIN" || acc === "AUTH") logins++;
        if (acc === "UPDATE" || acc === "MODIFICAR") updates++;
    });

    const uiTot = document.getElementById("audit-kpi-total"); if (uiTot) uiTot.innerText = totales;
    const uiErr = document.getElementById("audit-kpi-errores"); if (uiErr) uiErr.innerText = errores;
    const uiLog = document.getElementById("audit-kpi-logins"); if (uiLog) uiLog.innerText = logins;
    const uiUpd = document.getElementById("audit-kpi-updates"); if (uiUpd) uiUpd.innerText = updates;
}

function filtrarYRenderizarTablaLogs() {
    const txtBuscar = document.getElementById("audit-filter-search")?.value.toLowerCase().trim() || "";
    const modSelect = document.getElementById("audit-filter-modulo")?.value || "Todos";
    const critSelect = document.getElementById("audit-filter-criticidad")?.value || "Todos";

    let filtrados = auditoriaGlobalMemory.filter(log => {
        if (txtBuscar) {
            const usuario = (log.usuario || "").toLowerCase();
            const detalle = (log.detalle || "").toLowerCase();
            const entidadId = (log.entidadId || "").toLowerCase();
            if (!usuario.includes(txtBuscar) && !detalle.includes(txtBuscar) && !entidadId.includes(txtBuscar)) return false;
        }
        if (modSelect !== "Todos" && log.modulo !== modSelect) return false;
        if (critSelect !== "Todos" && log.criticidad !== critSelect) return false;

        return true;
    });

    inyectarFilasTablaAuditoria(filtrados);
}

function inyectarFilasTablaAuditoria(listaLogs) {
    const tbody = document.querySelector("#tabla-audit-logs tbody");
    if (!tbody) return;

    const inicio = (logsPaginaActual - 1) * logsPorPagina;
    const fin = inicio + logsPorPagina;
    const logsPaginados = listaLogs.slice(inicio, fin);

    let html = "";
    logsPaginados.forEach((log, index) => {
        let dateStr = "Sin fecha";
        if (log.timestamp) {
            const d = log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
            dateStr = d.toLocaleDateString('es-CL') + " " + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        }

        let badgeStyle = "background: #f1f5f9; color: #475569;";
        if (log.criticidad === "WARNING") badgeStyle = "background: #fffbeb; color: #d97706;";
        else if (log.criticidad === "ERROR") badgeStyle = "background: #fef2f2; color: #ef4444;";
        else if (log.criticidad === "CRITICAL") badgeStyle = "background: #7f1d1d; color: #ffffff;";
        else if (log.criticidad === "INFO") badgeStyle = "background: #f0fdf4; color: #16a34a;";

        html += `
            <tr class="audit-row-clickable" data-index="${inicio + index}" style="cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.15s;">
                <td style="padding: 12px 16px; white-space: nowrap; font-weight: 500;">${dateStr}</td>
                <td style="padding: 12px 16px;"><span style="font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px; ${badgeStyle}">${log.criticidad || 'INFO'}</span></td>
                <td style="padding: 12px 16px;"><span style="font-weight: 600; display: block; color: #0f172a;">${log.usuario || 'Sistema'}</span><span style="font-size: 11px; color: #64748b; font-family: monospace;">${log.ip || '127.0.0.1'}</span></td>
                <td style="padding: 12px 16px; font-weight: 600; text-transform: capitalize; color: #475569;">${log.modulo || 'Gral'}</td>
                <td style="padding: 12px 16px;"><span style="font-family: monospace; font-weight: 700; color: #0b438c; background: #eff6ff; padding: 2px 4px; border-radius: 4px;">${(log.accion || 'operacion').toUpperCase()}</span></td>
            </tr>
        `;
    });

    tbody.innerHTML = html || `<tr><td colspan="5" style="text-align: center; padding: 30px; color: #94a3b8;">No se encontraron registros de auditoría.</td></tr>`;

    tbody.querySelectorAll(".audit-row-clickable").forEach(tr => {
        tr.addEventListener("click", () => {
            tbody.querySelectorAll(".audit-row-clickable").forEach(r => r.style.background = "");
            tr.style.background = "#eff6ff";
            const idx = tr.getAttribute("data-index");
            desplegarDetallesLogInspector(listaLogs[idx]);
        });
    });

    renderizarPaginacionAuditoria(listaLogs);
}

function desplegarDetallesLogInspector(log) {
    document.getElementById("audit-pane-empty").style.display = "none";
    const content = document.getElementById("audit-pane-content");
    content.style.display = "flex";

    let dateStr = "--/--/---- --:--";
    if (log.timestamp) {
        const d = log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
        dateStr = d.toLocaleString('es-CL');
    }

    let badgeStyle = "background: #f1f5f9; color: #475569;";
    if (log.criticidad === "WARNING") badgeStyle = "background: #fffbeb; color: #d97706;";
    else if (log.criticidad === "ERROR") badgeStyle = "background: #fef2f2; color: #ef4444;";
    else if (log.criticidad === "CRITICAL") badgeStyle = "background: #7f1d1d; color: #ffffff;";
    else if (log.criticidad === "INFO") badgeStyle = "background: #f0fdf4; color: #16a34a;";

    document.getElementById("audit-det-id").innerText = log.id.substring(0, 10).toUpperCase();
    const badge = document.getElementById("audit-det-criticidad");
    badge.innerText = log.criticidad || "INFO";
    badge.style.cssText = badgeStyle + "font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px;";

    document.getElementById("audit-det-fecha").innerText = dateStr;
    document.getElementById("audit-det-usuario").innerText = log.usuario || "Sistema";
    document.getElementById("audit-det-modulo").innerText = log.modulo || "General";
    document.getElementById("audit-det-accion").innerText = log.accion || "Operación";
    document.getElementById("audit-det-entidad").innerText = log.entidadId || "N/A";
    document.getElementById("audit-det-ip").innerText = log.ip || "Desconocida";
    document.getElementById("audit-det-detalle").innerText = log.detalle || "Sin descripción.";
    document.getElementById("audit-det-antes").innerText = log.antes || "None";
    document.getElementById("audit-det-despues").innerText = log.despues || "None";
}

function renderizarPaginacionAuditoria(listaFiltrada) {
    const totalItems = listaFiltrada.length;
    const totalPages = Math.ceil(totalItems / logsPorPagina);
    const textLabel = document.getElementById("audit-pagination-text");
    const container = document.getElementById("audit-pagination-controls");
    if (!container || !textLabel) return;

    const inicioNum = totalItems === 0 ? 0 : (logsPaginaActual - 1) * logsPorPagina + 1;
    const finNum = Math.min(logsPaginaActual * logsPorPagina, totalItems);
    textLabel.innerText = `Mostrando ${inicioNum} a ${finNum} de ${totalItems} logs`;

    container.innerHTML = "";
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement("button");
        btn.innerText = i;
        btn.style.cssText = `border: 1px solid #cbd5e1; background: #fff; color: #0f172a; width: 28px; height: 28px; border-radius: 4px; cursor: pointer; font-size: 11.5px; font-weight: 600;`;
        if (i === logsPaginaActual) {
            btn.style.background = "#2563eb";
            btn.style.color = "white";
            btn.style.borderColor = "#2563eb";
        }
        btn.onclick = () => { logsPaginaActual = i; inyectarFilasTablaAuditoria(listaFiltrada); };
        container.appendChild(btn);
    }
}

function vincularEscuchadoresAuditoria() {
    document.getElementById("audit-filter-search")?.addEventListener("input", () => { logsPaginaActual = 1; filtrarYRenderizarTablaLogs(); });
    document.getElementById("audit-filter-modulo")?.addEventListener("change", () => { logsPaginaActual = 1; filtrarYRenderizarTablaLogs(); });
    document.getElementById("audit-filter-criticidad")?.addEventListener("change", () => { logsPaginaActual = 1; filtrarYRenderizarTablaLogs(); });

    document.getElementById("btn-audit-reset")?.addEventListener("click", () => {
        document.getElementById("audit-filter-search").value = "";
        document.getElementById("audit-filter-modulo").value = "Todos";
        document.getElementById("audit-filter-criticidad").value = "Todos";
        logsPaginaActual = 1;
        filtrarYRenderizarTablaLogs();
    });

    document.getElementById("btn-audit-export")?.addEventListener("click", ejecutarExportacionCSVAuditoria);
}

function ejecutarExportacionCSVAuditoria() {
    if (auditoriaGlobalMemory.length === 0) return;
    
    let csvContenido = "data:text/csv;charset=utf-8,";
    csvContenido += "ID,Fecha,Criticidad,Usuario,IP,Modulo,Accion,EntidadID,Detalle,Antes,Despues\n";

    auditoriaGlobalMemory.forEach(log => {
        let dateStr = "N/A";
        if (log.timestamp) {
            const d = log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
            dateStr = d.toISOString();
        }
        
        const limpiar = (txt) => `"${String(txt || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;

        let fila = [
            limpiar(log.id),
            limpiar(dateStr),
            limpiar(log.criticidad),
            limpiar(log.usuario),
            limpiar(log.ip),
            limpiar(log.modulo),
            limpiar(log.accion),
            limpiar(log.entidadId),
            limpiar(log.detalle),
            limpiar(log.antes),
            limpiar(log.despues)
        ];
        csvContenido += fila.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContenido);
    const linkDescarga = document.createElement("a");
    linkDescarga.setAttribute("href", encodedUri);
    linkDescarga.setAttribute("download", `AUDITORIA_SIGEV_${CURRENT_TENANT_ID.toUpperCase()}.csv`);
    document.body.appendChild(linkDescarga);
    linkDescarga.click();
    linkDescarga.remove();
}

function parsearFechaExcel(valor) {
    if (!valor) return "";
    const strVal = valor.toString().trim();
    
    if (!isNaN(strVal) && Number(strVal) > 10000) {
        const excelEpoch = new Date(1899, 11, 30);
        const msPorDia = 24 * 60 * 60 * 1000;
        const fechaJS = new Date(excelEpoch.getTime() + (Number(strVal) * msPorDia));
        
        const yyyy = fechaJS.getFullYear();
        const mm = String(fechaJS.getMonth() + 1).padStart(2, '0');
        const dd = String(fechaJS.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
    
    if (strVal.includes("/")) {
        const partes = strVal.split("/");
        if (partes.length === 3) {
            return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
        }
    }
    return strVal; 
}

// ============================================================================
// 🧽 MOTOR DE SANITIZACIÓN: LIMPIADOR INTELIGENTE DE NOMBRES Y TÍTULOS
// ============================================================================
function formatearNombreEstandar(textoRaw) {
    if (!textoRaw) return "";
    let nombreRaw = textoRaw.toString().trim().toLowerCase().replace(/\s+/g, ' '); 
    const conectores = ["de", "del", "la", "las", "los", "y"];
    return nombreRaw.split(' ').map((palabra, index) => {
        if (index > 0 && conectores.includes(palabra)) {
            return palabra; 
        }
        if (palabra.length === 0) return "";
        return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    }).join(' ');
}

function sanitizarFilaExcel(rowOriginal) {
    const row = {};
    Object.keys(rowOriginal).forEach(key => {
        row[key.trim().toLowerCase()] = String(rowOriginal[key]).trim();
    });

    const getVal = (keywords) => {
        for (let key of Object.keys(row)) {
            for (let kw of keywords) {
                if (key.includes(kw.toLowerCase())) return row[key];
            }
        }
        return "";
    };

    let rawRut = getVal(["rut", "run", "cédula", "cedula"]).replace(/[^0-9kK]/g, "").toUpperCase();
    let rutLimpio = "";
    if (rawRut.length > 1) {
        rutLimpio = rawRut.slice(0, -1) + "-" + rawRut.slice(-1);
    } else {
        rutLimpio = `S/R-${Math.floor(100000 + Math.random() * 900000)}`;
    }

    let nombreLimpio = formatearNombreEstandar(getVal(["nombre", "solicitante", "vecino"]));

    let fonoRaw = getVal(["teléfono", "telefono", "celular", "fono"]).replace(/\D/g, "");
    let fonoLimpio = "No registrado";
    if (fonoRaw.length >= 8) {
        let fono8 = fonoRaw.slice(-8); 
        fonoLimpio = `+56 9 ${fono8.substring(0,4)} ${fono8.substring(4)}`;
    }

    let dirPrin = getVal(["dirección", "direccion", "calle", "domicilio"]);
    let dirComp = getVal(["complementaria", "depto", "block", "casa", "piso"]);
    let dirTest = dirPrin.toLowerCase();
    let idHogarCalculado = "";

    if (dirTest === "" || dirTest === "no registrada" || dirTest === "s/r" || dirTest === "sin informacion") {
        const randomIso = Math.floor(10000 + Math.random() * 90000);
        idHogarCalculado = `HOG-IND-${rutLimpio}-${randomIso}`;
        dirPrin = "No registrada";
    } else {
        let baseString = `${dirPrin}-${dirComp}`;
        idHogarCalculado = "HOG-" + baseString.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
    }

    let sexoClean = getVal(["sexo", "género", "genero"]);
    if (!["Femenino", "Masculino", "Otro"].includes(sexoClean)) sexoClean = "No especificado";

    let tipoSolRaw = getVal(["tipo solicitante", "solicitante"]);
    let tipoOrgRaw = getVal(["tipo organización", "tipo organizacion"]).toLowerCase();
    let nomOrgRaw = getVal(["nombre organización", "nombre organizacion", "nombre org"]);
    let tipoOrgLimpio = "";

    if (tipoOrgRaw || nomOrgRaw) {
        let textoBusqueda = (tipoOrgRaw + " " + nomOrgRaw).toLowerCase();
        
        if (textoBusqueda.includes("jjvv") || textoBusqueda.includes("junta") || textoBusqueda.includes("vecinal")) {
            tipoOrgLimpio = "Junta de Vecinos";
        } else if (textoBusqueda.includes("seguridad") || textoBusqueda.includes("alarma")) {
            tipoOrgLimpio = "Comité de Seguridad";
        } else if (textoBusqueda.includes("vivienda") || textoBusqueda.includes("casa") || textoBusqueda.includes("allegados")) {
            tipoOrgLimpio = "Comité de Vivienda";
        } else if (textoBusqueda.includes("deportivo") || textoBusqueda.includes("club dep")) {
            tipoOrgLimpio = "Club Deportivo";
        } else if (textoBusqueda.includes("adulto mayor") || textoBusqueda.includes("abuelo") || textoBusqueda.includes("cam ") || textoBusqueda.includes("cam-")) {
            tipoOrgLimpio = "Club de Adulto Mayor";
        } else if (textoBusqueda.includes("cultural") || textoBusqueda.includes("arte") || textoBusqueda.includes("folclor")) {
            tipoOrgLimpio = "Centro Cultural";
        } else if (textoBusqueda.includes("padres") || textoBusqueda.includes("apoderados") || textoBusqueda.includes("cgpa")) {
            tipoOrgLimpio = "Centro de Padres";
        } else if (textoBusqueda.includes("scout")) {
            tipoOrgLimpio = "Grupo Scout";
        } else if (textoBusqueda.includes("animal") || textoBusqueda.includes("mascota") || textoBusqueda.includes("perro")) {
            tipoOrgLimpio = "Org. Animalista";
        } else if (textoBusqueda.includes("condominio") || textoBusqueda.includes("edificio") || textoBusqueda.includes("comunidad") || textoBusqueda.includes("copropiedad")) {
            tipoOrgLimpio = "Condominio Organizado";
        } else if (tipoOrgRaw !== "") {
            tipoOrgLimpio = "Otra";
        }
    }

    let tipoSolLimpio = tipoSolRaw;
    const tiposValidos = ["Vecino/a", "Organización Comunitaria", "Institución", "Empresa o Comercio", "Autoridad o Funcionario"];
    if (!tiposValidos.includes(tipoSolLimpio)) tipoSolLimpio = "Vecino/a";

    if ((tipoOrgLimpio !== "" || nomOrgRaw !== "") && tipoSolLimpio === "Vecino/a") {
        tipoSolLimpio = "Organización Comunitaria";
    }
    
    if (tipoSolLimpio !== "Organización Comunitaria") {
        tipoOrgLimpio = "";
        nomOrgRaw = "";
    }

    let sectorCalculado = getVal(["sector", "territorial"]);
    if (!sectorCalculado) {
        if (dirTest === "" || dirTest === "no registrada" || dirTest === "s/r" || dirTest === "sin informacion") {
            sectorCalculado = "Sin Información";
        } else {
            sectorCalculado = "Pendiente de Georreferenciación";
        }
    }

    return {
        rut: rutLimpio,
        nombreCompleto: nombreLimpio || "Sin Nombre Registrado",
        telefono: fonoLimpio,
        correo: getVal(["correo", "email", "e-mail"]),
        sexo: sexoClean,
        canalPreferencia: getVal(["canal", "preferencia"]) || "WhatsApp",
        
        direccion: dirPrin,
        direccionComplementaria: dirComp,
        idHogar: idHogarCalculado,
        
        sectorTerritorial: sectorCalculado,
        unidadVecinal: getVal(["unidad", "uv"]) || "Sin Información",
        juntaVecinos: getVal(["junta", "jjvv"]) || "Sin Información",
        barrioPopular: getVal(["barrio", "villa", "población"]) || "Sin Información",
        
        previsionSalud: getVal(["previsión", "prevision", "salud", "fonasa", "isapre"]) || "Ninguna-Particular",
        tramoLetraIsapre: getVal(["tramo", "letra"]).toUpperCase(),
        ocupacion: getVal(["ocupación", "ocupacion", "oficio", "profesión"]),
        observaciones: getVal(["observacion", "nota", "comentario", "detalle"]),
        
        tipoSolicitante: tipoSolLimpio,
        tipoOrganizacion: tipoOrgLimpio,
        nombreOrganizacion: nomOrgRaw,
        
        cantidadIntegrantes: parseInt(getVal(["cantidad", "integrantes"])) || 1,
        jefeHogar: getVal(["jefe", "jefatura"]).toUpperCase() === "SI",
        fechaNacimiento: parsearFechaExcel(getVal(["nacimiento", "fecha nac"])),
        
        lat: "", 
        lng: "",
        tenantId: CURRENT_TENANT_ID
    };
}

function inicializarModuloMigracionVecinos() {
    const btnDescargar = document.getElementById("btn-descargar-plantilla-vecinos");
    const inputFile = document.getElementById("cfg-excel-vecinos-file");
    const btnConfirmar = document.getElementById("btn-confirmar-migracion-vecinos");

    if (btnDescargar) {
        btnDescargar.addEventListener("click", () => {
            if (typeof XLSX === "undefined") return alert("Error: Librería Excel no cargada.");
            
            const encabezados = [
                "RUT", 
                "Nombre Completo", 
                "Telefono", 
                "Canal Preferencia",
                "Sexo",
                "Fecha Nacimiento", 
                "Correo", 
                "Direccion Principal", 
                "Direccion Complementaria",
                "Sector Territorial",
                "Unidad Vecinal",
                "Junta de Vecinos",
                "Barrio Popular",
                "Prevision Salud",
                "Tramo o Isapre",
                "Ocupacion",
                "Tipo Solicitante",
                "Tipo Organizacion",
                "Nombre Organizacion",
                "Cantidad Integrantes",
                "Jefe de Hogar",
                "Observaciones"
            ];

            const ejemplo = [
                "18.478.241-3", 
                "Franchesca Paz Paz", 
                "972489389", 
                "WhatsApp",
                "Femenino",
                "1992-08-13", 
                "franchescap.paz@gmail.com", 
                "Goycolea 405", 
                "Block B Depto 40",
                "Sector Territorial 3",
                "4",
                "Sin Información",
                "Sin Información",
                "FONASA",
                "B",
                "Arquitecta",
                "Organización Comunitaria",
                "Junta de Vecinos",
                "JJVV Las Camelias",
                "4",
                "SI",
                "Líder vecinal fundadora."
            ];

            const ws = XLSX.utils.aoa_to_sheet([encabezados, ejemplo]);
            
            const wscols = [
                {wch: 15}, {wch: 30}, {wch: 15}, {wch: 20}, {wch: 15}, 
                {wch: 20}, {wch: 25}, {wch: 35}, {wch: 25}, {wch: 25},
                {wch: 15}, {wch: 25}, {wch: 25}, {wch: 20}, {wch: 15},
                {wch: 25}, {wch: 25}, {wch: 25}, {wch: 30}, {wch: 20},
                {wch: 15}, {wch: 40}
            ];
            ws['!cols'] = wscols;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Vecinos");
            XLSX.writeFile(wb, "Plantilla_Migracion_Vecinos_SIGEV.xlsx");
        });
    }

    if (inputFile) {
        inputFile.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const tbody = document.getElementById("tbody-preview-vecinos");
            if (tbody) {
                document.getElementById("preview-migracion-vecinos").style.display = "block";
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#0b438c; font-weight:bold;">⏳ Buscando coincidencias en la base de datos...</td></tr>`;
            }

            // Descargamos padrón actual en tiempo real para la validación visual
            const qVecinosActuales = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID));
            const snapActuales = await getDocs(qVecinosActuales);
            const vecinosActuales = [];
            snapActuales.forEach(doc => { vecinosActuales.push({ id: doc.id, ...doc.data() }); });

            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const jsonRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                    
                    if (jsonRows.length === 0) {
                        alert("⚠️ El archivo Excel está vacío.");
                        return;
                    }

                    excelVecinosDataGlobal = jsonRows.map(row => {
                        let objLimpio = sanitizarFilaExcel(row);
                        
                        let vecinoExistente = null;
                        
                        if (objLimpio.rut && !objLimpio.rut.startsWith("S/R-")) {
                            vecinoExistente = vecinosActuales.find(v => v.rut === objLimpio.rut);
                        }

                        if (!vecinoExistente) {
                            const nombreNorm = objLimpio.nombreCompleto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim();
                            const fonoLimpio = (objLimpio.telefono || "").replace(/\D/g, "");
                            const dirLimpia = objLimpio.direccion !== "No registrada" && objLimpio.direccion !== "Sin Información" ? objLimpio.direccion.toLowerCase().trim() : "";

                            vecinoExistente = vecinosActuales.find(v => {
                                const vName = (v.nombreCompleto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim();
                                const vFono = (v.telefono || "").replace(/\D/g, "");
                                const vDir = v.direccion !== "No registrada" && v.direccion !== "Sin Información" ? (v.direccion || "").toLowerCase().trim() : "";

                                const matchName = (nombreNorm !== "" && nombreNorm !== "sin nombre registrado" && vName === nombreNorm);
                                const matchFono = (fonoLimpio.length >= 8 && vFono === fonoLimpio);
                                const matchDir = (dirLimpia !== "" && vDir === dirLimpia);

                                if (matchName && matchFono) return true;
                                if (matchName && matchDir) return true;
                                if (matchName && (v.rut || "").startsWith("S/R-")) return true;
                                
                                return false;
                            });
                        }

                        if (vecinoExistente) {
                            objLimpio.rut = vecinoExistente.rut; 
                            objLimpio.nombreCompleto = vecinoExistente.nombreCompleto; 
                            objLimpio.isMatched = true;
                        } else {
                            vecinosActuales.push(objLimpio);
                        }

                        return objLimpio;

                    }).filter(v => v.rut !== "" && v.nombreCompleto !== "Sin Nombre Registrado");
                    
                    renderizarPrevisualizacionVecinos(excelVecinosDataGlobal);
                    
                } catch (error) {
                    console.error("Error leyendo Excel:", error);
                    alert("Ocurrió un error al intentar leer el archivo Excel.");
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    if (btnConfirmar) {
        btnConfirmar.addEventListener("click", () => {
            if (excelVecinosDataGlobal.length === 0) return;
            
            mostrarModalConfirmacionMigracion(excelVecinosDataGlobal.length, CURRENT_TENANT_ID, async (btnLoading, modalOverlay) => {
                
                

                try {
                    const qVecinosActuales = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID));
                    const snapActuales = await getDocs(qVecinosActuales);
                    const vecinosActuales = [];
                    snapActuales.forEach(doc => { vecinosActuales.push({ id: doc.id, ...doc.data() }); });

                    const counterRef = doc(db, "counters_diarios", CURRENT_TENANT_ID);
                    const counterSnap = await getDoc(counterRef);
                    let currentCount = 0;
                    if (counterSnap.exists() && counterSnap.data().vecinosTotal) {
                        currentCount = counterSnap.data().vecinosTotal;
                    }

                    let batch = writeBatch(db);
                    let contadorBatch = 0;
                    let creados = 0;
                    let actualizados = 0;
                    let correlativoActual = currentCount; 
                    
                    let resumenOmitidos = [];
                    let unicosAfectadosSet = new Set();

                    for (let i = 0; i < excelVecinosDataGlobal.length; i++) {
                        btnLoading.innerText = `⏳ Inyectando: ${i + 1} de ${excelVecinosDataGlobal.length}...`;

                        const payloadLimpio = excelVecinosDataGlobal[i];
                        
                        let vecinoExistente = null;
                        
                        if (payloadLimpio.rut && !payloadLimpio.rut.startsWith("S/R-")) {
                            vecinoExistente = vecinosActuales.find(v => v.rut === payloadLimpio.rut);
                        }

                        if (!vecinoExistente) {
                            const nombreNorm = payloadLimpio.nombreCompleto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim();
                            const fonoLimpio = (payloadLimpio.telefono || "").replace(/\D/g, "");
                            const dirLimpia = payloadLimpio.direccion !== "No registrada" && payloadLimpio.direccion !== "Sin Información" ? payloadLimpio.direccion.toLowerCase().trim() : "";

                            vecinoExistente = vecinosActuales.find(v => {
                                const vName = (v.nombreCompleto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim();
                                const vFono = (v.telefono || "").replace(/\D/g, "");
                                const vDir = v.direccion !== "No registrada" && v.direccion !== "Sin Información" ? (v.direccion || "").toLowerCase().trim() : "";

                                const matchName = (nombreNorm !== "" && nombreNorm !== "sin nombre registrado" && vName === nombreNorm);
                                const matchFono = (fonoLimpio.length >= 8 && vFono === fonoLimpio);
                                const matchDir = (dirLimpia !== "" && vDir === dirLimpia);

                                if (matchName && matchFono) return true;
                                if (matchName && matchDir) return true;
                                if (matchName && (v.rut || "").startsWith("S/R-")) return true;
                                
                                return false;
                            });
                        }

                        if (vecinoExistente) {
                            const updateData = {};
                            
                            if (payloadLimpio.rut && !payloadLimpio.rut.startsWith("S/R-") && vecinoExistente.rut.startsWith("S/R-")) updateData.rut = payloadLimpio.rut;
                            if (payloadLimpio.telefono !== "No registrado") updateData.telefono = payloadLimpio.telefono;
                            if (payloadLimpio.correo !== "") updateData.correo = payloadLimpio.correo;
                            if (payloadLimpio.ocupacion !== "") updateData.ocupacion = payloadLimpio.ocupacion;
                            if (payloadLimpio.previsionSalud !== "Ninguna-Particular") updateData.previsionSalud = payloadLimpio.previsionSalud;
                            if (payloadLimpio.tramoLetraIsapre !== "") updateData.tramoLetraIsapre = payloadLimpio.tramoLetraIsapre;

                            if (payloadLimpio.direccion !== "No registrada" && vecinoExistente.direccion !== payloadLimpio.direccion) {
                                updateData.direccion = payloadLimpio.direccion;
                                updateData.direccionComplementaria = payloadLimpio.direccionComplementaria;
                                updateData.idHogar = payloadLimpio.idHogar;
                            }

                            if (Object.keys(updateData).length > 0) {
                                batch.update(doc(db, "vecinos", vecinoExistente.id), updateData);
                                actualizados++;
                                contadorBatch++;
                                unicosAfectadosSet.add(vecinoExistente.id);
                            } else {
                                resumenOmitidos.push(`Fila ${i + 2}: ${payloadLimpio.nombreCompleto || "S/N"} (RUT: ${payloadLimpio.rut}) - Registro ya existe sin datos nuevos`);
                            }

                        } else {
                            correlativoActual++;
                            payloadLimpio.correlativo = correlativoActual;
                            payloadLimpio.fechaRegistro = serverTimestamp();
                            payloadLimpio.fotoPerfil = "";

                            const docRef = doc(collection(db, "vecinos"));
                            batch.set(docRef, payloadLimpio);
                            
                            creados++;
                            contadorBatch++;
                            vecinosActuales.push({ id: docRef.id, ...payloadLimpio });
                            unicosAfectadosSet.add(docRef.id);
                        }

                        if (contadorBatch >= 400) {
                            await batch.commit();
                            batch = writeBatch(db);
                            contadorBatch = 0;
                        }
                    }

                    if (contadorBatch > 0) {
                        await batch.commit();
                    }

                    if (creados > 0) {
                        await setDoc(counterRef, { vecinosTotal: correlativoActual }, { merge: true });
                    }

                    document.getElementById("preview-migracion-vecinos").style.display = "none";
                    inputFile.value = "";
                    excelVecinosDataGlobal = [];

                    const msjExito = `🎉 ¡Carga Finalizada!<br>Se leyeron <b>${creados + actualizados + resumenOmitidos.length}</b> filas del archivo Excel, logrando consolidar <b>${unicosAfectadosSet.size} expedientes vecinales únicos</b> en la base de datos (fusionando las filas duplicadas internamente).`;
                    mostrarModalResumenMigracion(creados + actualizados, resumenOmitidos, [], msjExito);

                } catch (error) {
                    console.error("Error en migración Batch:", error);
                    alert("❌ ERROR DE ESCRITURA\nHubo un problema de conexión con Firestore. Revisa la consola técnica.");
                } finally {
                    if(modalOverlay) modalOverlay.remove();
                }
            });
        });
    }
}

function mostrarModalConfirmacionMigracion(cantidadFilas, tenant, onConfirm, titulo="Inyección Masiva al Padrón de Vecinos", desc="El motor aplicará el <b>Escudo Anti-Duplicados</b> y la fusión inteligente (Upsert) para agrupar núcleos familiares automáticamente.") {
    const overlay = document.createElement("div");
    overlay.className = "profile-modal-overlay open";
    overlay.style.display = "flex";
    overlay.style.zIndex = "2000";

    let segs = Math.ceil(cantidadFilas * 0.2); 
    if (segs < 5) segs = 5; 
    let tiempoEstimado = segs < 60 ? `Aprox. ${segs} segundos` : `Aprox. ${Math.floor(segs/60)} min y ${segs%60} seg`;

    overlay.innerHTML = `
        <div class="profile-modal-card" style="max-width: 500px; text-align: center; border-radius: 8px; overflow: hidden; background: #fff; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); font-family: system-ui, sans-serif;">
            <div class="profile-modal-header" style="background:#0f172a; padding: 20px;">
                <h3 style="color:#fff; margin:0; font-size: 18px; font-weight: 700;">${titulo}</h3>
            </div>
            <div class="profile-modal-body" style="padding: 32px 24px;">
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #065f46; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                    <p style="font-size: 32px; font-weight: 800; margin: 0; line-height: 1;">${cantidadFilas}</p>
                    <p style="font-size: 13px; font-weight: 600; margin: 4px 0 0 0;">Registros detectados y listos para integrarse al libro maestro</p>
                </div>
                
                <p style="font-size: 13.5px; color: #475569; margin-bottom: 16px; line-height: 1.5;">
                    ${desc}
                </p>

                <div style="background: #e0e7ff; border: 1px solid #c7d2fe; color: #3730a3; padding: 12px; border-radius: 8px; margin-bottom: 24px; font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    Tiempo estimado: <b>${tiempoEstimado}</b>
                </div>

                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button type="button" class="btn-cancelar-mig" style="flex: 1; padding: 10px 20px; border-radius: 6px; font-size: 13.5px; font-weight: 600; background: #ffffff; color: #475569; border: 1px solid #cbd5e1; cursor: pointer; outline:none;">Cancelar</button>
                    <button type="button" class="btn-ejecutar-mig" style="flex: 1; padding: 10px 20px; border-radius: 6px; font-size: 13.5px; font-weight: bold; background: #10b981; color: white; border: none; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2); outline:none;">Ejecutar Inyección</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    overlay.querySelector('.btn-cancelar-mig').onclick = () => overlay.remove();
    overlay.querySelector('.btn-ejecutar-mig').onclick = (e) => {
        const btn = e.target;
        btn.disabled = true;
        btn.style.background = "#e2e8f0";
        btn.style.color = "#475569";
        btn.style.boxShadow = "none";
        onConfirm(btn, overlay);
    };
}

function mostrarModalResumenMigracion(exitosos, omitidosArr, erroresArr, mensajePrincipal) {
    const overlay = document.createElement("div");
    overlay.className = "profile-modal-overlay open";
    overlay.style.display = "flex";
    overlay.style.zIndex = "999999";

    let omitidosCount = Array.isArray(omitidosArr) ? omitidosArr.length : (omitidosArr || 0);
    let erroresCount = Array.isArray(erroresArr) ? erroresArr.length : (erroresArr || 0);

    let mensajeErrores = "";
    if (erroresCount > 0) {
        mensajeErrores = `<div style="margin-top: 16px; padding: 12px; background: #fef2f2; border: 1px dashed #fca5a5; border-radius: 8px; color: #dc2626; font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            Atención: ${erroresCount} filas no se agregaron por errores de formato o red.
        </div>`;
    }

    overlay.innerHTML = `
        <div class="profile-modal-card" style="max-width: 480px; text-align: center; border-radius:16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; font-family: system-ui, sans-serif;">
            <div class="profile-modal-header" style="background:#10b981; padding:28px 24px 24px 24px;">
                <div style="width: 64px; height: 64px; background: #dcfce7; color: #059669; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <h3 style="color:#fff; margin:0; font-size:22px; font-weight:800; letter-spacing: -0.5px;">Operación Exitosa</h3>
            </div>
            <div class="profile-modal-body" style="padding: 32px 24px; text-align: center; background: #ffffff;">
                
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; color: #334155; padding: 20px; border-radius: 8px; font-size: 14px; line-height: 1.5; margin-bottom: 20px;">
                    ${mensajePrincipal}
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px;">
                        <div style="font-size: 20px; font-weight: 800; color: #16a34a;">${exitosos}</div>
                        <div style="font-size: 10px; font-weight: 800; color: #065f46; text-transform: uppercase;">Guardados</div>
                    </div>
                    <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 12px; border-radius: 8px;">
                        <div style="font-size: 20px; font-weight: 800; color: #d97706;">${omitidosCount}</div>
                        <div style="font-size: 10px; font-weight: 800; color: #92400e; text-transform: uppercase;">Omitidos</div>
                    </div>
                    <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 8px;">
                        <div style="font-size: 20px; font-weight: 800; color: #dc2626;">${erroresCount}</div>
                        <div style="font-size: 10px; font-weight: 800; color: #991b1b; text-transform: uppercase;">Errores</div>
                    </div>
                </div>
                
                ${mensajeErrores}

                <button class="btn btn-primary" style="width:100%; margin-top:24px; background:#0f172a; border:none; padding:14px; font-weight:bold; color:#fff; border-radius:8px; cursor:pointer; font-size: 14.5px; transition: background 0.2s; outline:none;" onmouseover="this.style.background='#1e293b'" onmouseout="this.style.background='#0f172a'" onclick="this.closest('.profile-modal-overlay').remove()">Entendido</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function renderizarPrevisualizacionVecinos(data) {
    document.getElementById("preview-count-vecinos").innerText = `Total filas detectadas: ${data.length}`;
    document.getElementById("preview-migracion-vecinos").style.display = "block";
    
    const tbody = document.getElementById("tbody-preview-vecinos");
    tbody.innerHTML = "";

    const previewData = data.slice(0, 5); 

    previewData.forEach(fila => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid #e2e8f0";
        
        let badgeRut = "";
        if (fila.isMatched) {
            badgeRut = `<br><span style="background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 800;">✓ ENCONTRADO EN PADRÓN</span>`;
        } else if (fila.rut.startsWith("S/R-")) {
            badgeRut = `<br><span style="background: #fef3c7; color: #d97706; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 800;">⚠️ NUEVO VECINO</span>`;
        }

        tr.innerHTML = `
            <td style="padding: 10px 12px; font-family: monospace; font-weight: 600;">${fila.rut || '--'} ${badgeRut}</td>
            <td style="padding: 10px 12px;">${fila.nombreCompleto || '--'}</td>
            <td style="padding: 10px 12px;">${fila.telefono || '--'}</td>
            <td style="padding: 10px 12px; color: #475569;">${fila.direccion || '--'}</td>
        `;
        tbody.appendChild(tr);
    });

    if (data.length > 5) {
        const rowGris = document.createElement("tr");
        rowGris.innerHTML = `<td colspan="4" style="text-align: center; padding: 12px; background: #f8fafc; color: #64748b; font-size: 11.5px; font-weight: 500;">...y ${data.length - 5} registros más listos para subirse.</td>`;
        tbody.appendChild(rowGris);
    }
}

// ==============================================================================
// 🚀 3. MÓDULO MIGRACIÓN EXCEL DE SOLICITUDES (TICKETS HISTÓRICOS A TRIAGE)
// ==============================================================================
function inicializarModuloMigracionSolicitudes() {
    const iptFile = document.getElementById("cfg-excel-solicitudes-file");
    const canvasPreview = document.getElementById("preview-migracion-solicitudes");
    const btnDescargar = document.getElementById("btn-descargar-plantilla-solicitudes");

    if (btnDescargar) {
        btnDescargar.addEventListener("click", () => {
            if (typeof XLSX === "undefined") return alert("Error: Librería Excel no cargada.");
            
            const encabezados = [
                "RUT Vecino (Ej: 18.XXX.XXX-X)", 
                "Nombre Vecino (Opcional)", 
                "Teléfono (Opcional)", 
                "Dirección Residencial (Opcional)", 
                "Fecha Ingreso Original (YYYY-MM-DD)", 
                "Motivo Principal (Ej: Poda, Subsidio)", 
                "Lo que solicita (Detalle Requerido)", 
                "Respuesta que se le dio (Opcional)"
            ];
            const ejemplo = [
                "12.345.678-9", 
                "Juan Pérez", 
                "+56 9 8765 4321", 
                "Gran Avenida 8585", 
                "2026-06-27", 
                "AYUDA SOCIAL", 
                "Vecino solicita apoyo urgente con medicamentos recetados por la Red de Salud.", 
                "Se gestiona subsidio directo y se hace entrega del set farmacológico en oficina."
            ];

            const ws = XLSX.utils.aoa_to_sheet([encabezados, ejemplo]);
            const wscols = [{wch: 25}, {wch: 25}, {wch: 20}, {wch: 30}, {wch: 30}, {wch: 30}, {wch: 50}, {wch: 50}];
            ws['!cols'] = wscols;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Historial Solicitudes");
            XLSX.writeFile(wb, "Plantilla_Migracion_Solicitudes_SIGEV.xlsx");
        });
    }

    if (!iptFile || !canvasPreview) return;

    iptFile.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const tbody = document.getElementById("tbody-preview-solicitudes");
        if (tbody) {
            canvasPreview.style.display = "block";
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px; color:#0b438c; font-weight:bold;">⏳ Buscando coincidencias en la base de datos...</td></tr>`;
        }

        // Descargamos padrón actual en tiempo real ANTES de generar la vista previa
        const qVecinosActuales = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID));
        const snapActuales = await getDocs(qVecinosActuales);
        const vecinosActuales = [];
        snapActuales.forEach(doc => { vecinosActuales.push({ id: doc.id, ...doc.data() }); });

        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonCrudo = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: "" });
                
                excelSolicitudesDataGlobal = jsonCrudo.map(rowOriginal => {
                    const row = {};
                    Object.keys(rowOriginal).forEach(key => {
                        row[key.trim().toLowerCase()] = String(rowOriginal[key]).trim();
                    });

                    const getVal = (keywords) => {
                        for (let key of Object.keys(row)) {
                            for (let kw of keywords) {
                                if (key.includes(kw.toLowerCase())) return row[key];
                            }
                        }
                        return "";
                    };

                    let rawRut = getVal(["rut", "run", "cédula"]).replace(/[^0-9kK]/g, "").toUpperCase();
                    let rutFinal = "";
                    let isMatched = false;
                    let nombreExcel = formatearNombreEstandar(getVal(["nombre", "solicitante", "vecino"])) || "Vecino Histórico";
                    let telefonoExcel = getVal(["teléfono", "telefono", "celular", "fono", "contacto"]);
                    
                    if (rawRut.length > 1) {
                        rutFinal = rawRut.slice(0, -1) + "-" + rawRut.slice(-1);
                    } else {
                        // 💡 CRUCE INTELIGENTE EN VIVO ANTES DE PREVIEW
                        const nombreNorm = nombreExcel.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim();
                        let fonoExcelLimpio = telefonoExcel.replace(/\D/g, "");

                        let vecinoMatch = vecinosActuales.find(v => {
                            const vName = (v.nombreCompleto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim();
                            const vFono = (v.telefono || "").replace(/\D/g, "");
                            
                            const matchName = (nombreNorm !== "" && nombreNorm !== "vecino historico") && (vName === nombreNorm || vName.includes(nombreNorm) || nombreNorm.includes(vName));
                            const matchFono = (fonoExcelLimpio !== "" && fonoExcelLimpio.length > 7) && (vFono === fonoExcelLimpio);

                            return matchName || matchFono;
                        });

                        if (vecinoMatch) {
                            rutFinal = vecinoMatch.rut;
                            nombreExcel = vecinoMatch.nombreCompleto;
                            isMatched = true;
                        } else {
                            rutFinal = "NO_ENCONTRADO";
                            isMatched = false;
                        }
                    }

                    return {
                        vecinoRut: rutFinal,
                        vecinoNombre: nombreExcel,
                        vecinoTelefono: telefonoExcel,
                        vecinoDireccion: getVal(["dirección", "direccion", "domicilio", "calle"]),
                        fechaCreacionOld: parsearFechaExcel(getVal(["fecha", "ingreso"])),
                        categoriaOriginal: getVal(["motivo", "categoría", "categoria", "clasificación", "asunto"]) || "Sin Categoría",
                        descripcionCorta: getVal(["solicita", "detalle", "descripción", "descripcion", "problema"]),
                        respuestaHistorica: getVal(["respuesta", "resolución", "resolucion"]),
                        isMatched: isMatched
                    };
                }).filter(v => v.descripcionCorta.trim() !== ""); 

                renderizarPrevisualizacionSolicitudes(excelSolicitudesDataGlobal);
            } catch (error) {
                console.error("Error al procesar el Excel de solicitudes:", error);
                alert("Ocurrió un error al intentar leer el archivo Excel.");
            }
        };
        reader.readAsArrayBuffer(file);
    });

    document.getElementById("btn-confirmar-migracion-solicitudes")?.addEventListener("click", mostrarModalConfirmacionSolicitudes);
}

function renderizarPrevisualizacionSolicitudes(data) {
    const btnProcesar = document.getElementById("btn-confirmar-migracion-solicitudes");
    const tbody = document.getElementById("tbody-preview-solicitudes");
    
    if (!tbody) return;
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:30px; color:#ef4444; font-weight:600;">⚠️ El archivo Excel no contiene la estructura requerida o las columnas están vacías.</td></tr>`;
        if (btnProcesar) btnProcesar.style.display = "none";
        return;
    }

    document.getElementById("preview-count-solicitudes").innerText = `Total filas detectadas: ${data.length}`;
    if (btnProcesar) btnProcesar.style.display = "inline-flex";

    tbody.innerHTML = "";
    const previewData = data.slice(0, 5);
    
    previewData.forEach(v => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid #e2e8f0";
        
        let eCol = "#475569"; let eBg = "#f1f5f9";
        const tieneRespuesta = v.respuestaHistorica && v.respuestaHistorica !== "";
        
        if (tieneRespuesta) { 
            eCol = "#16a34a"; eBg = "#d1fae5"; 
        } else { 
            eCol = "#d97706"; eBg = "#fef3c7"; 
        }

        let badgeRut = "";
        if (v.isMatched) {
            badgeRut = `<br><span style="background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 800;">✓ ENCONTRADO EN PADRÓN</span>`;
        } else if (!v.vecinoRut) {
            badgeRut = `<br><span style="background: #fef3c7; color: #d97706; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 800;">⚠️ NUEVO VECINO</span>`;
        }

        tr.innerHTML = `
            <td style="padding: 10px 12px; font-weight: 600;">${v.vecinoRut || 'S/R-AUTO'} ${badgeRut}<br><small style="color:#64748b;">${v.vecinoNombre}</small></td>
            <td style="padding: 10px 12px; color: #475569;">${v.fechaCreacionOld ? v.fechaCreacionOld.substring(0,10) : 'Hoy'}</td>
            <td style="padding: 10px 12px; color: #0f172a;">
                <b>[${v.categoriaOriginal}]</b> ${v.descripcionCorta}
                <br>
                <span style="background:${eBg}; color:${eCol}; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; margin-top:4px; display:inline-block;">
                    ${tieneRespuesta ? '✓ RESUELTO CON HISTORIAL' : '⏳ COMPILADO COMO PENDIENTE'}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (data.length > 5) {
        const rowGris = document.createElement("tr");
        rowGris.innerHTML = `<td colspan="3" style="text-align: center; padding: 12px; background: #f8fafc; color: #64748b; font-size: 11.5px; font-weight: 500;">... y ${data.length - 5} registros más listos para subirse a la nube.</td>`;
        tbody.appendChild(rowGris);
    }
}

function mostrarModalConfirmacionSolicitudes() {
    if (excelSolicitudesDataGlobal.length === 0) return;

    mostrarModalConfirmacionMigracion(
        excelSolicitudesDataGlobal.length,
        CURRENT_TENANT_ID,
        async (btnLoading, modalOverlay) => {
            let inyectados = 0; let omitidosLista = []; let erroresLista = [];
            const colRef = collection(db, "solicitudes");
            let uniqueVecinosSet = new Set();

            btnLoading.innerText = "⏳ Leyendo Padrón de Vecinos...";
            
            const qVecinosActuales = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID));
            const snapActuales = await getDocs(qVecinosActuales);
            const vecinosActuales = [];
            snapActuales.forEach(doc => { vecinosActuales.push({ id: doc.id, ...doc.data() }); });

            for (let i = 0; i < excelSolicitudesDataGlobal.length; i++) {
                btnLoading.innerText = `⏳ Inyectando: ${i + 1} de ${excelSolicitudesDataGlobal.length}...`;
                
                const tk = excelSolicitudesDataGlobal[i];
                
                try {
                    let rutDefinitivo = tk.vecinoRut;
                    let idVecinoDefinitivo = "SIN_EXPEDIENTE_VINCULADO";

                    // 1. Limpieza y estandarización del Excel
                    const nombreExcelGuardado = formatearNombreEstandar(tk.vecinoNombre);

                    // 2. Normalización profunda para comparación difusa
                    const nombreNorm = nombreExcelGuardado.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim();
                    const fonoLimpio = (tk.vecinoTelefono || "").replace(/\D/g, "");
                    const dirExcelLimpia = (tk.vecinoDireccion || "").toLowerCase().trim();

                    let vecinoMatch = null;

                    // 3. Primer filtro: Búsqueda exacta por RUT
                    if (rutDefinitivo && !rutDefinitivo.startsWith("S/R-")) {
                        vecinoMatch = vecinosActuales.find(v => v.rut === rutDefinitivo);
                    }

                    // 4. Segundo filtro: Búsqueda Difusa
                    if (!vecinoMatch && nombreNorm !== "" && nombreNorm !== "vecino historico") {
                        vecinoMatch = vecinosActuales.find(v => {
                            const vName = (v.nombreCompleto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim();
                            const vFono = (v.telefono || "").replace(/\D/g, "");
                            const vDir = v.direccion !== "No registrada" && v.direccion !== "Sin Información" ? (v.direccion || "").toLowerCase().trim() : "";

                            const matchName = (vName === nombreNorm);
                            const matchFono = (fonoLimpio.length >= 8) && (vFono === fonoLimpio);
                            const matchDir = (dirExcelLimpia !== "" && vDir === dirExcelLimpia);

                            if (matchName && matchFono) return true;
                            if (matchName && matchDir) return true;
                            if (matchName) return true;

                            return false;
                        });
                    }

                    // 5. Resolución de la vinculación (Escudo Anti-Basura)
                    let nEstado = "Resuelto";
                    let nGestion = "Finalizada (Carga Histórica Nube)";
                    let nDepartamento = "Pendiente de Triage";

                    if (vecinoMatch) {
                        rutDefinitivo = vecinoMatch.rut;
                        idVecinoDefinitivo = vecinoMatch.id || "SIN_EXPEDIENTE_VINCULADO";
                        tk.vecinoNombre = vecinoMatch.nombreCompleto;

                        if (!tk.respuestaHistorica || tk.respuestaHistorica.trim() === "") {
                            nEstado = "Clasificado";
                            nGestion = "En gestión (Heredado Antiguo)";
                        }
                    } else {
                        rutDefinitivo = "S/R-HISTORICO";
                        idVecinoDefinitivo = "SIN_EXPEDIENTE_VINCULADO";
                        tk.vecinoNombre = nombreExcelGuardado;
                        nEstado = "Nuevo";
                        nGestion = "Sin Match - A Revisión";
                        nDepartamento = "Pendiente de Triage";
                    }

                    // 6. Nuevo Escudo Anti-Duplicados blindado por vecino
                    const qCheck = query(colRef, where("tenantId", "==", CURRENT_TENANT_ID), where("motivo", "==", tk.categoriaOriginal));
                    const checkSnap = await getDocs(qCheck);
                    
                    let esDuplicado = false;
                    checkSnap.forEach(docSnap => {
                        const dbData = docSnap.data();
                        
                        const esMismoVecino = (dbData.idVecino === idVecinoDefinitivo || dbData.vecinoRut === rutDefinitivo);
                        
                        if (esMismoVecino && dbData.descripcion === tk.descripcionCorta) {
                            const dbResp = dbData.respuestaVecino || dbData.detalleInternoResolucion || "";
                            if (!tk.respuestaHistorica || dbResp === tk.respuestaHistorica) {
                                esDuplicado = true;
                            }
                        }
                    });

                    if (esDuplicado) {
                        omitidosLista.push(`Fila ${i + 2}: Ticket duplicado exacto (${tk.categoriaOriginal}) para RUT ${rutDefinitivo}`);
                        continue;
                    }

                    await addDoc(colRef, {
                        tenantId: CURRENT_TENANT_ID,
                        idVecino: idVecinoDefinitivo,
                        origen: "Migración Histórica XLS",
                        codigo: `HIST-${Date.now().toString().slice(-4)}-${i}`,
                        departamento: nDepartamento,
                        motivo: tk.categoriaOriginal,
                        descripcion: tk.descripcionCorta,
                        respuestaVecino: tk.respuestaHistorica,
                        detalleInternoResolucion: tk.respuestaHistorica,
                        estado: nEstado,
                        estadoGestion: nGestion,
                        vecinoNombre: tk.vecinoNombre,
                        vecinoRut: rutDefinitivo,
                        vecinoTelefono: tk.vecinoTelefono,
                        vecinoDireccion: tk.vecinoDireccion,
                        fechaCreacionObj: tk.fechaCreacionOld || new Date().toISOString(),
                        fechaRegistro: serverTimestamp(),
                        historicoCerrado: true 
                    });
                    
                    if (rutDefinitivo && !rutDefinitivo.startsWith("S/R-")) {
                        uniqueVecinosSet.add(rutDefinitivo);
                    } else if (rutDefinitivo && rutDefinitivo.startsWith("S/R-")) {
                        uniqueVecinosSet.add(idVecinoDefinitivo);
                    }
                    inyectados++;

                } catch (err) {
                    console.error("Fallo al inyectar ticket histórico:", err);
                    erroresLista.push(`Fila ${i + 2}: Fallo al inyectar el ticket en la base de datos.`);
                }
            }

            if(modalOverlay) modalOverlay.remove();
            
            const msjExito = `Se lograron insertar <b>${inyectados}</b> tickets históricos nuevos, los cuales se enlazaron exitosamente a <b>${uniqueVecinosSet.size}</b> vecinos únicos en la base de datos.`;
            mostrarModalResumenMigracion(inyectados, omitidosLista, erroresLista, msjExito);
            
            excelSolicitudesDataGlobal = [];
            document.getElementById("preview-migracion-solicitudes").innerHTML = "";
            document.getElementById("cfg-excel-solicitudes-file").value = "";
        },
        "Inyección de Base Histórica de Solicitudes",
        "El motor <b>validará duplicados</b> revisando que no exista ya un ticket con el mismo <b>Motivo</b>, <b>Detalle</b> y <b>Respuesta</b> para el <b>mismo vecino</b>. Los duplicados serán omitidos."
    );
}

// ============================================================================
// MOTOR DE ADMINISTRACIÓN DE TRIAGE DINÁMICO (V2 - INTERACTIVO Y AUTOMATIZADO)
// ============================================================================
const DEFAULT_TRIAGE_MAP = {
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

function renderizarConstructorTriage(mapaBase) {
    const container = document.getElementById("triage-builder-container");
    if (!container) return;
    container.innerHTML = "";

    const mapa = (mapaBase && Object.keys(mapaBase).length > 0) ? mapaBase : DEFAULT_TRIAGE_MAP;

    Object.keys(mapa).forEach(catName => {
        agregarTarjetaTriageDOM(catName, mapa[catName]);
    });

    const btnAdd = document.getElementById("btn-add-triage-cat");
    if (btnAdd) {
        btnAdd.replaceWith(btnAdd.cloneNode(true));
        document.getElementById("btn-add-triage-cat").addEventListener("click", () => {
            agregarTarjetaTriageDOM("", { depName: "", depCod: "", catCod: "", subs: {} }, true);
        });
    }
}

function agregarTarjetaTriageDOM(catName, data, prepend = false) {
    const container = document.getElementById("triage-builder-container");
    if (!container) return;

    const div = document.createElement("div");
    div.className = "triage-card";
    div.style.cssText = "border: 1px solid #cbd5e1; border-left: 4px solid #0b438c; border-radius: 8px; padding: 20px; background: #f8fafc; position: relative;";
    
    let subsHtml = "";
    if (data.subs) {
        Object.keys(data.subs).forEach(subName => {
            subsHtml += `
            <div class="subcat-row" style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
                <input type="text" class="t-sub-name" value="${subName}" placeholder="Ej: Mantención plaza" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:4px; font-size:12.5px; outline:none;">
                <input type="text" class="t-sub-cod" value="${data.subs[subName]}" readonly tabindex="-1" style="width:60px; padding:8px; border:1px dashed #cbd5e1; border-radius:4px; font-size:12.5px; background:#e2e8f0; color:#64748b; font-family:monospace; text-align:center; cursor:not-allowed;" title="Código autogenerado">
                <button type="button" class="btn-del-sub" title="Eliminar opción" style="background:#fee2e2; color:#ef4444; border:1px solid #fca5a5; border-radius:4px; width:30px; height:30px; cursor:pointer; display:flex; align-items:center; justify-content:center;">&times;</button>
            </div>
            `;
        });
    }

    div.innerHTML = `
        <button type="button" class="btn-del-triage" title="Eliminar Categoría Completa" style="position: absolute; top: 20px; right: 20px; background: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; width: 30px; height: 30px; border-radius: 6px; cursor: pointer; font-weight: bold; display:flex; align-items:center; justify-content:center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr 180px; gap: 16px; margin-bottom: 16px; padding-right: 48px;">
            <div>
                <label style="font-size: 11px; font-weight: 800; color: #0f172a; text-transform: uppercase;">Nombre Categoría (Pública)</label>
                <input type="text" class="t-cat-name" value="${catName}" placeholder="Ej: SEGURIDAD" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; font-weight: 700; color: #0b438c; outline:none; background: #fff;">
            </div>
            <div>
                <label style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Departamento Derivado</label>
                <input type="text" class="t-dep-name" value="${data.depName || ''}" placeholder="Ej: DIRECCIÓN DE SEGURIDAD" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; outline:none; background: #fff;">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div>
                    <label style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Cód. Depto</label>
                    <input type="text" class="t-dep-cod" value="${data.depCod || ''}" placeholder="AUTO" readonly tabindex="-1" style="width: 100%; padding: 10px; border: 1px dashed #cbd5e1; border-radius: 6px; font-size: 13.5px; font-family: monospace; text-transform: uppercase; outline:none; background: #e2e8f0; color:#64748b; text-align:center; cursor:not-allowed;">
                </div>
                <div>
                    <label style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Cód. Cat.</label>
                    <input type="text" class="t-cat-cod" value="${data.catCod || ''}" placeholder="AUTO" readonly tabindex="-1" style="width: 100%; padding: 10px; border: 1px dashed #cbd5e1; border-radius: 6px; font-size: 13.5px; font-family: monospace; text-transform: uppercase; outline:none; background: #e2e8f0; color:#64748b; text-align:center; cursor:not-allowed;">
                </div>
            </div>
        </div>
        
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <label style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin:0;">Subcategorías Operativas</label>
                <button type="button" class="btn-add-sub" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; font-size:11px; font-weight:700; padding:4px 10px; border-radius:4px; cursor:pointer;">+ Añadir Opción</button>
            </div>
            <div class="subs-container">
                ${subsHtml}
            </div>
            ${!subsHtml ? '<div class="no-subs-msg" style="font-size:12px; color:#94a3b8; text-align:center; padding:10px;">No hay opciones creadas.</div>' : ''}
        </div>
    `;

    const generarCodigo = (texto) => {
        if (!texto) return "";
        let limpio = texto.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z]/g, '');
        if (limpio.length < 3) return limpio.padEnd(3, 'X');
        return limpio.substring(0,3);
    };

    const inputCatName = div.querySelector(".t-cat-name");
    const inputCatCod = div.querySelector(".t-cat-cod");
    inputCatName.addEventListener("input", (e) => {
        if (!data.catCod) inputCatCod.value = generarCodigo(e.target.value);
    });

    const inputDepName = div.querySelector(".t-dep-name");
    const inputDepCod = div.querySelector(".t-dep-cod");
    inputDepName.addEventListener("input", (e) => {
        if (!data.depCod) inputDepCod.value = generarCodigo(e.target.value);
    });

    const subsContainer = div.querySelector(".subs-container");
    const btnAddSub = div.querySelector(".btn-add-sub");
    
    const bindSubEvents = (row) => {
        const iName = row.querySelector(".t-sub-name");
        const iCod = row.querySelector(".t-sub-cod");
        const btnDel = row.querySelector(".btn-del-sub");
        
        iName.addEventListener("input", (e) => {
            iCod.value = generarCodigo(e.target.value);
        });
        
        btnDel.addEventListener("click", () => {
            row.remove();
            if(subsContainer.children.length === 0) {
                const msg = document.createElement("div");
                msg.className = "no-subs-msg";
                msg.style.cssText = "font-size:12px; color:#94a3b8; text-align:center; padding:10px;";
                msg.innerText = "No hay opciones creadas.";
                subsContainer.appendChild(msg);
            }
        });
    };

    subsContainer.querySelectorAll(".subcat-row").forEach(bindSubEvents);

    btnAddSub.addEventListener("click", () => {
        const msg = subsContainer.querySelector(".no-subs-msg");
        if(msg) msg.remove();

        const row = document.createElement("div");
        row.className = "subcat-row";
        row.style.cssText = "display:flex; gap:8px; margin-bottom:8px; align-items:center; animation: fadeIn 0.3s ease;";
        row.innerHTML = `
            <input type="text" class="t-sub-name" value="" placeholder="Ej: Nueva opción..." style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:4px; font-size:12.5px; outline:none;">
            <input type="text" class="t-sub-cod" value="" readonly tabindex="-1" style="width:60px; padding:8px; border:1px dashed #cbd5e1; border-radius:4px; font-size:12.5px; background:#e2e8f0; color:#64748b; font-family:monospace; text-align:center; cursor:not-allowed;" title="Código autogenerado">
            <button type="button" class="btn-del-sub" title="Eliminar opción" style="background:#fee2e2; color:#ef4444; border:1px solid #fca5a5; border-radius:4px; width:30px; height:30px; cursor:pointer; display:flex; align-items:center; justify-content:center;">&times;</button>
        `;
        subsContainer.appendChild(row);
        bindSubEvents(row);
        row.querySelector(".t-sub-name").focus();
    });

    div.querySelector(".btn-del-triage").onclick = () => {
        if(confirm("¿Seguro que deseas eliminar esta categoría completa del flujo?")) div.remove();
    };

    if (prepend) { container.insertBefore(div, container.firstChild); } 
    else { container.appendChild(div); }
}

function recolectarMapaTriageUI() {
    const nuevoMapa = {};
    const cards = document.querySelectorAll(".triage-card");
    
    cards.forEach(card => {
        const catName = card.querySelector(".t-cat-name").value.trim().toUpperCase();
        if (!catName) return;

        const depName = card.querySelector(".t-dep-name").value.trim().toUpperCase();
        const depCod = card.querySelector(".t-dep-cod").value.trim().toUpperCase().substring(0,3) || catName.substring(0,3);
        const catCod = card.querySelector(".t-cat-cod").value.trim().toUpperCase().substring(0,3) || catName.substring(0,3);

        const subsObj = {};
        const subRows = card.querySelectorAll(".subcat-row");
        subRows.forEach(row => {
            const sName = row.querySelector(".t-sub-name").value.trim();
            const sCod = row.querySelector(".t-sub-cod").value.trim().toUpperCase().substring(0,3);
            if (sName) {
                subsObj[sName] = sCod || sName.substring(0,3).toUpperCase();
            }
        });

        nuevoMapa[catName] = {
            depName: depName,
            depCod: depCod,
            catCod: catCod,
            subs: subsObj
        };
    });
    return nuevoMapa;
}

window.addEventListener('error', async (event) => {
    if (event.message.includes("Firestore") || event.message.includes("Firebase")) return;

    try {
        const logsRef = collection(db, "logs");
        await addDoc(logsRef, {
            tenant: CURRENT_TENANT_ID,
            usuario: auth.currentUser?.email || "Usuario Anónimo",
            modulo: "ERROR_SISTEMA_CRITICO",
            accion: "❌ Exception_Dropped",
            documentoId: "Falla de Código Local",
            detalles: `Mensaje: ${event.message}<br>Archivo: ${event.filename}<br>Línea: ${event.lineno}:${event.colno}<br>Stack: ${event.error?.stack || "No disponible"}`,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Fallo crítico al reportar el error en la nube:", e);
    }
});

window.addEventListener('unhandledrejection', async (event) => {
    try {
        const logsRef = collection(db, "logs");
        await addDoc(logsRef, {
            tenant: CURRENT_TENANT_ID,
            usuario: auth.currentUser?.email || "Usuario Anónimo",
            modulo: "ERROR_RED_PROMESAS",
            accion: "⚠️ Promise_Rejected",
            documentoId: "Falla de Conexión / Async",
            detalles: `Motivo del rechazo: ${event.reason?.message || event.reason || "Desconocido"}<br>Stack: ${event.reason?.stack || "No disponible"}`,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Fallo crítico al reportar rechazo asíncrono:", e);
    }
});