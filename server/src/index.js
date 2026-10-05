import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ZodError } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, validateProductionConfig } from './config.js';
import router from './routes.js';
import { errorHandler, notFound, ApiError } from './errors.js';
import { applySchema } from './schema.js';

const app = express();
const dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(dirname, '../../out');

validateProductionConfig();

app.use(helmet({
  // The WeChat callback still uses an inline bootstrap script. Keep CSP disabled until that flow uses an HttpOnly cookie.
  contentSecurityPolicy: false,
  hsts: process.env.NODE_ENV === 'production' ? undefined : false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  originAgentCluster: false,
}));
const allowedOrigins = config.corsOrigin.split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.corsOrigin === '*' || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new ApiError(403, '请求来源不被允许'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '8mb' }));

app.use('/api', router);
app.use(express.static(staticDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    next();
    return;
  }
  res.sendFile(path.join(staticDir, 'index.html'));
});
app.use(notFound);

app.use((error, req, res, next) => {
  if (error instanceof ZodError) {
    errorHandler(new ApiError(400, '请求参数不正确', error.flatten()), req, res, next);
    return;
  }
  errorHandler(error, req, res, next);
});

try {
  await applySchema();
} catch (error) {
  if (process.env.NODE_ENV === 'production') throw error;
  console.warn('[api] database unavailable, starting with limited local dev mode:', error.message);
}

app.listen(config.port, () => {
  console.log(`[api] listening on http://0.0.0.0:${config.port}`);
});
