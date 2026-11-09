# Contexto do projeto (para Claude Code / CoWork)

Otimizador de voos para a viagem de Helen: fev–mar/2027, MAD → China (Pequim primeiro) → Moscou → Madri.
Responda em português. Dados reais de preço só vêm de providers; nunca invente tarifas.

## Fatos fixos (ver config/trip.json → fixed)
GRU→MAD CA898 chega 11/fev 22:35; MAD→GRU CA897 sai 25/mar 22:30 (não endossável). Não há mais nada comprado.

## Decisões já tomadas (não reabrir)
- A Rússia VAI acontecer (volta da China, em março) e é prioridade: Moscou é cidade obrigatória. Não sugerir "plano B sem Rússia".
- 14/mar (aniversário) é dia sem voo. Contexto completo e resumido em docs/CONTEXT.md.

## Comandos
`python trip.py serve` (localhost:8765) · `python trip.py import <arquivo>` · `python trip.py outbound` · `python trip.py demo` · `python -m unittest discover -s tests` · `python trip.py plan|run|build|report|alert`

## Roteiro desejado (ligado em config/trip.json)
Madri -> [parada opcional na Europa] -> Pequim -> Xangai -> Shenzhen -> Singapura -> Moscou -> Istambul/Belgrado -> Madri (limite: chegar em Madri
ate 25/mar 16:30; 14/mar sem voo). Datas por trecho em `stages[]`; estadias em `stay_rules_hours`. Singapura e a "descida" sao uma IDEIA flexivel:
so Pequim e Moscou sao obrigatorias (`required_cities`).

## Studio (interface)
`python trip.py serve` → http://localhost:8765. Front sem build (módulos ES + CSS); estado central em `web/js/store.js`; custos SEMPRE calculados
no servidor por caminho (`Explorer.summary/metrics`), nunca somados no cliente. Não inventar preços, companhias ou bagagem: dado ausente = "unknown".
Aniversário (14/mar) protegido por padrão; Rússia obrigatória (`required_cities`). Edite `config/cities.json` para textos/notas de interesse.

## Login e deploy
Dois usuários (helen = owner, demetrio): hashes PBKDF2 em `config/users.local.json` (git-ignored) ou env `FI_USERS`; nunca gravar senhas em texto.
Cada um escreve só no próprio estado; o outro apenas lê (servidor impõe). Deploy no Vercel: ver docs/DEPLOY_VERCEL.md. Cotações = `data/quotes/*.txt` (memória);
`python scripts/build_data.py` regenera `data/deploy/quotes.sqlite` e `data/precomputed/insights.json`. Hospedagem: Moscou = regra "hospedado, custo zero" (config lodging_usd.hosted).

## Dados reais hoje
Sem chave SerpApi: as cotações vêm de leituras manuais do Google Flights (mercado BR, `gl=br`) em `data/quotes/browser_quotes_*.txt`,
importadas como provider `browser` (vencem em 7 dias: releia e reimporte). Ao ler o Google Flights, só aceitar a página quando
aparecer "N results returned" (antes disso os preços estão incompletos). Arquivos: browser_quotes_2026-11-09{,_return,_china_singapore}.txt.

## Regras de trabalho
- Python stdlib apenas, a menos que o usuário peça. SQLite em `data/` (ignorado pelo git; histórico real vive na branch `data`).
- Dados sintéticos (`provider=fixture`) ficam em `data/demo.sqlite` e nunca entram no ranking real.
- Nunca commitar chaves (`SERPAPI_KEY`, Telegram) nem dados do bilhete (passaporte, cartão).
- Não comprar nem preencher formulários de reserva; o usuário reserva no site da companhia.
- Mudou regra de itinerário? Atualize `tests/test_itineraries.py`.

## Próximos passos sugeridos
1. Usuário define dias em Moscou e quanto tempo quer em Pequim (`stay_rules_hours`) e se quer usar toda a janela até 25/mar.
2. Criar conta SerpApi (checar plano/cota) e rodar `trip.py run` de verdade; ajustar `stages` ao orçamento.
3. Provider de descoberta barata (Travelpayouts) antes do SerpApi — ver docs/PROVIDERS.md.
4. Repo privado no GitHub, secrets, rodar o workflow manualmente (cria a branch `data`).
5. Alerta no Telegram (bot + chat id) e, depois, camada de IA para pedidos em linguagem natural.
