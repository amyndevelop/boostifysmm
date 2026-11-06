# Integración SMMTAKE

Fuente: tabla API y ejemplo PHP suministrados por el usuario en esta sesión. Endpoint confirmado en esa documentación: `https://smmtake.com/api/v2`, método POST, formulario URL-encoded, respuesta JSON.

El ejemplo PHP desactiva TLS; **esta implementación mantiene TLS y validación de hostname**, rechaza redirecciones, usa timeout de 15 segundos y no incluye claves ni mensajes remotos sin filtrar en logs/respuestas.

## Varios proveedores desde el sistema

En Administración → Proveedores y APIs (`/admin/proveedores`) se agregan y editan proveedores independientes. Cada uno tiene nombre, tipo de integración, URL HTTPS exacta, API key, activación y metadatos de conexión. SMMTAKE usa el endpoint documentado; otros proveedores pueden usar rutas diferentes si son compatibles con el contrato `key` / `action`. Una API con otro formato necesita su propio adaptador; no se supone compatible automáticamente.

Las API keys se ingresan en un campo de contraseña y se guardan exclusivamente cifradas en PostgreSQL (AES-256-GCM, IV aleatorio, autenticación vinculada al ID del proveedor). Al editar, un campo vacío conserva la clave; no se muestra ni se devuelve el valor guardado o cifrado. Cambiar la URL exige volver a ingresar la clave. La configuración se versiona para detectar ediciones simultáneas y los cambios se auditan sin credenciales.

`PROVIDER_ENCRYPTION_KEY` es la única clave maestra del servidor: 32 bytes aleatorios en formato hexadecimal de 64 caracteres. En desarrollo se inicializa con `node scripts/init-provider-key.mjs`, que conserva cualquier clave existente y no imprime valores. En producción se configura de forma segura en el hosting. Respaldarla junto con la estrategia de recuperación; no cambiarla sin recifrar previamente las credenciales. Las API keys individuales ya no se configuran mediante `SMMTAKE_API_KEY`.

La prueba de conexión y la importación usan las credenciales del proveedor elegido, son de solo lectura y no crean pedidos. La importación obtiene la moneda de balance, conserva tarifas comerciales y mantiene cada catálogo oculto e independiente, incluso si varios proveedores usan el mismo ID externo.

Solo se admiten endpoints HTTPS con dominio público, sin credenciales, parámetros de query, IP literal ni puertos alternativos. Se comprueba DNS antes de llamadas reales, no se siguen redirecciones y se conserva el proxy del entorno. En producción mantener además controles de salida que impidan acceso a redes privadas y metadata, incluyendo cambios de DNS. En cloud, cada nuevo dominio debe estar autorizado en la política de red del entorno; cargar un proveedor no modifica esa política.


Métodos implementados en `src/lib/providers/smmtake.ts`: servicios, balance, alta Default, estado individual/múltiple (hasta 100), refill individual, estado de refill, cancelación individual. Las respuestas de suscripciones/comentarios personalizados y operaciones múltiples de refill quedan fuera de esta entrega.

El adaptador mantiene `allowMutations=false` por defecto; la fábrica de proveedores lo habilita para pedidos confirmados y operaciones autorizadas. El modo demo rechaza proveedores reales y las pruebas exigen transporte simulado.

El pedido conserva proveedor, endpoint, huella de credencial, tarifa, moneda y conversión histórica. Si cambia la configuración, soporte debe verificarla antes de vincular un pedido. Una aceptación captura la reserva una sola vez; un rechazo confirmado la libera. Un timeout o resultado ambiguo conserva la reserva y pasa a revisión: nunca se reintenta el alta automáticamente porque la API no ofrece idempotencia.

Los estados incluyen cargo nativo, costo convertido, cantidad inicial y restante. Cancelación y refill se ofrecen solo si el servicio confirma esas capacidades; pedir cancelación no acredita saldo. En `/admin/pedidos` se concilian envíos inciertos, se vinculan IDs ya existentes y se registran reintegros manuales reconocidos, con motivo, confirmación, límite e historial inmutable. Nunca se crea otro pedido al conciliar. Una operación incierta también necesita revisión antes de solicitar otra.

El envío real está habilitado, pero las pruebas automatizadas no consumen saldo del proveedor. Ver `DEPLOYMENT.md` para el seguimiento con panel abierto, cron diario Hobby o worker externo.
