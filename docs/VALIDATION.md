# Validación de esta entrega

Ejecutada en el entorno cloud el 6 de noviembre de 2026, con Node 24.22.1, Next 16.4.5, Prisma 6.19.3 y PostgreSQL 16.

- Instalación congelada `npm ci`: pasó; generación Prisma con adaptador: pasó.
- TypeScript estricto y ESLint: pasaron.
- Build de producción de Next: pasó.
- Dominio y contrato SMMTAKE: 23 casos ejecutados y aprobados con el runner Node. No hubo llamadas externas en estas pruebas.
- PostgreSQL: 12 escenarios más sus dos pruebas contenedoras (14 resultados aprobados). Se verificaron cantidades manuales, invalidaciones, concurrencia, idempotencia, precios históricos, acreditación única, permisos, ledger inmutable y recuperación del worker.
- Playwright con Chromium: 2 recorridos E2E aprobados en producción y en desarrollo. Registro, login/logout, pedido de 350 unidades por ARS 1.750, ticket persistido, acceso administrativo denegado al cliente, cookies HttpOnly/SameSite y vista de 390 px sin overflow horizontal. En desarrollo se verificó además que no hubiera errores de página JavaScript.
- Arranque PostgreSQL y migraciones repetidos sin duplicar estado: pasaron. Worker demo procesó pedidos a COMPLETED y registró liquidación única.
- Multi proveedor: creación y edición desde el sistema, conservación/reemplazo de claves, cifrado autenticado, permisos y catálogos separados con IDs externos coincidentes: aprobados. Las claves en las pruebas son ficticias.
- SMMTAKE real: no probado. No hay clave real configurada; el acceso HTTP inicial fue bloqueado por política. Se guardaron dominios y requisito opcional de clave en el borrador del entorno, sin afirmar propagación ni publicación.

Se inspeccionaron visualmente capturas de escritorio y móvil. No se realizó una auditoría completa de accesibilidad ni una prueba de carga. Los archivos `.env`, dependencias, builds y resultados de pruebas están excluidos de Git. No se enviaron pedidos reales ni emails.
