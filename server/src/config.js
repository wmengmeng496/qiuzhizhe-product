import dotenv from 'dotenv';
import { aiProvider } from '../config/ai.config.js';

dotenv.config();
dotenv.config({ path: '../.env', override: false });

function joinUrl(baseURL, path) {
  return `${baseURL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export const config = {
  port: Number(process.env.PORT || 8080),
  publicUrl: process.env.PUBLIC_URL || process.env.APP_PUBLIC_URL || '',
  databaseUrl: process.env.DATABASE_URL || 'postgres://job_assistant:job_assistant@localhost:5432/job_assistant',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  adminToken: process.env.ADMIN_TOKEN || '',
  ai: {
    url: process.env.CUSTOM_PROXY_URL || joinUrl(aiProvider.baseURL, aiProvider.chatCompletionsPath),
    key: aiProvider.apiKey,
    timeoutMs: aiProvider.timeoutMs,
  },
  corsOrigin: process.env.CORS_ORIGIN || '*',
  wechat: {
    appId: process.env.WECHAT_APP_ID || '',
    appSecret: process.env.WECHAT_APP_SECRET || '',
    redirectUri: process.env.WECHAT_REDIRECT_URI || '',
  },
};

export const planLimits = {
  free: {
    resumeOptimize: 3,
    interviewReview: 1,
    allowedModels: ['gpt-3.5', 'gpt-4o'],
  },
  pro: {
    resumeOptimize: 50,
    interviewReview: 10,
    allowedModels: ['gpt-3.5', 'gpt-4o', 'gpt-4'],
  },
  ultimate: {
    resumeOptimize: 300,
    interviewReview: 100,
    allowedModels: ['gpt-3.5', 'gpt-4o', 'gpt-4', 'claude-3', 'claude-3.5', 'gemini-pro'],
  },
};
