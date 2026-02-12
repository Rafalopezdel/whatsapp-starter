// webhookController.js
const { sendText } = require('../services/whatsappService');
const { getOrCreateSession, addMessageToBuffer, setDocumentNumber, getDocumentNumber } = require('../services/sessionService');
const { routeByIntent } = require('../services/routerService');
const logger = require('../utils/logger');
const configService = require('../services/configService');
const handoffService = require('../services/handoffService');
const assistantRouter = require('../services/assistantRouter');
const conversationLogService = require('../services/conversationLogService');
const reminderService = require('../services/reminderService');
const mediaService = require('../services/mediaService');

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

exports.verifyWebhook = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verificado');
        return res.status(200).send(challenge);
    }
    console.warn('❌ Falló verificación de webhook');
    return res.sendStatus(403);
};

exports.handleWebhook = async (req, res) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📥 [WEBHOOK] ${new Date().toISOString()}`);

    // DEBUG: Log raw body para ver TODO lo que llega
    console.log(`🔍 [DEBUG] Raw body type: ${typeof req.body}`);
    console.log(`🔍 [DEBUG] Raw body: ${JSON.stringify(req.body).substring(0, 500)}`);

    try {
        res.sendStatus(200);
        logger('Evento recibido', req.body);

        const body = req.body;
        const entry = body?.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const statuses = value?.statuses;
        if (statuses) return;

        const message = value?.messages?.[0];
        if (!message) {
            console.log(`🔍 [DEBUG] No hay mensaje en el evento (probablemente status update)`);
            return;
        }

        const from = message.from;

        // DEBUG: Log message type
        console.log(`🔍 [DEBUG] Message type: "${message.type}"`);
        console.log(`🔍 [DEBUG] Message keys: ${Object.keys(message).join(', ')}`);
        if (message.button) {
            console.log(`🔍 [DEBUG] Button payload: "${message.button?.payload}"`);
        }

        // 🔔 MANEJO DE RESPUESTAS DE BOTONES DE TEMPLATES
        // Los botones de templates vienen como type="button" con button.payload
        // ⚠️ IMPORTANTE: El orden de detección importa. Los más específicos primero.
        if (message.type === 'button' && message.button?.payload) {
            const buttonPayload = message.button.payload.toLowerCase().trim();
            console.log(`🔘 Respuesta de botón de template: "${buttonPayload}" de ${from}`);

            // 1. Template doctor_message - Aceptar (contiene "disponible")
            if (buttonPayload.includes('disponible')) {
                console.log(`✅ Cliente ${from} aceptó comunicación con el doctor`);

                // Guardar respuesta del usuario primero (el texto real del botón)
                const userButtonText = message.button?.text || 'Sí, disponible';
                await conversationLogService.logSimpleMessage(from, 'user', userButtonText, null, null);

                // Abrir handoff automáticamente
                const agentPhoneNumber = await configService.getAgentPhoneNumber();
                const existingHandoff = await handoffService.getActiveHandoffByClient(from);

                if (!existingHandoff) {
                    await handoffService.createHandoff(from, agentPhoneNumber, 'Cliente');

                    const confirmMessage = '👤 Perfecto, el Dr. Camilo se comunicará contigo en breve.';
                    await sendText(from, confirmMessage);

                    // Guardar mensaje del bot
                    await conversationLogService.logSimpleMessage(from, 'assistant', confirmMessage, null, null);

                    // Notificar al agente que el cliente respondió
                    await sendText(agentPhoneNumber, `✅ ${from} está disponible para hablar. Revisa el dashboard para responder.`);
                }

                return;
            }

            // 2. Template doctor_message - Rechazar (contiene "ahora no" o "no puedo")
            if (buttonPayload.includes('ahora no') || buttonPayload.includes('no puedo')) {
                console.log(`⏳ Cliente ${from} no está disponible ahora`);

                // Guardar respuesta del usuario (el texto real del botón)
                const userButtonText = message.button?.text || 'Ahora no puedo';
                await conversationLogService.logSimpleMessage(from, 'user', userButtonText, null, null);

                const agentPhoneNumber = await configService.getAgentPhoneNumber();
                await sendText(agentPhoneNumber, `⏳ ${from} respondió "Ahora no puedo". Intenta más tarde.`);

                return;
            }

            // 3. Template recordatorio citas - Confirmar (contiene "confirmo")
            if (buttonPayload.includes('confirmo')) {
                console.log(`✅ Procesando confirmación de cita para ${from}`);
                await reminderService.processConfirmation(from);
                return;
            }

            // 4. Template recordatorio citas - Cancelar (contiene "no podré" o "cancelar")
            if (buttonPayload.includes('no podré') || buttonPayload.includes('no podre') || buttonPayload.includes('cancelar')) {
                console.log(`❌ Procesando cancelación de cita para ${from}`);
                await reminderService.processCancellation(from);
                return;
            }

            // Si es otro botón de template, continuar con el flujo normal
            console.log(`ℹ️ Botón de template no reconocido: "${buttonPayload}", continuando flujo normal`);
        }

        // También manejar botones interactivos (por si se usan en el futuro)
        if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
            const buttonTitle = message.interactive.button_reply.title?.toLowerCase().trim();
            console.log(`🔘 Respuesta de botón interactivo: "${buttonTitle}" de ${from}`);

            if (buttonTitle?.includes('confirmo')) {
                console.log(`✅ Procesando confirmación de cita para ${from}`);
                await reminderService.processConfirmation(from);
                return;
            }

            if (buttonTitle?.includes('no podré') || buttonTitle?.includes('cancelar')) {
                console.log(`❌ Procesando cancelación de cita para ${from}`);
                await reminderService.processCancellation(from);
                return;
            }
        }

        // 📎 MANEJO DE MULTIMEDIA (imágenes, videos, audios, documentos, stickers)
        const mediaTypes = ['image', 'video', 'audio', 'document', 'sticker'];
        if (mediaTypes.includes(message.type)) {
            console.log(`📎 [MEDIA] Mensaje de tipo ${message.type} recibido de ${from}`);

            try {
                const mediaObj = message[message.type];
                const mediaId = mediaObj.id;
                const mimeType = mediaObj.mime_type;
                const caption = mediaObj.caption || null;

                console.log(`📎 [MEDIA] mediaId: ${mediaId}, mimeType: ${mimeType}, caption: ${caption || 'ninguno'}`);

                // Procesar y subir a Firebase Storage
                const storageUrl = await mediaService.processIncomingMedia(mediaId, from, message.type, mimeType);

                // Guardar en conversación con estructura extendida
                await conversationLogService.logMediaMessage(from, 'user', {
                    mediaUrl: storageUrl,
                    mediaType: message.type,
                    mimeType: mimeType,
                    caption: caption
                });

                // Obtener número del agente para notificación
                const agentPhoneNumber = await configService.getAgentPhoneNumber();

                // Notificar al usuario y conectar con agente
                const mediaAckMessage = 'He recibido tu archivo. Te conecto con un agente para ayudarte mejor.';
                await sendText(from, mediaAckMessage);

                // Guardar respuesta del bot
                await conversationLogService.logSimpleMessage(from, 'assistant', mediaAckMessage, null, null);

                // Verificar si ya tiene handoff activo
                const existingHandoff = await handoffService.getActiveHandoffByClient(from);
                if (!existingHandoff) {
                    // Crear handoff
                    await handoffService.createHandoff(from, agentPhoneNumber, 'Cliente');
                }

                // Notificar al agente
                const mediaTypeLabel = {
                    'image': 'imagen',
                    'video': 'video',
                    'audio': 'audio',
                    'document': 'documento',
                    'sticker': 'sticker'
                };
                await sendText(agentPhoneNumber, `📎 ${from} envió un ${mediaTypeLabel[message.type] || 'archivo'}. Revisa el dashboard.`);

                console.log(`✅ [MEDIA] Procesamiento completo para ${from}`);
                return;
            } catch (mediaError) {
                console.error(`❌ [MEDIA] Error procesando media:`, mediaError.message);
                await sendText(from, 'Hubo un problema al recibir tu archivo. Por favor intenta de nuevo o escribe tu mensaje.');
                return;
            }
        }

        const userMessageContent = message.type === 'text' ? message.text.body : message.interactive?.list_reply?.title || message.interactive?.button_reply?.title;
        if (!userMessageContent) return;

        console.log(`📥 De: ${from} | Mensaje: "${userMessageContent.substring(0, 50)}..."`);

        // Verificar si es el agente
        const isAgent = await configService.isAgentPhoneNumber(from);

        if (isAgent) {
            console.log(`👨‍⚕️ Mensaje del AGENTE`);

            // PRIORIDAD 0: Comandos
            const isCommand = userMessageContent.trim().toLowerCase().startsWith('/');
            if (isCommand) {
                console.log(`⚡ Comando: ${userMessageContent}`);
                await assistantRouter.handleAgentQuery(from, userMessageContent);
                return;
            }

            // PRIORIDAD 1: Handoff activo
            const activeHandoff = await handoffService.getActiveHandoffByAgent(from);

            if (activeHandoff) {
                console.log(`🔁 Reenviando a cliente ${activeHandoff.clientId}`);
                await sendText(activeHandoff.clientId, userMessageContent);
                await handoffService.updateHandoffTimestamp(activeHandoff.id);

                await conversationLogService.logSimpleMessage(
                    activeHandoff.clientId,
                    'agent',
                    userMessageContent,
                    null,
                    activeHandoff.clientName
                );
                return;
            }

            // PRIORIDAD 2: Asistente Personal
            console.log(`💼 Procesando como Asistente Personal`);
            await addMessageToBuffer(from, userMessageContent, async (fullText) => {
                await assistantRouter.handleAgentQuery(from, fullText);
            });
            return;
        }

        // FLUJO CLIENTE
        console.log(`👤 Mensaje de CLIENTE`);

        // Verificar handoff activo del cliente
        const clientHandoff = await handoffService.getActiveHandoffByClient(from);

        if (clientHandoff) {
            console.log(`👤 Cliente en intervención - guardando para dashboard`);
            await handoffService.updateHandoffTimestamp(clientHandoff.id);
            await conversationLogService.logSimpleMessage(
                from,
                'user',
                userMessageContent,
                null,
                clientHandoff.clientName
            );
            return;
        }

        // Flujo normal del bot
        const session = await getOrCreateSession(from);

        await addMessageToBuffer(from, userMessageContent, async (fullText) => {
            const session = await getOrCreateSession(from);

            // Detectar documento (6-10 dígitos)
            const docMatch = fullText.match(/\b\d{6,10}\b/);
            if (docMatch) {
                await setDocumentNumber(from, docMatch[0]);
            }

            session.data.documentNumber = await getDocumentNumber(from);

            await routeByIntent({
                from,
                freeText: fullText,
                session,
            });
        });

    } catch (err) {
        console.error('❌ Error en handleWebhook:', err?.response?.data || err.message);
    } finally {
        console.log(`${'='.repeat(60)}\n`);
    }
};
