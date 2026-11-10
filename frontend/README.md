# ORBIX frontend (React + Vite + TypeScript)

Veja `../docs/MIGRATION_REACT.md` para arquitetura, contratos, testes e deploy.

```bash
npm install
npm run dev        # :5173, proxy /api -> http://localhost:8765 (API_URL para mudar)
npm run typecheck
npm test           # Vitest (unitários + integração)
npm run build
npm run e2e        # Playwright
```
