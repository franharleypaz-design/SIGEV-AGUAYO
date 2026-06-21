// ==============================================================================
// SIGEV-AGUAYO - MOTOR CENTRALIZADOR DE CONFIGURACIÓN PARAMÉTRICA (CONECTOR V20)
// ==============================================================================
import { auth, db, app } from "./app.js";
import { doc, getDoc, setDoc, collection, getDocs, query, where, orderBy, limit, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { actualizarPerfilLayout } from "./layout.js";

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
        // 🚀 INICIALIZAR MÓDULO SOLICITUDES
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

        } else {
            if (document.getElementById("cfg-reloj-estilo")) document.getElementById("cfg-reloj-estilo").value = "1";
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

function inicializarModuloMigracionVecinos() {
    const btnDescargar = document.getElementById("btn-descargar-plantilla-vecinos");
    const inputFile = document.getElementById("cfg-excel-vecinos-file");
    const btnConfirmar = document.getElementById("btn-confirmar-migracion-vecinos");

    if (btnDescargar) {
        btnDescargar.addEventListener("click", () => {
            if (typeof XLSX === "undefined") return alert("Error: Librería Excel no cargada.");
            
            const encabezados = [
                "RUT (Ej: 18.478.241-3)", 
                "Nombre Completo", 
                "Teléfono (Ej: +56 9 12345678)", 
                "Canal Preferido (WhatsApp / Llamada / Correo)",
                "Sexo (Femenino / Masculino / Otro)",
                "Fecha Nacimiento (YYYY-MM-DD)", 
                "Correo Electrónico", 
                "Dirección", 
                "Ocupación", 
                "Observaciones"
            ];

            const ejemplo = [
                "18.478.241-3", 
                "Franchesca Paz Paz", 
                "+56 9 72489389", 
                "WhatsApp",
                "Femenino",
                "1992-08-13", 
                "franchescap.paz@gmail.com", 
                "Lima 8677", 
                "Independiente", 
                "Líder vecinal."
            ];

            const ws = XLSX.utils.aoa_to_sheet([encabezados, ejemplo]);
            
            const wscols = [
                {wch: 20}, {wch: 30}, {wch: 25}, {wch: 40}, {wch: 30}, 
                {wch: 25}, {wch: 30}, {wch: 40}, {wch: 20}, {wch: 45}
            ];
            ws['!cols'] = wscols;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Vecinos");
            XLSX.writeFile(wb, "Plantilla_Migracion_Vecinos_SIGEV.xlsx");
        });
    }

    if (inputFile) {
        inputFile.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;

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

                    excelVecinosDataGlobal = jsonRows;
                    renderizarPrevisualizacionVecinos(jsonRows);
                    
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
            
            mostrarModalConfirmacionMigracion(excelVecinosDataGlobal.length, CURRENT_TENANT_ID, async () => {
                
                btnConfirmar.disabled = true;
                btnConfirmar.innerText = "⏳ Analizando Padrón Existente...";

                try {
                    const padronRegistrado = new Set();
                    const qVecinosActuales = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID));
                    const snapActuales = await getDocs(qVecinosActuales);
                    snapActuales.forEach(doc => {
                        const data = doc.data();
                        if (data.rut) {
                            padronRegistrado.add(data.rut.replace(/[^0-9kK]/g, '').toUpperCase());
                        }
                    });

                    btnConfirmar.innerText = "⏳ Procesando Lotes y Asignando IDs...";

                    const counterRef = doc(db, "counters_diarios", CURRENT_TENANT_ID);
                    const counterSnap = await getDoc(counterRef);
                    let currentCount = 0;
                    if (counterSnap.exists() && counterSnap.data().vecinosTotal) {
                        currentCount = counterSnap.data().vecinosTotal;
                    }

                    let batch = writeBatch(db);
                    let contadorBatch = 0;
                    let totalGuardados = 0;
                    let correlativoActual = currentCount + 1; 
                    
                    let resumenOmitidos = [];

                    for (const vecino of excelVecinosDataGlobal) {
                        const rutBruto = vecino["RUT (Ej: 18.478.241-3)"] || vecino["RUT"] || "";
                        const nombreVecino = (vecino["Nombre Completo"] || "Vecino Sin Nombre").toString().trim();
                        const rutLimpio = rutBruto.toString().replace(/[^0-9kK]/g, '').toUpperCase();
                        
                        if (!rutLimpio) continue; 

                        if (padronRegistrado.has(rutLimpio)) {
                            resumenOmitidos.push({ rut: rutBruto, nombre: nombreVecino });
                            continue; 
                        }

                        padronRegistrado.add(rutLimpio);
                        
                        let dv = rutLimpio.slice(-1);
                        let cuerpo = rutLimpio.slice(0, -1);
                        let rutFormateado = cuerpo + "-" + dv;

                        const fechaNacimientoProcesada = parsearFechaExcel(vecino["Fecha Nacimiento (YYYY-MM-DD)"]);

                        const docRef = doc(collection(db, "vecinos"));
                        
                        batch.set(docRef, {
                            tenantId: CURRENT_TENANT_ID,
                            concejalId: concejalActivoData.id || `ID_CONCEJAL_${CURRENT_TENANT_ID.toUpperCase()}`,
                            rut: rutFormateado,
                            nombreCompleto: nombreVecino,
                            telefono: (vecino["Teléfono (Ej: +56 9 12345678)"] || vecino["Telefono"] || "No registrado").toString().trim(),
                            canalPreferencia: (vecino["Canal Preferido (WhatsApp / Llamada / Correo)"] || "WhatsApp").toString().trim(),
                            sexo: (vecino["Sexo (Femenino / Masculino / Otro)"] || "No especificado").toString().trim(),
                            fechaNacimiento: fechaNacimientoProcesada,
                            correo: (vecino["Correo Electrónico"] || vecino["Correo"] || "").toString().trim(),
                            direccion: (vecino["Dirección"] || vecino["Direccion"] || "No registrada").toString().trim(),
                            lat: "",
                            lng: "",
                            sectorTerritorial: "Pendiente de Georreferenciación",
                            unidadVecinal: "Sin Información",
                            juntaVecinos: "Sin Información",
                            barrioPopular: "Sin Información",
                            ocupacion: (vecino["Ocupación"] || "").toString().trim(),
                            observaciones: (vecino["Observaciones"] || "").toString().trim(),
                            fechaRegistro: serverTimestamp(),
                            etiquetas: ["migracion_excel"],
                            correlativo: correlativoActual
                        });

                        correlativoActual++;
                        contadorBatch++;
                        totalGuardados++;

                        if (contadorBatch >= 480) {
                            await batch.commit();
                            batch = writeBatch(db);
                            contadorBatch = 0;
                        }
                    }

                    if (totalGuardados > 0) {
                        batch.set(counterRef, { vecinosTotal: currentCount + totalGuardados }, { merge: true });
                        await batch.commit();
                    }

                    document.getElementById("preview-migracion-vecinos").style.display = "none";
                    inputFile.value = "";
                    excelVecinosDataGlobal = [];

                    mostrarModalResumenMigracion(totalGuardados, resumenOmitidos);

                } catch (error) {
                    console.error("Error en migración Batch:", error);
                    alert("❌ ERROR DE ESCRITURA\nHubo un problema de conexión con Firestore. Revisa la consola técnica.");
                } finally {
                    btnConfirmar.disabled = false;
                    btnConfirmar.innerText = "🚀 Iniciar Migración a la Nube";
                }
            });
        });
    }
}

function mostrarModalConfirmacionMigracion(cantidadFilas, tenant, onConfirm) {
    const overlay = document.createElement("div");
    overlay.className = "profile-modal-overlay";
    overlay.style.zIndex = "2000";

    overlay.innerHTML = `
        <div class="profile-modal-card" style="max-width: 450px; width: 90%; padding: 30px; text-align: center; border-radius: 12px; background: #fff; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
            <div style="width: 56px; height: 56px; background: #fffbeb; color: #d97706; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </div>
            <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #0f172a;">Confirmación de Inyección Masiva</h3>
            <p style="margin: 0 0 20px 0; font-size: 13.5px; color: #475569; line-height: 1.5; text-align: left; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
                Estás a punto de procesar <strong>${cantidadFilas} registros</strong> hacia la base de datos del Workspace: <strong style="color:#0b438c; text-transform: uppercase;">${tenant}</strong>.<br><br>
                El motor de persistencia aplicará el <strong>Escudo Anti-Duplicados</strong> (omitiendo RUTs ya existentes) y generará los identificadores territoriales (SIG-VEC) automáticamente.
            </p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button type="button" class="btn-cancelar-mig" style="flex: 1; padding: 12px; border-radius: 8px; font-size: 13.5px; font-weight: 700; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; cursor: pointer;">Cancelar</button>
                <button type="button" class="btn-ejecutar-mig" style="flex: 1; padding: 12px; border-radius: 8px; font-size: 13.5px; font-weight: 700; background: #16a34a; color: white; border: none; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(22, 163, 74, 0.2);">Ejecutar Inyección</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);

    overlay.querySelector('.btn-cancelar-mig').onclick = () => overlay.remove();
    overlay.querySelector('.btn-ejecutar-mig').onclick = () => {
        overlay.remove();
        onConfirm();
    };
}

function mostrarModalResumenMigracion(exitosos, omitidos) {
    const overlay = document.createElement("div");
    overlay.className = "profile-modal-overlay";
    overlay.style.zIndex = "2000";

    let omitidosHtml = "";
    if (omitidos.length > 0) {
        omitidosHtml = `
        <div style="margin-top: 20px; text-align: left;">
            <p style="font-size: 12.5px; font-weight: 700; color: #475569; margin-bottom: 8px;">Detalle de registros omitidos (Ya existían en la DB o duplicados en el Excel):</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; max-height: 200px; overflow-y: auto;">
                <table style="width: 100%; font-size: 11.5px; text-align: left; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: #f1f5f9;">
                        <tr style="border-bottom: 1px solid #cbd5e1; color: #64748b;">
                            <th style="padding: 8px 12px; font-weight: 700;">RUT Bloqueado</th>
                            <th style="padding: 8px 12px; font-weight: 700;">Nombre Asociado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${omitidos.map(o => `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 8px 12px; font-weight: 600; font-family: monospace; color: #ef4444;">${o.rut}</td>
                            <td style="padding: 8px 12px; color: #334155;">${o.nombre}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    overlay.innerHTML = `
        <div class="profile-modal-card" style="max-width: 540px; width: 90%; padding: 30px; text-align: center; border-radius: 12px; background: #fff; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
            <div style="width: 56px; height: 56px; background: ${exitosos > 0 ? '#dcfce7' : '#fef2f2'}; color: ${exitosos > 0 ? '#16a34a' : '#ef4444'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h3 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 800; color: #0f172a;">Resultados de la Migración</h3>
            <p style="margin: 0; font-size: 13px; color: #64748b;">El sistema ha terminado de leer y procesar tu archivo Excel.</p>
            
            <div style="display: flex; gap: 16px; justify-content: center; margin-top: 24px;">
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; flex: 1;">
                    <span style="display: block; font-size: 28px; font-weight: 800; color: #166534;">${exitosos}</span>
                    <span style="font-size: 11px; font-weight: 800; color: #15803d; text-transform: uppercase; letter-spacing: 0.5px;">Cargados con éxito</span>
                </div>
                <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 8px; flex: 1;">
                    <span style="display: block; font-size: 28px; font-weight: 800; color: #b91c1c;">${omitidos.length}</span>
                    <span style="font-size: 11px; font-weight: 800; color: #b91c1c; text-transform: uppercase; letter-spacing: 0.5px;">Omitidos (Duplicados)</span>
                </div>
            </div>
            
            ${omitidosHtml}
            
            <button type="button" class="btn-cerrar-resumen" style="margin-top: 24px; width: 100%; background: #0b438c; color: white; border: none; padding: 14px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(11, 67, 140, 0.2);">Entendido</button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    overlay.querySelector('.btn-cerrar-resumen').onclick = () => overlay.remove();
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
        tr.innerHTML = `
            <td style="padding: 10px 12px; font-family: monospace; font-weight: 600;">${fila["RUT (Ej: 18.478.241-3)"] || fila["RUT"] || '--'}</td>
            <td style="padding: 10px 12px;">${fila["Nombre Completo"] || '--'}</td>
            <td style="padding: 10px 12px;">${fila["Teléfono (Ej: +56 9 12345678)"] || fila["Telefono"] || '--'}</td>
            <td style="padding: 10px 12px; color: #475569;">${fila["Dirección"] || fila["Direccion"] || '--'}</td>
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
    const btnDescargar = document.getElementById("btn-descargar-plantilla-solicitudes");
    const inputFile = document.getElementById("cfg-excel-solicitudes-file");
    const btnConfirmar = document.getElementById("btn-confirmar-migracion-solicitudes");

    if (btnDescargar) {
        btnDescargar.addEventListener("click", () => {
            if (typeof XLSX === "undefined") return alert("Error: Librería Excel no cargada.");
            
            const encabezados = [
                "RUT Vecino (Ej: 18.478.241-3)", 
                "Nombre Vecino (Opcional)", 
                "Teléfono (Opcional)", 
                "Dirección Residencial (Opcional)",
                "Fecha Ingreso Original (YYYY-MM-DD)", 
                "Descripción del Problema (Requerido)"
            ];

            const ejemplo = [
                "18.478.241-3", 
                "Franchesca Paz Paz", 
                "+56 9 72489389", 
                "Lima 8677",
                "2023-11-15", 
                "Solicita poda urgente de árbol que choca con cables eléctricos."
            ];

            const ws = XLSX.utils.aoa_to_sheet([encabezados, ejemplo]);
            const wscols = [{wch: 22}, {wch: 30}, {wch: 20}, {wch: 35}, {wch: 30}, {wch: 60}];
            ws['!cols'] = wscols;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Historial Solicitudes");
            XLSX.writeFile(wb, "Plantilla_Migracion_Solicitudes.xlsx");
        });
    }

    if (inputFile) {
        inputFile.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;

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

                    excelSolicitudesDataGlobal = jsonRows;
                    renderizarPrevisualizacionSolicitudes(jsonRows);
                    
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
            if (excelSolicitudesDataGlobal.length === 0) return;
            
            mostrarModalConfirmacionSolicitudes(excelSolicitudesDataGlobal.length, CURRENT_TENANT_ID, async () => {
                
                btnConfirmar.disabled = true;
                btnConfirmar.innerText = "⏳ Analizando Solicitudes Existentes...";

                try {
                    // 1. MAPA DE VECINOS (Para sacar el idVecino)
                    const mapaVecinosDB = new Map();
                    const qVecinosActuales = query(collection(db, "vecinos"), where("tenantId", "==", CURRENT_TENANT_ID));
                    const snapActuales = await getDocs(qVecinosActuales);
                    snapActuales.forEach(doc => {
                        const data = doc.data();
                        if (data.rut) {
                            mapaVecinosDB.set(data.rut.replace(/[^0-9kK]/g, '').toUpperCase(), doc.id);
                        }
                    });

                    // 2. ESCUDO ANTI-DUPLICADOS (Huella digital: RUT + Descripción)
                    const solicitudesRegistradas = new Set();
                    const qSolsActuales = query(collection(db, "solicitudes"), where("tenantId", "==", CURRENT_TENANT_ID));
                    const snapSols = await getDocs(qSolsActuales);
                    snapSols.forEach(doc => {
                        const data = doc.data();
                        if (data.rutVecino && data.descripcion) {
                            const r = data.rutVecino.replace(/[^0-9kK]/g, '').toUpperCase();
                            const d = data.descripcion.trim().substring(0, 40).toLowerCase();
                            solicitudesRegistradas.add(`${r}_${d}`);
                        }
                    });

                    btnConfirmar.innerText = "⏳ Inyectando Tickets Históricos...";

                    let batch = writeBatch(db);
                    let contadorBatch = 0;
                    let totalGuardados = 0;
                    let resumenOmitidos = [];

                    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, ''); 

                    for (const row of excelSolicitudesDataGlobal) {
                        const desc = row["Descripción del Problema (Requerido)"] || row["Descripción"] || "";
                        if (!desc.trim()) continue;

                        const rutBruto = row["RUT Vecino (Ej: 18.478.241-3)"] || row["RUT"] || "";
                        let rutLimpio = rutBruto.toString().replace(/[^0-9kK]/g, '').toUpperCase();
                        
                        // 🚀 VALIDACIÓN DE LA HUELLA ÚNICA
                        const descLimpia = desc.toString().trim();
                        const huellaUnica = `${rutLimpio}_${descLimpia.substring(0, 40).toLowerCase()}`;

                        if (solicitudesRegistradas.has(huellaUnica)) {
                            resumenOmitidos.push({ rut: rutBruto || "S/R", nombre: descLimpia.substring(0, 40) + "..." });
                            continue; // Lo salta porque ya existe
                        }
                        // Lo agregamos al set para que si en el MISMO excel viene dos veces, lo bloquee la segunda vez
                        solicitudesRegistradas.add(huellaUnica);

                        let rutFormateado = "Sin RUT";
                        if (rutLimpio.length > 1) {
                            let dv = rutLimpio.slice(-1);
                            let cuerpo = rutLimpio.slice(0, -1);
                            rutFormateado = cuerpo + "-" + dv;
                        }

                        // Buscamos si este vecino existe para amarrarle la solicitud
                        let idVinculado = mapaVecinosDB.get(rutLimpio) || "SIN_EXPEDIENTE_VINCULADO";
                        let nombreV = (row["Nombre Vecino (Opcional)"] || row["Nombre"] || "Vecino Histórico").toString().trim();
                        let fonoV = (row["Teléfono (Opcional)"] || row["Teléfono"] || "S/R").toString().trim();
                        let direV = (row["Dirección Residencial (Opcional)"] || row["Dirección"] || "S/R").toString().trim();

                        let fechaCreacionFirebase = serverTimestamp();
                        const fechaCruda = row["Fecha Ingreso Original (YYYY-MM-DD)"] || row["Fecha"];
                        if (fechaCruda) {
                            let fechaString = typeof parsearFechaExcel === "function" ? parsearFechaExcel(fechaCruda) : fechaCruda.toString();
                            let d = new Date(fechaString);
                            if (!isNaN(d.getTime())) {
                                const { Timestamp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                                fechaCreacionFirebase = Timestamp.fromDate(d);
                            }
                        }

                        const docRef = doc(collection(db, "solicitudes"));
                        
                        const numTicketStr = String(totalGuardados + 1).padStart(4, '0');
                        const codVisual = `SIG-MIG-${dateStr}-${numTicketStr}`;
                        
                        batch.set(docRef, {
                            tenantId: CURRENT_TENANT_ID,
                            idVecino: idVinculado,
                            
                            rutVecino: rutFormateado,
                            vecinoRut: rutFormateado,
                            nombreVecino: nombreV,
                            vecinoNombre: nombreV,
                            vecinoTelefono: fonoV,
                            vecinoDireccion: direV,

                            codigo: codVisual,
                            codigoInterno: `${codVisual}-MIGRACION-EXCEL`,

                            categoria: "Pendiente de Triage",
                            subcategoria: "Requiere Clasificación",
                            oficinaDerivada: "Pendiente",
                            prioridad: "Media",
                            motivo: "Ticket Histórico Migrado",
                            descripcion: descLimpia,

                            estado: "En revisión",
                            estadoGestion: "Ingresado por migración masiva",
                            origen: "Migración Excel",
                            asignadoA: "Sin Asignar",
                            registradaPorNombre: "Migración Masiva (Sistema)",
                            registradaPorFoto: "",
                            
                            fechaCreacion: fechaCreacionFirebase,
                            fechaClasificacion: null,
                            fechaResueltoInterno: null,
                            fechaFinalizada: null
                        });

                        contadorBatch++;
                        totalGuardados++;

                        if (contadorBatch >= 480) {
                            await batch.commit();
                            batch = writeBatch(db);
                            contadorBatch = 0;
                        }
                    }

                    if (contadorBatch > 0) {
                        await batch.commit();
                    }

                    document.getElementById("preview-migracion-solicitudes").style.display = "none";
                    inputFile.value = "";
                    excelSolicitudesDataGlobal = [];

                    // Reutilizamos el modal de resumen de vecinos para que muestre los duplicados con elegancia
                    mostrarModalResumenMigracion(totalGuardados, resumenOmitidos);

                } catch (error) {
                    console.error("Error en inyección de solicitudes:", error);
                    alert("❌ ERROR DE CONEXIÓN\nHubo un problema de escritura en la base de datos.");
                } finally {
                    btnConfirmar.disabled = false;
                    btnConfirmar.innerText = "🚀 Iniciar Inyección de Casos";
                }
            });
        });
    }
}

function renderizarPrevisualizacionSolicitudes(data) {
    document.getElementById("preview-count-solicitudes").innerText = `Total filas detectadas: ${data.length}`;
    document.getElementById("preview-migracion-solicitudes").style.display = "block";
    
    const tbody = document.getElementById("tbody-preview-solicitudes");
    tbody.innerHTML = "";

    const previewData = data.slice(0, 5); 

    previewData.forEach(fila => {
        let descCruda = fila["Descripción del Problema (Requerido)"] || fila["Descripción"] || '--';
        if (descCruda.length > 50) descCruda = descCruda.substring(0, 50) + '...';

        let fechaCruda = fila["Fecha Ingreso Original (YYYY-MM-DD)"] || fila["Fecha"];
        let fechaVisual = fechaCruda ? parsearFechaExcel(fechaCruda) : 'Asignará Hoy';

        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid #e2e8f0";
        tr.innerHTML = `
            <td style="padding: 10px 12px; font-family: monospace; font-weight: 600;">${fila["RUT Vecino (Ej: 18.478.241-3)"] || fila["RUT"] || 'Sin RUT'}</td>
            <td style="padding: 10px 12px; color: #475569;">${fechaVisual}</td>
            <td style="padding: 10px 12px; color: #334155; font-style: italic;">"${descCruda}"</td>
        `;
        tbody.appendChild(tr);
    });

    if (data.length > 5) {
        const rowGris = document.createElement("tr");
        rowGris.innerHTML = `<td colspan="3" style="text-align: center; padding: 12px; background: #f8fafc; color: #64748b; font-size: 11.5px; font-weight: 500;">...y ${data.length - 5} registros más listos para subirse.</td>`;
        tbody.appendChild(rowGris);
    }
}

function mostrarModalConfirmacionSolicitudes(cantidadFilas, tenant, onConfirm) {
    const overlay = document.createElement("div");
    overlay.className = "profile-modal-overlay";
    overlay.style.zIndex = "2000";

    overlay.innerHTML = `
        <div class="profile-modal-card" style="max-width: 450px; width: 90%; padding: 30px; text-align: center; border-radius: 12px; background: #fff; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
            <div style="width: 56px; height: 56px; background: #eff6ff; color: #3b82f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            </div>
            <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #0f172a;">Confirmación de Carga Histórica</h3>
            <p style="margin: 0 0 20px 0; font-size: 13.5px; color: #475569; line-height: 1.5; text-align: left; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
                Estás a punto de inyectar <strong>${cantidadFilas} solicitudes</strong>.<br><br>
                El sistema cruzará los RUTs del archivo con tu padrón actual para amarrar las solicitudes a sus respectivos expedientes vecinales. Todas entrarán como <strong style="color:#0b438c;">Pendiente de Triage</strong>.
            </p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button type="button" class="btn-cancelar-mig" style="flex: 1; padding: 12px; border-radius: 8px; font-size: 13.5px; font-weight: 700; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; cursor: pointer;">Cancelar</button>
                <button type="button" class="btn-ejecutar-mig" style="flex: 1; padding: 12px; border-radius: 8px; font-size: 13.5px; font-weight: 700; background: #3b82f6; color: white; border: none; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.2);">Ejecutar Inyección</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);

    overlay.querySelector('.btn-cancelar-mig').onclick = () => overlay.remove();
    overlay.querySelector('.btn-ejecutar-mig').onclick = () => {
        overlay.remove();
        onConfirm();
    };
}

function mostrarAlertaSincronizacion(textoHtml) {
    const overlay = document.createElement("div");
    overlay.className = "profile-modal-overlay";
    overlay.style.zIndex = "3000";

    overlay.innerHTML = `
        <div class="profile-modal-card" style="max-width: 400px; width: 90%; padding: 24px; text-align: center; border-radius: 12px; background: #fff;">
            <div style="width: 50px; height: 50px; background: #dcfce7; color: #16a34a; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #0f172a;">Inyección Exitosa</h3>
            <p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.5; white-space: pre-wrap;">${textoHtml}</p>
            <button class="btn-ok-final" style="width: 100%; padding: 12px; background: #0b438c; color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer;">Entendido</button>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.btn-ok-final').onclick = () => overlay.remove();
}