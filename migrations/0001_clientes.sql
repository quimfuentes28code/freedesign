-- Clientes: datos personales, preferencias y medidas corporales (reutilizables en sus prendas).
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  birthday TEXT NOT NULL DEFAULT '',
  -- Estilo, colores y tejidos que le gustan, alergias a materiales, etc.
  preferences TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  -- Medidas en cm (JSON: { "altura": 172, "pecho": 92, ... }) y fecha en que se tomaron
  measurements TEXT NOT NULL DEFAULT '{}',
  measured_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX clients_name ON clients (name COLLATE NOCASE);
