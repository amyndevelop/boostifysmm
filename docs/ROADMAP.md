# Alcance pendiente antes de comercializar

La entrega implementa un flujo vertical demo completo y partes de administración. No equivale a las seis fases comerciales terminadas.

- Integración real: envío Default, seguimiento, costo real, cancelación/refill y conciliación/reintegros auditados implementados y probados con transporte simulado. Queda la validación operativa con el proveedor real y configurar un scheduler frecuente o worker persistente para seguimiento sin usuarios conectados. No se hicieron compras reales en las pruebas.
- Recuperación de contraseña por email y verificación de dirección: falta configurar un proveedor transaccional y plantillas. No se envían emails. La interfaz identifica el contacto administrativo como mecanismo temporal.
- Usuarios: consola de alta/edición/bloqueo/roles y cargas/descuentos auditados ya implementada. Quedan permisos personalizados por acción y flujos de recuperación por email/MFA administrativa.
- Revendedores: faltan tarifas específicas/descuentos, categorías comerciales y gestión administrativa. La API pública es un módulo futuro, aún no implementado.
- Catálogo: quedan pendientes formularios específicos para Custom Comments, Subscriptions y otros tipos del proveedor, cálculo automático de tipo de cambio y verificación semántica por tipo de enlace/red. Categorías, redes por categoría, editor comercial, precios propios, márgenes y publicación individual ya están implementados.
- Configuración ampliada: marca, logo, registro habilitable y política de redondeo configurables; actualmente moneda ARS y HALF_UP son explícitos y fijos. El mínimo de depósito ya es editable en Recargas y pagos.
- Analítica comercial ampliada: rangos de fechas, series de ingresos/costos, clientes principales y agregados sin límite. El dashboard cliente limita su actividad a los últimos 100 pedidos y lo declara.
- Adjuntos: se validan tamaño, MIME y firma PNG/JPEG y se descargan como attachment; faltan decodificación/re-encode, análisis antimalware y política de retención.
- Seguridad de producción: revisión independiente, MFA administrativa, recuperación segura de cuentas, permisos DB mínimos, rotación de la clave maestra con recifrado de credenciales, observabilidad sin datos sensibles, cierre de sesiones expiradas y limpieza de rate limits.
- UX: extender la paginación del catálogo y pedidos administrativos a movimientos y demás vistas, navegación profunda por sección, ampliación de componentes shadcn y auditoría completa de WCAG 2.2 AA. CSP conserva unsafe-inline para compatibilidad Next; una política con nonces queda pendiente.
- Legales, pruebas de carga, recuperación ante desastres y despliegue comercial.

Los botones presentes ejecutan las acciones implementadas. Las funciones no disponibles se describen como pendientes; no se sustituyen por confirmaciones ficticias.
