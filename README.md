# Achadinhos & Promoções — Central de Ofertas V4

Sistema privado para transformar links de afiliado da Shopee e do Mercado Livre em ofertas prontas para WhatsApp.

## Fluxo V4

1. Cole o link de afiliado.
2. A busca inicia automaticamente.
3. O servidor resolve links curtos/redirecionamentos.
4. O sistema identifica Shopee ou Mercado Livre.
5. Busca automaticamente título, imagem, preço, preço anterior e desconto.
6. Gera a legenda pronta sem preenchimento manual.
7. O link original colado é preservado na mensagem.

## Estratégia de leitura

### Mercado Livre

- Extrai o ID MLB do anúncio.
- Tenta a API de itens do Mercado Livre primeiro.
- Usa os metadados/JSON-LD da página como fallback.
- `ML_ACCESS_TOKEN` é opcional e pode ser cadastrado no Cloudflare se a API exigir autenticação para algum recurso.

### Shopee

- Resolve o link curto antes da leitura.
- Extrai `itemId` e `shopId` quando disponíveis.
- Se `SHOPEE_APP_ID` e `SHOPEE_SECRET` estiverem configurados, usa a API de Afiliados Shopee (`productOfferV2`).
- Sem essas credenciais, tenta metadados/JSON-LD/dados embutidos na página automaticamente.

> Para a Shopee, a API de Afiliados é a forma mais confiável de manter a automação consistente. O fallback sem credenciais depende dos dados que a Shopee disponibilizar no HTML.

## Variáveis no Cloudflare Pages

Obrigatórias para o login:

- `APP_PASSWORD`
- `AUTH_SECRET`

Recomendadas para automação Shopee:

- `SHOPEE_APP_ID`
- `SHOPEE_SECRET`

Opcional para Mercado Livre:

- `ML_ACCESS_TOKEN`

## Deploy

O projeto continua preparado para Cloudflare Pages + Functions.

- Build command: `exit 0`
- Build output directory: `.`
- Branch: `main`

Depois de alterar variáveis/secrets no Cloudflare, faça um novo deploy.

## Segurança

O endpoint de leitura aceita apenas links dos domínios suportados da Shopee e Mercado Livre para evitar que a Function seja usada como proxy para URLs arbitrárias.
