// ==============================================================================
// SIGEV-AGUAYO - MOTOR CONTROLADOR DE ACCESOS Y ROLES DE EQUIPO (TENANT CONECTOR)
// ==============================================================================
import { auth, db, app } from "./app.js";
import { 
    collection, getDocs, doc, getDoc, updateDoc, query, where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// INYECCIÓN DE MULTIMEDIA DESDE FIREBASE STORAGE
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { inyectarEstructuraGlobal, actualizarPerfilLayout } from "./layout.js";

const storage = getStorage(app);
let usuariosMemory = [];
let archivoFotoPendiente = null; // Almacena el binario de la nueva foto seleccionada
const modalUsuario = document.getElementById("modal-editar-usuario");

// ARQUITECTURA TENANT: Identificador maestro de aislamiento corporativo
const CURRENT_TENANT_ID = "aguayo";

inyectarEstructuraGlobal();

auth.onAuthStateChanged(async (user) => {
    if (user) {
        actualizarPerfilLayout(user);
        await cargarUsuariosFirebase();
        inicializarComponentesUsuarios();
    }
});

// --- MOTOR DE INYECCIÓN DE ALERTAS PREMIUM ESTILIZADAS ---
function mostrarAlertaPersonalizada(mensaje, tipo = "success") {
    const overlay = document.createElement("div");
    overlay.className = "custom-alert-overlay";
    let iconSvg = ""; let titleText = ""; let iconStyles = "";

    if (tipo === "success") {
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        titleText = "¡Sincronización Exitosa!";
        iconStyles = "background-color: rgba(16, 185, 129, 0.1); color: #10b981;";
    } else {
        iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="12" x2="12" y2="16"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        titleText = "Notificación del Sistema";
        iconStyles = "background-color: rgba(37, 99, 235, 0.1); color: #2563eb;";
    }

    overlay.innerHTML = `
        <div class="custom-alert-card">
            <div class="custom-alert-icon" style="${iconStyles}">${iconSvg}</div>
            <div class="custom-alert-title">${titleText}</div>
            <div class="custom-alert-message">${mensaje}</div>
            <button class="btn-alert-confirm">Aceptar</button>
        </div>`;
    document.body.appendChild(overlay);
    const btnAceptar = overlay.querySelector(".btn-alert-confirm");
    if (btnAceptar) btnAceptar.focus();
    btnAceptar.addEventListener("click", () => overlay.remove());
}

// --- CONFIRMACIÓN ASÍNCRONA PERSONALIZADA PARA DESTIERROS RÁPIDOS ---
function mostrarConfirmacionPersonalizada(mensaje, onConfirm) {
    const overlay = document.createElement("div");
    overlay.className = "custom-alert-overlay";
    overlay.innerHTML = `
        <div class="custom-alert-overlay">
            <div class="custom-alert-card" style="max-width: 440px;">
                <div class="custom-alert-icon" style="background-color: rgba(220, 38, 38, 0.1); color: #dc2626; font-size: 24px; padding: 4px; box-shadow: 0 4px 10px rgba(220,38,38,0.15);">☠️</div>
                <div class="custom-alert-title" style="color: #dc2626;">Sentencia de Destierro</div>
                <div class="custom-alert-message" style="line-height: 1.5; margin-bottom: 20px;">${mensaje}</div>
                <div style="display: flex; gap: 12px; justify-content: center; width: 100%;">
                    <button class="btn-confirmar-destierro" style="background-color: #dc2626; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 700; cursor: pointer; flex: 1; transition: all 0.2s;">Desterrar</button>
                    <button class="btn-cancelar-destierro" style="background-color: #cbd5e1; color: #334155; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; flex: 1; transition: all 0.2s;">Cancelar</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    
    const btnConfirmar = overlay.querySelector(".btn-confirmar-destierro");
    if (btnConfirmar) btnConfirmar.focus();

    btnConfirmar.onclick = () => { overlay.remove(); onConfirm(); };
    overlay.querySelector(".btn-cancelar-destierro").onclick = () => overlay.remove();
}

// --- CONSOLA DE JUICIO PARA CUENTAS PENDIENTES CON DOS OPCIONES ---
function mostrarConsolaJuicioInframundo(usuario, onOportunidad, onDestierro) {
    const overlay = document.createElement("div");
    overlay.className = "custom-alert-overlay";
    overlay.innerHTML = `
        <div class="custom-alert-card" style="max-width: 460px; padding: 28px;">
            <div class="custom-alert-icon" style="background-color: rgba(220, 38, 38, 0.1); color: #dc2626; font-size: 24px; padding: 4px; box-shadow: 0 4px 10px rgba(220,38,38,0.15);">☠️</div>
            <div class="custom-alert-title" style="color: var(--text-dark); font-size: 16px; margin-top: 10px;">Juicio del Inframundo ☠️</div>
            <div class="custom-alert-message" style="line-height: 1.5; margin-bottom: 22px; font-size: 13.5px; color: var(--text-dark);">
                Estás a punto de procesar el alma de <b>${usuario.nombre || 'Humita CooCoo'}</b>. ¡Decide si otorgarle una nueva oportunidad o dejarlo aqui para siempre en el infierno de los desterrados!
            </div>
            <div style="display: flex; gap: 12px; justify-content: center; width: 100%;">
                <button class="btn-oportunidad-ui" style="background-color: #10b981; color: white; border: none; padding: 10px 14px; border-radius: 6px; font-weight: 700; cursor: pointer; flex: 1; transition: background 0.2s;" onmouseenter="this.style.background='#059669'" onmouseleave="this.style.background='#10b981'">Nueva Oportunidad</button>
                <button class="btn-infierno-ui" style="background-color: #dc2626; color: white; border: none; padding: 10px 14px; border-radius: 6px; font-weight: 700; cursor: pointer; flex: 1; transition: background 0.2s;" onmouseenter="this.style.background='#b91c1c'" onmouseleave="this.style.background='#dc2626'">Dejar en el Infierno</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector(".btn-oportunidad-ui").onclick = () => { overlay.remove(); onOportunidad(); };
    overlay.querySelector(".btn-infierno-ui").onclick = () => { overlay.remove(); onDestierro(); };
}

async function cargarUsuariosFirebase() {
    try {
        const q = query(
            collection(db, "usuarios"), 
            where("tenantId", "==", CURRENT_TENANT_ID)
        );
        
        const snap = await getDocs(q);
        usuariosMemory = [];
        snap.forEach(uDoc => {
            const data = uDoc.data();
            usuariosMemory.push({ id: uDoc.id, tenantId: CURRENT_TENANT_ID, ...data });
        });

        usuariosMemory.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

    } catch (error) {
        console.error("Error al compilar la nómina de funcionarios:", error);
    }
}

function inicializarComponentesUsuarios() {
    document.getElementById("filter-usuario-busqueda").addEventListener("input", aplicarFiltrosUsuarios);
    document.getElementById("filter-usuario-rol").addEventListener("change", aplicarFiltrosUsuarios);
    document.getElementById("filter-usuario-estado").addEventListener("change", aplicarFiltrosUsuarios);
    
    const filterRow = document.querySelector(".filter-layout-row");
    if (filterRow && !document.getElementById("btn-carpeta-desterrados")) {
        const carpetaContainer = document.createElement("div");
        carpetaContainer.className = "filter-control";
        carpetaContainer.style.display = "flex";
        carpetaContainer.style.alignItems = "flex-end";
        carpetaContainer.innerHTML = `
            <button id="btn-carpeta-desterrados" class="btn btn-secondary" style="background-color: #1e1e2d; color: #f87171; border: 1px solid #ef4444; font-weight: 700; display: flex; align-items: center; justify-content: center; padding: 10px 14px; gap: 8px; font-size: 12.5px; border-radius: 6px; cursor: pointer; transition: all 0.2s;" onmouseenter="this.style.background='#2d2d3f'" onmouseleave="this.style.background='#1e1e2d'">
                📁 Carpeta Desterrados ☠️
            </button>
        `;
        filterRow.appendChild(carpetaContainer);
        
        document.getElementById("btn-carpeta-desterrados").addEventListener("click", () => {
            document.getElementById("filter-usuario-estado").value = "Inactivo";
            document.getElementById("filter-usuario-rol").value = "Todos";
            document.getElementById("filter-usuario-busqueda").value = "";
            aplicarFiltrosUsuarios();
            mostrarAlertaPersonalizada("Abriendo la carpeta prohibida de los usuarios desterrados del sistema.", "info");
        });
    }

    // --- NUEVO: ESCUCHADOR PARA PREVISUALIZACIÓN INSTANTÁNEA DE FOTO LOCAL ---
    const fileInput = document.getElementById("mu-foto-file");
    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                archivoFotoPendiente = file;
                const reader = new FileReader();
                reader.onload = (event) => {
                    const imgPreview = document.getElementById("mu-avatar-preview");
                    const placeholder = document.getElementById("mu-avatar-placeholder");
                    if (imgPreview && placeholder) {
                        imgPreview.src = event.target.result;
                        imgPreview.style.display = "block";
                        placeholder.style.display = "none";
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }

    const btnToggleMobile = document.getElementById("btn-toggle-filters-mobile");
    if (btnToggleMobile) {
        btnToggleMobile.addEventListener("click", () => {
            const panelCard = btnToggleMobile.closest(".filter-panel-card");
            if (panelCard) panelCard.classList.toggle("filters-expanded");
        });
    }

    document.getElementById("btn-reset-filters-usuarios").addEventListener("click", () => {
        document.getElementById("filter-usuario-busqueda").value = "";
        document.getElementById("filter-usuario-rol").value = "Todos";
        document.getElementById("filter-usuario-estado").value = "Activo"; 
        aplicarFiltrosUsuarios();
    });

    if (modalUsuario) {
        document.getElementById("btn-cerrar-modal-usuario").addEventListener("click", () => modalUsuario.style.display = "none");
        document.getElementById("btn-cancelar-modal-usuario").addEventListener("click", () => modalUsuario.style.display = "none");
        window.addEventListener("click", (e) => { if (e.target === modalUsuario) modalUsuario.style.display = "none"; });
        
        document.getElementById("btn-guardar-modal-usuario").addEventListener("click", guardarCambiosUsuarioFirestore);
    }

    document.getElementById("filter-usuario-estado").value = "Activo";
    aplicarFiltrosUsuarios();
}

function aplicarFiltrosUsuarios() {
    const busqueda = document.getElementById("filter-usuario-busqueda").value.toLowerCase();
    const rol = document.getElementById("filter-usuario-rol").value;
    const estado = document.getElementById("filter-usuario-estado").value;

    let filtrados = usuariosMemory.filter(u => {
        const coincideBusqueda = !busqueda || 
            (u.nombre || "").toLowerCase().includes(busqueda) || 
            (u.correo || u.email || "").toLowerCase().includes(busqueda);
            
        let rolMatch = u.rol || "pendiente";
        if (rolMatch === "admin" || rolMatch === "Administrador") rolMatch = "ADMIN";
        if (rolMatch === "Moderador") rolMatch = "GESTOR_TERRITORIAL";

        const coincideRol = (rol === "Todos") || (rolMatch === rol);
        const coincideEstado = (estado === "Todos") || ((u.estado || "Activo") === estado);

        return coincideBusqueda && coincideRol && coincideEstado;
    });

    renderizarTablaUsuarios(filtrados);
}

function renderizarTablaUsuarios(lista) {
    const tbody = document.querySelector("#tabla-global-usuarios tbody");
    if (!tbody) return;

    const currentLoggedUid = auth.currentUser ? auth.currentUser.uid : "";

    let html = "";
    lista.forEach(u => {
        const emailSrc = u.correo || u.email || "Sin correo";
        const estadoCuenta = u.estado || "Activo";
        
        let fotoSrc = u.foto || u.photoURL || u.fotoPerfil || "";
        if (!fotoSrc || fotoSrc.includes("photo-1535713875002-d1d0cf377fde")) {
            fotoSrc = "https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=100"; 
        }
        
        let claseRolBadge = "badge-role-pendiente";
        let rolImpresión = u.rolVisual || u.rol || "pendiente";
        let iconoRol = "☠️"; 

        if (u.rol === "SUPER_ADMIN") {
            claseRolBadge = "badge-role-superadmin";
            iconoRol = "🎩";
        } else if (u.rol === "ADMIN" || u.rol === "admin" || u.rol === "Administrador") {
            claseRolBadge = "badge-role-admin";
            iconoRol = "👑";
        } else if (u.rol === "GESTOR_TERRITORIAL" || u.rol === "Moderador" || u.rol === "Equipo Territorial") {
            claseRolBadge = "badge-role-territorial";
            iconoRol = "⭐";
        }

        const claseEstado = estadoCuenta === "Activo" ? "revision" : "finalizada";

        let loginFormateado = "No registra";
        if (u.ultimaConexion) {
            let dateObj = null;
            if (typeof u.ultimaConexion.toDate === "function") {
                dateObj = u.ultimaConexion.toDate();
            } else if (u.ultimaConexion.seconds) {
                dateObj = new Date(u.ultimaConexion.seconds * 1000);
            } else if (u.ultimaConexion.pointer) {
                dateObj = u.ultimaConexion;
            } else {
                dateObj = new Date(u.ultimaConexion);
            }

            if (dateObj && !isNaN(dateObj.getTime())) {
                loginFormateado = `${String(dateObj.getDate()).padStart(2, '0')}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${dateObj.getFullYear()}`;
            }
        }

        let accionHtml = "";
        if (u.rol === "SUPER_ADMIN" && u.id !== currentLoggedUid) {
            accionHtml = `<span style="color: var(--text-light); font-size: 11.5px; font-weight: 700; background: #f1f5f9; padding: 4px 10px; border-radius: 6px;">Inmune 🛡️</span>`;
        } else {
            let botonDestierroRapido = "";
            if ((u.rol === "pendiente" || !u.rol) && estadoCuenta === "Activo") {
                botonDestierroRapido = `
                    <button class="btn-accion-u u-ban-fast" data-id="${u.id}" style="background: none; border: none; cursor: pointer; padding: 6px; font-size: 14px; margin-left: 4px; filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.1));" title="Enviar inmediatamente al infierno">
                        ☠️
                    </button>
                `;
            }

            accionHtml = `
                <div style="display: flex; align-items: center; justify-content: center;">
                    <button class="btn-accion-u u-edit" data-id="${u.id}" style="background: none; border: none; cursor: pointer; color: var(--primary-blue); padding: 6px; transition: 0.2s;" title="Modificar permisos y rol">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    ${botonDestierroRapido}
                </div>
            `;
        }

        html += `
            <tr class="user-row-click" data-id="${u.id}" style="cursor:pointer;">
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${fotoSrc}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0;">
                        <div>
                            <span style="display:block; font-weight:700; color:var(--text-dark); font-size:13px;">${iconoRol} ${u.nombre || 'Funcionario'}</span>
                            <span style="font-size:11px; color:var(--text-light); font-weight:600;">UID: ${u.id.substring(0,6).toUpperCase()}</span>
                        </div>
                    </div>
                </td>
                <td style="font-weight:600; font-size:12.5px;">${emailSrc}</td>
                <td><span class="${claseRolBadge}">${rolImpresión}</span></td>
                <td style="text-align:center;"><span class="badge-status ${claseEstado}" style="padding:4px 10px; font-size:11px; border-radius:20px;">${estadoCuenta}</span></td>
                <td style="text-align:center; font-weight:500; font-size:12px; color:var(--text-dark);">${loginFormateado}</td>
                <td style="text-align:center;">${accionHtml}</td>
            </tr>`;
    });

    tbody.innerHTML = html || `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-light);">No se registran funcionarios bajo este filtro.</td></tr>`;
    document.getElementById("pag-info-usuarios").innerText = `Mostrando 1 a ${lista.length} de ${lista.length} funcionarios integrados`;

    conectarManejadoresEdicion();
}

// ==============================================================================
// 📋 CONFIGURACIÓN Y DESPLIEGUE DEL CONTENEDOR FOTOGRÁFICO DE ALTA RESOLUCIÓN
// ==============================================================================
function abrirModalFormularioUsuarioConActivacion(usuario) {
    const currentLoggedUid = auth.currentUser ? auth.currentUser.uid : "";
    const esMiPropioPerfil = (usuario.id === currentLoggedUid);
    archivoFotoPendiente = null; // Reiniciar cola de carga

    let rolFormulario = usuario.rol || "pendiente";
    if (rolFormulario === "admin" || rolFormulario === "Administrador") rolFormulario = "ADMIN";
    if (rolFormulario === "Moderador" || rolFormulario === "Equipo Territorial") rolFormulario = "GESTOR_TERRITORIAL";

    document.getElementById("mu-id-val").value = usuario.id;
    
    // --- NUEVO: CONTROL DEL AVATAR PREVIEW EN MODAL ---
    const imgPreview = document.getElementById("mu-avatar-preview");
    const placeholder = document.getElementById("mu-avatar-placeholder");
    const fotoUrlActual = usuario.foto || usuario.photoURL || usuario.fotoPerfil || "";

    if (imgPreview && placeholder) {
        if (fotoUrlActual && !fotoUrlActual.includes("photo-1535713875002-d1d0cf377fde")) {
            imgPreview.src = fotoUrlActual;
            imgPreview.style.display = "block";
            placeholder.style.display = "none";
        } else {
            imgPreview.src = "";
            imgPreview.style.display = "none";
            placeholder.style.display = "flex";
        }
    }

    const inputNombre = document.getElementById("mu-nombre");
    if (inputNombre) {
        inputNombre.value = usuario.nombre || "Funcionario";
        if (esMiPropioPerfil) {
            inputNombre.readOnly = true;
            inputNombre.style.backgroundColor = "#f1f5f9";
            inputNombre.style.cursor = "not-allowed";
        } else {
            inputNombre.readOnly = false;
            inputNombre.style.backgroundColor = "";
            inputNombre.style.cursor = "";
        }
    }

    const inputCorreo = document.getElementById("mu-correo");
    if (inputCorreo) {
        inputCorreo.value = usuario.correo || usuario.email || "";
        inputCorreo.readOnly = true;
        inputCorreo.style.backgroundColor = "#f1f5f9";
        inputCorreo.style.cursor = "not-allowed";
    }

    const selectRol = document.getElementById("mu-rol");
    if (selectRol) {
        selectRol.value = rolFormulario;
        if (esMiPropioPerfil) {
            selectRol.disabled = true;
            selectRol.style.backgroundColor = "#f1f5f9";
            selectRol.style.cursor = "not-allowed";
        } else {
            selectRol.disabled = false;
            selectRol.style.backgroundColor = "";
            selectRol.style.cursor = "";
        }
    }

    const selectEstado = document.getElementById("mu-estado");
    if (selectEstado) {
        selectEstado.value = usuario.estado || "Activo";
        if (esMiPropioPerfil) {
            selectEstado.disabled = true;
            selectEstado.style.backgroundColor = "#f1f5f9";
            selectEstado.style.cursor = "not-allowed";
        } else {
            selectEstado.disabled = false;
            selectEstado.style.backgroundColor = "";
            selectEstado.style.cursor = "";
        }
    }

    const inputRolVisual = document.getElementById("mu-rol-visual");
    if (inputRolVisual) inputRolVisual.value = usuario.rolVisual || "";

    const txtInfo = document.getElementById("mu-info");
    if (txtInfo) txtInfo.value = usuario.infoInterna || "";

    if (modalUsuario) modalUsuario.style.display = "flex";
}

function conectarManejadoresEdicion() {
    document.querySelectorAll(".user-row-click, .u-edit").forEach(elemento => {
        elemento.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = elemento.getAttribute("data-id");
            const usuario = usuariosMemory.find(u => u.id === id);
            if (!usuario) return;

            if (usuario.rol === "pendiente" || !usuario.rol) {
                mostrarConsolaJuicioInframundo(
                    usuario,
                    () => { abrirModalFormularioUsuarioConActivacion(usuario); },
                    async () => {
                        try {
                            const docRef = doc(db, "usuarios", id);
                            await updateDoc(docRef, { estado: "Inactivo", rol: "pendiente" });
                            await cargarUsuariosFirebase();
                            aplicarFiltrosUsuarios();
                            mostrarAlertaPersonalizada(`El usuario ${usuario.nombre} ha sido desterrado con éxito. ☠️`, "success");
                        } catch (error) {
                            console.error("Error en procesamiento infernal:", error);
                        }
                    }
                );
            } else {
                abrirModalFormularioUsuarioConActivacion(usuario);
            }
        });
    });

    document.querySelectorAll(".u-ban-fast").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = btn.getAttribute("data-id");
            const usuario = usuariosMemory.find(u => u.id === id);
            if (!usuario) return;

            mostrarConfirmacionPersonalizada(
                `¿Estás completamente seguro de desterrar inmediatamente a <b>${usuario.nombre}</b>?`,
                async () => {
                    try {
                        const docRef = doc(db, "usuarios", id);
                        await updateDoc(docRef, { estado: "Inactivo", rol: "pendiente" });
                        await cargarUsuariosFirebase();
                        aplicarFiltrosUsuarios();
                        mostrarAlertaPersonalizada(`El usuario ${usuario.nombre} ha sido desterrado con éxito. ☠️`, "success");
                    } catch (error) {
                        console.error("Error en destierro rápido:", error);
                    }
                }
            );
        });
    });
}

async function guardarCambiosUsuarioFirestore() {
    const id = document.getElementById("mu-id-val").value;
    const nuevoRol = document.getElementById("mu-rol").value;
    const nuevoEstado = document.getElementById("mu-estado").value;
    const btnGuardar = document.getElementById("btn-guardar-modal-usuario");

    const inputRolVisual = document.getElementById("mu-rol-visual");
    const txtInfo = document.getElementById("mu-info");
    const inputNombre = document.getElementById("mu-nombre");

    if (!id) return;
    btnGuardar.disabled = true;
    btnGuardar.innerText = "Sincronizando transacciones...";

    const currentLoggedUid = auth.currentUser ? auth.currentUser.uid : "";
    const esMiPropioPerfil = (id === currentLoggedUid);

    try {
        const docRef = doc(db, "usuarios", id);
        
        const payloadUpdate = {
            rolVisual: inputRolVisual ? inputRolVisual.value.trim() : "",
            infoInterna: txtInfo ? txtInfo.value.trim() : "",
            tenantId: CURRENT_TENANT_ID
        };

        // --- NUEVO: ACOPLAMIENTO DE CARGA DE IMAGEN REAL A STORAGE ---
        if (archivoFotoPendiente) {
            const storageRef = ref(storage, `fotos_usuarios/${id}`);
            await uploadBytes(storageRef, archivoFotoPendiente);
            const downloadURL = await getDownloadURL(storageRef);
            payloadUpdate.foto = downloadURL;
        }

        if (!esMiPropioPerfil) {
            payloadUpdate.rol = nuevoRol;
            payloadUpdate.estado = nuevoEstado;
            if (inputNombre) payloadUpdate.nombre = inputNombre.value.trim();

            if (payloadUpdate.rolVisual && payloadUpdate.rolVisual.toLowerCase() === "concejal") {
                payloadUpdate.esConcejal = true;
                payloadUpdate.apellidoConcejal = (payloadUpdate.nombre || "Aguayo").split(" ").pop();
            }
        }

        await updateDoc(docRef, payloadUpdate);

        if (modalUsuario) modalUsuario.style.display = "none";
        
        await cargarUsuariosFirebase();
        aplicarFiltrosUsuarios();
        
        if (!esMiPropioPerfil && nuevoEstado === "Inactivo") {
            mostrarAlertaPersonalizada("El usuario ha sido desterrado con éxito. ☠️", "success");
        } else {
            mostrarAlertaPersonalizada("¡Rango y fotografía actualizados con éxito! Datos sincronizados en el Workspace.", "success");
        }

    } catch (error) {
        console.error("Error al mutar el rol en Firestore:", error);
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerText = "Actualizar Permisos";
    }
}