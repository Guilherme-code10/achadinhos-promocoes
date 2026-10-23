# Robô de ofertas — primeira versão

Motor Node 24 + SQLite, sem dependências npm. Executa simulação; o CLI não possui envio real nem conector WhatsApp. A função `tick` oferece um ponto de integração para um conector futuro, mas não basta ativar uma variável para enviar mensagens.

## Executar

Na raiz do repositório, com Node 24:

```sh
node bot/cli.mjs status
node bot/cli.mjs add oferta.json
node bot/cli.mjs resume
node bot/cli.mjs once
node bot/cli.mjs run
```

Exemplo de `oferta.json` (substitua pelo produto e horário reais):

```json
{"url":"https://produto.mercadolivre.com.br/MLB-123456789-produto","productId":"MLB123456789","price":"29,90","dueAt":"2026-12-01T10:00:00-03:00"}
```

`pause` pausa a fila; `cancel ID` cancela ofertas ainda não enviadas. `status` mostra fila e histórico. O processo precisa estar executando para atender horários. Datas usam fuso explícito; exemplos acima usam Brasília. A primeira execução começa pausada. `once` processa uma oferta vencida; `run` verifica a fila a cada cinco segundos. Não use duas instâncias do processo.

## Dados e credenciais

SQLite fica em `bot-data/queue.sqlite`, persistente no disco; não versionar. Em hospedagem, usar volume persistente e backup. Não há hospedagem provisionada nesta etapa.

O CLI reutiliza a consulta de produtos do projeto, com `SHOPEE_APP_ID`, `SHOPEE_SECRET` e `ML_ACCESS_TOKEN` disponíveis no ambiente. Não colar secrets no código, histórico do terminal ou Git. O banco D1 e os tokens OAuth da Cloudflare não estão disponíveis no processo Node: a ponte entre esses ambientes ainda precisa ser implementada. Token manual Mercado Livre pode expirar.

## Comportamento

- Horário alcançado → consulta nova → valida ID, valor e idade da consulta → simula a mensagem.
- A consulta deve ter no máximo dois minutos; faixas de variações e preços diferentes do aprovado bloqueiam a oferta.
- Preserva o link afiliado original. Não gera conversão de links nem procura campeões de vendas.
- `simulated` significa nenhuma mensagem enviada; `sent` só existe se um futuro conector devolver um identificador de mensagem.
- Um erro depois de iniciar envio fica `uncertain`; nunca há repetição automática. Conferir no destino antes de criar outra oferta.
- Se o processo cair em `checking` ou `sending`, a oferta permanece travada. Pare todos os processos e investigue antes de reconciliar o registro. Abrir `status` nunca libera travas de outro processo.
- A pausa vale antes de iniciar envio. Não cancela uma requisição já entregue ao conector.

## Pendências

Painel web da fila, sincronização com D1, conexão WhatsApp e destino autorizado, busca automática de ofertas, métricas de vendas/comissão e execução na nuvem. Não existe rotina ativa em segundo plano no ChatGPT.

Testes: `node --test tests/*.test.mjs`. Cobrem pausa, mudança de preço/identidade, faixa de preço, consulta antiga, concorrência e resultado incerto. APIs são simuladas, sem envio externo.
