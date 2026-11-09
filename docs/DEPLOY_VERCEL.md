# Deploy no Vercel (plano Hobby, endereço `*.vercel.app`, sem domínio)

## Como o app foi dividido
| Parte | Onde roda | Observação |
|---|---|---|
| Interface (`public/`) | arquivos estáticos do Vercel | HTML/CSS/JS puros, sem build |
| API (`api/index.py`) | 1 função Python do Vercel (WSGI) | só biblioteca padrão; sistema de arquivos **somente leitura** |
| Cotações (a "memória dos horizontes") | `data/quotes/*.txt` **no Git** → `data/deploy/quotes.sqlite` | um arquivo novo por dia = histórico; gerado por `python scripts/build_data.py` |
| Análise pesada (Insights) | `data/precomputed/insights.json` | calculada no build (≈15 s é demais para uma requisição serverless) |
| Estado do app (cenários, ramos, notas) | **Upstash Redis** (grátis) ou só no navegador | uma chave por pessoa: `...:helen`, `...:demetrio` |

## Passo a passo
1. **Gere os dados** (de novo sempre que adicionar cotações ou mudar `config/`):
   `python scripts/build_data.py` e faça commit de `data/deploy/quotes.sqlite`, `data/precomputed/insights.json` e `data/fx.json` (`python trip.py fx --export`).
2. **Usuários e segredo** (as senhas nunca vão para o Git):
   `python scripts/make_user.py helen "Helen" --owner` e `python scripts/make_user.py demetrio "Demetrio"` (pedem a senha sem mostrar).
   O script imprime os valores de `FI_USERS` (só **hashes**) e `FI_SESSION_SECRET` para colar no Vercel.
3. **GitHub**: crie um repositório **privado** e envie o projeto (`config/users.local.json`, `data/quotes.sqlite` e `data/.session_secret` já estão no `.gitignore`).
4. **Vercel**: *Add New → Project → Import* o repositório. *Framework Preset*: **Other**. Não precisa de build command (o `vercel.json` já define `public/` e a função).
5. **Environment Variables** (Production): `FI_USERS`, `FI_SESSION_SECRET`.
6. **Memória na nuvem (opcional, recomendado)**: no Vercel, *Storage → Marketplace → Upstash for Redis* (plano gratuito) e conecte ao projeto; as variáveis
   `KV_REST_API_URL` e `KV_REST_API_TOKEN` (ou `UPSTASH_REDIS_REST_URL/TOKEN`) são lidas automaticamente. Sem isso, cada pessoa só tem a memória no próprio
   navegador e **não consegue ver o plano da outra** (a leitura cruzada precisa do armazenamento).
7. **Deploy**. Cada `git push` na branch principal publica de novo.

## Rotina diária (histórico de preços)
Veja `docs/COLLECTION_ROUTINE.md`. Em resumo: coletar → salvar `data/quotes/browser_quotes_AAAA-MM-DD_*.txt` → `python scripts/build_data.py` → commit → push.
Com chave do SerpApi dá para automatizar no GitHub Actions (também grátis).

## O que é gratuito (e o que conferir)
- **GitHub (repo privado)**: guarda as cotações como texto (histórico completo, diffável). Grátis.
- **Vercel Hobby**: hospedagem estática + 1 função, uso pessoal/não comercial. Limites de tempo/tamanho mudam: confira a página de *Functions limits*.
- **Upstash Redis (via Marketplace)**: faixa gratuita pequena (na faixa de centenas de MB e centenas de milhares de comandos/mês; **confira os números atuais**).
  Nosso estado tem ~3 KB por pessoa.
- **Alternativas** para dados relacionais, se um dia precisar guardar o histórico num banco em vez do Git: **Turso** (SQLite hospedado; fontes divergem: 5 GB ou 9 GB grátis) ou
  **Neon/Supabase** (Postgres; a faixa grátis do Supabase pausa projetos inativos). Não estão implementadas: hoje o Git cobre a necessidade.

## Segurança
- Login por usuário e senha: só guardamos **hash PBKDF2-SHA256 (200 mil iterações)**; sessão em cookie assinado `HttpOnly; Secure; SameSite=Lax`, 30 dias.
- **Todas** as rotas `/api/*` exigem login. A página estática em si não contém dados pessoais.
- Cada pessoa **escreve só no próprio espaço** (a regra está no servidor, não só na tela). A outra pessoa pode **ler**, nunca alterar.
  O preço da passagem comprada só aparece para o usuário marcado como `owner`.
- Limite de tentativas de login por IP é de melhor esforço (a memória é por instância serverless).
- **As senhas foram digitadas numa conversa**: troque-as quando o app estiver no ar (`make_user.py` gera um novo hash; atualize `FI_USERS`).
- Nunca versione `.env`, `config/users.local.json` ou chaves.

## Limitações do modo hospedado
- Somente leitura: "Adicionar cotação" fica desativado (adicione ao `data/quotes/*.txt` e republique).
- O `__route` do rewrite (`/api/:path*` → `/api/index?__route=...`) foi testado localmente com um adaptador WSGI, **não num deploy real**: se o Vercel
  entregar o caminho de outra forma, o `api/index.py` também aceita o caminho original.

## Testar o modo hospedado em casa
```bash
FI_HOSTED=1 python trip.py serve        # usa data/deploy/quotes.sqlite em modo somente leitura
```
