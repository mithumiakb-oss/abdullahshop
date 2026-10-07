export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/products') {
      if (request.method === 'GET') {
        return handleGet(request, env);
      }
      if (request.method === 'POST') {
        return handlePost(request, env);
      }
    }

    if (url.pathname === '/api/banner') {
      if (request.method === 'GET') {
        return handleBannerGet(request, env);
      }
      if (request.method === 'POST') {
        return handleBannerPost(request, env);
      }
    }

    // Everything else — serve the static site (index.html, product.html, images, etc.)
    return env.ASSETS.fetch(request);
  }
};

async function handleGet(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  const raw = await env.PRODUCTS_KV.get('products');
  const products = raw ? JSON.parse(raw) : [];

  if (id) {
    const product = products.find(p => p.id === id) || null;
    return new Response(JSON.stringify(product), {
      status: product ? 200 : 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify(products), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handlePost(request, env) {
  const authKey = request.headers.get('X-Admin-Key');
  if (!env.ADMIN_SECRET || authKey !== env.ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await request.json();

  // Used by admin.html just to verify the password without changing anything
  if (body.action === '__check__') {
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const raw = await env.PRODUCTS_KV.get('products');
  let products = raw ? JSON.parse(raw) : [];

  if (body.action === 'delete') {
    products = products.filter(p => p.id !== body.id);
  } else if (body.action === 'save' && body.product && body.product.id) {
    const idx = products.findIndex(p => p.id === body.product.id);
    if (idx >= 0) {
      products[idx] = body.product;
    } else {
      products.push(body.product);
    }
  } else {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await env.PRODUCTS_KV.put('products', JSON.stringify(products));
  return new Response(JSON.stringify({ success: true, products }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleBannerGet(request, env) {
  const raw = await env.PRODUCTS_KV.get('banner');
  const banner = raw ? JSON.parse(raw) : { enabled: false };
  return new Response(JSON.stringify(banner), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleBannerPost(request, env) {
  const authKey = request.headers.get('X-Admin-Key');
  if (!env.ADMIN_SECRET || authKey !== env.ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await request.json();
  if (!body.banner) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await env.PRODUCTS_KV.put('banner', JSON.stringify(body.banner));
  return new Response(JSON.stringify({ success: true, banner: body.banner }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
