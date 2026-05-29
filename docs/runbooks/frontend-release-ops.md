# Frontend Release Operations Runbook (#439)

## Purpose

Ship the Next.js app with validated public env vars, wallet/network guards, and contract-error messaging aligned to on-chain `SplitError` codes.

## Build requirements

| Variable | Required in prod | Notes |
|----------|------------------|-------|
| `NEXT_PUBLIC_STELLAR_NETWORK` | Yes | `testnet` or `mainnet` |
| `NEXT_PUBLIC_CONTRACT_ID` | Yes | Valid `C...` address |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | Yes | HTTPS RPC |
| `NEXT_PUBLIC_HORIZON_URL` | Yes | Matching network |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | Backend base URL |

Copy `frontend/.env.example` → `frontend/.env` for local dev.

Validation runs via `frontend/src/lib/env.ts` at startup (`getEnv()`).

## Pre-release checks

```bash
npm run verify:data-integrity
npm run lint -w frontend
npm run test -w frontend
NEXT_PUBLIC_CONTRACT_ID=C... npm run build -w frontend
```

## Release behavior

- **Network guard:** `useNetworkGuard` + `NetworkWarningBanner` block wrong Freighter network.
- **Pause state:** Admin panel and distribute flows respect `adminStatus.isPaused` from the API.
- **Contract errors:** `frontend/src/lib/contract-errors.ts` maps ledger failures to readable copy via `formatContractFailure` in `soroban-transaction.ts`.

When adding a new `SplitError` in contracts:

1. Regenerate types (`npm run generate:contract-types`).
2. Add a message in `CONTRACT_ERROR_MESSAGES`.
3. Extend `contract-errors.test.ts`.

## Operational impact

| Change | Users see |
|--------|-----------|
| New `NEXT_PUBLIC_CONTRACT_ID` | Must refresh; wallet txs target new contract |
| Wrong network env | Banner: switch Freighter network |
| API URL change | All REST calls move; CORS must allow origin |
| Pause on contract | Warnings on distribute; deposits still work |

## Rollback

1. Redeploy previous frontend build artifact or Docker image tag.
2. Set `NEXT_PUBLIC_CONTRACT_ID` to previous value in hosting env.
3. Clear CDN cache if static assets are cached.
4. No on-chain action required for frontend-only rollback.

## Docker

See [frontend/DOCKER.md](../../frontend/DOCKER.md). Pass build-args or runtime env for all `NEXT_PUBLIC_*` variables — they are inlined at build time for Next.js.
