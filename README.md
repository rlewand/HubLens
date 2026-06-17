# HubLens

Professional Services maturity intelligence for **Autodesk BIM 360 / ACC** accounts, powered by Data Connector CSV/ZIP exports.

## Prerequisites

| Requirement | Version |
|-------------|---------|
| [Node.js](https://nodejs.org/) | 20 or later |
| [pnpm](https://pnpm.io/installation) | 9 or later |
| PostgreSQL | 16 (via Docker or local install) |

Optional: [Docker Desktop](https://www.docker.com/products/docker-desktop/) for the easiest database setup.

## Install on a new machine

### 1. Clone the repository

```bash
git clone https://github.com/rlewand/HubLens.git
cd HubLens
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

HubLens reads env vars from **`apps/web/.env.local`** (Next.js). Prisma CLI commands use **`packages/db/.env`**.

**Windows (PowerShell):**

```powershell
Copy-Item apps\web\.env.example apps\web\.env.local
Copy-Item packages\db\.env.example packages\db\.env
```

**macOS / Linux:**

```bash
cp apps/web/.env.example apps/web/.env.local
cp packages/db/.env.example packages/db/.env
```

Edit both files if your database credentials differ from the defaults.

Generate a secure session secret (recommended):

```bash
openssl rand -base64 32
```

Paste the result into `SESSION_SECRET` in `apps/web/.env.local`.

For local development, keep `AUTH_MOCK=true` to sign in without Autodesk APS credentials.

### 4. Start PostgreSQL

**Option A — Docker (recommended)**

Works on Windows, macOS, and Linux:

```bash
pnpm docker:up
```

This starts PostgreSQL 16 with:

- User: `hublens`
- Password: `hublens`
- Database: `hublens`
- Port: `5432`

**Option B — Local PostgreSQL (Windows, no Docker)**

If PostgreSQL 16 is already installed:

```powershell
$env:POSTGRES_SUPER_PASSWORD = "your-postgres-superuser-password"
pnpm setup:db
```

**Option C — Local PostgreSQL (macOS / Linux)**

Create the role, database, and schema manually (adjust passwords as needed):

```sql
CREATE ROLE hublens LOGIN PASSWORD 'hublens';
CREATE DATABASE hublens OWNER hublens;
\c hublens
CREATE SCHEMA IF NOT EXISTS hublens AUTHORIZATION hublens;
GRANT ALL ON SCHEMA hublens TO hublens;
```

Ensure `DATABASE_URL` in your `.env` files matches your connection details.

### 5. Apply the database schema

```bash
pnpm db:push
```

This syncs the Prisma schema to PostgreSQL and generates the Prisma client.

### 6. Run the application

**Development:**

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

**Production build:**

```bash
pnpm build
pnpm start
```

The production server also listens on port 3000 by default.

### 7. Import data

1. Sign in (mock consultant when `AUTH_MOCK=true`).
2. Go to **Data Upload**.
3. Select your ACC **Data Connector ZIP** export.
4. Click **Import and analyze**.

Large exports can take several minutes. Keep the browser tab open while the import runs in the background.

> **Note:** Sample CSV exports are not included in the repository (they can be very large). Obtain exports from ACC Data Connector and upload them via the UI.

## Project structure

```
HubLens/
├── apps/web/                  Next.js dashboard, API, and upload UI
├── packages/db/               Prisma schema and PostgreSQL client
├── packages/maturity-engine/  Configurable maturity scoring rules
├── packages/acc-schema/       CSV naming and column conventions
├── config/maturity-rules.yaml Maturity thresholds per ACC module
├── docker-compose.yml         PostgreSQL for local development
├── scripts/setup-local-db.ps1 Windows PostgreSQL bootstrap script
└── PROJECT_PROMPT.md          Full product specification
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | JWT session signing secret |
| `AUTH_MOCK` | Dev | `true` = mock login without APS |
| `APS_CLIENT_ID` | Prod | Autodesk Platform Services app ID |
| `APS_CLIENT_SECRET` | Prod | APS app secret |
| `APS_CALLBACK_URL` | Prod | OAuth callback URL |
| `MAX_UPLOAD_SIZE_MB` | No | ZIP upload limit (default `2048`) |

See [`.env.example`](./.env.example) and [`apps/web/.env.example`](./apps/web/.env.example) for optional APS Docs scanning variables.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Generate Prisma client and start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm docker:up` | Start PostgreSQL container |
| `pnpm docker:down` | Stop PostgreSQL container |
| `pnpm db:push` | Sync Prisma schema to database |
| `pnpm db:generate` | Regenerate Prisma client after schema changes |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm setup:db` | Bootstrap PostgreSQL on Windows (no Docker) |
| `pnpm typecheck` | Type-check all packages |

## Troubleshooting

### `Unknown argument startDate` (or similar Prisma errors) after schema changes

Regenerate the client and restart the dev server:

```bash
pnpm db:generate
# stop the dev server, then:
pnpm dev
```

### Import stuck in "processing"

Imports abandoned by a server restart are automatically marked failed after 15 minutes. Upload the ZIP again from **Data Upload**.

### Blank page at localhost:3000

Ensure the dev server is running (`pnpm dev`) and visit [http://localhost:3000/login](http://localhost:3000/login) directly.

### Docker pull blocked

Use Option B or C above to run PostgreSQL without Docker, then update `DATABASE_URL` accordingly.

## Features

- Mock and APS-ready authentication
- ZIP upload ingest with streaming support for large CSV files
- Project maturity scoring across 8 core ACC modules
- Migration portfolio view with date, effort, and docs filters
- Project detail view with evidence and scoring rationale

## Specification

See [PROJECT_PROMPT.md](./PROJECT_PROMPT.md) for the full roadmap and acceptance criteria.
