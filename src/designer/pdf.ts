/**
 * PDF mínimo de una página A4 apaisada con una imagen JPEG y un título, sin librerías.
 * Los textos van en Helvetica (WinAnsi), que admite tildes y eñes.
 */

const W = 842
const H = 595
const M = 32

/** Texto como bytes Latin-1 (lo que no cabe se cambia por «?»). */
function bytes(s: string) {
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    b[i] = c < 256 ? c : 63
  }
  return b
}

const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`)

export function imagePdf(jpeg: Uint8Array, imgW: number, imgH: number, title: string, subtitle: string) {
  // La imagen, lo más grande posible bajo la cabecera y centrada
  const top = H - M - 44
  const k = Math.min((W - M * 2) / imgW, (top - M) / imgH)
  const [dw, dh] = [imgW * k, imgH * k]
  const [x, y] = [(W - dw) / 2, M + (top - M - dh) / 2]
  const content = [
    `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im1 Do Q`,
    `BT /F2 16 Tf ${M} ${H - M - 14} Td (${esc(title)}) Tj ET`,
    `BT /F1 9 Tf 0.4 g ${M} ${H - M - 30} Td (${esc(subtitle)}) Tj ET`,
    `0.8 G 0.5 w ${M} ${H - M - 38} m ${W - M} ${H - M - 38} l S`,
  ].join('\n')

  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (b: Uint8Array) => {
    parts.push(b)
    length += b.length
  }
  const obj = (n: number, body: string, stream?: Uint8Array) => {
    offsets[n] = length
    push(bytes(`${n} 0 obj\n${body}\n`))
    if (stream) {
      push(bytes('stream\n'))
      push(stream)
      push(bytes('\nendstream\n'))
    }
    push(bytes('endobj\n'))
  }

  push(bytes('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'))
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> /Font << /F1 6 0 R /F2 7 0 R >> >> >>`)
  const c = bytes(content)
  obj(4, `<< /Length ${c.length} >>`, c)
  obj(5, `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg)
  obj(6, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  obj(7, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

  const xref = length
  const rows = offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
  push(bytes(`xref\n0 ${offsets.length}\n0000000000 65535 f \n${rows.join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`))
  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}
