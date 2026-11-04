import {
  EXPENSE_CATEGORIES,
  type EconomyMonth,
  type EconomySummary,
  type Expense,
  type ExpenseCategory,
  type ExpenseInput,
  type ProjectEconomy,
} from '../src/shared/economy'
import { HttpError, json, noContent, now, num, ownedRef, readBody, required, text, type Env } from './http'

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
const round = (n: number) => Math.round(n * 100) / 100

// --- Gastos generales: /api/expenses[/:id] ---

export async function expensesRoute(request: Request, env: Env, uid: string, id: string | undefined, url: URL) {
  const m = request.method
  if (!id && m === 'GET') {
    const year = url.searchParams.get('year') ?? ''
    const { results } = await env.DB.prepare(`${SELECT} WHERE e.user_id = ? AND (?2 = '' OR substr(e.date, 1, 4) = ?2) ORDER BY e.date DESC, e.created_at DESC`)
      .bind(uid, year)
      .all<ExpenseRow>()
    return json(results.map(toExpense))
  }
  if (!id && m === 'POST') {
    const e = await readExpense(request, env, uid)
    const newId = crypto.randomUUID()
    const t = now()
    await env.DB.prepare(
      'INSERT INTO expenses (id, user_id, date, category, concept, amount, supplier_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(newId, uid, e.date, e.category, e.concept, e.amount, e.supplierId, e.notes, t, t)
      .run()
    return json(await getExpense(env, uid, newId), 201)
  }
  if (id && m === 'PUT') {
    const e = await readExpense(request, env, uid)
    const { meta } = await env.DB.prepare(
      'UPDATE expenses SET date = ?, category = ?, concept = ?, amount = ?, supplier_id = ?, notes = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    )
      .bind(e.date, e.category, e.concept, e.amount, e.supplierId, e.notes, now(), id, uid)
      .run()
    if (meta.changes === 0) throw new HttpError(404, 'Gasto no encontrado')
    return json(await getExpense(env, uid, id))
  }
  if (id && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').bind(id, uid).run()
    return noContent()
  }
  throw new HttpError(405, 'Método no permitido')
}

interface ExpenseRow {
  id: string
  date: string
  category: ExpenseCategory
  concept: string
  amount: number
  supplier_id: string | null
  supplier_name: string | null
  notes: string
  created_at: string
  updated_at: string
}

const SELECT = 'SELECT e.*, s.name AS supplier_name FROM expenses e LEFT JOIN suppliers s ON s.id = e.supplier_id'

const toExpense = (r: ExpenseRow): Expense => ({
  id: r.id,
  date: r.date,
  category: r.category,
  concept: r.concept,
  amount: r.amount,
  supplierId: r.supplier_id,
  supplierName: r.supplier_name ?? undefined,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

async function getExpense(env: Env, uid: string, id: string) {
  const r = await env.DB.prepare(`${SELECT} WHERE e.id = ? AND e.user_id = ?`).bind(id, uid).first<ExpenseRow>()
  if (!r) throw new HttpError(404, 'Gasto no encontrado')
  return toExpense(r)
}

async function readExpense(request: Request, env: Env, uid: string): Promise<ExpenseInput> {
  const b = await readBody(request)
  const date = text(b.date)
  if (!isDate(date)) throw new HttpError(400, 'La fecha no es válida')
  const amount = num(b.amount)
  if (!amount) throw new HttpError(400, 'El importe es obligatorio')
  return {
    date,
    category: EXPENSE_CATEGORIES.some((c) => c.id === b.category) ? (b.category as ExpenseCategory) : 'otro',
    concept: required(b.concept, 'El concepto'),
    amount: round(amount),
    supplierId: await ownedRef(env, 'suppliers', text(b.supplierId) || null, uid, 'El proveedor'),
    notes: text(b.notes),
  }
}

// --- Resumen económico de un año: /api/economy?year=AAAA ---

/**
 * Ingresos = cobros con fecha en el año. Costes de proyectos = materiales y otros costes añadidos ese año
 * (por la fecha en que se apuntaron). Gastos generales = gastos con fecha en el año.
 */
export async function economySummary(env: Env, uid: string, url: URL): Promise<EconomySummary> {
  const current = new Date().getFullYear()
  const y = Number(url.searchParams.get('year')) || current
  const year = String(y)
  const byMonth = (col: string) => `CAST(substr(${col}, 6, 2) AS INTEGER)`

  const [income, materials, costs, overhead, categories, years, projects] = await env.DB.batch([
    env.DB.prepare(
      `SELECT ${byMonth('pp.date')} AS m, SUM(pp.amount) AS total FROM project_payments pp JOIN projects p ON p.id = pp.project_id
       WHERE p.user_id = ?1 AND substr(pp.date, 1, 4) = ?2 GROUP BY m`,
    ).bind(uid, year),
    env.DB.prepare(
      `SELECT ${byMonth('pm.created_at')} AS m, SUM(pm.quantity * COALESCE(mt.price, 0)) AS total FROM project_materials pm
       JOIN projects p ON p.id = pm.project_id JOIN materials mt ON mt.id = pm.material_id
       WHERE p.user_id = ?1 AND substr(pm.created_at, 1, 4) = ?2 GROUP BY m`,
    ).bind(uid, year),
    env.DB.prepare(
      `SELECT ${byMonth('pc.created_at')} AS m, SUM(pc.amount) AS total FROM project_costs pc JOIN projects p ON p.id = pc.project_id
       WHERE p.user_id = ?1 AND substr(pc.created_at, 1, 4) = ?2 GROUP BY m`,
    ).bind(uid, year),
    env.DB.prepare(`SELECT ${byMonth('date')} AS m, SUM(amount) AS total FROM expenses WHERE user_id = ?1 AND substr(date, 1, 4) = ?2 GROUP BY m`).bind(
      uid,
      year,
    ),
    env.DB.prepare(
      'SELECT category, SUM(amount) AS total FROM expenses WHERE user_id = ?1 AND substr(date, 1, 4) = ?2 GROUP BY category ORDER BY total DESC',
    ).bind(uid, year),
    env.DB.prepare(
      `SELECT DISTINCT y FROM (
         SELECT substr(pp.date, 1, 4) AS y FROM project_payments pp JOIN projects p ON p.id = pp.project_id WHERE p.user_id = ?1
         UNION SELECT substr(date, 1, 4) FROM expenses WHERE user_id = ?1
         UNION SELECT substr(created_at, 1, 4) FROM projects WHERE user_id = ?1
       ) ORDER BY y DESC`,
    ).bind(uid),
    env.DB.prepare(
      `SELECT p.id, p.name, p.status, p.client_id, c.name AS client_name, p.collection_id, col.name AS collection_name, p.price, p.due_date,
         (SELECT COALESCE(SUM(pm.quantity * COALESCE(mt.price, 0)), 0) FROM project_materials pm JOIN materials mt ON mt.id = pm.material_id WHERE pm.project_id = p.id)
           + (SELECT COALESCE(SUM(amount), 0) FROM project_costs WHERE project_id = p.id) AS cost,
         (SELECT COALESCE(SUM(amount), 0) FROM project_payments WHERE project_id = p.id) AS paid
       FROM projects p LEFT JOIN clients c ON c.id = p.client_id LEFT JOIN collections col ON col.id = p.collection_id
       WHERE p.user_id = ?1 ORDER BY p.updated_at DESC`,
    ).bind(uid),
  ])

  type M = { m: number; total: number }
  const sum = (res: D1Result, month: number) => round((res.results as M[]).find((r) => r.m === month)?.total ?? 0)
  const months: EconomyMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    income: sum(income, i + 1),
    projectCosts: round(sum(materials, i + 1) + sum(costs, i + 1)),
    overhead: sum(overhead, i + 1),
  }))
  const yearList = new Set((years.results as { y: string }[]).map((r) => Number(r.y)).filter(Boolean))
  yearList.add(current)
  yearList.add(y)

  type P = {
    id: string
    name: string
    status: string
    client_id: string | null
    client_name: string | null
    collection_id: string | null
    collection_name: string | null
    price: number | null
    due_date: string
    cost: number
    paid: number
  }
  return {
    year: y,
    years: [...yearList].sort((a, b) => b - a),
    months,
    overheadByCategory: (categories.results as { category: ExpenseCategory; total: number }[]).map((r) => ({ category: r.category, amount: round(r.total) })),
    projects: (projects.results as P[]).map(
      (r): ProjectEconomy => ({
        id: r.id,
        name: r.name,
        status: r.status,
        clientId: r.client_id,
        clientName: r.client_name,
        collectionId: r.collection_id,
        collectionName: r.collection_name,
        price: r.price,
        cost: round(r.cost),
        paid: round(r.paid),
        dueDate: r.due_date,
      }),
    ),
  }
}
