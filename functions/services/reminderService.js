// services/reminderService.js
// Servicio para gestionar recordatorios de citas

const admin = require('firebase-admin');
const dentalinkService = require('./dentalinkService');
const whatsappTemplateService = require('./whatsappTemplateService');
const { getColombiaDateObject } = require('../utils/dateHelper');
const { getOrCreateSession, setSession } = require('./sessionService');
const { routeByIntent } = require('./routerService');

// Inicializar Firebase Admin si no está inicializado
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const REMINDERS_COLLECTION = 'appointment_reminders';

// Estados de recordatorio
const REMINDER_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',  // Bot está gestionando reagendar/cancelar
  CANCELLED: 'cancelled',
  RESCHEDULED: 'rescheduled',
  FAILED: 'failed'
};

/**
 * Formatea una fecha al formato legible en español
 * @param {string} dateStr - Fecha en formato YYYY-MM-DD
 * @returns {string} - Fecha formateada (ej: "martes 21 de enero")
 */
function formatDateToSpanish(dateStr) {
  const date = new Date(dateStr + 'T12:00:00'); // Usar mediodía para evitar problemas de timezone
  const options = {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  };
  return date.toLocaleDateString('es-CO', options);
}

/**
 * Formatea la hora al formato legible
 * @param {string} timeStr - Hora en formato HH:mm
 * @returns {string} - Hora formateada (ej: "10:00 AM")
 */
function formatTimeToReadable(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Obtiene la fecha de mañana en formato YYYY-MM-DD (timezone Colombia)
 * @returns {string}
 */
function getTomorrowDate() {
  const colombia = getColombiaDateObject();
  colombia.setDate(colombia.getDate() + 1);

  const year = colombia.getFullYear();
  const month = String(colombia.getMonth() + 1).padStart(2, '0');
  const day = String(colombia.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Normaliza el número de teléfono agregando código de país si es necesario
 * @param {string} phone - Número de teléfono
 * @returns {string} - Número normalizado (ej: "573001234567")
 */
function normalizePhoneForWhatsApp(phone) {
  if (!phone) return null;

  // Eliminar caracteres no numéricos
  let cleaned = phone.replace(/\D/g, '');

  // Si empieza con 57 y tiene 12 dígitos, ya está normalizado
  if (cleaned.startsWith('57') && cleaned.length === 12) {
    return cleaned;
  }

  // Si tiene 10 dígitos (número colombiano sin código), agregar 57
  if (cleaned.length === 10) {
    return '57' + cleaned;
  }

  // Si empieza con + y tiene el formato correcto
  if (phone.startsWith('+57')) {
    return cleaned;
  }

  return cleaned;
}

/**
 * Elimina recordatorios con más de X días de antigüedad
 * @param {number} daysOld - Número de días (default: 7)
 * @returns {Promise<number>} - Cantidad de recordatorios eliminados
 */
async function cleanupOldReminders(daysOld = 7) {
  console.log(`🧹 Limpiando recordatorios con más de ${daysOld} días...`);

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const snapshot = await db.collection(REMINDERS_COLLECTION)
      .where('createdAt', '<', cutoffDate)
      .get();

    if (snapshot.empty) {
      console.log('✅ No hay recordatorios antiguos para eliminar');
      return 0;
    }

    // Eliminar en batches (Firestore limita a 500 operaciones por batch)
    const batchSize = 500;
    let deleted = 0;

    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + batchSize);

      chunk.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      deleted += chunk.length;
    }

    console.log(`🗑️ ${deleted} recordatorios antiguos eliminados`);
    return deleted;

  } catch (error) {
    console.error('❌ Error limpiando recordatorios antiguos:', error);
    return 0;
  }
}

/**
 * Genera registros de recordatorio para las citas de mañana
 * @returns {Promise<{created: number, skipped: number, errors: number, cleaned: number}>}
 */
async function generateRemindersForTomorrow() {
  console.log('🔔 Iniciando generación de recordatorios...');

  // Primero limpiar recordatorios antiguos (> 7 días)
  const cleaned = await cleanupOldReminders(7);

  const tomorrowDate = getTomorrowDate();
  console.log(`📅 Fecha de mañana (Colombia): ${tomorrowDate}`);

  const stats = { created: 0, skipped: 0, errors: 0, cleaned: cleaned };

  try {
    // Obtener citas de mañana
    const appointments = await dentalinkService.getAppointmentsByDate(tomorrowDate);
    console.log(`📋 Encontradas ${appointments.length} citas para mañana`);

    if (appointments.length === 0) {
      console.log('ℹ️ No hay citas para mañana');
      return stats;
    }

    // Solo citas con estado pendiente (no confirmadas ni canceladas)
    const pendingAppointments = appointments.filter(apt =>
      apt.id_estado === 7 ||  // No confirmado
      apt.id_estado === 12 || // Notificado via email
      apt.id_estado === 13 || // Agenda Online
      apt.id_estado === 15    // Contactado por chat de WhatsApp
    );

    console.log(`📋 ${pendingAppointments.length} citas pendientes de confirmar`);

    for (const appointment of pendingAppointments) {
      try {
        // Verificar si ya existe un recordatorio para esta cita
        const existingReminder = await db.collection(REMINDERS_COLLECTION)
          .where('appointmentId', '==', appointment.id)
          .limit(1)
          .get();

        if (!existingReminder.empty) {
          console.log(`⏭️ Recordatorio ya existe para cita ${appointment.id}`);
          stats.skipped++;
          continue;
        }

        // Obtener datos del paciente para conseguir el teléfono
        const patient = await dentalinkService.getPatientById(appointment.id_paciente);
        if (!patient) {
          console.error(`❌ No se encontró paciente ${appointment.id_paciente}`);
          stats.errors++;
          continue;
        }

        const patientPhone = normalizePhoneForWhatsApp(patient.celular || patient.telefono);
        if (!patientPhone) {
          console.error(`❌ Paciente ${appointment.id_paciente} sin teléfono válido`);
          stats.errors++;
          continue;
        }

        // Crear registro de recordatorio
        const reminderData = {
          appointmentId: appointment.id,
          patientId: appointment.id_paciente,
          patientPhone: patientPhone,
          patientName: appointment.nombre_paciente || patient.nombre || 'Paciente',
          appointmentDate: appointment.fecha,
          appointmentTime: appointment.hora_inicio,
          reminderStatus: REMINDER_STATUS.PENDING,
          sentAt: null,
          confirmedAt: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection(REMINDERS_COLLECTION).add(reminderData);
        console.log(`✅ Recordatorio creado para ${reminderData.patientName} (${patientPhone})`);
        stats.created++;

      } catch (error) {
        console.error(`❌ Error procesando cita ${appointment.id}:`, error.message);
        stats.errors++;
      }
    }

    console.log(`📊 Resumen: ${stats.created} creados, ${stats.skipped} omitidos, ${stats.errors} errores`);
    return stats;

  } catch (error) {
    console.error('❌ Error generando recordatorios:', error);
    throw error;
  }
}

/**
 * Obtiene todos los recordatorios pendientes de enviar
 * @returns {Promise<Array>}
 */
async function getPendingReminders() {
  try {
    const snapshot = await db.collection(REMINDERS_COLLECTION)
      .where('reminderStatus', '==', REMINDER_STATUS.PENDING)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('❌ Error obteniendo recordatorios pendientes:', error);
    return [];
  }
}

/**
 * Actualiza el estado de un recordatorio
 * @param {string} reminderId - ID del documento en Firestore
 * @param {string} status - Nuevo estado
 * @param {Object} additionalData - Datos adicionales a actualizar
 */
async function updateReminderStatus(reminderId, status, additionalData = {}) {
  try {
    const updateData = {
      reminderStatus: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...additionalData
    };

    await db.collection(REMINDERS_COLLECTION).doc(reminderId).update(updateData);
    console.log(`📝 Recordatorio ${reminderId} actualizado a estado: ${status}`);
  } catch (error) {
    console.error(`❌ Error actualizando recordatorio ${reminderId}:`, error);
    throw error;
  }
}

/**
 * Envía todos los recordatorios pendientes
 * @returns {Promise<{sent: number, failed: number}>}
 */
async function sendPendingReminders() {
  console.log('📤 Iniciando envío de recordatorios...');

  const stats = { sent: 0, failed: 0 };

  try {
    const pendingReminders = await getPendingReminders();
    console.log(`📋 ${pendingReminders.length} recordatorios pendientes de enviar`);

    for (const reminder of pendingReminders) {
      try {
        // Formatear fecha y hora para el template
        const formattedDate = formatDateToSpanish(reminder.appointmentDate);
        const formattedTime = formatTimeToReadable(reminder.appointmentTime);

        // Enviar template
        const result = await whatsappTemplateService.sendAppointmentReminder(
          reminder.patientPhone,
          reminder.patientName,
          formattedDate,
          formattedTime
        );

        if (result.success) {
          await updateReminderStatus(reminder.id, REMINDER_STATUS.SENT, {
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            messageId: result.messageId
          });
          stats.sent++;
        } else {
          await updateReminderStatus(reminder.id, REMINDER_STATUS.FAILED, {
            errorMessage: result.error
          });
          stats.failed++;
        }

        // Pequeña pausa para evitar rate limiting (80 msg/seg)
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Error enviando recordatorio ${reminder.id}:`, error.message);
        await updateReminderStatus(reminder.id, REMINDER_STATUS.FAILED, {
          errorMessage: error.message
        });
        stats.failed++;
      }
    }

    console.log(`📊 Resumen: ${stats.sent} enviados, ${stats.failed} fallidos`);
    return stats;

  } catch (error) {
    console.error('❌ Error enviando recordatorios:', error);
    throw error;
  }
}

/**
 * Procesa la confirmación de una cita desde el botón del template
 * @param {string} patientPhone - Teléfono del paciente que confirma
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function processConfirmation(patientPhone) {
  console.log(`✅ Procesando confirmación de ${patientPhone}`);

  try {
    console.log(`🔍 Buscando recordatorio para teléfono: "${patientPhone}"`);
    console.log(`🔍 Colección: ${REMINDERS_COLLECTION}, Status buscado: ${REMINDER_STATUS.SENT}`);

    // Buscar recordatorio enviado para este teléfono
    // NOTA: Esta consulta requiere un índice compuesto en Firestore
    let snapshot;
    try {
      snapshot = await db.collection(REMINDERS_COLLECTION)
        .where('patientPhone', '==', patientPhone)
        .where('reminderStatus', '==', REMINDER_STATUS.SENT)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      console.log(`🔍 Consulta exitosa, documentos encontrados: ${snapshot.size}`);
    } catch (queryError) {
      console.error(`❌ Error en consulta Firestore:`, queryError.message);
      console.error(`💡 Puede que necesites crear un índice compuesto. URL: ${queryError.message}`);

      // Intentar consulta simplificada sin orderBy
      console.log(`🔄 Intentando consulta simplificada...`);
      snapshot = await db.collection(REMINDERS_COLLECTION)
        .where('patientPhone', '==', patientPhone)
        .where('reminderStatus', '==', REMINDER_STATUS.SENT)
        .limit(1)
        .get();
      console.log(`🔍 Consulta simplificada, documentos encontrados: ${snapshot.size}`);
    }

    if (snapshot.empty) {
      console.log(`⚠️ No se encontró recordatorio activo para ${patientPhone}`);
      return {
        success: false,
        message: 'No se encontró cita pendiente de confirmar'
      };
    }

    const reminder = {
      id: snapshot.docs[0].id,
      ...snapshot.docs[0].data()
    };

    // Confirmar cita en Dentalink
    await dentalinkService.confirmAppointment(reminder.appointmentId);

    // Actualizar estado del recordatorio
    await updateReminderStatus(reminder.id, REMINDER_STATUS.CONFIRMED, {
      confirmedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Enviar mensaje de confirmación
    const formattedDate = formatDateToSpanish(reminder.appointmentDate);
    const formattedTime = formatTimeToReadable(reminder.appointmentTime);
    await whatsappTemplateService.sendConfirmationSuccess(
      patientPhone,
      formattedDate,
      formattedTime
    );

    console.log(`✅ Cita ${reminder.appointmentId} confirmada exitosamente`);

    return {
      success: true,
      message: 'Cita confirmada exitosamente'
    };

  } catch (error) {
    console.error(`❌ Error procesando confirmación de ${patientPhone}:`, error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Procesa la cancelación de una cita desde el botón del template
 * El bot toma el control y pregunta si desea reagendar o cancelar definitivamente
 * @param {string} patientPhone - Teléfono del paciente que cancela
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function processCancellation(patientPhone) {
  console.log(`❌ Procesando "no podré asistir" de ${patientPhone}`);

  try {
    // Buscar recordatorio enviado para este teléfono
    const snapshot = await db.collection(REMINDERS_COLLECTION)
      .where('patientPhone', '==', patientPhone)
      .where('reminderStatus', '==', REMINDER_STATUS.SENT)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log(`⚠️ No se encontró recordatorio activo para ${patientPhone}`);
      return {
        success: false,
        message: 'No se encontró cita pendiente'
      };
    }

    const reminder = {
      id: snapshot.docs[0].id,
      ...snapshot.docs[0].data()
    };

    // Marcar recordatorio como "en proceso" (el bot tomará el control)
    await updateReminderStatus(reminder.id, 'processing', {
      processingStartedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Preparar sesión con contexto de la cita
    const session = await getOrCreateSession(patientPhone);

    // Guardar el ID de la cita en la sesión para que el bot pueda modificarla/cancelarla
    session.id_sesion = reminder.appointmentId;
    session.data = session.data || {};
    session.data.pendingReminderAction = 'reschedule_or_cancel';
    session.data.reminderAppointmentId = reminder.appointmentId;
    session.data.reminderPatientName = reminder.patientName;
    session.data.reminderAppointmentDate = reminder.appointmentDate;
    session.data.reminderAppointmentTime = reminder.appointmentTime;

    await setSession(patientPhone, session);

    // Formatear fecha para el mensaje
    const formattedDate = formatDateToSpanish(reminder.appointmentDate);
    const formattedTime = formatTimeToReadable(reminder.appointmentTime);

    console.log(`🤖 Bot tomando control para ${patientPhone}, cita ${reminder.appointmentId}`);

    // El bot toma el control con un mensaje simulado que activa el flujo de modificación
    await routeByIntent({
      from: patientPhone,
      freeText: `No puedo asistir a mi cita del ${formattedDate} a las ${formattedTime}. ¿Me ayudas a reagendarla o cancelarla?`,
      session: session
    });

    console.log(`📝 Bot activado para gestionar cita ${reminder.appointmentId}`);

    return {
      success: true,
      message: 'Bot tomó el control de la conversación'
    };

  } catch (error) {
    console.error(`❌ Error procesando cancelación de ${patientPhone}:`, error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Obtiene estadísticas de recordatorios
 * @returns {Promise<Object>}
 */
async function getReminderStats() {
  try {
    const snapshot = await db.collection(REMINDERS_COLLECTION).get();

    const stats = {
      total: snapshot.size,
      pending: 0,
      sent: 0,
      confirmed: 0,
      cancelled: 0,
      failed: 0
    };

    snapshot.docs.forEach(doc => {
      const status = doc.data().reminderStatus;
      if (stats[status] !== undefined) {
        stats[status]++;
      }
    });

    return stats;
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error);
    return null;
  }
}

module.exports = {
  generateRemindersForTomorrow,
  getPendingReminders,
  updateReminderStatus,
  sendPendingReminders,
  processConfirmation,
  processCancellation,
  getReminderStats,
  cleanupOldReminders,
  REMINDER_STATUS
};
