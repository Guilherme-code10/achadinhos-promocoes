export async function onRequestGet({ request }) {
  const url = new URL(request.url);

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return new Response(
      `Erro ao autorizar Mercado Livre: ${error}`,
      {
        status: 400,
        headers: { 'content-type': 'text/plain; charset=UTF-8' }
      }
    );
  }

  if (!code) {
    return new Response(
      'Nenhum código de autorização foi recebido.',
      {
        status: 400,
        headers: { 'content-type': 'text/plain; charset=UTF-8' }
      }
    );
  }

  return new Response(
`Mercado Livre autorizado com sucesso! ✅

Código recebido:

${code}

Agora volte para o Achadinhos & Promoções.`,
    {
      headers: {
        'content-type': 'text/plain; charset=UTF-8'
      }
    }
  );
}