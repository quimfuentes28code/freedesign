import type { ReactNode } from 'react'

/** Apartado plegable del editor (capas e inspector): un título que se abre y se cierra con un clic. */
export function Fold({ title, open = false, extra, children, className }: { title: ReactNode; open?: boolean; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={className ? `fold ${className}` : 'fold'} open={open}>
      <summary>
        <svg className="fold-arrow" viewBox="0 0 12 12" width="12" height="12" aria-hidden>
          <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="fold-title">{title}</span>
        {extra && (
          // Los botones de la cabecera no abren ni cierran el apartado
          <span className="fold-extra" onClick={(e) => e.preventDefault()}>
            {extra}
          </span>
        )}
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  )
}
