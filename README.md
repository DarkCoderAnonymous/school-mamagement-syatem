# School Management System

Multi-tenant School Management SaaS. See [CLAUDE.md](./CLAUDE.md) for the full product and
architecture brief.

## Repository layout

```
school-management-system/
├── backend/     Express + TypeScript + Mongoose + MongoDB API
├── frontend/    Next.js (App Router) web console
├── mobile/      Expo (Expo Router) app for Parent/Student/Teacher
└── shared/      @sms/shared — types, enums and constants used by all three
```

This is an npm workspaces monorepo. All commands below can be run from the repo root.

## Prerequisites

- Node.js >= 18.18
- npm >= 10
- Docker (for local MongoDB + Redis)

## First-time setup

```bash
npm install

# copy env files and fill in real secrets
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
cp mobile/.env.example mobile/.env

# start MongoDB (as a replica set) + Redis
npm run docker:up

# build the shared package first — the other three depend on it
npm run build:shared

# seed a super admin, plans, and two demo schools
npm run seed -w backend
```

The seed script prints the credentials it created, including the Super Admin login and a
demo School Admin whose temporary password must be changed on first login.

## Running each app

### Backend (Express API)

```bash
npm run dev:backend
```

- API: http://localhost:4000/api/v1
- Swagger docs: http://localhost:4000/docs
- Health check: http://localhost:4000/api/v1/health — reports MongoDB and Redis connectivity

### Frontend (Next.js web console)

```bash
npm run dev:frontend
```

- App: http://localhost:3000
- Talks to the backend via `NEXT_PUBLIC_API_BASE_URL`, which includes the `/api/v1` prefix
  (see `frontend/.env.example`).

### Mobile (Expo)

```bash
npm run dev:mobile
```

Follow the Expo CLI output to open the app in a development build, Android emulator, iOS
simulator, or Expo Go. Talks to the backend via `EXPO_PUBLIC_API_BASE_URL` (see
`mobile/.env.example`). When testing on a physical device, point this at your machine's LAN IP
rather than `localhost`.

### shared (@sms/shared)

```bash
npm run build:shared      # one-off build (tsup, emits dist/)
npm run dev -w shared      # watch mode while developing types used elsewhere
```

Rebuild `shared` after changing it — backend/frontend/mobile all import the compiled
`dist/` output, not the TypeScript source directly.

## Docker services

`docker-compose.yml` provides local dev instances of:

- **mongodb** (7) — `localhost:27017`, db `sms_dev`, user `sms` / password `sms_dev_password`,
  started with `--replSet rs0`. A one-shot `mongo-init` service initiates the single-node
  replica set, which Mongoose transactions require (school approval, fee payment, payroll
  run, marks publish — see CLAUDE.md). A standalone `mongod` cannot start a transaction at
  all, so this is not optional even locally.
- **redis** (7) — `localhost:6379`, used for BullMQ background jobs and the login rate-limit
  store.

```bash
npm run docker:up     # start
npm run docker:down   # stop
```

These defaults match `backend/.env.example`. Change both together if you change one.

## Tests

```bash
npm test              # backend test suite
```

The suite needs neither Docker service. MongoDB comes from `mongodb-memory-server` as a
single-node replica set (so transactions work), and `REDIS_URL` is deliberately pointed at a
dead port — a Redis outage must degrade the API rather than hang it, so the suite doubles as
a regression test for that. See `backend/test/set-env.ts`.

## Linting & formatting

```bash
npm run lint
```

Prettier config (`.prettierrc.json`) and `.editorconfig` are shared at the repo root.
`backend` and `shared` extend the root `.eslintrc.base.json` (classic ESLint config).
`frontend` ships its own flat ESLint config (`eslint.config.mjs`) since Next.js 16 requires
flat config — see "Deviations" below.

## Notes / deviations from a from-scratch setup

- **Frontend ESLint**: Next.js 16's `create-next-app` generates a flat-config
  `eslint.config.mjs` (ESLint 9) rather than the classic `.eslintrc` format used by
  `backend`/`shared`. Both still share the same Prettier config.
- **Root ESLint dev deps**: `@typescript-eslint/*` and `eslint-config-prettier` live in the
  root `devDependencies` because `.eslintrc.base.json` references them on behalf of the
  `backend` and `shared` workspaces.
