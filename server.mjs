import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4179);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp':'image/webp', '.md': 'text/plain; charset=utf-8', '.json': 'application/json' };
http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if(name.startsWith('/local-typefaces/')){
      const host=req.headers.host||'',origin=req.headers.origin;
      if(!['127.0.0.1:'+port,'localhost:'+port].includes(host)||req.headers['sec-fetch-site']==='cross-site'||(origin&&origin!=='http://'+host)){res.writeHead(403).end();return;}
      const id=name.slice('/local-typefaces/'.length),sources=JSON.parse(await readFile(path.join(root,'local-font-sources.json'),'utf8'));
      const source=sources[id],fontRoot=JSON.parse(await readFile(path.join(root,'local-font-root.json'),'utf8')).root;
      if(typeof fontRoot!=='string'||!path.isAbsolute(fontRoot)){res.writeHead(404).end();return;}
      const allowed=path.resolve(fontRoot);
      if(!source||!path.resolve(source).startsWith(allowed+path.sep)){res.writeHead(404).end();return;}
      const bytes=await readFile(source);
      res.writeHead(200,{'Content-Type':path.extname(source).toLowerCase()==='.otf'?'font/otf':'font/ttf','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);return;
    }
    const target = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`滚墨印记 · http://127.0.0.1:${port}`));
