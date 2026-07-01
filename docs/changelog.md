# 🔄 Historial de Cambios de la Plataforma (Changelog Técnico)

La plataforma **SIGEV** se actualiza constantemente para entregar más seguridad, velocidad y nuevas herramientas al equipo de gestión territorial. En este registro técnico se detallan las mejoras, refactorizaciones de código y despliegues de arquitectura incorporados al ecosistema Multi-Tenant desde su lanzamiento oficial.

---

## 📅 Resumen General de Versiones

| Versión | Fecha | Autor | Descripción Core |
| :--- | :--- | :--- | :--- |
| **v5.3.0** | 28/06/2026 | Equipo SIGEV | **Seguridad y Operaciones:** Despliegue de 2FA obligatorio (Amazon SES), destrucción de sesiones inactivas, reglas fijas de inmutabilidad en Firestore, motor Excel y trazabilidad avanzada de expedientes. |
| **v5.2.0** | 10/06/2026 | Equipo SIGEV | **Métricas y UI:** Inyección de Dashboard con gráficos reactivos, constructor dinámico de Triage Territorial y librería CropperJS para optimización multimedia. |
| **v5.1.0** | 25/05/2026 | Equipo SIGEV | **Lanzamiento Oficial:** Implementación del núcleo funcional base, padrón relacional, algoritmo de detección familiar y despliegue perimetral en `sigev.cl`. |

---

## 🚀 Detalle de Ajustes por Lanzamiento

### 🔓 v5.3.0 — Seguridad Avanzada y Flujos Críticos (Versión Actual)
* **Autenticación Robusta (2FA):** Implementación obligatoria de doble factor de autenticación para perfiles con privilegios elevados (`ADMIN`, `SUPER_ADMIN`), coordinada a nivel de backend mediante el servicio transaccional de **Amazon SES**.
* **Protección perimetral de Inactividad:** Inyección de un script global de deslogueo automático (Timeout de 10 minutos) que destruye los pasaportes de sesión activos si el navegador no detecta interacciones físicas, mitigando vulnerabilidades en terminales compartidas.
* **Inmutabilidad Forense de Logs:** Configuración de la cláusula rígida `allow update, delete: if false;` en las colecciones críticas de auditoría de Cloud Firestore, impidiendo la alteración de registros históricos.
* **Pipeline de Ingesta Masiva (Excel):** Diseño de un parser asíncronizado que lee libros de cálculo grandes, valida la estructura del Módulo 11 en los RUNs detectados y pobla las colecciones sin bloquear el hilo principal de la interfaz.
* **Flujo Operativo en Dos Pasos:** Reestructuración de la lógica de cierre de tickets obligando el llenado del informe de resolución interno antes de habilitar la salida del canal de comunicación del vecino.

---

### 📊 v5.2.0 — Analítica Predictiva y Triage Dinámico
* **Dashboard Reactivo:** Integración de componentes analíticos basados en gráficos vectoriales que procesan las métricas diarias del clúster directamente desde la memoria caché, aliviando la tasa de lectura en base de datos.
* **Motor Automático de Triage:** Creación de un backend jerárquico que clasifica los incidentes del buzón ciudadano en crudo según palabras clave (Ej: *Luminarias*, *Baches*), derivándolos al instante al área técnica correspondiente.
* **Inyección de CropperJS:** Acoplamiento de la librería de procesamiento visual en el frontend para forzar el recorte y compresión exacta de avatares corporativos y evidencias fotográficas territoriales previas a la subida al Storage.

---

### 🏁 v5.1.0 — Despliegue de Infraestructura Base
* **Arquitectura de Base de Datos:** Configuración inicial del clúster NoSQL de Google Cloud Firestore con soporte nativo de segregación Multi-Tenant basada en la propiedad inyectada `tenantId`.
* **Módulo de Relaciones Familiares:** Algoritmo de cruce inteligente que analiza concordancias de domicilios y apellidos dentro del Padrón Territorial para agrupar dinámicamente fichas bajo un mismo "Núcleo Familiar" sin duplicar datos del vecino.
* **Lanzamiento de Canales:** Apertura formal de la Landing Page pública en `https://sigev.cl` conectando el formulario del Buzón Ciudadano de forma directa con los contadores numéricos y correlativos de control.