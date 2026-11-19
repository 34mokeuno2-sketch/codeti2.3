/* Contenido inicial. El editor guarda los cambios en IndexedDB. */
window.CODETI_DEFAULTS = {
  version: 1,
  settings: { name: 'CODETI', whatsapp: '51976379659', logo: 'assets/codeti-logo.png', primary: '#174ff3', accent: '#39dfbd', background: '#f4f7fb', yapeQR: '', yapeHolder: '', pickup: 'Coordina el punto exacto de recojo en Quilmaná o Roma por WhatsApp.', map: 'https://www.google.com/maps?q=Quilmana%20Canete&output=embed' },
  texts: {}, styles: {},
  sections: {
    home: { background: '#082344', image: 'assets/internet-hogar.png', overlay: 35 },
    internet: { background: '#082344', image: 'assets/internet-hogar.png', overlay: 50 },
    sistemas: { background: '#e9f2ff', image: '', overlay: 25 },
    tienda: { background: '#e9f2ff', image: '', overlay: 25 },
    empresa: { background: '#082344', image: 'assets/proyectos-referencia.jpg', overlay: 60 },
    contacto: { background: '#e9f2ff', image: '', overlay: 25 }
  },
  products: [
    { id: 'router-wifi', name: 'Router Wi-Fi', category: 'Redes', description: 'Conecta tus dispositivos y amplía la cobertura de tu hogar o negocio. Consulta modelo y disponibilidad.', price: 129, stock: 0, reference: true, published: true, images: ['assets/router.jpg'], features: ['Conectividad para el hogar', 'Asesoría para elegir tu equipo'] },
    { id: 'portatil', name: 'Laptop para tu negocio', category: 'Cómputo', description: 'Un equipo para trabajar, estudiar y gestionar tu empresa. Cotiza la configuración que necesitas.', price: 1599, stock: 0, reference: true, published: true, images: ['assets/portatil.jpg'], features: ['Configuración a medida', 'Consulta especificaciones y garantía'] },
    { id: 'camara', name: 'Cámara de seguridad', category: 'Seguridad', description: 'Supervisa tus espacios con una solución de videovigilancia. Pregunta por instalación y compatibilidad.', price: 159, stock: 0, reference: true, published: true, images: ['assets/camara.jpg'], features: ['Soluciones para casa y negocio', 'Instalación por cotización'] }
  ],
  plans: [
    { id: 'duo', name: 'Dúo Internet + Cable TV', subtitle: 'Todo el entretenimiento en un plan', speed: '200', unit: 'Mbps + más de 70 canales', price: 60, period: '/mes', featured: true, locations: ['Quilmaná', 'Roma'], features: ['Instalación gratis', 'Equipos en calidad de préstamo', 'Router Wi-Fi 6'], note: 'Confirma cobertura y condiciones de instalación.', image: '' },
    { id: 'internet', name: 'Solo Internet', subtitle: 'Para trabajar, estudiar y conectar', speed: '200', unit: 'Mbps de velocidad', price: 50, period: '/mes', featured: false, locations: ['Roma / Pueblo Nuevo de Conta'], features: ['Conexión estable', 'Asesoría y soporte local', 'S/ 10 de descuento por recomendado'], note: 'Consulta las condiciones del beneficio por recomendación.', image: '' },
    { id: 'cable', name: 'Solo Cable TV', subtitle: 'Más opciones para disfrutar en casa', speed: '+70', unit: 'canales de entretenimiento', price: 30, period: '/mes', featured: false, locations: ['Quilmaná', 'Roma'], features: ['Películas y series', 'Deportes y contenido infantil', 'Noticias, música y más'], note: 'La grilla de canales está sujeta a disponibilidad.', image: '' }
  ],
  systems: [
    { id: 'facturacion', name: 'Facturación electrónica', category: 'Gestión comercial', description: 'Emite comprobantes y organiza las ventas de tu empresa en una sola plataforma.', price: 420, period: '/año', features: ['Facturas, boletas y notas de venta', 'Integración con SUNAT', 'Clientes, productos y reportes'], image: 'assets/sistema.svg', gallery: [], demo: '' },
    { id: 'pos', name: 'Punto de venta e inventario', category: 'Tiendas y comercios', description: 'Agiliza tu atención y mantén tus productos, ventas y compras bajo control.', price: null, period: '', features: ['Carrito de venta', 'Control de inventario', 'Compras y proveedores'], image: 'assets/pos.svg', gallery: [], demo: '' },
    { id: 'farmacia', name: 'Sistema para farmacia', category: 'Farmacias', description: 'Consulta una solución de gestión para la operación de tu farmacia.', price: null, period: '', features: ['Catálogo de productos', 'Existencias y precios', 'Reportes de ventas'], image: 'assets/farmacia.svg', gallery: [], demo: '' }
  ],
  services: [
    { id: 'redes', name: 'Infraestructura y redes', description: 'Cableado estructurado, servidores, redes y puesta en marcha de sistemas para oficinas y negocios.', icon: 'network', image: 'assets/proyectos-referencia.jpg' },
    { id: 'mayorista', name: 'Tecnología al por mayor', description: 'Equipos de cómputo, servidores, switches, routers y accesorios para tus proyectos de tecnología.', icon: 'box', image: 'assets/router.jpg' },
    { id: 'obras', name: 'Obras y climatización', description: 'Remodelación y acabados de espacios comerciales, suministro e instalación de aire acondicionado y ventilación.', icon: 'building', image: 'assets/proyectos-referencia.jpg' }
  ],
  gallery: [{ image: 'assets/proyectos-referencia.jpg', caption: 'Infraestructura de TI · imagen referencial' }]
};
