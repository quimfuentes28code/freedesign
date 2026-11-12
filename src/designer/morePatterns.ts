/*
 * Más estampados para las superficies (y los pinceles y el bote del lienzo): cuadros, rayas, motivos, animal print,
 * camuflajes y efectos. Cada uno se pinta en el azulejo de `PX` × `PX` que se repite sin cortes (lo que se sale por un
 * borde se repite por el otro). El color de la pieza es el fondo; `c2` y `c3` los otros dos colores.
 */

type Ctx = CanvasRenderingContext2D

/** Generador pseudoaleatorio con semilla (cada estampado sale siempre igual). */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

/** Dibuja nueve veces (desplazado un azulejo en cada dirección) para que lo que cruza un borde encaje. */
function wrap(W: number, fn: (dx: number, dy: number) => void) {
  for (const dx of [-W, 0, W]) for (const dy of [-W, 0, W]) fn(dx, dy)
}

/** Mezcla dos colores #rrggbb (t = 0: a, 1: b). */
export function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t)
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`
}

function star(ctx: Ctx, cx: number, cy: number, r: number, rot = -Math.PI / 2) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.42 : r
    const a = rot + (i * Math.PI) / 5
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
}

function heart(ctx: Ctx, cx: number, cy: number, s: number) {
  ctx.beginPath()
  ctx.moveTo(cx, cy + s * 0.35)
  ctx.bezierCurveTo(cx - s * 0.9, cy - s * 0.25, cx - s * 0.45, cy - s * 0.9, cx, cy - s * 0.4)
  ctx.bezierCurveTo(cx + s * 0.45, cy - s * 0.9, cx + s * 0.9, cy - s * 0.25, cx, cy + s * 0.35)
  ctx.fill()
}

/** Mancha orgánica (manchas de vaca, leopardo, camuflaje). */
function blob(ctx: Ctx, cx: number, cy: number, r: number, rand: () => number, squash = 0.8) {
  const n = 10
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const rr = r * (0.6 + rand() * 0.6)
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * squash]
  })
  ctx.beginPath()
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n]
    const q = pts[(i + 1) % n]
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
    if (i === 0) ctx.moveTo(m[0], m[1])
    else ctx.quadraticCurveTo(p[0], p[1], m[0], m[1])
  }
  ctx.closePath()
  ctx.fill()
}

/** Franja con forma de pincelada que se afina en las puntas (cebra, tigre, tiger stripe). */
function taper(ctx: Ctx, pts: [number, number][], width: number) {
  const left: [number, number][] = []
  const right: [number, number][] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const l = Math.hypot(dx, dy) || 1
    const t = i / (pts.length - 1)
    const w = (width / 2) * Math.sin(Math.PI * t) ** 0.6
    left.push([pts[i][0] - (dy / l) * w, pts[i][1] + (dx / l) * w])
    right.push([pts[i][0] + (dy / l) * w, pts[i][1] - (dx / l) * w])
  }
  ctx.beginPath()
  ;[...left, ...right.reverse()].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.fill()
}

/** Ruido por celdas que se repite (camuflaje digital): valor de 0 a 1 en la celda (i, j) de una rejilla de n × n. */
function cellNoise(n: number, seed: number) {
  const rand = rng(seed)
  const base = Array.from({ length: n * n }, () => rand())
  const at = (i: number, j: number) => base[(((j % n) + n) % n) * n + (((i % n) + n) % n)]
  // Suavizado con las vecinas: manchas más grandes que una celda
  return (i: number, j: number) => {
    let s = 0
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += at(i + dx, j + dy) * (3 - Math.max(Math.abs(dx), Math.abs(dy)))
    return s / 35
  }
}

/** Pinta un estampado de los de aquí. Devuelve false si no es uno de ellos. */
export function drawMorePattern(ctx: Ctx, kind: string, W: number, base: string, c2: string, c3: string): boolean {
  ctx.fillStyle = c2
  ctx.strokeStyle = c2
  switch (kind) {
    // --- Cuadros ---
    case 'bufalo': {
      // Búfalo / leñador: cuadros grandes de dos colores con el cruce más oscuro y un sargado fino
      ctx.globalAlpha = 0.55
      ctx.fillRect(0, 0, W / 2, W)
      ctx.fillRect(0, 0, W, W / 2)
      ctx.globalAlpha = 1
      ctx.fillRect(0, 0, W / 2, W / 2)
      ctx.globalAlpha = 0.12
      ctx.strokeStyle = c3
      ctx.lineWidth = 3
      for (let x = -W; x < W; x += 9) {
        ctx.beginPath()
        ctx.moveTo(x, W)
        ctx.lineTo(x + W, 0)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      return true
    }
    case 'madras': {
      // Madras: muchas franjas de varios anchos y colores, translúcidas, en las dos direcciones
      const bands: [number, number, string][] = [
        [0, 0.18, c2],
        [0.22, 0.05, c3],
        [0.3, 0.12, mix(c2, c3, 0.5)],
        [0.48, 0.03, '#ffffff'],
        [0.55, 0.2, c3],
        [0.8, 0.06, mix(base, '#000000', 0.4)],
        [0.9, 0.04, c2],
      ]
      ctx.globalAlpha = 0.5
      for (const [p, w, c] of bands) {
        ctx.fillStyle = c
        ctx.fillRect(p * W, 0, w * W, W)
        ctx.fillRect(0, p * W, W, w * W)
      }
      ctx.globalAlpha = 1
      return true
    }
    case 'principe': {
      // Príncipe de Gales: zonas de pata de gallo pequeña y de rayitas, con la ventana fina de color encima
      const u = W / 16
      for (let j = 0; j < 8; j++)
        for (let i = 0; i < 8; i++) if ((i + j) % 2 === 0) ctx.fillRect(i * u, j * u, u, u)
      ctx.lineWidth = u * 0.35
      for (let k = 0; k < 8; k++) {
        ctx.beginPath()
        ctx.moveTo(W / 2 + k * u + u / 2, W / 2)
        ctx.lineTo(W / 2 + k * u + u / 2, W)
        ctx.moveTo(W / 2, W / 2 + k * u + u / 2)
        ctx.lineTo(W, W / 2 + k * u + u / 2)
        ctx.stroke()
      }
      for (let k = 0; k < 8; k++) ctx.fillRect(W / 2 + k * u, k * u, u * 0.5, u * 0.5), ctx.fillRect(k * u, W / 2 + k * u, u * 0.5, u * 0.5)
      ctx.fillStyle = c3
      ctx.fillRect(W * 0.75, 0, W * 0.012, W)
      ctx.fillRect(0, W * 0.75, W, W * 0.012)
      return true
    }
    case 'ventana':
      // Cuadro ventana: una línea fina en cada dirección
      ctx.fillRect(0, 0, W * 0.035, W)
      ctx.fillRect(0, 0, W, W * 0.035)
      return true
    case 'damero':
      ctx.fillRect(0, 0, W / 2, W / 2)
      ctx.fillRect(W / 2, W / 2, W / 2, W / 2)
      return true
    case 'rombos': {
      // Argyle: rombo grande de un color, medios rombos del otro y la raya fina en diagonal
      const diamond = (cx: number, cy: number) => {
        ctx.beginPath()
        ctx.moveTo(cx, cy - W / 2)
        ctx.lineTo(cx + W / 4, cy)
        ctx.lineTo(cx, cy + W / 2)
        ctx.lineTo(cx - W / 4, cy)
        ctx.closePath()
        ctx.fill()
      }
      diamond(W / 2, W / 2)
      ctx.fillStyle = mix(base, c2, 0.4)
      diamond(0, 0)
      diamond(W, 0)
      diamond(0, W)
      diamond(W, W)
      ctx.strokeStyle = c3
      ctx.lineWidth = W * 0.008
      ctx.setLineDash([W * 0.03, W * 0.02])
      ctx.beginPath()
      ctx.moveTo(-W / 4, 0)
      ctx.lineTo(W * 0.75, W * 2)
      ctx.moveTo(W / 4, 0)
      ctx.lineTo(-W * 0.75, W * 2)
      ctx.moveTo(W * 0.75, 0)
      ctx.lineTo(W * 1.75, W * 2)
      ctx.moveTo(W * 1.25, 0)
      ctx.lineTo(W * 0.25, W * 2)
      ctx.stroke()
      ctx.setLineDash([])
      return true
    }
    case 'espiguilla': {
      // Espiguilla (herringbone): columnas de rayitas inclinadas, una columna hacia cada lado
      ctx.lineWidth = W * 0.035
      const col = W / 4
      for (let c = 0; c < 4; c++) {
        const dir = c % 2 ? 1 : -1
        ctx.save()
        ctx.beginPath()
        ctx.rect(c * col, 0, col, W)
        ctx.clip()
        for (let y = -W; y < 2 * W; y += W / 8) {
          ctx.beginPath()
          ctx.moveTo(c * col, y)
          ctx.lineTo((c + 1) * col, y + dir * col)
          ctx.stroke()
        }
        ctx.restore()
      }
      return true
    }
    // --- Rayas ---
    case 'marinera':
      ctx.fillRect(0, W * 0.38, W, W * 0.24)
      return true
    case 'caramelo':
      ctx.fillRect(0, 0, W * 0.2, W)
      ctx.fillStyle = c3
      ctx.fillRect(W * 0.3, 0, W * 0.08, W)
      ctx.fillRect(W * 0.62, 0, W * 0.08, W)
      ctx.fillStyle = c2
      ctx.fillRect(W * 0.8, 0, W * 0.06, W)
      return true
    // --- Motivos ---
    case 'estrellas':
      star(ctx, W / 4, W / 4, W * 0.14)
      star(ctx, (3 * W) / 4, (3 * W) / 4, W * 0.14)
      return true
    case 'corazones':
      heart(ctx, W / 4, W / 4 + W * 0.04, W * 0.18)
      heart(ctx, (3 * W) / 4, (3 * W) / 4 + W * 0.04, W * 0.18)
      return true
    case 'flores': {
      const rand = rng(77)
      const flower = (cx: number, cy: number, r: number, rot: number) => {
        ctx.fillStyle = mix(base, '#2f6b3a', 0.65)
        for (const a of [rot + 0.6, rot + 3.6]) {
          ctx.beginPath()
          ctx.ellipse(cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 1.5, r * 0.9, r * 0.35, a, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = c2
        for (let i = 0; i < 5; i++) {
          const a = rot + (i * Math.PI * 2) / 5
          ctx.beginPath()
          ctx.arc(cx + Math.cos(a) * r * 0.65, cy + Math.sin(a) * r * 0.65, r * 0.55, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = c3
        ctx.beginPath()
        ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2)
        ctx.fill()
      }
      const spots = Array.from({ length: 6 }, () => [rand() * W, rand() * W, W * (0.06 + rand() * 0.05), rand() * 6] as const)
      wrap(W, (dx, dy) => spots.forEach(([x, y, r, a]) => flower(x + dx, y + dy, r, a)))
      return true
    }
    case 'hojas': {
      const rand = rng(31)
      const leaves = Array.from({ length: 7 }, () => [rand() * W, rand() * W, W * (0.16 + rand() * 0.1), rand() * Math.PI * 2, rand() > 0.5] as const)
      wrap(W, (dx, dy) =>
        leaves.forEach(([x, y, l, a, alt]) => {
          ctx.save()
          ctx.translate(x + dx, y + dy)
          ctx.rotate(a)
          ctx.fillStyle = alt ? c2 : c3
          ctx.beginPath()
          ctx.moveTo(0, -l)
          ctx.bezierCurveTo(l * 0.55, -l * 0.5, l * 0.5, l * 0.6, 0, l)
          ctx.bezierCurveTo(-l * 0.5, l * 0.6, -l * 0.55, -l * 0.5, 0, -l)
          ctx.fill()
          ctx.strokeStyle = mix(alt ? c2 : c3, '#ffffff', 0.35)
          ctx.lineWidth = l * 0.04
          ctx.beginPath()
          ctx.moveTo(0, -l * 0.9)
          ctx.lineTo(0, l * 0.95)
          for (let k = -3; k <= 3; k++) {
            ctx.moveTo(0, k * l * 0.22)
            ctx.lineTo(l * 0.3, k * l * 0.22 - l * 0.15)
            ctx.moveTo(0, k * l * 0.22)
            ctx.lineTo(-l * 0.3, k * l * 0.22 - l * 0.15)
          }
          ctx.stroke()
          ctx.restore()
        }),
      )
      return true
    }
    case 'cachemira': {
      // Paisley: gota curvada con su contorno interior y puntos alrededor
      const drop = (cx: number, cy: number, s: number, rot: number) => {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(rot)
        const shape = (k: number) => {
          ctx.beginPath()
          ctx.moveTo(0, -s * k)
          ctx.bezierCurveTo(s * 0.9 * k, -s * 0.6 * k, s * 0.7 * k, s * 0.7 * k, 0, s * 0.55 * k)
          ctx.bezierCurveTo(-s * 0.75 * k, s * 0.45 * k, -s * 0.45 * k, -s * 0.2 * k, s * 0.3 * k, -s * 0.15 * k)
          ctx.bezierCurveTo(s * 0.05 * k, -s * 0.5 * k, -s * 0.15 * k, -s * 0.8 * k, 0, -s * k)
          ctx.closePath()
        }
        ctx.fillStyle = c2
        shape(1)
        ctx.fill()
        ctx.strokeStyle = c3
        ctx.lineWidth = s * 0.06
        shape(0.72)
        ctx.stroke()
        ctx.fillStyle = c3
        ctx.beginPath()
        ctx.arc(s * 0.15, s * 0.15, s * 0.14, 0, Math.PI * 2)
        ctx.fill()
        for (let i = 0; i < 9; i++) {
          const a = -1.2 + i * 0.32
          ctx.beginPath()
          ctx.arc(Math.cos(a) * s * 1.15, Math.sin(a) * s * 1.05, s * 0.05, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
      wrap(W, (dx, dy) => {
        drop(W * 0.28 + dx, W * 0.3 + dy, W * 0.2, 0.3)
        drop(W * 0.75 + dx, W * 0.78 + dy, W * 0.2, 3.5)
      })
      return true
    }
    case 'triangulos': {
      const n = 4
      const s = W / n
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = (i + j) % 2 ? c2 : c3
          ctx.beginPath()
          ctx.moveTo(i * s, j * s)
          ctx.lineTo((i + 1) * s, j * s)
          ctx.lineTo(i * s, (j + 1) * s)
          ctx.closePath()
          ctx.fill()
        }
      return true
    }
    case 'hexagonos': {
      // Panal: hexágonos en contorno (el azulejo encaja con 2 columnas y 1 fila de alto √3)
      ctx.lineWidth = W * 0.02
      const r = W / 4
      const h = (r * Math.sqrt(3)) / 2
      const hex = (cx: number, cy: number) => {
        ctx.beginPath()
        for (let i = 0; i < 6; i++) ctx.lineTo(cx + Math.cos((i * Math.PI) / 3) * r, cy + Math.sin((i * Math.PI) / 3) * r)
        ctx.closePath()
        ctx.stroke()
      }
      // Escala vertical para que encaje en el cuadrado
      ctx.save()
      ctx.scale(1, W / (4 * h))
      for (let col = -1; col <= 3; col++) for (let row = -1; row <= 5; row++) hex(col * 1.5 * r * 1.333, row * 2 * h + (col % 2 ? h : 0))
      ctx.restore()
      return true
    }
    case 'ondas':
      ctx.lineWidth = W * 0.06
      for (const y0 of [W * 0.25, W * 0.75]) {
        ctx.beginPath()
        for (let x = 0; x <= W; x += 4) ctx.lineTo(x, y0 + Math.sin((x / W) * Math.PI * 2) * W * 0.1)
        ctx.stroke()
      }
      return true
    case 'puntitos':
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
          ctx.beginPath()
          ctx.arc(i * (W / 4) + (j % 2 ? W / 8 : 0) + W / 16, j * (W / 4) + W / 8, W * 0.035, 0, Math.PI * 2)
          ctx.fill()
        }
      return true
    case 'azteca': {
      // Étnico: franjas con zigzag, rombos escalonados y rayitas
      ctx.fillRect(0, 0, W, W * 0.08)
      ctx.fillRect(0, W * 0.5, W, W * 0.08)
      ctx.fillStyle = c3
      for (let i = 0; i < 4; i++) {
        const cx = i * (W / 4) + W / 8
        for (let k = 0; k < 3; k++) {
          const s = W * (0.1 - k * 0.03)
          ctx.fillStyle = k % 2 ? base : c3
          ctx.beginPath()
          ctx.moveTo(cx, W * 0.29 - s)
          ctx.lineTo(cx + s, W * 0.29)
          ctx.lineTo(cx, W * 0.29 + s)
          ctx.lineTo(cx - s, W * 0.29)
          ctx.closePath()
          ctx.fill()
        }
      }
      ctx.strokeStyle = c3
      ctx.lineWidth = W * 0.025
      ctx.beginPath()
      for (let i = 0; i <= 8; i++) ctx.lineTo(i * (W / 8), W * (i % 2 ? 0.7 : 0.82))
      ctx.stroke()
      ctx.fillStyle = c2
      for (let i = 0; i < 16; i++) ctx.fillRect(i * (W / 16) + W / 64, W * 0.9, W / 32, W * 0.05)
      return true
    }
    // --- Animal print ---
    case 'leopardo': {
      const rand = rng(91)
      const spots = Array.from({ length: 16 }, () => [rand() * W, rand() * W, W * (0.04 + rand() * 0.03)] as const)
      wrap(W, (dx, dy) =>
        spots.forEach(([x, y, r], k) => {
          const rr = rng(k * 13 + 5)
          ctx.fillStyle = c2
          blob(ctx, x + dx, y + dy, r, rr, 0.85)
          // Roseta: trozos de anillo oscuro alrededor
          ctx.strokeStyle = c3
          ctx.lineWidth = r * 0.45
          ctx.lineCap = 'round'
          for (let a = rr() * 6; a < rr() * 6 + Math.PI * 2; a += 1.1 + rr() * 0.6) {
            ctx.beginPath()
            ctx.arc(x + dx, y + dy, r * 1.35, a, a + 0.6 + rr() * 0.5)
            ctx.stroke()
          }
        }),
      )
      return true
    }
    case 'cebra': {
      const rand = rng(17)
      for (let k = 0; k < 9; k++) {
        const y0 = (k / 9) * W + rand() * 20
        const pts: [number, number][] = []
        const phase = rand() * 6
        for (let x = -W * 0.1; x <= W * 1.1; x += W / 24) pts.push([x, y0 + Math.sin((x / W) * Math.PI * 2 + phase) * W * 0.05])
        wrap(W, (_dx, dy) => taper(ctx, pts.map(([x, y]) => [x, y + dy] as [number, number]), W * (0.045 + rand() * 0.02)))
      }
      return true
    }
    case 'tigre': {
      // Rayas largas y onduladas de arriba abajo, más gruesas en el centro y alguna partida en dos
      const rand = rng(23)
      for (let k = 0; k < 8; k++) {
        const x0 = (k / 8) * W + rand() * W * 0.06
        const y0 = rand() * W
        const len = W * (0.55 + rand() * 0.35)
        const phase = rand() * 6
        const pts: [number, number][] = []
        for (let t = 0; t <= 1.001; t += 0.05) pts.push([x0 + Math.sin(t * 5 + phase) * W * 0.035 + t * W * 0.05, y0 + t * len])
        const wdt = W * (0.045 + rand() * 0.03)
        wrap(W, (dx, dy) => taper(ctx, pts.map(([x, y]) => [x + dx, y + dy] as [number, number]), wdt))
        if (k % 3 === 0) {
          // Horquilla: una rama más corta que sale de la raya
          const fork = pts.slice(Math.floor(pts.length * 0.5)).map(([x, y], i) => [x + i * W * 0.012, y] as [number, number])
          wrap(W, (dx, dy) => taper(ctx, fork.map(([x, y]) => [x + dx, y + dy] as [number, number]), wdt * 0.7))
        }
      }
      return true
    }
    case 'serpiente': {
      // Escamas escalonadas con su borde oscuro y algunas manchas grandes
      const n = 8
      const s = W / n
      ctx.lineWidth = s * 0.12
      for (let j = -1; j <= n; j++)
        for (let i = -1; i <= n; i++) {
          const cx = i * s + (j % 2 ? s / 2 : 0)
          const cy = j * s * 1
          const g = ctx.createRadialGradient(cx, cy - s * 0.2, s * 0.05, cx, cy, s * 0.7)
          g.addColorStop(0, mix(base, '#ffffff', 0.25))
          g.addColorStop(1, base)
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.ellipse(cx, cy, s * 0.55, s * 0.5, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = c2
          ctx.stroke()
        }
      ctx.globalAlpha = 0.55
      ctx.fillStyle = c3
      const rand = rng(5)
      const blots = Array.from({ length: 4 }, () => [rand() * W, rand() * W] as const)
      wrap(W, (dx, dy) => blots.forEach(([x, y], k) => blob(ctx, x + dx, y + dy, W * 0.12, rng(k + 40), 0.6)))
      ctx.globalAlpha = 1
      return true
    }
    case 'vaca': {
      const rand = rng(61)
      const spots = Array.from({ length: 5 }, () => [rand() * W, rand() * W, W * (0.1 + rand() * 0.08)] as const)
      wrap(W, (dx, dy) => spots.forEach(([x, y, r], k) => blob(ctx, x + dx, y + dy, r, rng(k * 7 + 3), 0.75)))
      return true
    }
    // --- Camuflajes ---
    case 'camopixel': {
      // Digital: celdas cuadradas de cuatro tonos según un ruido que se repite
      const n = 32
      const s = W / n
      const noise = cellNoise(n, 7)
      const noise2 = cellNoise(n, 19)
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const v = noise(i, j)
          const v2 = noise2(i, j)
          ctx.fillStyle = v > 0.56 ? c3 : v > 0.5 ? c2 : v2 > 0.55 ? mix(base, '#000000', 0.18) : base
          ctx.fillRect(i * s, j * s, s + 0.5, s + 0.5)
        }
      return true
    }
    case 'camotigre': {
      // Tiger stripe: franjas horizontales como pinceladas, de dos tonos
      const rand = rng(29)
      for (const [color, count, wdt] of [[c2, 9, 0.07], [c3, 8, 0.045]] as const) {
        ctx.fillStyle = color
        for (let k = 0; k < count; k++) {
          const x0 = rand() * W
          const y0 = rand() * W
          const len = W * (0.35 + rand() * 0.35)
          const pts: [number, number][] = []
          for (let t = 0; t <= 1; t += 0.08) pts.push([x0 + t * len, y0 + Math.sin(t * 4 + k) * W * 0.03])
          wrap(W, (dx, dy) => taper(ctx, pts.map(([x, y]) => [x + dx, y + dy] as [number, number]), W * wdt))
        }
      }
      return true
    }
    case 'astillas': {
      // Splinter: polígonos angulosos de dos tonos y rayitas verticales («lluvia»)
      const rand = rng(43)
      for (const [color, count] of [[c2, 7], [c3, 6]] as const) {
        ctx.fillStyle = color
        for (let k = 0; k < count; k++) {
          const x = rand() * W
          const y = rand() * W
          const pts = Array.from({ length: 5 }, (_, i) => [x + Math.cos(i * 1.4 + k) * W * (0.08 + rand() * 0.12), y + Math.sin(i * 1.4 + k) * W * (0.05 + rand() * 0.08)])
          wrap(W, (dx, dy) => {
            ctx.beginPath()
            pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)))
            ctx.closePath()
            ctx.fill()
          })
        }
      }
      ctx.fillStyle = c3
      for (let i = 0; i < 26; i++) for (let j = 0; j < 9; j++) ctx.fillRect(i * (W / 26) + ((j * 7) % 5), j * (W / 9) + ((i * 13) % 17), W * 0.006, W * 0.04)
      return true
    }
    // --- Efectos ---
    case 'marmol': {
      const rand = rng(53)
      ctx.lineCap = 'round'
      for (let k = 0; k < 9; k++) {
        ctx.strokeStyle = k % 3 ? c2 : c3
        ctx.globalAlpha = 0.35 + rand() * 0.4
        ctx.lineWidth = W * (0.004 + rand() * 0.012)
        const y0 = rand() * W
        const phase = rand() * 6
        const pts: [number, number][] = []
        for (let x = -20; x <= W + 20; x += 8) pts.push([x, y0 + Math.sin(x / 40 + phase) * 14 + Math.sin(x / 13 + k) * 6 + (x / W) * W * 0.3])
        wrap(W, (_dx, dy) => {
          ctx.beginPath()
          pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + dy) : ctx.moveTo(x, y + dy)))
          ctx.stroke()
        })
      }
      ctx.globalAlpha = 1
      return true
    }
    case 'salpicado': {
      const rand = rng(67)
      const drops = Array.from({ length: 70 }, () => [rand() * W, rand() * W, W * (0.004 + rand() ** 3 * 0.05), rand() > 0.35] as const)
      wrap(W, (dx, dy) =>
        drops.forEach(([x, y, r, first]) => {
          ctx.fillStyle = first ? c2 : c3
          ctx.beginPath()
          ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2)
          ctx.fill()
        }),
      )
      return true
    }
  }
  return false
}

/** Estampados de aquí, con su nombre, tamaño (cm) y colores de partida (segundo y tercero). */
export const MORE_PATTERNS: { id: string; label: string; group: string; size: number; c2: string; c3: string }[] = [
  { id: 'bufalo', label: 'Cuadros búfalo (leñador)', group: 'Cuadros', size: 5, c2: '#1d1d1f', c3: '#000000' },
  { id: 'madras', label: 'Madras', group: 'Cuadros', size: 8, c2: '#f2c14e', c3: '#2a6f97' },
  { id: 'principe', label: 'Príncipe de Gales', group: 'Cuadros', size: 8, c2: '#2e2e2e', c3: '#b3261e' },
  { id: 'ventana', label: 'Cuadro ventana', group: 'Cuadros', size: 6, c2: '#ffffff', c3: '#ffffff' },
  { id: 'damero', label: 'Damero', group: 'Cuadros', size: 3, c2: '#ffffff', c3: '#000000' },
  { id: 'rombos', label: 'Rombos (argyle)', group: 'Cuadros', size: 6, c2: '#c9a227', c3: '#ffffff' },
  { id: 'espiguilla', label: 'Espiguilla', group: 'Cuadros', size: 2, c2: '#3a3a3a', c3: '#3a3a3a' },
  { id: 'marinera', label: 'Rayas marineras', group: 'Rayas', size: 2.5, c2: '#1f2a44', c3: '#1f2a44' },
  { id: 'caramelo', label: 'Rayas caramelo', group: 'Rayas', size: 3, c2: '#e63946', c3: '#f1c40f' },
  { id: 'estrellas', label: 'Estrellas', group: 'Motivos', size: 3, c2: '#ffffff', c3: '#ffffff' },
  { id: 'corazones', label: 'Corazones', group: 'Motivos', size: 3, c2: '#e63946', c3: '#e63946' },
  { id: 'flores', label: 'Flores', group: 'Motivos', size: 8, c2: '#f4a6c1', c3: '#f2c14e' },
  { id: 'hojas', label: 'Hojas tropicales', group: 'Motivos', size: 16, c2: '#2f6b3a', c3: '#4f9a5a' },
  { id: 'cachemira', label: 'Cachemira (paisley)', group: 'Motivos', size: 8, c2: '#c0392b', c3: '#f2c14e' },
  { id: 'triangulos', label: 'Triángulos', group: 'Motivos', size: 4, c2: '#f2c14e', c3: '#2a6f97' },
  { id: 'hexagonos', label: 'Hexágonos', group: 'Motivos', size: 3, c2: '#1d1d1f', c3: '#1d1d1f' },
  { id: 'ondas', label: 'Ondas', group: 'Motivos', size: 4, c2: '#ffffff', c3: '#ffffff' },
  { id: 'puntitos', label: 'Puntitos', group: 'Motivos', size: 1, c2: '#1d1d1f', c3: '#1d1d1f' },
  { id: 'azteca', label: 'Étnico (azteca)', group: 'Motivos', size: 8, c2: '#c0392b', c3: '#1d1d1f' },
  { id: 'leopardo', label: 'Leopardo', group: 'Animal print', size: 8, c2: '#8a5a2b', c3: '#1d1d1f' },
  { id: 'cebra', label: 'Cebra', group: 'Animal print', size: 14, c2: '#1d1d1f', c3: '#1d1d1f' },
  { id: 'tigre', label: 'Tigre', group: 'Animal print', size: 16, c2: '#1d1d1f', c3: '#1d1d1f' },
  { id: 'serpiente', label: 'Serpiente', group: 'Animal print', size: 5, c2: '#3b3b2f', c3: '#5b4a2e' },
  { id: 'vaca', label: 'Vaca', group: 'Animal print', size: 20, c2: '#1d1d1f', c3: '#1d1d1f' },
  { id: 'camopixel', label: 'Camuflaje digital', group: 'Camuflaje', size: 24, c2: '#5b6b4a', c3: '#2f3a2a' },
  { id: 'camotigre', label: 'Camuflaje tiger stripe', group: 'Camuflaje', size: 30, c2: '#3d4a2c', c3: '#1d1f1a' },
  { id: 'astillas', label: 'Camuflaje astillas (splinter)', group: 'Camuflaje', size: 30, c2: '#5a6b3c', c3: '#2c3324' },
  { id: 'marmol', label: 'Mármol', group: 'Efectos', size: 30, c2: '#9ca3af', c3: '#4b5563' },
  { id: 'salpicado', label: 'Salpicado', group: 'Efectos', size: 16, c2: '#1d1d1f', c3: '#ffffff' },
]

/** Colores de partida (segundo y tercero) de cualquier estampado, para cuando se elige. */
const BASIC_DEFAULTS: Record<string, [string, string]> = {
  rayas: ['#ffffff', '#ffffff'],
  cuadros: ['#ffffff', '#ffffff'],
  escoces: ['#1f3d2b', '#c8102e'],
  patagallo: ['#1d1d1f', '#1d1d1f'],
  diplomatica: ['#ffffff', '#ffffff'],
  zigzag: ['#ffffff', '#ffffff'],
  lunares: ['#ffffff', '#ffffff'],
  camuflaje: ['#4b5320', '#2f2f1f'],
  tiedye: ['#f4a6c1', '#7fb3d5'],
  degradado: ['#ffffff', '#ffffff'],
}
export function patternDefaults(kind: string): { c2: string; c3: string } {
  const m = MORE_PATTERNS.find((p) => p.id === kind)
  if (m) return { c2: m.c2, c3: m.c3 }
  const b = BASIC_DEFAULTS[kind] ?? ['#ffffff', '#6b7280']
  return { c2: b[0], c3: b[1] }
}

/** Estampados que usan el tercer color. */
export const THREE_COLORS = new Set(['escoces', 'camuflaje', 'tiedye', 'bufalo', 'madras', 'principe', 'rombos', 'caramelo', 'flores', 'hojas', 'cachemira', 'triangulos', 'azteca', 'leopardo', 'serpiente', 'camopixel', 'camotigre', 'astillas', 'marmol', 'salpicado'])

/** Grupos para los selectores (los básicos, los de aquí y el resto). */
export const PATTERN_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Básicos', ids: ['rayas', 'cuadros', 'escoces', 'patagallo', 'diplomatica', 'zigzag', 'lunares'] },
  ...['Cuadros', 'Rayas', 'Motivos', 'Animal print', 'Camuflaje', 'Efectos'].map((g) => ({
    label: g,
    ids: [...(g === 'Camuflaje' ? ['camuflaje'] : g === 'Efectos' ? ['tiedye'] : []), ...MORE_PATTERNS.filter((p) => p.group === g).map((p) => p.id)],
  })),
]
