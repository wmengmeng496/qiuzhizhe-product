import { planLimits } from './config.js';
import { ApiError } from './errors.js';

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

export async function getUsage(client, userId) {
  const period = currentPeriod();
  const result = await client.query(
    `insert into usage_quotas (user_id, period)
     values ($1, $2)
     on conflict (user_id, period) do update set period = excluded.period
     returning user_id, period, resume_optimize_used, interview_review_used`,
    [userId, period],
  );
  return result.rows[0];
}

export async function assertAndConsumeUsage(client, user, kind) {
  const usage = await getUsage(client, user.id);
  const limits = planLimits[user.plan] || planLimits.free;
  const column = kind === 'resume' ? 'resume_optimize_used' : 'interview_review_used';
  const limit = kind === 'resume' ? limits.resumeOptimize : limits.interviewReview;

  if (usage[column] >= limit) {
    throw new ApiError(402, `本月次数已用完，当前套餐上限为 ${limit} 次`);
  }

  await client.query(
    `update usage_quotas set ${column} = ${column} + 1 where user_id = $1 and period = $2`,
    [user.id, usage.period],
  );
}

export function assertModelAllowed(user, model) {
  if (model === 'server-default' || model === 'default') return;

  const limits = planLimits[user.plan] || planLimits.free;
  if (!limits.allowedModels.includes(model)) {
    throw new ApiError(403, '当前会员方案暂不支持该模型');
  }
}
