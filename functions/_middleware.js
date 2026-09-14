const PUBLIC = new Set([
  '/login.html',
  '/api/login',
  '/api/meli/callback'
]);

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value)
  );

  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

async function validSession(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);

  if (!match) return false;

  const token = match[1];
  const parts = token.split('.');

  if (parts.length !== 2) return false;

  const [payload, sig] = parts;

  try {
    const expected = await sign(
      payload,
      env.AUTH_SECRET || 'change-me'
    );

    if (expected !== sig) return false;

    const data = JSON.parse(
      atob(
        payload
          .replaceAll('-', '+')
          .replaceAll('_', '/')
      )
    );

    return data.exp > Date.now();
  } catch {
    return false;
  }
}

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;

  if (PUBLIC.has(path)) {
    return context.next();
  }

  if (path === '/api/logout') {
    return context.next();
  }

  if (await validSession(context.request, context.env)) {
    return context.next();
  }

  if (path.startsWith('/api/')) {
    return new Response(
      JSON.stringify({ error: 'Não autenticado' }),
      {
        status: 401,
        headers: {
          'content-type': 'application/json'
        }
      }
    );
  }

  return Response.redirect(
    new URL('/login.html', context.request.url),
    302
  );
}