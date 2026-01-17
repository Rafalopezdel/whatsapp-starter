// services/whatsappService.js
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
  timeout: 30000, // ⬆️ Aumentado a 30 segundos (WhatsApp API puede ser lenta a veces)
});

const sendText = async (to, body) => {
  try {
    console.log(`📱 Enviando mensaje de WhatsApp a: ${to}`);
    console.log(`   Usando PHONE_NUMBER_ID: ${PHONE_NUMBER_ID}`);
    console.log(`   Graph API version: ${GRAPH_API_VERSION}`);

    const response = await api.post('/messages', {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    });

    console.log(`✅ Texto enviado exitosamente a ${to}`);
    console.log(`   Response:`, JSON.stringify(response.data));
  } catch (error) {
    console.error(`❌ Error enviando texto a ${to}`);
    console.error(`   Error completo:`, error);
    console.error(`   Response data:`, error?.response?.data);
    console.error(`   Status:`, error?.response?.status);
    console.error(`   Message:`, error.message);

    // Errores específicos de WhatsApp
    if (error?.response?.data?.error) {
      const waError = error.response.data.error;
      console.error(`   WhatsApp Error Code:`, waError.code);
      console.error(`   WhatsApp Error Message:`, waError.message);
      console.error(`   WhatsApp Error Type:`, waError.type);

      // Error 131026 = destinatario no registrado
      if (waError.code === 131026) {
        console.error(`   ⚠️ El número ${to} NO está registrado como destinatario permitido en Meta`);
      }
    }
  }
};

const sendButtons = async (to, body, buttons) => {
  try {
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: buttons.map(btn => ({
            type: 'reply',
            reply: {
              id: btn.id,
              title: btn.title
            }
          }))
        }
      }
    };
    await api.post('/messages', payload);
    console.log(`➡️ Botones enviados a ${to}: ${body}`);
  } catch (error) {
    console.error("❌ Error enviando botones:", error?.response?.data || error.message);
  }
};

const sendMenuList = async (to) => {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'AsistenteSmile' },
      body: { text: 'Estoy aquí para ayudarte. ¿Qué te interesa hoy?' },
      footer: { text: 'Elige una opción 👇' },
      action: {
        button: 'Ver opciones',
        sections: [{
          title: 'Servicios y gestión',
          rows: [
            { id: 'info_diseno', title: '🦷 Diseño de sonrisa' },
            { id: 'info_ortodoncia_invisible', title: '📱 Ortodoncia invisible' },
            { id: 'info_blanqueamiento', title: '⭐ Blanqueamiento' },
            { id: 'info_carillas', title: '💎 Carillas dentales' },
            { id: 'info_precios', title: '💰 Precios' },
            { id: 'agendar_valoracion', title: '📅 Agendar valoración' },
            { id: 'otra_consulta', title: '❓ Otra consulta' },
          ],
        }],
      },
    },
  };
  try {
    await api.post('/messages', payload);
    console.log(`➡️ Menú enviado a ${to}`);
  } catch (error) {
    console.error("❌ Error enviando menú:", error?.response?.data || error.message);
  }
};

// sendMessage is an alias for sendText (for compatibility with dashboard)
const sendMessage = sendText;

module.exports = { sendText, sendMessage, sendButtons, sendMenuList };
