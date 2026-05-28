# SplitNaira Backend

Express + TypeScript API scaffold for SplitNaira.

## Scripts
- `npm ci`
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run test`
- `npm run deps:check`
- `npm run generate:openapi` - Regenerates the OpenAPI specification

## OpenAPI
The API documentation is defined using Zod schemas and generated into an OpenAPI 3.0 specification.
- Source: `src/openapi.ts`
- Output: `openapi/openapi.yaml`
- Command: `npm run generate:openapi`

## Notes
- Dependencies are pinned to exact versions in `package.json` and `package-lock.json`.
- Use `npm ci` to install and keep lockfile-based resolution deterministic across local and CI.
- Run `npm run deps:check` before opening a PR to catch peer graph or lockfile health issues early.
- Propose backend toolchain upgrades in focused PRs and commit lockfile + manifest together.
- Copy `.env.example` to `.env` and fill in Stellar config before wiring endpoints.

## Deployment
- CI/CD workflow: `../.github/workflows/backend-deploy.yml`
- Deployment configuration and required secrets: [`../docs/backend-deploy.md`](../docs/backend-deploy.md)
- **Compliance & Operational Readiness**: [`../docs/backend-compliance-improvements.md`](../docs/backend-compliance-improvements.md) - Production-grade improvements including transaction safety, logging, and deployment guidance.

## Compliance & Production Readiness

This backend implements production-grade compliance standards:

- ✅ **Database Transaction Safety** - User registration and critical operations wrapped in transactions with automatic rollback
- ✅ **Structured Logging** - All logs use logger service with request IDs for tracing
- ✅ **Input Validation** - Request validation middleware with detailed error messages
- ✅ **Error Handling** - Comprehensive error handling with appropriate HTTP status codes
- ✅ **Rate Limiting** - 5-tier layered rate limiting on all endpoints
- ✅ **Security** - Stellar address verification, helmet security headers, CORS configuration

See [`../docs/backend-compliance-improvements.md`](../docs/backend-compliance-improvements.md) for:
- Implementation details of critical fixes
- Deployment safety procedures
- Rollback procedures
- Operational impact and monitoring guidance

## Structure
- `src/index.ts` - App entry
- `src/routes` - HTTP routes
- `src/services` - Stellar/Soroban integrations
- `src/middleware` - Error handling
