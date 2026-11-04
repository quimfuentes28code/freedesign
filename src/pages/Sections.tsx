import { Link } from 'react-router'
import { ComingSoon, PageHeader } from '../components/ui'

/** Apartados aún por construir. Cada uno explica lo que tendrá. */

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
