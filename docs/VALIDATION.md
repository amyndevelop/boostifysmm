# Validación de esta entrega

Ejecutada en el entorno cloud el 6 de noviembre de 2026, con Node 24.22.1, Next 16.4.5, Prisma 6.19.3 y PostgreSQL 16.

- Instalación congelada `npm ci`: pasó; generación Prisma con adaptador: pasó.
- TypeScript estricto y ESLint: pasaron.
- Build de producción de Next: pasó.
- Dominio y contrato SMMTAKE: 28 casos ejecutados y aprobados con el runner Node. No hubo llamadas externas en estas pruebas.
- PostgreSQL: 32 escenarios más sus cuatro pruebas contenedoras (36 resultados aprobados). Se verificaron cantidades manuales, invalidaciones, concurrencia, idempotencia, precios históricos, acreditación única, permisos, ledger inmutable y recuperación del worker.
- Playwright con Chromium: 4 recorridos E2E aprobados en producción y en desarrollo. Registro, login/logout, pedido de 350 unidades por ARS 1.750, ticket persistido, acceso administrativo denegado al cliente, cookies HttpOnly/SameSite y vista de 390 px sin overflow horizontal. En desarrollo se verificó además que no hubiera errores de página JavaScript.
- Arranque PostgreSQL y migraciones repetidos sin duplicar estado: pasaron. Worker demo procesó pedidos a COMPLETED y registró liquidación única.
- Multi proveedor: creación y edición desde el sistema, conservación/reemplazo de claves, cifrado autenticado, permisos y catálogos separados con IDs externos coincidentes: aprobados. Las claves en las pruebas son ficticias.
- SMMTAKE real: no probado. No hay clave real configurada; el acceso HTTP inicial fue bloqueado por política. Se guardaron dominios y requisito opcional de clave en el borrador del entorno, sin afirmar propagación ni publicación.

Se inspeccionaron visualmente capturas de escritorio y móvil. No se realizó una auditoría completa de accesibilidad ni una prueba de carga. Los archivos `.env`, dependencias, builds y resultados de pruebas están excluidos de Git. No se enviaron pedidos reales ni emails.

## Catálogo administrable

Migración `20261106170000_catalog_management` aplicada y repetida sin cambios de estado. Se preservan servicios existentes mediante categorías derivadas y relaciones opcionales para datos anteriores. Se agregan referencias a los servicios importados y copias financieras nativas/conversión para pedidos nuevos.

Comprobaciones aprobadas: permisos del servidor; categorías ocultas y eliminación protegida; publicación selectiva; edición de precio/categoría sin alterar pedidos previos; conversión USD → ARS; conservación del costo nativo manual; actualización de costo sin modificar precio comercial; ocultamiento de orígenes ausentes; importación de 501 servicios en lotes; publicación, edición consecutiva y ocultamiento desde Chromium; costo privado ausente en la vista del cliente; pantalla móvil de 390 px sin desbordamiento.

Las nuevas rutas administrativas se verifican con `scripts/verify-deployment.mjs` para incluir el compilador WASM de Prisma en Vercel. El envío real Default ahora está habilitado mediante el flujo confirmado y auditado. No se realizaron llamadas ni compras reales en las pruebas.

## Compatibilidad del listado del proveedor

Se verificó importación con límites numéricos y textuales, tarifas numéricas y decimales en texto y capacidades opcionales/0/1. Las capacidades ausentes se conservan como no confirmadas (false); se rechazan precios o límites inválidos sin alterar el catálogo anterior. Los errores de HTTP, timeout, formato y base de datos tienen códigos y referencias seguros sin imprimir respuestas o claves. Una consulta de saldo exitosa mantiene la conexión verificada aunque falle el listado. La conexión con la credencial de producción almacenada en Vercel sigue requiriendo la comprobación del usuario después del despliegue.

## Usuarios y ajustes de saldo

La migración `20261106180000_user_balance_management` añade versión de usuario, metadatos de auditoría e historial financiero inmutable; no modifica balances existentes. Compilación, lint y TypeScript aprobados. Diez escenarios nuevos con PostgreSQL validan altas con Argon2id, créditos/débitos decimales, idempotencia concurrente, descuentos simultáneos, carrera entre pedido y descuento, protección de reservas, permisos por rol, revocación de sesiones, protección de superadministración e inmutabilidad del ajuste.

Chromium verificó crear una cuenta desde administración, acreditar ARS 1.000,25, descontar ARS 250,10 y obtener ARS 750,15; rechazar descuentos mayores al disponible; editar nombre/rol; buscar la cuenta; consultar el historial como cliente; vista móvil de 390 px sin desbordamiento. Los cuatro recorridos E2E pasaron. Los guardados del catálogo se esperan por la nueva versión confirmada del formulario, evitando comprobar avisos antiguos de éxito o esperar indefinidamente streams de Next.js.

Todas las pruebas financieras usaron la base local de pruebas o cuentas explícitas de demo local. No se modificaron saldos de producción.

## Pedidos reales y conciliación

Pruebas con transporte simulado, sin compras externas: envío concurrente único, captura y liberación de reservas, rechazo explícito, timeout sin reintento, recuperación de interrupciones, vinculación de IDs, cancelación sin crédito automático, reintegro idempotente y limitado, entrega parcial con costo real, refill único y seguimiento, operación incierta, configuración inválida sin salida de red, estados desconocidos y aislamiento de usuarios. Integración: 50 resultados aprobados; unidad: 28 aprobados. Build con trazas Prisma WASM, lint y TypeScript aprobados.

La programación de producción depende de los secretos y servicios del hosting; no se afirma haber configurado `CRON_SECRET` ni un worker externo. El cron incluido es diario, compatible con Hobby.

Chromium: seis recorridos aprobados, incluidos reintegro administrativo confirmado, protección de sesión/origen del seguimiento, autenticación del cron y vista móvil sin desbordamiento.

## Recargas automáticas con Mercado Pago

Migración `20261106210000_mercadopago` aplicada en la base local y en la base de pruebas. No modifica saldos existentes. Unitarias: 33 casos aprobados; integración: 65 resultados aprobados. Los escenarios nuevos verifican firma y expiración, URL de checkout controlada, mínimo con centavos, permisos SUPER_ADMIN, cifrado, creación concurrente, pago pendiente/rechazado/aprobado, acreditación única bajo concurrencia, cuenta/moneda/importe/modo/preferencia, pagos adicionales, devolución y respuestas antiguas, aislamiento entre usuarios y recuperación por referencia sin webhook. Sandbox no acredita saldo utilizable.

Siete recorridos de Chromium aprobados (seis existentes y el nuevo de pagos): se guardó el mínimo ARS 1.250,50, se comprobó su presentación al cliente y la vista móvil sin desbordamiento. Se comprobó que los detalles de recargas no autorizadas devuelvan la pantalla 404. Build y verificación de WASM para las nuevas rutas, TypeScript y lint aprobados. La prueba de pagos pasó después de corregir la persistencia del aviso de guardado y ajustar su expectativa al texto 404 en español.

Las peticiones de Mercado Pago usaron transporte simulado. No se crearon cobros reales, no se conectó una cuenta de producción ni se configuró su Webhook. La habilitación requiere cargar Access Token y firma secreta desde Recargas y pagos y configurar el evento payment en Mercado Pago. Ver `MERCADOPAGO.md`.

## Webhook de producción `/api/webhooks/mercadopago`

Firma obligatoria desde `MERCADOPAGO_WEBHOOK_SECRET`, sin fallback a la credencial guardada. La ruta anterior comparte el handler sin redirección. Unitarias: 40 aprobadas, incluidas rutas exportadas, variables ausentes, IDs repetidos, firma inválida, ID firmado frente a cuerpo manipulado, eventos ajenos, confirmaciones 200 y errores reintentables 503 con logs sin credenciales. Integración completa: 67 resultados aprobados. La suite de pagos ampliada pasó después con 18 resultados e incluye un fallo real de PostgreSQL que revierte pago y ledger, devuelve 503 y conserva el saldo. Las notificaciones firmadas concurrentes acreditan una sola vez.

Build Next, TypeScript, lint y trazas Prisma de ambos endpoints aprobados. HTTP contra el build local: GET devuelve 405 y POST sin secreto devuelve 503 con no-store y Retry-After, sin redirección. La pantalla de configuración conserva el mínimo y muestra solo el estado de la variable, sin su valor. No se utilizaron credenciales reales ni se configuraron variables de Vercel.
