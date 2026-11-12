import { useState } from 'react'
import { isIOS, isStandalone, useInstallPrompt } from '../../pwa'

/** Tarjeta de Mi perfil para instalar FreeDesign como app en iPad, móvil u ordenador (ver `src/pwa.ts`). */
export function InstallAppCard() {
  const { canPrompt, install } = useInstallPrompt()
  const [done, setDone] = useState(false)

  if (isStandalone() || done) {
    return (
      <div className="card">
        <h2>App instalada</h2>
        <p className="muted">
          Estás usando FreeDesign como app. Se actualiza sola: cuando publicamos cambios, se descargan por detrás y la próxima
          vez que la abras ya tienes lo nuevo.
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2>Instalar la app</h2>
      <p className="muted">
        Pon FreeDesign en la pantalla de inicio del iPad, el móvil o el ordenador: se abre a pantalla completa, sin la barra
        del navegador, y se actualiza sola.
      </p>
      {canPrompt ? (
        <div className="form-actions">
          <button type="button" className="button primary" onClick={async () => setDone(await install())}>
            Instalar FreeDesign
          </button>
        </div>
      ) : isIOS() ? (
        <ol className="install-steps">
          <li>
            Abre esta página en <strong>Safari</strong>.
          </li>
          <li>
            Toca <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba; en el iPad, arriba a la derecha).
          </li>
          <li>
            Elige <strong>«Añadir a pantalla de inicio»</strong> y toca <strong>Añadir</strong>.
          </li>
        </ol>
      ) : (
        <ol className="install-steps">
          <li>
            En <strong>Chrome o Edge</strong>: menú <strong>⋮</strong> → <strong>«Instalar FreeDesign»</strong> (o el icono de
            instalar a la derecha de la barra de direcciones).
          </li>
          <li>
            En <strong>Android</strong>: menú <strong>⋮</strong> → <strong>«Añadir a pantalla de inicio»</strong> o
            <strong> «Instalar app»</strong>.
          </li>
        </ol>
      )}
    </div>
  )
}
