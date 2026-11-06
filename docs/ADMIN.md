# Administración inicial

1. Registrá una cuenta. Desde una terminal autorizada, usá `scripts/admin.ts` con su email para asignar SUPER_ADMIN. No hay credenciales predeterminadas.
2. En `/admin`, configurá datos bancarios reales solo cuando corresponda. Esto habilita solicitudes manuales; subir un comprobante no genera créditos.
3. Verificá el ingreso bancario antes de seleccionar acreditación. El backend comprueba el rol, estado pendiente, registra un movimiento único y una entrada de auditoría. Un segundo intento no duplica saldo.
4. Editá nombres y tarifas comerciales desde el catálogo. Las tarifas históricas de pedidos son independientes.
5. Consultá tickets y respondé en la misma pantalla. Los clientes solo ven sus propios tickets y comprobantes.
6. En Proveedores y APIs, cargá cada proveedor con su nombre, tipo compatible, URL y clave. Usá Probar conexión y después Importar servicios para ese proveedor. Dejar la clave vacía al editar conserva la existente. La importación no publica servicios y no habilita pedidos reales.

No existen retiros ni transferencias entre billeteras. No modificar balances directamente por SQL; el libro mayor debe explicar todo cambio. El crédito demo por CLI se puede aplicar una sola vez a cada cuenta y solo en modo demo.
