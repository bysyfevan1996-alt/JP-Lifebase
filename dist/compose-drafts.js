import {normalizeTopicTags} from './topic-tags.js?v=20261021223719402';
const PREFIX = 'jlb-compose-v1:';
const TTL = 7 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set(['', 'housing', 'visa', 'work', 'car', 'daily']);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isUuid = value => typeof value === 'string' && UUID.test(value);
function isUser(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return false;
  try { encodeURIComponent(value); return true; } catch { return false; }
}
const isTime = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

// Copy only persisted fields; credentials and other form properties never enter storage.
function copyPayload(value, pending = false) {
  if (!isObject(value) || typeof value.title !== 'string' || value.title.length > 140 ||
      typeof value.body !== 'string' || value.body.length > 12000 ||
      typeof value.category !== 'string' || !CATEGORIES.has(value.category) ||
      typeof value.language !== 'string' || value.language.length === 0 || value.language.length > 35 ||
      !isUuid(value.clientRequestId) || (pending && value.bodyFormat !== 'markdown')) return null;
  const copy = {
    title: value.title,
    body: value.body,
    category: value.category,
    language: value.language,
    clientRequestId: value.clientRequestId,
  };
  if (Object.hasOwn(value,'tagIds')) {
    try { copy.tagIds=normalizeTopicTags(value.tagIds); } catch { return null; }
  }
  if (Object.hasOwn(value,'attachmentIds')) {
    if(!Array.isArray(value.attachmentIds)||value.attachmentIds.length>5) return null;
    const ids=[];
    for(const id of value.attachmentIds){if(!isUuid(id)||ids.includes(id.toLowerCase()))return null;ids.push(id.toLowerCase());}
    copy.attachmentIds=ids;
  }
  if (pending) copy.bodyFormat = 'markdown';
  return copy;
}

function copyDraft(value) {
  const copy = copyPayload(value);
  if (!copy) return null;
  if (Object.hasOwn(value, 'pendingSubmission')) {
    const pending = copyPayload(value.pendingSubmission, true);
    if (!pending) return null;
    copy.pendingSubmission = pending;
  }
  return copy;
}

function copyRecord(value, userId) {
  if (!isObject(value) || value.version !== 1 || value.userId !== userId ||
      !isUuid(value.revision) || !isUuid(value.writerId) ||
      !isTime(value.updatedAt) || !isTime(value.expiresAt) || value.expiresAt !== value.updatedAt + TTL) return null;
  const draft = copyDraft(value.draft);
  if (!draft) return null;
  return {
    version: 1, userId, revision: value.revision, writerId: value.writerId,
    updatedAt: value.updatedAt, expiresAt: value.expiresAt, draft,
  };
}

export function createDraftStore({storage, now = Date.now, writerId = crypto.randomUUID()} = {}) {
  function read(userId) {
    if (!isUser(userId)) return {status: 'invalid'};
    const key = PREFIX + encodeURIComponent(userId);
    let raw;
    try {
      raw = storage.getItem(key);
    } catch {
      return {status: 'unavailable'};
    }
    if (raw === null) return {status: 'empty'};
    let record;
    try {
      record = copyRecord(JSON.parse(raw), userId);
    } catch {
      record = null;
    }
    let status = 'invalid';
    if (record) {
      let timestamp;
      try { timestamp = now(); } catch { return {status: 'unavailable'}; }
      if (!isTime(timestamp)) return {status: 'unavailable'};
      if (timestamp < record.expiresAt) return {status: 'ok', record};
      status = 'expired';
    }
    try {
      storage.removeItem(key);
      return {status};
    } catch {
      return {status: 'unavailable'};
    }
  }

  function expected(userId, expectedRevision) {
    if (!isUser(userId) || (expectedRevision !== undefined && expectedRevision !== null && !isUuid(expectedRevision))) return {status: 'invalid'};
    const current = read(userId);
    if (current.status === 'unavailable') return current;
    const record = current.status === 'ok' ? current.record : null;
    if (expectedRevision === undefined || expectedRevision !== (record?.revision ?? null)) return {status: 'conflict', record};
    return {status: 'ok'};
  }

  // A revision check detects stale editors; localStorage provides no atomic cross-tab CAS.
  function write(userId, draft, expectedRevision) {
    let clean;
    try { clean = copyDraft(draft); } catch { return {status: 'invalid'}; }
    if (!clean || !isUser(userId)) return {status: 'invalid'};
    const check = expected(userId, expectedRevision);
    if (check.status !== 'ok') return check;
    try {
      const updatedAt = now();
      if (!isTime(updatedAt) || !isUuid(writerId)) return {status: 'unavailable'};
      const record = {
        version: 1, userId, revision: crypto.randomUUID(), writerId,
        updatedAt, expiresAt: updatedAt + TTL, draft: clean,
      };
      storage.setItem(PREFIX + encodeURIComponent(userId), JSON.stringify(record));
      return {status: 'ok', record};
    } catch {
      return {status: 'unavailable'};
    }
  }

  function remove(userId, expectedRevision) {
    const check = expected(userId, expectedRevision);
    if (check.status !== 'ok') return check;
    try {
      storage.removeItem(PREFIX + encodeURIComponent(userId));
      return {status: 'ok'};
    } catch {
      return {status: 'unavailable'};
    }
  }

  return {read, write, remove};
}
