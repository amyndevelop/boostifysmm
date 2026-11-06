# Administración inicial

1. Registrá una cuenta. Desde una terminal autorizada, usá `scripts/admin.ts` con su email para asignar SUPER_ADMIN. No hay credenciales predeterminadas.
2. En `/admin`, configurá datos bancarios reales solo cuando corresponda. Esto habilita solicitudes manuales; subir un comprobante no genera créditos.
3. Verificá el ingreso bancario antes de seleccionar acreditación. El backend comprueba el rol, estado pendiente, registra un movimiento único y una entrada de auditoría. Un segundo intento no duplica saldo.
4. En **Categorías**, creá cada categoría con nombre, red social, descripción, orden y visibilidad. Desactivar una categoría oculta todos sus servicios. Para eliminarla debe estar vacía.
5. En **Servicios → Servicios del proveedor**, buscá por nombre, ID o categoría de origen y filtrá por proveedor. El listado está paginado. Usá **Configurar publicación** para elegir los servicios que querés ofrecer.
6. En el editor definí nombre y descripción comercial, categoría, precio de venta en ARS, cantidades mínima/máxima, tipo de enlace, dominios, orden y publicación. El origen importado conserva su ID, nombre técnico, costo, moneda y límites; podés cambiar a otro origen desde el selector de servicios importados. También podés crear un servicio manual con proveedor, ID y costo originales.
7. Si el proveedor cobra en USD u otra moneda, ingresá cuántos ARS equivale una unidad de esa moneda. La pantalla calcula costo convertido, ganancia por mil y margen. No se consulta una cotización automática. El precio de venta lo fijás vos.
8. **Guardar servicio** crea o actualiza el registro; **Publicar/Ocultar** controla su aparición en el catálogo. Publicar requiere proveedor y categoría activos y un origen disponible de tipo Default. Los tipos con campos extra no se publican hasta incorporar esos formularios. Un servicio con pedidos puede ocultarse, pero no eliminarse.
9. **Importar servicios** refresca costos, límites y disponibilidad en lotes sin sobrescribir nombre comercial, descripción, categorías ni precios de venta. Si un origen desaparece, deja de verse al cliente. Si cambia de moneda o sus nuevos límites invalidan tu configuración, se oculta para revisión. Los pedidos anteriores conservan sus importes y su cotización.
10. Consultá tickets y respondé en la misma pantalla. Los clientes solo ven sus propios tickets y comprobantes.
11. En Proveedores y APIs, cargá cada proveedor con su nombre, tipo compatible, URL y clave. Usá Probar conexión y después Importar servicios para ese proveedor. Dejar la clave vacía al editar conserva la existente. La importación no publica servicios y no habilita pedidos reales.

No existen retiros ni transferencias entre billeteras. No modificar balances directamente por SQL; el libro mayor debe explicar todo cambio. El crédito demo por CLI se puede aplicar una sola vez a cada cuenta y solo en modo demo.
