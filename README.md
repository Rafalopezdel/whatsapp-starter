# Chatbot WhatsApp para Clínica Dental

Un chatbot de WhatsApp listo para producción para clínicas dentales que integra conversaciones impulsadas por IA con gestión de citas. Construido con Claude AI (Anthropic), Firebase Cloud Functions y la API de Dentalink.

## Características

- **Conversaciones con IA**: Procesamiento de lenguaje natural con Claude AI para interacciones inteligentes con pacientes
- **Gestión de Citas**: Agendar, modificar y cancelar citas a través de WhatsApp
- **Registro de Pacientes**: Búsqueda y registro automático de pacientes vía API de Dentalink
- **Memoria Persistente**: Reconoce pacientes recurrentes y personaliza las interacciones
- **Transferencia a Humano**: Transferencia fluida a agentes humanos cuando es necesario
- **Dashboard para Agentes**: Panel web para gestionar conversaciones e intervenciones
- **Buffering Inteligente**: Maneja mensajes rápidos secuenciales con agrupación inteligente
- **Recordatorios de Citas**: Envío automático de recordatorios vía WhatsApp un día antes de la cita con botones de confirmación/cancelación

## Arquitectura

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   WhatsApp      │────▶│  Firebase Cloud  │────▶│   Claude AI     │
│   Business API  │◀────│    Functions     │◀────│   (Anthropic)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   Dentalink API  │
                        │     (Citas)      │
                        └──────────────────┘
```

### Stack Tecnológico

- **Backend**: Node.js + Express en Firebase Cloud Functions (Gen 2)
- **IA**: Claude AI (claude-sonnet-4-20250514) con tool calling
- **Base de Datos**: Firebase Firestore para sesiones, handoffs y logs de conversaciones (con transacciones atómicas)
- **Frontend**: React 19 + Vite + Tailwind CSS (Dashboard de Agentes)
- **APIs**: WhatsApp Business API (Meta), Dentalink API

## Estructura del Proyecto

```
├── functions/                 # Firebase Cloud Functions
│   ├── index.js              # Punto de entrada
│   ├── controllers/          # Manejadores de requests
│   │   ├── webhookController.js
│   │   └── dashboardController.js
│   ├── services/             # Lógica de negocio
│   │   ├── anthropicService.js    # Integración con Claude AI
│   │   ├── dentalinkService.js    # Cliente API de Dentalink
│   │   ├── routerService.js       # Enrutamiento IA y ejecución de tools
│   │   ├── sessionService.js      # Gestión de sesiones
│   │   ├── handoffService.js      # Sistema de transferencia a humano
│   │   ├── reminderService.js     # Sistema de recordatorios de citas
│   │   ├── whatsappTemplateService.js # Envío de templates WhatsApp
│   │   └── ...
│   ├── middleware/           # Middleware de Express
│   └── utils/                # Utilidades
├── frontend/                 # Dashboard en React
│   ├── src/
│   │   ├── components/       # Componentes React
│   │   ├── hooks/            # Hooks personalizados
│   │   └── services/         # Servicios API
│   └── ...
├── firebase.json             # Configuración de Firebase
└── firestore.rules           # Reglas de seguridad de Firestore
```

## Comenzando

### Prerrequisitos

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- Proyecto de Firebase con Firestore, Functions y Storage habilitados
- Acceso a WhatsApp Business API (Cuenta de Meta Developer)
- Acceso a API de Dentalink
- API key de Anthropic

### Instalación

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/tuusuario/whatsapp-dental-chatbot.git
   cd whatsapp-dental-chatbot
   ```

2. **Instalar dependencias**
   ```bash
   cd functions && npm install && cd ..
   cd frontend && npm install && cd ..
   ```

3. **Configurar variables de entorno**
   ```bash
   # Copiar archivos de ejemplo
   cp functions/.env.example functions/.env
   cp frontend/.env.example frontend/.env

   # Editar con tus credenciales
   ```

4. **Configurar Firebase**
   ```bash
   firebase login
   firebase use tu-proyecto-id
   ```

5. **Configurar número del agente**
   ```bash
   node setup-agent-config.js
   ```

### Desarrollo Local

```bash
# Iniciar emuladores de Firebase
firebase emulators:start

# En otra terminal, iniciar frontend
cd frontend && npm run dev
```

### Despliegue

```bash
# Desplegar todo
firebase deploy

# Desplegar solo functions
firebase deploy --only functions

# Desplegar solo frontend
firebase deploy --only hosting
```

## Variables de Entorno

### Functions (`functions/.env`)

| Variable | Descripción |
|----------|-------------|
| `VERIFY_TOKEN` | Token de verificación del webhook de WhatsApp |
| `WHATSAPP_TOKEN` | Token de acceso de Meta Graph API |
| `PHONE_NUMBER_ID` | ID del número de teléfono de WhatsApp Business |
| `APP_SECRET` | App secret de Meta para verificación de firma |
| `CLAUDE_API_KEY` | API key de Anthropic |
| `DENTALINK_API_KEY` | Token de API de Dentalink |
| `DENTALINK_DENTIST_ID` | ID del dentista en Dentalink |
| `DENTALINK_CLINIC_ID` | ID de la clínica en Dentalink |

### Frontend (`frontend/.env`)

| Variable | Descripción |
|----------|-------------|
| `VITE_FIREBASE_*` | Configuración de Firebase |
| `VITE_API_URL` | URL del API backend |
| `VITE_API_TOKEN` | Token de autenticación del API |

## Capacidades de Tools de IA

El chatbot usa Claude AI con tool calling para ejecutar acciones:

| Tool | Descripción |
|------|-------------|
| `findPatientByDocument` | Buscar paciente por número de documento |
| `createPatient` | Registrar nuevo paciente en Dentalink |
| `getAvailableTimeSlots` | Consultar horarios disponibles |
| `createAppointment` | Agendar nueva cita |
| `getAppointmentsByPatient` | Obtener citas activas del paciente |
| `updateAppointment` | Modificar cita existente |
| `cancelAppointment` | Cancelar cita |
| `requestHumanAgent` | Transferir a agente humano |

## Características Principales

### Memoria Persistente
El sistema almacena el historial de conversaciones en la colección `conversations` de Firestore con transacciones atómicas para prevenir condiciones de carrera. Cuando un usuario recurrente escribe, se cargan sus interacciones previas y datos de paciente, permitiendo saludos personalizados sin volver a pedir información.

### Sistema de Transferencia a Humano
Cuando la IA no puede manejar una solicitud o el usuario pide ayuda explícitamente, el tool `requestHumanAgent` crea un puente entre el paciente y un agente humano. El agente recibe una notificación y puede responder a través del dashboard web.

### Buffering Inteligente de Mensajes
Los mensajes se agrupan por 10 segundos antes de procesar para manejar usuarios que envían múltiples mensajes rápidos. Si un mensaje termina con puntuación (., !, ?), se procesa inmediatamente.

### Manejo de Zona Horaria
Todas las operaciones de fecha/hora usan la zona horaria de Colombia (`America/Bogota`) para asegurar agendamiento correcto de citas y saludos apropiados sin importar la ubicación del servidor.

### Sistema de Recordatorios de Citas
El sistema envía recordatorios automáticos vía WhatsApp a los pacientes un día antes de su cita:

- **6:00 AM (Colombia)**: Se generan recordatorios para las citas del día siguiente
- **8:00 AM (Colombia)**: Se envían los mensajes con template de WhatsApp
- **Botones interactivos**: "Sí, confirmo" actualiza el estado a Confirmado en Dentalink; "No podré asistir" activa el bot para reagendar o cancelar
- **Auto-limpieza**: Los recordatorios con más de 7 días se eliminan automáticamente
- **Estados de seguimiento**: pending → sent → confirmed/cancelled/rescheduled

## Funciones Programadas (Cloud Functions)

| Función | Horario | Descripción |
|---------|---------|-------------|
| `cleanupSessions` | Cada hora | Elimina sesiones expiradas (>30 min) |
| `generateDailyReminders` | 6:00 AM Colombia | Genera recordatorios para citas del día siguiente |
| `sendScheduledReminders` | 8:00 AM Colombia | Envía templates de WhatsApp a recordatorios pendientes |

## Documentación

Documentación detallada disponible en el repositorio:

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Guía completa de despliegue
- [TESTING.md](./TESTING.md) - Guía de pruebas locales
- [HANDOFF_SYSTEM.md](./HANDOFF_SYSTEM.md) - Documentación del sistema de transferencia
- [PERSISTENT_MEMORY.md](./PERSISTENT_MEMORY.md) - Documentación del sistema de memoria
- [WHATSAPP_META_SETUP.md](./WHATSAPP_META_SETUP.md) - Guía de configuración de WhatsApp API

## Contribuciones

Las contribuciones son bienvenidas. Por favor abre un issue primero para discutir los cambios que te gustaría hacer.

## Licencia

MIT

---

Construido con Claude AI de Anthropic
