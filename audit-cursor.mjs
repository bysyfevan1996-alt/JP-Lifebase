// audit-cursor.mjs
export function encodeAuditCursor(row) {
  const { id, created_at } = row || {};
  
  // Validate UUID format
  if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) {
    throw Object.assign(new Error('invalid_cursor'), { status: 400, code: 'invalid_cursor' });
  }
  
  // Validate created_at format
  if (typeof created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(created_at)) throw Object.assign(new Error('invalid_cursor'), { status: 400, code: 'invalid_cursor' });
  const date = new Date(created_at);
  if (isNaN(date.getTime())) {
    throw Object.assign(new Error('invalid_cursor'), { status: 400, code: 'invalid_cursor' });
  }
  if (date.toISOString() !== created_at) {
    throw Object.assign(new Error('invalid_cursor'), { status: 400, code: 'invalid_cursor' });
  }
  
  return Buffer.from(JSON.stringify([created_at, id]), 'utf8').toString('base64url');
}

export function decodeAuditCursor(value) {
  if (value == null || value === '') {
    return null;
  }
  
  try {
    if (typeof value !== 'string' || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid_cursor');
    const buffer = Buffer.from(value, 'base64url');
    if (buffer.toString('base64url') !== value) throw new Error('invalid_cursor');
    const text = buffer.toString('utf8');
    const parsed = JSON.parse(text);
    
    if (!Array.isArray(parsed) || parsed.length !== 2) {
      throw new Error('invalid_cursor');
    }
    
    const [createdAt, id] = parsed;
    
    // Validate UUID format
    if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) {
      throw new Error('invalid_cursor');
    }
    
    // Validate created_at format
    if (typeof createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt)) throw new Error('invalid_cursor');
    const date = new Date(createdAt);
    if (isNaN(date.getTime()) || date.toISOString() !== createdAt) {
      throw new Error('invalid_cursor');
    }
    
    return { createdAt, id };
  } catch (err) {
    throw Object.assign(new Error('invalid_cursor'), { status: 400, code: 'invalid_cursor' });
  }
}
