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

        // 🔔 MANEJO DE RESPUESTAS DE BOTONES DE TEMPLATES (Recordatorios de citas)
        // Los botones de templates vienen como type="button" con button.payload
        if (message.type === 'button' && message.button?.payload) {
            const buttonPayload = message.button.payload.toLowerCase().trim();
            console.log(`🔘 Respuesta de botón de template: "${buttonPayload}" de ${from}`);

            // Detectar confirmación
            if (buttonPayload.includes('confirmo') || buttonPayload.includes('sí')) {
                console.log(`✅ Procesando confirmación de cita para ${from}`);
                await reminderService.processConfirmation(from);
                return;
            }

            // Detectar cancelación
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
