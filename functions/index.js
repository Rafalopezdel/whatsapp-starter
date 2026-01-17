// functions/index.js
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const webhookController = require("./controllers/webhookController");
const dashboardController = require("./controllers/dashboardController");
const verifyRequestSignature = require("./middleware/verifySignature");
const conversationLogService = require("./services/conversationLogService");

// Crear app Express
const app = express();

// Configurar CORS para permitir requests desde el frontend
app.use(cors({
  origin: [
    "https://whatsapp-starter-4de11.web.app",
    "https://whatsapp-starter-4de11.firebaseapp.com",
    "http://localhost:5173", // Para desarrollo local
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// Middleware para parsear JSON y capturar rawBody (necesario para verificar firma)
app.use(express.json({
  type: "application/json",
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  },
}));

// Middleware simple de autenticación para el dashboard
// Verifica que el header Authorization contenga el VERIFY_TOKEN
const authenticateDashboard = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ?
    authHeader.substring(7) : null;

  if (token !== process.env.VERIFY_TOKEN) {
    return res.status(403).json({error: "Unauthorized - Invalid token"});
  }

  next();
};

// Handshake de verificación del webhook
app.get("/webhook", webhookController.verifyWebhook);

// Recepción de eventos con verificación de firma
app.post("/webhook", verifyRequestSignature, webhookController.handleWebhook);

// Ruta de health check
app.get("/health", (req, res) => {
  res.status(200).json({status: "ok", timestamp: new Date().toISOString()});
});

// 📊 NUEVO: Endpoint para obtener el archivo conversations.json
// Útil para sincronización con Google Sheets u otros sistemas
// Protegido con un token simple para evitar acceso no autorizado
app.get("/conversations", async (req, res) => {
  try {
    // Verificar token de acceso (usa el VERIFY_TOKEN como autenticación simple)
    const accessToken = req.query.token;
    if (accessToken !== process.env.VERIFY_TOKEN) {
      return res.status(403).json({error: "Unauthorized - Invalid token"});
    }

    // Obtener todas las conversaciones del log
    const conversations = await conversationLogService.getAllConversations();

    // Retornar como JSON
    res.status(200).json({
      total: conversations.length,
      conversations: conversations,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error obteniendo conversaciones:", error);
    res.status(500).json({error: "Error retrieving conversations"});
  }
});

// 🔧 Endpoint para configurar el número del agente
app.post("/setup-agent", async (req, res) => {
  try {
    const accessToken = req.query.token;
    if (accessToken !== process.env.VERIFY_TOKEN) {
      return res.status(403).json({error: "Unauthorized - Invalid token"});
    }

    const {agentPhoneNumber} = req.body;
    if (!agentPhoneNumber) {
      return res.status(400).json({error: "agentPhoneNumber is required"});
    }

    const configService = require("./services/configService");
    await configService.updateTenantConfig({agentPhoneNumber});

    res.status(200).json({
      success: true,
      message: "Agent phone number configured successfully",
      agentPhoneNumber: agentPhoneNumber,
    });
  } catch (error) {
    console.error("❌ Error configurando agente:", error);
    res.status(500).json({error: "Error configuring agent"});
  }
});

// ========================================
// 📊 DASHBOARD API ROUTES
// ========================================
// Rutas protegidas con autenticación Bearer token para la interfaz web

// Health check del dashboard
app.get("/dashboard/health", dashboardController.healthCheck);

// Obtener todas las sesiones activas
app.get("/dashboard/sessions", authenticateDashboard, dashboardController.getActiveChatSessions);

// Obtener detalles de una sesión específica
app.get("/dashboard/session/:sessionId", authenticateDashboard, dashboardController.getSessionDetails);

// Enviar mensaje desde el dashboard
app.post("/dashboard/send-message", authenticateDashboard, dashboardController.sendMessageFromDashboard);

// Iniciar intervención (handoff)
app.post("/dashboard/intervene", authenticateDashboard, dashboardController.startIntervention);

// Cerrar intervención (handoff)
app.post("/dashboard/close-intervention", authenticateDashboard, dashboardController.closeIntervention);

// Exportar la función HTTP de Firebase (Gen 2)
// La URL será: https://<region>-<project-id>.cloudfunctions.net/api
exports.api = onRequest({
  timeoutSeconds: 540,
  memory: "1GiB",           // ⬆️ Más memoria = más CPU = mejor rendimiento (solo paga por uso)
  maxInstances: 10,
  // minInstances: 0,       // ❌ Sin instancias permanentes (evita costo fijo, respeta límite gratuito)
  concurrency: 80,          // 🚀 Permite más solicitudes concurrentes por instancia
  cpu: 1,                   // 🔥 CPU dedicada para mejor rendimiento (solo paga por uso)
}, app);

// Función programada para limpiar sesiones expiradas cada hora
// Opcional pero recomendado para mantener Firestore limpio
exports.cleanupSessions = onSchedule("every 1 hours", async (event) => {
  const firestoreService = require("./services/firestoreService");
  const deletedCount = await firestoreService.deleteExpiredSessions();
  console.log(`🧹 Limpieza automática: ${deletedCount} sesiones eliminadas`);
  return null;
});

// NOTA: keepAlive scheduler desactivado para respetar límite gratuito
// Solo se activa si se habilita minInstances: 1
// exports.keepAlive = onSchedule("every 4 minutes", async (event) => {
//   const keepAliveService = require("./services/keepAliveService");
//   const result = await keepAliveService.pingFunction();
//   if (result.success) {
//     console.log(`🏓 KeepAlive exitoso - Tiempo de respuesta: ${result.duration}ms`);
//   } else {
//     console.log(`⚠️ KeepAlive falló: ${result.error}`);
//   }
//   return null;
// });
