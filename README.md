# BOOSTIFY

Panel SMM en español argentino construido desde cero con Next.js 16 App Router, React 19, TypeScript estricto, Tailwind 4, componentes compatibles con shadcn/ui, Prisma 6.19 y PostgreSQL 16.

## Ejecutar en desarrollo

Requiere Node.js 24, npm y Docker local administrado (o una base PostgreSQL 16 propia).

```bash
npm ci
node scripts/dev-db.mjs
node scripts/init-provider-key.mjs
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
# En otra terminal:
npm run worker
```

`dev-db` crea `.env` con una contraseña aleatoria únicamente si no existe; nunca sobrescribe configuración existente. Reutiliza el contenedor `boostify-postgres` y el volumen `boostify-pgdata`. No imprime credenciales. Para una base propia, configurar `.env` tomando `.env.example`, omitir `dev-db` y verificar acceso antes de migrar.

Registrá una cuenta desde `/registro`. No se crean cuentas ni contraseñas predeterminadas. El saldo inicial es cero. En modo demo podés acreditar **una sola vez** $25.000 de prueba a una cuenta existente:

```bash
npx tsx --env-file=.env scripts/demo-credit.ts tu-email
# Solo desde una terminal de confianza, para iniciar la administración:
npx tsx --env-file=.env scripts/admin.ts tu-email
```

Las cuentas creadas por E2E usan direcciones `example.invalid`, se identifican como demo y solo sirven para pruebas. Nunca reutilizar esta base demo como base comercial.

## Qué funciona

- Registro y login con Argon2id, sesión opaca aleatoria almacenada por hash, cookies HttpOnly/SameSite y expiración; cierre de sesión y bloqueo del lado servidor.
- Dashboard, catálogo por red, tema persistido en PostgreSQL, navegación inferior móvil y estados vacíos. Las cifras provienen de la base; el dashboard aclara que muestra hasta 100 pedidos.
- Pedido por cantidad manual entera (`step=1`), precio proporcional decimal HALF_UP, mínimos/máximos reales del registro, validación de enlaces y confirmación explícita.
- Recálculo del backend, comprobación de cotización, bloqueo `FOR UPDATE`, reserva de saldo, historial de precio/proveedor y outbox dentro de la misma transacción. Idempotencia por usuario y rechazo de claves reutilizadas con distinto contenido.
- Worker separado: reclamación `SKIP LOCKED`, liquidación demo y conciliación conservadora ante interrupciones. No reenvía trabajos inciertos. No envía compras reales.
- Libro mayor inmutable mediante trigger y restricciones SQL de saldo no negativo.
- Transferencias manuales con datos bancarios administrables, comprobantes PNG/JPEG de hasta 2 MB guardados en PostgreSQL y descarga autorizada. No se acredita al subir imágenes. La decisión administrativa es única y auditada.
- Tickets privados con conversación, respuestas administrativas y notificaciones internas.
- Administración protegida: métricas agregadas, pedidos, catálogo/precios, solicitudes, proveedores, importación oculta, soporte, datos bancarios y auditoría.
- Adaptador SMMTAKE basado en el contrato entregado por el usuario. Balance/servicios/estados/refill/cancel están tipados y validados. Las mutaciones están bloqueadas por defecto. Los scripts de arranque usan el proxy de entorno de Node 24 para las conexiones HTTP. Las APIs se cargan desde Administración → Proveedores y APIs, con nombre, URL HTTPS y clave independiente. Las claves se cifran con AES-256-GCM usando PROVIDER_ENCRYPTION_KEY; nunca se devuelven al navegador. La consulta e importación usa el proveedor seleccionado y requiere conectividad real. Otros proveedores deben usar el contrato SMM compatible documentado o incorporar un adaptador específico.

## Pruebas

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm start
# Con el servidor en ejecución y Chromium instalado:
npx playwright test
```

Integración crea/reutiliza exclusivamente `boostify_test` en PostgreSQL **local** y no usa la base de la aplicación. Verifica cantidades obligatorias, límites, precio histórico, saldo insuficiente, concurrencia, idempotencia, permisos de acreditación, inmutabilidad y recuperación de trabajos inciertos. Las pruebas del proveedor inyectan un transporte falso; nunca hacen compras externas. Playwright requiere `APP_MODE=demo`, catálogo seed y una base local; crea una cuenta demo en esa base para comprobar el flujo completo.

## Migraciones

Tres migraciones SQL en `prisma/migrations`: esquema/índices/finanzas importación de catálogo y metadatos de conexión multi proveedor. `npm run db:migrate` las aplica con una única transacción, advisory lock y SHA-256. Si se modifica una migración aplicada, falla. No mezclar este historial `BoostifyMigration` con `prisma migrate deploy`.

El motor binario de Prisma no está disponible con la política de red inicial. La generación usa el motor JS y el adaptador oficial `@prisma/adapter-pg`; el migrador JS experimental de Prisma 6.19 falla al introspectar el tipo PostgreSQL `name`. Por eso se ejecuta el SQL con `pg` y un historial explícito. El cliente de runtime con adaptador sí está validado. Para futuras migraciones: escribir una nueva carpeta SQL, actualizar el esquema y probar en una base vacía y una existente. No modificar migraciones publicadas. La configuración JS de CLI es experimental; no implica que el sistema esté listo para producción.

## Arquitectura

- `src/app`: páginas, Server Actions, descarga privada de comprobantes.
- `src/components`: panel responsive, formulario central, formularios de acciones y UI.
- `src/lib`: autorización, Prisma, reglas monetarias, transacciones, workers y proveedores.
- `prisma`: esquema, migraciones y catálogo demo explícito.
- `scripts`: PostgreSQL local, migración, arranque de worker y bootstrap administrativo.
- `tests`: dominio, contrato API, integración PostgreSQL y E2E.

Ver [SMMTAKE](docs/SMMTAKE.md), [despliegue](docs/DEPLOYMENT.md), [administración](docs/ADMIN.md) y [alcance pendiente](docs/ROADMAP.md).
