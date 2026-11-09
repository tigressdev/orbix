# China 2027 — otimizador de rotas e tarifas

Monitora voos só-ida e monta itinerários completos **MAD → (parada opcional) → Pequim → Moscou → hub → MAD**,
ranqueados por custo total (voos + hotel + bagagem + penalidade de risco).

## Fatos confirmados (bilhete CA, emitido 10/out/2026)
- GRU → MAD: CA898, 11/fev/2027, chega em Madri **22:35**. 2 peças de bagagem.
- MAD → GRU: CA897, **25/mar/2027 22:30** (chega 26/mar 05:30). Não endossável, com multa.
- Nada mais foi comprado. Paradas candidatas (Budapeste, Viena, Zurique, Genebra, Varsóvia, Istambul, Belgrado) **não estão reservadas**.
- Plano: Pequim primeiro; **volta pela Rússia (decidido, prioridade)**; 14/mar sem voo (aniversário). Dias em Moscou em aberto — ajuste `stay_rules_hours.MOSCOW`. Contexto: `docs/CONTEXT.md`.

## Uso
Python 3.11+, sem pacotes.

```bash
python trip.py demo                         # dados SINTÉTICOS: testa tudo offline (grava data/demo.sqlite e site/index.html)
python -m unittest discover -s tests        # regras de itinerário
python trip.py plan                         # tamanho do grid e conta de cota
export SERPAPI_KEY='...'                    # PowerShell: $env:SERPAPI_KEY='...'
python trip.py run                          # coleta até max_searches_per_run buscas (mais antigas primeiro)
python trip.py build --top 10               # melhores itinerários completos
python trip.py report                       # site/index.html
python trip.py alert --dry-run              # queda >= alert_drop_percent vs. menor valor já visto
```

## Flight Intelligence — The Journey Studio (localhost)
```bash
python trip.py serve          # http://localhost:8765  (somente 127.0.0.1)
```
Interface em inglês (conforme o brief), sobre o mesmo motor de cotações reais, regras e orçamento.
- **Mapa** (MapLibre, atlas sem tiles): rotas *confirmed* (sólidas), *selected* (teal), *suggested* (tracejadas) e *exploring* (âmbar, ao passar o mouse num destino).
- **Journey**: o ramo em foco como capítulos (datas, noites, voo, custos, hotel editável, notas, aniversário).
- **+ Explore next destination**: gaveta com cartões de destino (5 rankings, filtro estrito) e depois os voos reais, com fonte e data da última observação.
- **Decision tree**: grafo SVG com ramos, recolher/expandir, duplicar, remover (com desfazer), fixar para comparar.
- **Compare**: 2–4 ramos lado a lado; ramos incompletos nunca competem com completos.
- **Insights**: lowest-cost, balanced, cultural, time-efficient e opportunity, com motivos calculados; economia da parada europeia; lacunas de dados.
- Cada ramo recalcula o próprio custo no servidor (`/api/evaluate`): prefixos compartilhados nunca são somados duas vezes.
- Estado (cenários, ramos, notas, edições) persiste em `data/quotes.sqlite` (tabela `app_state`) e em `localStorage`. *Preferences → Reset exploration* recomeça.
- Custos: voos = **observados**; hotel, bagagem (1/bilhete) e transfer (R$ 60/chegada) = **estimativas** (`config/trip.json`). A passagem comprada (R$ 3.209,80) fica fora do orçamento, salvo opção.
- Metadados editoriais das cidades (país, rótulo, nota de interesse 1–10, notas de aniversário): `config/cities.json`.
- Precisa de internet para MapLibre, contornos de países e fontes (CDNs com versão fixa); sem isso o resto funciona e o mapa mostra um aviso.

Cotações lidas à mão do Google Flights entram com `python trip.py import data/quotes/browser_quotes_YYYY-MM-DD_*.txt` (provider `browser`, vencem em 7 dias).
`python trip.py outbound` imprime o comparativo Madri→Pequim no terminal.

## Estrutura
```text
config/trip.json       regras, estágios de busca, custos estimados  ← o que você edita
config/airports.json   cidade e fuso de cada aeroporto
src/flightintel/       core · planner · providers/ · itineraries · explore · insights · importer · webapp · report · alerts · cli
public/                index.html + assets/css + assets/js (módulos ES: store, map, journey, explore, tree, compare, insights, pulse, login...)
api/index.py           entrada da função Python do Vercel (WSGI)
scripts/               build_data.py (gera banco e análise do deploy) · make_user.py (usuários)
tools/                 gflights_extract.js (extrator da rotina diária)
tests/                 regras de itinerário (buffer, prazo, cidade obrigatória, self-transfer)
docs/                  ARCHITECTURE · PROVIDERS (APIs) · RISKS (Rússia, visto, bilhetes separados)
.github/workflows/     coleta diária; histórico na branch `data`
```

## Limitações
- Hoje só há 1 provider real (SerpApi). O grid (348 buscas) não cabe num plano pequeno — ver `docs/PROVIDERS.md`.
- Ranking é por custo; não valoriza dias de viagem. Hotéis/bagagem são estimativas editáveis (`costs_brl`).
- Não verifica visto/entrada, bagagem real nem disponibilidade no checkout. Veja `docs/RISKS.md`.
- Não compra nada. A reserva é manual no site da companhia.

Ver `CLAUDE.md` para continuar o projeto no Claude Code/CoWork.
