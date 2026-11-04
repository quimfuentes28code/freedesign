-- Economía: cobros de cada proyecto y gastos generales del taller.

-- Cobros de un proyecto (señal, pago final…). Lo cobrado frente al precio da lo pendiente.
CREATE TABLE project_payments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  amount REAL NOT NULL DEFAULT 0,
  -- AAAA-MM-DD
  date TEXT NOT NULL,
  -- transferencia | bizum | efectivo | tarjeta | otro
  method TEXT NOT NULL DEFAULT 'transferencia',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX project_payments_project ON project_payments (project_id);

-- Gastos que no son de un proyecto concreto: alquiler, máquinas, software, marketing…
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'otro',
  concept TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  supplier_id TEXT REFERENCES suppliers (id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX expenses_user_date ON expenses (user_id, date);
