# FreeDesign

Herramienta de taller para diseñar y fabricar prendas personalizadas: clientes con sus medidas, diseñador de prendas, proyectos, producción (fichas técnicas y tech packs), biblioteca de materiales y economía. Incluye una vista previa 3D de la prenda sobre un maniquí animado.

Apartados: **Dashboard · Clientes · Diseñador · Proyectos · Producción · Biblioteca · Economía** (de momento están hechos el Dashboard básico, Clientes y la vista previa 3D; el resto se irá construyendo por fases).

## Empezar (para cada uno de nosotros, una sola vez)

1. **Git configurado** con tu nombre y email:
   ```bash
   git config --global user.name "Tu Nombre"
   git config --global user.email "tu@email.com"
   ```
2. **Clave SSH en GitHub**: crea una con `ssh-keygen -t ed25519 -C "tu@email.com"` y pega el contenido de `~/.ssh/id_ed25519.pub` en GitHub → Settings → SSH and GPG keys.
3. **Clonar e instalar**:
   ```bash
   git clone git@github.com:quimfuentes28code/freedesign.git
   cd freedesign
   npm install
   npm run dev
   ```
   Abre http://localhost:5173.

> Más fácil: abre la carpeta clonada con Claude Code y pídele "prepara el proyecto para que funcione en mi ordenador".

## Flujo de trabajo diario

```text
git checkout main && git pull        # partir de lo último
git checkout -b feature/mi-tarea     # rama nueva
# ... trabajar (con Claude) ...
npm run build                        # comprobar que compila
git push -u origin feature/mi-tarea  # subir la rama
# abrir Pull Request en GitHub → el otro revisa la preview → merge
```

Al fusionar en `main`, Cloudflare despliega automáticamente a producción. Cada rama tiene su propia URL de preview.

## Despliegue en Cloudflare (configuración inicial, una vez)

1. En el panel de Cloudflare: **Workers & Pages → Create → Import a repository** y elige `freedesign`.
2. Comando de build: `npm run build`. Comando de deploy: `npx wrangler deploy`.
3. Invita a tu compañero a la cuenta en **Manage Account → Members**.

Las normas detalladas para trabajar (y para Claude) están en [CLAUDE.md](CLAUDE.md).

## Base de datos en la nube (configuración inicial, una vez)

Los datos (clientes, y más adelante proyectos, materiales…) se guardan en **Cloudflare D1**. En local no hace falta nada: `npm run dev` crea una base de datos local en `.wrangler/` y aplica las migraciones de `migrations/`.

Para publicarla, quien tenga la cuenta de Cloudflare:

1. Crear la base de datos y copiar el `database_id` que devuelve en `wrangler.jsonc`:
   ```bash
   npx wrangler d1 create freedesign
   ```
2. Crear las tablas en la base de datos de producción:
   ```bash
   npm run db:migrate:remote
   ```
3. **Proteger la app** para que solo entremos nosotros: en el panel de Cloudflare, **Zero Trust → Access → Applications → Add an application → Self-hosted**, con el dominio de la app y una política que permita solo nuestros correos. Poner esos mismos correos (separados por comas) en `ALLOWED_EMAILS` de `wrangler.jsonc`.
