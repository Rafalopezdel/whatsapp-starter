// services/appointmentStates.js

// Mapa de IDs → categorías
const appointmentStateCategories = {
  // ---------------- ANULADOS ----------------
  1: "anulado",
  9: "anulado",
  10: "anulado",
  14: "anulado",
  16: "anulado",
  18: "anulado",
  19: "anulado",

  // ---------------- CONFIRMADOS ----------------
  20: "confirmado", // Confirmado
  17: "confirmado", // Confirmado por Whatsapp
  11: "confirmado", // Confirmado por email
  3:  "confirmado", // Confirmado por teléfono

  // ---------------- PENDIENTES ----------------
  15: "pendiente",  // Contactado por chat de WhatsApp
  12: "pendiente",  // Notificado via email
  13: "pendiente",  // Agenda Online
  7:  "pendiente",  // No confirmado

  // ---------------- EN CURSO ----------------
  6: "en_curso",    // Atendiéndose
  5: "en_curso",    // En sala de espera

  // ---------------- FINALIZADOS ----------------
  2: "finalizado",  // Atendido

  // ---------------- ESPECIALES ----------------
  8: "especial"     // No asiste
};

// Funciones utilitarias
function getAppointmentCategory(stateId) {
  return appointmentStateCategories[stateId] || "desconocido";
}

function isActiveState(stateId) {
  const category = getAppointmentCategory(stateId);
  return category !== "anulado";
}

module.exports = {
  appointmentStateCategories,
  getAppointmentCategory,
  isActiveState
};
