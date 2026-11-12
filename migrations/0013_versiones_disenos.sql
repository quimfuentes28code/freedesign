-- Historial de versiones de cada diseño: copias de sus datos (con las capas del lienzo, que son claves de KV).
-- Automáticas (cada 10 minutos de trabajo, al guardar) o con nombre («Guardar versión»).
CREATE TABLE design_versions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  design_id TEXT NOT NULL,
  -- Nombre que le ha puesto la persona; vacío en las automáticas
  label TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX design_versions_design ON design_versions (design_id, user_id, created_at);
