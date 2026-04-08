import express from 'express';
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
    pathRewrite: (path) => {
      // Express strips /api from the path, so we need to add it back
      return '/api' + path;
    },
    on: {
      proxyReq: (proxyReq, req: any, res) => {
        console.log(`[${serviceName.toUpperCase()} →] ${req.method} ${req.url} -> ${targetUrl}${req.url}`);

        if (req.body && Object.keys(req.body).length > 0) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
          console.log(`[${serviceName.toUpperCase()}] Body:`, req.body);
        }
      },
      proxyRes: (proxyRes, req: any, res) => {
        const statusCode = proxyRes.statusCode || 0;
        if (statusCode >= 400) {
          console.log(`[${serviceName.toUpperCase()} ←] ${req.method} ${req.url} <- ${statusCode} ❌ Error`);
        } else {
          console.log(`[${serviceName.toUpperCase()} ←] ${req.method} ${req.url} <- ${statusCode} ✓ Success`);
        }
      },
      error: (err, req: any, res: any) => {
        console.error(`[${serviceName.toUpperCase()} ERROR] ❌`, err.message);
        console.error(`[${serviceName.toUpperCase()} ERROR] Is the service running at ${targetUrl}?`);
        res.writeHead(500, {
          'Content-Type': 'application/json',
        });
        res.end(JSON.stringify({ error: `${serviceName} service unavailable` }));
      },
    },
  });
};

app.use('/api', express.json(), createServiceProxy('unified', SERVICE_URL));

app.use('/admin', createProxyMiddleware({
  target: ADMIN_UI_SERVICE_URL,
  changeOrigin: true,
  ws: true,
  pathRewrite: (path) => '/admin' + path,
  on: {
    error: (err: any, req: any, res: any) => {
      console.error('[ADMIN UI PROXY ERROR]', err);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<h1>Admin UI service unavailable</h1>');
    },
  },
}));

app.use('/', createProxyMiddleware({
  target: UI_SERVICE_URL,
  changeOrigin: true,
  ws: true,
  on: {
    error: (err: any, req: any, res: any) => {
      console.error('[UI PROXY ERROR]', err);
      res.writeHead(500, {
        'Content-Type': 'text/html',
      });
      res.end('<h1>UI service unavailable</h1>');
    },
  },
}));

app.listen(PORT, () => {
  console.log(`🌙 Gateway ready at http://localhost:${PORT}`);
  console.log(`   /           → UI (${UI_SERVICE_URL})`);
  console.log(`   /admin/*    → Admin UI (${ADMIN_UI_SERVICE_URL})`);
  console.log(`   /api/*      → Unified Service (${SERVICE_URL})`);
});

