# Plan de trabajo: Diseñador sobre lienzo, 3D y app

Sale del Word «Aplicación diseño.docx» (versión del 11-11-2026) y de las mejoras que ya habíamos acordado. Va por fases y en orden. Cada fase acaba con algo que se puede usar y se sube a `main`. Lo que está marcado con ✅ ya existe y solo hay que retocarlo.

---

## Respuestas a tus preguntas (antes de empezar)

### Pinceles y texturas de Procreate: ¿qué son y de dónde salen?
- **Un pincel de Procreate** (archivo `.brush` o `.brushset`, que es un pack) tiene tres cosas:
  - una imagen de la **punta**: la forma que se estampa una y otra vez a lo largo del trazo;
  - una imagen del **grano**: la textura que se ve dentro del trazo;
  - unos **ajustes**: separación, presión, giro, dispersión, etc.

  Los diseñadores de ropa se compran packs (denim, punto, cremalleras, costuras, desgaste, botones…) en Gumroad, Etsy o Creative Market, y se instalan con doble clic. Los «pinceles» de cremallera o de botones que salen en tus vídeos son en realidad **sellos**: la punta es el dibujo de un diente de cremallera o de un botón.
- **Una textura** es una imagen que se repite sin cortes (denim, punto, felpa, malla…). Se pone en una capa encima de la prenda, se recorta a la prenda (máscara de recorte) y se le pone el modo de fusión Superposición o Luz suave. Así coge el color de debajo y solo añade el relieve.
- **¿Hay que descargarlos?** No. Los de pago no los podemos meter en la app (tienen licencia). **Los generamos nosotros**: nuestro motor de pinceles ya funciona igual (punta, grano, presión), así que pinceles y texturas se pueden crear por código e ir incluidos en la app. Además:
  - podrás **subir tus propias texturas** (cualquier imagen);
  - intentaremos **importar `.brushset`** de Procreate. Es un zip con las imágenes de punta y grano, así que se puede leer, aunque no todos sus ajustes tendrán equivalente.

### Capa de referencia
En Procreate se marca la capa de las **líneas** como «Referencia». Luego, con el bote, pintas en **otra capa** y el color se para en las líneas de la de referencia. Así el color va en su capa y las líneas no se tocan nunca, y luego puedes cambiar el color, ponerle textura o sombras sin estropear el dibujo.

**Sí se puede.** El bote ya calcula zonas (`floodMask`); solo hay que decirle que lea los bordes de la capa marcada como referencia en vez de los de la capa activa.

### Máscara de recorte
Una capa con «máscara de recorte» solo se ve donde hay algo pintado en la capa de debajo. Es lo que hace que una textura, una sombra o un estampado no se salgan de la prenda. Se pueden apilar varias: denim, luego desgaste, luego sombras, todas recortadas a la misma prenda.

### Sombras y luces en el 3D: mi opinión
**Se puede, y bien, con una condición: las luces y sombras pintadas a mano tienen que ir en capas marcadas como «Luz» o «Sombra».**
- En el **dibujo 2D** se ven todas las capas.
- Al pasar al **3D** (probador o vista de la prenda sola), esas capas **no se usan**: el 3D pone sus propias luces y sombras según cómo gire la prenda.
- Todo lo demás pasa tal cual: colores, texturas, estampados, logos y desgastes.

Si las sombras estuvieran mezcladas con el color en la misma capa, en 3D saldrían sombras «pintadas» que no cuadran con la luz. Por eso el lienzo creará esas capas aparte, tanto si las pintas tú como si las genera la app.

### Vista 3D de la prenda sola, girando 360°
Es posible, y es la forma correcta de hacerlo. Se coge la prenda 3D que ya cosemos (la misma forma inflada, sin maniquí) y se le «pega» encima lo que has pintado en el lienzo:
- la vista **delantera** del lienzo va al delantero;
- la **trasera** a la espalda;
- las **mangas** desde las vistas laterales.

Para que encaje, el lienzo tiene que saber **qué prenda es** y dónde está cada pieza. Por eso los diseños nuevos parten de una prenda (las editables o tus mockups, cuyas piezas conocemos). Un dibujo totalmente a mano sin prenda base se podrá ver en 3D solo de forma aproximada.

### App para Android y Apple
Lo dejamos para el final, como dices. Cómo funciona:
1. **Primero, «app web instalable» (PWA).** Desde el iPad o el móvil se pulsa «Añadir a pantalla de inicio» y sale con su icono, a pantalla completa, como una app. **Cada vez que subimos un cambio a `main` se actualiza sola**, sin pasar por ninguna tienda. Esto lo podemos hacer pronto (fase 11) sin que estorbe a seguir mejorando.
2. **Al final, si queréis estar en App Store y Google Play:** se «envuelve» la misma web con Capacitor. La app de la tienda carga nuestra web, así que casi todos los cambios siguen llegando solos; solo hay que publicar una versión nueva en la tienda cuando cambie algo nativo, como el icono o los permisos. Hace falta una cuenta de desarrollador de Apple (99 €/año) y de Google (25 € una vez), y un Mac para compilar la de Apple (o un servicio en la nube).

---

## Fase 1 — El Diseñador es el lienzo (quitar el diseñador antiguo) ✅ hecha (11-11-2026)
Hecho: `/disenador` abre un lienzo en blanco (se crea al guardar), el panel «Diseños» (empezar: en blanco, prenda, plantilla de la marca, importar imagen; y «Mis diseños»), el panel «Prenda» (piezas, modelo, medidas, datos, exportar y eliminar) y la vista 2D / 3D / 2D + 3D. El editor técnico antiguo y la lista de diseños se han quitado. Queda para más adelante: miniaturas de «Mis diseños» con lo pintado en el lienzo (ahora enseñan el dibujo técnico) y probarlo en el iPad.

1. Al entrar en **Diseñador**:
   - se abre directamente el **lienzo en blanco**, sin la lista de plantillas antiguas;
   - dentro, con un botón **«Nuevo» / «Empezar con…»**, se elige: lienzo vacío, una prenda editable, un mockup, una plantilla de la marca o una importación de imagen.
2. **Un diseño empezado se abre en su lienzo** tal cual estaba.
3. Arriba, tres modos:
   - **2D**;
   - **3D**;
   - **2D + 3D**, con el lienzo al lado del 3D, que se actualiza al pintar.
4. **Quitar** el editor antiguo (vista de capas y lienzo SVG, «Nuevo diseño» con plantillas) de la interfaz.
   - Por dentro se queda lo que sigue haciendo falta: la prenda base (`template`/`options`) alimenta el 3D, la ficha técnica y el patrón.
   - Las medidas y los datos de la prenda pasan a un panel del lienzo («Prenda: modelo, medidas, datos»).
5. **Lista de diseños**: dónde queda la galería de mis diseños (estilo galería de Procreate: miniaturas grandes, crear, duplicar, borrar con deshacer).
6. **Importar imágenes** al lienzo con un botón (✅ ya se puede pegar y subir), para:
   - ponerlas en cualquier capa, por debajo para calcar;
   - **recortar** un trozo con el lazo (✅ ya hay selección) y pasarlo a capa nueva.

## Fase 2 — Capas y herramientas como Procreate ✅ hecha (11-11-2026)
Hecho:
- **Capas:** máscara de recorte, capa de referencia, capas de Luz y Sombra, voltear e invertir colores.
- **Bote:** con capa de referencia y «Solo la ropa».
- **Guía de dibujo:** simetría radial y giratoria con centro movible, cuadrícula isométrica y asistencia de dibujo.
- **Herramientas:** QuickShape, cuentagotas al mantener, menú rápido e historial deslizable.
- **Transformar:** estirar y distorsionar por las esquinas. Además se ha arreglado un fallo: los tiradores de transformar no salían.

Queda para más adelante: agrupar capas, deformar con malla (warp), el time-lapse y probarlo en el iPad con el lápiz.

1. **Capas:**
   - duplicar (✅ ya existe);
   - **invertir**: voltear horizontal o vertical, e invertir colores;
   - **máscara de recorte**;
   - **capa de referencia**;
   - **capas de Luz y de Sombra** (ver arriba);
   - agrupar capas;
   - **transformar la capa entera**: mover, escalar, girar, estirar (no proporcional), deformar con malla y distorsionar en perspectiva. ✅ Transformar ya existe; falta estirar y deformar.
2. **Rellenar:**
   - **rellenar solo la ropa** con color, textura o estampado (✅ ya está «Pintar solo dentro de la prenda»; falta en el bote y la textura);
   - **«rellenar manteniéndolo en un sitio»**: bloquear transparencia (✅ existe) y máscara de recorte;
   - el bote con capa de referencia.
3. **«Drawing guide»** como Procreate, con su panel de opciones:
   - cuadrícula 2D (✅ ya hay una) e isométrica;
   - perspectiva de 1, 2 o 3 puntos (✅ 1 y 2);
   - **simetría** vertical, horizontal, cuadrante y radial, con «rotacional» (✅ vertical, horizontal y cuatro lados);
   - **asistencia de dibujo**: el trazo se ciñe a la guía;
   - el eje de simetría se puede mover y girar.
4. Acordado antes:
   - **QuickShape**: mantener el lápiz quieto al acabar y el trazo se vuelve una línea, un círculo o un rectángulo perfectos;
   - **cuentagotas** manteniendo pulsado;
   - **menú rápido**;
   - **historial visual** de deshacer;
   - **time-lapse**.
5. Verificar en tableta real (lápiz y dedos) lo que no se pudo probar: tiradores de transformar, soltar cuellos, arrastrar la perspectiva.

## Fase 3 — Pinceles y texturas propios ✅ hecha (11-11-2026)
Hecho:
- **20 texturas** hechas por la app:
  - telas: denim crudo, lavado y stone, punto, felpa, canalé, waffle, malla fina, media y gruesa, pana, nylon ripstop, lona, piel, ante y borreguito;
  - efectos: grunge, ruido, papel y desgaste.
  Se ponen encima de la capa elegida, recortadas a ella y en Superponer; se ajustan escala, giro y opacidad, y se combinan.
- **Mis texturas:** subir imágenes propias.
- **Pinceles nuevos:**
  - Costuras: pespunte simple, doble y triple, pespunte de denim, zigzag, overlock, cadeneta y punto de cruz.
  - Fornituras: cremallera (del largo que quieras), cremallera fina, botones, botón jeans, remaches, ojetes, anillas y tiradores.
  - Tejidos: denim, punto, felpa, malla, canalé, pana y puño de canalé.
  - Desgaste: desgaste 3D, rotos, deshilachado y bigotes.
  - Pintar: difuminar y acuarela.
- **Mis pinceles:** importar de Procreate (.brushset/.brush), punta o grano con una imagen, guardar una copia de cualquier pincel y editarlo.

Queda: en producción hay que crear la tabla nueva (`npm run db:migrate:remote`). Probarlo en el iPad.

1. **Biblioteca de texturas** incluida, generada por nosotros, sin cortes y en alta resolución:
   - **Telas:** denim (varios lavados), punto, felpa francesa, waffle, malla (1, 2 y 3), canalé, pana, nylon, piel, ante, borreguito y lona.
   - **Efectos:** grunge, ruido, papel y desgaste.
2. **Poner una textura**:
   - se toca una y queda como capa encima de la capa activa, **ya recortada** (máscara de recorte) y en **Superposición**;
   - se puede cambiar a Luz suave u otro modo, y ajustar la escala, el giro y la opacidad;
   - **se pueden combinar** varias, una capa cada una.
3. **Subir mis texturas** (imagen) y guardarlas en la cuenta, como «Mis fornituras».
4. **Pinceles nuevos** (con presión y grano, como los actuales):
   - **Costuras:** pespunte simple, doble y triple, zigzag, overlock, cadeneta, pespunte de denim grueso y punto de cruz.
   - **Cremalleras como pincel:** los dientes se pintan a lo largo del trazo, del largo que quieras y siguiendo curvas. Las fornituras de cremallera también se estiran a cualquier largo («la cremallera no puede quedar así de corta»).
   - **Sellos:** botones, remaches, ojetes, tiradores y anillas.
   - **Tejidos:** denim, punto, malla, canalé y felpa.
   - **Desgaste 3D**, rotos (ripped fabric), deshilachado, «jean shadow» (sombra de pliegue vaquero) y puños.
   - **Difuminar** (smudge), acuarela y aerógrafo suave para sombras.
5. **Importar `.brushset`** de Procreate (punta y grano; los ajustes que se puedan). También crear y editar tus pinceles: punta, grano, separación, presión y dispersión.

## Fase 4 — Sombras y luces ✅ hecha (11-11-2026)
Hecho:
- **Panel «Luces y sombras»** (botón del círculo a medias). Genera sombras y luces automáticas por pieza: borde oscuro hacia el centro claro, brillo, pliegues en mangas y perneras, y sombra bajo costuras, capucha y bolsillo. Estilo suave, marcado o cómic; luz desde la izquierda, arriba o la derecha; intensidad.
- **Pinceles a mano:** sombra suave, sombra marcada, luz suave y brillo. Cogen solos el color de la pieza y van a sus capas.

Queda: ajustar el estilo con más ejemplos tuyos si lo quieres más parecido a la chaqueta verde.

1. **A mano:**
   - pinceles de sombra y de luz que crean o usan las capas «Sombra» (Multiplicar) y «Luz» (Superposición o Trama), ya recortadas a la prenda;
   - el color de la sombra sale solo del color de la pieza (más oscuro y algo más saturado).
2. **Automático: «Generar luces y sombras».** La app lo calcula por pieza a partir de la forma:
   - sombra en los bordes y bajo cuellos, capucha y bolsillos;
   - luz en el centro del volumen;
   - pliegues en codos, puños, bajo y entrepierna;
   - sombra de costuras y de fornituras.

   **Referencia elegida (11-11-2026):** la chaqueta verde de 3DStreetCo. Tiene:
   - degradado suave de oscuro en los bordes de cada pieza a claro en el centro, con un brillo ancho en el centro de mangas y delantero;
   - pliegues blandos en codos y puños;
   - sombra bajo la capucha y dentro del cuello;
   - contorno negro limpio y pespuntes discontinuos claros.

   Sale en capas aparte y editables, con un deslizador de intensidad y un estilo (suave, marcado, cómic). **Pásame ejemplos de los diseños finales que te gustan** y ajusto el estilo para que se parezcan.
3. Esas capas no pasan al 3D (ver arriba).

## Fase 5 — Crear gráficos, fornituras y logos dentro del Diseñador ✅ hecha (12-11-2026)
Hecho:
- **El creador de gráficos se abre encima del lienzo:** nuevo, con una plantilla o editando uno con doble toque. Al guardar, el gráfico va al lienzo.
- **12 logos tipográficos** de la hoja, con textos inventados.
- **Fornituras nuevas:**
  - cremallera de dientes gruesos;
  - 6 tiradores: rayo, lágrima, pestaña, candado, mosquetón y cinta larga;
  - botones jeans con texto, cuadrado, escudo y estrella;
  - cordón plano con texto y cordón plano con dibujo;
  - topes de cordón: barril, doble agujero y plano.

Queda: más tiradores (cordón trenzado con herrete) y cremalleras de colores ya preparadas como «Mis fornituras» de ejemplo.

1. El **creador de gráficos** (hoy en Biblioteca → Gráficos) se abre **desde el lienzo**: se crea un logo y se coloca en la prenda sin salir.
2. **Plantillas editables** sacadas de tu hoja de ejemplo, redibujadas en vectorial, estirables y con colores cambiables:
   - **Cremalleras:** 8 estilos (metal, plástico, invisible, de dientes gruesos, con cinta de colores), de cualquier largo.
   - **Tiradores:** rayo, lágrima, pestaña, candado, rayo con caja, anilla, mosquetón, cinta larga, cordón trenzado con herrete y tirador con logo.
   - **Cordones planos con texto** (lisos, con dibujo, en zigzag) y **redondos** con herretes.
   - **Topes de cordón:** barril, doble agujero y con logo.
   - **Botones:** jeans y de presión con texto, remaches, 4 agujeros (redondo, cuadrado, en forma de escudo o estrella), la caja de botones y el pin.
   - **Logos tipográficos:** 12 estilos de la hoja (contorno, óvalo, script, en círculo, apilado, con flor, estirado, repetido…), **con textos inventados**. En la hoja hay nombres que pueden ser marcas reales (p. ej. «Brainwashed», «Sinner», «Shining»): **no los copio**, hago el estilo con otro texto.
3. Todo se guarda en «Mis fornituras» o «Mis gráficos» para usarlo en cualquier diseño.

## Fase 6 — Graffiti ✅ hecha (12-11-2026)
Hecho:
- **Generador de graffiti** en el creador («Graffiti») y en el lienzo (Biblioteca → Gráficos → «+ Graffiti»).
- **Seis estilos:** burbuja, wildstyle, blockbuster, 3D, tag y cromado.
- **Efectos:** colores, degradado, contorno doble, volumen, gotas, brillos, flechas, estrellas, fondo (nube, cuadros o estrellas) e inclinación.
- **Fuentes de graffiti nuevas:** Rubik Bubbles, Beastly, Puddles y Dirt, Knewave y Titan One.
- Sale por capas editables y, al guardar, va al lienzo.

Queda: más estilos si me pasas más ejemplos (p. ej. letras entrelazadas de wildstyle hechas a mano).

**Generador de graffiti:** escribes un texto y eliges un estilo.
- **Estilos:** bubble o throw-up (como «OLOR»), wildstyle (como el rosa), blockbuster, 3D con volumen, tag con rotulador y chrome.
- **Opciones por capas editables:**
  - relleno liso o degradado;
  - brillos (los puntos y reflejos blancos);
  - contorno doble;
  - sombra o extrusión 3D;
  - gotas que chorrean (drips);
  - flechas y estrellas;
  - fondo de nube, cuadros o estrellas;
  - grosor, inclinación y lo apretadas que van las letras.

Se apoya en fuentes de graffiti (Google Fonts tiene varias de spray, marcador y burbuja) y en efectos nuestros. Sale como gráfico editable y como capa del lienzo.

## Fase 7 — Lookbook e IA: de 2D a foto realista ✅ hecha (12-11-2026)
Hecho:
- **«Foto de producto»** en el Lookbook y en el panel de IA del lienzo, donde es la opción por defecto.
- **Escenarios:** colgada en pared de hormigón, flat lay, maniquí invisible o con modelo en la calle.
- **Acabado del tejido:** lavado vintage, nuevo, acid wash o felpa gruesa.
- **«Mantener el diseño exacto».**
- El texto lleva cada pieza con su color, código, tejido y gramaje.

1. Generar **el texto para Gemini** desde el diseño (✅ `lookPrompt` ya existe), con escenarios nuevos:
   - colgada en pared de hormigón (como tu foto de la sudadera roja);
   - flat lay en el suelo;
   - maniquí invisible en estudio;
   - con modelo en la calle.
2. Opción «Mantener el diseño exacto»: le pasa a Gemini la imagen del lienzo y le dice qué no debe cambiar (logo, colores, costuras, cremallera).
3. **Texto para Gemini que ya puedes usar hoy** (adjuntando la imagen del diseño):

   > Convierte este dibujo técnico de una prenda en una fotografía de producto hiperrealista. Mantén EXACTAMENTE el diseño: la misma forma, el mismo largo y corte, los mismos colores, el logo y el texto idénticos y en el mismo sitio y tamaño, la misma cremallera, cordones, bolsillos, costuras y forro (con su estampado). No añadas ni quites ningún elemento ni texto. Tejido: [felpa de algodón gruesa con acabado lavado/vintage], con su textura real, pliegues naturales, costuras con relieve y ligero desgaste en bordes. La prenda cuelga de una percha invisible delante de una pared de hormigón gris claro, de frente, centrada, con luz natural suave de ventana desde la izquierda y sombra suave en la pared. Fotografía de catálogo, cámara 50 mm, enfoque nítido, alta resolución, sin personas, sin marcas de agua.

## Fase 8 — 3D: la prenda sola (lo más urgente del 3D) ✅ primera parte hecha (12-11-2026)
Hecho:
- **Lo pintado en el lienzo sale en la prenda 3D** del modo 3D y 2D+3D, en su sitio: colores, texturas (bien mezcladas con el color de la pieza), estampados, logos, fornituras y desgastes.
- Las líneas del dibujo y las capas de luz y sombra no pasan.
- Delantero, espalda y lado.

Queda:
- llevar también lo pintado en mangas y capucha;
- exportar la imagen o un vídeo girando;
- revisar prenda por prenda;
- el bajo raro de la sudadera en 3D.

1. Usar la forma inflada sin maniquí que ya tenemos (✅ forma «fantasma» y plató de producto).
2. **Pegar el lienzo 2D sobre la prenda 3D:**
   - delantera al delantero, trasera a la espalda, laterales a las mangas;
   - con texturas, estampados, desgastes y logos;
   - sin las capas de Luz y Sombra.
3. Giro **360°** con el dedo, encuadre automático, fondo claro y sombra en el suelo, como tu mockup azul de sudadera.
4. Botón para exportar la imagen o un vídeo girando.
5. Revisar prenda por prenda que quede bien: sudadera, camiseta, polo, camisa, bomber, puffer, pantalones y gorros.

## Fase 9 — 3D: el probador ✅ hecha (12-11-2026)
Hecho:
- El maniquí lleva el diseño completo con lo pintado en su lienzo: texturas, logos y colores. La luz la pone el 3D.
- **«Medidas de la prenda»:** cambias largo, pecho, manga… de la prenda de arriba o del pantalón, lo ves puesto y lo guardas en el diseño (pasa a la ficha técnica y al patrón).

Queda: lo pintado en mangas y capucha (igual que en la fase 8).

1. El maniquí lleva el diseño completo, con las texturas, y la luz del 3D cambia al girarlo.
2. Ver cómo quedan los diseños nuevos y corregir.
3. **Elegir las medidas de cada prenda** aquí (largo, pecho, manga, ancho…), que pasan a la ficha técnica y al patrón.

## Fase 10 — Interfaz y procesos (darle una vuelta) ✅ hecha (12-11-2026)
Hecho (12-11-2026):
- **Estilo elegido:** «Estudio + Taller técnico».
- **Letras:** Space Grotesk e IBM Plex Mono.
- **Color:** azul para las acciones y naranja en los detalles.
- **Fondo y paneles:** fondo grafito con cuadrícula de patronaje y paneles lisos. El plató 3D queda solo en la portada.
- **Densidad:** normal.

- **Borrar con «Deshacer»:** ya no se pregunta antes de borrar. Sale un aviso con «Deshacer» durante 6 s (clientes, diseños, proyectos, colecciones, materiales, proveedores, gráficos, gastos y órdenes).
- **De un proyecto a diseñar en un toque:** «Diseñar» en la ficha del proyecto y «+ Diseño» en cada tarjeta del tablero.

- **Menú nuevo en tres grupos:** Inicio · Crear (Diseños, Probador, Lookbook, Biblioteca) · Taller (Proyectos, Producción) · Negocio (Clientes, Economía).
  - «Diseños» es una galería con todos los diseños.
  - Probador y Lookbook salen en el menú.
  - La vista 3D suelta se une al Probador.

- **Iconos propios del menú:** tablero de corte, camiseta, percha, cámara, muestrario, carpeta, máquina de coser, busto y etiqueta, cada uno con un pespunte o detalle naranja.

Fase 10 hecha. (Los iconos de la columna del lienzo siguen siendo los de antes.)

1. **Estilo visual**, para que no parezca «hecho con Claude». Te enseñaré 3 o 4 propuestas para elegir (tipografías, menús, botones, iconos propios, colores, densidad), en preguntas cortas y con recomendación. Después lo aplico en toda la app.
2. **Procesos más sencillos** (te iré preguntando):
   - borrar sin ventanas de confirmación, con «Deshacer» durante unos segundos;
   - de un proyecto a su diseño en un toque, y crear el diseño desde el proyecto;
   - menos pantallas intermedias.
3. **Revisar la organización entera**:
   - ¿hacen falta todos los apartados o se juntan algunos (Proyectos y Producción, Dashboard y Economía…)?
   - ¿qué sobra del menú?
   - Te propondré un mapa nuevo antes de tocar nada.

## Fase 11 — Mejoras generales (acordadas antes) 🔄 en marcha
Hecho (12-11-2026):
- **Autoguardado:** el diseño se guarda solo a los pocos segundos de cada cambio (también el borrador, en cuanto lo tocas) y al salir del lienzo.
- **Versiones:** una automática cada 10 minutos de trabajo y las que guardes con nombre (pestaña «Versiones» de «Prenda»). Puedes volver a cualquiera; antes se guarda cómo estaba.
- **Pendiente en producción:** crear la tabla con `npm run db:migrate:remote` (migraciones 0011, 0012 y 0013). Mientras no esté, se guarda igual pero sin versiones.

- **Autoguardado** del lienzo e **historial de versiones** de cada diseño.
- **App instalable (PWA)** para iPad y móvil, que se actualiza sola.
- Que la app cargue más rápido: dividir el código, porque hoy el paquete pasa de 2 MB.
- Pruebas automáticas de lo importante (guardar, lienzo, ficha).
- **PDF de presentación** del diseño y **moodboard** o tablero de presentación.
- **Carta Pantone** en el selector de color.
- **Variantes de color en el lienzo**: duplicar el diseño en otros colores, una al lado de otra.
- **Mockups en alta resolución.** La hoja que me pasaste el 11-11-2026 sigue siendo de 1024 px (la misma que ya está metida). Cuando me pases las prendas a 2048 px, las paso con `node scripts/mockups.mjs <hoja.png>`. También faltan falda, vestido, abrigo, sobrecamisa, chaqueta de traje y leggings.
- **Pendiente técnico:** aplicar en producción la tabla de «Mis fornituras» con `npm run db:migrate:remote`.

## Fase 12 — Apps para Android y Apple (al final)
Cuando demos la app por terminada: empaquetarla con Capacitor, crear las cuentas de desarrollador y publicarla en las tiendas (ver la respuesta de arriba).

---

## Orden y por qué
1. **Fase 1 primero.** Sin el lienzo como Diseñador único, todo lo demás se construiría sobre lo antiguo.
2. **Fases 2 a 4** dan las herramientas para que las prendas queden como las de tus vídeos.
3. **Fases 5 a 7** son el contenido: fornituras, graffiti e IA.
4. **Fases 8 y 9** son el 3D. Van después porque necesitan los diseños nuevos para pegarlos en la prenda.
5. **Fase 10.** El estilo se puede adelantar en cualquier momento si quieres, porque no depende de lo demás.
6. **Fases 11 y 12**, al final.

**Lo que necesito de ti:**
- ejemplos de diseños finales con sombras y luces (fase 4);
- más ejemplos de graffiti si quieres (fase 6);
- los mockups a 2048 px (fase 11);
- tus respuestas a las preguntas de estilo (fase 10).
