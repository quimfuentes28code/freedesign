import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, useApi } from '../../api/client'
import { PageHeader, Status } from '../../components/ui'
import { fileUrl } from '../../shared/library'
import { LibraryTabs } from './LibraryTabs'
import './creator.css'

/** Gráficos para estampar: logos, ilustraciones y textos, subidos o creados en el creador. */
export function ArtworksList() {
  const { data, error, loading, reload } = useApi(() => api.listArtworks(), [])
  const navigate = useNavigate()
  const file = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setUploadError(null)
    try {
      for (const f of Array.from(files)) await api.uploadArtwork(f)
      reload()
    } catch (e) {
      setUploadError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Biblioteca"
        subtitle="Materiales y recursos para tus prendas"
        actions={
          <>
            <button className="button" onClick={() => file.current?.click()} disabled={uploading}>
              {uploading ? 'Subiendo…' : 'Subir imágenes'}
            </button>
            <button className="button primary" onClick={() => navigate('/biblioteca/graficos/nuevo')}>
              Crear gráfico
            </button>
          </>
        }
      />
      <LibraryTabs />
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      <p className="muted small">
        Logos, ilustraciones y textos para estampar. Sube tus imágenes (mejor PNG con fondo transparente o SVG) o crea uno en el
        creador. Después los colocas sobre las prendas en el Diseñador.
      </p>
      {uploadError && <p className="status error">{uploadError}</p>}
      <Status loading={loading && !data} error={error} />

      {data && data.length === 0 && (
        <div className="card empty">
          <p>Todavía no hay gráficos.</p>
          <Link to="/biblioteca/graficos/nuevo" className="button primary">
            Crear el primero
          </Link>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="material-grid">
          {data.map((a) => (
            <Link key={a.id} to={`/biblioteca/graficos/${a.id}`} className="card material-card">
              <div className="material-photo artwork-photo">
                <img src={fileUrl(a.file)} alt="" loading="lazy" />
              </div>
              <div className="material-body">
                <span className="tag muted">{a.data ? 'Creado aquí' : 'Imagen subida'}</span>
                <strong>{a.name}</strong>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
