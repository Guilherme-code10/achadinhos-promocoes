# Ativação das integrações

Esta branch prepara OAuth Mercado Livre com PKCE, estado de uso único vinculado ao navegador e tokens cifrados em AES-GCM no D1. O token é renovado na consulta, com trava no banco para evitar duas renovações simultâneas. Falhas exigem nova tentativa ou reconexão; nunca exibir tokens em telas/logs.

## Cloudflare Pages

1. Criar um banco D1 e aplicar `migrations/0001_integrations.sql`.
2. Vincular o banco ao Pages com nome `DB`. Usar bancos e credenciais separados em preview e produção.
3. Configurar secrets `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `TOKEN_SECRET` (aleatório, pelo menos 32 caracteres).
4. Configurar `ML_REDIRECT_URI` exatamente igual ao callback HTTPS cadastrado no aplicativo Mercado Livre. No domínio oficial: `https://achadinhos-promocoes.pages.dev/api/meli/callback`.
5. Habilitar PKCE S256 no aplicativo Mercado Livre, conforme sua configuração. Redeploy após atualizar bindings/secrets.
6. Abrir `/integracoes.html`, entrar no sistema e clicar em Conectar Mercado Livre. Confirmar a autorização na loja.
7. Consultar anúncios reais para confirmar permissões. OAuth concluído não garante acesso a todo anúncio de terceiros.

Manter `TOKEN_SECRET` estável: sua substituição exige reconectar a conta. O painel não revela credenciais. O fluxo conecta uma conta Mercado Livre para a instalação privada inteira. `ML_ACCESS_TOKEN` permanece como compatibilidade quando não existe conta salva; não renova automaticamente. Não cadastrar segredos no Git.

O primeiro callback será diferente do antigo: não exibe código de autorização e não aceita callback sem iniciar a conexão pelo painel.

## Verificação

Node 24 ou superior: `node --test tests/*.test.mjs`. Os testes usam serviços simulados; validar D1 e OAuth reais em preview antes de promover. O envio automático WhatsApp e o acompanhamento de vendas ainda não estão implementados. A tela integrações mostra configuração e autorização salva, não promete disponibilidade das APIs.

Documentação: https://developers.mercadolivre.com.br/autenticacao-e-autorizacao
