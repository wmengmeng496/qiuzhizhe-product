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
     returning user_id, period, resume_optimize_used, interview_review_used, career_photo_used`,
    [userId, period],
  );
  return result.rows[0];
}

export async function assertAndConsumeUsage(client, user, kind) {
  const limits = planLimits[user.plan] || planLimits.free;
  const columns = {
    resume: ['resume_optimize_used', limits.resumeOptimize],
    interview: ['interview_review_used', limits.interviewReview],
    careerPhoto: ['career_photo_used', limits.careerPhoto],
  };
  const [column, limit] = columns[kind] || columns.resume;
  const period = currentPeriod();
  await getUsage(client, user.id);
  const result = await client.query(
    `update usage_quotas
     set ${column} = ${column} + 1, updated_at = now()
     where user_id = $1 and period = $2 and ${column} < $3
     returning ${column}`,
    [user.id, period, limit],
  );
  if (result.rowCount === 0) {
    throw new ApiError(402, `本月次数已用完，当前套餐上限为 ${limit} 次`);
  }
  return { period, used: result.rows[0][column], limit };
}

export async function refundUsage(client, user, kind, period = currentPeriod()) {
  const column = {
    resume: 'resume_optimize_used',
    interview: 'interview_review_used',
    careerPhoto: 'career_photo_used',
  }[kind] || 'resume_optimize_used';
  await client.query(
    `update usage_quotas set ${column} = greatest(${column} - 1, 0), updated_at = now()
     where user_id = $1 and period = $2`,
    [user.id, period],
  );
}

export function assertModelAllowed(user, model) {
  if (model === 'server-default' || model === 'default') return;

  const limits = planLimits[user.plan] || planLimits.free;
  if (!limits.allowedModels.includes(model)) {
    throw new ApiError(403, '当前会员方案暂不支持该模型');
  }
}
