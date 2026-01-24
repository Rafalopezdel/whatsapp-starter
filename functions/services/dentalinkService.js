// services/dentalinkService.js
const axios = require('axios');
require('dotenv').config();
const { getAppointmentCategory, isActiveState } = require("./appointmentStates");

const API_BASE_URL = 'https://api.dentalink.healthatom.com/api/v1';
const API_KEY = process.env.DENTALINK_API_KEY;

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${API_KEY}`
    },
    timeout: 15000,
});

// Cache en memoria para reducir llamadas a Dentalink
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_SLOTS_TTL_MS = 2 * 60 * 1000;

function getCacheKey(funcName, ...args) {
  return `${funcName}:${JSON.stringify(args)}`;
}

function getFromCache(key) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return cached.data;
}

function setCache(key, data, ttl = CACHE_TTL_MS) {
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

const logApiError = (error, operationName) => {
    const errorData = error?.response?.data || error.message;
    console.error(`❌ Error en ${operationName}:`, JSON.stringify(errorData));
};

const formatDate = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const formatTime = (date) => {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
};

const validateDate = (specificDate, today) => {
    const todayMidnight = new Date(today);
    todayMidnight.setHours(0, 0, 0, 0);

    const specificDateMidnight = new Date(specificDate);
    specificDateMidnight.setHours(0, 0, 0, 0);

    if (specificDateMidnight < todayMidnight) {
        return "Lo siento, no puedo agendar citas en el pasado. Por favor, elige una fecha futura.";
    }

    const fourteenDaysFromNow = new Date(todayMidnight);
    fourteenDaysFromNow.setDate(todayMidnight.getDate() + 14);

    if (specificDateMidnight >= fourteenDaysFromNow) {
        // Retornar objeto especial para indicar que se necesita handoff
        return {
            needsHandoff: true,
            message: "Para agendar citas con más de 14 días de anticipación, te conectaré con un agente humano que podrá ayudarte mejor."
        };
    }

    return null;
};

// Busca paciente por documento (RUT)
exports.findPatientByDocument = async (documentNumber) => {
    const cacheKey = getCacheKey('findPatient', documentNumber);
    const cached = getFromCache(cacheKey);
    if (cached !== null) return cached;

    try {
        const searchParams = { rut: { eq: documentNumber } };
        const response = await api.get(`/pacientes`, {
            params: { q: JSON.stringify(searchParams) }
        });

        const result = (response.data.data && response.data.data.length > 0)
          ? response.data.data[0]
          : null;

        setCache(cacheKey, result);
        return result;
    } catch (error) {
        logApiError(error, "buscando paciente por documento");
        return null;
    }
};

// Busca paciente por teléfono
exports.findPatientByPhone = async (phoneNumber) => {
    try {
        const cleanedPhoneNumber = phoneNumber.replace(/\D/g, '');
        const searchParams = { celular: { eq: cleanedPhoneNumber } };

        const response = await api.get(`/pacientes`, {
            params: { q: JSON.stringify(searchParams) }
        });

        if (response.data.data && response.data.data.length > 0) {
            const patient = response.data.data[0];
            if (patient.habilitado === 1) {
                return patient;
            }
            return null;
        }
        return null;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return null;
        }
        logApiError(error, "buscando paciente por teléfono");
        return null;
    }
};

// Obtiene paciente por ID
exports.getPatientById = async (patientId) => {
    try {
        const response = await api.get(`/pacientes/${patientId}`);
        return response.data.data; // El paciente está en response.data.data
    } catch (error) {
        logApiError(error, "obteniendo paciente por ID");
        return null;
    }
};

// Crea nuevo paciente
exports.createPatient = async (patientData) => {
    try {
        const response = await api.post(`/pacientes`, patientData);
        console.log("✅ Paciente creado:", response.data.data?.nombre || 'N/A');
        return response.data;
    } catch (error) {
        logApiError(error, "creando paciente");
        return null;
    }
};

// Actualiza paciente
exports.updatePatient = async (patientId, patientData) => {
    try {
        const url = `/pacientes/${patientId}`;
        const response = await api.put(url, patientData);
        const updatedPatientData = response.data.data || response.data;
        return updatedPatientData;
    } catch (error) {
        logApiError(error, "actualizar paciente");
        return null;
    }
};

// Obtiene slots de 1 hora disponibles
exports.getAvailableTimeSlots = async ({ date: specificDateStr, currentDate: currentDateStr }) => {
    const cacheKey = getCacheKey('slots', specificDateStr, currentDateStr);
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_SLOTS_TTL_MS)) {
        return cached.data;
    }

    try {
        const today = new Date(currentDateStr);
        let specificDateObj = null;

        if (specificDateStr) {
            specificDateObj = new Date(specificDateStr);
            const dateValidationResult = validateDate(specificDateObj, today);
            if (dateValidationResult) {
                return dateValidationResult;
            }
        }

        let startDate = specificDateStr || formatDate(today);
        let endDate = specificDateStr;

        if (!specificDateStr) {
            const futureDate = new Date(today);
            futureDate.setDate(today.getDate() + 13);
            endDate = formatDate(futureDate);
        }

        const currentTime = formatTime(new Date());
        const id_dentista = process.env.DENTALINK_DENTIST_ID;
        const id_sucursal = process.env.DENTALINK_CLINIC_ID;

        // Obtener slots ocupados para filtrarlos
        const bookedSlots = new Set();

        try {
            const start = new Date(startDate);
            const end = new Date(endDate || startDate);

            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dateStr = formatDate(d);
                const queryParams = {
                    fecha: { eq: dateStr },
                    id_dentista: { eq: id_dentista },
                    id_sucursal: { eq: id_sucursal }
                };
                const citasResponse = await api.get(`/citas/?q=${JSON.stringify(queryParams)}`);
                const citas = citasResponse.data?.data || [];

                citas.forEach(cita => {
                    if (isActiveState(cita.id_estado)) {
                        bookedSlots.add(`${cita.fecha}-${cita.hora_inicio}`);

                        const startTime = new Date(`${cita.fecha}T${cita.hora_inicio}`);
                        const thirtyMinBefore = new Date(startTime.getTime() - 30 * 60000);
                        const timeThirtyBefore = formatTime(thirtyMinBefore);

                        if (formatDate(thirtyMinBefore) === cita.fecha) {
                            bookedSlots.add(`${cita.fecha}-${timeThirtyBefore}`);
                        }
                    }
                });
            }
        } catch (error) {
            console.error('⚠️ Error consultando citas agendadas:', error.message);
        }

        const params = {
            fecha_inicio: { eq: startDate },
            fecha_fin: { eq: endDate || startDate },
            mostrar_detalles: { eq: '1' }
        };

        const url = `/sucursales/${id_sucursal}/dentistas/${id_dentista}/agendas?q=${JSON.stringify(params)}`;
        const response = await api.get(url);

        const allAvailableSlots = [];
        const agendas = response.data.data.fechas || {};
        const SILLON_ID_TO_FILTER = '1';

        for (const date in agendas) {
            const dailySchedule = agendas[date].horas || {};
            const dayOfWeek = new Date(date).getDay();

            const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
            const isSaturday = dayOfWeek === 6;
            const isSunday = dayOfWeek === 0;

            const weekdayStart = 7 * 60;
            const weekdayEnd = 20 * 60;
            const saturdayStart = 8 * 60;
            const saturdayEnd = 12 * 60;

            for (const time in dailySchedule) {
                const chairAvailability = dailySchedule[time].sillones || {};

                for (const chairId in chairAvailability) {
                    if (chairAvailability[chairId] === true && chairId === SILLON_ID_TO_FILTER) {

                        const [hour, minute] = time.split(':').map(Number);
                        const timeInMinutes = hour * 60 + minute;

                        // Filtrar por horarios de negocio
                        if (isSunday ||
                            (isWeekday && (timeInMinutes < weekdayStart || timeInMinutes >= weekdayEnd)) ||
                            (isSaturday && (timeInMinutes < saturdayStart || timeInMinutes >= saturdayEnd))
                        ) {
                            continue;
                        }

                        // Filtrar slots en el pasado
                        const isToday = date === formatDate(today);
                        if (isToday && time < currentTime) {
                            continue;
                        }

                        // Filtrar slots ocupados
                        const slotKey = `${date}-${time}`;
                        if (bookedSlots.has(slotKey)) {
                            continue;
                        }

                        allAvailableSlots.push({
                            fecha: date,
                            hora: time,
                            id_agenda: chairId,
                        });
                    }
                }
            }
        }

        // Agrupar en bloques de 1 hora
        const INTERVAL_MINUTES = 30;
        const blocksOfOneHour = [];

        const sortedSlots = allAvailableSlots.sort((a, b) => {
            const dateA = new Date(`${a.fecha}T${a.hora}`);
            const dateB = new Date(`${b.fecha}T${b.hora}`);
            if (dateA - dateB !== 0) return dateA - dateB;
            return a.id_agenda - b.id_agenda;
        });

        const usedSlots = new Set();

        for (let i = 0; i < sortedSlots.length; i++) {
            const currentSlot = sortedSlots[i];
            const slotKey = `${currentSlot.fecha}-${currentSlot.hora}-${currentSlot.id_agenda}`;

            if (usedSlots.has(slotKey)) continue;

            for (let j = i + 1; j < sortedSlots.length; j++) {
                const nextSlot = sortedSlots[j];
                const nextSlotKey = `${nextSlot.fecha}-${nextSlot.hora}-${nextSlot.id_agenda}`;

                if (usedSlots.has(nextSlotKey)) continue;

                const timeDiff = (new Date(`${nextSlot.fecha}T${nextSlot.hora}`) - new Date(`${currentSlot.fecha}T${currentSlot.hora}`)) / (1000 * 60);

                if (timeDiff === INTERVAL_MINUTES && nextSlot.id_agenda === currentSlot.id_agenda && nextSlot.fecha === currentSlot.fecha) {
                    const endTime = new Date(new Date(`${nextSlot.fecha}T${nextSlot.hora}`).getTime() + INTERVAL_MINUTES * 60000);

                    blocksOfOneHour.push({
                        fecha: currentSlot.fecha,
                        hora_inicio: currentSlot.hora,
                        hora_fin: formatTime(endTime),
                        chairs: [parseInt(currentSlot.id_agenda)]
                    });

                    usedSlots.add(slotKey);
                    usedSlots.add(nextSlotKey);
                    break;
                }
            }
        }

        console.log(`✅ ${blocksOfOneHour.length} bloques de 1 hora disponibles`);
        setCache(cacheKey, blocksOfOneHour, CACHE_SLOTS_TTL_MS);
        return blocksOfOneHour;

    } catch (error) {
        logApiError(error, "obteniendo disponibilidad");
        return { success: false, message: "Hubo un error al consultar la disponibilidad de la agenda." };
    }
};

// Agenda cita para paciente existente
exports.createAppointment = async (date, time, documentNumber, reason = null) => {
    try {
        const patient = await exports.findPatientByDocument(documentNumber);

        if (!patient) {
            return { success: false, message: `Paciente con documento ${documentNumber} no encontrado.` };
        }

        const id_paciente = patient.id;
        const id_dentista = parseInt(process.env.DENTALINK_DENTIST_ID);
        const id_sucursal = parseInt(process.env.DENTALINK_CLINIC_ID);

        if (isNaN(id_dentista) || isNaN(id_sucursal)) {
            throw new Error("IDs de Dentista o Sucursal inválidas en .env");
        }

        const hora_inicio = /^\d{2}:\d{2}$/.test(time) ? time : time.substring(0, 5);

        const payload = {
            id_dentista,
            id_sucursal,
            id_sillon: 1,
            id_paciente: parseInt(id_paciente),
            fecha: date,
            hora_inicio,
            duracion: 60,
            comentario: reason?.trim() || '',
            videoconsulta: 0
        };

        console.log(`➡️ Agendando cita: ${date} ${hora_inicio} para paciente ID ${id_paciente}`);
        const response = await api.post('/citas/', payload);
        console.log("✅ Cita agendada:", response.data?.id || 'OK');
        return { success: true, data: response.data };

    } catch (error) {
        logApiError(error, "agendando cita");
        return {
            success: false,
            message: "Error al agendar la cita. Es posible que el horario ya no esté disponible."
        };
    }
};

// Obtener citas por paciente
exports.getAppointmentsByPatient = async (id_paciente) => {
  try {
    const endpoint = `/pacientes/${id_paciente}/citas`;
    const response = await api.get(endpoint);

    const { getColombiaDateObject } = require('../utils/dateHelper');
    const ahora = getColombiaDateObject();

    const citasFiltradas = (response.data.data || [])
      .filter(cita => {
        const estadoValido = isActiveState(cita.id_estado);
        const fechaHoraCita = new Date(`${cita.fecha}T${cita.hora_inicio}`);
        return estadoValido && fechaHoraCita >= ahora;
      })
      .map(cita => ({
        id: cita.id,
        id_sesion: cita.id,
        paciente: cita.nombre_paciente,
        fecha: cita.fecha,
        hora_inicio: cita.hora_inicio,
        hora_fin: cita.hora_fin,
        estado: {
          id: cita.id_estado,
          nombre: cita.estado_cita,
          categoria: getAppointmentCategory(cita.id_estado)
        },
        dentista: cita.nombre_dentista,
        sucursal: cita.nombre_sucursal,
        comentarios: cita.comentarios
      }));

    return citasFiltradas;
  } catch (error) {
    logApiError(error, "obteniendo citas del paciente");
    return null;
  }
};

// Modificar cita (cambia fecha/hora)
exports.updateAppointment = async (id_sesion, fecha, horaInicio, duracion = 60, idDentista = 1, idSillon = 1, comentario = null) => {
  try {
    const payload = {
      id_sesion,
      id_dentista: idDentista,
      id_sillon: idSillon,
      fecha,
      hora_inicio: horaInicio,
      duracion,
      buscar_especialidad: 0,
      return_options: 0,
      flag_notificar_cita: 1
    };

    const response = await api.post('/citas/changeDate', payload);
    const nuevaCita = response.data.data;

    console.log(`✅ Cita modificada: ${nuevaCita.fecha} ${nuevaCita.hora_inicio}`);

    // Si hay comentario, actualizarlo en la nueva cita
    if (comentario && nuevaCita.id) {
      try {
        await api.put(`/citas/${nuevaCita.id}`, { comentarios: comentario });
        nuevaCita.comentarios = comentario;
      } catch (error) {
        console.error(`⚠️ No se pudo guardar comentario:`, error.message);
      }
    }

    return { ...response.data, data: nuevaCita };
  } catch (error) {
    console.error("❌ Error al actualizar cita:", error.response?.data || error.message);
    throw error;
  }
}

// Cancelar cita
exports.cancelAppointment = async(id_cita, comentarios = "Cita anulada por el paciente") => {
    try {
        const response = await api.put(`/citas/${id_cita}`, {
            id_estado: 1,
            comentarios,
            flag_notificar_anulacion: 1
        });

        console.log(`✅ Cita ${id_cita} cancelada`);
        return response.data;
    } catch (error) {
        console.error("❌ Error cancelando cita:", error.response?.data || error.message);
        throw error;
    }
}

// Confirmar cita (actualiza estado a "Confirmado" - id_estado = 20)
exports.confirmAppointment = async (appointmentId) => {
    try {
        const response = await api.put(`/citas/${appointmentId}`, {
            id_estado: 20 // Estado "Confirmado"
        });
        console.log(`✅ Cita ${appointmentId} confirmada`);
        return response.data;
    } catch (error) {
        console.error("❌ Error confirmando cita:", error.response?.data || error.message);
        throw error;
    }
}

// Obtiene citas del día actual
exports.getDailyAppointments = async () => {
    return exports.getAppointmentsByDate(null);
}

// Obtiene citas para una fecha específica (o hoy si no se especifica)
exports.getAppointmentsByDate = async (dateStr = null) => {
    try {
        const { getColombiaDateObject } = require('../utils/dateHelper');
        const colombiaToday = getColombiaDateObject();
        const formattedDate = dateStr || formatDate(colombiaToday);

        const id_dentista = process.env.DENTALINK_DENTIST_ID || 1;
        const id_sucursal = process.env.DENTALINK_CLINIC_ID || 1;

        const queryParams = {
            fecha: { eq: formattedDate },
            id_dentista: { eq: id_dentista },
            id_sucursal: { eq: id_sucursal }
        };

        const response = await api.get(`/citas/?q=${JSON.stringify(queryParams)}`);
        const citas = response.data.data || response.data || [];
        const citasActivas = citas.filter(cita => isActiveState(cita.id_estado));

        // Ordenar por hora
        citasActivas.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

        console.log(`📅 ${citasActivas.length} citas activas para ${formattedDate}`);

        return citasActivas.map(cita => ({
            id: cita.id,
            id_paciente: cita.id_paciente,
            nombre_paciente: cita.nombre_paciente || 'Sin nombre',
            fecha: cita.fecha,
            hora_inicio: cita.hora_inicio,
            hora_fin: cita.hora_fin,
            estado: cita.estado_cita || cita.estado || 'Desconocido',
            id_estado: cita.id_estado,
            comentarios: cita.comentarios || '',
            nombre_dentista: cita.nombre_dentista || '',
            nombre_sucursal: cita.nombre_sucursal || ''
        }));

    } catch (error) {
        logApiError(error, "obteniendo citas por fecha");
        return [];
    }
}

// Obtiene citas para un rango de fechas
exports.getAppointmentsByDateRange = async (startDateStr, endDateStr) => {
    try {
        const { getColombiaDateObject } = require('../utils/dateHelper');
        const colombiaToday = getColombiaDateObject();
        const startDate = startDateStr || formatDate(colombiaToday);
        const endDate = endDateStr || startDate;

        const id_dentista = process.env.DENTALINK_DENTIST_ID || 1;
        const id_sucursal = process.env.DENTALINK_CLINIC_ID || 1;

        const allAppointments = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDate(d);
            const queryParams = {
                fecha: { eq: dateStr },
                id_dentista: { eq: id_dentista },
                id_sucursal: { eq: id_sucursal }
            };

            const response = await api.get(`/citas/?q=${JSON.stringify(queryParams)}`);
            const citas = response.data.data || response.data || [];
            const citasActivas = citas.filter(cita => isActiveState(cita.id_estado));

            citasActivas.forEach(cita => {
                allAppointments.push({
                    id: cita.id,
                    nombre_paciente: cita.nombre_paciente || 'Sin nombre',
                    fecha: cita.fecha,
                    hora_inicio: cita.hora_inicio,
                    hora_fin: cita.hora_fin,
                    estado: cita.estado_cita || cita.estado || 'Desconocido',
                    id_estado: cita.id_estado,
                    comentarios: cita.comentarios || '',
                    nombre_dentista: cita.nombre_dentista || '',
                    nombre_sucursal: cita.nombre_sucursal || ''
                });
            });
        }

        // Ordenar por fecha y hora
        allAppointments.sort((a, b) => {
            const dateCompare = a.fecha.localeCompare(b.fecha);
            if (dateCompare !== 0) return dateCompare;
            return a.hora_inicio.localeCompare(b.hora_inicio);
        });

        console.log(`📅 ${allAppointments.length} citas activas del ${startDate} al ${endDate}`);
        return allAppointments;

    } catch (error) {
        logApiError(error, "obteniendo citas por rango");
        return [];
    }
}
