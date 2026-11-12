import './designer.css'
import { FlatView } from '../../designer/FlatView'
import { getTemplate } from '../../designer/templates'
import type { DesignData } from '../../shared/designs'
import { fileUrl } from '../../shared/library'

/**
 * Miniatura de un diseño para las galerías: la imagen de su lienzo (`DesignData.thumb`, se hace al guardar). Si aún
 * no la tiene: un lienzo sin la prenda del diseño sale como su papel (en blanco, como está), y los diseños antiguos
 * o con la prenda en el lienzo, con su dibujo técnico.
 */
export function DesignThumb({ design }: { design: { template: string; data: DesignData } }) {
  const d = design.data
  if (d.thumb) return <img className="design-thumb-img" src={fileUrl(d.thumb)} alt="" loading="lazy" draggable={false} />
  const c = d.canvas
  if (c && !c.layers.some((l) => l.kind === 'mockup' && !l.template))
    return <span className="design-thumb-paper" style={{ background: c.paper, aspectRatio: `${c.w} / ${c.h}` }} />
  const t = getTemplate(design.template)
  return t ? <FlatView template={t} data={d} view="front" /> : null
}
