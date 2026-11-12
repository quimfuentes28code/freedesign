import { useState } from 'react'
import { api, useApi } from '../../api/client'

interface Props {
  id: string
  /** Guarda lo que haya pendiente antes de crear una versión o de volver a otra. */
  onSaveNow: () => Promise<void>
  /** Tras volver a una versión: el editor recarga el diseño. */
  onRestored: () => void
}

/**
 * Historial de versiones de un diseño (pestaña «Versiones» de «Prenda»). Se guarda una sola cada 10 minutos de trabajo
 * y, cuando quieras, una con nombre. Volver a una versión guarda antes cómo estaba («Antes de restaurar»).
 */
export function VersionsPanel({ id, onSaveNow, onRestored }: Props) {
  const versions = useApi(() => api.listVersions(id), [id])
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const saveVersion = () =>
    run(async () => {
      await onSaveNow()
      await api.saveVersion(id, label.trim())
      setLabel('')
      versions.reload()
    })

  const restore = (vid: string) =>
    run(async () => {
      await onSaveNow()
      await api.restoreVersion(id, vid)
      onRestored()
    })

  const remove = (vid: string) =>
    run(async () => {
      await api.deleteVersion(id, vid)
      versions.reload()
    })

  const list = versions.data ?? []
  return (
    <div className="lz-versions">
      <p className="lz-muted">
        El diseño se guarda solo mientras trabajas. Cada 10 minutos queda además una versión, y puedes guardar las tuyas con
        nombre (p. ej. «Enviada al cliente»). Volver a una versión no borra nada: antes se guarda cómo estaba.
      </p>
      <div className="lz-version-new">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nombre de la versión" maxLength={80} onKeyDown={(e) => e.key === 'Enter' && !busy && saveVersion()} />
        <button className="lz-btn primary" onClick={saveVersion} disabled={busy}>
          Guardar versión
        </button>
      </div>
      {error && <p className="lz-error">{error}</p>}
      {versions.loading && !versions.data && <p className="lz-muted">Cargando…</p>}
      {versions.data && list.length === 0 && <p className="lz-muted">Aún no hay versiones.</p>}
      <div className="lz-rows">
        {list.map((v, i) => (
          <div key={v.id} className="lz-version">
            <div>
              <strong>{v.label || (i === list.length - 1 ? 'Primera versión' : 'Automática')}</strong>
              <span className="lz-version-date">{when(v.createdAt)}</span>
            </div>
            <div className="lz-version-actions">
              <button className="lz-chip" onClick={() => restore(v.id)} disabled={busy} title="El diseño vuelve a como estaba en esta versión">
                Volver a esta
              </button>
              <button className="lz-mini" onClick={() => remove(v.id)} disabled={busy} title="Quitar esta versión del historial" aria-label="Quitar versión">
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** «hoy 12:40», «ayer 18:05» o «3 nov 2026, 10:15». */
function when(iso: string) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const today = new Date(new Date().setHours(0, 0, 0, 0)).getTime()
  if (day === today) return `hoy ${time}`
  if (day === today - 864e5) return `ayer ${time}`
  return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}, ${time}`
}
