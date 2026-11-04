-- Producción: ficha técnica (tech pack) de cada proyecto y órdenes de fabricación.

-- Una ficha por proyecto. Casi todo se genera a partir del diseño, el cliente y los materiales;
-- aquí solo se guarda lo que se ha elegido o retocado a mano (en JSON, ver src/shared/production.ts).
CREATE TABLE tech_packs (
  project_id TEXT PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Diseño del proyecto que describe la ficha
  design_id TEXT REFERENCES designs (id) ON DELETE SET NULL,
  data TEXT NOT NULL DEFAULT '{}',
  -- Sube en cada guardado, para saber qué versión tiene el taller
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX tech_packs_user ON tech_packs (user_id);

-- Órdenes de fabricación: una muestra o una tanda de producción de un proyecto, con sus pasos.
CREATE TABLE production_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  -- muestra | produccion
  kind TEXT NOT NULL DEFAULT 'produccion',
  -- Taller: un proveedor de la Biblioteca o un nombre libre (p. ej. «Nuestro taller»)
  supplier_id TEXT REFERENCES suppliers (id) ON DELETE SET NULL,
  workshop TEXT NOT NULL DEFAULT '',
  -- Unidades por talla, en JSON: {"M": 3, "L": 2}
  quantities TEXT NOT NULL DEFAULT '{}',
  start_date TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  -- Pasos en JSON: [{"id", "label", "done", "doneAt"}]
  steps TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX production_orders_user ON production_orders (user_id);
CREATE INDEX production_orders_project ON production_orders (project_id);
