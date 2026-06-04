# ReconcileFlow — All Improvements Implementation Plan

Fix all issues identified in the portfolio review to push the project from 7.5/10 to 9+/10.

---

## Proposed Changes

### 1. Security — Credential Leak Fix

#### [MODIFY] [.gitignore](file:///c:/Users/Vidit/Downloads/Project/Project/.gitignore) or [NEW] if missing
- Add `.env` to `.gitignore` in project root, backend, and frontend
- Add common Node.js ignores (`node_modules`, `dist`, etc.)

#### [MODIFY] [.env](file:///c:/Users/Vidit/Downloads/Project/Project/backend/.env)
- Replace real Neon DB and Upstash Redis credentials with placeholders
- Keep the format so the project still documents what's needed

---

### 2. Backend TypeScript Error Fixes (16 errors)

#### [MODIFY] [dlq.routes.ts](file:///c:/Users/Vidit/Downloads/Project/Project/backend/src/routes/dlq.routes.ts)
- Fix 4 instances of `req.params.id` typed as `string | string[]` — cast to `string`

#### [MODIFY] [match.routes.ts](file:///c:/Users/Vidit/Downloads/Project/Project/backend/src/routes/match.routes.ts)
- Fix `req.params.id` type issues (3 locations)
- Add explicit type annotations for destructured params

#### [MODIFY] [order.routes.ts](file:///c:/Users/Vidit/Downloads/Project/Project/backend/src/routes/order.routes.ts)
- Fix `req.params.id` type issue
- Fix `gatewayTxns`/`matches` inference by typing the Prisma query result properly

#### [MODIFY] [run.routes.ts](file:///c:/Users/Vidit/Downloads/Project/Project/backend/src/routes/run.routes.ts)
- Fix `req.params.id` type issue
- Fix `matches` property inference on Prisma result

#### [MODIFY] [settlement-ingestion.service.ts](file:///c:/Users/Vidit/Downloads/Project/Project/backend/src/services/settlement-ingestion.service.ts)
- Fix `Buffer` type mismatch in stream `data` handler — use `Buffer | string` union

---

### 3. Frontend TypeScript Error Fixes (2 errors)

#### [MODIFY] [Dashboard.tsx](file:///c:/Users/Vidit/Downloads/Project/Project/frontend/src/pages/Dashboard.tsx)
- Remove unused `Legend` import from recharts

#### [MODIFY] [Runs.tsx](file:///c:/Users/Vidit/Downloads/Project/Project/frontend/src/pages/Runs.tsx)
- Either use or remove unused `ConfidenceBadge` component

---

### 4. Unit Tests (10-15 tests for core services)

#### [NEW] backend/src/\_\_tests\_\_/money.test.ts
- Test `fromMinor`, `toMinor`, `isWithinTolerance`, `formatINR`, `absoluteDelta`

#### [NEW] backend/src/\_\_tests\_\_/idempotency.test.ts
- Test `generateIdempotencyKey` determinism, uniqueness

#### [NEW] backend/src/\_\_tests\_\_/matching.test.ts
- Mock Prisma, test all 4 tiers of the matching algorithm

#### [NEW] backend/src/\_\_tests\_\_/audit.test.ts
- Test audit entry creation with mocked Prisma

#### [NEW] backend/vitest.config.ts
- Configure vitest with proper TypeScript support

---

### 5. Docker Setup

#### [NEW] backend/Dockerfile
- Multi-stage Node.js 20 Alpine build
- Prisma generate in build stage
- Minimal production image

#### [NEW] docker-compose.yml (project root)
- Services: backend, frontend, postgres, redis
- Proper networking, health checks, volume mounts

#### [NEW] frontend/Dockerfile
- Multi-stage build: npm build → nginx for serving static files

#### [NEW] frontend/nginx.conf
- SPA routing configuration for React Router

---

### 6. API Documentation

#### [NEW] backend/src/routes/docs.routes.ts
- Simple JSON endpoint at `/api/docs` listing all API endpoints with methods, descriptions, auth requirements, and example payloads

---

### 7. Request Logging Middleware (Correlation IDs)

#### [NEW] backend/src/middleware/requestLogger.ts
- Generate `X-Request-ID` (UUID) for every request
- Log request method, path, duration, status code
- Attach to response headers

#### [MODIFY] [index.ts](file:///c:/Users/Vidit/Downloads/Project/Project/backend/src/index.ts)
- Mount the new request logger middleware

---

### 8. Frontend Code Splitting + Skeleton Loaders

#### [MODIFY] [App.tsx](file:///c:/Users/Vidit/Downloads/Project/Project/frontend/src/App.tsx)
- Use `React.lazy()` + `Suspense` for all page components

#### [NEW] frontend/src/components/PageSkeleton.tsx
- Skeleton loader component shown during lazy loading

---

### 9. WebSocket Authentication

#### [MODIFY] [socket.ts](file:///c:/Users/Vidit/Downloads/Project/Project/backend/src/lib/socket.ts)
- Add Socket.IO middleware that verifies JWT from `socket.handshake.auth.token`
- Reject unauthenticated connections

---

### 10. DLQ Pagination

#### [MODIFY] [dlq.service.ts](file:///c:/Users/Vidit/Downloads/Project/Project/backend/src/services/dlq.service.ts)
- Add `page` and `limit` params to `listDLQItems()`

#### [MODIFY] [dlq.routes.ts](file:///c:/Users/Vidit/Downloads/Project/Project/backend/src/routes/dlq.routes.ts)
- Accept `?page=1&limit=20` query params

---

### 11. README + System Design Diagram

#### [MODIFY] [README.md](file:///c:/Users/Vidit/Downloads/Project/Project/README.md)
- Add a Mermaid system architecture diagram
- Add API endpoint summary table
- Add Docker setup instructions
- Add testing instructions
- Improve overall polish

---

## Verification Plan

### Automated Tests
- `cd backend && npx tsc --noEmit` → 0 errors
- `cd frontend && npx tsc -b` → 0 errors
- `cd backend && npm run test` → all tests pass
- `cd frontend && npx vite build` → successful build
- `docker compose build` → successful build (if Docker available)

### Manual Verification
- Confirm `.env` no longer contains real credentials
- Confirm `.gitignore` properly ignores `.env` files
