import { useState, type FormEvent } from 'react'
import { api, useApi } from '../../api/client'
import { Field, PageHeader, Status } from '../../components/ui'
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory, type ExpenseInput } from '../../shared/economy'
import { euro } from '../projects/common'
import { EconomyTabs, useYear } from './EconomyPage'
import './economy.css'

const today = () => new Date().toISOString().slice(0, 10)
const empty = (): ExpenseInput => ({ date: today(), category: 'taller', concept: '', amount: 0, supplierId: null, notes: '' })

/** Gastos generales: los que no son de un proyecto concreto (alquiler, máquinas, software…). */
export function ExpensesPage() {
  const [year, setYear] = useYear()
  const expenses = useApi(() => api.listExpenses(String(year)), [year])
  const suppliers = useApi(() => api.listSuppliers(), [])
  const [category, setCategory] = useState<ExpenseCategory | ''>('')
  const [editing, setEditing] = useState<Expense | null>(null)
  const [error, setError] = useState<string | null>(null)

  const thisYear = new Date().getFullYear()
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i)
  const list = (expenses.data ?? []).filter((e) => !category || e.category === category)
  const total = list.reduce((n, e) => n + e.amount, 0)

  const remove = async (e: Expense) => {
    if (!confirm(`¿Eliminar el gasto «${e.concept}»?`)) return
    try {
      await api.deleteExpense(e.id)
      expenses.reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Economía"
        subtitle="Gastos generales del taller"
        actions={
          <select className="year-select" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Año">
            {(years.includes(year) ? years : [year, ...years]).map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        }
      />
      <EconomyTabs />
      {error && <p className="status error">{error}</p>}

      <ExpenseForm
        key={editing?.id ?? 'new'}
        expense={editing}
        suppliers={suppliers.data ?? []}
        onSaved={(e) => {
          setEditing(null)
          if (e.date.startsWith(String(year))) expenses.reload()
          else setYear(Number(e.date.slice(0, 4)))
        }}
        onCancel={() => setEditing(null)}
      />

      <div className="project-toolbar">
        <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory | '')} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <Status loading={expenses.loading && !expenses.data} error={expenses.error} />
      {expenses.data &&
        (list.length === 0 ? (
          <p className="muted small">Ningún gasto en {year}{category ? ' con esta categoría' : ''}.</p>
        ) : (
          <div className="card table-card">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Categoría</th>
                  <th>Proveedor</th>
                  <th className="num">Importe</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} className={editing?.id === e.id ? 'editing-row' : ''}>
                    <td>{new Date(`${e.date}T00:00:00`).toLocaleDateString('es-ES')}</td>
                    <td>
                      {e.concept}
                      {e.notes && <span className="muted small"> · {e.notes}</span>}
                    </td>
                    <td>{EXPENSE_CATEGORIES.find((c) => c.id === e.category)?.label}</td>
                    <td>{e.supplierName ?? <span className="muted">—</span>}</td>
                    <td className="num">{euro(e.amount)}</td>
                    <td className="num">
                      <button className="link-button inline" onClick={() => setEditing(e)}>
                        Editar
                      </button>
                      <button className="icon-button" title="Eliminar" onClick={() => remove(e)}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="expense-total">
              <span>Total {category ? EXPENSE_CATEGORIES.find((c) => c.id === category)?.label.toLowerCase() : year}</span>
              <span>{euro(total)}</span>
            </div>
          </div>
        ))}
    </div>
  )
}

function ExpenseForm(props: {
  expense: Expense | null
  suppliers: { id: string; name: string }[]
  onSaved: (e: Expense) => void
  onCancel: () => void
}) {
  const { expense, suppliers, onSaved, onCancel } = props
  const [form, setForm] = useState<ExpenseInput>(() =>
    expense
      ? { date: expense.date, category: expense.category, concept: expense.concept, amount: expense.amount, supplierId: expense.supplierId, notes: expense.notes }
      : empty(),
  )
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof ExpenseInput>(k: K, v: ExpenseInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const input = { ...form, amount: Number(amount.replace(',', '.')) }
      const saved = expense ? await api.updateExpense(expense.id, input) : await api.createExpense(input)
      onSaved(saved)
      if (!expense) {
        setForm({ ...empty(), date: form.date, category: form.category })
        setAmount('')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card expense-form" onSubmit={submit}>
      <h2>{expense ? 'Editar gasto' : 'Apuntar un gasto'}</h2>
      {error && <p className="status error">{error}</p>}
      <div className="fields">
        <Field label="Concepto *" wide>
          <input required value={form.concept} onChange={(e) => set('concept', e.target.value)} placeholder="Alquiler del taller, agujas, Adobe…" />
        </Field>
        <Field label="Importe (€) *">
          <input required type="number" min={0.01} step={0.01} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Fecha *">
          <input required type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Categoría">
          <select value={form.category} onChange={(e) => set('category', e.target.value as ExpenseCategory)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Proveedor">
          <select value={form.supplierId ?? ''} onChange={(e) => set('supplierId', e.target.value || null)}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notas" wide>
          <input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
      <div className="form-actions">
        {expense && (
          <button type="button" className="button" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="submit" className="button primary" disabled={saving}>
          {saving ? 'Guardando…' : expense ? 'Guardar cambios' : 'Añadir gasto'}
        </button>
      </div>
    </form>
  )
}
