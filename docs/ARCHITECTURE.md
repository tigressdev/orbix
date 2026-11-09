# Arquitetura

```text
config/trip.json  ──►  planner.expand()  ──►  grid de buscas (rota × data)      348 hoje
 (stages, regras)            │
                             ▼
              planner.pick(): mais "velhas" primeiro, ponderado por prioridade, até o orçamento diário
                             │
                             ▼
              Provider.search()  ──►  Offer normalizado  ──►  SQLite (searches, offers)
              (serpapi | fixture | futuros)                       │  horários em UTC + local, raw_json
                                                                  ▼
              itineraries.load_legs(): última busca de cada rota/data, só dados frescos, K mais baratas
                                                                  │
                                                                  ▼
              itineraries.build_trips(): DFS MAD → … → MAD respeitando regras (abaixo)
                                                                  │
                                              ┌───────────────────┼───────────────────┐
                                              ▼                   ▼                   ▼
                                       report.py (HTML)     alerts.py (Telegram)   CLI/texto
```

## Regras que o `build_trips` aplica (config → `constraints`)
- Começa em MAD às 22:35 de 11/fev (bilhete) e só aceita 1º voo ≥ `min_madrid_buffer_hours` depois.
- Termina em MAD pelo menos 6 h antes do CA897 (25/mar 22:30).
- Cidades obrigatórias (Pequim). Não repete cidade. Máx. 7 pernas.
- Estadia mínima/máxima por cidade (`stay_rules_hours`) — é o que cria "2–4 dias em Budapeste" e "N dias em Moscou".
- Toda perna é bilhete separado ⇒ toda conexão é **self-transfer**. Conexão < 24 h recebe penalidade em R$ e um aviso.
- Custo ajustado = voos + hotéis (noites × estimativa por cidade) + bagagem + penalidade de risco.
- Resultado agrupado por **assinatura** (`MAD>BUD>PEK>SVO>IST>MAD`): melhor itinerário por combinação de cidades,
  que é o que responde "vale a pena parar em Budapeste?".

## Decisões
| Decisão | Por quê |
|---|---|
| Python stdlib + SQLite | Zero dependências, roda em qualquer lugar (inclusive CoWork). |
| Fusos como offset fixo (`airports.json`) | Todos os fusos da viagem são constantes até 27/mar/2027 (Europa muda em 28/mar). Evita `tzdata` no Windows. |
| Histórico numa branch `data` | Runner do Actions é efêmero e artefatos expiram; o SQLite binário é pequeno. |
| Busca mais velha primeiro | O starter cortava a lista nas N primeiras e nunca chegava às últimas. |
| `fixture` isolado em `demo.sqlite` | Dados sintéticos nunca se misturam com cotações reais. |
| CI falha se nenhuma busca der certo | O starter ficava verde mesmo sem coletar nada. |

## Evolução natural (não feito de propósito)
1. **Descoberta barata → confirmação cara**: um provider de cache (Travelpayouts/Aviasales Data API) varre o grid
   inteiro por quase nada; só as combinações promissoras vão para o SerpApi. Hoje o grid (348) não cabe no orçamento diário.
2. **Função objetivo de duração**: hoje ranqueia só custo. Falta decidir se usar toda a janela até 25/mar tem valor
   (ex.: "R$ por dia útil de viagem") ou se o ranking deve ter filtro de dias em cada cidade.
3. **Frontend**: o HTML estático atende. Se virar app, FastAPI lendo o mesmo SQLite/Postgres.
4. **Camada de IA**: entender pedidos em linguagem natural ("3 dias em Budapeste, sem voo antes das 7h") e
   traduzir para `constraints`; resumir o ranking. Preço e disponibilidade só vêm de provider, nunca do modelo.


## Studio (v0.3)
- **Por que sem React/TypeScript/Tailwind:** o repositório não tem toolchain de front (backend stdlib + um arquivo de UI). Adicionar Node, bundler e dezenas de
  dependências para um app local de uma pessoa aumentaria a superfície sem ganho funcional. Foram usados módulos ES nativos, CSS com tokens, MapLibre e
  topojson-client por CDN com versão fixa, e SVG próprio para árvore e gráficos. Migrar para React/Vite depois é direto: `store.js` já isola o estado.
- **Persistência:** tabela `app_state` no mesmo SQLite (um blob JSON) + `localStorage`. Sem nova infraestrutura.
- **Separação de dados:** reservas confirmadas (`config/trip.json → fixed`), ofertas observadas (`offers`, com `provider` e `searched_at`), segmentos escolhidos
  (nós da árvore, guardam só chaves e um snapshot do trecho), estimativas (hotel/bagagem/transfer na config), restrições (`constraints`), preferências (`prefs`).
- **Análise:** `insights.py` roda em thread de fundo na primeira abertura (≈10–15 s) e fica em cache até os dados ou a config mudarem.
