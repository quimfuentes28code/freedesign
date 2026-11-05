import { useState, type FormEvent } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Field, PageHeader } from '../../components/ui'
import { COLOR_CHART } from '../../designer/colors'
import { MAX_BRAND_COLORS, MIN_PASSWORD, type BrandColor, type ProfileInput } from '../../shared/users'
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
        <BrandColorsCard />
        <PasswordCard />
      </div>
    </div>
  )
}

/** Paleta de colores de la marca: sale en el creador de gráficos y en el Diseñador. */
function BrandColorsCard() {
  const { user, setUser } = useAuth()
  const [colors, setColors] = useState<BrandColor[]>(() => user!.brandColors ?? [])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [chart, setChart] = useState(false)
  const edit = (i: number, patch: Partial<BrandColor>) => {
    setColors((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))
    setMsg(null)
  }
  const add = (c: BrandColor) => {
    setColors((cs) => (cs.length >= MAX_BRAND_COLORS ? cs : [...cs, c]))
    setMsg(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      setUser(await api.saveBrandColors(colors))
      setMsg({ ok: true, text: 'Paleta guardada.' })
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Colores de la marca</h2>
      <p className="muted">Tu paleta sale la primera en el creador de gráficos y en las piezas del Diseñador.</p>
      {msg && <p className={msg.ok ? 'status ok' : 'status error'}>{msg.text}</p>}
      <div className="brand-colors">
        {colors.map((c, i) => (
          <div key={i} className="brand-color">
            <input type="color" value={c.hex} onChange={(e) => edit(i, { hex: e.target.value })} aria-label="Color" />
            <input placeholder="Nombre (p. ej. Rojo marca)" value={c.name} maxLength={40} onChange={(e) => edit(i, { name: e.target.value })} />
            <input placeholder="Código (p. ej. Pantone 186 C)" value={c.code} maxLength={30} onChange={(e) => edit(i, { code: e.target.value })} />
            <button type="button" className="button small" onClick={() => setColors((cs) => cs.filter((_, j) => j !== i))} aria-label="Quitar color">
              ✕
            </button>
          </div>
        ))}
        {!colors.length && <p className="muted">Aún no hay colores.</p>}
      </div>
      <div className="form-actions brand-actions">
        <button type="button" className="button" disabled={colors.length >= MAX_BRAND_COLORS} onClick={() => add({ hex: '#000000', name: '', code: '' })}>
          Añadir color
        </button>
        <button type="button" className="button" onClick={() => setChart((v) => !v)}>
          {chart ? 'Cerrar carta' : 'Desde la carta de colores'}
        </button>
        <button type="submit" className="button primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar paleta'}
        </button>
      </div>
      {chart && (
        <div className="brand-chart">
          {COLOR_CHART.map((g) => (
            <div key={g.name}>
              <span className="muted">{g.name}</span>
              <div className="swatch-grid">
                {g.colors.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    className="swatch-button"
                    style={{ background: c.hex }}
                    title={`${c.name} · ${c.code}`}
                    onClick={() => add({ hex: c.hex, name: c.name, code: c.code })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </form>
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
