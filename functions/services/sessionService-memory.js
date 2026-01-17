// services/sessionService-memory.js
// Versión de fallback usando Map en memoria (para testing local sin Firestore)

const store = new Map();
const TTL_MS = 30 * 60 * 1000; // 30 minutos
const MESSAGE_BATCH_TIMEOUT = 15000; // 15 segundos de espera

function getOrCreateSession(key) {
  const s = store.get(key);
  if (s && Date.now() - s._ts < TTL_MS) return s;
  const fresh = {
    started: false,
    step: 'init',
    data: {},
    _ts: Date.now(),
    history: [],
    messages: [],
    timeoutId: null
  };
  store.set(key, fresh);
  return fresh;
}

function setSession(key, partial) {
  const s = getOrCreateSession(key);
  const merged = { ...s, ...partial, _ts: Date.now() };
  store.set(key, merged);
  return merged;
}

function clearSession(key) {
  if (store.has(key)) {
    const session = store.get(key);
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
    }
    store.delete(key);
  }
}

function addMessageToBuffer(from, messageText, callback) {
  const session = getOrCreateSession(from);

  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
  }

  session.messages.push(messageText);

  session.timeoutId = setTimeout(() => {
    const fullText = session.messages.join(' ');
    session.messages = [];
    session.timeoutId = null;
    callback(fullText);
  }, MESSAGE_BATCH_TIMEOUT);
}

function setDocumentNumber(key, documentNumber) {
  const session = getOrCreateSession(key);
  session.data.documentNumber = documentNumber;
  session._ts = Date.now();
  store.set(key, session);
  return session;
}

function getDocumentNumber(key) {
  const session = getOrCreateSession(key);
  return session.data.documentNumber;
}

module.exports = {
  getOrCreateSession,
  setSession,
  clearSession,
  addMessageToBuffer,
  setDocumentNumber,
  getDocumentNumber
};
