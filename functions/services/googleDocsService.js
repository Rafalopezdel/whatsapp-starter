// services/googleDocsService.js
// Servicio para obtener contenido de Google Docs para contextualización del bot

const axios = require('axios');

// ID del documento de Google Docs (extraído de la URL)
const DOCUMENT_ID = '15tmmgfVybqSwiJIv2jBy1tsQ9EI6V6pCtRSoK_Cf7oE';

// Cache del contenido del documento
let cachedContent = null;
let lastFetchTime = null;
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutos (reducido de 5 min para menor frecuencia de llamadas)

/**
 * Obtiene el contenido del documento de Google Docs
 *
 * IMPORTANTE: El documento debe tener permisos configurados como:
 * "Cualquiera con el enlace" puede "Ver"
 *
 * Para configurar:
 * 1. Abre el documento en Google Docs
 * 2. Click en "Compartir" (botón azul arriba a la derecha)
 * 3. En "Acceso general" selecciona "Cualquiera con el enlace"
 * 4. Asegúrate que dice "Lector" (no Editor ni Comentarista)
 * 5. Guarda los cambios
 *
 * @returns {Promise<string>} - Contenido del documento en texto plano
 */
async function getDocumentContent() {
  try {
    // Verificar si tenemos cache válido
    const now = Date.now();
    if (cachedContent && lastFetchTime && (now - lastFetchTime) < CACHE_DURATION_MS) {
      console.log('📄 Usando contenido de Google Docs desde cache');
      return cachedContent;
    }

    console.log('📥 Obteniendo contenido actualizado de Google Docs...');

    // URL para exportar el documento como texto plano
    // Este formato funciona si el documento tiene permisos de "cualquiera con el enlace puede ver"
    const exportUrl = `https://docs.google.com/document/d/${DOCUMENT_ID}/export?format=txt`;

    const response = await axios.get(exportUrl, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WhatsApp-Dental-Bot/1.0)'
      }
    });

    if (response.data && typeof response.data === 'string' && response.data.length > 0) {
      // Limpiar el contenido
      const content = response.data.trim();

      // Actualizar cache
      cachedContent = content;
      lastFetchTime = now;

      console.log(`✅ Contenido de Google Docs obtenido: ${content.length} caracteres`);
      console.log(`📝 Primeros 200 caracteres: ${content.substring(0, 200)}...`);

      return content;
    } else {
      throw new Error('El documento está vacío o no tiene contenido válido');
    }

  } catch (error) {
    console.error('❌ Error obteniendo contenido de Google Docs:', error.message);

    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   StatusText:', error.response.statusText);

      if (error.response.status === 403) {
        console.error('   ⚠️  PERMISOS INSUFICIENTES:');
        console.error('   El documento no tiene permisos públicos de lectura.');
        console.error('   Configura el documento como "Cualquiera con el enlace puede ver"');
      } else if (error.response.status === 404) {
        console.error('   ⚠️  DOCUMENTO NO ENCONTRADO:');
        console.error('   Verifica que el ID del documento sea correcto');
      }
    }

    // Si hay error pero tenemos cache, usarlo
    if (cachedContent) {
      console.log('⚠️  Usando último contenido en cache por error de red');
      return cachedContent;
    }

    // Si no hay cache, retornar string vacío para no bloquear el bot
    console.log('⚠️  No se pudo obtener contenido. Bot funcionará sin contextualización del documento.');
    return '';
  }
}

/**
 * Invalida el cache del documento (útil para forzar actualización)
 */
function clearCache() {
  console.log('🗑️  Cache de Google Docs limpiado');
  cachedContent = null;
  lastFetchTime = null;
}

/**
 * Verifica si el documento es accesible
 * @returns {Promise<boolean>}
 */
async function checkDocumentAccess() {
  try {
    const content = await getDocumentContent();
    return content.length > 0;
  } catch (error) {
    return false;
  }
}

module.exports = {
  getDocumentContent,
  clearCache,
  checkDocumentAccess,
  DOCUMENT_ID
};
