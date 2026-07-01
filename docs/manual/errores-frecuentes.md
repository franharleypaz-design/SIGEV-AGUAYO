# ⚠️ Guía de Solución de Problemas (Errores Comunes)

Incluso en las mejores plataformas, a veces las cosas no salen como esperamos. Ya sea por una interrupción de internet, un dato mal escrito o un bloqueo de seguridad, esta guía te ayudará a entender rápidamente qué significa cada alerta en tu pantalla y cómo solucionarlo de inmediato.

---

## 1. 🛑 Errores Comunes del Día a Día (Ingreso de Datos)

Esta sección detalla los tropiezos más frecuentes al digitar información en el padrón o en las solicitudes, y cómo resolverlos paso a paso:

| Alerta o Síntoma en Pantalla | ¿Por qué ocurre? | ¿Cómo solucionarlo? |
| :--- | :--- | :--- |
| **"RUT Inválido"** o el campo se pinta de **Rojo Alerta** | El RUN ingresado no pasó la prueba del Módulo 11 (algoritmo verificador chileno) o tiene errores de tipeo. | Revisa que los números estén en el orden correcto. Si el dígito verificador termina en **K**, asegúrate de escribirla en mayúscula. |
| **"Posible Perfil Duplicado Detectado"** | Intentas registrar un vecino nuevo, pero su Nombre o Teléfono coincide exactamente con un registro antiguo que no tenía RUT asociado (un "Perfil Fantasma"). | Cierra el formulario actual. Ve al Padrón, busca al vecino por su nombre y edita su ficha existente para agregarle el RUT, en lugar de crear una ficha doble. |
| **El botón "Guardar" se queda gris o bloqueado** | Falta completar al menos un campo obligatorio marcado con un asterisco rojo (**\***) en el formulario. | Recorre el formulario hacia arriba. Busca el campo que no tenga información o que esté parpadeando en rojo y complétalo. El botón se activará automáticamente. |
| **"El archivo excede el límite permitido"** | Intentas subir una foto de evidencia de más de 4MB (en solicitudes) o un documento de más de 10MB (en fichas de vecinos). | Si es una foto de celular, envíatela a ti mismo por WhatsApp o sácale un pantallazo para reducir su tamaño automáticamente antes de subirla. Si es un documento, escanealo en modo "Blanco y Negro". |
| **"Error: Máximo de adjuntos alcanzado"** | Intentaste arrastrar o seleccionar más de 5 imágenes en el área de evidencia de una solicitud. | El sistema tiene un tope rígido de 5 fotos por caso. Selecciona únicamente las 5 imágenes más claras que demuestren el problema territorial. |
| **"La Unidad Vecinal no corresponde al Sector"** | Seleccionaste un Sector Territorial, pero el menú de la Unidad Vecinal se quedó congelado o vacío. | El sistema funciona en cascada limpia. Si cambias el Sector, debes volver a seleccionar la UV y la Junta correspondientes. No dejes selecciones antiguas arrastradas. |
| **"No se puede finalizar: Falta Resolución"** | Intentas cerrar un ticket seleccionando "Finalizada", pero el cuadro amarillo de detalle interno está vacío. | Recuerda el flujo de 2 pasos. Primero debes escribir el informe detallado de cómo se resolvió para el Concejal (cuadro amarillo), guardar, y luego redactar la respuesta al vecino (cuadro verde). |
| **"Tu sesión de validación ha expirado"** | Tardaste más de 30 segundos en escribir el código de 6 dígitos que llegó a tu correo al momento de ingresar (2FA). | Haz clic en el botón "Solicitar otro código" y digítalo apenas llegue a tu bandeja de entrada. |
| **"Acceso Denegado / Redirigiendo..."** | Pasaron 10 minutos sin que movieras el mouse o el teclado (Timeout de inactividad), cerrando tu pasaporte digital. | No es una falla del sistema, es protección de datos. Simplemente inicia sesión otra vez con tu cuenta de Google. |

---

## 2. 🔌 Diccionario de Errores Técnicos (Códigos HTTP)

A veces, si hay una interrupción de red o una caída en los servidores de la nube, el navegador web podría mostrar una pantalla con un número grande. Estos son los **Códigos HTTP** explicados en palabras sencillas:

### ❌ Error 400 (Bad Request / Solicitud Incorrecta)
* **¿Qué significa?** Le enviaste al sistema una información que el servidor no entiende o que rompe las reglas matemáticas.
* **Ejemplo en SIGEV:** Dejaste un campo clave con caracteres extraños o símbolos no permitidos.
* **Solución:** Revisa los textos que acabas de escribir, limpia los caracteres extraños y vuelve a presionar Guardar.

### ❌ Error 401 (Unauthorized / No Autorizado)
* **¿Qué significa?** El sistema no te reconoce como un usuario activo en esta pestaña. Tu llave digital se rompió temporalmente.
* **Ejemplo en SIGEV:** Dejaste la plataforma abierta toda la noche y al día siguiente intentaste operar directamente sin refrescar.
* **Solución:** Presiona la tecla **F5** para actualizar la página. El sistema te pedirá iniciar sesión de nuevo de forma segura.

### ❌ Error 403 (Forbidden / Acceso Prohibido)
* **¿Qué significa?** Tu cuenta es válida, pero **tu Rol de Gestor Territorial no tiene permisos** para entrar a esa sección específica.
* **Ejemplo en SIGEV:** Intentaste forzar la URL o hacer clic en un enlace de configuración del sistema, auditoría avanzada o logs del Admin.
* **Solución:** El sistema te bloquea por diseño para proteger la plataforma. Si necesitas ver esa información por motivos de trabajo, solicítale al Admin que lo revise por ti.

### ❌ Error 404 (Not Found / No Encontrado)
* **¿Qué significa?** Estás buscando una dirección, un vecino o un ticket que no existe en la base de datos o que fue cambiado de lugar.
* **Ejemplo en SIGEV:** Digitaste mal un código de folio (Ej: `SIG-2606-000`) o hiciste clic en un enlace desactualizado.
* **Solución:** Verifica los números detalladamente. Si estás buscando un ticket que te dio un vecino, confirma el RUN para rastrearlo desde su ficha.

### ❌ Error 500 / 503 (Internal Server Error)
* **¿Qué significa?** El problema es 100% externo. Hubo una falla o interrupción en los servidores centrales de la nube (Firebase) o en el escudo perimetral (Cloudflare).
* **Solución:** No sigas presionando los botones de forma repetida para no duplicar datos. Espera entre 5 y 10 minutos a que los servidores se estabilicen y refresca la página con **F5**.

---

## 3. 🚑 Troubleshooting Básico (Primeros Auxilios)

Si la plataforma se congela, los menús desplegables no se abren o las tablas no muestran la información, realiza esta rutina de emergencia en orden:

1. **La regla del F5:** Refresca la pestaña del navegador. La mayoría de los atascos visuales en la memoria RAM del computador se solucionan reiniciando la vista.
2. **Prueba de Conexión:** Verifica si sigues teniendo internet estable. SIGEV procesa datos constantemente en la nube; si tu señal cae, la interfaz se bloqueará para evitar pérdidas de información.
3. **Limpieza de Borde:** Si el sistema actúa de forma extraña, ve a la barra de direcciones de internet, borra todo lo que esté escrito después de `.cl` (dejando solo la raíz), presiona Enter y vuelve a iniciar sesión con tu correo. Esto renovará tus llaves de acceso desde cero.