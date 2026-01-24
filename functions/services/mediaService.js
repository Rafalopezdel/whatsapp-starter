// services/mediaService.js
// Servicio para manejar multimedia de WhatsApp con Firebase Storage

const axios = require('axios');
const admin = require('firebase-admin');
const path = require('path');

if (!admin.apps.length) {
  admin.initializeApp();
}

const bucket = admin.storage().bucket();

const WABA_TOKEN = process.env.WHATSAPP_TOKEN;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v21.0';

// Mapeo de MIME types a extensiones
const MIME_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/amr': 'amr',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/**
 * Obtiene la URL temporal de un media de WhatsApp
 * @param {string} mediaId - ID del media de WhatsApp
 * @returns {Promise<{url: string, mimeType: string}>}
 */
async function getMediaUrl(mediaId) {
  try {
    console.log(`📥 [MEDIA] Obteniendo URL para mediaId: ${mediaId}`);

    const response = await axios.get(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${WABA_TOKEN}`,
        },
      }
    );

    console.log(`✅ [MEDIA] URL obtenida: ${response.data.url?.substring(0, 50)}...`);
    return {
      url: response.data.url,
      mimeType: response.data.mime_type,
    };
  } catch (error) {
    console.error(`❌ [MEDIA] Error obteniendo URL:`, error?.response?.data || error.message);
    throw error;
  }
}

/**
 * Descarga un archivo de media desde la URL de WhatsApp
 * @param {string} url - URL temporal del media
 * @returns {Promise<Buffer>}
 */
async function downloadMedia(url) {
  try {
    console.log(`📥 [MEDIA] Descargando media desde WhatsApp...`);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${WABA_TOKEN}`,
      },
      responseType: 'arraybuffer',
      timeout: 60000, // 60 segundos para archivos grandes
    });

    const buffer = Buffer.from(response.data);
    console.log(`✅ [MEDIA] Descargado: ${buffer.length} bytes`);
    return buffer;
  } catch (error) {
    console.error(`❌ [MEDIA] Error descargando media:`, error.message);
    throw error;
  }
}

/**
 * Sube un buffer a Firebase Storage y retorna la URL pública
 * @param {Buffer} buffer - Contenido del archivo
 * @param {string} userId - ID del usuario (teléfono)
 * @param {string} mediaId - ID original del media
 * @param {string} mimeType - Tipo MIME del archivo
 * @param {string} mediaType - Tipo de media (image, video, audio, document)
 * @returns {Promise<string>} URL pública del archivo
 */
async function uploadToStorage(buffer, userId, mediaId, mimeType, mediaType) {
  try {
    const extension = MIME_TO_EXTENSION[mimeType] || 'bin';
    const timestamp = Date.now();
    const filename = `${timestamp}_${mediaId}.${extension}`;
    const filePath = `media/${userId}/${filename}`;

    console.log(`📤 [MEDIA] Subiendo a Storage: ${filePath}`);

    const file = bucket.file(filePath);

    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
        metadata: {
          userId: userId,
          uploadedAt: new Date().toISOString(),
          mediaType: mediaType,
          originalMediaId: mediaId,
        },
      },
    });

    // Hacer el archivo público
    await file.makePublic();

    // Construir URL pública
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    console.log(`✅ [MEDIA] Subido exitosamente: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    console.error(`❌ [MEDIA] Error subiendo a Storage:`, error.message);
    throw error;
  }
}

/**
 * Procesa un media entrante: descarga de WhatsApp y sube a Firebase Storage
 * @param {string} mediaId - ID del media de WhatsApp
 * @param {string} userId - ID del usuario (teléfono)
 * @param {string} mediaType - Tipo de media (image, video, audio, document, sticker)
 * @param {string} mimeType - Tipo MIME (opcional, se obtiene de WhatsApp si no se provee)
 * @returns {Promise<string>} URL pública en Firebase Storage
 */
async function processIncomingMedia(mediaId, userId, mediaType, mimeType = null) {
  try {
    console.log(`📎 [MEDIA] Procesando ${mediaType} de ${userId}`);

    // 1. Obtener URL temporal de WhatsApp
    const mediaInfo = await getMediaUrl(mediaId);
    const finalMimeType = mimeType || mediaInfo.mimeType;

    // 2. Descargar el archivo
    const buffer = await downloadMedia(mediaInfo.url);

    // 3. Subir a Firebase Storage
    const storageUrl = await uploadToStorage(buffer, userId, mediaId, finalMimeType, mediaType);

    console.log(`✅ [MEDIA] Procesamiento completo: ${mediaType} → ${storageUrl.substring(0, 60)}...`);
    return storageUrl;
  } catch (error) {
    console.error(`❌ [MEDIA] Error procesando media:`, error.message);
    throw error;
  }
}

/**
 * Elimina archivos de media más antiguos que X días
 * @param {number} daysOld - Días de antigüedad (default: 60)
 * @returns {Promise<number>} Cantidad de archivos eliminados
 */
async function cleanupOldMedia(daysOld = 60) {
  try {
    console.log(`🧹 [MEDIA] Iniciando limpieza de archivos > ${daysOld} días...`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffTimestamp = cutoffDate.getTime();

    // Listar todos los archivos en media/
    const [files] = await bucket.getFiles({ prefix: 'media/' });

    let deletedCount = 0;

    for (const file of files) {
      try {
        // El timestamp está en el nombre del archivo: {timestamp}_{mediaId}.{ext}
        const filename = path.basename(file.name);
        const timestampMatch = filename.match(/^(\d+)_/);

        if (timestampMatch) {
          const fileTimestamp = parseInt(timestampMatch[1], 10);

          if (fileTimestamp < cutoffTimestamp) {
            await file.delete();
            deletedCount++;
            console.log(`🗑️ [MEDIA] Eliminado: ${file.name}`);
          }
        } else {
          // Para archivos sin timestamp en el nombre, usar metadata
          const [metadata] = await file.getMetadata();
          const uploadedAt = metadata.metadata?.uploadedAt;

          if (uploadedAt) {
            const uploadDate = new Date(uploadedAt);
            if (uploadDate < cutoffDate) {
              await file.delete();
              deletedCount++;
              console.log(`🗑️ [MEDIA] Eliminado (por metadata): ${file.name}`);
            }
          }
        }
      } catch (fileError) {
        console.error(`⚠️ [MEDIA] Error procesando archivo ${file.name}:`, fileError.message);
      }
    }

    console.log(`✅ [MEDIA] Limpieza completada: ${deletedCount} archivos eliminados`);
    return deletedCount;
  } catch (error) {
    console.error(`❌ [MEDIA] Error en limpieza:`, error.message);
    throw error;
  }
}

/**
 * Obtiene estadísticas de uso de media
 * @returns {Promise<{totalFiles: number, totalSize: number, byUser: Object}>}
 */
async function getMediaStats() {
  try {
    const [files] = await bucket.getFiles({ prefix: 'media/' });

    let totalSize = 0;
    const byUser = {};

    for (const file of files) {
      const [metadata] = await file.getMetadata();
      const size = parseInt(metadata.size, 10) || 0;
      totalSize += size;

      // Extraer userId del path: media/{userId}/filename
      const pathParts = file.name.split('/');
      if (pathParts.length >= 2) {
        const userId = pathParts[1];
        byUser[userId] = (byUser[userId] || 0) + 1;
      }
    }

    return {
      totalFiles: files.length,
      totalSizeBytes: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      byUser: byUser,
    };
  } catch (error) {
    console.error(`❌ [MEDIA] Error obteniendo estadísticas:`, error.message);
    throw error;
  }
}

module.exports = {
  getMediaUrl,
  downloadMedia,
  uploadToStorage,
  processIncomingMedia,
  cleanupOldMedia,
  getMediaStats,
};
