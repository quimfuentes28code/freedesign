/**
 * API de FreeDesign (Cloudflare Worker). Atiende /api/*; el resto de rutas las sirve la web estática.
 * Los datos se guardan en la base de datos D1 (binding DB) y los archivos en Workers KV (binding FILES).
 * Cada cuenta solo ve y modifica sus propios datos: todas las rutas menos /api/auth exigen sesión.
 */
import { artworksRoute } from './artworks'
import { authRoute, currentUser } from './auth'
import { clientsRoute } from './clients'
import { designsRoute } from './designs'
import { filesRoute } from './files'
import { HttpError, json, type Env } from './http'
import { materialsRoute, suppliersRoute } from './library'
import { economySummary, expensesRoute } from './economy'
import { productionRoute, techPacksRoute } from './production'
import { collectionsRoute, openTasks, projectsRoute } from './projects'
import { ACTIVE_STATUSES } from '../src/shared/projects'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

    try {
      checkOrigin(request, url)
      return await route(request, env, url)
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status)
      console.error(err)
      return json({ error: 'Error inesperado en el servidor' }, 500)
    }
  },
} satisfies ExportedHandler<Env>

/**
 * Las peticiones que cambian datos solo se aceptan desde la propia web (además de la cookie SameSite),
 * para que otra página no pueda hacerlas en nombre de quien tiene la sesión iniciada.
 */
function checkOrigin(request: Request, url: URL) {
  if (request.method === 'GET' || request.method === 'HEAD') return
  const origin = request.headers.get('Origin')
  if (origin && new URL(origin).host !== url.host) throw new HttpError(403, 'Origen no permitido')
}

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const [, resource, id, ...rest] = url.pathname.split('/').filter(Boolean) // ['api', recurso, id?, …]
  if (resource === 'auth') return authRoute(request, env, id, url)

  const user = await currentUser(request, env)
  if (!user) throw new HttpError(401, 'Inicia sesión para continuar')
  const uid = user.id

  switch (resource) {
    case 'clients':
      return clientsRoute(request, env, uid, id, url)
    case 'materials':
      return materialsRoute(request, env, uid, id, url)
    case 'suppliers':
      return suppliersRoute(request, env, uid, id)
    case 'artworks':
      return artworksRoute(request, env, uid, id)
    case 'designs':
      return designsRoute(request, env, uid, id, url)
    case 'projects':
      return projectsRoute(request, env, uid, id ? [id, ...rest] : [], url)
    case 'collections':
      return collectionsRoute(request, env, uid, id)
    case 'techpacks':
      return techPacksRoute(request, env, uid, id)
    case 'production':
      return productionRoute(request, env, uid, id, url)
    case 'expenses':
      return expensesRoute(request, env, uid, id, url)
    case 'economy':
      if (request.method !== 'GET') break
      return json(await economySummary(env, uid, url))
    case 'tasks':
      if (request.method !== 'GET') break
      return json(await openTasks(env, uid))
    case 'files':
      return filesRoute(request, env, uid, id)
    case 'stats':
      if (request.method !== 'GET') break
      return json(await stats(env, uid))
  }
  throw new HttpError(404, 'No encontrado')
}

async function stats(env: Env, uid: string) {
  const active = ACTIVE_STATUSES.map((s) => `'${s}'`).join(', ')
  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM clients WHERE user_id = ?1) AS clients,
            (SELECT COUNT(*) FROM materials WHERE user_id = ?1) AS materials,
            (SELECT COUNT(*) FROM suppliers WHERE user_id = ?1) AS suppliers,
            (SELECT COUNT(*) FROM designs WHERE user_id = ?1) AS designs,
            (SELECT COUNT(*) FROM projects WHERE user_id = ?1 AND status IN (${active})) AS activeProjects,
            (SELECT COUNT(*) FROM projects WHERE user_id = ?1 AND status = 'produccion') AS inProduction,
            (SELECT COUNT(*) FROM project_tasks t JOIN projects p ON p.id = t.project_id
              WHERE p.user_id = ?1 AND t.done = 0 AND p.status NOT IN ('entregado', 'cancelado')) AS openTasks`,
  )
    .bind(uid)
    .first<Stats>()
  return row ?? { clients: 0, materials: 0, suppliers: 0, designs: 0, activeProjects: 0, inProduction: 0, openTasks: 0 }
}

interface Stats {
  clients: number
  materials: number
  suppliers: number
  designs: number
  activeProjects: number
  inProduction: number
  openTasks: number
}
