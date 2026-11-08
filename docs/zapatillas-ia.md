# Zapatillas propias en 3D (generadas con IA desde fotos)

Para que el maniquí lleve zapatillas de tu estilo (las que usas o las que quieres enseñar), se hace un modelo 3D a partir de fotos con un servicio de «imagen a 3D» y se monta en la app.

## 1. Las fotos

- **Una sola zapatilla**, la del pie derecho o la del izquierdo (el otro pie se hace en espejo).
- **Fondo liso y claro** (una pared o una cartulina blanca) y **luz suave**, sin sombras duras ni flash directo: de día junto a una ventana va muy bien.
- **La zapatilla entera en la foto**, centrada y sin cortar, con la cámara a su altura.
- Si el servicio acepta varias fotos («multivista»), haz **cuatro**: de lado por fuera (perfil), de frente en tres cuartos, por detrás y desde arriba. Con varias sale mucho mejor que con una.
- Mejor **sin logotipos de marcas** si las fotos o el 3D se van a enseñar a clientes o publicar.

## 2. Generar el 3D

Cualquiera de estos servicios tiene prueba gratis (las condiciones y la licencia de lo generado cambian según el plan: revísalas en cada uno antes de usarlo para la marca):

- **Tripo** (tripo3d.ai): «Image to 3D» o «Multiview to 3D» con las cuatro fotos.
- **Meshy** (meshy.ai): «Image to 3D», con texturas PBR activadas.
- **Hyper3D Rodin** (hyper3d.ai): acepta varias fotos.

Al exportar:

- Formato **GLB** (`.glb`), **con texturas** (PBR si lo ofrece).
- Unos **30.000 triángulos** (si deja elegir «polycount» o «calidad»: media). Con muchos más va lento.

## 3. Montarla en la app

Guarda el `.glb` en la carpeta del proyecto (o di dónde está) y pide que se añada con el nombre que quieras que salga en «Calzado». Lo que se hace:

```bash
node scripts/convert-shoe.mjs ruta/al/modelo.glb public/models/mi-zapatilla.glb
```

y una línea en `REAL_SHOES` (`src/three/RealShoes.tsx`) más su id en `RealShoeId` (`src/types.ts`). El modelo puede venir girado de cualquier manera en horizontal: la app encuentra sola el largo, la puntera y el talón, la escala al pie del maniquí, la apoya en el suelo, la une al pie para que siga las poses y hace caer el pantalón encima de ella.
