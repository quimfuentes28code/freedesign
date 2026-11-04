import { Link } from 'react-router'
import { PageHeader } from '../components/ui'

/** Página para rutas que no existen. */
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
