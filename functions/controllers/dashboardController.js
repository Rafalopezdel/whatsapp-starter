const { getActiveSessions, getSessionById } = require('../services/dashboardService');
const { createHandoff, closeHandoff, getActiveHandoffByClient } = require('../services/handoffService');
const { getAgentPhoneNumber } = require('../services/configService');
const whatsappService = require('../services/whatsappService');
const whatsappTemplateService = require('../services/whatsappTemplateService');
const conversationLogService = require('../services/conversationLogService');
const mediaService = require('../services/mediaService');
const { convertWebmToOgg } = require('../utils/audioConverter');
const logger = require('../utils/logger');

/**
 * Dashboard Controller
 * Handles HTTP endpoints for the web dashboard interface
 */

/**
 * GET /api/dashboard/sessions
 * Returns all active chat sessions for the dashboard
 */
async function getActiveChatSessions(req, res) {
  try {
    console.log('📊 Dashboard: Getting active sessions...');

    const sessions = await getActiveSessions();

    console.log(`✅ Dashboard: Found ${sessions.length} active sessions`);

    return res.status(200).json({
      success: true,
      sessions: sessions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Dashboard: Error getting sessions:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al obtener sesiones activas',
      details: error.message
    });
  }
}

/**
 * GET /api/dashboard/session/:sessionId
 * Returns a specific session with full conversation history
 */
async function getSessionDetails(req, res) {
  try {
    const { sessionId } = req.params;

    console.log(`📊 Dashboard: Getting session details for ${sessionId}...`);

    const session = await getSessionById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }

    console.log(`✅ Dashboard: Session found for ${sessionId}`);

    return res.status(200).json({
      success: true,
      session: session,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Dashboard: Error getting session details:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al obtener detalles de sesión',
      details: error.message
    });
  }
}

/**
 * POST /api/dashboard/send-message
 * Sends a message from the web dashboard to a WhatsApp user
 * Body: { to: "573001234567", message: "Hola desde el dashboard" }
 */
async function sendMessageFromDashboard(req, res) {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren los campos "to" y "message"'
      });
    }

    console.log(`📤 Dashboard: Sending message to ${to}...`);

    // Get agent phone number for logging
    const agentPhoneNumber = await getAgentPhoneNumber();

    // Send message via WhatsApp
    await whatsappService.sendMessage(to, message);

    // Log message to conversations.json with role='agent'
    await conversationLogService.logSimpleMessage(
      to,
      'agent',
      message,
      null, // userDocument might not be available yet
      null  // userName might not be available yet
    );

    console.log(`✅ Dashboard: Message sent successfully to ${to}`);

    return res.status(200).json({
      success: true,
      message: 'Mensaje enviado correctamente',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Dashboard: Error sending message:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al enviar mensaje',
      details: error.message
    });
  }
}

/**
 * POST /api/dashboard/intervene
 * Starts agent intervention (handoff) for a specific chat
 * Body: { clientId: "573001234567", clientName: "Juan Pérez" }
 */
async function startIntervention(req, res) {
  try {
    const { clientId, clientName } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere el campo "clientId"'
      });
    }

    console.log(`🤝 Dashboard: Starting intervention for ${clientId}...`);

    // Verificar si la ventana de 24h está abierta
    const windowStatus = await conversationLogService.isConversationWindowOpen(clientId);

    if (!windowStatus.isOpen) {
      console.log(`⚠️ Dashboard: Ventana de 24h cerrada para ${clientId}: ${windowStatus.reason}`);
      return res.status(400).json({
        success: false,
        error: 'La ventana de 24 horas está cerrada',
        reason: windowStatus.reason,
        suggestion: 'Usa "Iniciar chat" para enviar la plantilla primero y espera la respuesta del cliente.',
        windowClosed: true
      });
    }

    console.log(`✅ Dashboard: Ventana de 24h abierta (${windowStatus.hoursRemaining}h restantes)`);

    // Check if there's already an active handoff
    const existingHandoff = await getActiveHandoffByClient(clientId);
    if (existingHandoff) {
      return res.status(400).json({
        success: false,
        error: 'Ya existe una intervención activa para este cliente'
      });
    }

    // Get agent phone number from config
    const agentPhoneNumber = await getAgentPhoneNumber();

    if (!agentPhoneNumber) {
      return res.status(500).json({
        success: false,
        error: 'No se ha configurado el número del agente en tenant_config'
      });
    }

    // Create handoff (this will send notification to agent via WhatsApp)
    const handoff = await createHandoff(
      clientId,
      agentPhoneNumber,
      clientName || 'Cliente'
    );

    console.log(`✅ Dashboard: Intervention started for ${clientId}`);

    // Send notification to client that agent is now handling the chat
    const agentJoinedMessage = '👤 Un agente se ha unido a la conversación y te atenderá personalmente.';
    await whatsappService.sendMessage(clientId, agentJoinedMessage);

    // Log the message to conversation
    await conversationLogService.logSimpleMessage(
      clientId,
      'assistant',
      agentJoinedMessage,
      null,
      clientName
    );

    return res.status(200).json({
      success: true,
      message: 'Intervención iniciada correctamente',
      handoff: handoff,
      hoursRemaining: windowStatus.hoursRemaining,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Dashboard: Error starting intervention:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al iniciar intervención',
      details: error.message
    });
  }
}

/**
 * POST /api/dashboard/close-intervention
 * Closes agent intervention (handoff) for a specific chat
 * Body: { clientId: "573001234567" }
 */
async function closeIntervention(req, res) {
  try {
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere el campo "clientId"'
      });
    }

    console.log(`🔚 Dashboard: Closing intervention for ${clientId}...`);

    // Get active handoff
    const handoff = await getActiveHandoffByClient(clientId);

    if (!handoff) {
      return res.status(404).json({
        success: false,
        error: 'No existe una intervención activa para este cliente'
      });
    }

    // Close handoff
    await closeHandoff(handoff.id);

    console.log(`✅ Dashboard: Intervention closed for ${clientId}`);

    // Send notification to client that bot is back
    const botBackMessage = '🤖 Paola ha vuelto a atenderte. ¿En qué más puedo ayudarte?';
    await whatsappService.sendMessage(clientId, botBackMessage);

    // Log the bot message to conversation
    await conversationLogService.logSimpleMessage(
      clientId,
      'assistant',
      botBackMessage,
      null,
      null
    );

    return res.status(200).json({
      success: true,
      message: 'Intervención cerrada correctamente',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Dashboard: Error closing intervention:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al cerrar intervención',
      details: error.message
    });
  }
}

/**
 * GET /api/dashboard/health
 * Health check endpoint for dashboard services
 */
async function healthCheck(req, res) {
  try {
    return res.status(200).json({
      success: true,
      message: 'Dashboard API is running',
      timestamp: new Date().toISOString(),
      services: {
        sessions: 'ok',
        handoffs: 'ok',
        whatsapp: 'ok'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /api/dashboard/send-media
 * Sends media (image, video, audio, document) from dashboard to WhatsApp user
 * Body: { to: "573001234567", mediaType: "image|video|audio|document", mediaData: "base64...", filename: "photo.jpg", mimeType: "image/jpeg", caption: "optional" }
 */
async function sendMediaFromDashboard(req, res) {
  try {
    const { to, mediaType, mediaData, filename, mimeType, caption } = req.body;

    console.log(`\n========== SEND MEDIA REQUEST ==========`);
    console.log(`📤 Dashboard: Iniciando envío de ${mediaType} a ${to}`);
    console.log(`   MimeType recibido: ${mimeType}`);
    console.log(`   Filename: ${filename}`);

    if (!to || !mediaType || !mediaData || !mimeType) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren los campos "to", "mediaType", "mediaData" y "mimeType"'
      });
    }

    const validMediaTypes = ['image', 'video', 'audio', 'document'];
    if (!validMediaTypes.includes(mediaType)) {
      return res.status(400).json({
        success: false,
        error: `Tipo de media inválido. Debe ser: ${validMediaTypes.join(', ')}`
      });
    }

    // Convert base64 to buffer
    let buffer = Buffer.from(mediaData, 'base64');
    console.log(`   Tamaño original: ${(buffer.length / 1024).toFixed(2)} KB`);

    let finalMimeType = mimeType;
    let finalFilename = filename || `media.${mimeType.split('/')[1]}`;
    let actualMediaType = mediaType; // Track if we change to document as fallback
    let conversionAttempted = false;
    let conversionSucceeded = false;

    // Handle audio format conversion for WhatsApp compatibility
    // WhatsApp is very strict about audio formats - browser recordings often don't work
    // So we ALWAYS convert audio to ogg/opus using FFmpeg
    if (mediaType === 'audio') {
      const cleanMimeType = mimeType.split(';')[0].trim();
      console.log(`   🎤 Audio detectado. MimeType limpio: ${cleanMimeType}`);
      console.log(`   🔄 Convirtiendo audio a MP3 con FFmpeg (requerido para WhatsApp)...`);
      conversionAttempted = true;

      try {
        buffer = await convertWebmToOgg(buffer);
        finalMimeType = 'audio/mpeg';
        // Change extension to .mp3
        const ext = finalFilename.split('.').pop();
        finalFilename = finalFilename.replace(`.${ext}`, '.mp3');
        conversionSucceeded = true;
        console.log(`   ✅ Conversión a MP3 exitosa. Nuevo tamaño: ${(buffer.length / 1024).toFixed(2)} KB`);
      } catch (conversionError) {
        console.error(`   ❌ FFmpeg falló: ${conversionError.message}`);
        console.log(`   ⚠️ Fallback: Enviando como documento en lugar de audio`);

        // Fallback: send as document instead (documents always work)
        actualMediaType = 'document';
        finalFilename = filename || `nota_de_voz_${Date.now()}.${cleanMimeType.split('/')[1] || 'audio'}`;
      }
    }

    console.log(`   MimeType final: ${finalMimeType}`);
    console.log(`   Tipo final: ${actualMediaType}`);

    // 1. First, save to Firebase Storage so we can display in dashboard
    let storageUrl = null;
    try {
      const timestamp = Date.now();
      const mediaId_storage = `agent_${timestamp}`;
      storageUrl = await mediaService.uploadToStorage(buffer, to, mediaId_storage, finalMimeType, mediaType);
      console.log(`   ✅ Storage: Guardado correctamente`);
    } catch (storageError) {
      console.error(`   ⚠️ Storage error (continuando): ${storageError.message}`);
    }

    // 2. Upload media to WhatsApp
    console.log(`   📤 Subiendo a WhatsApp API...`);
    let mediaId;
    try {
      mediaId = await whatsappService.uploadMedia(buffer, finalMimeType, finalFilename);
      console.log(`   ✅ WhatsApp upload exitoso. MediaId: ${mediaId}`);
    } catch (uploadError) {
      console.error(`   ❌ WhatsApp upload falló: ${uploadError.message}`);

      // If audio upload fails, try as document
      if (actualMediaType === 'audio') {
        console.log(`   🔄 Reintentando como documento...`);
        actualMediaType = 'document';
        finalFilename = `nota_de_voz_${Date.now()}.webm`;
        mediaId = await whatsappService.uploadMedia(Buffer.from(mediaData, 'base64'), 'audio/webm', finalFilename);
        console.log(`   ✅ Upload como documento exitoso. MediaId: ${mediaId}`);
      } else {
        throw uploadError;
      }
    }

    // 3. Send media based on type
    console.log(`   📨 Enviando mensaje de tipo: ${actualMediaType}...`);
    let result;
    try {
      switch (actualMediaType) {
        case 'image':
          result = await whatsappService.sendImage(to, mediaId, caption);
          break;
        case 'video':
          result = await whatsappService.sendVideo(to, mediaId, caption);
          break;
        case 'audio':
          result = await whatsappService.sendAudio(to, mediaId);
          break;
        case 'document':
          result = await whatsappService.sendDocument(to, mediaId, finalFilename, caption || 'Nota de voz');
          break;
      }
      console.log(`   ✅ Mensaje enviado. Response:`, JSON.stringify(result));
    } catch (sendError) {
      console.error(`   ❌ Error enviando mensaje: ${sendError.message}`);

      // Last resort: if audio send fails, try as document
      if (actualMediaType === 'audio') {
        console.log(`   🔄 Último intento: enviando como documento...`);
        result = await whatsappService.sendDocument(to, mediaId, finalFilename, 'Nota de voz');
        actualMediaType = 'document';
        console.log(`   ✅ Enviado como documento`);
      } else {
        throw sendError;
      }
    }

    // 4. Log media message to conversation with Firebase Storage URL
    await conversationLogService.logMediaMessage(
      to,
      'agent',
      {
        mediaUrl: storageUrl,
        mediaType: mediaType, // Log original type for display
        mimeType: finalMimeType,
        caption: caption || `[${mediaType} enviado por agente]`
      }
    );

    console.log(`✅ Dashboard: ${mediaType} procesado exitosamente`);
    console.log(`   Conversión intentada: ${conversionAttempted}`);
    console.log(`   Conversión exitosa: ${conversionSucceeded}`);
    console.log(`   Enviado como: ${actualMediaType}`);
    console.log(`========================================\n`);

    return res.status(200).json({
      success: true,
      message: `${mediaType} enviado correctamente`,
      mediaId: mediaId,
      sentAs: actualMediaType,
      conversionAttempted,
      conversionSucceeded,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Dashboard: Error enviando media:', error);
    console.error('   Stack:', error.stack);
    return res.status(500).json({
      success: false,
      error: 'Error al enviar media',
      details: error.message
    });
  }
}

/**
 * POST /api/dashboard/start-conversation
 * Sends doctor_message template to initiate conversation with a client
 * This is used when the 24h window is closed and agent needs to contact client
 * Body: { clientId: "573001234567", clientName: "Juan Pérez" }
 */
async function startConversation(req, res) {
  try {
    const { clientId, clientName } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere el campo "clientId"'
      });
    }

    console.log(`📨 Dashboard: Enviando template doctor_message a ${clientId}...`);

    // Send the doctor_message template
    const result = await whatsappTemplateService.sendDoctorMessage(
      clientId,
      clientName || 'Estimado paciente'
    );

    if (!result.success) {
      console.error(`❌ Dashboard: Error enviando template: ${result.error}`);
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    // Log the template message to conversation
    await conversationLogService.logSimpleMessage(
      clientId,
      'agent',
      `[Template enviado: El Dr. Camilo desea comunicarse contigo]`,
      null,
      clientName
    );

    console.log(`✅ Dashboard: Template enviado a ${clientId}`);

    return res.status(200).json({
      success: true,
      message: 'Mensaje de contacto enviado. El cliente debe responder para abrir la conversación.',
      messageId: result.messageId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Dashboard: Error en startConversation:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al enviar mensaje de contacto',
      details: error.message
    });
  }
}

module.exports = {
  getActiveChatSessions,
  getSessionDetails,
  sendMessageFromDashboard,
  sendMediaFromDashboard,
  startIntervention,
  closeIntervention,
  startConversation,
  healthCheck
};
