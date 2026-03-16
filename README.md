# Uniswap V4 LP Staking — Frontend

Frontend for the Uniswap V4 LP Staking app: stake LP positions and earn rewards.

## Tech stack

- **Vite** — build tool
- **TypeScript** — type safety
- **React** — UI
- **shadcn-ui** — components
- **Tailwind CSS** — styling
- **wagmi / viem** — Ethereum and contract interaction

## Setup

```sh
# Install dependencies
npm i
# or
bun install

# Copy env and set variables
cp .env.example .env

# Start dev server
npm run dev
# or
bun run dev
```

## Scripts

- `npm run dev` — start dev server (port 8080)
- `npm run build` — production build
- `npm run preview` — preview production build
- `npm run lint` — run ESLint
- `npm run test` — run Vitest

## Project layout

- `src/pages/` — page components (Index, Vault, Admin)
- `src/components/` — shared UI components
- `src/hooks/` — React hooks (vault, pool price, etc.)
- `src/lib/` — utils, ABIs, contract config
