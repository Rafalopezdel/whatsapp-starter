// services/slotMatcher.js
// Matching automático de slots cuando el usuario responde con día/hora

/**
 * Intenta extraer hora y día de la semana de un mensaje del usuario
 * @param {string} text - Mensaje del usuario (ej: "para el lunes a las 10 am")
 * @returns {Object|null} - {hora: "10:00", dia: "lunes"} o null si no se pudo extraer
 */
function extractTimeAndDay(text) {
    const textLower = text.toLowerCase();

    // Extraer hora
    let hora = null;

    // Patrones de hora: "10", "10am", "10:00", "10:00am", "las 10", "a las 10"
    const horaPatterns = [
        /(?:a las|las)\s*(\d{1,2})(?::(\d{2}))?\s*(?:am|a\.m\.|a\. m\.)?/i,
        /(?:a las|las)\s*(\d{1,2})(?::(\d{2}))?\s*(?:pm|p\.m\.|p\. m\.)?/i,
        /(\d{1,2})(?::(\d{2}))?\s*(?:am|a\.m\.|a\. m\.)/i,
        /(\d{1,2})(?::(\d{2}))?\s*(?:pm|p\.m\.|p\. m\.)/i,
        /(\d{1,2})(?::(\d{2}))?/
    ];

    for (const pattern of horaPatterns) {
        const match = textLower.match(pattern);
        if (match) {
            let hour = parseInt(match[1]);
            const minutes = match[2] || '00';

            // Detectar PM
            const isPM = /pm|p\.m\.|p\. m\./.test(textLower);
            if (isPM && hour < 12) {
                hour += 12;
            }

            hora = `${hour.toString().padStart(2, '0')}:${minutes}`;
            break;
        }
    }

    // Extraer día de la semana
    let dia = null;
    const dias = ['lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado', 'domingo'];

    for (const d of dias) {
        if (textLower.includes(d)) {
            // Normalizar (quitar acentos)
            dia = d.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            break;
        }
    }

    if (!hora) {
        return null;
    }

    return { hora, dia };
}

/**
 * Normaliza día de la semana (quita acentos)
 */
function normalizeDia(dia) {
    if (!dia) return null;
    return dia.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Intenta hacer matching de un mensaje del usuario con los slots disponibles guardados
 * IMPORTANTE: Los slots ahora tienen formato {fecha_legible, hora, fecha_raw}
 * @param {string} userMessage - Mensaje del usuario
 * @param {Array} availableSlots - Slots guardados en sesión [{fecha_legible: "Martes, 20 de enero", hora: "08:00", fecha_raw: "2026-01-20"}, ...]
 * @returns {Object|null} - {fecha: "2026-01-20", hora: "08:00"} o null si no hay match
 */
function matchSlot(userMessage, availableSlots) {
    if (!availableSlots || availableSlots.length === 0) {
        return null;
    }

    const extracted = extractTimeAndDay(userMessage);
    if (!extracted) {
        return null;
    }

    const { hora, dia } = extracted;
    console.log(`🔍 Extracción del mensaje: hora="${hora}", dia="${dia}"`);

    // Buscar slot que coincida
    for (const slot of availableSlots) {
        // Usar fecha_raw si existe (nuevo formato), si no usar fecha (formato antiguo)
        const slotFecha = slot.fecha_raw || slot.fecha;
        const slotHora = slot.hora;

        // Match por hora (requerido)
        if (slotHora !== hora) {
            continue;
        }

        // Si no especificó día, retornar el primero que coincida con la hora
        if (!dia) {
            console.log(`✅ Match encontrado (solo hora): ${slotFecha} ${slotHora}`);
            return { fecha: slotFecha, hora: slotHora };
        }

        // Match por día de la semana usando fecha_legible (más confiable)
        let slotDayName;
        if (slot.fecha_legible) {
            // Extraer día de "Martes, 20 de enero" → "martes"
            slotDayName = slot.fecha_legible.split(',')[0].toLowerCase();
        } else {
            // Fallback: calcular desde fecha
            const slotDate = new Date(slotFecha + 'T12:00:00');
            slotDayName = slotDate.toLocaleDateString('es-ES', { weekday: 'long' }).toLowerCase();
        }

        const normalizedSlotDay = normalizeDia(slotDayName);
        const normalizedUserDay = normalizeDia(dia);

        if (normalizedSlotDay === normalizedUserDay) {
            console.log(`✅ Match encontrado: ${slotFecha} ${slotHora} (${slotDayName})`);
            return { fecha: slotFecha, hora: slotHora };
        }
    }

    console.log(`❌ No se encontró match para: hora="${hora}", dia="${dia}"`);
    return null;
}

/**
 * Corrige la fecha de una cita buscando en los slots disponibles
 * Útil cuando Claude calcula mal la fecha pero el usuario dijo claramente el día
 * @param {string} date - Fecha que Claude intenta usar (puede estar mal)
 * @param {string} time - Hora que Claude intenta usar
 * @param {Array} availableSlots - Slots disponibles guardados en sesión
 * @param {string} userMessage - Mensaje del usuario (opcional, para extraer día si hay múltiples matches)
 * @returns {string} - Fecha corregida (fecha_raw del slot que coincide con la hora)
 */
function correctDateFromSlots(date, time, availableSlots, userMessage = '') {
    if (!availableSlots || availableSlots.length === 0) {
        console.log(`⚠️ correctDateFromSlots: No hay slots disponibles, usando fecha original: ${date}`);
        return date;
    }

    console.log(`🔧 correctDateFromSlots: Buscando match para time="${time}" entre ${availableSlots.length} slots`);

    // Buscar TODOS los slots que coincidan con la hora
    const matchingSlots = availableSlots.filter(slot => slot.hora === time);

    if (matchingSlots.length === 0) {
        // Si no hay ningún slot con esa hora, buscar por fecha
        console.log(`⚠️ correctDateFromSlots: No hay slot con hora ${time}, verificando si la fecha ${date} existe`);

        for (const slot of availableSlots) {
            const slotFecha = slot.fecha_raw || slot.fecha;
            if (slotFecha === date) {
                console.log(`✅ correctDateFromSlots: Fecha ${date} existe en slots (pero con hora ${slot.hora})`);
                return date;
            }
        }

        console.log(`⚠️ correctDateFromSlots: Fecha ${date} no encontrada en slots, usando tal cual`);
        return date;
    }

    if (matchingSlots.length === 1) {
        // Solo un slot con esa hora - usar directamente
        const slot = matchingSlots[0];
        const slotFecha = slot.fecha_raw || slot.fecha;
        console.log(`✅ correctDateFromSlots: Único slot con hora ${time}, fecha_raw=${slotFecha}`);

        if (slotFecha !== date) {
            console.log(`🔧 CORRECCIÓN DE FECHA: Claude usó "${date}" pero el slot correcto es "${slotFecha}"`);
        }

        return slotFecha;
    }

    // Múltiples slots con la misma hora - intentar extraer día del mensaje del usuario
    console.log(`🔍 correctDateFromSlots: ${matchingSlots.length} slots con hora ${time}, buscando día en mensaje...`);

    // Intentar extraer día del userMessage si está disponible
    const extracted = extractTimeAndDay(userMessage);
    const diaUsuario = extracted?.dia ? normalizeDia(extracted.dia) : null;

    if (diaUsuario) {
        console.log(`🔍 correctDateFromSlots: Usuario dijo día "${diaUsuario}"`);

        // Buscar slot que coincida con el día
        for (const slot of matchingSlots) {
            const slotFecha = slot.fecha_raw || slot.fecha;

            let slotDayName;
            if (slot.fecha_legible) {
                slotDayName = slot.fecha_legible.split(',')[0].toLowerCase();
            } else {
                const slotDate = new Date(slotFecha + 'T12:00:00');
                slotDayName = slotDate.toLocaleDateString('es-ES', { weekday: 'long' }).toLowerCase();
            }

            const normalizedSlotDay = normalizeDia(slotDayName);

            if (normalizedSlotDay === diaUsuario) {
                console.log(`✅ correctDateFromSlots: Match por día "${diaUsuario}" → ${slotFecha}`);

                if (slotFecha !== date) {
                    console.log(`🔧 CORRECCIÓN DE FECHA: Claude usó "${date}" pero el slot correcto es "${slotFecha}"`);
                }

                return slotFecha;
            }
        }
    }

    // Si no pudimos determinar el día, usar el primero que coincida con la hora
    // (esto es mejor que usar la fecha incorrecta de Claude)
    const firstMatch = matchingSlots[0];
    const firstFecha = firstMatch.fecha_raw || firstMatch.fecha;
    console.log(`⚠️ correctDateFromSlots: No se pudo determinar día, usando primer slot: ${firstFecha}`);

    if (firstFecha !== date) {
        console.log(`🔧 CORRECCIÓN DE FECHA: Claude usó "${date}" pero usando primer match "${firstFecha}"`);
    }

    return firstFecha;
}

module.exports = {
    matchSlot,
    extractTimeAndDay,
    correctDateFromSlots
};
