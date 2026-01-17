// services/sessionService.js

let firestoreService;
let useMemory = false;

try {
  firestoreService = require('./firestoreService');
} catch (error) {
  console.warn('⚠️ Firestore no disponible, usando sesiones en memoria');
  useMemory = true;
}

const memoryStore = new Map();
const TTL_MS = 30 * 60 * 1000;
const MESSAGE_BATCH_TIMEOUT = 10000;

const activeTimeouts = new Map();
const processingFlags = new Map();
const writeQueues = new Map();

// === FUNCIONES EN MEMORIA (FALLBACK) ===

function getOrCreateSessionMemory(key) {
  const s = memoryStore.get(key);
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
  memoryStore.set(key, fresh);
  return fresh;
}

function setSessionMemory(key, partial) {
  const s = getOrCreateSessionMemory(key);
  const merged = { ...s, ...partial, _ts: Date.now() };
  memoryStore.set(key, merged);
  return merged;
}

function clearSessionMemory(key) {
  if (memoryStore.has(key)) {
    const session = memoryStore.get(key);
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
    }
    memoryStore.delete(key);
  }
}

// === FUNCIONES PRINCIPALES ===

async function getOrCreateSession(key) {
  if (useMemory) {
    return getOrCreateSessionMemory(key);
  }

  try {
    const existingSession = await firestoreService.getSession(key);
    if (existingSession) {
      return existingSession;
    }

    const freshSession = {
      started: false,
      step: 'init',
      data: {},
      history: [],
      messages: [],
      timeoutId: null
    };

    await firestoreService.saveSession(key, freshSession);
    return freshSession;
  } catch (error) {
    console.error('❌ Error en getOrCreateSession, usando memoria:', error);
    useMemory = true;
    return getOrCreateSessionMemory(key);
  }
}

async function setSession(key, partial) {
  if (useMemory) {
    return setSessionMemory(key, partial);
  }

  try {
    const existingSession = await getOrCreateSession(key);
    const merged = { ...existingSession, ...partial };
    const { timeoutId, ...dataToSave } = merged;
    return await firestoreService.saveSession(key, dataToSave);
  } catch (error) {
    console.error('❌ Error en setSession, usando memoria:', error);
    useMemory = true;
    return setSessionMemory(key, partial);
  }
}

async function clearSession(key) {
  if (activeTimeouts.has(key)) {
    clearTimeout(activeTimeouts.get(key));
    activeTimeouts.delete(key);
  }

  if (useMemory) {
    return clearSessionMemory(key);
  }

  try {
    await firestoreService.deleteSession(key);
  } catch (error) {
    console.error('❌ Error en clearSession:', error);
  }
}

// Cola de operaciones para evitar race conditions
async function queueOperation(key, operation) {
  if (!writeQueues.has(key)) {
    writeQueues.set(key, Promise.resolve());
  }

  const currentQueue = writeQueues.get(key);
  const newQueue = currentQueue.then(operation).catch((error) => {
    console.error(`❌ Error en operación en cola para ${key}:`, error);
    throw error;
  });

  writeQueues.set(key, newQueue);
  return newQueue;
}

function hasEndPunctuation(text) {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed);
}

async function processMessageBuffer(from, callback) {
  if (processingFlags.get(from)) {
    return;
  }

  try {
    processingFlags.set(from, true);

    if (activeTimeouts.has(from)) {
      clearTimeout(activeTimeouts.get(from));
      activeTimeouts.delete(from);
    }

    const updatedSession = await getOrCreateSession(from);

    if (!updatedSession.messages || updatedSession.messages.length === 0) {
      processingFlags.delete(from);
      return;
    }

    const fullText = updatedSession.messages.join(' ');
    await setSession(from, { messages: [] });
    await callback(fullText);

  } catch (error) {
    console.error('❌ Error en processMessageBuffer:', error);
  } finally {
    processingFlags.delete(from);
  }
}

async function addMessageToBuffer(from, messageText, callback) {
  return queueOperation(from, async () => {
    try {
      const session = await getOrCreateSession(from);

      if (activeTimeouts.has(from)) {
        clearTimeout(activeTimeouts.get(from));
        activeTimeouts.delete(from);
      }

      if (!Array.isArray(session.messages)) {
        session.messages = [];
      }

      session.messages.push(messageText);
      await setSession(from, { messages: session.messages });

      // Procesar inmediatamente si tiene puntuación final
      if (hasEndPunctuation(messageText)) {
        await processMessageBuffer(from, callback);
        return;
      }

      // Timeout de 10 segundos
      const timeoutId = setTimeout(async () => {
        await processMessageBuffer(from, callback);
      }, MESSAGE_BATCH_TIMEOUT);

      activeTimeouts.set(from, timeoutId);

    } catch (error) {
      console.error(`❌ Error en addMessageToBuffer:`, error);
      throw error;
    }
  });
}

async function setDocumentNumber(key, documentNumber) {
  try {
    const session = await getOrCreateSession(key);
    session.data.documentNumber = documentNumber;
    return await setSession(key, { data: session.data });
  } catch (error) {
    console.error('❌ Error en setDocumentNumber:', error);
    throw error;
  }
}

async function getDocumentNumber(key) {
  try {
    const session = await getOrCreateSession(key);
    return session.data?.documentNumber;
  } catch (error) {
    console.error('❌ Error en getDocumentNumber:', error);
    return undefined;
  }
}

module.exports = {
  getOrCreateSession,
  setSession,
  clearSession,
  addMessageToBuffer,
  setDocumentNumber,
  getDocumentNumber
};
