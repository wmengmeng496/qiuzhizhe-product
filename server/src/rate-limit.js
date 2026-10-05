export function rateLimit({ windowMs, max, key = (req) => req.ip || 'unknown', message = '请求过于频繁，请稍后再试' }) {
  // Each route gets an independent bucket map.
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const bucketKey = String(key(req));
    const current = buckets.get(bucketKey);
    if (!current || current.expiresAt <= now) {
      buckets.set(bucketKey, { count: 1, expiresAt: now + windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > max) {
      res.status(429).json({ success: false, error: message });
      return;
    }
    next();
  };
}
