import { Link } from 'react-router'
import { ComingSoon, PageHeader } from '../components/ui'

/** Apartados aún por construir. Cada uno explica lo que tendrá. */

export function Designer() {
  return (
    <div className="page">
      <PageHeader title="Diseñador" subtitle="Editor de prendas · Próximamente" />
      <div className="card coming-soon">
        <p>Aquí elegirás una prenda base y la irás personalizando sobre su dibujo técnico, viéndola de frente, espalda, lado y en detalle.</p>
        <ul>
          <li>Catálogo de prendas base</li>
          <li>Colores por pieza y materiales (tejidos, texturas y acabados)</li>
          <li>Estampados: imágenes, gráficos, textos, logotipos e ilustraciones</li>
          <li>Creador de estampados y logotipos</li>
          <li>Detalles: cremalleras, bolsillos, botones, costuras…</li>
        </ul>
        <Link to="/disenador/3d" className="button">
          Abrir la vista previa 3D (en pruebas)
        </Link>
      </div>
    </div>
  )
}

export function Projects() {
  return (
    <ComingSoon
      title="Proyectos"
      intro="Cada prenda será un proyecto propio, agrupado por cliente o por colección, con todo lo que necesitas en un sitio."
      items={[
        'Estado del proyecto (en qué fase está)',
        'Bocetos, diseños finales, fotos y referencias',
        'Materiales utilizados, coste y notas',
        'Organización por clientes o colecciones',
      ]}
    />
  )
}

export function Production() {
  return (
    <ComingSoon
      title="Producción"
      intro="Documentación de fabricación generada automáticamente a partir del diseño."
      items={[
        'Ficha técnica y tech pack (dibujo técnico frontal y trasero, materiales, colores, medidas)',
        'Lista de materiales y cálculo de costes',
        'Tipos de costura, acabados y detalles de confección',
        'Instrucciones y registro de producción paso a paso',
      ]}
    />
  )
}

export function Library() {
  return (
    <ComingSoon
      title="Biblioteca"
      intro="Tus materiales y recursos, cada uno con nombre, fotografía, descripción, proveedor y precio aproximado."
      items={['Tejidos y acabados', 'Fornituras: cremalleras, botones, cordones…', 'Estampados y logotipos', 'Proveedores']}
    />
  )
}

export function Economy() {
  return (
    <ComingSoon
      title="Economía"
      intro="El coste real de cada prenda y su rentabilidad."
      items={['Coste por prenda (materiales y mano de obra)', 'Precio de venta y margen', 'Resumen por proyecto, cliente y colección']}
    />
  )
}

export function NotFound() {
  return (
    <div className="page">
      <PageHeader title="Página no encontrada" />
      <Link to="/" className="button">
        Ir al Dashboard
      </Link>
    </div>
  )
}
