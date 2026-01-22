// services/conversationLogService.js
// Log de conversaciones en Firebase Storage

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const LOG_FILE_NAME = 'conversations.json';

// 🔒 Sistema de cola para evitar race conditions en escrituras
const writeQueue = [];
let isProcessingQueue = false;

async function processWriteQueue() {
  if (isProcessingQueue || writeQueue.length === 0) return;

  isProcessingQueue = true;

  while (writeQueue.length > 0) {
    const { operation, resolve, reject } = writeQueue.shift();
    try {
      const result = await operation();
      resolve(result);
    } catch (error) {
      reject(error);
    }
  }

  isProcessingQueue = false;
}

function queueWriteOperation(operation) {
  return new Promise((resolve, reject) => {
    writeQueue.push({ operation, resolve, reject });
    processWriteQueue();
  });
}

// Lee conversaciones desde Storage
async function readConversationsLog() {
  try {
    const bucket = admin.storage().bucket();
    const file = bucket.file(LOG_FILE_NAME);

    const [exists] = await file.exists();
    if (!exists) return [];

    const [contents] = await file.download();
    return JSON.parse(contents.toString('utf8'));
  } catch (error) {
    console.error('❌ Error leyendo conversations.json:', error);
    return [];
  }
}

// Escribe conversaciones a Storage
async function writeConversationsLog(conversations) {
  try {
    const bucket = admin.storage().bucket();
    const file = bucket.file(LOG_FILE_NAME);

    const jsonContent = JSON.stringify(conversations, null, 2);
    await file.save(jsonContent, {
      contentType: 'application/json',
      metadata: { cacheControl: 'no-cache' },
    });
  } catch (error) {
    console.error('❌ Error escribiendo conversations.json:', error);
  }
}

function findConversationByUserId(conversations, userId) {
  return conversations.find(conv => conv.userId === userId) || null;
}

// Extrae solo mensajes de texto visibles en WhatsApp
function extractTextMessages(history) {
  const messages = [];

  for (const item of history) {
    if (item.role === 'user' && typeof item.content === 'string') {
      if (item.content.includes('[CONTEXTO INTERNO')) continue;
      messages.push({ role: 'user', text: item.content });
    }
    else if (item.role === 'assistant' && typeof item.content === 'string') {
      if (item.content.includes('Reconozco a este paciente')) continue;
      messages.push({ role: 'assistant', text: item.content });
    }
  }

  return messages;
}

// Registra o actualiza conversación (operación interna)
async function _logConversationInternal(userId, sessionHistory, userDocument = null, userName = null) {
  const conversations = await readConversationsLog();
  const newTextMessages = extractTextMessages(sessionHistory);

  if (newTextMessages.length === 0) return;

  let conversation = findConversationByUserId(conversations, userId);

  if (conversation) {
    const existingMessages = conversation.messages || [];
    const messagesToAdd = [];

    for (const newMsg of newTextMessages) {
      const alreadyExists = existingMessages.some(
        existing => existing.role === newMsg.role && existing.text === newMsg.text
      );
      if (!alreadyExists) {
        messagesToAdd.push(newMsg);
      }
    }

    if (messagesToAdd.length > 0) {
      conversation.messages = [...existingMessages, ...messagesToAdd];
      conversation.timestamp = new Date().toISOString();
    }

    if (userDocument !== null) conversation.userDocument = userDocument;
    if (userName !== null) conversation.userName = userName;
  } else {
    conversation = {
      userId,
      userDocument,
      userName,
      timestamp: new Date().toISOString(),
      messages: newTextMessages,
    };
    conversations.push(conversation);
  }

  await writeConversationsLog(conversations);
}

// Registra o actualiza conversación (con cola para evitar race conditions)
async function logConversation(userId, sessionHistory, userDocument = null, userName = null) {
  try {
    await queueWriteOperation(() => _logConversationInternal(userId, sessionHistory, userDocument, userName));
  } catch (error) {
    console.error('❌ Error en logConversation:', error);
  }
}

// Obtiene todas las conversaciones
async function getAllConversations() {
  return await readConversationsLog();
}

// Obtiene datos de un usuario (memoria persistente)
async function getUserData(userId) {
  try {
    const conversations = await readConversationsLog();
    const conversation = findConversationByUserId(conversations, userId);

    if (!conversation) return null;

    return {
      userId: conversation.userId,
      userDocument: conversation.userDocument || null,
      userName: conversation.userName || null,
      hasHistory: conversation.messages && conversation.messages.length > 0,
      lastInteraction: conversation.timestamp || null
    };
  } catch (error) {
    console.error('❌ Error en getUserData:', error);
    return null;
  }
}

// Elimina conversación (operación interna)
async function _deleteConversationInternal(userId) {
  const conversations = await readConversationsLog();
  const filtered = conversations.filter(conv => conv.userId !== userId);

  if (filtered.length === conversations.length) return;

  await writeConversationsLog(filtered);
}

// Elimina conversación (con cola para evitar race conditions)
async function deleteConversation(userId) {
  try {
    await queueWriteOperation(() => _deleteConversationInternal(userId));
  } catch (error) {
    console.error('❌ Error eliminando conversación:', error);
  }
}

// Registra mensaje individual (operación interna)
async function _logSimpleMessageInternal(userId, role, text, userDocument = null, userName = null) {
  const conversations = await readConversationsLog();
  let conversation = findConversationByUserId(conversations, userId);

  if (!conversation) {
    conversation = {
      userId,
      userDocument,
      userName,
      timestamp: new Date().toISOString(),
      messages: [],
    };
    conversations.push(conversation);
  }

  conversation.messages.push({ role, text });
  conversation.timestamp = new Date().toISOString();

  if (userDocument !== null) conversation.userDocument = userDocument;
  if (userName !== null) conversation.userName = userName;

  await writeConversationsLog(conversations);
}

// Registra mensaje individual (con cola para evitar race conditions)
async function logSimpleMessage(userId, role, text, userDocument = null, userName = null) {
  try {
    await queueWriteOperation(() => _logSimpleMessageInternal(userId, role, text, userDocument, userName));
  } catch (error) {
    console.error('❌ Error en logSimpleMessage:', error);
  }
}

module.exports = {
  logConversation,
  logSimpleMessage,
  getAllConversations,
  getUserData,
  deleteConversation,
};
