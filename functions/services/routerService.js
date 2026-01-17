// services/routerService.js
const { handleConversation } = require('./anthropicService');
const { sendText } = require('./whatsappService');
const { setSession } = require('./sessionService');
const dentalinkService = require('./dentalinkService');
const conversationLogService = require('./conversationLogService');
const chrono = require('chrono-node');
const handoffService = require('./handoffService');
const configService = require('./configService');
const slotMatcher = require('./slotMatcher');

// Convierte fecha YYYY-MM-DD a formato legible (ej: "Lunes, 29 de septiembre")
function formatDateToHumanReadable(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    let formattedDate = date.toLocaleDateString('es-ES', options);
    formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
    const currentYear = new Date().getFullYear();
    if (year === currentYear) {
        formattedDate = formattedDate.replace(/ de \d{4}/, '');
    }
    return formattedDate;
}

// Normaliza fecha a formato YYYY-MM-DD (requerido por Dentalink)
function normalizeDateToYYYYMMDD(dateStr) {
    if (!dateStr) return null;

    // Si ya está en formato YYYY-MM-DD, devolverlo
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }

    // Limpiar separadores (/, -, .)
    const cleanDate = dateStr.replace(/[\/\.\-]/g, '/');
    const parts = cleanDate.split('/');

    if (parts.length !== 3) return dateStr;

    let year, month, day;

    // Detectar formato por la posición del año (4 dígitos)
    if (parts[0].length === 4) {
        // Formato YYYY/MM/DD o YYYY/DD/MM
        year = parts[0];
        // Si el segundo número es > 12, es el día
        if (parseInt(parts[1]) > 12) {
            day = parts[1].padStart(2, '0');
            month = parts[2].padStart(2, '0');
        } else {
            month = parts[1].padStart(2, '0');
            day = parts[2].padStart(2, '0');
        }
    } else if (parts[2].length === 4) {
        // Formato DD/MM/YYYY o MM/DD/YYYY
        year = parts[2];
        // Si el primer número es > 12, es el día (DD/MM/YYYY)
        if (parseInt(parts[0]) > 12) {
            day = parts[0].padStart(2, '0');
            month = parts[1].padStart(2, '0');
        } else if (parseInt(parts[1]) > 12) {
            // MM/DD/YYYY (formato americano)
            month = parts[0].padStart(2, '0');
            day = parts[1].padStart(2, '0');
        } else {
            // Asumimos DD/MM/YYYY (formato más común en Colombia)
            day = parts[0].padStart(2, '0');
            month = parts[1].padStart(2, '0');
        }
    } else {
        // Formato con año de 2 dígitos, asumimos DD/MM/YY
        day = parts[0].padStart(2, '0');
        month = parts[1].padStart(2, '0');
        year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
    }

    return `${year}-${month}-${day}`;
}

// Extrae el motivo de la cita del historial buscando keywords dentales
function extractReasonFromHistory(history) {
    if (!history || history.length === 0) return null;

    const dentalKeywords = {
        'Diseño de sonrisa': ['diseño de sonrisa', 'diseño sonrisa', 'blanqueamiento', 'carillas', 'estética dental', 'sonrisa'],
        'Limpieza': ['limpieza', 'profilaxis', 'higiene dental', 'limpieza dental'],
        'Ortodoncia': ['ortodoncia', 'brackets', 'braces', 'frenillos', 'alineadores', 'invisalign'],
        'Dolor': ['dolor', 'dolor de muela', 'me duele', 'duele'],
        'Emergencia': ['urgencia', 'emergencia', 'urgente', 'dolor fuerte'],
        'Extracción': ['extracción', 'sacar muela', 'quitar muela', 'cordal', 'muela del juicio'],
        'Caries': ['caries', 'calza', 'resina', 'empaste'],
        'Endodoncia': ['endodoncia', 'conducto', 'tratamiento de conducto', 'matar nervio'],
        'Prótesis': ['prótesis', 'corona', 'puente', 'implante'],
        'Revisión': ['revisión', 'chequeo', 'control', 'valoración', 'consulta general'],
        'Periodoncia': ['encías', 'sangrado', 'periodontitis', 'gingivitis']
    };

    const userMessages = history
        .filter(msg => msg.role === 'user' && typeof msg.content === 'string')
        .slice(-10)
        .reverse();

    for (const message of userMessages) {
        const text = message.content.toLowerCase();
        for (const [category, keywords] of Object.entries(dentalKeywords)) {
            for (const keyword of keywords) {
                if (text.includes(keyword)) {
                    return category;
                }
            }
        }
    }
    return null;
}

function isValidDocumentNumber(documentNumber) {
    return /^\d+$/.test(documentNumber);
}

function normalizePhoneNumber(phoneNumber) {
    let normalized = phoneNumber.replace(/\+/g, '');
    if (normalized.startsWith('57')) {
        normalized = normalized.substring(2);
    }
    return normalized;
}

// Resume tool_result para almacenamiento optimizado en Firestore
function summarizeToolResult(toolName, toolResult) {
    if (toolResult.length < 200) {
        return toolResult;
    }

    switch (toolName) {
        case 'getAvailableTimeSlots':
            try {
                const slotsMatch = toolResult.match(/\[.*\]/);
                if (slotsMatch) {
                    const slots = JSON.parse(slotsMatch[0]);
                    return `Se encontraron ${slots.length} horarios disponibles para agendar.`;
                }
            } catch (e) {}
            return 'Se consultaron horarios disponibles.';

        case 'getAppointmentsByPatient':
            if (toolResult.includes('Tu próxima cita es')) {
                return toolResult;
            }
            return 'Se consultaron las citas del paciente.';

        case 'findPatientByDocument':
        case 'createPatient':
        case 'createAppointment':
        case 'updateAppointment':
        case 'cancelAppointment':
            return toolResult;

        default:
            return toolResult.substring(0, 200) + '...';
    }
}

// Prepara historial para Firestore (versión resumida, sin contexto interno)
function prepareHistoryForStorage(history) {
    return history
        .filter(item => {
            if (typeof item.content === 'string') {
                if (item.content.includes('[CONTEXTO INTERNO')) return false;
                if (item.content.includes('Reconozco a este paciente registrado')) return false;
            }
            return true;
        })
        .map(item => {
            if (item.role === 'user' && Array.isArray(item.content) && item.content[0]?.type === 'tool_result') {
                const toolContent = item.content[0];
                return {
                    role: item.role,
                    content: [{
                        type: 'tool_result',
                        tool_use_id: toolContent.tool_use_id,
                        content: summarizeToolResult(toolContent.tool_use_id, toolContent.content)
                    }]
                };
            }
            return item;
        });
}

// Trunca historial manteniendo contexto crítico (máximo 20 mensajes)
function truncateHistory(history, maxMessages = 20) {
    if (history.length <= maxMessages) {
        return history;
    }

    const criticalMessages = [];
    if (history.length > 0 &&
        typeof history[0].content === 'string' &&
        history[0].content.includes('[CONTEXTO INTERNO')) {
        criticalMessages.push(history[0]);
        if (history.length > 1) criticalMessages.push(history[1]);
    }

    const reservedSlots = criticalMessages.length;
    const recentSlots = maxMessages - reservedSlots;
    const recentMessages = history.slice(-recentSlots);
    return [...criticalMessages, ...recentMessages];
}

// Inyecta CONTEXTO INTERNO al inicio del historial si tenemos datos del usuario
function injectUserContext(history, userName, userDocument) {
    if (!userName || !userDocument) return history;

    // Verificar si ya tiene CONTEXTO INTERNO
    const hasContext = history.some(item =>
        typeof item.content === 'string' && item.content.includes('[CONTEXTO INTERNO')
    );

    if (hasContext) return history;

    // Inyectar al inicio
    const contextMessages = [
        {
            role: 'user',
            content: `[CONTEXTO INTERNO - NO MENCIONAR EXPLÍCITAMENTE] Usuario conocido: ${userName}, documento ${userDocument}. Ya está registrado en el sistema.`
        },
        {
            role: 'assistant',
            content: `Entendido. Reconozco a este paciente registrado.`
        }
    ];

    return [...contextMessages, ...history];
}

async function routeByIntent({ from, freeText, session }) {
    console.log(`\n${'~'.repeat(60)}`);
    console.log(`📩 [ROUTER] Mensaje: "${freeText}"`);

    let documentNumber = session.data?.documentNumber;
    let userName = session.data?.userName;

    // Mapeo conversation_history → history para compatibilidad
    if (session.conversation_history && session.conversation_history.length > 0) {
        session.history = [...session.conversation_history];
    } else if (!session.history || session.history.length === 0) {
        session.history = [];
    }

    // INTERCEPTOR: Matching automático de slots (solo para CREACIÓN de citas nuevas)
    if (session.availableSlots && session.availableSlots.length > 0 && !session.id_sesion) {
        const matchedSlot = slotMatcher.matchSlot(freeText, session.availableSlots);

        if (matchedSlot) {
            console.log(`✅ Match automático: ${matchedSlot.fecha} ${matchedSlot.hora}`);

            try {
                const reason = extractReasonFromHistory(session.history);
                const result = await dentalinkService.createAppointment(
                    matchedSlot.fecha,
                    matchedSlot.hora,
                    documentNumber,
                    reason
                );

                if (result.success) {
                    const fechaLegible = formatDateToHumanReadable(matchedSlot.fecha);
                    const mensaje = `¡Perfecto! Tu cita está confirmada para el ${fechaLegible} a las ${matchedSlot.hora} con el Dr. Camilo. Te esperamos en la clínica. 😊`;

                    if (result.data && result.data.id) {
                        session.id_sesion = result.data.id;
                    }

                    session.history.push({ role: 'user', content: freeText });
                    session.history.push({ role: 'assistant', content: mensaje });

                    await sendText(from, mensaje);

                    delete session.availableSlots;
                    const historyForFirestore = prepareHistoryForStorage(session.history).slice(-15);
                    await setSession(from, {
                        ...session,
                        conversation_history: historyForFirestore,
                        id_sesion: session.id_sesion
                    });

                    let userName = session.data?.userName || null;
                    conversationLogService.logConversation(from, session.history, documentNumber, userName)
                        .catch(err => console.error('❌ Error en logConversation (matching):', err));

                    console.log(`✅ Cita creada mediante matching automático`);
                    console.log(`${'~'.repeat(60)}\n`);
                    return;
                } else {
                    console.log(`❌ Error en matching automático: ${result.message}`);
                }
            } catch (error) {
                console.error(`❌ Error en matching automático:`, error);
            }
        }
    }

    // MEMORIA PERSISTENTE: Cargar datos del usuario si es primera interacción
    if (!session.history || session.history.length === 0) {
        try {
            const userData = await conversationLogService.getUserData(from);

            if (userData && userData.userName && userData.userDocument) {
                console.log(`👋 Usuario reconocido: ${userData.userName} (${userData.userDocument})`);

                session.data.documentNumber = userData.userDocument;
                session.data.userName = userData.userName;
                documentNumber = userData.userDocument;
                userName = userData.userName;

                session.history.push({
                    role: 'user',
                    content: `[CONTEXTO INTERNO - NO MENCIONAR EXPLÍCITAMENTE] Usuario conocido: ${userData.userName}, documento ${userData.userDocument}. Última interacción: ${userData.lastInteraction}.`
                });

                session.history.push({
                    role: 'assistant',
                    content: `Entendido. Reconozco a este paciente registrado.`
                });

                let historyForStorage = prepareHistoryForStorage(session.history).slice(-15);
                await setSession(from, {
                    data: session.data,
                    conversation_history: historyForStorage,
                    document_number: userData.userDocument || null
                });
            }
        } catch (error) {
            console.error('❌ Error cargando memoria persistente:', error);
        }
    }

    // Agregar mensaje del usuario al historial
    session.history.push({ role: 'user', content: freeText });

    // Inyectar contexto de usuario conocido y truncar historial
    const historyWithContext = injectUserContext(session.history, userName, documentNumber);
    const truncatedHistory = truncateHistory(historyWithContext, 20);
    let aiResponse = await handleConversation(freeText, truncatedHistory);

    // Bucle de herramientas
    let toolCallCount = 0;
    while (aiResponse.type === 'tool_use') {
        toolCallCount++;
        const { name, parameters } = aiResponse;
        console.log(`➡️ [TOOL #${toolCallCount}] ${name}`);

        session.history.push({
            role: 'assistant',
            content: [{
                type: 'tool_use',
                id: name,
                name: name,
                input: parameters
            }]
        });

        let historyForStorage = prepareHistoryForStorage(session.history).slice(-15);
        await setSession(from, {
            conversation_history: historyForStorage,
            data: session.data || {},
            id_sesion: session.id_sesion || null,
            document_number: documentNumber || null
        });

        let toolResult;

        // findPatientByDocument
        if (name === 'findPatientByDocument') {
            const documentNumber = parameters.documentNumber;

            if (!isValidDocumentNumber(documentNumber)) {
                toolResult = `The provided document number is not valid. Please provide a valid document number.`;
            } else {
                const patient = await dentalinkService.findPatientByDocument(documentNumber);
                if (patient) {
                    toolResult = `Patient with ID ${patient.id} and name ${patient.nombre} exists.`;
                    if (patient.nombre) {
                        session.data.userName = patient.nombre;
                    }
                } else {
                    toolResult = `Patient with document number ${documentNumber} does not exist. The user has requested an appointment.`;
                }
            }

        // createPatient
        } else if (name === 'createPatient') {
            const normalizedFrom = normalizePhoneNumber(from);
            const patientData = { ...parameters.patientData, celular: normalizedFrom };
            const documentNumber = parameters.patientData.rut;

            // Normalizar fecha de nacimiento al formato YYYY-MM-DD requerido por Dentalink
            if (patientData.fecha_nacimiento) {
                patientData.fecha_nacimiento = normalizeDateToYYYYMMDD(patientData.fecha_nacimiento);
                console.log(`📅 Fecha normalizada: ${patientData.fecha_nacimiento}`);
            }

            setSession(from, { ...session, documentNumber: documentNumber });

            const newPatient = await dentalinkService.createPatient(patientData);
            if (newPatient) {
                toolResult = `Patient ${newPatient.data.nombre} has been successfully created. Now, the AI should continue the scheduling process.`;

                if (newPatient.data.nombre) {
                    session.data.userName = newPatient.data.nombre;
                }

                try {
                    const currentHistory = prepareHistoryForStorage(session.history);
                    await conversationLogService.logConversation(from, currentHistory, documentNumber, newPatient.data.nombre);
                } catch (error) {
                    console.error('⚠️ Error actualizando log después de crear paciente:', error.message);
                }
            } else {
                toolResult = `There was an error creating the patient. Please inform the user to review their data.`;
            }

        // getAvailableTimeSlots
        } else if (name === 'getAvailableTimeSlots') {
            const availableSlots = await dentalinkService.getAvailableTimeSlots({
                date: parameters.date,
                currentDate: new Date().toISOString().split('T')[0],
                freeText: parameters.freeText
            });

            if (!availableSlots || availableSlots.length === 0) {
                toolResult = `No hay disponibilidad para la fecha ${parameters.date}.`;
            } else {
                const parsedDate = chrono.parseDate(parameters.freeText || '');
                if (parsedDate) {
                    const requestedDate = parsedDate.toISOString().split('T')[0];
                    const requestedTime = parsedDate.toTimeString().slice(0, 5);

                    const match = availableSlots.find(slot =>
                        slot.fecha === requestedDate && slot.hora_inicio === requestedTime
                    );

                    if (match) {
                        const appointmentResult = await dentalinkService.createAppointment(
                            requestedDate,
                            requestedTime,
                            documentNumber
                        );

                        if (appointmentResult.success) {
                            toolResult = `✅ Cita agendada para el ${requestedDate} a las ${requestedTime}.`;
                        } else {
                            toolResult = `❌ No se pudo agendar la cita: ${appointmentResult.message}`;
                        }
                    } else {
                        toolResult = `😔 No hay disponibilidad a las ${requestedTime} el ${requestedDate}.`;
                    }
                } else {
                    const formattedSlots = availableSlots.map(slot => ({
                        fecha_legible: formatDateToHumanReadable(slot.fecha),
                        hora: slot.hora_inicio,
                        fecha_raw: slot.fecha,
                    }));

                    await setSession(from, { ...session, availableSlots: formattedSlots });
                    session.availableSlots = formattedSlots;

                    toolResult = `Slots disponibles:\n${JSON.stringify(formattedSlots)}\n\n⚠️ INSTRUCCIONES CRÍTICAS:
1. MUESTRA AL USUARIO usando EXACTAMENTE el texto de "fecha_legible" (ej: "Lunes, 20 de enero" → muestra "Lunes 20")
2. NUNCA calcules el día del mes tú mismo - usa el número que aparece en fecha_legible
3. Para agendar, usa el "fecha_raw" correspondiente al slot elegido
4. Ejemplo: fecha_legible="Martes, 20 de enero" → muestra "Martes 20" al usuario, NO "Martes 21"`;
                }
            }

        // getAppointmentsByPatient
        } else if (name === 'getAppointmentsByPatient') {
            const documentNumber = parameters.documentNumber;
            const patient = await dentalinkService.findPatientByDocument(documentNumber);

            if (!patient || !patient.id) {
                toolResult = `❌ No se encontró el paciente con documento ${documentNumber}.`;
            } else {
                const citasActivas = await dentalinkService.getAppointmentsByPatient(patient.id);

                if (citasActivas && citasActivas.length > 0) {
                    citasActivas.sort((a, b) => {
                        const fechaHoraA = new Date(`${a.fecha}T${a.hora_inicio}`);
                        const fechaHoraB = new Date(`${b.fecha}T${b.hora_inicio}`);
                        return fechaHoraA - fechaHoraB;
                    });

                    const proxima = citasActivas[0];

                    if (!session.data) session.data = {};
                    session.data.currentAppointmentComment = proxima.comentarios || null;

                    await setSession(from, {
                        ...session,
                        id_sesion: proxima.id,
                        data: session.data
                    });
                    session.id_sesion = proxima.id;

                    const fechaLegible = formatDateToHumanReadable(proxima.fecha);
                    toolResult = `📅 Patient has an active appointment:
- Appointment ID: ${proxima.id}
- Date: ${fechaLegible}
- Date (exact): ${proxima.fecha}
- Time: ${proxima.hora_inicio}
- Doctor: ${proxima.dentista}

IMPORTANT:
- If user wants to change this appointment, use updateAppointment with id_sesion=${proxima.id}
- If user says "same day" or "same [weekday]", use exact date "${proxima.fecha}" when calling getAvailableTimeSlots(date="${proxima.fecha}")`;
                } else {
                    toolResult = `✅ No tienes citas pendientes. Puedes agendar una nueva.`;
                }
            }

        // createAppointment
        } else if (name === 'createAppointment') {
            let { date, time, documentNumber, reason } = parameters;

            // Corregir fecha usando slots disponibles
            if (session.availableSlots && session.availableSlots.length > 0) {
                const lastUserMessage = session.history
                    .filter(m => m.role === 'user' && typeof m.content === 'string')
                    .slice(-1)[0]?.content || freeText;

                const correctedDate = slotMatcher.correctDateFromSlots(date, time, session.availableSlots, lastUserMessage);
                if (correctedDate !== date) {
                    console.log(`🔧 Corrección fecha (create): ${date} → ${correctedDate}`);
                    date = correctedDate;
                }
            }

            const patient = await dentalinkService.findPatientByDocument(documentNumber);

            if (!patient || !patient.id) {
                toolResult = `❌ No se encontró el paciente con documento ${documentNumber}. Primero debes registrarlo.`;
            } else {
                const appointmentResult = await dentalinkService.createAppointment(date, time, documentNumber, reason || null);

                if (appointmentResult.success) {
                    const fechaLegible = formatDateToHumanReadable(date);
                    toolResult = `✅ Cita agendada para el ${fechaLegible} a las ${time} con el Dr. Camilo.`;
                } else {
                    toolResult = `❌ No se pudo agendar la cita: ${appointmentResult.message}`;
                }
            }

        // updateAppointment
        } else if (name === 'updateAppointment') {
            const id_sesion = session.id_sesion || parameters.id_sesion;
            let { date, time } = parameters;

            // Corregir fecha usando slots disponibles
            if (session.availableSlots && session.availableSlots.length > 0) {
                const lastUserMessage = session.history
                    .filter(m => m.role === 'user' && typeof m.content === 'string')
                    .slice(-1)[0]?.content || freeText;

                const correctedDate = slotMatcher.correctDateFromSlots(date, time, session.availableSlots, lastUserMessage);
                if (correctedDate !== date) {
                    console.log(`🔧 Corrección fecha (update): ${date} → ${correctedDate}`);
                    date = correctedDate;
                }
            }

            if (!id_sesion || !date || !time) {
                console.error("❌ Faltan parámetros:", { id_sesion, date, time });
                toolResult = `❌ Missing required parameters to update appointment. Need id_sesion (${id_sesion}), date (${date}), and time (${time}). You must call getAppointmentsByPatient first to get the correct appointment ID.`;
            } else {
                try {
                    let currentComment = session.data?.currentAppointmentComment || null;

                    const result = await dentalinkService.updateAppointment(
                        id_sesion, date, time, 60, 1, 1, currentComment
                    );

                    if (result?.data) {
                        const newAppointmentId = result.data.id;

                        session.id_sesion = newAppointmentId;
                        if (!session.data) session.data = {};
                        session.data.currentAppointmentComment = result.data.comentarios || null;

                        await setSession(from, {
                            ...session,
                            id_sesion: newAppointmentId,
                            data: session.data
                        });

                        const fechaLegible = formatDateToHumanReadable(result.data.fecha);
                        toolResult = `✅ Appointment successfully updated to ${fechaLegible} at ${result.data.hora_inicio} with Dr. ${result.data.nombre_dentista}.`;
                    } else {
                        console.error("❌ updateAppointment no retornó data:", result);
                        toolResult = `❌ Could not update the appointment. No data returned from Dentalink.`;
                    }
                } catch (error) {
                    console.error("❌ Error en updateAppointment:", error);
                    toolResult = `❌ Error updating appointment: ${error.response?.data?.error || error.message}`;
                }
            }

        // cancelAppointment
        } else if (name === 'cancelAppointment') {
            const id_cita = session.id_sesion || parameters.id_cita;
            const { comentarios } = parameters;

            if (!id_cita) {
                console.error("❌ No hay id_cita:", { session_id_sesion: session.id_sesion });
                toolResult = "❌ No active appointment found to cancel. You must call getAppointmentsByPatient first to get the correct appointment ID.";
            } else {
                try {
                    const result = await dentalinkService.cancelAppointment(
                        id_cita,
                        comentarios || "Cita anulada por el paciente"
                    );

                    toolResult = `✅ Appointment on ${result.data.fecha} at ${result.data.hora_inicio} has been successfully cancelled.`;
                } catch (error) {
                    console.error("❌ Error en cancelAppointment:", error);
                    toolResult = `❌ Could not cancel appointment: ${error.response?.data?.error || error.message}`;
                }
            }

        // requestHumanAgent
        } else if (name === 'requestHumanAgent') {
            const { reason } = parameters;
            console.log(`🤝 requestHumanAgent - Razón: ${reason}`);

            try {
                const agentPhoneNumber = await configService.getAgentPhoneNumber();

                if (!agentPhoneNumber) {
                    console.error("❌ No hay agentPhoneNumber configurado");
                    toolResult = "❌ Sistema de relevo no disponible. No hay agente configurado.";
                } else {
                    let clientName = 'Cliente';
                    if (documentNumber) {
                        try {
                            const patient = await dentalinkService.findPatientByDocument(documentNumber);
                            if (patient && patient.nombre) {
                                clientName = patient.nombre;
                            }
                        } catch (error) {}
                    }

                    session.data.pendingIntervention = true;
                    session.data.interventionReason = reason;
                    await setSession(from, {
                        data: session.data,
                        conversation_history: prepareHistoryForStorage(session.history)
                    });

                    const handoff = await handoffService.createHandoff(from, agentPhoneNumber, clientName);

                    const dashboardUrl = `https://whatsapp-starter-4de11.web.app/?client=${from}`;
                    const notificationMessage = `🔔 *Solicitud de Atención Humana*\n\n👤 *Cliente:* ${clientName}\n📱 *Teléfono:* ${from}\n💬 *Razón:* ${reason}\n\n🖥️ *Abrir Dashboard:*\n${dashboardUrl}\n\n_Presiona "Intervenir" en el dashboard para tomar control de la conversación._`;

                    await sendText(agentPhoneNumber, notificationMessage);

                    console.log(`✅ Notificación enviada al agente ${agentPhoneNumber}`);
                    toolResult = `✅ Human agent notified successfully. Reason: ${reason}. Tell the user that their request has been forwarded to a human agent who will respond through this same chat shortly.`;
                }
            } catch (error) {
                console.error("❌ Error en requestHumanAgent:", error);
                toolResult = `❌ Error notifying agent: ${error.message}`;
            }
        }

        // Agregar resultado al historial
        session.history.push({
            role: 'user',
            content: [{
                type: 'tool_result',
                tool_use_id: name,
                content: toolResult
            }]
        });

        historyForStorage = prepareHistoryForStorage(session.history).slice(-15);
        await setSession(from, {
            conversation_history: historyForStorage,
            data: session.data || {},
            id_sesion: session.id_sesion || null,
            document_number: documentNumber || null
        });

        const historyWithContextLoop = injectUserContext(session.history, userName, documentNumber);
        const truncatedHistoryLoop = truncateHistory(historyWithContextLoop, 20);
        aiResponse = await handleConversation(toolResult, truncatedHistoryLoop);
    }

    // Respuesta final de texto
    if (aiResponse.type === 'text') {
        await sendText(from, aiResponse.text);
        session.history.push({ role: 'assistant', content: aiResponse.text });

        historyForStorage = prepareHistoryForStorage(session.history);
        const historyForFirestore = historyForStorage.slice(-15);

        const historyForConversationLog = session.history.filter(item => {
            if (typeof item.content === 'string') {
                return !item.content.includes('[CONTEXTO INTERNO') &&
                       !item.content.includes('Reconozco a este paciente registrado');
            }
            return true;
        });

        await setSession(from, {
            conversation_history: historyForFirestore,
            data: session.data || {},
            id_sesion: session.id_sesion || null,
            document_number: documentNumber || null
        });

        // Obtener datos del paciente para log
        let userDocument = null;
        let userName = null;

        if (documentNumber) {
            try {
                const patient = await dentalinkService.findPatientByDocument(documentNumber);
                if (patient) {
                    userDocument = documentNumber;
                    userName = patient.nombre || null;

                    if (userName) {
                        session.data.userName = userName;
                        await setSession(from, {
                            data: session.data,
                            conversation_history: historyForFirestore,
                            document_number: userDocument,
                            id_sesion: session.id_sesion || null
                        });
                    }
                }
            } catch (error) {
                console.error('⚠️ Error obteniendo datos del paciente:', error.message);
            }
        }

        // Log en background
        conversationLogService.logConversation(from, historyForConversationLog, userDocument, userName)
            .catch(err => console.error('❌ Error logging conversation:', err));
    }

    console.log(`${'~'.repeat(60)}\n`);
}

module.exports = { routeByIntent };
