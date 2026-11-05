# FreeDesign

Herramienta de taller para diseñar y fabricar prendas personalizadas (outfits para clientes concretos y, más adelante, una marca propia). Apartados: Dashboard, Clientes, Diseñador, Proyectos, Producción, Biblioteca y Economía; se construyen por fases. Incluye una vista previa 3D (maniquí animado con la prenda). Somos dos personas trabajando en paralelo, cada una con su propio Claude, sobre este mismo repositorio.

## Stack

- **Vite + React 19 + TypeScript** (`src/`)
- **Three.js** con **@react-three/fiber** y **@react-three/drei** para el 3D
- **React Router** para las páginas de cada apartado
- **Cloudflare Workers**: sirve la web (static assets) y la API `/api/*` (`worker/index.ts`), configurado en `wrangler.jsonc`
- **Cloudflare D1** (SQLite) para los datos; migraciones en `migrations/`. En local, `npm run dev` arranca web + API + base de datos local (plugin `@cloudflare/vite-plugin`)

## Comandos

- `npm install` — instalar dependencias
- `npm run dev` — aplica las migraciones a la base de datos local y arranca web + API en http://localhost:5173
- `npm run db:migrate:remote` — aplica las migraciones a la base de datos de producción
- `npm run build` — comprobación de tipos (web y API) + build a `dist/`. **Ejecutarlo antes de cada commit**: si falla, no se sube.
- `npm run deploy` — build + `wrangler deploy` (normalmente no hace falta: Cloudflare despliega solo al fusionar en `main`)

## Estructura

### App y datos

- `src/App.tsx` — rutas de cada apartado; `src/layout/AppLayout.tsx` — menú lateral (con la cuenta abajo)
- Cuentas: cada usuario (particular o empresa) tiene su espacio privado. `src/auth/AuthContext.tsx` guarda la sesión (`useAuth`) y protege las rutas (`RequireAuth`, `GuestOnly`); pantallas en `src/pages/auth/AuthPages.tsx` (/entrar, /registro) y `src/pages/account/Profile.tsx` (/perfil). Tipos en `src/shared/users.ts`
- `src/pages/` — una página por apartado (`Dashboard.tsx`, `clients/`, `library/`, `designer/`, `projects/`, `production/`, `economy/` y `Sections.tsx` con la página de «no encontrada»)
- Proyectos (`src/pages/projects/`): tablero por fases (arrastrar cambia la fase), lista, ficha (datos, diseños, archivos, materiales y costes, tareas, notas) y colecciones. Fases y categorías de archivo en `src/shared/projects.ts`. Las partes de un proyecto (archivos, materiales, costes, tareas) se guardan al momento con `api.projectPart`; los datos principales con «Guardar cambios»
- Producción (`src/pages/production/`): órdenes de fabricación (muestra o tanda, taller, unidades por talla y pasos que se marcan al terminarlos) y la ficha técnica de cada proyecto (`/produccion/ficha/:id`), con cuatro hojas A4 que se imprimen o guardan como PDF (`@media print` en `production.css`). La ficha se genera del diseño, el cliente y los materiales; solo se guarda lo elegido o retocado (`TechPackData` en `src/shared/production.ts`), y cada guardado sube la versión. `src/production/measurements.ts` calcula las medidas de la prenda (tallaje estándar XS–XXL o a medida, más la holgura de cada corte) y `construction.ts` la confección y el orden de montaje por defecto de cada prenda base
- Economía (`src/pages/economy/`): resumen del año (cobrado, costes de proyectos, gastos generales, beneficio y pendiente de cobro), gráfico mes a mes, rentabilidad por proyecto, cliente y colección, y gastos generales (`/economia/gastos`). Los cobros son una parte más del proyecto (`payments`, en su ficha). Criterio de fechas: ingresos por la fecha del cobro, costes de proyectos por cuándo se apuntaron, gastos generales por su fecha. Tipos en `src/shared/economy.ts`; API en `worker/economy.ts`
- `src/designer/` — Diseñador 2D: dibujos técnicos (flats) paramétricos en SVG. `templates.ts` es el catálogo de prendas base (piezas, opciones y cómo se dibujan); `top.ts` dibuja las prendas de torso (sudadera, camiseta, polo, camisa, bomber, puffer: cuellos `Neck`, tapeta con botones, bajo curvo, puño camisero, canesú, acolchado) y `pants.ts` los pantalones (jogger/cargo, ancho, corto: cintura elástica o con trabillas, pinzas, bajo vuelto); cada prenda base tiene `family` (`top` o `pants`), que decide medidas, cotas, ficha y forma 3D (`isPants`); `FlatView.tsx` pinta una vista con los colores y materiales de cada pieza (o en «línea», blanco y negro), deja elegir una pieza con un clic y acepta una capa encima (`overlay`). Añadir una prenda base = una entrada en `TEMPLATES` (puede reutilizar `drawTop` o `drawPants`)
- Editor (`src/pages/designer/DesignEditor.tsx`), tipo estudio: capas a la izquierda en grupos plegables (`Fold.tsx`, con «+» para añadir), lienzo en el centro (2D, «Ver en 3D» o los dos) con una sola barra arriba y la columna de herramientas a la izquierda (`Canvas.tsx`: seleccionar, lápiz, formas, nota, dividir color, calco; sus opciones flotan solo mientras se usan) e inspector según lo seleccionado (pieza, estampados, detalles, notas) o, sin nada seleccionado, la prenda (modelo, medidas y datos). En el editor el menú general se recoge a iconos (`AppLayout.tsx`). Deshacer/rehacer con `useHistory.ts` (Ctrl+Z, Ctrl+Mayús+Z), Ctrl+S guarda. `annotations.tsx`: cotas con las letras de la tabla de medidas de la ficha, escala, cuadrícula en cm y notas con flecha (`DesignData.callouts`). `colors.ts`: carta de colores con nombre y código; cada pieza puede guardar su nombre y código (p. ej. Pantone)
- Hoja de ruta del Diseñador (orden acordado y fases hechas): `docs/hoja-de-ruta.md`
- Detalles y fornituras (`src/designer/details.tsx`): cada detalle (botón, cremallera, ojal, remache, herrete, etiqueta, parche) se describe como una lista de trazos (`Prim`) centrados en (0, 0), que se pintan en SVG (`PrimsView`) y en canvas (`drawPrims`). `DesignData.details` son los colocados a mano (pestaña Detalles, `DetailsPanel.tsx`); `DesignData.hardware` es el estilo de los botones y la cremallera de la prenda base, que el dibujo marca con `Shape.role` (`button`, `zip`). En 3D van en la imagen de estampados y en un mapa de relieve (`PrintLayer.relief`) que el material usa para dar volumen a bordados, parches y fornituras
- Plantillas de la marca: un diseño con `DesignData.brandTemplate` sale en «Nuevo diseño» y se copia entero al usarlo
- En 3D solo sudadera, camiseta y pantalón tienen forma propia; el resto usa la más parecida (`hasOwn3D` y `garmentOf` en `to3d.ts`); los cortos recortan la pernera con `Design.legLength`
- Medidas editables (`src/designer/measures.ts`): `DesignData.measures` guarda cm por punto de medida; la proporción con la medida que tocaría estira el dibujo (`DrawScale`, que reciben `drawTop`/`drawPants`), la prenda 3D (largo, manga y `chestScale`) y la tabla de la ficha técnica (la diferencia se suma a todas las tallas). Algunas medidas acompañan a otras (`FOLLOW`). Sin medidas propias, todo queda igual
- Estirar forma (`src/designer/handles.tsx`, herramienta de la columna del lienzo): puntos que se arrastran para cambiar una medida (escote: ancho y caída; pecho, largo, manga, puño; cadera, rodilla, bajo). Cada punto se encuentra solo: se dibuja la prenda con esa parte un 10 % mayor y se coge el punto que más se mueve, así vale para cualquier prenda base. Mientras se estira, el encuadre del dibujo se congela (`FlatView.lockFrame`)
- Dibujo a mano y calco (`src/designer/drawings.tsx`): `DesignData.drawings` (lápiz, línea, rectángulo, elipse) y `DesignData.tracings` (boceto para calcar, uno por vista). Estampados, trazos, notas y calcos pueden estar ocultos (`hidden`) o bloqueados (`locked`). Los estampados se ajustan solos al centro y, con la cuadrícula, a cada cm
- Variantes de color (`src/designer/colorways.ts`): la activa vive siempre en `DesignData.pieces` y el resto en `DesignData.colorways`, así el dibujo, la vista 3D y la ficha técnica usan la activa sin saber de variantes
- Exportar (`src/designer/exportFlat.tsx`, botón «Exportar» del editor en `pages/designer/ExportMenu.tsx`): pinta las vistas fuera de la pantalla sin las ayudas del editor y las junta en un SVG con imágenes y fuentes dentro (`embeddedFontCss` y `toDataUrl` de `fonts.ts`); de ahí sale el PNG (≈3600 px) y el PDF A4 (`pdf.ts`, escrito a mano, sin librerías)
- Superficies y bloques de color (`src/designer/surfaces.ts`): cada pieza puede llevar una superficie (`PieceStyle.surface`: rayas, cuadros, lunares, camuflaje, tie-dye, logo repetido, degradado) y un lavado (`PieceStyle.wash`), que se pintan en un azulejo (`pieceTile`): es el relleno del dibujo y la textura de la tela en 3D (`SlotStyle.tile`). `DesignData.blocks` divide una pieza con una línea (`halfPlane`, recortado a la pieza); en 3D salen los del cuerpo (en `printLayers.ts`)
- Materiales del Diseñador: `src/designer/materials.ts` es el catálogo integrado de tejidos y fornituras (ids `cat:…`), con su textura 2D (`weave`), brillo (`gloss`) y aspecto 3D (`look`). Añadir un material = una entrada en `CATALOG`. `swatches.tsx` dibuja las texturas en SVG (muestras y plano) y `pages/designer/MaterialPicker.tsx` es el selector con muestras (catálogo + materiales propios de la Biblioteca). Si una pieza no tiene material, se ve con el de por defecto de su prenda base (`defaultMaterialFor`)
- 2D ↔ 3D: el editor tiene vista 2D, 3D o ambas (`pages/designer/Design3D.tsx`). `src/designer/to3d.ts` traduce el diseño a la prenda 3D (prenda, corte, largos, detalles y color/material de cada pieza → zonas `GARMENT_SLOTS` de `src/types.ts`); el maniquí toma las medidas del cliente del diseño si las tiene
- Estampados: `src/designer/prints.tsx` dibuja los estampados (gráficos o textos) sobre el flat y `Transformable` permite moverlos, escalarlos y girarlos (también se usa en el creador). `printZones` de cada plantilla son las posiciones rápidas. 1 unidad del lienzo ≈ 0,5 cm (`UNITS_PER_CM`)
- Gráficos: `src/pages/library/Artworks.tsx` (lista y subida) y `ArtworkCreator.tsx` (creador de logos por capas, `artLayers.tsx`); al guardar se exporta un SVG a Workers KV. Las imágenes de gráficos no se borran al editar o eliminar el gráfico, porque los diseños guardan su propia referencia. Al exportar, las fuentes de Google usadas se incrustan en el SVG (solo sus letras, en base64), así se ve igual en cualquier sitio (por eso la CSP de `files.ts` permite `font-src data:`)
- Tipografías (`src/designer/fonts.ts`): catálogo de Google Fonts por estilos más las del sistema; en los diseños se guarda la pila CSS (`'Anton', sans-serif`). `loadFont` las descarga al usarlas, `loadFontPreviews` una muestra ligera para el selector (`src/components/FontPicker.tsx`) y `useFontsVersion` repinta al llegar. Efectos del texto en `Print` (arco, vertical, espaciado, contorno, sombra, cursiva) y su reparto en `textLayout` (`prints.tsx`), el mismo en SVG y en el canvas del 3D
- `src/components/ui.tsx` — piezas comunes (cabecera de página, campos, precio, estados de carga)
- `src/api/client.ts` — llamadas a la API, `useApi` para cargar datos y subida de imágenes (se reducen antes de subirlas)
- `src/shared/` — tipos compartidos por la web y la API (`clients.ts` con la lista de medidas, `library.ts` con categorías y unidades de precio)
- `worker/` — API: `index.ts` (rutas y acceso), `auth.ts` (registro, login, sesiones y perfil), `clients.ts`, `library.ts` (materiales y proveedores), `designs.ts` (diseños), `artworks.ts` (gráficos), `projects.ts` (proyectos, colecciones y tareas), `production.ts` (fichas técnicas y órdenes de fabricación), `economy.ts` (gastos generales y resumen económico), `files.ts` (imágenes en Workers KV), `http.ts` (utilidades)
- `migrations/` — tablas de la base de datos (una migración nueva por cada cambio; nunca editar las ya aplicadas)

### Vista previa 3D (`/disenador/3d`)

- `src/pages/designer/Preview3D.tsx` + `studio.css` — página de la vista 3D y su panel (`src/components/DesignPanel.tsx`)
- `public/models/maniqui.glb` — maniquí de Mixamo (esqueleto + animación Breathing Idle). Se genera desde el `.fbx` de Mixamo con `npm run model -- <entrada.fbx> public/models/maniqui.glb` (`scripts/convert-model.mjs`)
- `src/three/Avatar.tsx` — carga el maniquí, lo pinta gris mate, reproduce la animación y lo ajusta a las medidas
- `src/three/body.ts` — mide el maniquí (alturas, contornos) y deforma su malla para las medidas elegidas, sin tocar los huesos
- `src/three/Garment.tsx` — prendas (un material por zona: cuerpo, mangas, capucha, cuello, bolsillo, puños y bajo; el bolsillo se recorta a su forma exacta en el shader): la sudadera con patrón de costura (`src/three/cloth/`: piezas, costuras, simulación ligera en un Web Worker, texturas de tejido) y el resto con tubos que envuelven el cuerpo
- Detalle de confección (sudadera): cada pieza del patrón dice el acabado de sus bordes (`edges` en `cloth/hoodie.ts`: costura plana, pespunte, recubierta, doblez, jareta) y `Cloth.edgeInfo()` lo pasa a la malla como atributo `edge`; el shader de `Garment.tsx` (`SEAM_GLSL`) dibuja hendiduras, pespuntes y rebordes. La tela no se atraviesa a sí misma gracias a las capas de `relax` (capucha por fuera del cuerpo, mangas separadas del costado). La capucha puede ir puesta (`hoodUp`) o bajada, y lleva cordones con ojales y herretes (`addCords` en `cloth/dress.ts`)
- En desarrollo, `window.__three.look([x, y, z], [tx, ty, tz])` mueve la cámara de la vista 3D (para revisar detalles)
- `src/three/wrap.ts` — construye esa tela "como una cinta métrica" sobre el cuerpo y le da los pesos de los huesos
- `src/three/pose.ts` — pose de reposo de la animación (la ropa se construye ahí) y vuelta a la postura base del esqueleto
- Estampados en 3D: `src/designer/printLayers.ts` pinta los estampados de delantero y espalda en una imagen encuadrada como el cuerpo del dibujo (de costado a costado, del hombro al bajo). `Garment.tsx` la proyecta sobre el cuerpo y el bolsillo (`PRINT_GLSL`): en la sudadera sobre la pieza plana del patrón (UV en cm), en el resto de frente sobre la posición en reposo. Los del lateral aún no salen en 3D
- `src/three/Scene.tsx` — canvas, luces, cámara orbital
- `src/data/fabrics.ts` — catálogo de telas y sus propiedades de material
- `src/types.ts` — tipos de la vista 3D (`Design`, medidas del maniquí)

## Convenciones

- Interfaz y textos para el usuario **en español**. Nombres de código (variables, funciones, tipos) en inglés; comentarios en español.
- Medidas que ve el usuario en **centímetros**; en la escena 3D todo en **metros** (1 unidad = 1 m), con el suelo en `y = 0`. El maniquí y su ropa trabajan internamente en las unidades del modelo (cm) y se escalan a metros en `Avatar.tsx`.
- Componentes funcionales con hooks, sin librerías de estado global mientras no haga falta.
- Las prendas se derivan del cuerpo del maniquí (articulaciones y alturas de `ModelInfo`); no metas tamaños fijos en los componentes 3D.
- Añadir una tela = una entrada en `FABRICS`. Añadir una prenda = un caso en `GarmentType` y en `buildGarment` (`Garment.tsx`).
- Los modelos 3D van como `.glb` ligeros (Cloudflare no admite archivos de más de 25 MB); nunca subas el `.fbx` original.

## Cómo trabajamos los dos (importante)

- **Trabajamos directamente en `main`**, sin ramas ni Pull Requests, para que nadie tenga que fusionar lo del otro.
- Antes de empezar cada cambio: `git pull` para partir de lo último del otro.
- Commits pequeños y con mensaje claro en español (p. ej. `Añade prenda falda`).
- Al terminar cada cambio: `npm run build` (si falla, no se sube), `git pull --rebase` y `git push`. Al subir a `main`, Cloudflare despliega a producción.
- Si al traer los cambios del otro hay conflictos, resolverlos en local antes de subir; nunca `git push --force`.
- Repartirse las zonas para no tocar los mismos archivos a la vez; si hay que cambiar algo compartido (`types.ts`, `body.ts`), avisar al otro.

## Cloudflare y secretos

- La configuración pública va en `wrangler.jsonc` (sí se sube).
- Los secretos (API keys, tokens) **nunca** van en el repo: en local en `.dev.vars` (está en `.gitignore`) y en producción con `npx wrangler secret put NOMBRE` o desde el panel de Cloudflare.
- D1 guarda los datos y Workers KV (binding `FILES`) las imágenes; ver README para crearlos en producción. Al quitar o cambiar una foto, la API borra la anterior de KV.

## Cuentas y datos por usuario (importante)

- Todas las rutas de la API menos `/api/auth/*` exigen sesión (`currentUser` en `worker/auth.ts`). Cada handler recibe el `uid` de la cuenta.
- **Toda tabla nueva con datos de usuario lleva `user_id`**, y toda consulta filtra por él (`WHERE ... AND user_id = ?`), también los `UPDATE` y `DELETE`. Las tablas hijas (p. ej. las partes de un proyecto) cuelgan de su padre y se comprueba antes que el padre es de la cuenta.
- Las referencias que llegan del navegador (cliente, proyecto, material, proveedor, colección) se validan con `ownedRef` (`worker/http.ts`) antes de guardarlas.
- Los archivos de KV guardan en sus metadatos la cuenta que los subió; solo esa cuenta puede verlos o borrarlos.
- Contraseñas con PBKDF2 (Web Crypto). La sesión es una cookie `HttpOnly` con un token aleatorio; en D1 solo se guarda su hash. Las peticiones que cambian datos desde otro origen se rechazan.
