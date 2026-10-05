import { randomUUID } from 'node:crypto';
import { planLimits } from './config.js';
import { ApiError } from './errors.js';

const usageByUser = new Map();
const optimizationsByUser = new Map();

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

export function getDevUsage(userId) {
  const period = currentPeriod();
  const existing = usageByUser.get(userId);
  if (existing?.period === period) return existing;

  const usage = {
    period,
    resume_optimize_used: 0,
    interview_review_used: 0,
    career_photo_used: 0,
  };
  usageByUser.set(userId, usage);
  return usage;
}

export function consumeDevResumeUsage(user) {
  const usage = getDevUsage(user.id);
  const limit = (planLimits[user.plan] || planLimits.free).resumeOptimize;
  if (usage.resume_optimize_used >= limit) {
    throw new ApiError(402, `本月次数已用完，当前套餐上限为 ${limit} 次`);
  }
  usage.resume_optimize_used += 1;
  return { period: usage.period, used: usage.resume_optimize_used, limit };
}

export function consumeDevInterviewUsage(user) {
  const usage = getDevUsage(user.id);
  const limit = (planLimits[user.plan] || planLimits.free).interviewReview;
  if (usage.interview_review_used >= limit) {
    throw new ApiError(402, `本月次数已用完，当前套餐上限为 ${limit} 次`);
  }
  usage.interview_review_used += 1;
  return { period: usage.period, used: usage.interview_review_used, limit };
}

export function refundDevResumeUsage(userId, period) {
  const usage = getDevUsage(userId);
  if (usage.period !== period) return;
  usage.resume_optimize_used = Math.max(0, usage.resume_optimize_used - 1);
}

export function refundDevInterviewUsage(userId, period) {
  const usage = getDevUsage(userId);
  if (usage.period !== period) return;
  usage.interview_review_used = Math.max(0, usage.interview_review_used - 1);
}

export function consumeDevCareerPhotoUsage(user) {
  const usage = getDevUsage(user.id);
  const limit = (planLimits[user.plan] || planLimits.free).careerPhoto;
  if (usage.career_photo_used >= limit) {
    throw new ApiError(402, `本月形象照次数已用完，当前套餐上限为 ${limit} 次`);
  }
  usage.career_photo_used += 1;
  return { period: usage.period, used: usage.career_photo_used, limit };
}

export function refundDevCareerPhotoUsage(userId, period) {
  const usage = getDevUsage(userId);
  if (usage.period !== period) return;
  usage.career_photo_used = Math.max(0, usage.career_photo_used - 1);
}

export function saveDevResumeOptimization(userId, record) {
  const saved = {
    id: `local-${randomUUID()}`,
    created_at: new Date().toISOString(),
    status: 'completed',
    ...record,
  };
  const records = optimizationsByUser.get(userId) || [];
  optimizationsByUser.set(userId, [saved, ...records].slice(0, 100));
  return saved;
}

export function listDevResumeOptimizations(userId) {
  return optimizationsByUser.get(userId) || [];
}

export function deleteDevUserData(userId, { preserveUsage = false } = {}) {
  if (!preserveUsage) usageByUser.delete(userId);
  optimizationsByUser.delete(userId);
}
