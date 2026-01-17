// services/handoffService.js
const admin = require('firebase-admin');
const { sendText } = require('./whatsappService');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const HANDOFFS_COLLECTION = 'open-handoffs';

// Crea un handoff entre cliente y agente
async function createHandoff(clientId, agentPhoneNumber, clientName = null) {
  try {
    const existingHandoff = await getActiveHandoffByClient(clientId);
    if (existingHandoff) {
      return existingHandoff;
    }

    const handoffData = {
      clientId,
      agentPhoneNumber,
      clientName: clientName || 'Cliente',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessage: admin.firestore.FieldValue.serverTimestamp(),
      status: 'active'
    };

    const docRef = await db.collection(HANDOFFS_COLLECTION).add(handoffData);
    console.log(`✅ Handoff creado: ${docRef.id}`);

    return { id: docRef.id, ...handoffData };
  } catch (error) {
    console.error('❌ Error creando handoff:', error);
    throw error;
  }
}

// Obtiene handoff activo por cliente
async function getActiveHandoffByClient(clientId) {
  try {
    const snapshot = await db.collection(HANDOFFS_COLLECTION)
      .where('clientId', '==', clientId)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('❌ Error obteniendo handoff por cliente:', error);
    return null;
  }
}

// Obtiene handoff activo por agente
async function getActiveHandoffByAgent(agentPhoneNumber) {
  try {
    const snapshot = await db.collection(HANDOFFS_COLLECTION)
      .where('agentPhoneNumber', '==', agentPhoneNumber)
      .where('status', '==', 'active')
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('❌ Error obteniendo handoff por agente:', error);
    return null;
  }
}

// Cierra un handoff
async function closeHandoff(handoffId) {
  try {
    await db.collection(HANDOFFS_COLLECTION).doc(handoffId).update({
      status: 'closed',
      closedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`✅ Handoff ${handoffId} cerrado`);
  } catch (error) {
    console.error('❌ Error cerrando handoff:', error);
    throw error;
  }
}

// Cierra todos los handoffs de un agente
async function closeAllAgentHandoffs(agentPhoneNumber) {
  try {
    const snapshot = await db.collection(HANDOFFS_COLLECTION)
      .where('agentPhoneNumber', '==', agentPhoneNumber)
      .where('status', '==', 'active')
      .get();

    if (snapshot.empty) return 0;

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: 'closed',
        closedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    await batch.commit();
    console.log(`✅ ${snapshot.size} handoffs cerrados`);
    return snapshot.size;
  } catch (error) {
    console.error('❌ Error cerrando handoffs:', error);
    return 0;
  }
}

// Actualiza timestamp de actividad
async function updateHandoffTimestamp(handoffId) {
  try {
    await db.collection(HANDOFFS_COLLECTION).doc(handoffId).update({
      lastMessage: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('❌ Error actualizando timestamp:', error);
  }
}

// Obtiene todos los handoffs activos
async function getAllActiveHandoffs() {
  try {
    const snapshot = await db.collection(HANDOFFS_COLLECTION)
      .where('status', '==', 'active')
      .orderBy('lastMessage', 'desc')
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('❌ Error obteniendo handoffs activos:', error);
    return [];
  }
}

module.exports = {
  createHandoff,
  getActiveHandoffByClient,
  getActiveHandoffByAgent,
  closeHandoff,
  closeAllAgentHandoffs,
  updateHandoffTimestamp,
  getAllActiveHandoffs
};
