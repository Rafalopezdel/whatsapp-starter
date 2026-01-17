# Dashboard Multiagente - Clínica Dental

Interfaz web en tiempo real para monitorear y gestionar todas las conversaciones de WhatsApp del bot de la clínica dental.

## Características

- ✅ **Monitoreo en Tiempo Real**: Visualiza todos los chats activos (últimos 30 minutos)
- ✅ **Listeners de Firestore**: Actualizaciones automáticas sin recargar la página
- ✅ **Sistema de Intervención**: El odontólogo puede tomar control de cualquier conversación
- ✅ **Interfaz Tipo WhatsApp Web**: Diseño familiar y fácil de usar
- ✅ **Indicadores de Estado**: Visual feedback de bot activo, agente interviniendo, o idle
- ✅ **Envío de Mensajes**: Comunicación directa con clientes durante intervención
- ✅ **Autenticación Firebase**: Seguridad con Firebase Auth (anónima por ahora)

## Requisitos Previos

1. **Backend desplegado**: Las Cloud Functions deben estar activas
2. **Firebase configurado**: Firestore y Auth habilitados
3. **Node.js**: Versión 18 o superior
4. **npm**: Gestor de paquetes

## Configuración

### 1. Crear archivo `.env`

Copia el archivo de ejemplo y configura las variables:

```bash
cd frontend
cp .env.example .env
```

### 2. Configurar variables de entorno

Edita `frontend/.env` con tus credenciales de Firebase:

```env
# Firebase Configuration (obtener de Firebase Console)
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=whatsapp-starter-4de11.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=whatsapp-starter-4de11
VITE_FIREBASE_STORAGE_BUCKET=whatsapp-starter-4de11.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# Backend API Configuration
VITE_API_URL=https://us-central1-whatsapp-starter-4de11.cloudfunctions.net/api
VITE_API_TOKEN=mi_token_de_verificacion_unico
```

**¿Dónde obtener las credenciales de Firebase?**

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto
3. Ve a **Configuración del proyecto** (⚙️ > Project settings)
4. Scroll hasta **Tus apps** > **SDK setup and configuration**
5. Copia los valores de `firebaseConfig`

### 3. Instalar dependencias

```bash
npm install
```

### 4. Habilitar Firebase Auth (Anónimo)

En Firebase Console:

1. Ve a **Authentication**
2. Pestaña **Sign-in method**
3. Habilita **Anonymous** (autenticación anónima)
4. Guarda

### 5. Desplegar reglas de Firestore

Desde la raíz del proyecto:

```bash
firebase deploy --only firestore:rules
```

Esto permitirá lecturas desde el dashboard web a las colecciones `sessions` y `open-handoffs`.

## Desarrollo Local

### Ejecutar el servidor de desarrollo

```bash
npm run dev
```

Esto iniciará Vite en `http://localhost:5173`

### Conectar al backend local

Si quieres probar con el backend local (Firebase Emulators):

1. Cambia `VITE_API_URL` en `.env`:
   ```env
   VITE_API_URL=http://localhost:5001/whatsapp-starter-4de11/us-central1/api
   ```

2. Inicia los emuladores en otra terminal:
   ```bash
   cd ..
   firebase emulators:start
   ```

3. Inicia el frontend:
   ```bash
   npm run dev
   ```

## Producción

### Build para producción

```bash
npm run build
```

Esto genera la carpeta `dist/` con los archivos estáticos optimizados.

### Deploy a Firebase Hosting

**Opción 1: Firebase Hosting (recomendado)**

```bash
# Desde la raíz del proyecto
firebase deploy --only hosting
```

**Opción 2: Vercel**

```bash
npm install -g vercel
vercel
```

**Opción 3: Netlify**

```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

## Estructura del Proyecto

```
frontend/
├── src/
│   ├── components/          # Componentes React
│   │   ├── ChatList.jsx     # Lista de chats (izquierda)
│   │   ├── ChatWindow.jsx   # Ventana de conversación (derecha)
│   │   ├── MessageBubble.jsx # Burbujas de mensajes
│   │   └── StatusIndicator.jsx # Indicadores de estado
│   ├── hooks/               # Custom hooks
│   │   ├── useFirestoreSessions.js  # Listener de sessions
│   │   └── useFirestoreHandoffs.js  # Listener de handoffs
│   ├── services/            # Servicios
│   │   └── api.js           # Cliente HTTP para backend
│   ├── firebase.js          # Config de Firebase
│   ├── App.jsx              # Componente principal
│   └── main.jsx             # Entry point
├── .env                     # Variables de entorno (no commitear)
├── .env.example             # Ejemplo de variables
├── package.json
└── README.md
```

## Uso del Dashboard

### Estados de Chat

Cada chat tiene 3 posibles estados:

1. **🤖 Bot Activo** (verde)
   - El bot está respondiendo automáticamente
   - No puedes enviar mensajes
   - Click en "Intervenir" para tomar control

2. **👤 Agente Interviniendo** (naranja)
   - Tú o otro agente han tomado control
   - Puedes enviar mensajes libremente
   - El bot NO responde automáticamente
   - Click en "Cerrar Intervención" para devolver al bot

3. **⚪ Inactivo** (gris)
   - Más de 5 minutos sin actividad
   - El bot sigue activo, solo es un indicador visual

### Flujo de Intervención

**1. Usuario tiene problema que el bot no resuelve**

```
Cliente: "Necesito hablar con el doctor"
Bot: [usa herramienta requestHumanAgent]
Sistema: Crea handoff automáticamente
```

**2. Odontólogo ve el chat en el dashboard**

- Chat aparece con estado 🤖 Bot Activo
- Click en el chat para ver la conversación
- Lee el problema del cliente

**3. Odontólogo interviene**

- Click en botón "Intervenir"
- Estado cambia a 👤 Agente Interviniendo
- Bot deja de responder automáticamente
- Cliente recibe: "👤 Un agente se ha unido a la conversación"

**4. Odontólogo conversa con el cliente**

- Escribe mensajes en el input inferior
- Mensajes aparecen con burbuja naranja (🧑‍⚕️ Agente)
- Respuestas del cliente aparecen en tiempo real

**5. Problema resuelto, cerrar intervención**

- Click en "Cerrar Intervención"
- Estado vuelve a 🤖 Bot Activo
- Cliente recibe: "🤖 Paola ha vuelto a atenderte"
- Bot retoma control automáticamente

### Atajos y Tips

- **Selección rápida**: Click en cualquier chat de la lista izquierda
- **Scroll automático**: Los mensajes nuevos hacen scroll automático
- **Timestamps**: Pasa el mouse sobre los mensajes para ver hora exacta
- **Múltiples intervenciones**: Puedes tener varios chats con intervención simultánea
- **Actualización en tiempo real**: No necesitas recargar, Firestore actualiza automáticamente

## Arquitectura Técnica

### Listeners en Tiempo Real

El dashboard usa **Firestore listeners** para actualizaciones automáticas:

```javascript
// useFirestoreSessions.js
const q = query(
  collection(db, 'sessions'),
  where('last_updated', '>', thirtyMinutesAgo),
  orderBy('last_updated', 'desc')
);

onSnapshot(q, (snapshot) => {
  // Actualiza automáticamente cuando hay cambios
});
```

### Comunicación con Backend

Las **escrituras** (enviar mensajes, intervenciones) usan HTTP endpoints:

```javascript
// api.js
await sendMessage(phoneNumber, message);
await startIntervention(clientId, clientName);
await closeIntervention(clientId);
```

Esto garantiza:
- ✅ Validación en el backend
- ✅ Autorización adecuada
- ✅ Logging correcto
- ✅ Integración con WhatsApp API

### Seguridad

**Firestore Rules** (solo lectura desde web):

```javascript
match /sessions/{sessionId} {
  allow read: if request.auth != null;  // Solo usuarios autenticados
  allow write: if false;  // Solo Cloud Functions pueden escribir
}
```

**HTTP Endpoints** (protegidos con token):

```javascript
Authorization: Bearer mi_token_de_verificacion_unico
```

## Troubleshooting

### Error: "Unauthorized - Invalid token"

**Causa**: Token inválido o no configurado

**Solución**:
1. Verifica que `VITE_API_TOKEN` en `.env` coincida con `VERIFY_TOKEN` del backend
2. Reinicia el servidor de desarrollo (`npm run dev`)

### Error: "Missing or insufficient permissions"

**Causa**: Reglas de Firestore no desplegadas o Firebase Auth no habilitado

**Solución**:
1. Despliega las reglas: `firebase deploy --only firestore:rules`
2. Habilita Anonymous Auth en Firebase Console
3. Recarga la página

### Los chats no aparecen

**Causa**: No hay sesiones activas en los últimos 30 minutos

**Solución**:
1. Envía un mensaje al bot de WhatsApp
2. Verifica que el backend esté corriendo
3. Verifica en Firestore Console que existan documentos en `sessions`

### Los mensajes no se envían

**Causa**: No estás en modo intervención

**Solución**:
1. Click en "Intervenir" primero
2. Espera a que el estado cambie a 👤 Agente Interviniendo
3. Ahora puedes enviar mensajes

### Las actualizaciones no son en tiempo real

**Causa**: Problema con Firestore listeners

**Solución**:
1. Abre la consola del navegador (F12)
2. Busca errores de Firebase
3. Verifica que las reglas de Firestore estén correctas
4. Verifica que Anonymous Auth esté habilitado

## Próximas Mejoras

- [ ] Firebase Auth con email/password (en vez de anónimo)
- [ ] Roles de usuario (admin, agente, viewer)
- [ ] Notificaciones de escritorio (Browser Notifications API)
- [ ] Sonido de alerta para nuevos mensajes
- [ ] Búsqueda/filtrado de chats
- [ ] Estadísticas y analytics
- [ ] Modo oscuro
- [ ] Responsive design para móviles
- [ ] Export de conversaciones a PDF

## Soporte

Para reportar bugs o solicitar features, abre un issue en el repositorio.
