# 🔐 Módulo de Gestión de Usuarios y Control de Accesos

El módulo de Gestión de Usuarios (usuarios.js, usuarios.html, usuarios.css) es el núcleo de gobernanza y seguridad operativa de la plataforma SIGEV. Centraliza el control de identidades, la auditoría de accesos y la asignación jerárquica de privilegios de los funcionarios del equipo territorial. Opera mediante un escudo interceptor client-side conectado a Firebase Auth y Firestore, garantizando el aislamiento de datos (Multi-Tenancy) y aplicando restricciones severas de visibilidad basadas en Roles de Cuenta (RBAC).

---

## 1. 📖 Glosario Técnico del Módulo

* **Escudo Interceptor:** Mecanismo lógico ejecutado inmediatamente en el cambio de estado de autenticación que evalúa los reclamos de rol de un usuario y desvía el tráfico no autorizado.
* **Rol de Sistema (System Role):** Atributo interno en Firestore (campo: rol) que determina los permisos lógicos de lectura y escritura en las reglas de seguridad de la base de datos.
* **Rol Visual (Cargo Funcional):** Glosa textual libre (campo: rolVisual) inyectada en la interfaz que describe el cargo público del funcionario sin afectar sus capacidades del sistema.
* **Estado de Cuenta (Account Status):** Switch inmutable de operación (campo: estadoCuenta) que habilita de forma binaria (Activo o Suspendido) el flujo logicial del funcionario.
* **Hidratación Dinámica:** Capacidad de sobreescribir arreglos de control local (como los departamentos asignables) consultando la configuración paramétrica del Tenant en tiempo de ejecución.
* **Glassmorphism Bloqueante:** Técnica de UI que inyecta una capa con desenfoque por hardware sobre el viewport para congelar la interacción del usuario mientras se resuelven promesas asíncronas en la red.

---

## 2. 🛡️ Matriz de Roles, Restricciones y Reglas de Negocio

El sistema administra cinco rangos jerárquicos estrictos dentro del ecosistema del Tenant. Sus capacidades y restricciones operacionales están definidas de la siguiente manera:

1. SUPER_ADMIN (Root / Dueño)
* Cargo por defecto: Super Administrador o Dueño del Workspace.
* Restricciones en Código: Su cuenta es completamente inmutable en la interfaz. El selector de roles (edit-rol) y el selector de estado de acceso (edit-estado) se bloquean por completo mediante el atributo disabled si el ID evaluado pertenece a este rango.
* Estado: Forzado permanente como Activo en la base de datos.

2. ADMIN (Administrador de Plataforma)
* Cargo por defecto: Administrador Municipal o Jefe Territorial.
* Restricciones en Código: Es el único rango calificado junto al Super Admin para superar el Shield inicial y renderizar el panel usuarios.html. Puede crear, mutar o suspender cuentas de Gestores Territoriales o perfiles pendientes, pero no puede alterar perfiles de nivel Súper Administrador.

3. GESTOR_TERRITORIAL (Operador de Terreno)
* Cargo por defecto: Gestor Territorial, Secretario Comunal o Funcionario DIDECO.
* Restricciones en Código: No tiene autorización para ingresar a la interfaz de gestión de usuarios. Si intenta tipear la URL directa, el sistema intercepta su sesión y lo redirige de forma forzada a la central informativa (dashboard.html).

4. Pendiente (Usuario en Espera)
* Cargo por defecto: Funcionario nuevo registrado públicamente sin credenciales asignadas.
* Restricciones en Código: Carece de privilegios operativos. Su acceso está congelado hasta que un Administrador asigne un Rol de Sistema válido y un Cargo Escrito en el panel de permisos.

5. Inactivo / Suspendido (Acceso Revocado)
* Cargo por defecto: Funcionario desvinculado, suspendido o bloqueado.
* Restricciones en Código: Su sesión es terminada lógicamente. Al activarse este estado, el código destruye de inmediato sus credenciales del sistema para mitigar riesgos de seguridad.

---

## 3. ⚙️ Verificación de Aplicación de Restricciones (Análisis de Código)

El archivo usuarios.js aplica los controles de seguridad y las reglas de negocio en cuatro capas críticas del sistema:

### Capa 1: El Escudo de Autenticación (Shield Inicial)
Al cargar la página, el escuchador auth.onAuthStateChanged intercepta la sesión. Antes de inyectar cualquier elemento en el DOM o solicitar registros de la base de datos, ejecuta la siguiente validación jerárquica:
* Paso A: Consulta el documento del usuario en la ruta usuarios/user.uid de Firestore.
* Paso B: Extrae el valor del campo rol y lo transforma a mayúsculas estrictas.
* Paso C: Evalúa la condición lógica por compuerta negativa: si el rol NO incluye la cadena ADMIN (es decir, no es ADMIN ni SUPER_ADMIN), ejecuta inmediatamente un desvío físico mediante window.location.href asignándole la ruta dashboard.html.

### Capa 2: Mitigación de Accesos Fantasma por Suspensión
Una de las lógicas más robustas del script se ejecuta al presionar el botón de guardar cambios del perfil (#btn-guardar-perfil). Si un administrador decide cambiar el Estado de Acceso de un funcionario a Suspendido, el sistema aplica un castigo en cadena antes de realizar el updateDoc:
* Modificación Automática: El script sobrescribe la variable de rol del sistema forzándola al valor estricto Inactivo, y el rol visual cambia automáticamente a Inactivo. Esto asegura que si el usuario suspendido tenía una sesión abierta en otro dispositivo, sus privilegios de escritura en las Reglas de Seguridad de Firestore caen instantáneamente a cero, impidiendo inyecciones maliciosas post-bloqueo.

### Capa 3: Inmutabilidad Estructural de Cuentas Root
Dentro del modal editor abrirEditorPerfilPersonal, el sistema evalúa la constante isSuperAdmin mediante la regla lógica: (user.rol es igual a SUPER_ADMIN, SUPERADMIN o super_admin). Si la condición es verdadera, inyecta dinámicamente un template HTML que asigna el atributo disabled al elemento de selección de rol y estado, y fuerza la propiedad estadoCuenta a Activo en el payload de envío, bloqueando la posibilidad de autoboicot o degradación accidental del propietario del sistema.

### Capa 4: Blindaje Multi-Tenant Cruzado
El detector extrae la variable CURRENT_TENANT_ID desde el subdominio limpio. Durante la ejecución de cargarPersonalCore(), el bucle recorre las cuentas recolectadas y aplica una compuerta de exclusión: solo empuja al arreglo de memoria local aquellos documentos cuyo campo tenantId coincida con el municipio del entorno actual, o cuyo rango de sistema sea explícitamente SUPER_ADMIN. Los administradores locales quedan completamente ciegos ante el personal de comunas vecinas.

---

## 4. 🔄 Abstracción Paramétrica y Ciclos de Ejecución del Cliente

### 4.1. Hidratación en Caliente de Estructuras Municipales
El script define por defecto un arreglo estático de departamentos asignables: DIDECO, DIMAO, Obras, Tránsito, Seguridad, Gabinete y Territorial. Sin embargo, para cumplir con el principio SaaS Multi-Tenant, el sistema invoca la función asíncrona `cargarParametrosGlobales()`. 
Esta función consulta el documento del municipio en la colección `configuracion_tenant` usando el identificador activo. Si el nodo posee el campo `departamentosAsignables`, el script destruye el arreglo por defecto y reescribe la variable global `DEPARTAMENTOS_MUNICIPALES` en tiempo de ejecución, adaptando los selectores del formulario a la organigrama interno de cada municipalidad.

### 4.2. Reloj del Sistema y Formateo Regional de Auditoría
Para garantizar que las marcas de tiempo de las bitácoras coincidan con el uso horario oficial del cliente sin importar la configuración nativa del dispositivo, la función `inicializarRelojMundial()` establece un hilo de ejecución cíclica mediante un `setInterval` programado a 1000 milisegundos. El formateador fuerza la localización al estándar chileno `es-CL` tanto para la fecha como para la hora en formato de 2 dígitos, proveyendo consistencia visual en las cabeceras de gestión.

### 4.3. Escudo de Interacción Asíncrona (Glassmorphism Loader)
Durante las consultas pesadas a la base de datos o el despacho de mutaciones de seguridad, el script invoca a `mostrarLoaderBloqueante(mensaje)`. Esta sub-rutina inyecta dinámicamente en la raíz del `body` un contenedor con un `z-index: 9999` y la propiedad CSS `backdrop-filter: blur(4px)`. Al posicionarse sobre todo el viewport del navegador, congela físicamente los eventos del mouse y del teclado del operador, evitando clics duplicados (*Double-Submit*) o alteraciones del DOM a mitad de una sincronización con Firebase.

---

## 5. 📊 Tracks de Interfaz, Paginación y Motor de Búsqueda Local

Para optimizar las lecturas y evitar recargos monetarios por peticiones repetitivas a la base de datos de Firebase, el panel opera con procesamiento y segmentación combinatoria en memoria RAM.

### 5.1. Motor de Búsqueda Multivariable (AND Estricto)
La función aplicarFiltrosYRenderizar unifica el buscador de texto libre y el selector de roles en un flujo de filtrado lineal sobre la colección en caché personalMemory:
* Filtro de Texto: Normaliza los valores a minúsculas y concatena el nombre completo, el correo y el cargo escrito, permitiendo conciencias parciales instantáneas.
* Filtro de Rango: Decodifica de forma tolerante las variaciones de rol de la base de datos (por ejemplo, homologando SUPER_ADMIN con cadenas que contengan SUPER).
* Filtro de Estado por Pestaña (Tabs): Segmenta las filas separando de forma nítida a los usuarios operativos de los inactivos mediante la lectura del estado virtual derivado del campo oficial estadoCuenta.

### 5.2. Paginación Segmentada Client-Side
Una vez calculada la matriz resultante en personalFiltradoGlobal, la sub-rutina inyectarFilasTablaPersonal calcula los índices de corte basados en la variable itemsPorPagina. El script toma el segmento exacto mediante la función nativa .slice(inicio, fin) e inyecta dinámicamente las filas en el tbody de la tabla, actualizando los contadores informativos inferiores para evitar desbordamientos de interfaz en el navegador.

---

## 6. 🎨 Hoja de Estilos Dinámica y Jerarquía de Rangos

El archivo usuarios.css aporta consistencia visual corporativa mediante el uso de clases específicas de alta visibilidad para identificar los rangos del personal de un vistazo en la grilla:

* **badge-role-superadmin:** Aplica un fondo rosa/fucsia translúcido con texto magenta fuerte y peso tipográfico de 800 unidades para destacar la máxima autoridad del Workspace.
* **badge-role-admin:** Utiliza un color azul gubernamental ejecutivo con bordes suavizados para denotar personal con capacidades de administración y jefatura territorial.
* **badge-role-territorial:** Configura tonalidades verdes esmeralda para identificar rápidamente a los gestores operativos desplegados en terreno y mesas de secretaría.
* **badge-role-pendiente:** Mantiene tonos grises neutros de baja opacidad para alertar visualmente sobre perfiles recién incorporados que aún no tienen credenciales de acceso vigentes.