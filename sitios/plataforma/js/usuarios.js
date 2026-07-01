// ==============================================================================
// SIGEV-AGUAYO - MOTOR CONTROLADOR DE ACCESOS Y ROLES DE EQUIPO (TENANT CONECTOR)
// ==============================================================================
import { auth, db, app } from "./app.js";
import { 
    collection, getDocs, doc, getDoc, updateDoc, query, where, serverTimestamp, setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// INYECCIÓN DE MULTIMEDIA DESDE FIREBASE STORAGE
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { inyectarEstructuraGlobal, actualizarPerfilLayout } from "./layout.js";

const storage = getStorage(app);

// 🚀 VARIABLES GLOBALES DE MEMORIA
let personalMemory = [];
let personalFiltradoGlobal = [];
let paginaActual = 1;
let itemsPorPagina = 10;
let registroSeleccionadoId = null;
let filtroEstadoTab = "Activo"; // 🚀 Por defecto mostramos a los usuarios operativos

// 🕵️‍♂️ DETECTOR MULTI-TENANT SEGURO
const subdominioCrudo = window.location.hostname.split('.')[0].toLowerCase();
const subdominioLimpio = subdominioCrudo.replace('sigev-', ''); 
const CURRENT_TENANT_ID = sessionStorage.getItem('SIGEV_ACTIVE_TENANT') || ((subdominioLimpio === 'localhost' || subdominioLimpio === '127' || subdominioLimpio === 'landing' || !subdominioLimpio) ? "paz" : subdominioLimpio);

let DEPARTAMENTOS_MUNICIPALES = ["DIDECO", "DIMAO", "Obras", "Tránsito", "Seguridad", "Gabinete", "Territorial"];

inyectarEstructuraGlobal();

// ============================================================================
// 1. INICIALIZACIÓN Y CONTROL DE SEGURIDAD (SOLO ADMINISTRADORES)
// ============================================================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        actualizarPerfilLayout(user);
        try {
            const snap = await getDoc(doc(db, "usuarios", user.uid));
            if (snap.exists()) {
                const rol = (snap.data().rol || "").toUpperCase();
                // 🔒 ESCUDO: Si no es Admin o Super Admin, lo expulsa al Dashboard
                if (!rol.includes("ADMIN")) {
                    window.location.href = "dashboard.html";
                } else {
                    inicializarRelojMundial();
                    await cargarParametrosGlobales();
                    await cargarPersonalCore();
                    inicializarBuscadorPersonal();
                    aplicarFiltrosYRenderizar(); 
                }
            } else { window.location.href = "index.html"; }
        } catch(e) { console.error(e); }
    } else {
        window.location.href = "index.html";
    }
});

function inicializarRelojMundial() {
    const clockContainer = document.getElementById("live-clock");
    if (!clockContainer) return;
    const render = () => {
        const ahora = new Date();
        clockContainer.innerText = `|   ${ahora.toLocaleDateString('es-CL')}   ${ahora.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    };
    render(); setInterval(render, 1000);
}

function mostrarLoaderBloqueante(mensaje) {
    const exist = document.getElementById("global-loader-sigev");
    if (exist) exist.remove();
    const loader = document.createElement("div");
    loader.id = "global-loader-sigev";
    loader.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.8); backdrop-filter:blur(4px); z-index:9999; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#fff;";
    loader.innerHTML = `
        <div class="loader-spinner" style="width:50px; height:50px; border:4px solid rgba(255,255,255,0.3); border-top-color:#3b82f6; border-radius:50%; animation:spin 1s linear infinite; margin-bottom:16px;"></div>
        <h3 style="margin:0; font-size:16px; font-weight:700;">${mensaje}</h3>
        <style>@keyframes spin { 100% { transform:rotate(360deg); } }</style>
    `;
    document.body.appendChild(loader);
}

function ocultarLoaderBloqueante() {
    const loader = document.getElementById("global-loader-sigev");
    if (loader) loader.remove();
}

function mostrarAlertaPersonalizada(mensaje, tipo = "success", alAceptar = null) {
    const overlay = document.createElement("div");
    overlay.className = "custom-alert-overlay";
    let iconSvg = ""; let titleText = ""; let iconStyles = "";

    if (tipo === "success") {
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        titleText = "Operación Exitosa";
        iconStyles = "background-color: rgba(16, 185, 129, 0.1); color: #10b981;";
    } else if (tipo === "info") {
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="12" x2="12" y2="16"></line></svg>`;
        titleText = "Información del Sistema";
        iconStyles = "background-color: rgba(37, 99, 235, 0.1); color: #2563eb;";
    } else {
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        titleText = "Atención Requerida";
        iconStyles = "background-color: rgba(239, 68, 68, 0.1); color: #ef4444;";
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
        if (alAceptar) alAceptar();
    };
}

async function cargarParametrosGlobales() {
    try {
        const docRef = doc(db, "configuracion_tenant", CURRENT_TENANT_ID);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const c = snap.data();
            if (c.departamentosAsignables && c.departamentosAsignables.length > 0) {
                DEPARTAMENTOS_MUNICIPALES = c.departamentosAsignables;
            }
        }
    } catch (e) {
        console.error("Error cargando parámetros globales:", e);
    }
}

async function cargarPersonalCore() {
    mostrarLoaderBloqueante("Sincronizando expedientes del personal...");
    try {
        const snapU = await getDocs(collection(db, "usuarios"));
        personalMemory = [];
        
        snapU.forEach(d => {
            const data = d.data();
            const roleSeguro = (data.rol || "").toUpperCase();
            if (!data.tenantId || data.tenantId === CURRENT_TENANT_ID || roleSeguro === "SUPER_ADMIN" || roleSeguro === "SUPERADMIN") {
                personalMemory.push({ id: d.id, ...data });
            }
        });

        personalMemory.sort((a, b) => (b.fechaRegistro?.seconds || 0) - (a.fechaRegistro?.seconds || 0));
    } catch(e) { 
        console.error("Error cargando DB:", e); 
    } finally {
        ocultarLoaderBloqueante();
    }
}

// ============================================================================
// 2. FILTROS Y RENDERING DE TABLA
// ============================================================================

function inicializarBuscadorPersonal() {
    const inptSearch = document.getElementById("filter-personal-search");
    const selectRol = document.getElementById("filter-rol");
    const btnReset = document.getElementById("btn-reset-filters");

    // Aseguramos que no exista botón de vincular
    document.querySelectorAll("button").forEach(btn => {
        if(btn.innerText.includes("Vincular Personal")) btn.remove();
    });

    if (inptSearch) inptSearch.addEventListener("input", aplicarFiltrosYRenderizar);
    if (selectRol) selectRol.addEventListener("change", aplicarFiltrosYRenderizar);

    if (btnReset) {
        btnReset.onclick = () => {
            if (inptSearch) inptSearch.value = "";
            if (selectRol) selectRol.value = "Todos";
            
            filtroEstadoTab = "Activo";
            const tabs = document.querySelectorAll(".user-tab");
            tabs.forEach(t => {
                t.classList.remove("active");
                t.style.color = "#64748b";
                t.style.fontWeight = "600";
                t.style.borderBottom = "2px solid transparent";
                if(t.getAttribute("data-estado") === "Activo") {
                    t.classList.add("active");
                    t.style.color = "#0b438c";
                    t.style.fontWeight = "700";
                    t.style.borderBottom = "2px solid #0b438c";
                }
            });

            aplicarFiltrosYRenderizar();
        };
    }

    const limitSelect = document.getElementById("user-limit-entries");
    if (limitSelect) {
        limitSelect.addEventListener("change", (e) => {
            itemsPorPagina = parseInt(e.target.value);
            paginaActual = 1;
            inyectarFilasTablaPersonal();
        });
    }

    const prevBtn = document.getElementById("user-pag-prev");
    const nextBtn = document.getElementById("user-pag-next");
    if (prevBtn) prevBtn.addEventListener("click", () => { if (paginaActual > 1) { paginaActual--; inyectarFilasTablaPersonal(); } });
    if (nextBtn) nextBtn.addEventListener("click", () => { const maxPage = Math.ceil(personalFiltradoGlobal.length / itemsPorPagina); if (paginaActual < maxPage) { paginaActual++; inyectarFilasTablaPersonal(); } });

    const tabs = document.querySelectorAll(".user-tab, #user-tabs-container .user-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => {
                t.classList.remove("active");
                t.style.color = "#64748b";
                t.style.fontWeight = "600";
                t.style.borderBottom = "2px solid transparent";
            });
            
            tab.classList.add("active");
            tab.style.color = "#0b438c";
            tab.style.fontWeight = "700";
            tab.style.borderBottom = "2px solid #0b438c";
            
            filtroEstadoTab = tab.getAttribute("data-estado") || "Todos"; 
            aplicarFiltrosYRenderizar();
        });
    });
}

function aplicarFiltrosYRenderizar() {
    const iSearch = document.getElementById("filter-personal-search");
    const term = iSearch ? iSearch.value.toLowerCase().trim() : "";
    
    const iRol = document.getElementById("filter-rol");
    const filtroRol = iRol ? iRol.value : "Todos";

    personalFiltradoGlobal = personalMemory.filter(u => {
        // 1. FILTRO DE BÚSQUEDA (Nombre o Correo)
        const searchString = `${u.nombreCompleto || u.nombre || ''} ${u.email || ''} ${u.rolVisual || ''}`.toLowerCase();
        let matchS = true;
        if (term) matchS = searchString.includes(term);

        // 2. FILTRO DE ROL DESPLEGABLE (Tolerante a variaciones)
        let matchRol = true;
        if (filtroRol !== "Todos") {
            const rV = (u.rol || "").toUpperCase(); // Normalizamos la BD a mayúsculas
            
            if (filtroRol === "SUPER_ADMIN") {
                matchRol = rV.includes("SUPER"); 
            } else if (filtroRol === "ADMIN") {
                matchRol = (rV === "ADMIN"); 
            } else if (filtroRol === "GESTOR_TERRITORIAL") {
                matchRol = rV.includes("GESTOR"); 
            } else if (filtroRol === "pendiente") {
                matchRol = (rV === "PENDIENTE"); 
            } else if (filtroRol === "Inactivo") {
                matchRol = (rV === "INACTIVO");
            } else {
                matchRol = (u.rol === filtroRol);
            }
        }

        // 3. FILTRO DE TABS SUPERIORES (Unificando estado de cuenta)
        let matchSt = true;
        // Solo verificamos el campo oficial estadoCuenta para la visualización del filtro
        const estadoVirtual = (u.estadoCuenta === "Suspendido" || u.estadoCuenta === "Inactivo") ? "Inactivo" : "Activo";

        if (filtroEstadoTab !== "Todos") {
            if (filtroEstadoTab === "Activo" && estadoVirtual !== "Activo") matchSt = false;
            if (filtroEstadoTab === "Inactivo" && estadoVirtual !== "Inactivo") matchSt = false;
        }

        return matchS && matchRol && matchSt;
    });

    paginaActual = 1;
    inyectarFilasTablaPersonal();
}

function inyectarFilasTablaPersonal() {
    const tbody = document.querySelector("#tabla-global-usuarios tbody") || document.querySelector("#tabla-usuarios tbody") || document.querySelector("table tbody");
    if (!tbody) return;

    const inicio = (paginaActual - 1) * itemsPorPagina;
    const fin = inicio + itemsPorPagina;
    const paginada = personalFiltradoGlobal.slice(inicio, fin);

    let html = "";
    paginada.forEach(u => {
        const fotoUrl = u.fotoPerfil || u.foto || u.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100";
        
        const rolSistema = (u.rol || "").toUpperCase();
        let iconoRol = '⭐'; 
        
        if (rolSistema.includes("SUPER")) { 
            iconoRol = '🎩';
        } else if (rolSistema.includes("ADMIN")) { 
            iconoRol = '👑';
        } else if (rolSistema === "INACTIVO" || u.rol === "Inactivo") {
            iconoRol = '📁';
        }

        const uidCorto = u.id ? u.id.substring(0, 6).toUpperCase() : "N/A";
        const rolVisualTexto = u.rolVisual || (rolSistema.includes("SUPER") ? "Super Administrador" : rolSistema.includes("ADMIN") ? "Administrador" : u.rol === "pendiente" ? "Pendiente" : u.rol === "Inactivo" ? "Inactivo" : "Gestor");
        
        let bgRol = "#f1f5f9"; 
        let colorRol = "#475569";
        const rolLower = rolVisualTexto.toLowerCase();
        
        if (rolLower.includes("admin")) { 
            bgRol = "#fce7f3"; colorRol = "#db2777"; 
        } else if (rolLower.includes("concejal")) { 
            bgRol = "#e0e7ff"; colorRol = "#4338ca"; 
        } else if (rolLower.includes("gestor") || rolLower.includes("terri")) { 
            bgRol = "#d1fae5"; colorRol = "#059669"; 
        }

        // Utilizamos solo estadoCuenta
        const estadoSt = (u.estadoCuenta === "Suspendido" || u.estadoCuenta === "Inactivo") ? "Inactivo" : "Activo";
        let bgEstado = estadoSt === "Activo" ? "#ffedd5" : "#f1f5f9"; 
        let colEstado = estadoSt === "Activo" ? "#c2410c" : "#475569";
        
        let fechaAct = "No registra";
        if (u.ultimaModificacion || u.fechaRegistro) {
            try {
                const fechaVal = u.ultimaModificacion ? new Date(u.ultimaModificacion.seconds * 1000) : new Date(u.fechaRegistro.seconds * 1000);
                const d = fechaVal.getDate().toString().padStart(2, '0');
                const m = (fechaVal.getMonth() + 1).toString().padStart(2, '0');
                const y = fechaVal.getFullYear();
                fechaAct = `${d}-${m}-${y}`;
            } catch(e) { fechaAct = "24-06-2026"; } 
        }

        html += `
            <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.2s; background: #ffffff;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
                
                <td style="padding: 16px; min-width: 280px;">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <img src="${fotoUrl}" referrerpolicy="no-referrer" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 1px solid #e2e8f0; flex-shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div>
                            <div style="font-weight: 700; color: #0f172a; font-size: 14px;">${iconoRol} ${u.nombreCompleto || u.nombre || "Usuario Invitado"}</div>
                            <div style="font-size: 11.5px; color: #64748b; margin-top: 2px; font-family: monospace;">UID: ${uidCorto}</div>
                        </div>
                    </div>
                </td>
                <td style="padding: 16px; font-size: 13.5px; color: #0f172a; font-weight: 500;">
                    ${u.email || "Sin correo"}
                </td>
                <td style="padding: 16px;">
                    <span style="background: ${bgRol}; color: ${colorRol}; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700;">
                        ${rolVisualTexto}
                    </span>
                </td>
                <td style="padding: 16px;">
                    <span style="background: ${bgEstado}; color: ${colEstado}; padding: 4px 12px; border-radius: 9999px; font-size: 11.5px; font-weight: 600;">
                        ${estadoSt}
                    </span>
                </td>
                <td style="padding: 16px; font-size: 13px; color: #475569; font-weight: 500;">
                    ${fechaAct}
                </td>
                <td style="padding: 16px; text-align: center;">
                    <button class="btn-editar-usuario" data-id="${u.id}" style="background: transparent; border: none; cursor: pointer; color: #475569; transition: 0.2s; padding: 6px; border-radius: 6px;" onmouseover="this.style.color='#0f172a'; this.style.background='#f1f5f9';" onmouseout="this.style.color='#475569'; this.style.background='transparent';" title="Editar Funcionario">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                </td>
            </tr>`;
    });

    tbody.innerHTML = html || `<tr><td colspan="6" style="text-align:center; padding:40px; color:#64748b; font-weight: 500;">No se encontraron funcionarios integrados con estos filtros.</td></tr>`;
    
    const paginationText = document.getElementById("pagination-info-text");
    if (paginationText) {
        if (personalFiltradoGlobal.length === 0) {
            paginationText.innerText = `Mostrando 0 funcionarios integrados`;
        } else {
            paginationText.innerText = `Mostrando ${inicio + 1} a ${Math.min(fin, personalFiltradoGlobal.length)} de ${personalFiltradoGlobal.length} funcionarios integrados`;
        }
    }

    tbody.querySelectorAll(".btn-editar-usuario").forEach(btn => {
        btn.onclick = () => {
            const uId = btn.getAttribute("data-id");
            const userData = personalMemory.find(x => x.id === uId);
            abrirEditorPerfilPersonal(userData);
        };
    });
}

// ============================================================================
// 3. EDITOR Y VISOR DE PERFILES (DISEÑO CONSOLIDADO Y FOTO BLOQUEADA)
// ============================================================================
function abrirEditorPerfilPersonal(user) {
    if (!user) return;

    const overlay = document.createElement("div");
    overlay.className = "profile-modal-overlay";
    overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.75); display: flex; align-items: center; justify-content: center; z-index: 3500; backdrop-filter: blur(4px);";

    const isSuperAdmin = (user.rol === "SUPER_ADMIN" || user.rol === "SUPERADMIN" || user.rol === "super_admin");
    const fotoActual = user.fotoPerfil || user.foto || user.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100";
    const infoAntigua = [user.departamento, user.telefono].filter(Boolean).join(" - ");
    const bitacoraValue = user.bitacora || (infoAntigua !== "Territorio General" ? infoAntigua : "");

    // Unificamos la lectura al único campo oficial: estadoCuenta
    const estadoActualCuenta = user.estadoCuenta || "Activo";

    overlay.innerHTML = `
        <div class="profile-modal-card" style="max-width: 520px; width: 90%; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2); display: flex; flex-direction: column; max-height: 90vh;">
            
            <div class="profile-modal-header" style="background: #0b438c; padding: 20px 24px; position: relative; flex-shrink: 0;">
                <div style="padding-right: 32px;">
                    <h3 style="font-size: 18px; color: #ffffff; margin: 0; font-weight: 700;">Permisos de Funcionario</h3>
                    <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0 0; font-size: 13px;">Configuración de accesos y nivel de privilegios en la plataforma.</p>
                </div>
                <button class="btn-profile-close" style="color:#ffffff; top: 20px; right: 20px; border:none; background:transparent; font-size:24px; cursor:pointer; position: absolute; line-height: 1;">&times;</button>
            </div>
            
            <div class="profile-modal-body" style="padding: 28px 32px; overflow-y: auto; flex-grow: 1;">
                
                <div style="text-align: center; margin-bottom: 24px; position: relative;">
                    <img src="${fotoActual}" referrerpolicy="no-referrer" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover; border: 3px solid #f1f5f9; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                </div>
                
                <div style="margin-bottom: 18px;">
                    <label style="font-size: 13px; font-weight: 700; color: #0b438c; margin-bottom: 6px; display: block;">Nombre Completo</label>
                    <input type="text" id="edit-nombre" value="${user.nombreCompleto || user.nombre || ''}" style="width: 100%; padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 500; font-size: 13.5px; outline:none; background:#f8fafc; color: #0f172a; transition: border-color 0.2s;" onfocus="this.style.borderColor='#0b438c'" onblur="this.style.borderColor='#cbd5e1'">
                </div>
                
                <div style="margin-bottom: 18px;">
                    <label style="font-size: 13px; font-weight: 700; color: #0b438c; margin-bottom: 6px; display: block;">Correo Electrónico</label>
                    <input type="email" value="${user.email || ''}" readonly style="width: 100%; padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 500; font-size: 13.5px; outline:none; background:#f1f5f9; color: #475569; cursor: not-allowed;">
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px;">
                    <div>
                        <label style="font-size: 13px; font-weight: 700; color: #0b438c; margin-bottom: 6px; display: block;">Rol de Sistema *</label>
                        <select id="edit-rol" style="width: 100%; padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 500; font-size: 13.5px; outline:none; background:${isSuperAdmin ? '#f1f5f9' : '#f8fafc'}; color: ${isSuperAdmin ? '#64748b' : '#0f172a'};" ${isSuperAdmin ? 'disabled' : ''}>
                            <option value="SUPER_ADMIN" ${isSuperAdmin ? 'selected' : ''}>SUPER_ADMIN (Dueño)</option>
                            <option value="ADMIN" ${user.rol === 'ADMIN' ? 'selected' : ''}>ADMIN (Administrador)</option>
                            <option value="GESTOR_TERRITORIAL" ${(user.rol === 'GESTOR_TERRITORIAL' || user.rol === 'Inactivo') ? 'selected' : ''}>GESTOR_TERRITORIAL</option>
                            <option value="pendiente" ${user.rol === 'pendiente' ? 'selected' : ''}>Pendiente de Aprobación</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 13px; font-weight: 700; color: #0b438c; margin-bottom: 6px; display: block;">Rol Visual (Cargo Escrito) *</label>
                        <input type="text" id="edit-rol-visual" value="${user.rolVisual || ''}" style="width: 100%; padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 500; font-size: 13.5px; outline:none; background:#ffffff; color: #0f172a; transition: border-color 0.2s;" onfocus="this.style.borderColor='#0b438c'" onblur="this.style.borderColor='#cbd5e1'">
                    </div>
                </div>

                <div style="margin-bottom: 18px;">
                    <label style="font-size: 13px; font-weight: 700; color: #0b438c; margin-bottom: 6px; display: block;">Estado de Acceso *</label>
                    <select id="edit-estado" style="width: 100%; padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 500; font-size: 13.5px; outline:none; background:#f8fafc; color: #0f172a;" ${isSuperAdmin ? 'disabled' : ''}>
                        <option value="Activo" ${estadoActualCuenta === 'Activo' ? 'selected' : ''}>Activo (Habilitado para operar)</option>
                        <option value="Suspendido" ${(estadoActualCuenta === 'Suspendido' || estadoActualCuenta === 'Inactivo') ? 'selected' : ''}>Suspendido (Bloqueado)</option>
                    </select>
                </div>

                <div>
                    <label style="font-size: 13px; font-weight: 700; color: #0b438c; margin-bottom: 6px; display: block;">Bitácora e Info Interna de Terreno</label>
                    <textarea id="edit-bitacora" placeholder="Anotaciones de uso interno (Teléfono corporativo, horarios, anexos)..." style="width: 100%; padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 500; font-size: 13.5px; outline:none; background:#ffffff; color: #0f172a; min-height: 85px; resize: vertical; font-family: inherit; transition: border-color 0.2s;" onfocus="this.style.borderColor='#0b438c'" onblur="this.style.borderColor='#cbd5e1'">${bitacoraValue}</textarea>
                </div>

            </div>

            <div style="padding: 16px 32px; background: #ffffff; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px; flex-shrink: 0;">
                <button type="button" class="btn-cerrar-mdl" style="padding: 10px 20px; border-radius: 6px; font-weight: 600; font-size: 13.5px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">Cancelar</button>
                <button type="button" id="btn-guardar-perfil" style="padding: 10px 24px; border-radius: 6px; font-weight: 700; font-size: 13.5px; border: none; background: #0b438c; color: #ffffff; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#1e3a8a'" onmouseout="this.style.background='#0b438c'">Actualizar Permisos</button>
            </div>
            
        </div>
    `;

    document.body.appendChild(overlay);

    const btnGuardar = overlay.querySelector("#btn-guardar-perfil");
    overlay.querySelector(".btn-cerrar-mdl").onclick = () => overlay.remove();
    overlay.querySelector(".btn-profile-close").onclick = () => overlay.remove();

    btnGuardar.onclick = async () => {
        const nNombre = overlay.querySelector("#edit-nombre").value.trim();
        let nRol = overlay.querySelector("#edit-rol").value;
        let nRolV = overlay.querySelector("#edit-rol-visual").value.trim();
        const nEst = overlay.querySelector("#edit-estado").value; // "Activo" o "Suspendido"
        const nBitacora = overlay.querySelector("#edit-bitacora").value.trim();

        if (!nNombre) {
            mostrarAlertaPersonalizada("El nombre es obligatorio.", "error");
            return;
        }

        // Lógica corregida: 
        // 1. Si se suspende, matamos el rol de sistema para evitar accesos fantasmas.
        // 2. Si se activa y no tenía rol, le damos uno por defecto para revivirlo.
        if (nEst === "Suspendido") {
            nRol = "Inactivo";
            nRolV = "Inactivo";
        } else if (nEst === "Activo") {
            // El rol debe ser siempre Inactivo o pendiente por defecto si no es administrador
            if (nRol !== "ADMIN" && nRol !== "SUPER_ADMIN" && nRol !== "GESTOR_TERRITORIAL") {
                nRol = "Inactivo";
            }
            if (!nRolV || nRolV.toLowerCase() === "inactivo" || nRolV.toLowerCase() === "pendiente") {
                nRolV = "Inactivo";
            }
        }

        btnGuardar.disabled = true;
        btnGuardar.innerText = "Guardando...";

        try {
            // Enviamos un único estado de cuenta claro
            const payload = {
                nombreCompleto: nNombre,
                nombre: nNombre,
                rol: isSuperAdmin ? "SUPER_ADMIN" : nRol,
                rolVisual: nRolV,
                estadoCuenta: isSuperAdmin ? "Activo" : nEst,
                bitacora: nBitacora,
                ultimaModificacion: serverTimestamp()
            };

            await updateDoc(doc(db, "usuarios", user.id), payload);
            
            Object.assign(user, payload);
            overlay.remove();
            mostrarAlertaPersonalizada("Permisos actualizados correctamente.", "success");
            
            aplicarFiltrosYRenderizar();
        } catch (error) {
            console.error(error);
            mostrarAlertaPersonalizada("Error al guardar en el servidor.", "error");
            btnGuardar.disabled = false;
            btnGuardar.innerText = "Actualizar Permisos";
        }
    };
}