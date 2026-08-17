# Hermes3D

Hermes3D is a modern, interactive 3D viewer for the browser. Drag to orbit the
scene, scroll to zoom, and use the control panel to switch geometries, change
colors, toggle wireframe rendering, and start/stop auto-rotation.

Built with [Next.js](https://nextjs.org) (App Router), [React Three
Fiber](https://r3f.docs.pmnd.rs/), [drei](https://github.com/pmndrs/drei), and
[Three.js](https://threejs.org), styled with [Tailwind CSS](https://tailwindcss.com).

## Tech stack

- **Next.js 16** with the App Router and TypeScript
- **React 19**
- **React Three Fiber 9** + **drei** for declarative WebGL scenes
- **Three.js** as the underlying 3D engine
- **Tailwind CSS 4** for styling
- **pnpm** as the package manager

## Getting started

Install dependencies and start the dev server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Command       | Description                              |
| ------------- | ---------------------------------------- |
| `pnpm dev`    | Start the development server             |
| `pnpm build`  | Create a production build                |
| `pnpm start`  | Serve the production build               |
| `pnpm lint`   | Run ESLint                               |

## Project structure

```
src/
  app/
    layout.tsx      # Root layout and metadata
    page.tsx        # Landing page + interactive control panel
    globals.css     # Global styles / theme tokens
  components/
    Hermes3DScene.tsx  # React Three Fiber scene (client component)
```

## Cloud Agent environment

This repository is configured for Cursor Cloud Agents via
[`.cursor/environment.json`](.cursor/environment.json). The `install` step runs
`pnpm install --frozen-lockfile`, and a `dev` terminal runs `pnpm dev` on
port 3000.
