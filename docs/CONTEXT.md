# Contexto da viagem (resumo para o planejamento)

Versão enxuta do documento de contexto da Helen, só com o que afeta a otimização. Detalhes pessoais/afetivos ficam fora do
repositório de propósito (se ele for para o GitHub ou compartilhado).

## Decisões firmes
- **A Rússia entra, em março, na volta da China para Madri, e é prioridade.** Moscou é cidade obrigatória no modelo
  (`required_cities`) e os estágios da Rússia têm a maior prioridade de busca. Quantos dias em Moscou: em aberto (`stay_rules_hours.MOSCOW`).
- **Pequim é a entrada na China** (também obrigatória).
- Madri é porta de entrada/saída: chega 11/fev 22:35, sai 25/mar 22:30. Prefere sair na manhã de 12/fev depois de descansar,
  mas aceita algo diferente se a economia for grande.

## Calendário
- No exterior: 11/fev–26/mar/2027 (~43 noites). Férias aprovadas/planejadas: **18/fev–19/mar**.
- Fora das férias (12–17/fev e 20–25/mar) pode ser necessário trabalhar remoto → preferir lugares com boa conexão. Não modelado.
- **Aniversário 14/mar (33 anos): sem voo saindo ou chegando nesse dia** (`no_travel_dates`), idealmente num lugar especial
  (candidatos: Wuhan, Xangai, Chengdu, Dali — flores de primavera, lagos, montanhas).

## Preferências
- Clima ameno/frio (10–22 °C); gosta de neve, lagos, montanhas, jardins, cidades históricas.
- Interesses: história, línguas (pt, en, fr; estuda russo), autonomia (sem pacote).
- Cidades da China: **Pequim** (entrada), **Xangai** (modernidade/primavera), **Shenzhen** (tecnologia — não descartar por "pouca atração turística").
- Possíveis extras, sem compromisso: Europa Central na ida (Budapeste, Suíça…), Singapura, Japão (cerejeiras), Baikal/Transiberiana.
  Os estágios domésticos da China e a saída por Xangai/Shenzhen estão **desligados** em `config/trip.json` (`"enabled": false`).

## Como isso aparece no código
| Fato | Onde |
|---|---|
| Moscou e Pequim obrigatórias | `constraints.required_cities` |
| 14/mar sem trânsito | `constraints.no_travel_dates` |
| Estadias mínimas/máximas por cidade | `constraints.stay_rules_hours` |
| Trem de alta velocidade na China, voos achados à mão | `manual_legs` |
| Busca da Rússia priorizada | `stages[*].priority` = 5 nos 3 estágios de volta |
| Baikal/Transiberiana, Japão, Singapura | **ainda não modelados** (precisam de aeroportos e estágios) |

## Princípio de projeto
A viagem não deve depender de uma única pessoa ou de um único trecho: prefira itinerários com datas flexíveis,
reservas reembolsáveis quando possível e margem antes do CA897, que é o único prazo inegociável.
