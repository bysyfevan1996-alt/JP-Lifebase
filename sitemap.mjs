// Fixed canonical URLs: never derive public XML/robots addresses from request headers.
export function sitemapForHost(hostname) {
  const loc = hostname === 'jp-lifebase.com'
    ? 'https://jp-lifebase.com/denkikakaku'
    : 'https://www.jp-lifebase.com/';
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${loc}</loc>
  </url>
</urlset>
`;
}

export function robotsForHost(hostname) {
  let sitemapUrl;
  if (hostname === 'www.jp-lifebase.com') {
    sitemapUrl = 'https://www.jp-lifebase.com/sitemap.xml';
  } else if (hostname === 'jp-lifebase.com') {
    sitemapUrl = 'https://jp-lifebase.com/sitemap.xml';
  } else {
    sitemapUrl = 'https://www.jp-lifebase.com/sitemap.xml';
  }

  return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /account
Disallow: /admin
Sitemap: ${sitemapUrl}
`;
}
