# ORBIX 2.0: migração do front-end para React + Vite + TypeScript

## O que mudou e o que não mudou
| | Antes | Agora |
|---|---|---|
| Interface | módulos ES sem build (`public/`) | `frontend/` React 19 + TypeScript estrito + Vite 8 |
| API Python, SQLite, cotações, login, Upstash | `src/flightintel`, `api/index.py` | **inalterados** (contratos preservados) |
| Estado do roteiro | `store.js` (objeto `S`) | **um** store Zustand (`stores/studio.ts`) com o mesmo formato salvo (`v: 1`): planos antigos continuam abrindo |
| Custos | servidor (`/api/evaluate`, `/api/options`) | idem: o cliente **nunca soma custos**; TanStack Query só guarda as respostas |
| Mapa | MapLibre 4.7 via CDN | MapLibre 5 empacotado, contornos em `/geo/countries-110m.json` (mesma origem) |
| Navegação | abas no topo | mobile: barra inferior (Journey, Explore, Atlas, Pulse, More); desktop: barra lateral |

Pastas: `app/` (rotas), `components/{ui,layout,shared}`, `features/{journey,explore,atlas,compare,price-pulse,insights,budget,preferences}`,
`hooks/`, `lib/` (formatação, árvore de cenários, hospedagem), `services/api/`, `stores/`, `types/`, `styles/`.
Bibliotecas: React Router, TanStack Query, Zustand, Tailwind 4, Radix Dialog, Lucide, Motion, Recharts, React Hook Form + Zod, Vitest, Testing Library, Playwright.
(shadcn/ui não foi usado: só os primitivos do Radix, para não gerar código que ninguém revisa.)

## Contratos preservados
- `/api/session|login|logout|meta|options|evaluate|state|trends|analysis` com os mesmos formatos.
- Cookie de sessão `HttpOnly` definido pelo servidor; nada secreto no bundle nem no `localStorage`.
- Cada pessoa escreve só no próprio espaço; o outro usuário é somente leitura (o servidor impõe; a interface também desabilita).
- O bilhete comprado nunca entra no orçamento sem você marcar; Moscou nunca some (aparece bloqueada com o motivo).
- Dados observados ≠ estimativas ≠ histórico: etiquetas explícitas nos cartões e no orçamento.

## Causa do mapa sem países no celular (diagnóstico)
O mapa antigo carregava o MapLibre, o `topojson-client` e os contornos de `unpkg.com`. Em redes móveis/bloqueios isso falhava em silêncio e sobravam só os pinos.
No React: tudo local (worker embutido, contornos servidos por nós), `ResizeObserver` para redimensionar, estado visível (`data-status`) e aviso se os contornos falharem.
Dois detalhes que também quebraram o mapa durante a migração: o CSS do MapLibre (`position: relative`) anulava o posicionamento do contêiner (corrigido com estilo inline) e o MapLibre 6 precisa de um worker ESM que não carregou no navegador de teste (usamos a série 5).

## Desenvolvimento
```bash
python trip.py serve            # API em :8765
cd frontend && npm install && npm run dev      # interface em :5173 (proxy /api -> :8765; API_URL muda o destino)
npm run typecheck && npm test && npm run build
npm run e2e                      # Playwright (Chrome) contra `vite preview`; precisa da API de testes em :8766 sem usuários:
                                 #   FI_USERS='{}' python trip.py serve --port 8766   e   API_URL=http://localhost:8766 npx vite preview
bash e2e/run-auth.sh             # login real com 2 contas aleatórias descartáveis (sobe tudo sozinho)
```

## Deploy (Vercel)
`vercel.json`: `buildCommand` compila o `frontend/` e `outputDirectory` é `frontend/dist`; `/api/*` continua na função Python; qualquer outra rota cai no `index.html` (links diretos funcionam).
Variáveis: `FI_USERS`, `FI_SESSION_SECRET` (Production **e** Preview se quiser testar a branch). Sem `FI_USERS` o servidor responde 503 (falha fechada).

## Limitações conhecidas
- Logos das companhias: não há fonte confiável de arquivos; os cartões mostram o nome (a versão antiga tinha monogramas).
- Decision tree em grafo (modo desktop/tela cheia) ainda não foi portado: no celular e no desktop a navegação por ramos usa cartões (Scenarios).
- Watchlist do Price Pulse é local ao dispositivo e **não envia alertas** (nenhum canal de notificação configurado; a tela diz isso).
- `vercel build` local não roda a função Python no Windows; a validação da arquitetura implantada depende de um deploy real.
- O repositório é público: cotações, rotas e preferências aparecem nele (veja `docs/DEPLOY_VERCEL.md`).
