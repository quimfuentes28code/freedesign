-- Textura de un material de la Biblioteca en el Diseñador y el 3D: id de un material del catálogo integrado
-- (p. ej. 'cat:felpa-perchada'), o vacío (se ve con el de por defecto de cada pieza)
ALTER TABLE materials ADD COLUMN look TEXT NOT NULL DEFAULT '';
