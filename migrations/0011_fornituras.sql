-- Fornituras propias de cada cuenta (cremalleras, tiradores, botones, parches… guardados para usar en cualquier diseño)
CREATE TABLE hardware_presets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  -- El detalle entero (tipo, estilo, colores, tirador, logo, forma…) en JSON
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX hardware_presets_user ON hardware_presets (user_id, created_at);
