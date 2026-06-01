// 1. Importamos la instancia segura de autenticación y BD compartidas para el control de sesión
import { auth, db } from "./app.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==============================================================================
// 0. ANTI-FLASH DEL MODO OSCURO (EJECUCIÓN INMEDIATA)
// ==============================================================================
// Leemos la memoria caché local antes de que el navegador dibuje la pantalla
const temaGuardado = localStorage.getItem("sigev_tema_cache");
if (temaGuardado === "oscuro") {
    document.documentElement.style.setProperty('--bg-workspace', '#0f172a');
    document.documentElement.style.setProperty('--card-bg', '#1e293b');
    document.documentElement.style.setProperty('--text-dark', '#f8fafc');
    document.documentElement.style.setProperty('--text-light', '#94a3b8');
    document.documentElement.style.setProperty('--border-color', '#334155');
    document.documentElement.style.setProperty('--input-bg', '#161e2e');
} else if (temaGuardado === "claro") {
    document.documentElement.style.setProperty('--bg-workspace', '#f1f5f9');
    document.documentElement.style.setProperty('--card-bg', '#ffffff');
    document.documentElement.style.setProperty('--text-dark', '#0f172a');
    document.documentElement.style.setProperty('--text-light', '#64748b');
    document.documentElement.style.setProperty('--border-color', '#e2e8f0');
    document.documentElement.style.setProperty('--input-bg', '#ffffff');
}

// ==============================================================================
// 1. PLANTILLAS HTML (TEMPLATE LITERALS)
// ==============================================================================

const SIDEBAR_HTML = `
<aside class="sidebar" style="background-color: #093570; transition: background-color 0.4s ease;">
    <div class="sidebar-brand" id="sidebar-brand-container" style="display: flex; justify-content: center; align-items: center; height: 120px; min-height: 120px; max-height: 120px; padding: 0; box-sizing: border-box; opacity: 0; transition: opacity 0.4s ease; overflow: hidden; flex-shrink: 0;">
        </div>
    
    <div class="sidebar-profile" id="sidebar-profile-container" style="opacity: 0; transition: opacity 0.4s ease; padding-top: 14px; padding-bottom: 24px; padding-left: 10px; padding-right: 10px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 65px; box-sizing: border-box; flex-shrink: 0; width: 100%;">
        <h2 id="sidebar-dynamic-title" style="font-size: 14.5px; font-weight: 800; color: #ffffff; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px; min-height: 18px; text-align: center; width: 100%; display: block; transition: color 0.4s ease;">SIGEV-AGUAYO</h2>
        <p id="sidebar-dynamic-subtitle" style="font-size: 11.5px; color: rgba(255,255,255,0.7); margin: 0; font-weight: 500; min-height: 14px; text-align: center; width: 100%; display: block; transition: color 0.4s ease;">Portal Territorial Vecinal</p>
    </div>
    
    <ul class="sidebar-menu">
        <li class="sidebar-item" data-page="dashboard.html">
            <a href="dashboard.html">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                Dashboard
            </a>
        </li>
        <li class="sidebar-item" data-page="vecinos.html">
            <a href="vecinos.html">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                Vecinos
            </a>
        </li>
        <li class="sidebar-item" data-page="solicitudes.html">
            <a href="solicitudes.html">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                Solicitudes
            </a>
        </li>
        <li class="sidebar-item" data-page="buzon.html">
            <a href="buzon.html">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                Buzón Ciudadano
            </a>
        </li>
        <li class="sidebar-item" data-page="donaciones.html">
            <a href="donaciones.html">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                Donaciones
            </a>
        </li>
        <li class="sidebar-item" data-page="calendario.html">
            <a href="calendario.html">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="14" y2="10"></line></svg>
                Calendario
            </a>
        </li>
        <li class="sidebar-item" data-page="concejos.html">
            <a href="concejos.html">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16M10 14h4M3 10h18M3 7l9-4 9 4M4 10v12M20 10v12M8 10v12M16 10v12"/></svg>
                Concejo Municipal
            </a>
        </li>
        <li class="sidebar-item" data-page="reportes.html">
            <a href="#">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                Reportes
            </a>
        </li>
        <li class="sidebar-item" data-page="usuarios.html">
            <a href="usuarios.html">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                Usuarios
            </a>
        </li>
        <li class="sidebar-item" data-page="mapa.html">
            <a href="mapa.html">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>
                Mapa Territorial
            </a>
        </li>
        <li class="sidebar-item" data-page="documentos.html">
            <a href="documentos.html">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                Documentos
            </a>
        </li>
        <li class="sidebar-item" data-page="configuracion.html">
            <a href="configuracion.html">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1.01 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1-2-2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                Configuración
            </a>
        </li>
    </ul>
</aside>
<div class="sidebar-menu-overlay" id="sidebar-overlay-tap"></div>
`;

const TOPBAR_HTML = `
<header class="top-bar" style="display: flex; align-items: center; justify-content: space-between; transition: background-color 0.4s ease, border-color 0.4s ease;">
    <div class="top-bar-title" style="display: flex; align-items: center; flex: 1;">
        <button id="btn-toggle-sidebar-mobile" class="hamburger-menu-btn" style="background: none; border: none; cursor: pointer; padding: 6px; display: none; align-items: center; justify-content: center; color: #64748b; margin-right: 14px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="22" height="22"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div id="topbar-identity-container" style="display: flex; flex-direction: column; align-items: flex-start; margin-left: 10px; opacity: 0; transition: opacity 0.4s ease; min-height: 35px; justify-content: center;">
            <h2 id="topbar-dynamic-title" style="font-size: 14.5px; font-weight: 800; margin: 0 0 2px 0; text-transform: uppercase; letter-spacing: 0.5px; min-height: 18px; transition: color 0.4s ease;"></h2>
            <p id="topbar-dynamic-subtitle" style="font-size: 11.5px; margin: 0; font-weight: 500; min-height: 14px; transition: color 0.4s ease;"></p>
        </div>
    </div>
    
    <div class="top-bar-center" style="flex: 1; display: flex; justify-content: center; align-items: center;">
        <span id="live-clock" style="font-variant-numeric: tabular-nums; transition: all 0.3s ease; opacity: 0;"></span>
    </div>
    
    <div class="top-bar-actions" style="display: flex; align-items: center; flex: 1; justify-content: flex-end;">
        <div id="nav-btn-notificaciones" style="position: relative; cursor: pointer; margin-right: 24px; display: flex; align-items: center; justify-content: center; color: #64748b;" title="Ver notificaciones">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: 0.2s;">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            <span class="notif-badge" style="position: absolute; top: -3px; right: -3px; background-color: #ef4444; color: white; font-size: 9px; font-weight: 800; height: 16px; width: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);">3</span>
            
            <div id="notif-dropdown" style="display: none; position: absolute; top: 35px; right: -10px; width: 340px; background: #fff; border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); z-index: 1000; cursor: default; text-align: left;">
                <div style="padding: 12px 16px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                    <h4 style="margin: 0; font-size: 14px; color: var(--text-dark);">Notificaciones</h4>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 11px; color: var(--primary-blue); cursor: pointer; font-weight: 600;" id="notif-mark-read">Marcar como leídas</span>
                        <button id="notif-clear-all" style="background: none; border: none; cursor: pointer; padding: 4px; display: inline-flex; align-items: center; color: #ef4444; transition: 0.2s;" title="Eliminar todas las notificaciones">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
                
                <div id="notif-items-body" style="max-height: 280px; overflow-y: auto;">
                    <div style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; display: flex; gap: 12px; align-items: flex-start; transition: background 0.2s; cursor: pointer;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">
                        <div style="background: rgba(37, 99, 235, 0.1); color: #2563eb; padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
                        </div>
                        <div>
                            <p style="margin: 0; font-size: 12.5px; color: var(--text-dark); line-height: 1.4;"><strong>Nuevo vecino registrado:</strong> El sistema ha registrado un nuevo expediente territorial.</p>
                            <span style="font-size: 10px; color: var(--text-light);">Hace 10 min</span>
                        </div>
                    </div>
                </div>
                
                <div style="padding: 10px; text-align: center; border-top: 1px solid var(--border-color); background: #f8fafc; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                    <a href="solicitudes.html" style="font-size: 12px; color: var(--primary-blue); text-decoration: none; font-weight: 600;">Ver panel completo de gestión</a>
                </div>
            </div>
        </div>

        <div class="user-profile" id="user-profile-logout" title="Haga clic aquí para cerrar sesión" style="cursor: pointer; opacity: 0; transition: opacity 0.4s ease;">
            <img id="user-avatar" src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100" alt="Avatar" class="user-avatar">
            <div class="user-info">
                <h4 id="user-display-name">Equipo...</h4>
                <p id="user-display-role">Cargando Credenciales...</p>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--text-light); margin-left: 4px;"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
    </div>
</header>
`;

// ==============================================================================
// 2. MOTORES PRINCIPALES DE INYECCIÓN
// ==============================================================================

export async function inyectarEstructuraGlobal() {
    const sidebarContainer = document.getElementById("sidebar-container");
    const topbarContainer = document.getElementById("topbar-container");

    if (sidebarContainer) sidebarContainer.innerHTML = SIDEBAR_HTML;
    if (topbarContainer) topbarContainer.innerHTML = TOPBAR_HTML;

    const logoArea = document.getElementById("sidebar-brand-container");
    const profileArea = document.getElementById("sidebar-profile-container");
    const topbarIdentityArea = document.getElementById("topbar-identity-container");
    const topbarUserArea = document.getElementById("user-profile-logout");
    const clockEl = document.getElementById("live-clock");

    // --- RECOPILADOR: APLICACIÓN DE BRANDING DINÁMICO (SaaS) ---
    try {
        const configRef = doc(db, "configuracion_tenant", "aguayo");
        const configSnap = await getDoc(configRef);
        
        if (configSnap.exists()) {
            const data = configSnap.data();

            // === 1. CONTROL SEPARADO DE MODO CLARO / OSCURO ===
            const topbarEl = document.querySelector(".top-bar");
            const titleTopbar = document.getElementById("topbar-dynamic-title");
            const subtitleTopbar = document.getElementById("topbar-dynamic-subtitle");

            const sidebarEl = document.querySelector(".sidebar");
            if (sidebarEl) sidebarEl.style.backgroundColor = '#093570';

            // Guardamos el tema en caché para la próxima recarga
            localStorage.setItem("sigev_tema_cache", data.temaPlataforma || "claro");

            if (data.temaPlataforma === "claro") {
                document.documentElement.style.setProperty('--bg-workspace', '#f1f5f9');
                document.documentElement.style.setProperty('--card-bg', '#ffffff');
                document.documentElement.style.setProperty('--text-dark', '#0f172a');
                document.documentElement.style.setProperty('--text-light', '#64748b');
                document.documentElement.style.setProperty('--border-color', '#e2e8f0');
                document.documentElement.style.setProperty('--input-bg', '#ffffff');
                
                if (topbarEl) topbarEl.style.backgroundColor = '#ffffff';
                if (titleTopbar) titleTopbar.style.color = '#0f172a';
                if (subtitleTopbar) subtitleTopbar.style.color = '#64748b';
            } else {
                document.documentElement.style.setProperty('--bg-workspace', '#0f172a');
                document.documentElement.style.setProperty('--card-bg', '#1e293b');
                document.documentElement.style.setProperty('--text-dark', '#f8fafc');
                document.documentElement.style.setProperty('--text-light', '#94a3b8');
                document.documentElement.style.setProperty('--border-color', '#334155');
                document.documentElement.style.setProperty('--input-bg', '#161e2e'); 
                
                if (topbarEl) topbarEl.style.backgroundColor = '#1e293b';
                if (titleTopbar) titleTopbar.style.color = '#f8fafc';
                if (subtitleTopbar) subtitleTopbar.style.color = '#94a3b8';
            }
            
            // === 2. INYECCIÓN DE LOGO PARAMÉTRICO ===
            if (data.sidebarLogoUrl && logoArea) {
                const imgPreload = new Image();
                imgPreload.src = data.sidebarLogoUrl;
                
                imgPreload.onload = () => {
                    logoArea.innerHTML = `
                        <div style="background-color: #ffffff; padding: 10px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); width: 80%; height: 80px; display: flex; align-items: center; justify-content: center; box-sizing: border-box;">
                            <img src="${data.sidebarLogoUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;">
                        </div>
                    `;
                    logoArea.style.opacity = "1"; 
                };
                
                imgPreload.onerror = () => {
                    logoArea.innerHTML = `<svg class="rayo-logo" viewBox="0 0 24 24" style="width: 40px; height: 40px; fill: #eab308;"><path d="M11 21h-1l1-7H5.5L14 3h1l-1 7h5.5L14 21z"/></svg>`;
                    logoArea.style.opacity = "1";
                };
            } else if (logoArea) {
                logoArea.innerHTML = `<svg class="rayo-logo" viewBox="0 0 24 24" style="width: 40px; height: 40px; fill: #eab308;"><path d="M11 21h-1l1-7H5.5L14 3h1l-1 7h5.5L14 21z"/></svg>`;
                logoArea.style.opacity = "1";
            }
            
            // === 3. IDENTIDAD TEXTUAL PARAMÉTRICA ===
            if (data.sidebarTitle) {
                const headSidebarProfile = document.getElementById("sidebar-dynamic-title");
                if (headSidebarProfile) headSidebarProfile.innerText = data.sidebarTitle;
                if (titleTopbar) titleTopbar.innerText = data.sidebarTitle;
            } else {
                const headSidebarProfile = document.getElementById("sidebar-dynamic-title");
                if (headSidebarProfile) headSidebarProfile.innerText = "SIGEV-AGUAYO";
                if (titleTopbar) titleTopbar.innerText = "Sistema de Gestión Vecinal";
            }
            
            if (data.sidebarSubtitle) {
                const subSidebarProfile = document.getElementById("sidebar-dynamic-subtitle");
                if (subSidebarProfile) subSidebarProfile.innerText = data.sidebarSubtitle;
                if (subtitleTopbar) subtitleTopbar.innerText = data.sidebarSubtitle;
            } else {
                const subSidebarProfile = document.getElementById("sidebar-dynamic-subtitle");
                if (subSidebarProfile) subSidebarProfile.innerText = "Portal Territorial Vecinal";
                if (subtitleTopbar) subtitleTopbar.innerText = "Concejal Gonzalo Aguayo – La Cisterna";
            }

            // === 4. ESTILOS DE RELOJ DINÁMICO ===
            if (clockEl) {
                if (data.estiloReloj === "2") {
                    clockEl.style.cssText = "color: var(--text-dark); font-weight: 700; font-size: 15px; font-variant-numeric: tabular-nums; padding: 4px 12px; border-bottom: 3px solid #3b82f6; letter-spacing: 0.5px; background: transparent; border-radius: 0; opacity: 1;";
                } else if (data.estiloReloj === "3") {
                    clockEl.style.cssText = "color: #38bdf8; font-weight: 800; font-size: 15px; font-variant-numeric: tabular-nums; background: #0f172a; padding: 6px 16px; border-radius: 8px; border: 1px solid #1e293b; box-shadow: inset 0 2px 4px rgba(0,0,0,0.5); letter-spacing: 1px; opacity: 1;";
                } else {
                    clockEl.style.cssText = "color: #2563eb; font-weight: 700; font-size: 15px; font-variant-numeric: tabular-nums; background: rgba(59, 130, 246, 0.08); padding: 6px 16px; border-radius: 30px; border: 1px solid rgba(59, 130, 246, 0.2); letter-spacing: 0.3px; opacity: 1;";
                }
            }
            
            if (profileArea) profileArea.style.opacity = "1";
            if (topbarIdentityArea) topbarIdentityArea.style.opacity = "1";
            if (topbarUserArea) topbarUserArea.style.opacity = "1";

        } else {
            if (logoArea) {
                logoArea.innerHTML = `<svg class="rayo-logo" viewBox="0 0 24 24" style="width: 40px; height: 40px; fill: #eab308;"><path d="M11 21h-1l1-7H5.5L14 3h1l-1 7h5.5L14 21z"/></svg>`;
                logoArea.style.opacity = "1";
            }
            const headSidebarProfile = document.getElementById("sidebar-dynamic-title");
            if (headSidebarProfile) headSidebarProfile.innerText = "SIGEV-AGUAYO";
            const titleTopbar = document.getElementById("topbar-dynamic-title");
            if (titleTopbar) titleTopbar.innerText = "Sistema de Gestión Vecinal";
            if (profileArea) profileArea.style.opacity = "1";
            if (topbarIdentityArea) topbarIdentityArea.style.opacity = "1";
            if (topbarUserArea) topbarUserArea.style.opacity = "1";
        }
    } catch (err) {
        console.error("Error al inyectar branding paramétrico en el layout:", err);
    }

    marcarMenuActivo();
    inicializarRelojMundial();
    inicializarNotificaciones();
    inicializarMenuMobile();
    inicializarManejadorLogout(); 
    ejecutarPrunerDeSeguridadMenu();
}

// ==============================================================================
// 3. FUNCIONES LÓGICAS DEL ENTORNO
// ==============================================================================

function mostrarConfirmacionLogoutPersonalizada(nombreUsuario, onConfirm) {
    const overlay = document.createElement("div");
    overlay.className = "custom-alert-overlay";
    overlay.innerHTML = `
        <div class="custom-alert-card" style="max-width: 400px; padding: 28px;">
            <div class="custom-alert-icon" style="background-color: rgba(59, 130, 246, 0.08); color: #2563eb; font-size: 24px; padding: 4px; border: 1px solid rgba(59,130,246,0.15);">👋</div>
            <div class="custom-alert-title" style="color: var(--text-dark); font-size: 16px; margin-top: 14px;">¿Finalizar sesión de trabajo?</div>
            <div class="custom-alert-message" style="line-height: 1.5; color: var(--text-light); font-size: 13px; margin-bottom: 22px;">
                Hola <b>${nombreUsuario}</b>, estás a punto de salir del ecosistema SIGEV-AGUAYO.<br>¿Deseas cerrar tu sesión activa de forma segura?
            </div>
            <div style="display: flex; gap: 12px; justify-content: center; width: 100%;">
                <button class="btn-confirmar-logout-ui" style="background-color: #2563eb; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 700; cursor: pointer; flex: 1; transition: background 0.2s;" onmouseenter="this.style.background='#1d4ed8'" onmouseleave="this.style.background='#2563eb'">Cerrar Sesión</button>
                <button class="btn-cancelar-logout-ui" style="background-color: #f1f5f9; color: #475569; border: 1px solid var(--border-color); padding: 10px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; flex: 1; transition: background 0.2s;" onmouseenter="this.style.background='#e2e8f0'" onmouseleave="this.style.background='#f1f5f9'">Permanecer</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    
    const btnConfirmar = overlay.querySelector(".btn-confirmar-logout-ui");
    if (btnConfirmar) btnConfirmar.focus();

    btnConfirmar.onclick = () => { overlay.remove(); onConfirm(); };
    overlay.querySelector(".btn-cancelar-logout-ui").onclick = () => overlay.remove();
}

function ejecutarPrunerDeSeguridadMenu() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const docRef = doc(db, "usuarios", user.uid);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    const userData = docSnap.data();
                    const rol = userData.rol;
                    
                    let iconoRolTopbar = "⏳";
                    if (rol === "SUPER_ADMIN") iconoRolTopbar = "🎩";
                    else if (rol === "ADMIN" || rol === "admin") iconoRolTopbar = "👑";
                    else if (rol === "GESTOR_TERRITORIAL") iconoRolTopbar = "⭐";

                    const nameLabel = document.getElementById("user-display-name");
                    if (nameLabel) {
                        nameLabel.innerHTML = `${iconoRolTopbar} ${userData.nombre || user.displayName || nameLabel.innerText}`;
                    }

                    const labelRol = document.getElementById("user-display-role");
                    if (labelRol) {
                        labelRol.innerText = userData.rolVisual || (rol === "SUPER_ADMIN" ? "Super Administrador" : rol === "ADMIN" ? "Administrador" : "Gestor Territorial");
                    }

                    const avatar = document.getElementById("user-avatar");
                    if (avatar && userData.foto) {
                        avatar.src = userData.foto;
                    }

                    if (rol === "GESTOR_TERRITORIAL" || rol === "mod") {
                        const tabUsuarios = document.querySelector('[data-page="usuarios.html"]');
                        const tabConfiguracion = document.querySelector('[data-page="configuracion.html"]');
                        
                        if (tabUsuarios) tabUsuarios.remove(); 
                        if (tabConfiguracion) tabConfiguracion.remove(); 
                    }
                }
            } catch (error) {
                console.error("Error aplicando restricciones de jerarquía en el menú lateral:", error);
            }
        }
    });
}

function marcarMenuActivo() {
    const rutaActual = window.location.pathname.split("/").pop();
    const items = document.querySelectorAll(".sidebar-item");
    
    items.forEach(item => {
        item.classList.remove("active");
        if (item.getAttribute("data-page") === rutaActual) {
            item.classList.add("active");
        }
    });
}

function fantasticalCenteringFallback(elementId, fallbackText) {
    const el = document.getElementById(elementId);
    if (el) {
        el.style.textAlign = "center";
        el.style.width = "100%";
        el.style.display = "block";
        if (!el.innerText.trim()) el.innerText = fallbackText;
    }
}

function inicializarRelojMundial() {
    const clockContainer = document.getElementById("live-clock");
    if (!clockContainer) return;
    
    const render = () => {
        const ahora = new Date();
        clockContainer.innerText = `${ahora.toLocaleDateString('es-CL')}    ${ahora.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    };
    render();
    setInterval(render, 1000);
}

function inicializarNotificaciones() {
    const campanaBtn = document.getElementById("nav-btn-notificaciones");
    const dropdown = document.getElementById("notif-dropdown");
    const markReadBtn = document.getElementById("notif-mark-read");
    const clearAllBtn = document.getElementById("notif-clear-all");
    const notifBody = document.getElementById("notif-items-body");
    const badge = campanaBtn ? campanaBtn.querySelector(".notif-badge") : null;

    if (!campanaBtn || !dropdown) return;

    campanaBtn.addEventListener("click", (e) => {
        e.stopPropagation(); 
        const isVisible = dropdown.style.display === "block";
        dropdown.style.display = isVisible ? "none" : "block";
    });

    dropdown.addEventListener("click", (e) => {
        e.stopPropagation();
    });

    if (markReadBtn) {
        markReadBtn.addEventListener("click", () => {
            if (badge) badge.style.display = "none";
            dropdown.style.display = "none";
        });
    }

    if (clearAllBtn && notifBody) {
        clearAllBtn.addEventListener("click", (e) => {
            e.stopPropagation(); 
            notifBody.innerHTML = `
                <div style="padding: 32px 16px; text-align: center; color: #64748b; font-size: 13px; font-weight: 500;">
                    ✨ ¡Al día! No tienes notificaciones nuevas.
                </div>`;
            if (badge) badge.style.display = "none"; 
        });
    }

    document.addEventListener("click", () => {
        dropdown.style.display = "none";
    });
}

// Mobile
function inicializarMenuMobile() {
    const btnHamburguesa = document.getElementById("btn-toggle-sidebar-mobile");
    const capaOscura = document.getElementById("sidebar-overlay-tap");
    const workspace = document.getElementById("app-workspace") || document.body;

    if (btnHamburguesa && workspace) {
        btnHamburguesa.addEventListener("click", (e) => {
            e.stopPropagation();
            workspace.classList.toggle("sidebar-open");
        });
    }

    if (capaOscura && workspace) {
        capaOscura.addEventListener("click", () => {
            workspace.classList.remove("sidebar-open");
        });
    }
}

function inicializarManejadorLogout() {
    const contenedorPerfil = document.getElementById("user-profile-logout");
    if (contenedorPerfil) {
        contenedorPerfil.addEventListener("click", () => {
            const nombreCompletoRaw = auth.currentUser ? (auth.currentUser.nombre || auth.currentUser.displayName || "Funcionario") : "Funcionario";
            
            mostrarConfirmacionLogoutPersonalizada(nombreCompletoRaw, () => {
                auth.signOut()
                    .then(() => {
                        console.log("Módulo de autenticación territorial: Sesión revocada con éxito.");
                        window.location.href = "index.html"; 
                    })
                    .catch((error) => {
                        console.error("Error al procesar el cierre de sesión en Firebase:", error);
                    });
            });
        });
    }
}

export function actualizarPerfilLayout(user) {
    const avatar = document.getElementById("user-avatar");
    if (avatar) avatar.src = user.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100";
}