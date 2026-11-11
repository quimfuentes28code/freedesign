-- Texturas y pinceles propios de cada cuenta (subidos o importados de Procreate) para usar en cualquier lienzo
CREATE TABLE lienzo_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  -- 'textura' o 'pincel'
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  -- Imagen de la textura o de la punta del pincel (clave de Workers KV; vacía si el pincel usa una punta de la app)
  file TEXT NOT NULL DEFAULT '',
  -- Grano del pincel (clave de Workers KV), si tiene
  grain TEXT,
  -- Ajustes del pincel (tamaño, separación, presión…) o de la textura, en JSON
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX lienzo_assets_user ON lienzo_assets (user_id, kind, created_at);
