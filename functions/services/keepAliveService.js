// services/keepAliveService.js
// Servicio para mantener la función Cloud Function "caliente" y prevenir cold starts

const axios = require('axios');

// URL de la función en producción (se configura desde variable de entorno)
const FUNCTION_URL = process.env.FUNCTION_URL || 'https://us-central1-whatsapp-starter-4de11.cloudfunctions.net/api/health';

/**
 * Realiza un ping a la función para mantenerla caliente
 * Se ejecuta cada 4 minutos para prevenir que la instancia se apague
 */
async function pingFunction() {
  try {
    console.log('🏓 Enviando ping para mantener función caliente...');

    const startTime = Date.now();
    const response = await axios.get(FUNCTION_URL, {
      timeout: 10000,
      headers: {
        'User-Agent': 'KeepAlive-Service/1.0'
      }
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Ping exitoso - Status: ${response.status} - Tiempo: ${duration}ms`);

    return {
      success: true,
      status: response.status,
      duration: duration
    };

  } catch (error) {
    console.error('❌ Error en ping keepalive:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  pingFunction
};
