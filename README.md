# FreeDesign

Herramienta de taller para diseñar y fabricar prendas personalizadas: clientes con sus medidas, diseñador de prendas, proyectos, producción (fichas técnicas y tech packs), biblioteca de materiales y economía. Incluye una vista previa 3D de la prenda sobre un maniquí animado.

Cada persona o empresa crea su cuenta y tiene su propio espacio privado.

Apartados: **Dashboard · Clientes · Diseñador · Proyectos · Producción · Biblioteca · Economía** (de momento están hechos el Dashboard, Clientes, el Diseñador 2D con estampados, Proyectos, Producción (fichas técnicas y órdenes de fabricación), la Biblioteca, Economía (cobros, gastos generales y rentabilidad) y la vista previa 3D).

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
git pull                             # partir de lo último del otro
# ... trabajar (con Claude) ...
npm run build                        # comprobar que compila
git commit -am "Describe el cambio"  # guardar
git pull --rebase && git push        # traer lo del otro y subir a main
```

Trabajamos directamente en `main`, sin ramas ni Pull Requests. Al subir a `main`, Cloudflare despliega automáticamente a producción.

## Despliegue en Cloudflare (configuración inicial, una vez)

1. En el panel de Cloudflare: **Workers & Pages → Create → Import a repository** y elige `freedesign`.
2. Comando de build: `npm run build`. Comando de deploy: `npx wrangler deploy`.
3. Invita a tu compañero a la cuenta en **Manage Account → Members**.

Las normas detalladas para trabajar (y para Claude) están en [CLAUDE.md](CLAUDE.md).

## Base de datos en la nube (configuración inicial, una vez)

Los datos (clientes, materiales, proveedores…) se guardan en **Cloudflare D1** y las fotos en **Cloudflare Workers KV**. En local no hace falta nada: `npm run dev` crea una base de datos y un almacén locales en `.wrangler/` y aplica las migraciones de `migrations/`.

Para publicarla, quien tenga la cuenta de Cloudflare:

1. Crear la base de datos y copiar el `database_id` que devuelve en `wrangler.jsonc`:
   ```bash
   npx wrangler d1 create freedesign
   ```
2. Crear el almacén de archivos (fotos de la biblioteca, y más adelante bocetos y estampados):
   ```bash
   npx wrangler kv namespace create freedesign-files   # copiar el id que devuelve en wrangler.jsonc
   ```
3. Crear las tablas en la base de datos de producción:
   ```bash
   npm run db:migrate:remote
   ```

## Cuentas de usuario

Cualquiera puede crear una cuenta en `/registro` (particular o empresa) y cada cuenta tiene su propio espacio privado: sus clientes, diseños, biblioteca y proyectos. En local, crea una cuenta de prueba la primera vez que abras la app (la base de datos local es independiente de la de producción).
