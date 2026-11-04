import { useRef, useState, type DragEvent } from 'react'
import { api } from '../../api/client'
import { fileUrl } from '../../shared/library'

/** Foto de un elemento: se puede arrastrar o elegir, se sube al momento y se puede quitar. */
export function PhotoInput({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('El archivo tiene que ser una imagen')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const { key } = await api.uploadImage(file)
      onChange(key)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const drop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    upload(e.dataTransfer.files[0])
  }

  return (
    <div className="photo-input">
      <button
        type="button"
        className={over ? 'photo-drop over' : 'photo-drop'}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        {value ? (
          <img src={fileUrl(value)} alt="Foto del material" />
        ) : (
          <span>{uploading ? 'Subiendo…' : 'Arrastra una foto o haz clic para elegirla'}</span>
        )}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
      <div className="photo-actions">
        {value && (
          <>
            <button type="button" className="button" onClick={() => input.current?.click()} disabled={uploading}>
              {uploading ? 'Subiendo…' : 'Cambiar foto'}
            </button>
            <button type="button" className="button" onClick={() => onChange('')}>
              Quitar
            </button>
          </>
        )}
      </div>
      {error && <p className="status error">{error}</p>}
    </div>
  )
}
