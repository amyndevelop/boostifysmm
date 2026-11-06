# Recargas automáticas con Mercado Pago

Checkout Pro en Argentina y ARS. El cliente crea una recarga, paga en el sitio de Mercado Pago y vuelve a su detalle. El retorno del navegador no acredita saldo.

## Configuración

1. Desplegar la migración `20261106210000_mercadopago`. El build de Vercel debe ejecutar `npm run db:generate && npm run db:migrate && npm run build`.
2. Mantener `APP_URL=https://boostifysmm.vercel.app` (o el dominio público definitivo) y la clave maestra `PROVIDER_ENCRYPTION_KEY` existente. No generar otra clave si ya hay proveedores configurados.
3. En Mercado Pago Developers, crear una aplicación Checkout Pro y obtener el Access Token de la cuenta argentina.
4. Configurar Webhooks para el evento **Pagos / payment**, con URL `https://boostifysmm.vercel.app/api/mercadopago/webhook`. Copiar la firma secreta que entrega Mercado Pago.
5. Como SUPER_ADMIN, entrar en `/admin/recargas`. Configurar mínimo, modo, Access Token y firma secreta; habilitar y guardar. El servidor consulta `/users/me` y verifica `site_id=MLA`. Las credenciales se cifran en PostgreSQL y los campos vacíos conservan sus valores; no se muestran los secretos guardados.

El mínimo inicial es ARS 1.000, editable entre ARS 1 y ARS 10.000.000. Se aplica en el servidor a nuevas transferencias y checkouts. Las recargas ya creadas conservan su importe. Se acredita el importe bruto: las comisiones las absorbe el negocio.

Usar una base separada para pruebas. Las aprobaciones sandbox no generan saldo utilizable. Después de crear recargas se bloquean cambios de cuenta o modo para conservar la conciliación histórica. Se pueden rotar credenciales de la misma cuenta y deshabilitar nuevos checkouts; los pagos pendientes continúan siendo verificables.

## Verificación y acreditación

Se comprueba HMAC-SHA256 de `x-signature` usando `data.id`, `x-request-id` y `ts`, con tolerancia de diez minutos. Solo se acepta un ID numérico de pago en la query; no se confía en importes, estados ni URLs enviados por el webhook. La firma se contrastó con el validador del SDK oficial `mercadopago@3.6.1` consultado desde npm.

El servidor consulta `GET /v1/payments/{id}` y `GET /merchant_orders/{id}` en el host fijo `api.mercadopago.com`. Verifica cuenta receptora, moneda, importe, modo, referencia local, preferencia y pertenencia del pago a la orden. Solo un `approved` de producción sin devoluciones acredita. El bloqueo de billetera/recarga, ID único de pago y movimiento `mp:{id}` impiden acreditaciones duplicadas. Se conserva la fecha de actualización del proveedor para ignorar respuestas antiguas.

El webhook procesa la acreditación en la petición, sin requerir cron. Devuelve 503 ante fallos transitorios para que Mercado Pago reintente. El cliente puede consultar desde `/recargas/{id}` y el administrador desde `/admin/recargas`; la búsqueda por referencia recupera un pago aunque no haya llegado su notificación. El detalle consulta automáticamente hasta cinco veces mientras está visible. El endpoint de webhook debe quedar accesible públicamente, sin protección de preview de Vercel.

No se persisten datos de tarjetas ni respuestas completas. La aplicación no crea pagos por API: crea preferencias y el comprador decide pagar en Mercado Pago. Un enlace incierto nunca se recrea automáticamente bajo la misma confirmación.

## Revisión manual

Los pagos de importe/moneda/preferencia incorrectos, aprobaciones adicionales para la misma recarga, devoluciones, disputas y contracargos se marcan como `REVIEW_REQUIRED`. No se duplica saldo ni se aplican débitos automáticos. El operador debe revisar Mercado Pago y usar los ajustes manuales auditados de Usuarios y saldos cuando corresponda; si el dinero ya fue gastado, decidir el tratamiento de la cuenta. No hay API automática de devolución ni conciliación automática de deuda en esta entrega.

## Validación y límites

Pruebas automatizadas con transporte simulado y PostgreSQL local; no se realizaron pagos ni se conectó una cuenta real. No se afirma haber configurado credenciales o Webhooks en la cuenta de producción. La documentación web oficial estuvo bloqueada por la política de red cloud; se consultaron los tipos y el validador del SDK oficial de npm. La operación real requiere las credenciales y una comprobación posterior del operador. Si este entorno cloud debe llamar a la API real, autorizar `api.mercadopago.com` mediante la configuración de red; el desarrollo no alteró esa política.
