-- Biblioteca: proveedores y materiales/recursos (tejidos, fornituras, hilos, etiquetas, estampados…).

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX suppliers_name ON suppliers (name COLLATE NOCASE);

CREATE TABLE materials (
  id TEXT PRIMARY KEY,
  -- tejido, fornitura, hilo, etiqueta, estampado, acabado, packaging, otro
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- Referencia o código del proveedor
  reference TEXT NOT NULL DEFAULT '',
  supplier_id TEXT REFERENCES suppliers (id) ON DELETE SET NULL,
  -- Precio aproximado en euros por unidad de venta (metro, unidad, kg, rollo…)
  price REAL,
  price_unit TEXT NOT NULL DEFAULT 'unidad',
  color TEXT NOT NULL DEFAULT '',
  -- Solo tejidos: composición (p. ej. 80% algodón 20% poliéster), gramaje (g/m²) y ancho (cm)
  composition TEXT NOT NULL DEFAULT '',
  weight_gsm REAL,
  width_cm REAL,
  -- Palabras clave separadas por comas
  tags TEXT NOT NULL DEFAULT '',
  -- Foto guardada en R2 (clave del archivo), vacía si no tiene
  photo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX materials_category ON materials (category, name COLLATE NOCASE);
CREATE INDEX materials_supplier ON materials (supplier_id);
