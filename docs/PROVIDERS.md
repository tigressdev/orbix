# Fontes de preço de voo (pesquisa de 2026-11-09)

Google Flights **não tem API pública**. As opções são intermediários que raspam o Google Flights, ou APIs de GDS/agregadores.
Preços e limites abaixo vêm de páginas de terceiros: **confirme no site oficial antes de assinar**.

| Opção | O que é | Prós | Contras | Status no projeto |
|---|---|---|---|---|
| **SerpApi** (`google_flights`) | Raspa o Google Flights, devolve JSON | Mesmos resultados que você vê no Google Flights; só ida (`type=2`) | Paga por busca. Plano grátis ~250/mês e Starter ~US$25 p/ 1.000/mês (fonte: página de preços, verificar) | **Implementado** |
| **Amadeus Self-Service** | API oficial do GDS | Era a opção clássica | **Portal desativado em 17/jul/2026**; só Enterprise sob contrato | Descartado |
| **Travelpayouts / Aviasales Data API** | Cache de preços (calendário, mais baratos) | Bom para varrer muitas datas/rotas; gratuito para parceiros | Dados em cache (podem estar defasados); a busca em tempo real exige ≥50 mil usuários/mês | Candidato à "descoberta barata" |
| **Duffel** | API de busca e reserva de voos | API moderna, boa para reservar | Voltada a quem vende; pode ter custo/aprovação | A avaliar |
| **Apify/Ignav e similares** | Raspadores que imitam Amadeus/Google Flights | Barato, rápido de começar | Terceiros sem garantia; verificar termos e estabilidade | A avaliar |
| **Skyscanner / Kiwi** | APIs de parceiros | — | Acesso restrito a parceiros aprovados | Provavelmente inviável |
| **Bibliotecas que raspam o Google Flights direto** (ex.: `fast-flights`) | Sem chave | Grátis | Frágeis, podem quebrar ou violar termos do Google | Não recomendado em rotina diária |

## Matemática de cota (grid atual)
- 348 buscas no grid completo; orçamento de 30/dia ⇒ ~12 dias para cobrir uma vez; 900 buscas/mês.
- Com plano de 250/mês (~8/dia) a cobertura é lenta; com 1.000/mês (~33/dia) cabe.
- Alavancas: reduzir datas por estágio, limitar hubs (`BEG`/`IST` primeiro), usar descoberta barata (item 1 da evolução).

## Para adicionar um provider
Crie `src/flightintel/providers/<nome>.py` com uma classe que herda de `Provider`, devolve `Offer`s com horários **locais**
no aeroporto e registre em `providers/__init__.py`. O resto do pipeline não muda.
