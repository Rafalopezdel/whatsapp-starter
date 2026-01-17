// services/assistantRouter.js
// Router para el Asistente Personal (Secretaria Virtual)

const Anthropic = require('@anthropic-ai/sdk');
const { sendText } = require('./whatsappService');
const dentalinkService = require('./dentalinkService');
const handoffService = require('./handoffService');
const { getOrCreateSession, setSession } = require('./sessionService');
const { getCurrentColombiaDateTime, getColombiaDateObject } = require('../utils/dateHelper');
const googleDocsService = require('./googleDocsService');
const chrono = require('chrono-node');

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// Maneja consultas del agente
async function handleAgentQuery(from, message) {
  try {
    // Comandos especiales
    if (message.trim().toLowerCase() === '/cerrar') {
      return await handleCloseCommand(from);
    }

    // Consultas sobre citas
    if (isAppointmentQuery(message)) {
      return await handleAppointmentQuery(from, message);
    }

    // Consultas generales
    return await handleGeneralQuery(from, message);

  } catch (error) {
    console.error('❌ Error en handleAgentQuery:', error);
    await sendText(from, 'Lo siento, ocurrió un error procesando tu consulta.');
  }
}

// Comando /cerrar
async function handleCloseCommand(from) {
  try {
    const closedCount = await handoffService.closeAllAgentHandoffs(from);

    if (closedCount === 0) {
      await sendText(from, '⚠️ No tienes chats activos para cerrar.');
    } else if (closedCount === 1) {
      await sendText(from, '✅ Chat cerrado. El cliente volverá a interactuar con el bot.');
    } else {
      await sendText(from, `✅ ${closedCount} chats cerrados.`);
    }
  } catch (error) {
    console.error('❌ Error en handleCloseCommand:', error);
    await sendText(from, '❌ Error cerrando los chats.');
  }
}

function isAppointmentQuery(message) {
  const keywords = ['cita', 'citas', 'agenda', 'paciente', 'hoy', 'mañana', 'esta semana', 'próximo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'semana'];
  return keywords.some(kw => message.toLowerCase().includes(kw));
}

// Parsea la fecha de la consulta del usuario
function parseDateFromQuery(message) {
  const colombiaToday = getColombiaDateObject();
  const lowerMessage = message.toLowerCase();

  // Configurar chrono para español
  const customChrono = chrono.es.casual.clone();

  // Parsear con chrono
  const parsed = customChrono.parse(message, colombiaToday, { forwardDate: true });

  if (parsed.length > 0) {
    const result = parsed[0];

    // Si es un rango (esta semana)
    if (result.end) {
      return {
        type: 'range',
        startDate: formatDateYYYYMMDD(result.start.date()),
        endDate: formatDateYYYYMMDD(result.end.date())
      };
    }

    return {
      type: 'single',
      date: formatDateYYYYMMDD(result.start.date())
    };
  }

  // Detectar "esta semana" o "semana"
  if (lowerMessage.includes('esta semana') || lowerMessage.includes('semana')) {
    const startOfWeek = new Date(colombiaToday);
    const dayOfWeek = startOfWeek.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startOfWeek.setDate(startOfWeek.getDate() + diff);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 5); // Lunes a Sábado

    return {
      type: 'range',
      startDate: formatDateYYYYMMDD(startOfWeek),
      endDate: formatDateYYYYMMDD(endOfWeek)
    };
  }

  // Default: hoy
  return {
    type: 'single',
    date: formatDateYYYYMMDD(colombiaToday)
  };
}

function formatDateYYYYMMDD(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateHumanReadable(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${days[date.getDay()]}, ${date.getDate()} de ${months[date.getMonth()]}`;
}

// Consultas de citas
async function handleAppointmentQuery(from, message) {
  try {
    const dateInfo = parseDateFromQuery(message);
    let appointments;
    let dateLabel;

    if (dateInfo.type === 'range') {
      appointments = await dentalinkService.getAppointmentsByDateRange(dateInfo.startDate, dateInfo.endDate);
      dateLabel = `del ${formatDateHumanReadable(dateInfo.startDate)} al ${formatDateHumanReadable(dateInfo.endDate)}`;
    } else {
      appointments = await dentalinkService.getAppointmentsByDate(dateInfo.date);
      const colombiaToday = getColombiaDateObject();
      const todayStr = formatDateYYYYMMDD(colombiaToday);

      if (dateInfo.date === todayStr) {
        dateLabel = 'hoy';
      } else {
        dateLabel = formatDateHumanReadable(dateInfo.date);
      }
    }

    if (!appointments || appointments.length === 0) {
      await sendText(from, `📭 No hay citas programadas para ${dateLabel}.`);
      return;
    }

    const formattedResponse = formatAppointmentsSimple(appointments, dateLabel, dateInfo.type === 'range');
    await sendText(from, formattedResponse);
  } catch (error) {
    console.error('❌ Error en handleAppointmentQuery:', error);
    await sendText(from, '❌ Error consultando las citas.');
  }
}

// Formato simple y directo de citas
function formatAppointmentsSimple(appointments, dateLabel, isRange = false) {
  let response = `📅 *Citas ${dateLabel}:*\n\n`;

  if (isRange) {
    // Agrupar por fecha
    const byDate = {};
    appointments.forEach(apt => {
      if (!byDate[apt.fecha]) byDate[apt.fecha] = [];
      byDate[apt.fecha].push(apt);
    });

    for (const date in byDate) {
      response += `*${formatDateHumanReadable(date)}*\n`;
      byDate[date].forEach(apt => {
        const hora = apt.hora_inicio.substring(0, 5);
        const motivo = apt.comentarios ? ` - _${apt.comentarios}_` : '';
        response += `⏰ ${hora} - ${apt.nombre_paciente} (${apt.estado})${motivo}\n`;
      });
      response += '\n';
    }
  } else {
    appointments.forEach(apt => {
      const hora = apt.hora_inicio.substring(0, 5);
      const motivo = apt.comentarios ? ` - _${apt.comentarios}_` : '';
      response += `⏰ ${hora} - ${apt.nombre_paciente} (${apt.estado})${motivo}\n`;
    });
  }

  response += `\n_Total: ${appointments.length} cita${appointments.length > 1 ? 's' : ''}_`;
  return response;
}

// Formatea citas con IA
async function formatAppointmentsWithAI(query, appointments) {
  try {
    const currentDateContext = getCurrentColombiaDateTime();

    const SYSTEM_PROMPT = `
Eres una Secretaria Virtual profesional. Presenta información de citas al Dr. Camilo.

Fecha actual: ${currentDateContext}

Reglas:
- Sé concisa y profesional
- Usa emojis moderadamente (📅 ⏰ 👤)
- Incluye: hora, nombre del paciente, estado

Formato:
📅 *Citas de hoy:*

⏰ 09:00 - Juan Pérez (Confirmada)
⏰ 10:30 - María García (Pendiente)

Total: X citas
`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Consulta: "${query}"\n\nCitas:\n${JSON.stringify(appointments, null, 2)}`
      }]
    });

    const textContent = response.content.find(c => c.type === 'text');
    return textContent ? textContent.text : 'No hay citas para mostrar.';
  } catch (error) {
    console.error('❌ Error formateando citas:', error);

    // Fallback
    let response = `📅 *Citas de hoy:*\n\n`;
    appointments.forEach(apt => {
      response += `⏰ ${apt.hora_inicio} - ${apt.nombre_paciente} (${apt.estado})\n`;
    });
    response += `\n_Total: ${appointments.length} cita${appointments.length > 1 ? 's' : ''}_`;
    return response;
  }
}

// Consultas generales
async function handleGeneralQuery(from, message) {
  try {
    const session = await getOrCreateSession(from);

    session.history.push({ role: 'user', content: message });

    const currentDateContext = getCurrentColombiaDateTime();
    const clinicInfo = await googleDocsService.getDocumentContent();

    const SYSTEM_PROMPT = `
Eres una Secretaria Virtual eficiente y profesional. Asistes al Dr. Camilo en la gestión de su consultorio dental.

IMPORTANTE: Estás hablando CON el Dr. Camilo (el odontólogo), NO con un paciente. Trátalo como tu jefe.

Fecha y hora actual: ${currentDateContext}

${clinicInfo ? `📋 INFORMACIÓN DE LA CLÍNICA (SOLO PARA REFERENCIA):
${clinicInfo}

⚠️ Cómo usar esta información:
- Úsala como REFERENCIA para responder preguntas del doctor
- NUNCA copies y pegues texto literal del documento
- Da solo la información específica que el doctor pregunta
- Responde de forma natural y profesional
- Sé concisa: respuestas directas, sin enumerar listas largas
` : ''}

Capacidades:
- Responder preguntas sobre la agenda del día
- Ayudar con consultas administrativas generales
- Mantener un tono profesional pero cercano
- Ser concisa y directa en tus respuestas

Comandos disponibles para el doctor:
- "¿Cuántas citas tengo hoy?" - Consultar agenda
- "/cerrar" - Cerrar chat activo con un cliente

REGLAS:
- Responde SOLO lo que te preguntan
- Sé profesional pero concisa
- NO des más información de la necesaria
- NUNCA lo trates como paciente, él es el doctor
`;

    const messages = session.history.map(m => ({ role: m.role, content: m.content }));

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages
    });

    const textContent = response.content.find(c => c.type === 'text');
    const responseText = textContent ? textContent.text : 'No pude procesar tu consulta.';

    session.history.push({ role: 'assistant', content: responseText });
    await setSession(from, { history: session.history });

    await sendText(from, responseText);
  } catch (error) {
    console.error('❌ Error en handleGeneralQuery:', error);
    await sendText(from, 'Lo siento, ocurrió un error.');
  }
}

module.exports = { handleAgentQuery };
