# Rotina diária de coleta (Google Flights no navegador, em dólar)

Objetivo: gerar **um novo snapshot por dia** de cada trecho. É isso que alimenta o histórico e as tendências (↓ caindo, ↑ subindo) do painel
*Price pulse* da home. Sem snapshots em dias diferentes não existe tendência, só linha de base.

1. **Câmbio do dia** (dólar é a moeda central; BRL e RUB são convertidos com a taxa do dia de cada cotação):
   `python trip.py fx` busca BRL (BCE via Frankfurter) e RUB (Banco Central da Rússia) para cada dia com cotação e guarda em `fx_rates`.
   Sem rede: `python trip.py fx --date AAAA-MM-DD --set BRL=5.52 RUB=82.1`.
2. **Lista de URLs**: `python trip.py urls` imprime uma URL do Google Flights por trecho/data do plano (`config/trip.json → stages`), já com
   `curr=USD&gl=br`, na ordem de prioridade (Rússia e cidades prioritárias primeiro).
3. **Ler cada página** (espere aparecer "N results returned"): rode `tools/gflights_extract.js` na página, p.ex. `extract('BEIJING','2027-02-14')`.
   Ele lê o texto acessível de cada voo e devolve linhas prontas: companhia, conexões (aeroporto:tempo), mala de mão e preço em USD.
4. **Salvar** em `data/browser_quotes_AAAA-MM-DD_<nome>.txt` (a data no nome define o dia da cotação; cabeçalho `#!currency=USD`) e importar:
   `python trip.py import data/browser_quotes_AAAA-MM-DD_<nome>.txt`. Reimportar o mesmo trecho/data **no mesmo dia** substitui a leitura anterior;
   em dias diferentes ela se acumula (é o histórico).
5. **Ver**: `python trip.py trends` (terminal) ou a home do estúdio (`python trip.py serve`).

Limites conhecidos: leitura manual de um site de terceiros (termos de uso do Google); o texto da página não traz bagagem despachada; cotações com mais
de 7 dias são ignoradas pelo estúdio e marcadas como *stale* no painel. Com uma chave do SerpApi, `python trip.py run` faz o mesmo automaticamente (a
chave devolve logos, conexões e aeroportos nativamente).
