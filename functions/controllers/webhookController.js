// webhookController.js
const { sendText } = require('../services/whatsappService');
const { getOrCreateSession, addMessageToBuffer, setDocumentNumber, getDocumentNumber } = require('../services/sessionService');
const { routeByIntent } = require('../services/routerService');
const logger = require('../utils/logger');
const configService = require('../services/configService');
const handoffService = require('../services/handoffService');
const assistantRouter = require('../services/assistantRouter');
const conversationLogService = require('../services/conversationLogService');

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
        if (!message) return;

        const from = message.from;
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
