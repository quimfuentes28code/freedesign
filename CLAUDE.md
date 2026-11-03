# FreeDesign

App web para diseñar ropa sobre un avatar 3D que se puede girar 360°: medidas del cuerpo, tipo de prenda, ajuste, telas y color. Somos dos personas trabajando en paralelo, cada una con su propio Claude, sobre este mismo repositorio.

## Stack

- **Vite + React 19 + TypeScript** (`src/`)
- **Three.js** con **@react-three/fiber** y **@react-three/drei** para el 3D
- **Cloudflare Workers** (static assets) para el despliegue, configurado en `wrangler.jsonc`

## Comandos

- `npm install` — instalar dependencias
- `npm run dev` — servidor local en http://localhost:5173
- `npm run build` — comprobación de tipos + build a `dist/`. **Ejecutarlo antes de cada commit**: si falla, no se sube.
- `npm run deploy` — build + `wrangler deploy` (normalmente no hace falta: Cloudflare despliega solo al fusionar en `main`)

## Estructura

- `public/models/maniqui.glb` — maniquí de Mixamo (esqueleto + animación Breathing Idle). Se genera desde el `.fbx` de Mixamo con `npm run model -- <entrada.fbx> public/models/maniqui.glb` (`scripts/convert-model.mjs`)
- `src/three/Avatar.tsx` — carga el maniquí, lo pinta gris mate, reproduce la animación y lo ajusta a las medidas
- `src/three/body.ts` — mide el maniquí (alturas, contornos) y deforma su malla para las medidas elegidas, sin tocar los huesos
- `src/three/Garment.tsx` — prendas: tubos de tela que envuelven torso, brazos y piernas
- `src/three/wrap.ts` — construye esa tela "como una cinta métrica" sobre el cuerpo y le da los pesos de los huesos
- `src/three/pose.ts` — pose de reposo de la animación (la ropa se construye ahí) y vuelta a la postura base del esqueleto
- `src/three/Scene.tsx` — canvas, luces, cámara orbital
- `src/components/` — interfaz (panel de diseño)
- `src/data/fabrics.ts` — catálogo de telas y sus propiedades de material
- `src/types.ts` — tipos compartidos (`Measurements`, `Design`…)

## Convenciones

- Interfaz y textos para el usuario **en español**. Nombres de código (variables, funciones, tipos) en inglés; comentarios en español.
- Medidas que ve el usuario en **centímetros**; en la escena 3D todo en **metros** (1 unidad = 1 m), con el suelo en `y = 0`. El maniquí y su ropa trabajan internamente en las unidades del modelo (cm) y se escalan a metros en `Avatar.tsx`.
- Componentes funcionales con hooks, sin librerías de estado global mientras no haga falta.
- Las prendas se derivan del cuerpo del maniquí (articulaciones y alturas de `ModelInfo`); no metas tamaños fijos en los componentes 3D.
- Añadir una tela = una entrada en `FABRICS`. Añadir una prenda = un caso en `GarmentType` y en `buildGarment` (`Garment.tsx`).
- Los modelos 3D van como `.glb` ligeros (Cloudflare no admite archivos de más de 25 MB); nunca subas el `.fbx` original.

## Cómo trabajamos los dos (importante)

- **Nunca trabajar ni hacer push directamente en `main`.** Cada tarea en su rama: `feature/...`, `fix/...`, `chore/...`.
- Antes de empezar: `git checkout main && git pull`, y crear la rama desde ahí.
- Commits pequeños y con mensaje claro en español (p. ej. `Añade prenda falda`).
- Al terminar: `npm run build`, push de la rama y **Pull Request** hacia `main`. La otra persona lo revisa (con la URL de preview de Cloudflare) y lo fusiona.
- Si hay conflictos con `main`, traer `main` a la rama y resolverlos ahí, nunca en `main`.
- Repartirse las zonas para no tocar los mismos archivos a la vez; si hay que cambiar algo compartido (`types.ts`, `body.ts`), avisar al otro.

## Cloudflare y secretos

- La configuración pública va en `wrangler.jsonc` (sí se sube).
- Los secretos (API keys, tokens) **nunca** van en el repo: en local en `.dev.vars` (está en `.gitignore`) y en producción con `npx wrangler secret put NOMBRE` o desde el panel de Cloudflare.
- Futuro previsto: D1 (base de datos de diseños y usuarios) y R2 (texturas, imágenes y modelos 3D).
