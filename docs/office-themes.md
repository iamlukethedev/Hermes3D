# Office themes

The 3D office supports two built-in themes. **Office theme** and **National flag** appear first in Studio Settings.

- **Original Office** is the backward-compatible default. Its saved furniture and existing behavior are preserved.
- **Dellanio's House** is an optional four-zone campus: **DEV STUDIO**, **LOUNGE & GAMES**, **GYM**, and **GARDEN & POOL**. Structure, furniture, timber deck, pool basin, water, pergola, plants and doors are actual 3D geometry. Shared furniture retains the original callbacks. The 2D renderer is unchanged.

## Persistence

The theme is stored in `office[gatewayUrl].theme`. Missing or invalid themes normalize to `original`. Each gateway independently stores `flagsByTheme.original` and `flagsByTheme["dellanio-house"]`, with `us` and `br` supported. Legacy settings default to United States in both themes. Partial patches preserve the other theme's flag.

House furniture uses `<floor>:dellanio-house`, separate from Original furniture. Theme changes remount the scene. `house-layout-v4` identifies the House layout migration; `house-functional-v1` identifies shared functional furniture migration. Once migrated, saved edits are preserved. House initialization bypasses the Original furniture migration chain.

## Activity and navigation

House starts with twelve authored workstations. When the asynchronous roster grows, additional unique workstations are provisioned. Sorted unique profile IDs determine separate computer assignments. Unit tests cover capacity growth to twenty.

Idle actors have independent ID-seeded random streams, variable **45–180 second dwell after arrival**, weighted nearby/favorite/novel destinations, and a **24% quiet-stay option**. Occupied destinations are reserved. Heartbeat refreshes retain the selected activity and random state. House walking uses a **0.75 speed factor**; Original movement is unchanged.

Normal pathfinding blocks the pool. Each destination decision has a **15% chance** to choose an available water station. Water has explicit approach, entry, wading and exit phases. Work interrupts leisure, exits water through the entry, then routes to the assigned workstation. Four real partition apertures connect the central corridor to the zones. Shared collision proxies match the authored pool and room partitions.

House status markers reflect runtime status rather than seated, workout or dancing poses: green is working, gray is idle/offline, and red is error. Original marker behavior remains intact.

## Verification

Run from the repository root:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npx vitest run tests/unit/office-flag-geometry.test.ts tests/unit/office-flags.test.ts tests/unit/office-house-atmosphere.test.ts tests/unit/office-house-dynamics.test.ts tests/unit/office-house-functional.test.ts tests/unit/office-house-layout.test.ts tests/unit/office-house-natural.test.ts tests/unit/office-leisure.test.ts tests/unit/office-status-markers.test.ts tests/unit/office-themes.test.ts --maxWorkers=2
npx vitest run --maxWorkers=2
```

Focused tests cover settings normalization/merge, flag geometry, status predicates, independent seeded choices, dwell, occupancy, pool exit, physical doorway routes, workstation capacity and functional furniture inventory. See [the functional checklist](house-functional-checklist.md) for manual interaction coverage.

Unit simulations are not evidence of active real gateway work. This feature excludes the separate Kanban worker bridge PR and all deployment scripts. Verify live workstation arrival against actual gateway lifecycle events before claiming real-work integration.
