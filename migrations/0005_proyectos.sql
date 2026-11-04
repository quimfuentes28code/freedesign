-- Proyectos: cada prenda es un proyecto independiente, agrupado por cliente o por colección.

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- Temporada o drop (p. ej. «SS27», «Drop 01»)
  season TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- idea, boceto, diseno, muestra, aprobado, produccion, entregado, pausa, cancelado
  status TEXT NOT NULL DEFAULT 'idea',
  client_id TEXT REFERENCES clients (id) ON DELETE SET NULL,
  collection_id TEXT REFERENCES collections (id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  -- Fecha de entrega prevista (AAAA-MM-DD) o vacío
  due_date TEXT NOT NULL DEFAULT '',
  -- Precio de venta previsto (€), para calcular el margen
  price REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX projects_status ON projects (status);
CREATE INDEX projects_client ON projects (client_id);
CREATE INDEX projects_collection ON projects (collection_id);

-- Bocetos, referencias, fotos y diseños finales (imágenes en R2)
CREATE TABLE project_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  -- boceto, referencia, foto, final, otro
  category TEXT NOT NULL,
  file TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX project_files_project ON project_files (project_id);

-- Materiales de la Biblioteca usados y su cantidad
CREATE TABLE project_materials (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
  quantity REAL NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX project_materials_project ON project_materials (project_id);

-- Otros costes (confección, estampación, envío…)
CREATE TABLE project_costs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX project_costs_project ON project_costs (project_id);

CREATE TABLE project_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX project_tasks_project ON project_tasks (project_id);

-- Los diseños del Diseñador pueden pertenecer a un proyecto
ALTER TABLE designs ADD COLUMN project_id TEXT REFERENCES projects (id) ON DELETE SET NULL;
CREATE INDEX designs_project ON designs (project_id);
