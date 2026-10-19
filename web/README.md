# mcp-whichtool — web page

The console's page, in React (Vite, TypeScript, Radix, TanStack Query, zustand). `npm run build`
writes it into `../whichtool/static/`, which the Python package ships and
`whichtool serve` serves on 127.0.0.1:8790. The build is committed, so installing the package
needs no Node; CI checks it matches these sources.

    npm install
    npm run dev          # http://127.0.0.1:5174, /api proxied to a running `whichtool serve`
    npm run build        # ../whichtool/static/

    npm run typecheck
    npm run lint
    npm run test         # vitest + msw

Layout: `src/api` (the backend contract, no UI) · `src/stores` (zustand) · `src/components/_ui`
(primitives: one per file, default export, cva variants, memo; Radix where the DOM allows) ·
`src/features/<domain>` · `src/pages`. `src/styles/console.css` is the stylesheet.
Toasts: react-toastify through `src/lib/notify.ts`.
