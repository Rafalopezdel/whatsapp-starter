// functions/utils/dateHelper.js
// Helper para manejar fechas en la zona horaria de Colombia

/**
 * Obtiene la fecha y hora actual en la zona horaria de Colombia (America/Bogota)
 * formateada para incluir en el contexto de la IA
 *
 * @returns {string} Fecha y hora formateada, ej: "lunes, 4 de noviembre de 2025, 14:30"
 */
function getCurrentColombiaDateTime() {
  const now = new Date();

  const colombiaDateTimeString = now.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return colombiaDateTimeString;
}

/**
 * Obtiene solo la fecha actual en Colombia (sin hora)
 *
 * @returns {string} Fecha formateada, ej: "lunes, 4 de noviembre de 2025"
 */
function getCurrentColombiaDate() {
  const now = new Date();

  const colombiaDateString = now.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return colombiaDateString;
}

/**
 * Obtiene la hora actual en Colombia en formato 24h
 *
 * @returns {number} Hora en formato 0-23
 */
function getCurrentColombiaHour() {
  const now = new Date();

  const colombiaTimeString = now.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    hour: 'numeric',
    hour12: false
  });

  return parseInt(colombiaTimeString);
}

/**
 * Obtiene un saludo apropiado según la hora en Colombia
 *
 * @returns {string} "Buenos días", "Buenas tardes" o "Buenas noches"
 */
function getGreetingByColombiaTime() {
  const hour = getCurrentColombiaHour();

  if (hour >= 5 && hour < 12) {
    return "Buenos días";
  } else if (hour >= 12 && hour < 19) {
    return "Buenas tardes";
  } else {
    return "Buenas noches";
  }
}

/**
 * Obtiene la fecha y hora actual de Colombia como objeto Date
 * Útil para comparaciones de fecha/hora
 *
 * @returns {Date} Objeto Date ajustado a la zona horaria de Colombia
 */
function getColombiaDateObject() {
  const now = new Date();

  // Obtener fecha/hora en Colombia como string ISO
  const colombiaISO = now.toLocaleString('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  // Convertir a formato YYYY-MM-DDTHH:mm:ss
  const formatted = colombiaISO.replace(', ', 'T').replace(/\//g, '-');

  return new Date(formatted);
}

module.exports = {
  getCurrentColombiaDateTime,
  getCurrentColombiaDate,
  getCurrentColombiaHour,
  getGreetingByColombiaTime,
  getColombiaDateObject
};
