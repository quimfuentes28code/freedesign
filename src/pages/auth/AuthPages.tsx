import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { Field } from '../../components/ui'
import { ACCOUNT_TYPES, MIN_PASSWORD, type AccountType, type RegisterInput } from '../../shared/users'

/** Marco común de las pantallas sin sesión: logo, título y tarjeta centrada. */
function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-brand">FreeDesign</div>
        <div className="card auth-card">
          <h1>{title}</h1>
          <p className="muted small">{subtitle}</p>
          {children}
        </div>
        <p className="auth-footer small muted">{footer}</p>
      </div>
    </div>
  )
}

/** /entrar — iniciar sesión con email y contraseña. */
export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      await login(email, password)
    } catch (err) {
      setError((err as Error).message)
      setSending(false)
    }
  }

  return (
    <AuthShell
      title="Iniciar sesión"
      subtitle="Entra para ver tus diseños, clientes y proyectos."
      footer={
        <>
          ¿Aún no tienes cuenta? <Link to="/registro">Crea una gratis</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit}>
        {error && <p className="status error">{error}</p>}
        <Field label="Email">
          <input type="email" required autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Contraseña">
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button type="submit" className="button primary" disabled={sending}>
          {sending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </AuthShell>
  )
}

const EMPTY: RegisterInput = { accountType: 'particular', name: '', companyName: '', taxId: '', phone: '', email: '', password: '' }

/** /registro — crear una cuenta de particular o de empresa. */
export function RegisterPage() {
  const { register } = useAuth()
  const [form, setForm] = useState<RegisterInput>(EMPTY)
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const isCompany = form.accountType === 'empresa'
  const set = <K extends keyof RegisterInput>(k: K, v: RegisterInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (form.password !== repeat) {
      setError('Las contraseñas no coinciden')
      return
    }
    setSending(true)
    setError(null)
    try {
      await register(form)
    } catch (err) {
      setError((err as Error).message)
      setSending(false)
    }
  }

  return (
    <AuthShell
      title="Crear cuenta"
      subtitle="Tu espacio privado para diseñar prendas y gestionar tus proyectos."
      footer={
        <>
          ¿Ya tienes cuenta? <Link to="/entrar">Inicia sesión</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit}>
        {error && <p className="status error">{error}</p>}
        <AccountTypePicker value={form.accountType} onChange={(t) => set('accountType', t)} />
        {isCompany && (
          <>
            <Field label="Nombre de la empresa *">
              <input required autoComplete="organization" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
            </Field>
            <Field label="CIF / NIF">
              <input value={form.taxId} onChange={(e) => set('taxId', e.target.value)} />
            </Field>
          </>
        )}
        <Field label={isCompany ? 'Persona de contacto *' : 'Nombre *'}>
          <input required autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        {isCompany && (
          <Field label="Teléfono">
            <input type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        )}
        <Field label="Email *">
          <input type="email" required autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label={`Contraseña * (mínimo ${MIN_PASSWORD} caracteres)`}>
          <input
            type="password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
          />
        </Field>
        <Field label="Repite la contraseña *">
          <input type="password" required autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </Field>
        <button type="submit" className="button primary" disabled={sending}>
          {sending ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
    </AuthShell>
  )
}

/** Selector Particular / Empresa. */
export function AccountTypePicker({ value, onChange }: { value: AccountType; onChange: (t: AccountType) => void }) {
  return (
    <div className="account-type" role="radiogroup" aria-label="Tipo de cuenta">
      {ACCOUNT_TYPES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={value === t.id}
          className={value === t.id ? 'active' : ''}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
