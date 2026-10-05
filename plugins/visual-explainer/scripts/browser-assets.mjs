import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'],
  ['.webp', 'image/webp'], ['.avif', 'image/avif'], ['.bmp', 'image/bmp'],
  ['.svg', 'image/svg+xml'], ['.woff', 'font/woff'], ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'], ['.webm', 'video/webm'], ['.mp4', 'video/mp4'],
]);

function assetError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function contained(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

export async function resolveBrowserAsset(rootDirectory, relativePath) {
  const root = await realpath(rootDirectory);
  const candidate = path.resolve(root, relativePath);
  if (!contained(root, candidate)) throw assetError(403, 'Asset path escapes the artifact directory.');
  let file;
  try {
    file = await realpath(candidate);
    if (!contained(root, file)) throw assetError(403, 'Asset path escapes the artifact directory.');
    if (!(await stat(file)).isFile()) throw assetError(404, 'File not found.');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw assetError(404, 'File not found.');
    throw error;
  }
  return file;
}

export function browserAssetContentType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

export async function sendBrowserAsset(response, filePath) {
  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': browserAssetContentType(filePath),
    });
    response.end(contents);
  } catch (error) {
    if (error.code === 'ENOENT') throw assetError(404, 'File not found.');
    throw error;
  }
}

export async function serveBrowserArtifact({ filePath, html }) {
  const root = await realpath(path.dirname(filePath));
  const entry = `/${encodeURIComponent(path.basename(filePath))}`;
  const body = html ?? await readFile(filePath, 'utf8');
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') throw assetError(405, 'Method not allowed.');
      const pathname = (request.url || '/').split('?')[0];
      if (pathname === '/' || pathname === entry) {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(request.method === 'HEAD' ? undefined : body);
        return;
      }
      let relative;
      try { relative = decodeURIComponent(pathname).replace(/^\//, ''); }
      catch { throw assetError(400, 'Malformed asset path.'); }
      await sendBrowserAsset(response, await resolveBrowserAsset(root, relative));
    } catch (error) {
      response.writeHead(error.statusCode || 500);
      response.end(error.statusCode ? error.message : 'Asset serving failed.');
    }
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    server.close();
    throw error;
  }
  const origin = `http://127.0.0.1:${server.address().port}`;
  let closePromise;
  return {
    origin,
    url: `${origin}${entry}`,
    close() {
      if (!closePromise) closePromise = new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
      return closePromise;
    },
  };
}
