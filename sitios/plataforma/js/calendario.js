import { auth, db } from "./app.js";
import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    serverTimestamp,
    doc,
    deleteDoc,
    updateDoc,
    where // ◄ Añadido para filtrado de inquilino
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { inyectarEstructuraGlobal, actualizarPerfilLayout } from "./layout.js";

let fechaActual = new Date();
let eventosGlobales = [];

// ARQUITECTURA TENANT: Identificador maestro de aislamiento corporativo con Pasaporte Global
const subdominioDetectado = window.location.hostname.split('.')[0];
const CURRENT_TENANT_ID = sessionStorage.getItem('SIGEV_ACTIVE_TENANT') || ((subdominioDetectado === 'localhost' || subdominioDetectado === '127') ? "paz" : subdominioDetectado);

// Diccionario para traducir la clase de color a nombre real
const diccionarioNombresEventos = {
    "event-blue": "Reunión / Audiencia",
    "event-green": "Operativo Territorial",
    "event-orange": "Visita a Terreno",
    "event-purple": "Consejo Municipal",
    "event-red": "Urgencia / Emergencia"
};

// Inyección visual base
inyectarEstructuraGlobal();

auth.onAuthStateChanged(async (user) => {
    if (user) {
        actualizarPerfilLayout(user);
        inicializarBotonesCalendario();
        inicializarGestorEventos(); // Inicializamos la lógica de la tabla
        await cargarEventosFirebase();
        renderizarCalendario();
    }
});

// --- LÓGICA DE RENDERIZADO DEL CALENDARIO PRINCIPAL ---
function renderizarCalendario() {
    const contenedor = document.getElementById("calendario-dinamico");
    const tituloMes = document.getElementById("cal-mes-año");
    if (!contenedor || !tituloMes) return;

    const año = fechaActual.getFullYear();
    const mes = fechaActual.getMonth();

    // Nombres de los meses
    const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    tituloMes.innerText = `${nombresMeses[mes]} ${año}`;

    // Matematica del calendario
    const primerDiaMes = new Date(año, mes, 1);
    const ultimoDiaMes = new Date(año, mes + 1, 0);
    const totalDias = ultimoDiaMes.getDate();
    
    // Ajuste para que la semana empiece en Lunes (0 = Lunes, 6 = Domingo)
    let diaInicioSemana = primerDiaMes.getDay();
    diaInicioSemana = diaInicioSemana === 0 ? 6 : diaInicioSemana - 1;

    const diasPrevios = new Date(año, mes, 0).getDate();

    // Dibujar Cabeceras
    let html = `
        <div class="calendar-day-header">Lun</div>
        <div class="calendar-day-header">Mar</div>
        <div class="calendar-day-header">Mié</div>
        <div class="calendar-day-header">Jue</div>
        <div class="calendar-day-header">Vie</div>
        <div class="calendar-day-header">Sáb</div>
        <div class="calendar-day-header">Dom</div>
    `;

    // Celdas del mes anterior
    for (let i = diaInicioSemana - 1; i >= 0; i--) {
        html += `<div class="calendar-cell-full muted"><div class="cell-number-full">${diasPrevios - i}</div></div>`;
    }

    // Celdas del mes actual
    const hoy = new Date();
    for (let dia = 1; dia <= totalDias; dia++) {
        const esHoy = (dia === hoy.getDate() && mes === hoy.getMonth() && año === hoy.getFullYear());
        const claseHoy = esHoy ? "today" : "";
        
        // Formato para buscar eventos: YYYY-MM-DD
        const fechaStr = `${año}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        
        // Extraer eventos para este día específico
        const eventosDelDia = eventosGlobales.filter(ev => ev.fecha === fechaStr);
        let htmlEventos = "";
        
        eventosDelDia.forEach(ev => {
            htmlEventos += `<div class="event-pill ${ev.tipo}" title="${ev.titulo}\n${ev.hora || ''}">${ev.titulo}</div>`;
        });

        html += `
            <div class="calendar-cell-full ${claseHoy}">
                <div class="cell-number-full">${dia}</div>
                ${htmlEventos}
            </div>
        `;
    }

    // Completar cuadrícula
    const celdasTotales = diaInicioSemana + totalDias;
    const celdasFaltantes = (7 - (celdasTotales % 7)) % 7;
    for (let i = 1; i <= celdasFaltantes; i++) {
        html += `<div class="calendar-cell-full muted"><div class="cell-number-full">${i}</div></div>`;
    }

    contenedor.innerHTML = html;
}

// --- CONTROLES DE NAVEGACIÓN Y AGENDAMIENTO ---
function inicializarBotonesCalendario() {
    document.getElementById("btn-cal-prev").addEventListener("click", () => {
        fechaActual.setMonth(fechaActual.getMonth() - 1);
        renderizarCalendario();
    });

    document.getElementById("btn-cal-next").addEventListener("click", () => {
        fechaActual.setMonth(fechaActual.getMonth() + 1);
        renderizarCalendario();
    });

    document.getElementById("btn-cal-hoy").addEventListener("click", () => {
        fechaActual = new Date();
        renderizarCalendario();
    });

    // Lógica del Modal de Ingreso/Edición
    const modal = document.getElementById("modal-evento");
    const tituloModal = document.getElementById("modal-evento-titulo");
    const btnGuardar = document.getElementById("btn-guardar-evento");

    document.getElementById("btn-abrir-modal-evento").addEventListener("click", () => {
        document.getElementById("form-evento").reset();
        document.getElementById("ev-id-val").value = ""; // Limpiar ID de edición
        tituloModal.innerText = "Agendar Actividad";
        btnGuardar.innerText = "Guardar Evento";
        modal.style.display = "flex";
    });

    const cerrarModal = () => { modal.style.display = "none"; };
    document.getElementById("btn-cerrar-evento").addEventListener("click", cerrarModal);
    document.getElementById("btn-cancelar-evento").addEventListener("click", cerrarModal);
    
    // Controladores de cierre en overlays grises de fondo
    window.addEventListener("click", (e) => { 
        if (e.target === modal) cerrarModal(); 
        if (e.target === document.getElementById("modal-visor-evento")) document.getElementById("modal-visor-evento").style.display = "none";
    });

    // Botones del modal de lectura Visor
    document.getElementById("btn-cerrar-visor-evento").addEventListener("click", () => { document.getElementById("modal-visor-evento").style.display = "none"; });
    document.getElementById("btn-ok-visor-evento").addEventListener("click", () => { document.getElementById("modal-visor-evento").style.display = "none"; });

    // Guardar o Actualizar Evento en Firebase
    btnGuardar.addEventListener("click", async (e) => {
        e.preventDefault();
        const idExistente = document.getElementById("ev-id-val").value;
        const titulo = document.getElementById("ev-titulo").value.trim();
        const fecha = document.getElementById("ev-fecha").value;
        const hora = document.getElementById("ev-hora").value;
        const tipo = document.getElementById("ev-tipo").value;
        const desc = document.getElementById("ev-descripcion").value.trim();

        if (!titulo || !fecha) {
            alert("El título y la fecha son obligatorios.");
            return;
        }

        btnGuardar.disabled = true;
        btnGuardar.innerText = "Sincronizando...";

        try {
            // CORRECCIÓN: Se añade de forma nativa la propiedad tenantId al payload maestro de control
            const payload = {
                titulo, fecha, hora, tipo, descripcion: desc,
                tenantId: CURRENT_TENANT_ID, // ◄ Timbre de inquilino asignado
                creadoPor: auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email) : "Equipo Territorial"
            };

            if (idExistente) {
                // MODO ACTUALIZAR / EDITAR
                await updateDoc(doc(db, "eventos", idExistente), payload);
                const index = eventosGlobales.findIndex(ev => ev.id === idExistente);
                if (index !== -1) {
                    eventosGlobales[index] = { ...eventosGlobales[index], ...payload };
                }
            } else {
                // MODO INGRESAR NUEVO
                payload.fechaCreacion = serverTimestamp();
                const docRef = await addDoc(collection(db, "eventos"), payload);
                eventosGlobales.push({ id: docRef.id, ...payload }); 
            }
            
            cerrarModal();
            renderizarCalendario();
            if (document.getElementById("modal-lista-eventos").style.display === "flex"){
                renderizarTablaEventos(); // Refrescar tabla si está abierta
            }
        } catch (error) {
            console.error(error);
        } finally {
            btnGuardar.disabled = false;
            btnGuardar.innerText = "Guardar Evento";
        }
    });
}

// --- LÓGICA: GESTOR DE EVENTOS (TABLA Y FILTROS) ---
function inicializarGestorEventos() {
    const modalGestor = document.getElementById("modal-lista-eventos");
    const btnAbrirGestor = document.getElementById("btn-gestionar-eventos");
    const btnCerrarGestor = document.getElementById("btn-cerrar-lista-eventos");

    // 🚀 INYECCIÓN DINÁMICA DE LA "X" DE CIERRE PARA LA LISTA DE EVENTOS
    if (modalGestor) {
        // Busca el contenedor principal dentro del modal
        const cardContenedor = modalGestor.querySelector('.profile-modal-card') || modalGestor.firstElementChild || modalGestor;
        
        // Verificamos que no lo hayamos inyectado ya
        if (cardContenedor && !document.getElementById("btn-cerrar-lista-top")) {
            const btnCloseTop = document.createElement("button");
            btnCloseTop.id = "btn-cerrar-lista-top";
            btnCloseTop.className = "btn-close-modal";
            btnCloseTop.innerHTML = "&times;"; // La "X" clásica de cierre
            
            btnCloseTop.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                modalGestor.style.display = "none";
            };
            
            // Lo insertamos dentro de la tarjeta
            cardContenedor.appendChild(btnCloseTop);
        }
    }

    const inputFiltroTitulo = document.getElementById("filtro-ev-titulo");
    const selectFiltroTipo = document.getElementById("filtro-ev-tipo");

    // Abrir Modal y renderizar
    btnAbrirGestor.addEventListener("click", () => {
        if(inputFiltroTitulo) inputFiltroTitulo.value = "";
        if(selectFiltroTipo) selectFiltroTipo.value = "Todos";
        modalGestor.style.display = "flex";
        renderizarTablaEventos();
    });

    // Cerrar Modal (con botón de abajo si existe)
    const cerrarGestor = () => { modalGestor.style.display = "none"; };
    if (btnCerrarGestor) btnCerrarGestor.addEventListener("click", cerrarGestor);
    window.addEventListener("click", (e) => { if (e.target === modalGestor) cerrarGestor(); });

    // Escuchar filtros en tiempo real
    if (inputFiltroTitulo) inputFiltroTitulo.addEventListener("input", renderizarTablaEventos);
    if (selectFiltroTipo) selectFiltroTipo.addEventListener("change", renderizarTablaEventos);
}

function renderizarTablaEventos() {
    const tbody = document.querySelector("#tabla-eventos tbody");
    if (!tbody) return;

    const textoFiltro = document.getElementById("filtro-ev-titulo").value.toLowerCase();
    const tipoFiltro = document.getElementById("filtro-ev-tipo").value;

    // Filtrar la memoria de eventos
    let filtrados = eventosGlobales.filter(ev => {
        const coincideTexto = ev.titulo.toLowerCase().includes(textoFiltro);
        const coincideTipo = (tipoFiltro === "Todos") || (ev.tipo === tipoFiltro);
        return coincideTexto && coincideTipo;
    });

    // Ordenar del más reciente al más antiguo por fecha
    filtrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    let html = "";
    filtrados.forEach(ev => {
        const partesFecha = ev.fecha.split("-");
        const fechaLegible = partesFecha.length === 3 ? `${partesFecha[2]}/${partesFecha[1]}/${partesFecha[0]}` : ev.fecha;
        const horaLegible = ev.hora ? `${ev.hora} hrs` : "Todo el día";
        const nombreTipo = diccionarioNombresEventos[ev.tipo] || "General";

        html += `
            <tr>
                <td style="white-space: nowrap;">
                    <span style="display: block; font-weight: 700; color: var(--primary-blue); font-size: 13px;">${fechaLegible}</span>
                    <span style="font-size: 11px; color: var(--text-light); font-weight: 600;">${horaLegible}</span>
                </td>
                <td>
                    <span style="display: block; font-weight: 600; color: var(--text-dark); font-size: 13px;">${ev.titulo}</span>
                    <span style="display: block; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11.5px; color: var(--text-light); margin-top: 2px;" title="${ev.descripcion || 'Sin descripción adicional'}">${ev.descripcion || 'Sin descripción adicional'}</span>
                </td>
                <td>
                    <div class="event-pill ${ev.tipo}" style="display: inline-block; cursor: default; margin: 0;">${nombreTipo}</div>
                </td>
                <td style="text-align: center;">
                    <div style="display: flex; justify-content: center; gap: 8px;">
                        <button class="btn-ver-evento" data-id="${ev.id}" style="background: none; border: none; cursor: pointer; color: var(--primary-blue); transition: 0.2s;" title="Ver Evento Completo">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="17" height="17">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                        <button class="btn-editar-evento" data-id="${ev.id}" style="background: none; border: none; cursor: pointer; color: #64748b; transition: 0.2s;" title="Editar Parámetros">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="17" height="17">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="btn-eliminar-evento" data-id="${ev.id}" style="background: none; border: none; cursor: pointer; color: #ef4444; transition: 0.2s;" title="Eliminar Evento">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="17" height="17">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>`;
    });

    if (filtrados.length === 0) {
        html = `<tr><td colspan="4" style="text-align:center; padding: 30px; color: var(--text-light);">No se encontraron eventos con los filtros actuales.</td></tr>`;
    }

    tbody.innerHTML = html;

    // Conectar eventos dinámicos a la botonera de la fila
    tbody.querySelectorAll(".btn-ver-evento").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = e.currentTarget.getAttribute("data-id");
            abrirVisorEvento(id);
        });
    });

    tbody.querySelectorAll(".btn-editar-evento").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = e.currentTarget.getAttribute("data-id");
            abrirEditorEvento(id);
        });
    });

    tbody.querySelectorAll(".btn-eliminar-evento").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const idEvento = e.currentTarget.getAttribute("data-id");
            if (confirm("¿Estás seguro de que deseas eliminar permanentemente esta actividad del calendario?")) {
                await eliminarEventoFirebase(idEvento);
            }
        });
    });
}

// --- CONTROL DE SUB-MODALES (VISOR Y EDITOR) ---
function abrirVisorEvento(id) {
    const ev = eventosGlobales.find(e => e.id === id);
    if (!ev) return;

    const partesFecha = ev.fecha.split("-");
    const fechaLegible = partesFecha.length === 3 ? `${partesFecha[2]}/${partesFecha[1]}/${partesFecha[0]}` : ev.fecha;

    document.getElementById("v-ev-titulo").innerText = ev.titulo;
    // Se corrige un pequeño typo en el diccionario: diccionarioNombresEventEventos -> diccionarioNombresEventos
    document.getElementById("v-ev-tipo-texto").innerText = diccionarioNombresEventos[ev.tipo] || "General";
    document.getElementById("v-ev-fecha").innerText = fechaLegible;
    document.getElementById("v-ev-hora").innerText = ev.hora ? `${ev.hora} hrs` : "Todo el día";
    document.getElementById("v-ev-creador").innerText = ev.creadoPor || "Equipo Territorial";
    document.getElementById("v-ev-descripcion").innerText = ev.descripcion || "Sin observaciones o detalles adicionales registrados.";

    document.getElementById("modal-visor-evento").style.display = "flex";
}

function abrirEditorEvento(id) {
    const ev = eventosGlobales.find(e => e.id === id);
    if (!ev) return;

    // Repoblar formulario con la data actual de Firestore
    document.getElementById("ev-id-val").value = ev.id;
    document.getElementById("ev-titulo").value = ev.titulo;
    document.getElementById("ev-fecha").value = ev.fecha;
    document.getElementById("ev-hora").value = ev.hora || "";
    document.getElementById("ev-tipo").value = ev.tipo;
    document.getElementById("ev-descripcion").value = ev.descripcion || "";

    document.getElementById("modal-evento-titulo").innerText = "Editar Actividad";
    document.getElementById("btn-guardar-evento").innerText = "Guardar Cambios";

    document.getElementById("modal-evento").style.display = "flex";
}

// Lógica para Borrar Eventos Reales de Firebase
async function eliminarEventoFirebase(id) {
    try {
        await deleteDoc(doc(db, "eventos", id));
        // Sacarlo de la memoria local
        eventosGlobales = eventosGlobales.filter(ev => ev.id !== id);
        
        renderizarTablaEventos();
        renderizarCalendario();
    } catch (error) {
        console.error("Error de conexión eliminando el evento: ", error);
        alert("Hubo un error al intentar eliminar el evento. Revisa tu conexión.");
    }
}

// CORRECCIÓN: Cargar desde Firebase filtrando por query de TenantId estricto
async function cargarEventosFirebase() {
    try {
        const q = query(collection(db, "eventos"), where("tenantId", "==", CURRENT_TENANT_ID));
        const querySnapshot = await getDocs(q);
        eventosGlobales = [];
        querySnapshot.forEach(doc => {
            eventosGlobales.push({ id: doc.id, ...doc.data() });
        });
    } catch (error) {
        console.error("Error cargando eventos en el canal del Tenant:", error);
    }
}