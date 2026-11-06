# Despliegue

Los pedidos reales Default están habilitados para proveedores activos configurados. `APP_MODE=demo` mantiene la simulación aislada; no ejecutar el seed demo en producción.

## VPS Ubuntu

1. Node.js 24, PostgreSQL 16, usuario de aplicación sin superusuario y HTTPS mediante un proxy inverso.
2. Instalar con `npm ci`, definir `DATABASE_URL`, `APP_URL` con origen público HTTPS y `APP_MODE`. Configurar también PROVIDER_ENCRYPTION_KEY como secreto de servidor (64 caracteres hex de 32 bytes aleatorios), persistirla y respaldarla. Las claves de cada proveedor se cargan desde administración y se guardan cifradas. Usar una base nueva para producción; no reciclar saldo demo.
3. `npm run db:generate`, `npm run db:migrate`, `npm run build`. No ejecutar seed demo en producción. Respaldar la base antes de migrar.
4. Ejecutar `npm start` como servicio sin privilegios. Ejecutar `npm run worker` como otro servicio con reinicio supervisado. El worker procesa envíos pendientes, estados y reposiciones de los proveedores configurados.
5. Configurar secretos fuera del repositorio, copias de seguridad cifradas y probar restauración; establecer retención de sesiones, rate limits, comprobantes y auditoría. El rate limit se comparte por PostgreSQL, no por memoria de proceso.

`APP_URL` debe coincidir con el Origin de las acciones. Las cookies se marcan Secure cuando ese origen es HTTPS. Si se usa proxy, preservar Host/Origin según la configuración de Next y no permitir orígenes arbitrarios.

## Vercel

Usar build `npm run db:generate && npm run db:migrate && npm run build` y Node.js 24. Las migraciones necesitan conectividad a PostgreSQL. La confirmación del cliente envía el pedido dentro de la petición (máximo 60 segundos); no depende de un proceso persistente. El panel abierto consulta estados aproximadamente cada minuto.

`vercel.json` configura un cron diario a las 06:00 UTC, compatible con Hobby. Requiere crear `CRON_SECRET` como secreto aleatorio en Vercel y volver a desplegar; sin ese secreto el endpoint responde 503. Este repositorio no configura secretos en Vercel. El cron diario es un respaldo, no seguimiento continuo. Para seguimiento frecuente sin usuarios conectados, ejecutar `npm run worker` en un servicio persistente o usar un scheduler externo que invoque `GET /api/cron/orders` con `Authorization: Bearer <CRON_SECRET>`. No incluir secretos en URLs. Las ejecuciones tienen presupuesto y lotes limitados; dimensionar el scheduler según el volumen.

`ORDERS_ENABLED=false` pausa nuevos envíos. Mantener `APP_URL` con el origen público, `DATABASE_URL` y la clave maestra existente. La carga admite imágenes de 2 MB almacenadas en PostgreSQL.

Las páginas legales son borradores; deben completarse con identidad y políticas del operador antes del lanzamiento.
