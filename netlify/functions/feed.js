exports.handler = async function(event) {
  const params = event.queryStringParameters || {};
  const feedKey = params.feed;
  const ogpUrl = params.ogp;

  const CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=1800'
  };

  // OGP取得モード
  if (ogpUrl) {
    try {
      const res = await fetch(ogpUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InputDashboard/1.0)', 'Accept': 'text/html' },
        redirect: 'follow', signal: AbortSignal.timeout(6000)
      });
      const html = await res.text();
      const gm = (prop) => {
        const ps = [
          new RegExp(`<meta[^>]*property=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'),
          new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${prop}["']`, 'i'),
          new RegExp(`<meta[^>]*name=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'),
        ];
        for (const p of ps) { const m = html.match(p); if (m) return m[1].trim(); }
        return '';
      };
      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({
          image: gm('og:image') || gm('twitter:image') || '',
          title: gm('og:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i)||[])[1] || '',
          siteName: gm('og:site_name') || ''
        })
      };
    } catch(e) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ image: '', title: '', siteName: '' }) };
    }
  }

  // RSS取得モード
  const FEEDS = {
    'bunshun':       'https://bunshun.jp/rss/list',
    'amazon':        'https://www.amazon.co.jp/rss/new-releases/books/',
    'note-scenario': 'https://note.com/hashtag/%E8%84%9A%E6%9C%AC/rss',
    'note-manga':    'https://note.com/hashtag/%E6%BC%AB%E7%94%BB/rss',
    'note-musical':  'https://note.com/hashtag/%E3%83%9F%E3%83%A5%E3%83%BC%E3%82%B8%E3%82%AB%E3%83%AB/rss',
    'note-movie':    'https://note.com/hashtag/%E6%98%A0%E7%94%BB/rss',
    'note-anime':    'https://note.com/hashtag/%E3%82%A2%E3%83%8B%E3%83%A1/rss',
    'eiga-com':      'https://eiga.com/buzz/rss',
    'eiga-natalie':  'https://natalie.mu/eiga/feed/news',
    'cinema-today':  'https://www.cinematoday.jp/rss/news',
    'comic-natalie': 'https://natalie.mu/comic/feed/news',
    'anime-natalie': 'https://natalie.mu/anime/feed/news',
    'animatetimes':  'https://www.animatetimes.com/rss/news.rdf',
    'oricon-anime':  'https://www.oricon.co.jp/rss/news/cat/anime/rss2_0.xml',
    'spice':         'https://spice.eplus.jp/rss',
    'stage-natalie': 'https://natalie.mu/stage/feed/news',
    'oricon-music':  'https://www.oricon.co.jp/rss/news/cat/music/rss2_0.xml',
    'natalie':       'https://natalie.mu/feed/news',
    'oricon':        'https://www.oricon.co.jp/rss/news/rss2_0.xml',
  };

  // YouTubeチャンネルIDの場合
  const ytId = params.yt;
  const rssUrl = ytId
    ? `https://www.youtube.com/feeds/videos.xml?channel_id=${ytId}`
    : feedKey ? FEEDS[feedKey] : null;

  if (!rssUrl) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'unknown feed', items: [] }) };
  }

  try {
    const res = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ status: 'error', message: `HTTP ${res.status}`, items: [] }) };
    }

    const xml = await res.text();
    const items = parseXml(xml);

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ status: 'ok', items, count: items.length }) };
  } catch(e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ status: 'error', message: e.message, items: [] }) };
  }
};

function parseXml(xml) {
  if (!xml) return [];
  const items = [];
  const re = /<entry[^>]*>([\s\S]*?)<\/entry>|<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null && items.length < 25) {
    const b = m[1] || m[2];
    const get = tag => {
      const r = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
      const rm = b.match(r); return rm ? rm[1].replace(/<[^>]+>/g, '').trim() : '';
    };
    const ga = (tag, attr) => {
      const r = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i');
      const rm = b.match(r); return rm ? rm[1] : '';
    };
    let link = get('link') || ga('link', 'href');
    if (!link) { const g = b.match(/<guid[^>]*>([^<]+)<\/guid>/i); if (g && g[1].startsWith('http')) link = g[1].trim(); }
    const mt = b.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i);
    const mc = b.match(/<media:content[^>]*url=["']([^"']+)["']/i);
    const enc = b.match(/<enclosure[^>]*url=["']([^"']+)["']/i);
    const imgD = b.match(/<img[^>]+src=["']([^"']+)["']/i);
    const pub = get('pubDate') || get('published') || get('updated') || '';
    const title = get('title');
    if (!title) continue;
    items.push({
      title,
      link,
      pubDate: pub,
      thumbnail: (mt && mt[1]) || (mc && mc[1]) || (enc && enc[1]) || (imgD && imgD[1]) || ''
    });
  }
  return items;
}
