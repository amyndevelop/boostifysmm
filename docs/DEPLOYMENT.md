# Despliegue

Esta entrega es una base funcional demo; no activar cobros ni compras comerciales antes de completar `ROADMAP.md`.

## VPS Ubuntu

1. Node.js 24, PostgreSQL 16, usuario de aplicación sin superusuario y HTTPS mediante un proxy inverso.
2. Instalar con `npm ci`, definir `DATABASE_URL`, `APP_URL` con origen público HTTPS y `APP_MODE`. Configurar también PROVIDER_ENCRYPTION_KEY como secreto de servidor (64 caracteres hex de 32 bytes aleatorios), persistirla y respaldarla. Las claves de cada proveedor se cargan desde administración y se guardan cifradas. Usar una base nueva para producción; no reciclar saldo demo.
3. `npm run db:generate`, `npm run db:migrate`, `npm run build`. No ejecutar seed demo en producción. Respaldar la base antes de migrar.
4. Ejecutar `npm start` como servicio sin privilegios. Ejecutar `npm run worker` como otro servicio con reinicio supervisado. El worker actual solo sirve para demo.
5. Configurar secretos fuera del repositorio, copias de seguridad cifradas y probar restauración; establecer retención de sesiones, rate limits, comprobantes y auditoría. El rate limit se comparte por PostgreSQL, no por memoria de proceso.

`APP_URL` debe coincidir con el Origin de las acciones. Las cookies se marcan Secure cuando ese origen es HTTPS. Si se usa proxy, preservar Host/Origin según la configuración de Next y no permitir orígenes arbitrarios.

## Vercel

Next.js puede desplegarse con build `npm run db:generate && npm run build`. Aplicar migraciones desde CI autorizado con conectividad a PostgreSQL; usar pooling compatible con `pg`. Ejecutar el worker en un servicio persistente externo. No iniciar workers dentro de una petición ni suponer que Vercel conserva procesos. La carga actual admite imágenes de 2 MB y se almacena en PostgreSQL.

No hay despliegue ni publicación efectuados. Las páginas legales son borradores; deben completarse con identidad y políticas del operador antes del lanzamiento.
