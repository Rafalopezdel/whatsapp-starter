// services/anthropicService.js
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');
const { getCurrentColombiaDateTime } = require('../utils/dateHelper');
const googleDocsService = require('./googleDocsService');

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

async function handleConversation(freeText, conversationHistory) {
  try {
    const currentDateContext = getCurrentColombiaDateTime();
    const needsClinicInfo = requiresClinicInfo(freeText, conversationHistory);

    let clinicInfo = null;
    if (needsClinicInfo) {
      clinicInfo = await googleDocsService.getDocumentContent();
    }

    const SYSTEM_PROMPT = `
Eres Paola. Ayudas a registrar, agendar y gestionar citas en Dentalink. Tono cálido.

Fecha/hora: ${currentDateContext}. Úsala para interpretar "mañana" o "lunes".

${clinicInfo ? `📋 INFO CLÍNICA: ${clinicInfo}\n⚠️ Da solo lo solicitado, sin listas completas.` : ''}

REGLAS: Max 35 palabras. Lenguaje neutro. Sin términos médicos. Precios aproximados.

🧠 USUARIO CONOCIDO: Si ves "[CONTEXTO INTERNO] Usuario conocido: [nombre], documento [X]" → saluda por nombre, NO pidas documento, usa getAppointmentsByPatient(documentNumber="X") donde X es el documento en ese mensaje de contexto.

⚠️ DOCUMENTO CORRECTO: SIEMPRE usa el documentNumber del mensaje "[CONTEXTO INTERNO]". Si ves múltiples documentos en el historial, ignora los viejos y usa SOLO el del contexto interno más reciente.

⚠️ CRÍTICO: Historial tiene info DESACTUALIZADA. SIEMPRE consulta Dentalink con getAppointmentsByPatient antes de modificar/cancelar.

FLUJO:
- Nuevo: findPatientByDocument → si null: pide datos → createPatient
- Agendar: getAppointmentsByPatient primero → si tiene cita: pregunta modificar/cancelar/mantener → si no: getAvailableTimeSlots → createAppointment

📝 TERMINOLOGÍA: Siempre usa "número de documento" o "cédula", NUNCA "RUT". Ejemplo: "¿Me das tu número de documento?"

⚠️ FECHAS - REGLAS ABSOLUTAS:
1. MOSTRAR AL USUARIO: Usa EXACTAMENTE el número del día de fecha_legible. Si dice "Martes, 20 de enero" → muestra "Martes 20" al usuario.
2. AGENDAR/MODIFICAR: Usa el fecha_raw correspondiente al slot. NUNCA calcules fechas.
3. PROHIBIDO: Calcular fechas tú mismo. Si fecha_legible dice "20", muestra "20", no calcules "21".
Ejemplo: Slot {"fecha_raw":"2026-01-20","hora":"08:00","fecha_legible":"Martes, 20 de enero"}
→ Muestra al usuario: "Martes 20: 8am" (usa el 20 de fecha_legible)
→ Para agendar: usa date="2026-01-20" (fecha_raw)

🔄 MODIFICAR - FLUJO OBLIGATORIO:
1. getAppointmentsByPatient → obtienes cita con fecha "2026-01-16"
2. getAvailableTimeSlots(date="2026-01-16") → obtienes slots disponibles
3. AHORA SÍ responde: "Tienes cita viernes 16 a las 4pm. Horarios disponibles ese día: 10am, 5pm, 6pm, 7pm. ¿Cuál prefieres?"
4. Usuario elige hora → busca slot JSON, copia fecha_raw → updateAppointment(id_sesion, fecha_raw, time)
⚠️ NUNCA respondas antes de tener los slots. Siempre llama AMBOS tools primero.

CANCELAR: cancelAppointment(id_cita)
NUEVAS: createAppointment solo para citas nuevas

TOOLS: findPatientByDocument, getAvailableTimeSlots, createAppointment (solo nuevas), createPatient, getAppointmentsByPatient, updateAppointment, cancelAppointment, requestHumanAgent

⚠️ Si algo falla o no puedes resolver: requestHumanAgent

No saludo inicial. Despedida cálida.
`;

    const messages = conversationHistory.map(m => ({
      role: m.role,
      content: m.content
    }));
    messages.push({ role: 'user', content: freeText });

    const tools = [
      {
        name: "findPatientByDocument",
        description: "Busca un paciente por su número de documento (cédula).",
        input_schema: {
          type: "object",
          properties: {
            documentNumber: { type: "string", description: "El número de documento (cédula) del usuario." }
          },
          required: ["documentNumber"]
        }
      },
      {
        name: "getAvailableTimeSlots",
        description: "Obtiene las citas disponibles en un día o rango de fechas específico. Puede usarse sin un parámetro de fecha para buscar los próximos 13 días.",
        input_schema: {
          type: "object",
          properties: {
            date: { type: "string", description: "La fecha específica para la búsqueda en formato YYYY-MM-DD. Si no se especifica, busca en los próximos 13 días." }
          }
        }
      },
      {
        name: "createAppointment",
        description: "Agenda una nueva cita para un paciente existente. Usa el campo 'fecha_raw' de los slots.",
        input_schema: {
          type: "object",
          properties: {
            date: { type: "string", description: "La fecha EXACTA de la cita (YYYY-MM-DD). Usa 'fecha_raw' de los slots." },
            time: { type: "string", description: "La hora de la cita (HH:mm)." },
            documentNumber: { type: "string", description: "El número de documento del usuario." },
            reason: { type: "string", description: "Motivo de la cita en MÁXIMO 5 palabras (opcional)." }
          },
          required: ["date", "time", "documentNumber"]
        }
      },
      {
        name: "createPatient",
        description: "Crea un nuevo paciente en Dentalink.",
        input_schema: {
          type: "object",
          properties: {
            patientData: {
              type: "object",
              properties: {
                nombre: { type: "string" },
                apellidos: { type: "string" },
                rut: { type: "string" },
                fecha_nacimiento: { type: "string" },
                actividad_laboral: { type: "string" },
                email: { type: "string" },
                celular: { type: "string" }
              },
              required: ["nombre", "apellidos", "rut", "fecha_nacimiento", "actividad_laboral", "email", "celular"]
            }
          },
          required: ["patientData"]
        }
      },
      {
        name: "getAppointmentsByPatient",
        description: "Obtiene todas las citas de un paciente.",
        input_schema: {
          type: "object",
          properties: {
            documentNumber: { type: "string", description: "Número de documento del paciente" }
          },
          required: ["documentNumber"]
        }
      },
      {
        name: "updateAppointment",
        description: "Modifica una cita existente. Usa el id_sesion de getAppointmentsByPatient.",
        input_schema: {
          type: "object",
          properties: {
            id_sesion: { type: "integer", description: "ID de la cita a modificar" },
            date: { type: "string", description: "Nueva fecha (YYYY-MM-DD)" },
            time: { type: "string", description: "Nueva hora (HH:mm)" }
          },
          required: ["id_sesion", "date", "time"]
        }
      },
      {
        name: "cancelAppointment",
        description: "Anula una cita existente. Usa el id_cita de getAppointmentsByPatient.",
        input_schema: {
          type: "object",
          properties: {
            id_cita: { type: "integer", description: "ID de la cita a cancelar" },
            comentarios: { type: "string", description: "Comentario opcional" }
          },
          required: ["id_cita"]
        }
      },
      {
        name: "requestHumanAgent",
        description: "Inicia relevo con agente humano cuando el usuario lo pide o el bot no puede resolver.",
        input_schema: {
          type: "object",
          properties: {
            reason: { type: "string", description: "Razón del relevo" }
          },
          required: ["reason"]
        }
      }
    ];

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" }
        }
      ],
      messages: messages,
      tools: tools.map((tool, index) => ({
        ...tool,
        ...(index === tools.length - 1 ? { cache_control: { type: "ephemeral" } } : {})
      }))
    });

    logger('Respuesta de Claude', response.content);

    const toolUse = response.content.find(content => content.type === 'tool_use');

    if (toolUse) {
      return { type: 'tool_use', name: toolUse.name, parameters: toolUse.input };
    } else {
      const textContent = response.content.find(content => content.type === 'text');
      return { type: 'text', text: textContent ? textContent.text : "Lo siento, no pude procesar tu solicitud." };
    }

  } catch (error) {
    console.error("❌ Error en Claude API:", error?.response?.data || error.message);
    return { type: 'text', text: "Lo siento, hubo un problema. Por favor, intenta de nuevo." };
  }
}

function requiresClinicInfo(userMessage, history) {
  const keywords = [
    'precio', 'costo', 'cuánto', 'valor', 'cuanto',
    'dirección', 'direccion', 'ubicación', 'ubicacion', 'donde', 'dónde',
    'horario', 'hora', 'cuándo', 'cuando',
    'servicio', 'blanqueamiento', 'carilla', 'ortodoncia', 'diseño', 'diseno',
    'teléfono', 'telefono', 'contacto', 'llamar', 'información', 'informacion'
  ];

  const recentMessages = [
    userMessage,
    ...history.slice(-2).map(m =>
      typeof m.content === 'string' ? m.content :
      (Array.isArray(m.content) ? m.content.find(c => c.type === 'text')?.text || '' : '')
    )
  ].join(' ').toLowerCase();

  return keywords.some(kw => recentMessages.includes(kw));
}

module.exports = { handleConversation };
