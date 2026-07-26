const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = Number(process.env.API_PROXY_PORT || 3005);
const TARGET = process.env.API_PROXY_TARGET || 'https://urlopy-api-622924376884.europe-central2.run.app';
const targetBase = new URL(TARGET);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Cache-Control, Pragma, Accept, Last-Event-ID',
  );
}

const server = http.createServer((req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const targetUrl = new URL(req.url || '/', targetBase);
  const transport = targetUrl.protocol === 'https:' ? https : http;

  const outgoing = transport.request(
    {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      headers: {
        ...req.headers,
        host: targetUrl.host,
      },
    },
    (upstream) => {
      res.statusCode = upstream.statusCode || 502;
      for (const [key, value] of Object.entries(upstream.headers)) {
        if (value !== undefined) {
          res.setHeader(key, value);
        }
      }
      setCors(res);
      upstream.pipe(res);
    },
  );

  outgoing.on('error', (error) => {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ message: 'Proxy error', detail: String(error) }));
  });

  req.pipe(outgoing);
});

server.listen(PORT, () => {
  console.log(`[dev-api-proxy] listening on http://localhost:${PORT}`);
  console.log(`[dev-api-proxy] target ${targetBase.origin}`);
});
