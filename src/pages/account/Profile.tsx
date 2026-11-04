import { useState, type FormEvent } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Field, PageHeader } from '../../components/ui'
import { MIN_PASSWORD, type ProfileInput } from '../../shared/users'
import { AccountTypePicker } from '../auth/AuthPages'

/** /perfil — datos de la cuenta y cambio de contraseña. */
export function ProfilePage() {
  const { user, setUser, logout } = useAuth()
  const [form, setForm] = useState<ProfileInput>(() => ({
    accountType: user!.accountType,
    name: user!.name,
    companyName: user!.companyName,
    taxId: user!.taxId,
    phone: user!.phone,
  }))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const isCompany = form.accountType === 'empresa'
  const set = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setMsg(null)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      setUser(await api.updateProfile(form))
      setMsg({ ok: true, text: 'Cambios guardados.' })
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Mi perfil"
        subtitle={`Cuenta creada el ${new Date(user!.createdAt).toLocaleDateString('es-ES')}`}
        actions={
          <button type="button" className="button" onClick={logout}>
            Cerrar sesión
          </button>
        }
      />
      <div className="form-layout">
        <form className="card" onSubmit={save}>
          <h2>Datos de la cuenta</h2>
          {msg && <p className={msg.ok ? 'status ok' : 'status error'}>{msg.text}</p>}
          <div className="fields">
            <div className="field wide">
              <span>Tipo de cuenta</span>
              <AccountTypePicker value={form.accountType} onChange={(t) => set('accountType', t)} />
            </div>
            {isCompany && (
              <>
                <Field label="Nombre de la empresa *">
                  <input required value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
                </Field>
                <Field label="CIF / NIF">
                  <input value={form.taxId} onChange={(e) => set('taxId', e.target.value)} />
                </Field>
              </>
            )}
            <Field label={isCompany ? 'Persona de contacto *' : 'Nombre *'}>
              <input required value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Teléfono">
              <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Email" wide>
              <input value={user!.email} disabled />
            </Field>
          </div>
          <div className="form-actions">
            <button type="submit" className="button primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
        <PasswordCard />
      </div>
    </div>
  )
}

function PasswordCard() {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== repeat) {
      setMsg({ ok: false, text: 'Las contraseñas nuevas no coinciden' })
      return
    }
    setSaving(true)
    try {
      await api.changePassword(current, password)
      setMsg({ ok: true, text: 'Contraseña cambiada. Se han cerrado las sesiones de otros dispositivos.' })
      setCurrent('')
      setPassword('')
      setRepeat('')
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Cambiar contraseña</h2>
      {msg && <p className={msg.ok ? 'status ok' : 'status error'}>{msg.text}</p>}
      <div className="fields">
        <Field label="Contraseña actual" wide>
          <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label={`Nueva (mín. ${MIN_PASSWORD})`}>
          <input
            type="password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Repite la nueva">
          <input type="password" required autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </Field>
      </div>
      <div className="form-actions">
        <button type="submit" className="button" disabled={saving}>
          {saving ? 'Cambiando…' : 'Cambiar contraseña'}
        </button>
      </div>
    </form>
  )
}
