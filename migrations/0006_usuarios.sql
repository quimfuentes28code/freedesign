-- Cuentas de usuario: cada cuenta (particular o empresa) tiene su propio espacio privado.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  -- Contraseña con PBKDF2-SHA256 (sal y hash en base64); nunca se guarda en claro
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  -- particular o empresa
  account_type TEXT NOT NULL DEFAULT 'particular',
  -- Nombre de la persona (en empresas, la persona de contacto)
  name TEXT NOT NULL,
  -- Solo empresas
  company_name TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Sesiones abiertas. Se guarda el hash del token, no el token (que solo tiene la cookie del navegador)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX sessions_user ON sessions (user_id);

-- Cada dato pertenece a una cuenta. Las partes de un proyecto (archivos, materiales, costes, tareas)
-- cuelgan del proyecto y no necesitan columna propia.
ALTER TABLE clients ADD COLUMN user_id TEXT REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE suppliers ADD COLUMN user_id TEXT REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE materials ADD COLUMN user_id TEXT REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE designs ADD COLUMN user_id TEXT REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE artworks ADD COLUMN user_id TEXT REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE collections ADD COLUMN user_id TEXT REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE projects ADD COLUMN user_id TEXT REFERENCES users (id) ON DELETE CASCADE;

CREATE INDEX clients_user ON clients (user_id);
CREATE INDEX suppliers_user ON suppliers (user_id);
CREATE INDEX materials_user ON materials (user_id);
CREATE INDEX designs_user ON designs (user_id);
CREATE INDEX artworks_user ON artworks (user_id);
CREATE INDEX collections_user ON collections (user_id);
CREATE INDEX projects_user ON projects (user_id);
