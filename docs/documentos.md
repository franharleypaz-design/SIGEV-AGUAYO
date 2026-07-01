# 📁 Módulo de Centro Documental y Expedientes

El **Centro Documental** (`documentos.js`, `documentos.html`, `documentos.css`) proporciona una interfaz gráfica basada en "Carpetas Territoriales" diseñada para explorar, auditar y descargar los archivos digitales adjuntos al padrón ciudadano (fotografías de perfil y documentos de respaldo PDF). Funciona como un repositorio unificado que, además, actúa como puente hacia la visualización de la Hoja de Vida Completa del vecino.

---

## 1. 📖 Glosario Técnico del Módulo

| Término | Definición Técnica en SIGEV |
| :--- | :--- |
| **Grid de Carpetas (Folder Grid)** | Estructura visual CSS (`grid-template-columns`) que simula un entorno de escritorio renderizando dinámicamente tarjetas interactuables por cada vecino. |
| **Sanitización Alfanumérica Regex** | Filtro de búsqueda avanzado que elimina puntos y guiones (`/[^a-z0-9kK]/g`) en tiempo real para permitir búsquedas de RUT exactas sin importar cómo los digite el usuario. |
| **Clonación de Expediente Maestro** | Sub-rutina pesada (`abrirVisorExpedienteDigitalMaestro`) que genera dinámicamente el DOM completo de la ficha del vecino, inyectando mapas Leaflet y su historial de tickets. |
| **Caché Documental en RAM** | Arreglo global `vecinosDocumentalMemory` que almacena de forma persistente los metadatos de las carpetas para evitar descargas repetitivas desde Firebase. |
| **Short-ID Expuesto** | Conversión del UUID interno de Firestore en un código amigable de 6 caracteres (Ej: `#8QRPXK`) copiable al portapapeles. |

---

## 2. 🛤️ Diagrama de Flujo: Exploración Documental y Trazabilidad

El siguiente modelo ilustra cómo el usuario interactúa con la interfaz de carpetas y cómo el sistema realiza consultas relacionales cruzadas a Firestore para construir el expediente maestro final:

```mermaid
graph TD
    %% =========================================================
    %% PALETA DE ESTILOS INSTITUCIONALES SIGEV
    %% =========================================================
    classDef usuario fill:#eff6ff,stroke:#3b82f6,stroke-width:2px,color:#1e40af,rx:8px,ry:8px;
    classDef sistema fill:#fff7ed,stroke:#f97316,stroke-width:2px,color:#9a3412,rx:8px,ry:8px;
    classDef equipo fill:#f0fdf4,stroke:#22c55e,stroke-width:2px,color:#166534,rx:8px,ry:8px;
    classDef core fill:#f8fafc,stroke:#64748b,stroke-width:2px,color:#0f172a,rx:8px,ry:8px;

    %% FASE 1: Búsqueda y Navegación
    subgraph FASE_1 [1. Interfaz de Carpetas y Búsqueda en RAM]
        direction TB
        A[Gestor ingresa al módulo<br/>Descarga Inicial de Metadatos]:::sistema --> B[Tipea en Buscador<br/>RUT, Nombre o Short-ID]:::usuario
        B --> C[Filtro Regex Local O(1)<br/>Renderizado de Grid de Carpetas]:::core
    end

    %% FASE 2: Previsualización de Archivos
    subgraph FASE_2 [2. Apertura de Carpeta Modal]
        direction TB
        C --> D[Clic en Carpeta Vecinal]:::usuario
        D --> E[Despliegue de Modal Accordion<br/>Ver Foto / Ver Documento PDF]:::sistema
    end

    %% FASE 3: Trazabilidad Profunda (Cruce de Datos)
    subgraph FASE_3 [3. Inyección del Expediente Maestro]
        direction TB
        E -->|Clic en 'Ver Ficha de Vecino'| F[Consulta Atómica de Perfil<br/>getDoc de vecino]:::core
        F --> G[Consulta Relacional de Tickets<br/>query a colección solicitudes]:::sistema
        G --> H[Renderizado de Hoja de Vida<br/>Pestañas, Historial y Mapa Leaflet]:::equipo
    end

    %% Conectores
    A -.->|where tenantId == CURRENT_TENANT_ID| C
```

---

## 3. 🔍 Lógica de Búsqueda Flexible (Regex Sanitization)

Uno de los mayores problemas en sistemas gubernamentales es la inconsistencia al escribir el Rol Único Nacional (RUT chileno). El módulo documental de SIGEV resuelve este conflicto aplicando una sanitización por Expresiones Regulares (*Regex*) en memoria:

1. Se captura el string tipeado por el usuario en `#filter-doc-busqueda`.
2. Se ejecuta la instrucción `.replace(/[^a-z0-9kK]/g, "")` tanto en la entrada del usuario como en la base de datos local cacheada.
3. Esto permite que si un usuario busca `19.123.456-K`, el sistema logre el "Match" incluso si en la base de datos fue ingresado como `19123456K`.

Además, el buscador soporta la ingesta directa de **Short-IDs** (códigos de 6 dígitos que inician con `#`) permitiendo acceder instantáneamente a un expediente específico cuando el vecino dicta su código de seguimiento.

---

## 4. 🗂️ Integración del Visor de Expediente Digital Maestro

A diferencia de un simple administrador de archivos, el botón **"Ver Ficha de Vecino"** gatilla la sub-rutina de renderizado más compleja del sistema (`abrirVisorExpedienteDigitalMaestro()`). Esta función inyecta un clon exacto del visor del padrón de vecinos mediante los siguientes pasos secuenciales:

1. **Lectura Atómica del Perfil:** Ejecuta un `getDoc` directo al UUID del vecino para extraer sus datos frescos de Firebase.
2. **Sub-Query Relacional de Historial:** Ejecuta una consulta secundaria a la colección `solicitudes` filtrando por `idVecino == id` y ordenando por fecha de creación, para construir la línea de tiempo de tickets.
3. **Mapeo Geoespacial (Leaflet):** Si el vecino posee coordenadas (`lat` y `lng`), inicializa un lienzo cartográfico interactivo que sitúa el domicilio del usuario exacto en el mapa comunal mediante el componente `L.map`.
4. **Copy-to-Clipboard Integrado:** Activa la API nativa del navegador (`navigator.clipboard`) para permitir a los funcionarios copiar el ID con un solo clic para derivaciones internas.

---

## 5. 🛡️ Capa de Aislamiento Documental

El acceso al repositorio de archivos adjuntos se encuentra bloqueado transversalmente por el ecosistema Multi-Tenant. 

Durante la inicialización de la vista (`descargarPadronInquilino()`), el motor exige la cláusula `where("tenantId", "==", CURRENT_TENANT_ID)` al consultar la colección raíz `vecinos`. Por lo tanto, un operador de una comuna jamás podrá visualizar las carpetas, el historial de reportes, ni los documentos de respaldo (PDF) de los ciudadanos de otro municipio.