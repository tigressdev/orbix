# Madri → Pequim: preço por data de saída (observado em 2026-11-09)

Google Flights, mercado BR, BRL, 1 adulto, só ida. "1 parada" = melhor opção razoável listada (≤ 1 parada, ≤ ~18h). Uma única leitura por data:
**não é histórico**, só um corte transversal do mesmo dia.

| Saída | Dias até o voo | 1 parada (menor) | Direto (Air China) | Observação |
|---|---|---|---|---|
| 9/dez/2026 | 30 | R$ 1.692 (Hainan via Chongqing) | preço indisponível | Google: "R$ 550 mais barato que o usual" |
| 13/jan/2027 | 65 | R$ 2.052 (Hainan via Chongqing) | R$ 2.844 | |
| **12/fev/2027** | 95 | **R$ 2.892** (Lufthansa + Air China, via Frankfurt) | **R$ 6.416** | logo após o Ano Novo Chinês (6/fev/2027) |
| 3/mar/2027 | 112 | R$ 2.046 (Hainan via Chongqing) | R$ 2.824 | |
| 17/mar/2027 | 126 | R$ 2.238 (Air Europa + Hainan via Bruxelas) | – | |

## Leitura
- Entre 13/jan e 17/mar o preço da opção barata é praticamente o mesmo (R$ 2.046–2.238) apesar de 60 dias de diferença na antecedência:
  **não aparece efeito de "comprar mais perto" nessa faixa**.
- 9/dez é ~18% mais barato, mas é baixa temporada e o próprio Google marca como "preço baixo": mistura antecedência e sazonalidade.
- 12/fev fica ~R$ 850 acima de 3/mar na opção com parada e o dobro no voo direto: o provável motivo é o **Ano Novo Chinês** (6/fev/2027;
  Festival das Lanternas em 20/fev) e a volta de quem viajou. Confirme o calendário oficial de feriados da China.
- Conclusão provisória: **mudar a data de entrada na China (ex.: depois do pico) pode valer mais que esperar para comprar**.
  A árvore do localhost mostra isso: Budapeste → Pequim em 15/fev (R$ 2.485) + Madri → Budapeste (R$ 198) < voo direto de 12/fev.

## Como testar "em cima da hora" de verdade
Precisa do **mesmo voo em datas de observação diferentes**. Reimporte as mesmas buscas em dias distintos
(`python trip.py import data/browser_quotes_<nova data>.txt`; cada arquivo guarda o seu `observed_at`) ou rode a coleta diária (SerpApi)
para formar a série. Sem série, qualquer conclusão sobre "preço cai perto da data" é palpite.
