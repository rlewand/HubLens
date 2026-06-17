# HubLens

**Maturity intelligence and migration planning for Autodesk BIM 360 / ACC accounts.**

HubLens helps Professional Services consultants analyze account health across hundreds or thousands of projects. It ingests ACC **Data Connector** CSV exports, stores them in PostgreSQL, scores how actively each project uses ACC services, and surfaces migration candidates with effort estimates for BIM 360 → ACC transitions.

Built as a local-first web application today, with a path to internal deployment and Autodesk Platform Services (APS) authentication.

---

## What HubLens does

| Area | Description |
|------|-------------|
| **Data ingest** | Upload a Data Connector ZIP export. HubLens parses admin and activity CSVs, including large files via streaming ingest (50 MB+ supported). |
| **Maturity scoring** | Each project receives a maturity level (0–4) per ACC module, based on configurable rules in `config/maturity-rules.yaml`. |
| **Portfolio dashboard** | Filter, sort, and compare projects across the account with KPI cards, heatmaps, and service landscape charts. |
| **Migration portfolio** | Identify BIM 360 projects suitable for ACC migration using start/end dates, team size, docs inventory, effort estimates, and migration profiles. |
| **Project detail** | Drill into a single project for module scores, evidence tables, enabled services/products, docs inventory, and migration effort breakdown. |
| **Per-user persistence** | Import batches, migration selections, and notes are stored per logged-in user in PostgreSQL. |

---

## Maturity model

HubLens scores eight core ACC modules:

| Module | Covers |
|--------|--------|
| **Docs** | Document management, sheets, transmittals |
| **Build** | RFIs, issues, submittals, project management |
| **Cost** | Budget, change orders, cost items |
| **Design Collaboration** | Revit cloud worksharing, design packages |
| **Model Coordination** | Clashes, views, coordination spaces |
| **Field** | Checklists, daily logs, locations |
| **Takeoff** | Quantification and takeoff packages |
| **Assets** | Asset registers and status tracking |

Each module is scored on a **0–4 scale**:

| Level | Label | Meaning |
|-------|-------|---------|
| 0 | Not Enabled | Service not provisioned on the project |
| 1 | Provisioned | Service enabled but no meaningful usage evidence |
| 2 | Adopted | Minimum usage threshold met |
| 3 | Active | Sustained usage with multiple users and recent activity |
| 4 | Optimized | Deep adoption across related evidence tables |

Rules are driven by record counts, distinct users, recency of activity, and related table coverage. Thresholds are editable in `config/maturity-rules.yaml` without code changes.

---

## Migration planning

The **Migration** portfolio view (default tab) focuses on **BIM 360 projects** (`acc_project = false`) and helps consultants find migration sweet spots.

**Effort estimation** is calibrated from real migration project data and considers:

- Docs inventory (folders, files, versions)
- Workflow volume (issues, RFIs, submittals, checklists, transmittals)
- Revit/C4R model counts and link complexity
- Team size and active service count

Each project receives:

- **Migration profile** — docs-only, standard, workflow-heavy, or RCW-critical
- **Consultant and client hour estimates** with a factor breakdown
- **Migration candidate flag** based on complexity and readiness signals

**Filters** help narrow the portfolio by:

- Project start and end date ranges
- Member count
- Maximum consultant/client hours
- Docs folder and file counts
- Migration profile and docs scan status
- Candidates only

Projects can be selected for migration tracking; selections sync to the database per user.

---

## Dashboard views

After importing data, the dashboard offers four portfolio views:

1. **Migration** — migration-focused table with effort, docs metrics, date columns, filters, and batch selection
2. **Features** — per-feature record counts from the Data Connector export
3. **Modules** — classic maturity heatmap table (0–4 per module)
4. **Analytics** — KPI cards, maturity distribution chart, service/product landscape, and heatmap summary

Use the status filter (active / inactive / all) and search box to narrow the portfolio across all views.

---

## Architecture

```
HubLens/
├── apps/web/                   Next.js 16 app — UI, API routes, ingest pipeline
├── packages/db/                Prisma schema and PostgreSQL client
├── packages/maturity-engine/   Rules-based maturity scoring engine
├── packages/acc-schema/        Data Connector CSV naming conventions
├── config/
│   ├── maturity-rules.yaml     Module maturity thresholds
│   └── feature-catalog.yaml    Feature-level evidence definitions
└── install.mjs                 One-step local setup script
```

**Stack:** pnpm monorepo · Next.js 16 · React 19 · PostgreSQL 16 · Prisma · Tailwind CSS

**Data flow:**

```
ACC Data Connector ZIP
        ↓
  Upload API (streaming CSV parse)
        ↓
  PostgreSQL (projects, evidence, scores)
        ↓
  Dashboard & project detail views
```

Imports run in the background after upload. The UI polls import status until the batch completes or fails. Abandoned imports (e.g. after a server restart) are automatically marked failed after 15 minutes.

---

## Requirements

| Software | Version | Notes |
|----------|---------|-------|
| [Node.js](https://nodejs.org/) | 20+ | LTS recommended |
| [PostgreSQL](https://www.postgresql.org/download/) | 16 | Running locally on port `5432` |
| [pnpm](https://pnpm.io/) | 9+ | Installed automatically via Corepack if missing |

HubLens uses a **local PostgreSQL** instance — Docker is not required.

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/rlewand/HubLens.git
cd HubLens
```

### 2. Ensure PostgreSQL is running

Install PostgreSQL 16 and confirm the service is running on `localhost:5432`.

**Windows:** PostgreSQL is typically installed to `C:\Program Files\PostgreSQL\16\`. The installer registers a Windows service that starts automatically.

**macOS:** `brew install postgresql@16 && brew services start postgresql@16`

**Linux:** Use your distribution's package manager, e.g. `sudo apt install postgresql-16`

### 3. Run the installer

```bash
node install.mjs
```

The installer will:

1. Verify Node.js 20+ and enable pnpm if needed
2. Create `apps/web/.env.local` with a random session secret
3. Create `packages/db/.env` with the database connection string
4. Create the `hublens` PostgreSQL user, database, and schema (if they do not exist)
5. Run `pnpm install`
6. Apply the Prisma schema with `pnpm db:push`

**If your `postgres` superuser password is not `password`**, set it before running the installer:

```bash
# macOS / Linux
export POSTGRES_SUPER_PASSWORD=your-postgres-password
node install.mjs
```

```powershell
# Windows PowerShell
$env:POSTGRES_SUPER_PASSWORD = "your-postgres-password"
node install.mjs
```

### 4. Start the application

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

For a production build:

```bash
pnpm build
pnpm start
```

---

## First use

1. **Sign in** — with `AUTH_MOCK=true` (default), click through the mock consultant login. No Autodesk credentials needed for local development.
2. **Upload data** — go to **Data Upload**, select your ACC Data Connector **ZIP** export, and click **Import and analyze**.
3. **Wait for import** — large account exports can take several minutes. Keep the browser tab open; progress is shown while the import runs in the background.
4. **Explore the dashboard** — once complete, the dashboard loads your project portfolio. Switch between Migration, Features, Modules, and Analytics views.
5. **Open a project** — click any project row to see module scores, evidence, services, and migration effort detail.

> Sample CSV exports are not included in the repository because they can be very large. Export data from **ACC → Data Connector** and upload the resulting ZIP.

---

## Configuration

Environment files are created automatically by `install.mjs`. To change settings later, edit `apps/web/.env.local`.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://hublens:hublens@localhost:5432/hublens?schema=hublens` | PostgreSQL connection string |
| `SESSION_SECRET` | *(auto-generated)* | Signs user session cookies |
| `AUTH_MOCK` | `true` | Bypass APS OAuth for local development |
| `APS_CLIENT_ID` | *(empty)* | Autodesk Platform Services app ID |
| `APS_CLIENT_SECRET` | *(empty)* | APS app secret |
| `APS_CALLBACK_URL` | `http://localhost:3000/api/auth/callback` | OAuth redirect URI |
| `MAX_UPLOAD_SIZE_MB` | `2048` | Maximum ZIP upload size |

For production deployment, set `AUTH_MOCK=false` and configure APS OAuth credentials. Register your APS app at [aps.autodesk.com](https://aps.autodesk.com/).

Optional APS variables for live Docs inventory scanning during ingest are documented in `apps/web/.env.example`.

---

## Useful commands

| Command | Description |
|---------|-------------|
| `node install.mjs` | First-time setup (env files, database, dependencies, schema) |
| `pnpm dev` | Start development server (regenerates Prisma client first) |
| `pnpm build` | Production build |
| `pnpm start` | Run production server |
| `pnpm db:push` | Sync Prisma schema to the database |
| `pnpm db:generate` | Regenerate Prisma client after schema changes |
| `pnpm db:studio` | Open Prisma Studio (database browser) |
| `pnpm typecheck` | Type-check all packages |

---

## Troubleshooting

### Installer cannot connect to PostgreSQL

- Confirm the PostgreSQL service is running.
- Verify port `5432` is not blocked or used by another instance.
- Set `POSTGRES_SUPER_PASSWORD` to your actual `postgres` superuser password.

### `Unknown argument …` Prisma error after a schema update

Regenerate the client and restart the dev server:

```bash
pnpm db:generate
pnpm dev
```

### Import failed or stuck in "processing"

If the dev server was stopped mid-import, wait 15 minutes or restart the app — stale imports are marked failed automatically. Re-upload the ZIP from **Data Upload**.

### Blank page at localhost:3000

Ensure `pnpm dev` is running, then visit [http://localhost:3000/login](http://localhost:3000/login) directly.

### Large CSV file errors

HubLens streams CSV files larger than 50 MB during ingest. If an import fails on a specific file, check the error message on the upload page or in the dashboard banner.

---

## License

Internal Autodesk Professional Services tool. Not for external distribution unless otherwise authorized.
