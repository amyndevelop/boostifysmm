# Alcance pendiente antes de comercializar

La entrega implementa un flujo vertical demo completo y partes de administración. No equivale a las seis fases comerciales terminadas.

- Integración real: credencial y conectividad SMMTAKE no verificadas. Faltan mapeo/publicación del catálogo importado, conversión monetaria, envío real del worker, polling, costo real, conciliación operativa y políticas de reintegro/refill. No habilitar compras hasta completar y probar estos pasos.
- Recuperación de contraseña por email y verificación de dirección: falta configurar un proveedor transaccional y plantillas. No se envían emails. La interfaz identifica el contacto administrativo como mecanismo temporal.
- Gestión ampliada de usuarios: bloqueo/desbloqueo, delegación granular de permisos y administración segura de roles; roles iniciales y autorización ya existen, pero aún no tienen consola de gestión completa.
- Revendedores: faltan tarifas específicas/descuentos, categorías comerciales y gestión administrativa. La API pública es un módulo futuro, aún no implementado.
- Catálogo: redes/categorías dinámicas administrables, tipos de enlace por servicio, orden, márgenes y alertas de costo sincronizado; la versión actual permite editar nombre, tarifa y publicación de los servicios existentes.
- Configuración ampliada: marca, logo, registro habilitable, mínimo de depósito y política de redondeo configurables; actualmente moneda ARS, mínimo $1.000 y HALF_UP son explícitos y fijos.
- Analítica comercial ampliada: rangos de fechas, series de ingresos/costos, clientes principales y agregados sin límite. El dashboard cliente limita su actividad a los últimos 100 pedidos y lo declara.
- Adjuntos: se validan tamaño, MIME y firma PNG/JPEG y se descargan como attachment; faltan decodificación/re-encode, análisis antimalware y política de retención.
- Seguridad de producción: revisión independiente, MFA administrativa, recuperación segura de cuentas, permisos DB mínimos, rotación de la clave maestra con recifrado de credenciales, observabilidad sin datos sensibles, cierre de sesiones expiradas y limpieza de rate limits.
- UX: paginación con consultas al servidor (las vistas actuales tienen límites explícitos), navegación profunda por sección, ampliación de componentes shadcn y auditoría completa de WCAG 2.2 AA. CSP conserva unsafe-inline para compatibilidad Next; una política con nonces queda pendiente.
- Legales, pruebas de carga, recuperación ante desastres y despliegue comercial.

Los botones presentes ejecutan las acciones implementadas. Las funciones no disponibles se describen como pendientes; no se sustituyen por confirmaciones ficticias.
