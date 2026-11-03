import { Link } from 'react-router'
import { ComingSoon, PageHeader } from '../components/ui'

/** Apartados aún por construir. Cada uno explica lo que tendrá. */

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
