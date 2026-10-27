import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const BASE = "/matkonim";
export const dist = resolve(fileURLToPath(new URL("../dist", import.meta.url)));

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

export function createPreviewServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname === "/") {
        res.writeHead(302, { Location: `${BASE}/` });
        res.end();
        return;
      }
      if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || "/";
      if (rel.endsWith("/")) rel += "index.html";
      const file = resolve(dist, `.${rel}`);
      if (file !== dist && !file.startsWith(dist + sep)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("forbidden");
        return;
      }
      let info;
      try {
        info = await stat(file);
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      if (info.isDirectory()) {
        res.writeHead(302, { Location: `${url.pathname}/` });
        res.end();
        return;
      }
      const type = types[extname(file)] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("error");
    }
  });
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const port = Number(process.env.PORT || 4173);
  const server = createPreviewServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`http://127.0.0.1:${port}${BASE}/`);
  });
}
