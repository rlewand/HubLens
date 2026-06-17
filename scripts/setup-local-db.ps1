# HubLens local database setup (Windows, existing PostgreSQL 16)
# Run once if Docker is unavailable. Requires postgres superuser access.

$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
if (-not (Test-Path $psql)) {
  Write-Error "PostgreSQL 16 not found at $psql"
  exit 1
}

$superPassword = $env:POSTGRES_SUPER_PASSWORD
if (-not $superPassword) {
  Write-Host "Set POSTGRES_SUPER_PASSWORD if your postgres user password is not 'password'"
  $superPassword = "password"
}

$env:PGPASSWORD = $superPassword

& $psql -U postgres -h localhost -p 5432 -d postgres -c @"
DO `$`$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hublens') THEN
    CREATE ROLE hublens LOGIN PASSWORD 'hublens';
  END IF;
END `$`$;
"@

$dbExists = & $psql -U postgres -h localhost -p 5432 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'hublens'"
if ($dbExists -ne "1") {
  & $psql -U postgres -h localhost -p 5432 -d postgres -c "CREATE DATABASE hublens OWNER hublens;"
}

& $psql -U postgres -h localhost -p 5432 -d hublens -c "CREATE SCHEMA IF NOT EXISTS hublens AUTHORIZATION hublens; GRANT ALL ON SCHEMA hublens TO hublens;"

Write-Host "Database ready. Run: pnpm db:push"
