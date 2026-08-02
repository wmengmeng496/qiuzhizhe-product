export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function notFound(req, res) {
  res.status(404).json({ success: false, error: '接口不存在' });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  const status = error.status || 500;
  const payload = {
    success: false,
    error: error instanceof ApiError ? error.message : '服务器暂时不可用，请稍后重试',
  };

  if (error.details) {
    payload.details = error.details;
  }

  if (status >= 500) {
    console.error('[api:error]', error);
  }

  res.status(status).json(payload);
}
