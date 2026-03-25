# Clashd - Live Structured Video Debate Platform

## Project Structure
Turborepo + pnpm workspaces monorepo.

```
clashd/
├── apps/
│   ├── mobile/              # React Native (Expo Router)
│   └── web/                 # Next.js (App Router + Tailwind)
├── packages/
│   ├── shared/              # Types, XState machine, Zod schemas, utils
│   ├── supabase-client/     # Typed queries, realtime subscriptions
│   ├── agora-client/        # Agora hooks + platform adapter interface
│   ├── ui/                  # Shared UI primitives (timer, scores)
│   └── config/              # ESLint, TS, Prettier configs
└── supabase/
    ├── migrations/          # SQL migrations
    └── functions/           # Edge Functions (Deno)
```

## Commands
- `npx pnpm dev` — Start all apps in dev mode
- `npx pnpm build` — Build all packages and apps
- `npx pnpm test` — Run all tests
- `npx pnpm --filter @clashd/shared test` — Run shared package tests only
- `npx pnpm --filter @clashd/web dev` — Run web app only

## Key Concepts
- **State Machine**: `packages/shared/src/machine/debate-machine.ts` is the core. XState v5.
- **4 Realtime Channels per debate**: broadcast (reactions), state (postgres changes), chat (comments), presence (audience)
- **Timer enforcement**: Client-driven, server-validated via `advance-round` Edge Function
- **Mute enforcement**: Server broadcasts MUTE_CONTROL, clients mute own Agora streams

## Database
All migrations in `supabase/migrations/`. Core tables: profiles, debates, rounds, votes, comments, challenges, follows, reports.
RLS is on for all tables. `handle_new_user()` trigger auto-creates profile on signup.

## Tech Stack
- React Native (Expo) + Next.js (shared TypeScript)
- Supabase (Postgres, Auth, Realtime, Edge Functions)
- Agora (video/audio RTC)
- XState v5 (state machine)
- Zod (validation)
