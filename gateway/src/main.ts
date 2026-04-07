import express from 'express';
import type { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import { config } from 'dotenv';
import { resolve } from 'path';

if (process.env.NODE_ENV !== 'production') {
  config({ path: resolve(__dirname, '../../.env') });
}

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_URL = process.env.SERVICE_URL || 'http://localhost:3002';
const UI_SERVICE_URL = process.env.UI_SERVICE_URL || 'http://localhost:5173';
const ADMIN_UI_SERVICE_URL = process.env.ADMIN_UI_SERVICE_URL || 'http://localhost:5174';

app.use(cors());
app.use(express.json());

const createServiceProxy = (serviceName: string, targetUrl: string) => {
  return createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    logger: console,
    pathRewrite: (path, req) => {
      return path;
    },
    on: {
      proxyReq: (proxyReq, req, res) => {
        const incomingReq = req as Request;
        console.log(`[${serviceName.toUpperCase()} →] ${incomingReq.method} ${incomingReq.url} -> ${targetUrl}${incomingReq.url}`);

        if (incomingReq.body && Object.keys(incomingReq.body).length > 0) {
          const bodyData = JSON.stringify(incomingReq.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
          console.log(`[${serviceName.toUpperCase()}] Body:`, incomingReq.body);
        }
      },
      proxyRes: (proxyRes, req, res) => {
        const incomingReq = req as Request;
        const statusCode = proxyRes.statusCode || 0;
        if (statusCode >= 400) {
          console.log(`[${serviceName.toUpperCase()} ←] ${incomingReq.method} ${incomingReq.url} <- ${statusCode} ❌ Error`);
        } else {
          console.log(`[${serviceName.toUpperCase()} ←] ${incomingReq.method} ${incomingReq.url} <- ${statusCode} ✓ Success`);
        }
      },
      error: (err, req, res) => {
        console.error(`[${serviceName.toUpperCase()} ERROR] ❌`, (err as Error).message);
        console.error(`[${serviceName.toUpperCase()} ERROR] Is the service running at ${targetUrl}?`);
        const serverRes = res as Response;
        serverRes.writeHead(500, {
          'Content-Type': 'application/json',
        });
        serverRes.end(JSON.stringify({ error: `${serviceName} service unavailable` }));
      },
    },
  });
};

app.use('/api', express.json(), createServiceProxy('unified', SERVICE_URL));

app.use('/admin', createProxyMiddleware({
  target: ADMIN_UI_SERVICE_URL,
  changeOrigin: true,
  ws: true,
  logger: { info: () => {}, warn: console.warn, error: console.error },
  on: {
    error: (err, req, res) => {
      console.error('[ADMIN UI PROXY ERROR]', err);
      const serverRes = res as Response;
      serverRes.writeHead(500, {
        'Content-Type': 'text/html',
      });
      serverRes.end('<h1>Admin UI service unavailable</h1>');
    },
  },
}));

app.use('/', createProxyMiddleware({
  target: UI_SERVICE_URL,
  changeOrigin: true,
  ws: true,
  logger: { info: () => {}, warn: console.warn, error: console.error },
  on: {
    error: (err, req, res) => {
      console.error('[UI PROXY ERROR]', err);
      const serverRes = res as Response;
      serverRes.writeHead(500, {
        'Content-Type': 'text/html',
      });
      serverRes.end('<h1>UI service unavailable</h1>');
    },
  },
}));

app.listen(PORT, () => {
  console.log(`🌙 Gateway ready at http://localhost:${PORT}`);
  console.log(`   /           → UI (${UI_SERVICE_URL})`);
  console.log(`   /admin/*    → Admin UI (${ADMIN_UI_SERVICE_URL})`);
  console.log(`   /api/*      → Unified Service (${SERVICE_URL})`);
});
