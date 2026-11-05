-- Paleta de colores de la marca de cada cuenta (JSON: [{ hex, name, code }])
ALTER TABLE users ADD COLUMN brand_colors TEXT NOT NULL DEFAULT '[]';
