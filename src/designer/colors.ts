/**
 * Carta de colores del Diseñador: colores habituales en prendas, con nombre y código propio (FD-…).
 * Para un color exacto de proveedor se puede escribir su código (p. ej. un Pantone TCX) en la pieza.
 */

export interface ChartColor {
  code: string
  name: string
  hex: string
}

const group = (prefix: number, items: [string, string][]): ChartColor[] =>
  items.map(([name, hex], i) => ({ code: `FD-${prefix}${String(i + 1).padStart(2, '0')}`, name, hex }))

export const COLOR_CHART: { name: string; colors: ChartColor[] }[] = [
  {
    name: 'Neutros',
    colors: group(1, [
      ['Blanco óptico', '#fbfbf8'],
      ['Blanco roto', '#f2efe8'],
      ['Crudo', '#e9e1cf'],
      ['Gris perla', '#d4d3cf'],
      ['Gris jaspeado', '#a9a9a6'],
      ['Gris piedra', '#8a8780'],
      ['Gris marengo', '#4a4a4c'],
      ['Antracita', '#2e2f31'],
      ['Negro carbón', '#1d1d1f'],
    ]),
  },
  {
    name: 'Tierras',
    colors: group(2, [
      ['Arena', '#d8c7a6'],
      ['Beige', '#c9b89f'],
      ['Camel', '#b08458'],
      ['Tostado', '#9c6b43'],
      ['Moca', '#7a5a45'],
      ['Chocolate', '#5b4636'],
      ['Café', '#3f2f25'],
      ['Terracota', '#c4643a'],
      ['Óxido', '#9c4a2a'],
    ]),
  },
  {
    name: 'Verdes',
    colors: group(3, [
      ['Salvia', '#a7b29a'],
      ['Pistacho', '#c3cf9b'],
      ['Oliva', '#6b6e3f'],
      ['Caqui', '#7d7a55'],
      ['Verde militar', '#4b5a3c'],
      ['Verde bosque', '#2f4a3a'],
      ['Verde botella', '#1e3b2f'],
      ['Menta', '#bfe0cf'],
      ['Verde ácido', '#c6e33a'],
    ]),
  },
  {
    name: 'Azules',
    colors: group(4, [
      ['Azul cielo', '#b9d3e8'],
      ['Azul hielo', '#dfe9ef'],
      ['Azul acero', '#7f98ad'],
      ['Azul denim', '#3b5b8c'],
      ['Azul royal', '#2a4fa3'],
      ['Azul petróleo', '#1f4e5a'],
      ['Azul marino', '#1f2a44'],
      ['Azul medianoche', '#161c2e'],
      ['Turquesa', '#2f9fa3'],
    ]),
  },
  {
    name: 'Rojos y rosas',
    colors: group(5, [
      ['Rosa palo', '#e8c4c4'],
      ['Rosa empolvado', '#d6a5a8'],
      ['Rosa chicle', '#e8b4c0'],
      ['Coral', '#e5735f'],
      ['Rojo', '#b3261e'],
      ['Rojo cereza', '#8e1b2a'],
      ['Burdeos', '#6b1f2a'],
      ['Granate', '#4c1820'],
      ['Fucsia', '#c2337a'],
    ]),
  },
  {
    name: 'Amarillos y naranjas',
    colors: group(6, [
      ['Vainilla', '#f1e3b0'],
      ['Mantequilla', '#efd98b'],
      ['Mostaza', '#c9a227'],
      ['Ocre', '#b98a2e'],
      ['Amarillo', '#e3b341'],
      ['Mandarina', '#e8873a'],
      ['Naranja', '#d9622b'],
      ['Calabaza', '#b4541f'],
      ['Melocotón', '#f0b493'],
    ]),
  },
  {
    name: 'Morados',
    colors: group(7, [
      ['Lavanda', '#c9bfe0'],
      ['Lila', '#a99bc9'],
      ['Malva', '#9b7a94'],
      ['Ciruela', '#5e2d4f'],
      ['Berenjena', '#3d2437'],
      ['Violeta', '#6250a8'],
    ]),
  },
]

const ALL = COLOR_CHART.flatMap((g) => g.colors)
const BY_HEX = new Map(ALL.map((c) => [c.hex.toLowerCase(), c]))

/** Color de la carta con ese hex exacto (si lo hay). */
export const chartColor = (hex: string) => BY_HEX.get(hex.toLowerCase())

/** Nombre y código con que se muestra un color: los escritos en la pieza, o los de la carta. */
export function colorLabel(s: { color: string; colorName?: string; colorCode?: string }) {
  const chart = chartColor(s.color)
  return { name: s.colorName || chart?.name || '', code: s.colorCode || chart?.code || '' }
}
