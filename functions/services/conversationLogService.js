// services/conversationLogService.js
// Log de conversaciones en Firestore (con transacciones atómicas)

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const COLLECTION_NAME = 'conversations';

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

// Registra o actualiza conversación usando transacción atómica
async function logConversation(userId, sessionHistory, userDocument = null, userName = null) {
  try {
    console.log(`📥 [CONVLOG] logConversation para ${userId}`);

    const newTextMessages = extractTextMessages(sessionHistory);

    if (newTextMessages.length === 0) {
      console.log(`⚠️ [CONVLOG] No hay mensajes de texto para guardar`);
      return;
    }

    const lastMsg = newTextMessages[newTextMessages.length - 1];
    console.log(`📥 [CONVLOG] Último mensaje: [${lastMsg.role}] ${lastMsg.text.substring(0, 50)}...`);

    const docRef = db.collection(COLLECTION_NAME).doc(userId);

    // Usar transacción para garantizar escritura atómica
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      let existingMessages = [];
      let conversationData = {
        userId,
        userDocument,
        userName,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        messages: []
      };

      if (doc.exists) {
        const data = doc.data();
        existingMessages = data.messages || [];
        conversationData = {
          ...data,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        };
      }

      // Estrategia simple: siempre agregar los últimos 2 mensajes del historial actual
      // (mensaje del usuario + respuesta del bot de esta interacción)
      const lastTwo = newTextMessages.slice(-2);

      // Agregar timestamp a cada mensaje
      const now = new Date().toISOString();
      const lastTwoWithTimestamp = lastTwo.map(m => ({ ...m, timestamp: now }));

      console.log(`📥 [CONVLOG] Existentes: ${existingMessages.length}, Agregando: ${lastTwoWithTimestamp.length}`);

      conversationData.messages = [...existingMessages, ...lastTwoWithTimestamp];

      // Actualizar lastUserMessage si hay mensaje del usuario
      const userMsgs = lastTwo.filter(m => m.role === 'user');
      if (userMsgs.length > 0) {
        conversationData.lastUserMessage = now;
      }

      // Actualizar datos del usuario si se proporcionan
      if (userDocument !== null) conversationData.userDocument = userDocument;
      if (userName !== null) conversationData.userName = userName;

      transaction.set(docRef, conversationData, { merge: true });
    });

    console.log(`✅ [CONVLOG] Transacción completada para ${userId}`);

  } catch (error) {
    console.error('❌ Error en logConversation:', error);
  }
}

// Registra mensaje individual con transacción atómica
async function logSimpleMessage(userId, role, text, userDocument = null, userName = null) {
  try {
    const docRef = db.collection(COLLECTION_NAME).doc(userId);
    const messageTimestamp = new Date().toISOString();

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      let conversationData;
      const newMessage = { role, text, timestamp: messageTimestamp };

      if (doc.exists) {
        const data = doc.data();
        conversationData = {
          ...data,
          messages: [...(data.messages || []), newMessage],
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        };
        // Actualizar lastUserMessage si es mensaje del usuario
        if (role === 'user') {
          conversationData.lastUserMessage = messageTimestamp;
        }
      } else {
        conversationData = {
          userId,
          userDocument,
          userName,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          messages: [newMessage],
          lastUserMessage: role === 'user' ? messageTimestamp : null
        };
      }

      if (userDocument !== null) conversationData.userDocument = userDocument;
      if (userName !== null) conversationData.userName = userName;

      transaction.set(docRef, conversationData, { merge: true });
    });

    console.log(`✅ [CONVLOG] Mensaje simple agregado para ${userId}`);

  } catch (error) {
    console.error('❌ Error en logSimpleMessage:', error);
  }
}

// Obtiene todas las conversaciones
async function getAllConversations() {
  try {
    const snapshot = await db.collection(COLLECTION_NAME)
      .orderBy('timestamp', 'desc')
      .get();

    const conversations = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      conversations.push({
        userId: data.userId,
        userDocument: data.userDocument || null,
        userName: data.userName || null,
        timestamp: data.timestamp?.toDate?.()?.toISOString() || null,
        messages: data.messages || []
      });
    });

    return conversations;
  } catch (error) {
    console.error('❌ Error en getAllConversations:', error);
    return [];
  }
}

// Obtiene datos de un usuario (memoria persistente)
async function getUserData(userId) {
  try {
    const docRef = db.collection(COLLECTION_NAME).doc(userId);
    const doc = await docRef.get();

    if (!doc.exists) return null;

    const data = doc.data();
    return {
      userId: data.userId,
      userDocument: data.userDocument || null,
      userName: data.userName || null,
      hasHistory: data.messages && data.messages.length > 0,
      lastInteraction: data.timestamp?.toDate?.()?.toISOString() || null
    };
  } catch (error) {
    console.error('❌ Error en getUserData:', error);
    return null;
  }
}

// Elimina conversación
async function deleteConversation(userId) {
  try {
    await db.collection(COLLECTION_NAME).doc(userId).delete();
    console.log(`✅ [CONVLOG] Conversación eliminada para ${userId}`);
  } catch (error) {
    console.error('❌ Error eliminando conversación:', error);
  }
}

// Registra mensaje de media con transacción atómica
async function logMediaMessage(userId, role, mediaData, userDocument = null, userName = null) {
  try {
    // mediaData: { mediaUrl, mediaType, mimeType, caption }
    const messageTimestamp = new Date().toISOString();
    const message = {
      role: role,
      text: mediaData.caption || `[${mediaData.mediaType}]`,
      mediaUrl: mediaData.mediaUrl,
      mediaType: mediaData.mediaType,
      mimeType: mediaData.mimeType,
      timestamp: messageTimestamp
    };

    const docRef = db.collection(COLLECTION_NAME).doc(userId);

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      let conversationData;

      if (doc.exists) {
        const data = doc.data();
        conversationData = {
          ...data,
          messages: [...(data.messages || []), message],
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        };
        // Actualizar lastUserMessage si es mensaje del usuario
        if (role === 'user') {
          conversationData.lastUserMessage = messageTimestamp;
        }
      } else {
        conversationData = {
          userId,
          userDocument,
          userName,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          messages: [message],
          lastUserMessage: role === 'user' ? messageTimestamp : null
        };
      }

      if (userDocument !== null) conversationData.userDocument = userDocument;
      if (userName !== null) conversationData.userName = userName;

      transaction.set(docRef, conversationData, { merge: true });
    });

    console.log(`✅ [CONVLOG] Mensaje de media (${mediaData.mediaType}) agregado para ${userId}`);

  } catch (error) {
    console.error('❌ Error en logMediaMessage:', error);
  }
}

// Obtiene una conversación específica por userId
async function getConversation(userId) {
  try {
    const docRef = db.collection(COLLECTION_NAME).doc(userId);
    const doc = await docRef.get();

    if (!doc.exists) return null;

    const data = doc.data();
    return {
      userId: data.userId,
      userDocument: data.userDocument || null,
      userName: data.userName || null,
      timestamp: data.timestamp?.toDate?.()?.toISOString() || null,
      messages: data.messages || []
    };
  } catch (error) {
    console.error('❌ Error en getConversation:', error);
    return null;
  }
}

// Verifica si la ventana de 24h de WhatsApp está abierta para un usuario
async function isConversationWindowOpen(userId) {
  try {
    const docRef = db.collection(COLLECTION_NAME).doc(userId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { isOpen: false, reason: 'No hay historial de conversación' };
    }

    const data = doc.data();
    const lastUserMessage = data.lastUserMessage;

    if (!lastUserMessage) {
      // Buscar en mensajes si no hay lastUserMessage guardado
      const messages = data.messages || [];
      const userMessages = messages.filter(m => m.role === 'user' && m.timestamp);

      if (userMessages.length === 0) {
        return { isOpen: false, reason: 'El cliente no ha enviado mensajes' };
      }

      // Obtener el último mensaje del usuario
      const lastMsg = userMessages[userMessages.length - 1];
      const lastMsgTime = new Date(lastMsg.timestamp);
      const now = new Date();
      const hoursDiff = (now - lastMsgTime) / (1000 * 60 * 60);

      if (hoursDiff > 24) {
        return {
          isOpen: false,
          reason: `Han pasado ${Math.floor(hoursDiff)} horas desde el último mensaje del cliente`,
          lastMessage: lastMsg.timestamp
        };
      }

      return {
        isOpen: true,
        hoursRemaining: Math.floor(24 - hoursDiff),
        lastMessage: lastMsg.timestamp
      };
    }

    // Usar lastUserMessage guardado
    const lastMsgTime = new Date(lastUserMessage);
    const now = new Date();
    const hoursDiff = (now - lastMsgTime) / (1000 * 60 * 60);

    if (hoursDiff > 24) {
      return {
        isOpen: false,
        reason: `Han pasado ${Math.floor(hoursDiff)} horas desde el último mensaje del cliente`,
        lastMessage: lastUserMessage
      };
    }

    return {
      isOpen: true,
      hoursRemaining: Math.floor(24 - hoursDiff),
      lastMessage: lastUserMessage
    };

  } catch (error) {
    console.error('❌ Error en isConversationWindowOpen:', error);
    return { isOpen: false, reason: 'Error verificando ventana de conversación' };
  }
}

module.exports = {
  logConversation,
  logSimpleMessage,
  logMediaMessage,
  getAllConversations,
  getUserData,
  deleteConversation,
  getConversation,
  isConversationWindowOpen,
};
