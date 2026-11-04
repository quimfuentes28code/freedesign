-- Gráficos: logos, ilustraciones y textos para estampar (subidos o creados en el creador de estampados).
CREATE TABLE artworks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- Imagen en R2 (PNG, JPG, WebP o SVG) que se coloca sobre las prendas
  file TEXT NOT NULL,
  -- Tamaño natural de la imagen (para mantener la proporción)
  width REAL NOT NULL,
  height REAL NOT NULL,
  -- Capas del creador (JSON) para poder volver a editarlo; vacío si es una imagen subida
  data TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX artworks_updated ON artworks (updated_at DESC);
