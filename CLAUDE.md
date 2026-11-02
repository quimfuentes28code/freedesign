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

- `src/three/body.ts` — geometría del cuerpo: convierte medidas (cm) en dimensiones 3D (m) y genera perfiles del torso y de las prendas
- `src/three/Avatar.tsx` — maniquí paramétrico
- `src/three/Garment.tsx` — prenda generada sobre el cuerpo
- `src/three/Scene.tsx` — canvas, luces, cámara orbital
- `src/components/` — interfaz (panel de diseño)
- `src/data/fabrics.ts` — catálogo de telas y sus propiedades de material
- `src/types.ts` — tipos compartidos (`Measurements`, `Design`…)

## Convenciones

- Interfaz y textos para el usuario **en español**. Nombres de código (variables, funciones, tipos) en inglés; comentarios en español.
- Medidas que ve el usuario en **centímetros**; dentro de la escena 3D todo en **metros** (1 unidad = 1 m), con el suelo en `y = 0`.
- Componentes funcionales con hooks, sin librerías de estado global mientras no haga falta.
- Las prendas se derivan de las medidas del cuerpo (`bodyDims`); no metas tamaños fijos en los componentes 3D.
- Añadir una tela = una entrada en `FABRICS`. Añadir una prenda = un caso en `GarmentType`, `garmentProfile` y `Garment`.

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
