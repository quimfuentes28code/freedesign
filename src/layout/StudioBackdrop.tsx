import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadFont } from '../designer/fonts'
import { Scene } from '../three/Scene'
import type { Design, Measurements, ShoeStyle } from '../types'
import { mannequinMeasurements } from '../designer/to3d'

/**
 * El plató de fotos es el fondo de toda la app. En la portada sale con el maniquí vestido y se puede girar; en el
 * resto de apartados queda detrás, quieto y sin maniquí (se pinta una vez y no gasta), con los paneles claros flotando encima.
 */

export interface StageLook {
  design: Design
  outfit: Design[]
  measurements: Measurements
  shoes: ShoeStyle | null
  animate: boolean
}

const StageContext = createContext<(look: StageLook | null) => void>(() => {})

/** La portada le pasa al fondo lo que lleva el maniquí. */
export const useStage = () => useContext(StageContext)

const DEFAULT_MEASUREMENTS = mannequinMeasurements(undefined, 'hombre')

export function StudioBackdrop({ home, children }: { home: boolean; children: ReactNode }) {
  const [look, setLook] = useState<StageLook | null>(null)
  const shown = home ? look : null
  const value = useMemo(() => setLook, [])
  // Letra de los títulos (portada y placas de cada apartado)
  useEffect(() => {
    loadFont("'Cormorant Garamond', serif")
  }, [])
  return (
    <StageContext.Provider value={value}>
      <div className={home ? 'studio-backdrop live' : 'studio-backdrop'} aria-hidden={!home}>
        <Scene
          stage="studio"
          measurements={shown?.measurements ?? DEFAULT_MEASUREMENTS}
          design={shown?.design ?? null}
          outfit={shown?.outfit}
          shoes={shown?.shoes}
          animate={shown?.animate ?? false}
          autoRotate={false}
          frameloop={home ? 'always' : 'demand'}
          interactive={home}
        />
      </div>
      {children}
    </StageContext.Provider>
  )
}
