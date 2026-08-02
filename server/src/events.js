import { query } from './db.js';

export async function recordEvent(req, { userId = null, eventType, entityType = null, entityId = null, metadata = {} }) {
  try {
    await query(
      `insert into app_events (user_id, event_type, entity_type, entity_id, metadata, ip, user_agent)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        userId,
        eventType,
        entityType,
        entityId,
        JSON.stringify(metadata),
        req.ip || '',
        req.headers['user-agent'] || '',
      ],
    );
  } catch (error) {
    console.warn('[event] record failed', error.message);
  }
}
