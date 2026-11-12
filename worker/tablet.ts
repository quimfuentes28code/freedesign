/**
 * «Móvil como tableta»: sala en tiempo real entre el lienzo del ordenador y el móvil que dibuja.
 *
 * - POST /api/tablet (con sesión) crea una sala con un token aleatorio largo y devuelve el token. El QR del lienzo lleva
 *   a /tableta/<token>: quien tiene el token es quien ha escaneado el QR, por eso el móvil no necesita iniciar sesión.
 * - GET /api/tablet/<token>/host (con sesión, solo la cuenta que la creó): WebSocket del ordenador.
 * - GET /api/tablet/<token>/pad (sin sesión, con el token): WebSocket del móvil. Solo durante PAIR_MS desde que se
 *   creó, o hasta SESSION_MS si ya se emparejó (para reconectar). Un móvil nuevo sustituye al anterior.
 * El Durable Object solo reenvía los mensajes de un lado al otro (no los lee ni los guarda) y usa la hibernación de
 * WebSockets: mientras nadie manda nada no consume.
 */
import { DurableObject } from 'cloudflare:workers'
import { PAIR_MS, SESSION_MS, type RoomMessage } from '../src/shared/tablet'
import { HttpError, json, type Env } from './http'

interface RoomInfo {
  uid: string
  created: number
  paired: boolean
}

type Role = 'host' | 'pad'

export class TabletRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const action = url.pathname.slice(1)

    if (action === 'init') {
      const { uid } = (await request.json()) as { uid: string }
      await this.ctx.storage.put<RoomInfo>('info', { uid, created: Date.now(), paired: false })
      return new Response('ok')
    }

    const info = await this.ctx.storage.get<RoomInfo>('info')
    const age = info ? Date.now() - info.created : Infinity
    if (!info || age > SESSION_MS) return new Response('Esta conexión ha caducado. Vuelve a escanear el QR.', { status: 410 })

    if (action === 'host') {
      if (request.headers.get('X-Uid') !== info.uid) return new Response('No es tu sesión', { status: 403 })
      return this.accept('host')
    }
    if (action === 'pad') {
      if (!info.paired && age > PAIR_MS) return new Response('El QR ha caducado. Genera uno nuevo en el lienzo.', { status: 410 })
      if (!info.paired) await this.ctx.storage.put<RoomInfo>('info', { ...info, paired: true })
      // Solo un móvil a la vez: el nuevo sustituye al anterior
      for (const old of this.ctx.getWebSockets('pad')) old.close(4000, 'Otro dispositivo se ha conectado')
      return this.accept('pad')
    }
    return new Response('No encontrado', { status: 404 })
  }

  private accept(role: Role) {
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1], [role])
    // Cada lado sabe si el otro está conectado
    const other = this.ctx.getWebSockets(peerOf(role))
    send(pair[1], { t: 'peer', on: other.length > 0 })
    for (const ws of other) send(ws, { t: 'peer', on: true })
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const role = this.ctx.getTags(ws)[0] as Role
    for (const peer of this.ctx.getWebSockets(peerOf(role))) {
      try {
        peer.send(message)
      } catch {
        // El otro lado se está cerrando
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    const role = this.ctx.getTags(ws)[0] as Role
    const still = this.ctx.getWebSockets(role).filter((w) => w !== ws)
    if (!still.length) for (const peer of this.ctx.getWebSockets(peerOf(role))) send(peer, { t: 'peer', on: false })
    try {
      ws.close(code === 1005 ? 1000 : code, 'Cerrado')
    } catch {
      // Ya cerrado
    }
  }
}

const peerOf = (role: Role): Role => (role === 'host' ? 'pad' : 'host')

function send(ws: WebSocket, msg: RoomMessage) {
  try {
    ws.send(JSON.stringify(msg))
  } catch {
    // Cerrado
  }
}

const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')
}

function room(env: Env, token: string) {
  if (!TOKEN_RE.test(token)) throw new HttpError(404, 'No encontrado')
  return env.TABLET.get(env.TABLET.idFromName(token))
}

/** Los WebSockets solo se abren desde la propia web. */
function checkSocket(request: Request, url: URL) {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') throw new HttpError(426, 'Hace falta un WebSocket')
  const origin = request.headers.get('Origin')
  if (origin && new URL(origin).host !== url.host) throw new HttpError(403, 'Origen no permitido')
}

/** Rutas con sesión: crear la sala y conectar el ordenador. */
export async function tabletRoute(request: Request, env: Env, uid: string, token: string | undefined, action: string | undefined, url: URL) {
  if (!token && request.method === 'POST') {
    const t = newToken()
    await room(env, t).fetch('https://room/init', { method: 'POST', body: JSON.stringify({ uid }) })
    return json({ token: t, pairMs: PAIR_MS }, 201)
  }
  if (token && action === 'host' && request.method === 'GET') {
    checkSocket(request, url)
    const headers = new Headers(request.headers)
    headers.set('X-Uid', uid)
    return room(env, token).fetch('https://room/host', { headers })
  }
  throw new HttpError(404, 'No encontrado')
}

/** Ruta sin sesión: conectar el móvil con el token del QR. */
export async function tabletPadRoute(request: Request, env: Env, token: string, url: URL) {
  checkSocket(request, url)
  const headers = new Headers(request.headers)
  headers.delete('X-Uid')
  return room(env, token).fetch('https://room/pad', { headers })
}
