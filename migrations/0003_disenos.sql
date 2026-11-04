-- Diseños: cada prenda diseñada en el Diseñador (a partir de una prenda base del catálogo).
CREATE TABLE designs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- Prenda base del catálogo (sudadera, camiseta, pantalon, bomber…)
  template TEXT NOT NULL,
  -- Cliente para quien es (vacío si es para la marca propia o aún no se sabe)
  client_id TEXT REFERENCES clients (id) ON DELETE SET NULL,
  -- Opciones, colores y materiales por pieza, notas (JSON)
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX designs_updated ON designs (updated_at DESC);
CREATE INDEX designs_client ON designs (client_id);
