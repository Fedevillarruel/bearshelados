export const commerceSections = [
  { id: "resumen", label: "Resumen", description: "Una mirada sobre abastecimiento, ventas y resultados de la red." },
  { id: "ventas", label: "Ventas", description: "Tickets, productos y canales de venta por local." },
  { id: "stock", label: "Stock por local", description: "Existencias, cobertura, movimientos y vencimientos." },
  { id: "recetas", label: "Productos y recetas", description: "Ingredientes, rendimientos y costos de cada producto." },
  { id: "pedidos", label: "Pedidos y reposición", description: "Necesidades de las franquicias y seguimiento de entregas." },
  { id: "compras", label: "Compras", description: "Abastecimiento de fábrica y compras a proveedores externos." },
  { id: "rentabilidad", label: "Rentabilidad", description: "Márgenes, gastos y resultados por local y período." },
  { id: "proyecciones", label: "Proyecciones", description: "Demanda, estacionalidad y recomendaciones explicables." },
  { id: "integracion", label: "Integración Odoo", description: "Requisitos y alcance de la conexión con el sistema de gestión." },
] as const;

export type CommerceSectionId = (typeof commerceSections)[number]["id"];

export function getCommerceSection(id: string) {
  return commerceSections.find((section) => section.id === id);
}

export function commerceHref(id: CommerceSectionId) {
  return `/admin/compras-ventas/${id}`;
}

export function commerceActiveKey(id: CommerceSectionId) {
  return `commerce-${id}`;
}

export const odooQuestions = [
  {
    title: "Versión, edición y alojamiento",
    question: "¿Qué versión exacta de Odoo usan, Community o Enterprise, y dónde está alojado: Odoo Online, Odoo.sh o servidor propio? ¿Todas las franquicias usan la misma base o hay varias?",
    reason: "Define el tipo de API y cuántas conexiones hay que mantener.",
  },
  {
    title: "Plan y acceso a la API",
    question: "¿Qué plan tienen contratado y está habilitada la API externa? ¿Pueden facilitar la URL de la instancia, el nombre de la base y un entorno de pruebas?",
    reason: "En Odoo Online, la documentación limita la API externa al plan Custom.",
  },
  {
    title: "Punto de Venta y módulos",
    question: "¿El mapa de mesas pertenece a Punto de Venta / Restaurante? ¿Qué módulos usan realmente: Ventas, Inventario, Compras, Fabricación y Contabilidad? ¿Hay módulos personalizados?",
    reason: "Los tickets del POS no deben confundirse con órdenes de venta o facturas.",
  },
  {
    title: "Identificación de locales y canales",
    question: "¿Cómo se identifica cada franquicia: compañía, configuración de POS, almacén o ubicación? ¿Cómo distinguen salón, delivery, mayoristas y operaciones de fábrica?",
    reason: "Permite asignar cada operación al local y canal correctos sin duplicarla.",
  },
  {
    title: "Histórico de ventas",
    question: "¿Desde qué fecha conservan las líneas de tickets? ¿Incluyen variantes, adicionales, cantidades, descuentos, impuestos, devoluciones, anulaciones y fecha/hora? ¿Se puede obtener una exportación de muestra sin datos personales?",
    reason: "El costeo y la reposición necesitan productos y cantidades, no solo facturación diaria.",
  },
  {
    title: "Inventario, recetas y recepción",
    question: "¿Dónde se guarda hoy cada escaneo de mercadería? ¿Odoo tiene stock por local, movimientos, unidades de medida, códigos de barras, lotes, vencimientos, costos y listas de materiales o recetas?",
    reason: "Define qué datos ya son confiables y evita crear dos inventarios independientes.",
  },
  {
    title: "Permisos y sincronización",
    question: "¿Pueden crear un usuario técnico con acceso de solo lectura a los modelos necesarios y entregar su API key por un canal seguro? ¿Qué límites de consulta, horarios y mecanismos de integración admite la instalación?",
    reason: "La primera conexión será de lectura, con credenciales exclusivamente del lado del servidor.",
  },
  {
    title: "Pedidos y entregas",
    question: "¿Cómo se representan los pedidos de franquicias a fábrica y las compras a proveedores? ¿Dónde están los días de entrega, horarios de corte, mínimos de pedido y entregas parciales?",
    reason: "La escritura de órdenes se habilitará después de validar el circuito y las aprobaciones.",
  },
] as const;
