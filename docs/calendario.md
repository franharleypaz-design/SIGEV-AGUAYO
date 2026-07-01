# 📅 Módulo de Calendario y Agenda Territorial

El módulo de **Calendario de Actividades** (`calendario.js`, `calendario.html`, `calendario.css`) actúa como el planificador central de los equipos municipales y autoridades. A diferencia de las integraciones pesadas con herramientas de terceros, este módulo implementa un motor de cuadrícula nativo y reactivo, diseñado específicamente para operar bajo la arquitectura SaaS Multi-Tenant de **SIGEV**, priorizando la velocidad de carga y el aislamiento estricto de la agenda de cada comuna.

---

## 1. 📖 Glosario Técnico del Módulo

| Término | Definición Técnica en SIGEV |
| :--- | :--- |
| **Cuadrícula Matemática Nativa** | Motor algorítmico basado en el objeto `Date` de JavaScript que calcula desfases y rellena la grilla del mes dinámicamente sin depender de librerías externas. |
| **Event Pills** | Inyecciones en el DOM (`.event-pill`) que representan de forma visual y codificada por colores los eventos dentro de cada celda del calendario. |
| **State Manager en RAM** | Arreglo global `eventosGlobales` que almacena el 100% de la agenda del Tenant, actuando como caché local para anular la latencia en búsquedas. |
| **Inyección de Inquilino (`tenantId`)** | Sello de agua criptográfico que vincula atómicamente un nuevo evento a la municipalidad activa (`CURRENT_TENANT_ID`). |

---

## 2. 🛤️ Diagrama de Flujo: Ciclo de Agendamiento y Renderizado

El siguiente diagrama modela la interacción del usuario al crear un evento y cómo el sistema sincroniza la base de datos para actualizar la cuadrícula visual y la tabla de gestión en tiempo real.

```mermaid
graph TD
    %% =========================================================
    %% PALETA DE ESTILOS INSTITUCIONALES SIGEV
    %% =========================================================
    classDef usuario fill:#eff6ff,stroke:#3b82f6,stroke-width:2px,color:#1e40af,rx:8px,ry:8px;
    classDef sistema fill:#fff7ed,stroke:#f97316,stroke-width:2px,color:#9a3412,rx:8px,ry:8px;
    classDef equipo fill:#f0fdf4,stroke:#22c55e,stroke-width:2px,color:#166534,rx:8px,ry:8px;
    classDef core fill:#f8fafc,stroke:#64748b,stroke-width:2px,color:#0f172a,rx:8px,ry:8px;

    %% FASE 1: Ingesta del Evento
    subgraph FASE_1 [1. Interacción de Interfaz]
        direction TB
        A[Clic en + Nuevo Evento]:::usuario --> B[Llenado de Formulario<br/>Título, Fecha y Color]:::usuario
        B --> C[Disparo de Guardado]:::sistema
    end

    %% FASE 2: Transacción y Seguridad
    subgraph FASE_2 [2. Aislamiento y Persistencia]
        direction TB
        D[Empaquetado de Payload<br/>Inyección de tenantId y Creador]:::core --> E[Ejecución en Firestore<br/>addDoc / updateDoc]:::sistema
    end

    %% FASE 3: Mutación Local y Renderizado
    subgraph FASE_3 [3. Caché y Re-Renderizado]
        direction TB
        F[Actualización en RAM<br/>Push a eventosGlobales]:::core --> G[Renderizar Calendario<br/>Cálculo matemático de celdas]:::equipo
        G --> H[Renderizar Tabla<br/>Filtros y ordenamiento O(1)]:::equipo
    end

    %% Conectores
    C -.->|Validación Local Exitosa| D
    E -.->|Retorno de ID Autogenerado| F
```

---

## 3. ⚙️ Motor de Renderizado Matemático de Cuadrícula

La vista principal del calendario no requiere de plugins pesados, sino que utiliza una lógica de cálculo de desfase cronológico ejecutada en el cliente (`renderizarCalendario()`):

1. **Cálculo de Límites:** El sistema extrae el `año` y `mes` actual, calculando el `primerDiaMes` y el `ultimoDiaMes` para determinar el total de días (28, 30 o 31).
2. **Desplazamiento de Inicio de Semana:** Se ajusta el valor nativo de JavaScript para que el calendario inicie estructuralmente en **Lunes** (donde 0 = Lunes y 6 = Domingo).
3. **Inyección de Celdas Inactivas (Muted):** Se generan los días sobrantes del mes anterior y del mes siguiente (`.calendar-cell-full.muted`) para mantener una cuadrícula visual perfecta de 7 columnas.
4. **Mapeo Simultáneo de Eventos:** Durante la iteración de los días, el sistema consulta el arreglo en memoria RAM (`eventosGlobales`), filtra los eventos que coincidan con el string de la fecha (`YYYY-MM-DD`) e inyecta las píldoras correspondientes (`.event-pill`) directamente en el template literal de HTML.

---

## 4. 🏷️ Tipología Analítica y Código de Colores

Para mantener la coherencia visual y facilitar el escaneo rápido de las actividades, el sistema restringe la creación de eventos a **5 macro-categorías institucionales** mapeadas a través del diccionario `diccionarioNombresEventos`:

* 🔵 **Reunión / Audiencia** (`event-blue`): Tonos azules institucionales.
* 🟢 **Operativo Territorial** (`event-green`): Tonos esmeralda para intervenciones en terreno.
* 🟠 **Visita a Terreno** (`event-orange`): Tonos ámbar corporativo.
* 🟣 **Consejo Municipal** (`event-purple`): Tonos morados para hitos legislativos.
* 🔴 **Urgencia / Emergencia** (`event-red`): Tonos de alerta máxima.

---

## 5. 🛡️ Arquitectura Multi-Tenant y Optimización de Consultas

Al igual que en los módulos críticos, el calendario aplica las directrices de optimización de Google Cloud y el blindaje perimetral del inquilino:

### Filtro de Lectura Unidireccional
La función `cargarEventosFirebase()` ejecuta una petición atómica (`getDocs`) al inicializar el módulo. Obligatoriamente, incluye la cláusula `where("tenantId", "==", CURRENT_TENANT_ID)`. Esto asegura que el concejal o administrador solo descargue la agenda de su propia municipalidad, descartando los calendarios del resto de comunas.

### Filtros y Búsquedas Client-Side (Caché RAM)
La ventana emergente de *Gestión de Eventos* (`#modal-lista-eventos`) permite buscar por título y filtrar por categoría. Para no generar facturación en Firestore con cada tecla presionada, la sub-rutina `renderizarTablaEventos()` evalúa las condiciones booleanas mediante la función `.filter()` directamente sobre la variable global `eventosGlobales` y los ordena cronológicamente, proporcionando una respuesta instantánea a nivel de interfaz.