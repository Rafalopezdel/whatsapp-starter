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
// 🧪 TEST ENDPOINTS PARA RECORDATORIOS
// ========================================

// Crear recordatorio de prueba y enviar template
app.post("/test/create-reminder", async (req, res) => {
  try {
    const {phone, name, appointmentId, patientId, date, time, dateFormatted, timeFormatted} = req.body;

    const testPhone = phone || "573006436473";
    const testName = name || "Usuario Prueba";
    const testAppointmentId = appointmentId || 99999;
    const testPatientId = patientId || 99999;
    const testDate = date || "2026-01-22";
    const testTime = time || "10:00";
    const testDateFormatted = dateFormatted || "miércoles 22 de enero";
    const testTimeFormatted = timeFormatted || "10:00 AM";

    const admin = require("firebase-admin");
    const db = admin.firestore();
    const whatsappTemplateService = require("./services/whatsappTemplateService");

    // Crear recordatorio en Firestore
    const reminderData = {
      appointmentId: testAppointmentId,
      patientId: testPatientId,
      patientPhone: testPhone,
      patientName: testName,
      appointmentDate: testDate,
      appointmentTime: testTime,
      reminderStatus: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("appointment_reminders").add(reminderData);
    console.log(`✅ Recordatorio creado: ${docRef.id}`);

    // Enviar template
    const result = await whatsappTemplateService.sendAppointmentReminder(
        testPhone,
        testName,
        testDateFormatted,
        testTimeFormatted,
    );

    res.status(200).json({
      success: true,
      reminderId: docRef.id,
      appointmentId: testAppointmentId,
      templateSent: result.success,
      message: "Recordatorio creado y template enviado. Haz click en el botón para probar.",
    });
  } catch (error) {
    console.error("❌ Error en test:", error);
    res.status(500).json({error: error.message});
  }
});

// Ver estadísticas de recordatorios
app.get("/test/reminder-stats", async (req, res) => {
  try {
    const reminderService = require("./services/reminderService");
    const stats = await reminderService.getReminderStats();
    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

// 🔥 Disparar generación de recordatorios manualmente (simula el cron de las 6 AM)
// Busca citas de MAÑANA en Dentalink y crea recordatorios en Firestore
app.post("/test/generate-reminders", async (req, res) => {
  try {
    console.log("🧪 [TEST] Disparando generateRemindersForTomorrow manualmente...");
    const reminderService = require("./services/reminderService");
    const stats = await reminderService.generateRemindersForTomorrow();
    res.status(200).json({
      success: true,
      message: "Generación de recordatorios completada",
      stats: stats,
    });
  } catch (error) {
    console.error("❌ Error en test generate-reminders:", error);
    res.status(500).json({error: error.message});
  }
});

// 🔍 Debug: Ver citas de mañana y sus estados
app.get("/test/debug-tomorrow-appointments", async (req, res) => {
  try {
    const dentalinkService = require("./services/dentalinkService");
    const {getColombiaDateObject} = require("./utils/dateHelper");

    // Calcular fecha de mañana
    const colombia = getColombiaDateObject();
    colombia.setDate(colombia.getDate() + 1);
    const year = colombia.getFullYear();
    const month = String(colombia.getMonth() + 1).padStart(2, "0");
    const day = String(colombia.getDate()).padStart(2, "0");
    const tomorrowDate = `${year}-${month}-${day}`;

    console.log(`🔍 [DEBUG] Consultando citas para: ${tomorrowDate}`);

    const appointments = await dentalinkService.getAppointmentsByDate(tomorrowDate);

    // Para cada cita, intentar obtener el paciente
    const detailedAppointments = [];
    for (const apt of appointments.slice(0, 10)) { // Limitar a 10
      let patientInfo = null;
      try {
        const patient = await dentalinkService.getPatientById(apt.id_paciente);
        patientInfo = {
          id: patient?.id,
          nombre: patient?.nombre,
          celular: patient?.celular,
          telefono: patient?.telefono,
        };
      } catch (e) {
        patientInfo = {error: e.message};
      }

      detailedAppointments.push({
        id: apt.id,
        fecha: apt.fecha,
        hora: apt.hora_inicio,
        id_estado: apt.id_estado,
        estado_nombre: apt.estado || "desconocido",
        id_paciente: apt.id_paciente,
        nombre_paciente: apt.nombre_paciente,
        patientData: patientInfo,
      });
    }

    res.status(200).json({
      tomorrowDate: tomorrowDate,
      totalAppointments: appointments.length,
      appointments: detailedAppointments,
    });
  } catch (error) {
    console.error("❌ Error en debug:", error);
    res.status(500).json({error: error.message});
  }
});

// 🔄 MIGRACIÓN: Migrar conversations.json (Storage) → Firestore
// EJECUTAR UNA SOLA VEZ después de desplegar
app.post("/migrate/conversations-to-firestore", async (req, res) => {
  try {
    const accessToken = req.query.token;
    if (accessToken !== process.env.VERIFY_TOKEN) {
      return res.status(403).json({error: "Unauthorized - Invalid token"});
    }

    console.log("🔄 [MIGRACIÓN] Iniciando migración de Storage a Firestore...");

    const admin = require("firebase-admin");
    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    // 1. Leer conversations.json desde Storage
    const file = bucket.file("conversations.json");
    const [exists] = await file.exists();

    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "No existe conversations.json en Storage",
      });
    }

    const [contents] = await file.download();
    const conversations = JSON.parse(contents.toString("utf8"));

    console.log(`📥 Encontradas ${conversations.length} conversaciones en Storage`);

    // 2. Migrar cada conversación a Firestore
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const conv of conversations) {
      try {
        const userId = conv.userId;
        if (!userId) {
          skipped++;
          continue;
        }

        const docRef = db.collection("conversations").doc(userId);
        const existingDoc = await docRef.get();

        if (existingDoc.exists) {
          // Merge messages
          const existingData = existingDoc.data();
          const existingMessages = existingData.messages || [];
          const newMessages = conv.messages || [];

          const allMessages = [...existingMessages];
          for (const msg of newMessages) {
            const msgExists = allMessages.some(
                (m) => m.role === msg.role && m.text === msg.text,
            );
            if (!msgExists) {
              allMessages.push(msg);
            }
          }

          await docRef.update({
            messages: allMessages,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            userDocument: conv.userDocument || existingData.userDocument || null,
            userName: conv.userName || existingData.userName || null,
          });
        } else {
          await docRef.set({
            userId: userId,
            userDocument: conv.userDocument || null,
            userName: conv.userName || null,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            messages: conv.messages || [],
          });
        }

        migrated++;
      } catch (error) {
        console.error(`❌ Error migrando ${conv.userId}:`, error.message);
        errors++;
      }
    }

    console.log(`✅ [MIGRACIÓN] Completada: ${migrated} migradas, ${skipped} saltadas, ${errors} errores`);

    res.status(200).json({
      success: true,
      message: "Migración completada",
      stats: {
        total: conversations.length,
        migrated: migrated,
        skipped: skipped,
        errors: errors,
      },
    });
  } catch (error) {
    console.error("❌ Error en migración:", error);
    res.status(500).json({error: error.message});
  }
});

// 📤 Disparar envío de recordatorios manualmente (simula el cron de las 8 AM)
// Envía templates de WhatsApp para todos los recordatorios pendientes
app.post("/test/send-reminders", async (req, res) => {
  try {
    console.log("🧪 [TEST] Disparando sendPendingReminders manualmente...");
    const reminderService = require("./services/reminderService");
    const stats = await reminderService.sendPendingReminders();
    res.status(200).json({
      success: true,
      message: "Envío de recordatorios completado",
      stats: stats,
    });
  } catch (error) {
    console.error("❌ Error en test send-reminders:", error);
    res.status(500).json({error: error.message});
  }
});

// ========================================
// 📎 TEST ENDPOINTS PARA MULTIMEDIA
// ========================================

// Disparar limpieza de media manualmente
app.post("/test/cleanup-media", async (req, res) => {
  try {
    const accessToken = req.query.token;
    if (accessToken !== process.env.VERIFY_TOKEN) {
      return res.status(403).json({error: "Unauthorized - Invalid token"});
    }

    const daysOld = parseInt(req.body.daysOld, 10) || 60;
    console.log(`🧪 [TEST] Disparando limpieza de media > ${daysOld} días...`);

    const mediaService = require("./services/mediaService");
    const deletedCount = await mediaService.cleanupOldMedia(daysOld);

    res.status(200).json({
      success: true,
      message: `Limpieza completada: ${deletedCount} archivos eliminados`,
      deletedCount: deletedCount,
      daysOld: daysOld,
    });
  } catch (error) {
    console.error("❌ Error en cleanup-media:", error);
    res.status(500).json({error: error.message});
  }
});

// Ver estadísticas de media
app.get("/test/media-stats", async (req, res) => {
  try {
    const accessToken = req.query.token;
    if (accessToken !== process.env.VERIFY_TOKEN) {
      return res.status(403).json({error: "Unauthorized - Invalid token"});
    }

    const mediaService = require("./services/mediaService");
    const stats = await mediaService.getMediaStats();

    res.status(200).json({
      success: true,
      stats: stats,
    });
  } catch (error) {
    console.error("❌ Error en media-stats:", error);
    res.status(500).json({error: error.message});
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

// Enviar media desde el dashboard (imagen, video, audio, documento)
app.post("/dashboard/send-media", authenticateDashboard, dashboardController.sendMediaFromDashboard);

// Iniciar intervención (handoff)
app.post("/dashboard/intervene", authenticateDashboard, dashboardController.startIntervention);

// Cerrar intervención (handoff)
app.post("/dashboard/close-intervention", authenticateDashboard, dashboardController.closeIntervention);

// Iniciar conversación con template (fuera de ventana 24h)
app.post("/dashboard/start-conversation", authenticateDashboard, dashboardController.startConversation);

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

// ========================================
// 🔔 SISTEMA DE RECORDATORIOS DE CITAS
// ========================================

// Genera registros de recordatorio para las citas de mañana
// Se ejecuta a las 11:00 UTC = 6:00 AM Colombia
exports.generateDailyReminders = onSchedule({
  schedule: "0 11 * * *",
  timeZone: "America/Bogota",
  timeoutSeconds: 300,
  memory: "512MiB",
}, async (event) => {
  console.log("🔔 [CRON] Iniciando generación de recordatorios diarios...");
  try {
    const reminderService = require("./services/reminderService");
    const stats = await reminderService.generateRemindersForTomorrow();
    console.log(`✅ Generación completada: ${JSON.stringify(stats)}`);
  } catch (error) {
    console.error("❌ Error en generación de recordatorios:", error);
  }
  return null;
});

// Envía los recordatorios pendientes
// Se ejecuta a las 13:00 UTC = 8:00 AM Colombia
exports.sendScheduledReminders = onSchedule({
  schedule: "0 13 * * *",
  timeZone: "America/Bogota",
  timeoutSeconds: 540,
  memory: "512MiB",
}, async (event) => {
  console.log("📤 [CRON] Iniciando envío de recordatorios programados...");
  try {
    const reminderService = require("./services/reminderService");
    const stats = await reminderService.sendPendingReminders();
    console.log(`✅ Envío completado: ${JSON.stringify(stats)}`);
  } catch (error) {
    console.error("❌ Error en envío de recordatorios:", error);
  }
  return null;
});

// ========================================
// 📎 LIMPIEZA DE MULTIMEDIA
// ========================================

// Elimina archivos de media con más de 60 días de antigüedad
// Se ejecuta a las 8:00 UTC = 3:00 AM Colombia (fuera de horario de uso)
exports.cleanupOldMedia = onSchedule({
  schedule: "0 8 * * *",
  timeZone: "America/Bogota",
  timeoutSeconds: 300,
  memory: "512MiB",
}, async (event) => {
  console.log("🧹 [CRON] Iniciando limpieza de media antigua...");
  try {
    const mediaService = require("./services/mediaService");
    const deletedCount = await mediaService.cleanupOldMedia(60);
    console.log(`✅ Limpieza completada: ${deletedCount} archivos eliminados`);
  } catch (error) {
    console.error("❌ Error en limpieza de media:", error);
  }
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
