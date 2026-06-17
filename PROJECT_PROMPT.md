# HubLens — Project Creation Prompt

## Role & Context

You are a senior full-stack architect and UX designer building **HubLens**, an internal Professional Services tool for **Autodesk BIM 360 / Autodesk Construction Cloud (ACC)** consultants.

**Primary user:** Principal Professional Services Consultant assessing customer account health across many projects.

**Primary goal (Phase 1):** A **Project Maturity Dashboard** that ingests ACC Data Connector CSV exports, stores them in a database, and lets consultants **filter projects** and **score maturity** per service/module — with a polished, enterprise-grade UI suitable for client-facing workshops.

**Deployment path:** Local-first desktop/web app → later internal hosted web app. All user-specific state must be tied to an **Autodesk account login**.

---

## Product Vision

HubLens answers: *"Across this ACC/BIM 360 account, which projects are actually using which services — and how mature is that usage?"*

Maturity is not binary. For each project and each service/module, classify usage into levels such as:

| Level | Label | Meaning |
|-------|--------|---------|
| 0 | **Not Enabled** | Service/product not active on project |
| 1 | **Provisioned** | Enabled in admin (`project_services` / `project_products`) but no meaningful usage data |
| 2 | **Adopted** | Records exist in the module's data tables (e.g., RFIs created, issues logged) |
| 3 | **Active** | Sustained usage: records + recent activity + multiple users (configurable thresholds) |
| 4 | **Optimized** | Advanced signals: workflows in use, integrations, breadth across related tables |

The dashboard must make this visible at a glance, with drill-down to evidence.

---

## Recommended Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Frontend** | Next.js 15 (App Router) + TypeScript | SSR, routing, API routes, easy internal deploy |
| **UI** | Tailwind CSS + shadcn/ui + Lucide icons | Clean, modern, enterprise look without custom design system overhead |
| **Charts** | Recharts or Tremor | Maturity distribution, heatmaps, trends |
| **Backend** | Next.js Route Handlers / Server Actions | Single repo, local dev simplicity |
| **Database** | PostgreSQL 16 | Matches `schema_create_postgres.sql` in sample data |
| **ORM** | Prisma | Type-safe schema, migrations |
| **Auth** | Autodesk Platform Services (APS) OAuth 2.0 + PKCE | User logs in with Autodesk ID; sessions scoped per user |
| **File ingest** | Server-side CSV parser (Papa Parse or fast-csv) | Bulk upload of Data Connector exports |
| **Job processing** | Background ingest queue (BullMQ + Redis, or in-process for v1) | Large CSV sets (~300+ files) |
| **Local dev** | Docker Compose (Postgres + optional Redis) | One-command startup |

**Design language:** Subtle, confident, consulting-grade — dark navy/slate neutrals, Autodesk blue accent `#0696D7`, generous whitespace, crisp typography. No playful or "startup demo" aesthetics.

---

## Source Data (Sample & Schema)

**Location:** `Input/` (relative to repo root)

### CSV export structure

- ~**360 CSV files** from ACC Data Connector
- **Naming convention:** `{module}_{table}.csv`  
  Examples: `admin_projects.csv`, `admin_project_services.csv`, `rfis_rfis.csv`, `issues_issues.csv`
- **Metadata:** `metadata.csv` (export timestamp, region, optional date range)
- **Common join keys:**
  - `bim360_account_id` (UUID)
  - `bim360_project_id` / `project_id` (UUID)

### Domain modules (25+)

`admin`, `activities`, `assets`, `checklists`, `clashes`, `cost`, `dailylogs`, `estimates`, `forms`, `iq`, `issues`, `issuesbim360`, `locations`, `markups`, `meetingminutes`, `packages`, `photos`, `relationships`, `reviews`, `rfis`, `schedule`, `sheets`, `submittals`, `submittalsacc`, `takeoff`, `transmittals`

### Schema references

- `Input/schemas/schema.json` — master schema (all modules/tables/columns)
- `Input/schemas/{module}.json` — per-module schema
- `Input/schemas/schema_create_postgres.sql` — PostgreSQL DDL (`acc_data_schema`)
- `Input/schemas/schema_create_mssql.sql` — MSSQL variant

**Important:** Do not blindly import all 300+ tables into the app DB on day one. Use a **two-tier data model**:

1. **HubLens operational schema** (users, sessions, uploads, maturity scores, saved filters, notes)
2. **Ingested ACC data schema** (mirror key tables needed for maturity + store raw/staging for extensibility)

---

## Phase 1 Scope — MVP Dashboard

### 1. Authentication (Autodesk-linked)

- Implement APS OAuth 2.0 (3-legged for web)
- On login, create/update `users` record keyed by Autodesk `user_id`
- All uploads, analyses, saved views, and consultant notes are **scoped to the logged-in user**
- Store refresh tokens securely (encrypted at rest)
- Environment variables: `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_CALLBACK_URL`
- Local dev: `AUTH_MOCK=true` bypass when APS credentials are unavailable

### 2. Data Upload & Ingest

- **Upload UI:** Drag-and-drop folder or ZIP of CSV exports
- Validate:
  - Presence of `metadata.csv`
  - Expected filename patterns (`{module}_{table}.csv`)
  - Column headers against `schema.json` (warn on mismatch, don't hard-fail unless critical)
- Create an `import_batches` record per upload (user, timestamp, file count, status, account_id detected)
- Parse and load into PostgreSQL:
  - **Priority tables for MVP maturity:**
    - `admin_accounts`, `admin_projects`, `admin_account_services`, `admin_project_services`, `admin_project_products`
    - `admin_project_users`, `admin_companies`, `admin_business_units`
    - Per-module fact tables with `bim360_project_id`: at minimum `issues_issues`, `rfis_rfis`, `submittalsacc_items`, `sheets_sheets`, cost tables, `takeoff_*`, `clashes_*`, `forms_*`, `checklists_*`, `transmittals_*`, `schedule_*`, `assets_*`
  - Store row counts and last-activity timestamps per project per module
- Show ingest progress, errors, and summary (projects found, date range, region)

### 3. Maturity Engine (configurable rules)

Build a **rules-based maturity scorer** (YAML/JSON config, not hardcoded magic).

**Per service/module, compute:**

- `enabled` — from `admin_project_services` / `admin_project_products` (status = `active`)
- `record_count` — rows in module tables for project
- `distinct_users` — unique `created_by` / activity users
- `last_activity_at` — max timestamp in module
- `maturity_level` (0–4) — from thresholds in config

**Service mapping (BIM 360 services → data evidence):**

| Service / Product | Admin source | Usage evidence tables |
|-------------------|--------------|------------------------|
| documentManagement / docs | `project_services`, `project_products` | `sheets_*`, `transmittals_*`, markups |
| projectManagement / build | `project_services`, `project_products` | `rfis_*`, `submittalsacc_*`, `issues_*` |
| costManagement / cost | `project_services`, `project_products` | `cost_*` |
| designCollaboration | `project_services`, `project_products` | `clashes_*`, coordination data |
| modelCoordination | `project_products` | `clashes_*`, `issues_*` |
| fieldManagement / field | `project_services` | `forms_*`, `dailylogs_*`, `checklists_*` |
| takeoff | `project_products` | `takeoff_*` |
| assets | `project_services` | `assets_*` |
| insight | `project_services`, `project_products` | activity tables |

Persist computed scores in `project_maturity_scores` (batch_id, project_id, module, level, metrics JSON, computed_at).

### 4. Dashboard UI (professional, filter-rich)

**Layout:**

- Top bar: HubLens logo, account name, export date, user menu (Autodesk profile)
- Left sidebar: Navigation (Dashboard, Uploads, Settings)

**Main dashboard sections:**

#### A. Portfolio KPI cards

- Total projects (active / archived)
- % projects at maturity ≥ 2 per key module
- Account-level services enabled vs. used
- Last data refresh date

#### B. Filter panel (sticky)

- Project status: `active`, `archived`, `pending`
- ACC vs. BIM 360 (`acc_project` flag)
- Business unit
- Country / region
- Project type, classification (`production`, `sample`, etc.)
- Services enabled (multi-select)
- Maturity level range (per module or overall)
- Text search (name, job number)
- Date range (project `created_at`, `last_sign_in`)

#### C. Project table (primary view)

Sortable, paginated data grid with columns:

- Project name + job number
- Status badge
- Member / company counts
- **Maturity heatmap row** — one cell per module (color-coded 0–4)
- Overall maturity score (weighted average)
- Last activity
- Actions: View detail

#### D. Visual analytics

- Stacked bar: maturity distribution by module
- Matrix/heatmap: projects × modules

#### E. Project detail drawer/page

- Project metadata from `admin_projects`
- Enabled services & products timeline
- Per-module maturity breakdown with **evidence** (record counts, sample dates, top users)
- Consultant notes field (saved per user per project)

### 5. Database — HubLens tables (minimum)

```
users (id, autodesk_user_id, email, name, created_at)
import_batches (id, user_id, account_id, status, file_count, metadata_json, created_at)
projects (denormalized snapshot from admin_projects + batch_id)
project_maturity_scores (batch_id, project_id, module, level, metrics_json)
saved_filters (user_id, name, filter_json)
project_notes (user_id, project_id, note, updated_at)
```

Use PostgreSQL schema `hublens` separate from `acc_data_schema` (ingested raw data).

---

## Non-Functional Requirements

- **Performance:** Dashboard loads < 2s for ~7,000 projects (paginate + pre-aggregate)
- **Security:** No secrets in repo; validate all uploads; max upload size configurable
- **Accessibility:** WCAG 2.1 AA for color contrast (maturity colors must be distinguishable)
- **i18n-ready:** UI strings externalized (German project names appear in data)
- **Auditability:** Show *why* a maturity score was assigned (transparent rules)
- **Extensibility:** Maturity rules in config file; API ingestion stub interface for Phase 2

---

## Phase 2 Hooks (stub, don't build yet)

- APS Data Connector API pull (replace manual CSV upload)
- Multi-user collaboration / shared account workspaces
- Export PDF/PowerPoint maturity report for client workshops
- Trend analysis across multiple import batches
- Custom maturity frameworks per customer

---

## Project Structure

```
HubLens/
├── apps/web/                 # Next.js app
├── packages/
│   ├── db/                   # Prisma schema + migrations
│   ├── maturity-engine/      # Scoring rules + calculators
│   └── acc-schema/           # Generated types from schema.json
├── config/
│   └── maturity-rules.yaml
├── docker-compose.yml
├── Input/                    # Sample CSVs (gitignored in prod)
└── README.md
```

---

## Acceptance Criteria (Phase 1 Done)

1. User can log in with Autodesk account (or mock auth in dev)
2. User can upload the sample `Input/` CSV folder and see successful ingest
3. Dashboard lists all projects from `admin_projects.csv` with working filters
4. Each project shows maturity heatmap for at least **8 core modules** (Docs, Build/PM, Cost, DC, MC, Field, Takeoff, Assets)
5. Clicking a project shows evidence behind each score
6. Data persists across sessions per logged-in user
7. UI looks **professional enough to share in a client executive briefing**
8. `README.md` documents local setup in < 10 steps

---

## Seed Data for Development

Use the provided sample at `Input/`:

- Account ID: `46349399-0441-4a3f-8acc-38cb6966884a`
- ~6,700+ projects in `admin_projects.csv`
- Export metadata: `metadata.csv` (region EMEA, created 2026-06-10)

The app must work against this real dataset without mock data.

---

## Maturity Rules Starter

See `config/maturity-rules.yaml` for the live configuration.
