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

      console.log(`📥 [CONVLOG] Existentes: ${existingMessages.length}, Agregando: ${lastTwo.length}`);

      conversationData.messages = [...existingMessages, ...lastTwo];

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

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      let conversationData;

      if (doc.exists) {
        const data = doc.data();
        conversationData = {
          ...data,
          messages: [...(data.messages || []), { role, text }],
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        };
      } else {
        conversationData = {
          userId,
          userDocument,
          userName,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          messages: [{ role, text }]
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

module.exports = {
  logConversation,
  logSimpleMessage,
  getAllConversations,
  getUserData,
  deleteConversation,
  getConversation,
};
