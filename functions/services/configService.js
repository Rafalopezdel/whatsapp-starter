// services/configService.js
const admin = require('firebase-admin');

// Inicializar Firebase Admin solo una vez
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const CONFIG_COLLECTION = 'tenant_config';
const CONFIG_DOC_ID = 'default'; // Usamos un documento por defecto

// Cache en memoria para evitar lecturas frecuentes a Firestore
let cachedConfig = null;
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Estructura del documento tenant_config:
 * {
 *   agentPhoneNumber: string (ej: "573001234567"),
 *   clinicName: string (opcional),
 *   updated_at: Timestamp
 * }
 */

/**
 * Obtiene la configuración del tenant (incluyendo agentPhoneNumber)
 * Usa cache en memoria para reducir lecturas a Firestore
 * @param {boolean} forceRefresh - Forzar actualización ignorando cache
 * @returns {Promise<Object|null>}
 */
async function getTenantConfig(forceRefresh = false) {
  try {
    const now = Date.now();

    // Retornar cache si es válido
    if (!forceRefresh && cachedConfig && (now - lastFetch < CACHE_TTL)) {
      console.log('📋 Usando configuración en cache');
      return cachedConfig;
    }

    // Obtener configuración de Firestore
    const docRef = db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.log('⚠️ No existe documento de configuración en Firestore');
      return null;
    }

    const config = doc.data();

    // Actualizar cache
    cachedConfig = config;
    lastFetch = now;

    console.log('✅ Configuración obtenida de Firestore:', { agentPhoneNumber: config.agentPhoneNumber });
    return config;

  } catch (error) {
    console.error('❌ Error obteniendo configuración:', error);
    return cachedConfig; // Retornar cache aunque esté expirado si hay error
  }
}

/**
 * Obtiene solo el número de teléfono del agente
 * @returns {Promise<string|null>}
 */
async function getAgentPhoneNumber() {
  try {
    const config = await getTenantConfig();
    return config?.agentPhoneNumber || null;
  } catch (error) {
    console.error('❌ Error obteniendo número del agente:', error);
    return null;
  }
}

/**
 * Actualiza la configuración del tenant
 * @param {Object} updates - Campos a actualizar
 * @returns {Promise<void>}
 */
async function updateTenantConfig(updates) {
  try {
    const docRef = db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID);

    const updateData = {
      ...updates,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };

    await docRef.set(updateData, { merge: true });

    // Invalidar cache
    cachedConfig = null;
    lastFetch = 0;

    console.log('✅ Configuración actualizada en Firestore');
  } catch (error) {
    console.error('❌ Error actualizando configuración:', error);
    throw error;
  }
}

/**
 * Verifica si un número de teléfono es el del agente
 * @param {string} phoneNumber - Número de teléfono a verificar
 * @returns {Promise<boolean>}
 */
async function isAgentPhoneNumber(phoneNumber) {
  try {
    const agentPhone = await getAgentPhoneNumber();

    console.log('🔍 Verificando número de agente:');
    console.log(`   - Número recibido: "${phoneNumber}" (tipo: ${typeof phoneNumber}, longitud: ${phoneNumber?.length})`);
    console.log(`   - Número configurado: "${agentPhone}" (tipo: ${typeof agentPhone}, longitud: ${agentPhone?.length})`);

    if (!agentPhone) {
      console.log('⚠️ No hay agentPhoneNumber configurado en Firestore');
      return false;
    }

    const isMatch = phoneNumber === agentPhone;
    console.log(`   - ¿Son iguales? ${isMatch ? '✅ SÍ' : '❌ NO'}`);

    return isMatch;
  } catch (error) {
    console.error('❌ Error verificando si es número del agente:', error);
    return false;
  }
}

/**
 * Inicializa la configuración con valores por defecto si no existe
 * Útil para primer setup
 * @param {string} agentPhoneNumber - Número de WhatsApp del agente
 * @returns {Promise<void>}
 */
async function initializeTenantConfig(agentPhoneNumber) {
  try {
    const docRef = db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID);
    const doc = await docRef.get();

    if (doc.exists) {
      console.log('✅ Configuración ya existe, no se sobrescribe');
      return;
    }

    const initialConfig = {
      agentPhoneNumber,
      clinicName: 'Clínica Dental',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };

    await docRef.set(initialConfig);
    console.log('✅ Configuración inicial creada con éxito');

    // Invalidar cache
    cachedConfig = null;
    lastFetch = 0;
  } catch (error) {
    console.error('❌ Error inicializando configuración:', error);
    throw error;
  }
}

/**
 * Invalida el cache de configuración (útil para debugging o actualizaciones manuales)
 */
function clearCache() {
  console.log('🗑️ Cache de configuración invalidado');
  cachedConfig = null;
  lastFetch = 0;
}

module.exports = {
  getTenantConfig,
  getAgentPhoneNumber,
  updateTenantConfig,
  isAgentPhoneNumber,
  initializeTenantConfig,
  clearCache
};
