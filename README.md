# HubLens

ACC/BIM 360 project maturity dashboard from Data Connector CSV/ZIP exports.

## Requirements

- [Node.js](https://nodejs.org/) 20+
- [PostgreSQL](https://www.postgresql.org/download/) 16 (running on `localhost:5432`)

## Install

```bash
git clone https://github.com/rlewand/HubLens.git
cd HubLens
node install.mjs
pnpm dev
```

If your `postgres` superuser password is not `password`, set it first:

```bash
export POSTGRES_SUPER_PASSWORD=your-postgres-password   # macOS / Linux
$env:POSTGRES_SUPER_PASSWORD = "your-postgres-password"  # Windows PowerShell
node install.mjs
```

Open [http://localhost:3000](http://localhost:3000), sign in, go to **Data Upload**, and import your ACC Data Connector ZIP.
