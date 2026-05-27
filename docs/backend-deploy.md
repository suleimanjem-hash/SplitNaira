# Backend Deployment (CD)

This project deploys the backend via GitHub Actions using Render deploy hooks.

## Workflow

- File: `.github/workflows/backend-deploy.yml`
- Triggered on:
  - Push to `main` (for merge-based CD)
  - Manual run via `workflow_dispatch`
- Pipeline stages:
  - `verify-backend`: install, lint, and build backend
  - `verify-migrations`: run TypeORM migrations against a clean PostgreSQL service database
  - `deploy-backend`: trigger deployment target

## Deployment Target

- Default target: `render`
- Target selection order:
  1. Manual dispatch input: `deploy_target`
  2. Repository variable: `BACKEND_DEPLOY_TARGET`
  3. Fallback default: `render`

Currently supported values:
- `render`

## Required Secrets

Set these in GitHub repository settings under **Settings -> Secrets and variables -> Actions**:

- `RENDER_BACKEND_DEPLOY_HOOK_URL`
  - Value: Render backend service deploy hook URL

## Optional Variables

Set these in **Settings -> Secrets and variables -> Actions -> Variables**:

- `BACKEND_DEPLOY_TARGET`
  - Default recommended value: `render`

## Notes

- Deploy job only runs after backend lint/build succeeds.
- If `BACKEND_DEPLOY_TARGET` is set to an unsupported value, the job fails fast with a clear error.

## Database Migrations

Production runs with TypeORM `synchronize: false`; schema changes are shipped as versioned migrations.

Run migrations before routing traffic to a new backend release:

```bash
cd backend
npm run migration:run
```

The command reads `DATABASE_URL` plus the same Stellar environment variables used by the backend. CI validates that migrations apply on a clean PostgreSQL database before deployment.

## Readiness Checks

`GET /health/ready` returns component status for `db`, `rpc`, and `contract`.

The endpoint returns `503` when any component is unavailable so Render/load balancers do not route traffic to an instance with missing config, an unreachable database, an unreachable Soroban RPC, or an invalid/unreachable contract.

