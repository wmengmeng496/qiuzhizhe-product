import './env.js';
import { aiProvider } from '../config/ai.config.js';


function joinUrl(baseURL, path) {
  return `${baseURL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export const config = {
  port: Number(process.env.PORT || 8080),
  release: process.env.APP_RELEASE || process.env.GIT_COMMIT || 'development',
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
  sms: {
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || '',
    signName: process.env.ALIBABA_CLOUD_SMS_SIGN_NAME || '',
    templateCode: process.env.ALIBABA_CLOUD_SMS_TEMPLATE_CODE || 'SMS_337360301',
    endpoint: process.env.ALIBABA_CLOUD_SMS_ENDPOINT || 'dysmsapi.aliyuncs.com',
  },
};

export function validateProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;

  const required = [
    ['JWT_SECRET', config.jwtSecret],
    ['DATABASE_URL', process.env.DATABASE_URL],
    ['CORS_ORIGIN', process.env.CORS_ORIGIN],
  ];
  const missing = required
    .filter(([, value]) => !value || value === 'dev-only-change-me' || value === '*')
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`生产环境缺少安全配置：${missing.join(', ')}`);
  }
  if (config.jwtSecret.length < 32) {
    throw new Error('生产环境 JWT_SECRET 至少需要 32 个字符');
  }
}

export const planLimits = {
  free: {
    resumeOptimize: 3,
    interviewReview: 1,
    careerPhoto: 1,
    allowedModels: ['gpt-5.6-sol', 'gpt-3.5', 'gpt-4o'],
  },
  pro: {
    resumeOptimize: 50,
    interviewReview: 10,
    careerPhoto: 10,
    allowedModels: ['gpt-5.6-sol', 'gpt-3.5', 'gpt-4o', 'gpt-4'],
  },
  ultimate: {
    resumeOptimize: 300,
    interviewReview: 100,
    careerPhoto: 50,
    allowedModels: ['gpt-5.6-sol', 'gpt-3.5', 'gpt-4o', 'gpt-4', 'claude-3', 'claude-3.5', 'gemini-pro'],
  },
};
