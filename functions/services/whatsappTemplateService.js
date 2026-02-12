// services/whatsappTemplateService.js
// Servicio para enviar templates de WhatsApp (mensajes fuera de ventana 24h)

const axios = require('axios');

const WABA_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v21.0';

const api = axios.create({
  baseURL: `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}`,
  headers: {
    Authorization: `Bearer ${WABA_TOKEN}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

/**
 * Envía un template de recordatorio de cita
 * @param {string} patientPhone - Número del paciente (ej: "573001234567")
 * @param {string} patientName - Nombre del paciente
 * @param {string} appointmentDate - Fecha formateada (ej: "martes 21 de enero")
 * @param {string} appointmentTime - Hora formateada (ej: "10:00 AM")
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendAppointmentReminder(patientPhone, patientName, appointmentDate, appointmentTime) {
  try {
    console.log(`📤 Enviando recordatorio de cita a ${patientPhone}`);

    const payload = {
      messaging_product: 'whatsapp',
      to: patientPhone,
      type: 'template',
      template: {
        name: 'appointment_reminder',
        language: { code: 'es' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: patientName },       // {{1}} nombre
              { type: 'text', text: appointmentDate },   // {{2}} fecha
              { type: 'text', text: appointmentTime }    // {{3}} hora
            ]
          }
        ]
      }
    };

    const response = await api.post('/messages', payload);
    const messageId = response.data?.messages?.[0]?.id;

    console.log(`✅ Recordatorio enviado a ${patientPhone}, messageId: ${messageId}`);

    return {
      success: true,
      messageId: messageId
    };

  } catch (error) {
    console.error(`❌ Error enviando recordatorio a ${patientPhone}:`);
    console.error(`   Status: ${error?.response?.status}`);
    console.error(`   Error: ${JSON.stringify(error?.response?.data || error.message)}`);

    // Errores específicos de WhatsApp
    const waError = error?.response?.data?.error;
    let errorMessage = error.message;

    if (waError) {
      errorMessage = waError.message || waError.error_data?.details || error.message;

      // Error 132000 = Template not found
      if (waError.code === 132000) {
        errorMessage = 'Template "appointment_reminder" no encontrado. Verifique que esté aprobado en Meta Business Manager.';
      }
      // Error 131026 = Recipient not registered
      if (waError.code === 131026) {
        errorMessage = `El número ${patientPhone} no está registrado en WhatsApp o no es válido.`;
      }
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Envía un mensaje de confirmación exitosa de cita
 * @param {string} patientPhone - Número del paciente
 * @param {string} appointmentDate - Fecha de la cita
 * @param {string} appointmentTime - Hora de la cita
 */
async function sendConfirmationSuccess(patientPhone, appointmentDate, appointmentTime) {
  try {
    const message = `¡Gracias por confirmar tu cita! Te esperamos el ${appointmentDate} a las ${appointmentTime}. Si necesitas hacer algún cambio, contáctanos.`;

    await api.post('/messages', {
      messaging_product: 'whatsapp',
      to: patientPhone,
      type: 'text',
      text: { body: message }
    });

    console.log(`✅ Confirmación enviada a ${patientPhone}`);
  } catch (error) {
    console.error(`❌ Error enviando confirmación a ${patientPhone}:`, error?.response?.data || error.message);
  }
}

/**
 * Envía un mensaje cuando el paciente cancela la cita
 * @param {string} patientPhone - Número del paciente
 * @deprecated Use initiateRescheduleFlow instead - bot takes over the conversation
 */
async function sendCancellationAcknowledgment(patientPhone) {
  try {
    const message = `Lamentamos que no puedas asistir. Si deseas reagendar tu cita, escríbenos y con gusto te ayudamos a encontrar otro horario.`;

    await api.post('/messages', {
      messaging_product: 'whatsapp',
      to: patientPhone,
      type: 'text',
      text: { body: message }
    });

    console.log(`✅ Mensaje de cancelación enviado a ${patientPhone}`);
  } catch (error) {
    console.error(`❌ Error enviando mensaje de cancelación a ${patientPhone}:`, error?.response?.data || error.message);
  }
}

/**
 * Envía un template para que el doctor inicie conversación con un cliente
 * @param {string} patientPhone - Número del paciente (ej: "573001234567")
 * @param {string} patientName - Nombre del paciente
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendDoctorMessage(patientPhone, patientName) {
  try {
    console.log(`📤 Enviando template doctor_message a ${patientPhone}`);

    const payload = {
      messaging_product: 'whatsapp',
      to: patientPhone,
      type: 'template',
      template: {
        name: 'doctor_message',
        language: { code: 'es' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: patientName }  // {{1}} nombre
            ]
          }
        ]
      }
    };

    const response = await api.post('/messages', payload);
    const messageId = response.data?.messages?.[0]?.id;

    console.log(`✅ Template doctor_message enviado a ${patientPhone}, messageId: ${messageId}`);

    return {
      success: true,
      messageId: messageId
    };

  } catch (error) {
    console.error(`❌ Error enviando doctor_message a ${patientPhone}:`);
    console.error(`   Status: ${error?.response?.status}`);
    console.error(`   Error: ${JSON.stringify(error?.response?.data || error.message)}`);

    const waError = error?.response?.data?.error;
    let errorMessage = error.message;

    if (waError) {
      errorMessage = waError.message || waError.error_data?.details || error.message;

      if (waError.code === 132000) {
        errorMessage = 'Template "doctor_message" no encontrado. Verifique que esté aprobado en Meta Business Manager.';
      }
      if (waError.code === 131026) {
        errorMessage = `El número ${patientPhone} no está registrado en WhatsApp o no es válido.`;
      }
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

module.exports = {
  sendAppointmentReminder,
  sendConfirmationSuccess,
  sendCancellationAcknowledgment,
  sendDoctorMessage
};
