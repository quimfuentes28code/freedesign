import { useState } from 'react'
import { Link, NavLink, useSearchParams } from 'react-router'
import { api, useApi } from '../../api/client'
import { PageHeader, Status } from '../../components/ui'
import { EXPENSE_CATEGORIES, pendingOf, type EconomyMonth, type ProjectEconomy } from '../../shared/economy'
import type { ProjectStatus } from '../../shared/projects'
import { euro, margin, StatusBadge } from '../projects/common'
import './economy.css'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/** Pestañas del apartado Economía. */
export function EconomyTabs() {
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'tab active' : 'tab')
  return (
    <nav className="tabs" aria-label="Economía">
      <NavLink to="/economia" end className={cls}>
        Resumen
      </NavLink>
      <NavLink to="/economia/gastos" className={cls}>
        Gastos generales
      </NavLink>
    </nav>
  )
}

export const useYear = () => {
  const [params, setParams] = useSearchParams()
  const year = Number(params.get('año')) || new Date().getFullYear()
  return [year, (y: number) => setParams({ año: String(y) }, { replace: true })] as const
}

/** Economía: lo cobrado, lo gastado y lo que queda por cobrar, y la rentabilidad de cada proyecto. */
export function EconomyPage() {
  const [year, setYear] = useYear()
  const summary = useApi(() => api.economy(year), [year])
  const s = summary.data

  const totals = (s?.months ?? []).reduce(
    (a, m) => ({ income: a.income + m.income, projectCosts: a.projectCosts + m.projectCosts, overhead: a.overhead + m.overhead }),
    { income: 0, projectCosts: 0, overhead: 0 },
  )
  const profit = totals.income - totals.projectCosts - totals.overhead
  const projects = (s?.projects ?? []).filter((p) => p.status !== 'cancelado')
  const pending = projects.reduce((n, p) => n + pendingOf(p), 0)

  return (
    <div className="page">
      <PageHeader
        title="Economía"
        subtitle="Cobros, costes y rentabilidad del taller"
        actions={
          <select className="year-select" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Año">
            {(s?.years ?? [year]).map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        }
      />
      <EconomyTabs />
      <Status loading={summary.loading && !s} error={summary.error} />

      {s && (
        <>
          <div className="stats">
            <Stat label={`Cobrado en ${year}`} value={euro(totals.income)} />
            <Stat label="Costes de proyectos" value={euro(totals.projectCosts)} />
            <Stat label="Gastos generales" value={euro(totals.overhead)} to={`/economia/gastos?año=${year}`} />
            <Stat
              label={totals.income ? `Beneficio · margen ${((profit / totals.income) * 100).toFixed(0)} %` : 'Beneficio'}
              value={euro(profit)}
              negative={profit < 0}
            />
            <Stat label="Pendiente de cobro (total)" value={euro(pending)} />
          </div>

          <section className="card economy-chart-card">
            <div className="card-title">
              <h2>Mes a mes · {year}</h2>
            </div>
            <MonthlyChart months={s.months} />
          </section>

          <div className="dashboard-grid economy-grid">
            <section className="card">
              <h2>Gastos generales por categoría</h2>
              {s.overheadByCategory.length === 0 ? (
                <p className="muted small">
                  Sin gastos generales en {year}. <Link to={`/economia/gastos?año=${year}`}>Apuntar uno</Link>.
                </p>
              ) : (
                <div className="phase-bars">
                  {s.overheadByCategory.map((c) => (
                    <div key={c.category} className="phase-bar category-bar">
                      <span>{EXPENSE_CATEGORIES.find((x) => x.id === c.category)?.label}</span>
                      <div>
                        <i style={{ width: `${(c.amount / s.overheadByCategory[0].amount) * 100}%` }} />
                      </div>
                      <strong>{euro(c.amount)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <Groups projects={projects} />
          </div>

          <ProjectsTable projects={projects} />
        </>
      )}
    </div>
  )
}

function Stat({ label, value, to, negative }: { label: string; value: string; to?: string; negative?: boolean }) {
  const body = (
    <>
      <span className={negative ? 'stat-value negative-text' : 'stat-value'}>{value}</span>
      <span className="stat-label">{label}</span>
    </>
  )
  return to ? (
    <Link to={to} className="card stat economy-stat">
      {body}
    </Link>
  ) : (
    <div className="card stat economy-stat">{body}</div>
  )
}

const SERIES = [
  { key: 'income', label: 'Cobrado', cls: 's-income' },
  { key: 'projectCosts', label: 'Costes de proyectos', cls: 's-costs' },
  { key: 'overhead', label: 'Gastos generales', cls: 's-overhead' },
] as const

/** Barras por mes: lo cobrado al lado de lo gastado (costes de proyectos + gastos generales, apilados). */
function MonthlyChart({ months }: { months: EconomyMonth[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const W = 760
  const H = 240
  const left = 64
  const bottom = 26
  const top = 8
  const plotW = W - left - 8
  const plotH = H - top - bottom
  const max = niceMax(Math.max(1, ...months.map((m) => Math.max(m.income, m.projectCosts + m.overhead))))
  const y = (v: number) => top + plotH - (v / max) * plotH
  const gw = plotW / 12
  const bw = Math.min(20, gw * 0.32)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const empty = months.every((m) => !m.income && !m.projectCosts && !m.overhead)

  return (
    <div className="monthly-chart">
      <div className="chart-head">
        <ul className="legend">
          {SERIES.map((s) => (
            <li key={s.key}>
              <span className={`swatch ${s.cls}`} />
              {s.label}
            </li>
          ))}
        </ul>
        <button className="link-button" onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>
      {asTable ? (
        <MonthlyTable months={months} />
      ) : (
        <div className="chart-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cobrado y gastado cada mes" onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={left} x2={W - 8} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
                <text x={left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                  {shortEuro(t)}
                </text>
              </g>
            ))}
            {months.map((m, i) => {
              const cx = left + gw * i + gw / 2
              const spent = m.projectCosts + m.overhead
              return (
                <g key={m.month} className={hover !== null && hover !== i ? 'dim' : ''}>
                  {m.income > 0 && <Bar x={cx - bw - 1} w={bw} y0={y(0)} y1={y(m.income)} round cls="s-income" />}
                  {m.projectCosts > 0 && <Bar x={cx + 1} w={bw} y0={y(0)} y1={y(m.projectCosts)} round={!m.overhead} cls="s-costs" />}
                  {m.overhead > 0 && <Bar x={cx + 1} w={bw} y0={y(m.projectCosts) - (m.projectCosts ? 2 : 0)} y1={y(spent) - (m.projectCosts ? 2 : 0)} round cls="s-overhead" />}
                  <text x={cx} y={H - 8} className="tick" textAnchor="middle">
                    {MONTHS[i]}
                  </text>
                  {/* Zona de hover: toda la columna del mes */}
                  <rect x={left + gw * i} y={top} width={gw} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              )
            })}
          </svg>
          {hover !== null && (
            <div
              className="chart-tip"
              style={{
                left: `${((left + gw * hover + gw / 2) / W) * 100}%`,
                // En los primeros y últimos meses el cuadro se abre hacia dentro para no salirse
                transform: hover < 2 ? 'translateX(-20%)' : hover > 9 ? 'translateX(-85%)' : undefined,
              }}
            >
              <strong>{MONTH_NAMES[hover]}</strong>
              {SERIES.map((s) => (
                <span key={s.key}>
                  <i className={`swatch ${s.cls}`} />
                  {s.label}
                  <b>{euro(months[hover][s.key])}</b>
                </span>
              ))}
              <span className="tip-total">
                Resultado
                <b>{euro(months[hover].income - months[hover].projectCosts - months[hover].overhead)}</b>
              </span>
            </div>
          )}
          {empty && <p className="chart-empty muted small">Aún no hay cobros ni gastos este año.</p>}
        </div>
      )}
    </div>
  )
}

/** Barra vertical con las esquinas de arriba redondeadas (4 px) si es el último tramo. */
function Bar({ x, w, y0, y1, round, cls }: { x: number; w: number; y0: number; y1: number; round: boolean; cls: string }) {
  const h = Math.max(1, y0 - y1)
  const r = round ? Math.min(4, w / 2, h) : 0
  const top = y0 - h
  const d = `M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${y0} Z`
  return <path d={d} className={`bar ${cls}`} />
}

function MonthlyTable({ months }: { months: EconomyMonth[] }) {
  return (
    <table className="table compact">
      <thead>
        <tr>
          <th>Mes</th>
          <th className="num">Cobrado</th>
          <th className="num">Costes de proyectos</th>
          <th className="num">Gastos generales</th>
          <th className="num">Resultado</th>
        </tr>
      </thead>
      <tbody>
        {months.map((m) => {
          const r = m.income - m.projectCosts - m.overhead
          return (
            <tr key={m.month}>
              <td>{MONTH_NAMES[m.month - 1]}</td>
              <td className="num">{euro(m.income)}</td>
              <td className="num">{euro(m.projectCosts)}</td>
              <td className="num">{euro(m.overhead)}</td>
              <td className={r < 0 ? 'num negative-text' : 'num'}>{euro(r)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Totales por cliente o por colección (todos los proyectos, sin filtrar por año). */
function Groups({ projects }: { projects: ProjectEconomy[] }) {
  const [by, setBy] = useState<'cliente' | 'coleccion'>('cliente')
  const groups = new Map<string, { id: string | null; name: string; n: number; sales: number; cost: number; paid: number }>()
  for (const p of projects) {
    const id = by === 'cliente' ? p.clientId : p.collectionId
    const name = (by === 'cliente' ? p.clientName : p.collectionName) ?? (by === 'cliente' ? 'Sin cliente' : 'Sin colección')
    const g = groups.get(id ?? '') ?? { id, name, n: 0, sales: 0, cost: 0, paid: 0 }
    g.n++
    g.sales += p.price ?? 0
    g.cost += p.cost
    g.paid += p.paid
    groups.set(id ?? '', g)
  }
  const rows = [...groups.values()].sort((a, b) => b.sales - a.sales)
  return (
    <section className="card">
      <div className="card-title">
        <h2>Rentabilidad por {by === 'cliente' ? 'cliente' : 'colección'}</h2>
        <div className="segmented">
          <button className={by === 'cliente' ? 'active' : ''} onClick={() => setBy('cliente')}>
            Clientes
          </button>
          <button className={by === 'coleccion' ? 'active' : ''} onClick={() => setBy('coleccion')}>
            Colecciones
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted small">Aún no hay proyectos.</p>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th>{by === 'cliente' ? 'Cliente' : 'Colección'}</th>
              <th className="num">Ventas</th>
              <th className="num">Beneficio</th>
              <th className="num">Margen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => {
              const m = margin(g.cost, g.sales)
              const link = g.id ? (by === 'cliente' ? `/proyectos?cliente=${g.id}` : `/proyectos?coleccion=${g.id}`) : null
              return (
                <tr key={g.id ?? 'none'}>
                  <td>
                    {link ? <Link to={link}>{g.name}</Link> : <span className="muted">{g.name}</span>}
                    <span className="muted small"> · {g.n} {g.n === 1 ? 'proyecto' : 'proyectos'}</span>
                  </td>
                  <td className="num">{euro(g.sales)}</td>
                  <td className={g.sales - g.cost < 0 ? 'num negative-text' : 'num'}>{euro(g.sales - g.cost)}</td>
                  <td className="num">{m === null ? '—' : `${m.toFixed(0)} %`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

function ProjectsTable({ projects }: { projects: ProjectEconomy[] }) {
  const rows = [...projects].sort((a, b) => pendingOf(b) - pendingOf(a))
  const sum = (f: (p: ProjectEconomy) => number) => rows.reduce((n, p) => n + f(p), 0)
  const sales = sum((p) => p.price ?? 0)
  const cost = sum((p) => p.cost)
  const totalMargin = margin(cost, sales)
  return (
    <section className="card table-card economy-projects">
      <div className="card-title padded">
        <h2>Rentabilidad por proyecto</h2>
        <span className="muted small">Todos los proyectos menos los cancelados · los que tienen cobros pendientes, primero</span>
      </div>
      {rows.length === 0 ? (
        <p className="muted small padded">
          Aún no hay proyectos. <Link to="/proyectos/nuevo">Crea el primero</Link>.
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Proyecto</th>
              <th>Fase</th>
              <th className="num">Precio</th>
              <th className="num">Coste</th>
              <th className="num">Margen</th>
              <th className="num">Cobrado</th>
              <th className="num">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const m = margin(p.cost, p.price)
              const pend = pendingOf(p)
              return (
                <tr key={p.id}>
                  <td>
                    <Link to={`/proyectos/${p.id}`}>{p.name}</Link>
                    {p.clientName && <span className="muted small"> · {p.clientName}</span>}
                  </td>
                  <td>
                    <StatusBadge status={p.status as ProjectStatus} />
                  </td>
                  <td className="num">{euro(p.price)}</td>
                  <td className="num">{euro(p.cost)}</td>
                  <td className={m !== null && m < 0 ? 'num negative-text' : 'num'}>{m === null ? '—' : `${m.toFixed(0)} %`}</td>
                  <td className="num">{euro(p.paid)}</td>
                  <td className="num">{pend ? <strong>{euro(pend)}</strong> : <span className="muted">—</span>}</td>
                </tr>
              )
            })}
            <tr className="totals-row">
              <td colSpan={2}>Total</td>
              <td className="num">{euro(sales)}</td>
              <td className="num">{euro(cost)}</td>
              <td className="num">{totalMargin === null ? '—' : `${totalMargin.toFixed(0)} %`}</td>
              <td className="num">{euro(sum((p) => p.paid))}</td>
              <td className="num">{euro(sum(pendingOf))}</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  )
}

function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(v))
  for (const k of [1, 2, 2.5, 5, 10]) if (v <= k * p) return k * p
  return 10 * p
}

const shortEuro = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`
