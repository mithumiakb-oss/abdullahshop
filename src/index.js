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

    if (url.pathname === '/api/categories') {
      if (request.method === 'GET') {
        return handleCategoriesGet(request, env);
      }
      if (request.method === 'POST') {
        return handleCategoriesPost(request, env);
      }
    }

    // ---- SEO: sitemap, robots, এবং পেজভেদে টাইটেল/বিবরণ/শেয়ার ছবি ----
    if (request.method === 'GET') {
      if (url.pathname === '/sitemap.xml') {
        return handleSitemap(request, env);
      }
      if (url.pathname === '/robots.txt') {
        return handleRobots(request);
      }
      if (url.pathname === '/product' || url.pathname === '/product.html') {
        return handleProductPage(request, env);
      }
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return handleHomePage(request, env);
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

async function handleCategoriesGet(request, env) {
  const raw = await env.PRODUCTS_KV.get('categories');
  const categories = raw ? JSON.parse(raw) : [];
  return new Response(JSON.stringify(categories), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleCategoriesPost(request, env) {
  const authKey = request.headers.get('X-Admin-Key');
  if (!env.ADMIN_SECRET || authKey !== env.ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await request.json();
  const raw = await env.PRODUCTS_KV.get('categories');
  let categories = raw ? JSON.parse(raw) : [];

  if (body.action === 'delete' && body.name) {
    categories = categories.filter(c => c.name !== body.name);
  } else if (body.action === 'save' && body.category && body.category.name) {
    const name = String(body.category.name).trim();
    const image = String(body.category.image || '').trim();
    const idx = categories.findIndex(c => c.name === name);
    if (idx >= 0) {
      categories[idx] = { name, image };
    } else {
      categories.push({ name, image });
    }
  } else {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await env.PRODUCTS_KV.put('categories', JSON.stringify(categories));
  return new Response(JSON.stringify({ success: true, categories }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// ================= SEO =================
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// বিবরণ থেকে HTML ট্যাগ ও কোটেশন সরিয়ে সাধারণ লেখা বানায়
function plainText(s) {
  return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/["<>]/g, '');
}

function oneLine(s, max) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

async function readList(env, key) {
  try {
    const raw = await env.PRODUCTS_KV.get(key);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

async function readListSafe(env, key) {
  try {
    const raw = await env.PRODUCTS_KV.get(key);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : null;
  } catch (err) {
    return null;
  }
}

function productImage(p) {
  return (p && ((p.images && p.images[0]) || p.img)) || '';
}

// সাইটম্যাপ — পণ্য অ্যাডমিন থেকে যোগ/মুছলে নিজে থেকেই বদলে যায়, ডোমেইন বদলালেও ঠিক থাকে
async function handleSitemap(request, env) {
  const origin = new URL(request.url).origin;
  const products = await readList(env, 'products');
  const urls = [origin + '/'];
  products.forEach(p => {
    if (p && p.id) urls.push(origin + '/product?id=' + encodeURIComponent(p.id));
  });
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => '  <url><loc>' + escapeHtml(u) + '</loc></url>').join('\n') +
    '\n</urlset>\n';
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
  });
}

function handleRobots(request) {
  const origin = new URL(request.url).origin;
  // /api/ ইচ্ছা করেই আটকানো হয়নি — Google পেজ রেন্ডার করার সময় পণ্যের তথ্য ওখান থেকেই আনে
  const body = 'User-agent: *\nAllow: /\n\nSitemap: ' + origin + '/sitemap.xml\n';
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
  });
}

// পণ্যের পেজ: সার্ভার থেকেই সঠিক টাইটেল, বিবরণ, শেয়ার-ছবি ও Product ডেটা বসিয়ে দেয়
async function handleProductPage(request, env) {
  const res = await env.ASSETS.fetch(request);
  if (res.status !== 200) return res;   // .html থেকে রিডাইরেক্ট বা পাওয়া না গেলে যেমন আছে তেমন

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const products = await readListSafe(env, 'products');
  if (products === null) return res;    // ডেটাবেসে সমস্যা হলে পেজ যেমন আছে তেমন যাক
  const p = id ? products.find(x => x && x.id === id) : null;
  if (!p) {
    // পণ্য না থাকলে পেজ একই দেখাবে ("পণ্যটি পাওয়া যায়নি") কিন্তু স্ট্যাটাস 404, যাতে Google এটা ইনডেক্স না করে
    return new Response(res.body, { status: 404, headers: res.headers });
  }

  const origin = url.origin;
  const pageUrl = origin + '/product?id=' + encodeURIComponent(p.id);
  const imgRel = productImage(p);
  const image = imgRel ? new URL(imgRel, origin + '/').href : '';
  const title = p.name + ' — AbdullahShop.com';
  const price = p.price;
  const desc = oneLine(plainText(p.desc || p.name) + (price ? ' দাম ৳' + price + '।' : ''), 160);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: oneLine(plainText(p.desc || p.name), 300),
    url: pageUrl,
    offers: {
      '@type': 'Offer',
      url: pageUrl,
      priceCurrency: 'BDT',
      price: String(price),
      availability: 'https://schema.org/InStock'
    }
  };
  if (image) ld.image = [image];
  if (p.category) ld.category = p.category;

  const extra =
    '<link rel="canonical" href="' + escapeHtml(pageUrl) + '">' +
    '<meta property="og:type" content="product">' +
    '<meta property="og:site_name" content="AbdullahShop.com">' +
    '<meta property="og:title" content="' + escapeHtml(title) + '">' +
    '<meta property="og:description" content="' + escapeHtml(desc) + '">' +
    '<meta property="og:url" content="' + escapeHtml(pageUrl) + '">' +
    (image ? '<meta property="og:image" content="' + escapeHtml(image) + '">' : '') +
    '<meta name="twitter:card" content="' + (image ? 'summary_large_image' : 'summary') + '">' +
    '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>';

  return new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(title); } })
    .on('meta[name="description"]', { element(e) { e.setAttribute('content', desc); } })
    .on('head', { element(e) { e.append(extra, { html: true }); } })
    .transform(res);
}

// হোমপেজ: সঠিক ঠিকানা (canonical/og:url) ও শেয়ারের ছবি বসায়
async function handleHomePage(request, env) {
  const res = await env.ASSETS.fetch(request);
  if (res.status !== 200) return res;

  const origin = new URL(request.url).origin;
  const homeUrl = origin + '/';

  // শেয়ার-ছবি: চালু ব্যানারের প্রথম ছবি, না থাকলে প্রথম পণ্যের ছবি
  let imgRel = '';
  try {
    const raw = await env.PRODUCTS_KV.get('banner');
    const banner = raw ? JSON.parse(raw) : null;
    if (banner && banner.enabled && Array.isArray(banner.images) && banner.images[0]) imgRel = banner.images[0];
  } catch (err) { /* ignore */ }
  if (!imgRel) {
    const products = await readList(env, 'products');
    if (products.length) imgRel = productImage(products[0]);
  }
  const image = imgRel ? new URL(imgRel, origin + '/').href : '';

  const extra =
    '<link rel="canonical" href="' + escapeHtml(homeUrl) + '">' +
    '<meta property="og:site_name" content="AbdullahShop.com">' +
    '<meta property="og:url" content="' + escapeHtml(homeUrl) + '">' +
    (image ? '<meta property="og:image" content="' + escapeHtml(image) + '">' : '');

  return new HTMLRewriter()
    .on('head', { element(e) { e.append(extra, { html: true }); } })
    .transform(res);
}
