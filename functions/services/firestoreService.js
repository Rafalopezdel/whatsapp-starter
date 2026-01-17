// services/firestoreService.js
const admin = require('firebase-admin');

// Inicializar Firebase Admin solo una vez
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const SESSIONS_COLLECTION = 'sessions';
const TTL_MS = 30 * 60 * 1000; // 30 minutos

/**
 * Guarda o actualiza una sesión en Firestore
 * @param {string} sessionId - ID de la sesión (phone number)
 * @param {Object} data - Datos de la sesión a guardar
 * @returns {Promise<Object>} - La sesión guardada
 */
async function saveSession(sessionId, data) {
  try {
    const sessionRef = db.collection(SESSIONS_COLLECTION).doc(sessionId);

    const sessionData = {
      ...data,
      session_id: sessionId,
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
      created_at: data.created_at || admin.firestore.FieldValue.serverTimestamp()
    };

    await sessionRef.set(sessionData, { merge: true });

    // Retornar con timestamp como Date para compatibilidad
    const saved = await sessionRef.get();
    return {
      ...saved.data(),
      _ts: saved.data().last_updated?.toDate()?.getTime() || Date.now()
    };
  } catch (error) {
    console.error('❌ Error guardando sesión en Firestore:', error);
    throw error;
  }
}

/**
 * Obtiene una sesión de Firestore
 * @param {string} sessionId - ID de la sesión
 * @returns {Promise<Object|null>} - La sesión o null si no existe o expiró
 */
async function getSession(sessionId) {
  try {
    const sessionRef = db.collection(SESSIONS_COLLECTION).doc(sessionId);
    const doc = await sessionRef.get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    const lastUpdated = data.last_updated?.toDate()?.getTime() || 0;
    const now = Date.now();

    // Verificar TTL
    if (now - lastUpdated > TTL_MS) {
      console.log(`⏰ Sesión ${sessionId} expirada, eliminando...`);
      await sessionRef.delete();
      return null;
    }

    // Retornar con _ts para compatibilidad con código existente
    return {
      ...data,
      _ts: lastUpdated
    };
  } catch (error) {
    console.error('❌ Error obteniendo sesión de Firestore:', error);
    return null;
  }
}

/**
 * Elimina una sesión de Firestore
 * @param {string} sessionId - ID de la sesión a eliminar
 * @returns {Promise<void>}
 */
async function deleteSession(sessionId) {
  try {
    await db.collection(SESSIONS_COLLECTION).doc(sessionId).delete();
    console.log(`🗑️ Sesión ${sessionId} eliminada de Firestore`);
  } catch (error) {
    console.error('❌ Error eliminando sesión de Firestore:', error);
  }
}

/**
 * Elimina todas las sesiones expiradas (TTL > 30 min)
 * Útil para ejecutar periódicamente como función programada
 * @returns {Promise<number>} - Número de sesiones eliminadas
 */
async function deleteExpiredSessions() {
  try {
    const now = Date.now();
    const expirationTime = new Date(now - TTL_MS);

    const snapshot = await db.collection(SESSIONS_COLLECTION)
      .where('last_updated', '<', admin.firestore.Timestamp.fromDate(expirationTime))
      .get();

    if (snapshot.empty) {
      console.log('✅ No hay sesiones expiradas para eliminar');
      return 0;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`🗑️ ${snapshot.size} sesiones expiradas eliminadas`);
    return snapshot.size;
  } catch (error) {
    console.error('❌ Error eliminando sesiones expiradas:', error);
    return 0;
  }
}

/**
 * Actualiza campos específicos de una sesión usando transacción
 * Útil para actualizaciones atómicas (ej: agregar mensaje al buffer)
 * @param {string} sessionId - ID de la sesión
 * @param {Object} updates - Campos a actualizar
 * @returns {Promise<Object>} - La sesión actualizada
 */
async function updateSessionAtomic(sessionId, updates) {
  try {
    const sessionRef = db.collection(SESSIONS_COLLECTION).doc(sessionId);

    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(sessionRef);

      const updatedData = {
        ...(doc.exists ? doc.data() : {}),
        ...updates,
        session_id: sessionId,
        last_updated: admin.firestore.FieldValue.serverTimestamp()
      };

      transaction.set(sessionRef, updatedData, { merge: true });
      return updatedData;
    });

    return {
      ...result,
      _ts: Date.now()
    };
  } catch (error) {
    console.error('❌ Error actualizando sesión atómicamente:', error);
    throw error;
  }
}

module.exports = {
  saveSession,
  getSession,
  deleteSession,
  deleteExpiredSessions,
  updateSessionAtomic
};
