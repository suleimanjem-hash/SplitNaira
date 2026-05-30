## Reliability Improvements (Wave 5)

### Changes
- Added `ErrorBoundary` component to catch and display React render errors gracefully
- Added `withRetry` utility for resilient API calls with exponential backoff
- Added unit tests for retry utility

### Rollback
Remove `ErrorBoundary` wrapper from affected layouts and delete `src/lib/retry.ts`.