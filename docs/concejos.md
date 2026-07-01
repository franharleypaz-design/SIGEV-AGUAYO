# 🏛️ Módulo de Concejo Municipal e Ingesta Legislativa

El módulo de Concejo Municipal (compuesto por concejos.js, concejos.html y concejos.css) centraliza la gestión, auditoría y publicación transparente de las sesiones plenarias legislativas y los acuerdos comunales del cuerpo de concejales. Actúa como el núcleo analítico-normativo de la plataforma SIGEV, operando bajo una arquitectura NoSQL híbrida que simula relaciones relacionales parent-child atómicas de manera nativa en el cliente, optimizando el rendimiento mediante almacenamiento en caché en memoria RAM y vectores de agregación local diferidos.

---

## 1. 📖 Glosario Técnico del Módulo

* **Sesión Maestra:** Documento raíz en Firestore (sesiones_concejo) que almacena los metadatos globales, la referencia del acta física en PDF y los contadores consolidados de una sesión plenaria.
* **Votos Desagregados:** Colección NoSQL relacional (votos_concejo) donde cada registro representa un tema o acuerdo específico debatido, vinculado jerárquicamente a una Sesión Maestra.
* **Expediente Consolidado:** Interfaz UI de lectura estricta que unifica en una sola vista asíncrona los datos de la sesión, el descargador del PDF original y la grilla de acuerdos tomados.
* **Edición en Caliente:** Conmutador lógico del DOM que altera las propiedades de los inputs (readonly, disabled y pointerEvents) en tiempo de ejecución, transformando un elemento de lectura en un control de escritura.
* **Reducción Lineal Local:** Algoritmo cliente que calcula el total de votos mediante sumatorias en memoria RAM al capturar el formulario, reduciendo la complejidad del servidor de O(N) a O(1).
* **Layout Thrashing:** Bloqueo intencional del motor de renderizado del navegador mediante CSS estricto para evitar el rediseño dinámico de celdas largas, anidando el parpadeo visual.

---

## 2. 🏗️ Arquitectura SaaS e Ingesta Multi-Tenant Dinámica

El módulo opera de manera aislada y segura entre municipios sin requerir variables estáticas en el código fuente. La resolución de la propiedad del Tenant se determina dinámicamente en el ciclo de carga inicial del cliente.

### Mecánica de Detección de Instancia (concejos.js)

1. Extracción y Limpieza del Hostname: El script captura window.location.hostname, aísla el subdominio principal y remueve el prefijo del ecosistema (sigev-) para extraer el token puro del municipio.
2. Asignación en Almacenamiento de Sesión: El sistema consulta el token contra el sessionStorage bajo la llave SIGEV_ACTIVE_TENANT. En entornos de pruebas o subdominios no mapeados (localhost, landing), aplica un Fallback algorítmico al tenant por defecto (paz).
3. Aislamiento Estricto de Consultas: La constante global CURRENT_TENANT_ID se inyecta de forma obligatoria como cláusula de filtrado primario (where tenantId es igual a CURRENT_TENANT_ID) en cada pipeline de lectura o escritura en Firestore, impidiendo la fuga o contaminación cruzada de datos legislativos entre municipios.

---

## 3. 🛤️ Pipeline de Ejecución: Ciclo de Vida y Consolidación de Actas

El flujo de persistencia y procesamiento sigue un orden secuencial estricto en el cliente:

1. El Administrador o Concejal ingresa los Datos Maestros (Número, Fecha, Tipo) en la UI del formulario.
2. El usuario añade N filas de temas dinámicos según la tabla del día.
3. Se adjunta el archivo Acta PDF original y se presiona Sincronizar.
4. El motor verifica los campos obligatorios locales y ejecuta la carga binaria asíncrona mediante la instrucción uploadBytes en la ruta actas_concejo/{tenantId}/file.pdf.
5. Firebase Storage procesa el archivo y retorna una URL inmutable de descarga segura (getDownloadURL).
6. El sistema escribe o actualiza el documento maestro en la colección sesiones_concejo.
7. Comienza la reducción lineal: se itera sobre los nodos del DOM (.voto-row-item) calculando los totales de votos directamente en la RAM.
8. Se insertan los documentos correspondientes en la colección votos_concejo de forma independiente.
9. Se ejecuta un updateDoc final inyectando los totales consolidados en el documento maestro de la sesión.
10. Se cierra el modal y se recargan las grillas locales desde la caché de memoria.

### 3.1 Matemática de Agregación de Métricas
Para mitigar los costos de lectura impuestos por el modelo de facturación de Firestore, los totales de las votaciones no se calculan mediante consultas agregadas COUNT() en tiempo real. En su lugar, el sistema realiza una reducción lineal en memoria RAM al momento de la captura sumando más uno por cada ocurrencia de voto A Favor o En Contra. Este vector de resultados se consolida en una única operación updateDoc sobre el documento padre, reduciendo la complejidad operacional de consultas posteriores de O(N) a O(1).

---

## 4. 🗳️ Captura de Acuerdos y Formulación Dinámica del DOM

La ingesta de actas legislativas implementa un generador de formularios dinámico a través de manipulación directa del árbol de nodos del DOM, gestionado por el escuchador de eventos sobre el botón #btn-append-voto-row.

### 4.1. Generación de Bloques Inyectados en Caliente
Cada tema o punto en tabla de la sesión se encapsula en una tarjeta dinámica (.voto-row-item) generada mediante inserción programática de templates literales de HTML. El motor autoincrementa el contador visual (Tema #count) basándose exclusivamente en la longitud de hijos activos del contenedor (container.children.length + 1), proveyendo un botón de destrucción nativa que remueve el nodo específico de la memoria mediante la instrucción parentElement.remove().

### 4.2. Reglas de Negocio y Sanitización Client-Side
* Control de Nulidad en Iteración: Al presionar #btn-guardar-sesion-maestra, el script rompe el flujo si se detecta la ausencia de campos clave obligatorios (s-numero, s-fecha, s-tipo). En modo de creación, la selección de un archivo .pdf es de carácter estrictamente obligatorio.
* Mapeo de Categorías Estructuradas: Las selecciones temáticas están restringidas por código a un arreglo cerrado de opciones institucionales para garantizar la integridad analítica: Seguridad Comunal, Educación, Salud, Áreas Verdes y Ornato, Tránsito y Transporte, Presupuesto y Finanzas, Patentes Comerciales/Alcoholes, Urbanismo y Obras Públicas.

---

## 5. 🔍 Motor de Búsqueda y Filtros Combinatorios Multiparámetro

La visualización del historial de acuerdos opera mediante un motor de filtrado por predicados ejecutado localmente en el cliente, eliminando la latencia de red y disminuyendo las operaciones de lectura en Firebase Firestore.

### Estrategia de Filtrado de Matriz Local (AND Estricto)
La función de control filtrarVotacionesMaestro() intercepta los cambios de estado en la UI y evalúa una compuerta lógica AND sobre el arreglo en caché memoryVotaciones, aplicando tres filtros concurrentes:
1. Filtro Primario (KPI): Evalúa la propiedad v.miVoto contra la variable global currentKpiFilterVotos.
2. Filtro Secundario (Categoría): Evalúa la materia o área temática seleccionada en el dropdown #filter-voto-categoria.
3. Filtro Terciario (Texto Predictivo): Convierte el valor de #filter-voto-busqueda a minúsculas mediante toLowerCase().trim() y realiza un barrido con includes() sobre los campos textuales tema y comentario.

### Renderizado Reactivo de Badges Parlamentarios
El script traduce los estados de las votaciones inyectando componentes visuales dinámicos directamente en el DOM:
* Resultado Aprobado: Genera un badge con fondo verde suave y texto verde oscuro (#16a34a).
* Resultado Rechazado: Genera un badge con fondo rojo suave y texto rojo oscuro (#ef4444).
* Voto Individual A Favor: Inserta el indicador visual acompañado por texto destacado verde.
* Voto Individual En Contra: Inserta el indicador visual acompañado por texto destacado rojo.
* Voto Individual Abstención: Inserta el indicador visual en tonalidad ámbar corporativa.
* Voto Individual Ausente: Inserta el indicador visual en gris pizarra neutralizado para actas.

---

## 6. 📊 Agregación Inversa y Métricas de Auditoría (KPIs)

Para garantizar la integridad estadística cuando se modifica un acuerdo individual de forma aislada desde el visor único (#modal-voto-single), el sistema implementa una sub-rutina de agregación inversa denominada recalcularEstadisticasSesion(sessionId).

### Reducción y Sincronización Post-Mutación
Si el sentido del voto de un concejal es editado y guardado con éxito mediante updateDoc en la colección relacional, el sistema no realiza un recuento a ciegas en la base de datos. En su lugar:
1. Filtra localmente en el arreglo memoryVotaciones todos los elementos hijos asociados al identificador de la sesión activa (v.sessionId === sessionId).
2. Inicializa un vector de acumuladores en cero y ejecuta una función reductora lineal que suma más uno por cada coincidencia exacta del sentido del voto.
3. Despacha una actualización atómica dirigida al documento maestro en la colección sesiones_concejo para reescribir los campos votosAFavor, votosEnContra, votosAbstencion y votosAusente.
4. Ejecuta de forma reactiva renderizarGrillaSesiones(), refrescando los contadores en las tarjetas de la interfaz de usuario de manera síncrona.

---

## 7. 📱 Blindaje CSS e Interacción Táctil

El diseño de la hoja de estilos concejos.css está estructurado bajo principios de rendimiento fluido y adaptabilidad en pantallas móviles y paneles de control de escritorio.

* Fijación Estricta de Grillas (Anti-Thrashing): Las tablas del expediente oficial utilizan la regla table-layout: fixed !important combinada con anchos porcentuales declarados explícitamente en las etiquetas de cabecera (thead) como width: 55% y width: 15%. Esto instruye al motor de renderizado a procesar las celdas instantáneamente basándose en la primera fila, impidiendo que textos descriptivos muy extensos alteren la alineación o provoquen parpadeos visuales al paginar.
* Desfase de Ciclo de Animación (Modales): La función global abrirModalG asigna la propiedad display = 'flex' e inmediatamente introduce un desfase síncrono de 10 milisegundos mediante un setTimeout antes de inyectar la clase CSS .open. Esto garantiza que el navegador procese el cambio de estado físico en el árbol de renderizado antes de disparar las transiciones de opacidad y escala controladas por la GPU.
* Control de Desbordamiento e Interacción: Las áreas internas de modales múltiples implementan límites de altura máxima (max-height: 480px y 600px) gobernadas por desbordamiento vertical táctil (overflow-y: auto), asegurando que las cabeceras fijas y los pies de página de confirmación permanezcan inmutables y accesibles en pantallas pequeñas.