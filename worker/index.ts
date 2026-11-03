/**
 * API de FreeDesign (Cloudflare Worker). Atiende /api/*; el resto de rutas las sirve la web estática.
 * Los datos se guardan en la base de datos D1 (binding DB) y los archivos en R2 (binding FILES).
 */
import { artworksRoute } from './artworks'
import { clientsRoute } from './clients'
import { designsRoute } from './designs'
import { filesRoute } from './files'
import { HttpError, json, type Env } from './http'
import { materialsRoute, suppliersRoute } from './library'
import { collectionsRoute, openTasks, projectsRoute } from './projects'
import { ACTIVE_STATUSES } from '../src/shared/projects'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

    const denied = checkAccess(request, env)
    if (denied) return denied

    try {
      return await route(request, env, url)
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status)
      console.error(err)
      return json({ error: 'Error inesperado en el servidor' }, 500)
    }
  },
} satisfies ExportedHandler<Env>

/**
 * En producción la app va detrás de Cloudflare Access, que añade el correo de quien ha iniciado sesión.
 * Aquí comprobamos que es uno de los permitidos (defensa extra por si alguien llega al Worker directamente).
 */
function checkAccess(request: Request, env: Env) {
  const allowed = env.ALLOWED_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (allowed.length === 0) return null
  const email = request.headers.get('Cf-Access-Authenticated-User-Email')?.toLowerCase()
  return email && allowed.includes(email) ? null : json({ error: 'Sin acceso' }, 403)
}

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const [, resource, id, ...rest] = url.pathname.split('/').filter(Boolean) // ['api', recurso, id?, …]
  switch (resource) {
    case 'clients':
      return clientsRoute(request, env, id, url)
    case 'materials':
      return materialsRoute(request, env, id, url)
    case 'suppliers':
      return suppliersRoute(request, env, id)
    case 'artworks':
      return artworksRoute(request, env, id)
    case 'designs':
      return designsRoute(request, env, id, url)
    case 'projects':
      return projectsRoute(request, env, id ? [id, ...rest] : [], url)
    case 'collections':
      return collectionsRoute(request, env, id)
    case 'tasks':
      if (request.method !== 'GET') break
      return json(await openTasks(env))
    case 'files':
      return filesRoute(request, env, id)
    case 'stats':
      if (request.method !== 'GET') break
      return json(await stats(env))
  }
  throw new HttpError(404, 'No encontrado')
}

async function stats(env: Env) {
  const active = ACTIVE_STATUSES.map((s) => `'${s}'`).join(', ')
  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM clients) AS clients,
            (SELECT COUNT(*) FROM materials) AS materials,
            (SELECT COUNT(*) FROM suppliers) AS suppliers,
            (SELECT COUNT(*) FROM designs) AS designs,
            (SELECT COUNT(*) FROM projects WHERE status IN (${active})) AS activeProjects,
            (SELECT COUNT(*) FROM projects WHERE status = 'produccion') AS inProduction,
            (SELECT COUNT(*) FROM project_tasks t JOIN projects p ON p.id = t.project_id
              WHERE t.done = 0 AND p.status NOT IN ('entregado', 'cancelado')) AS openTasks`,
  ).first<Stats>()
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
