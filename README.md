# Chronos Scheduler

Chronos Scheduler is a TypeScript/Vite browser application for importing class and constraint CSV files and reviewing the normalized scheduling input data.

## Current production status

- Production boot is fixed through a real Vite build that emits hashed JavaScript and CSS assets into `dist/assets`.
- CSV importing is implemented for class rows and constraint template rows.
- The scheduling engine is temporarily disabled while correctness validation and a genuine solver implementation are completed.

The application intentionally does **not** claim an optimal schedule, conflict-free output, GLPK/MILP solving, Web Worker solving, or XLSX export in its current state.

## Run locally

```bash
npm ci
npm run dev
```

Open `http://localhost:5173` and upload class/constraint CSV files through the browser. The CSV files are user-provided inputs and are not required to be bundled into production.

## Production build

```bash
npm run lint
npm test
npm run build
npm run test:e2e
npm run preview
```

Vercel is configured as a Vite static app with `npm run build` and `dist` as the output directory.
