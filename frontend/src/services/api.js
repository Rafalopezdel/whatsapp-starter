/**
 * API Service
 * Handles HTTP requests to the backend Cloud Functions
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/whatsapp-starter-4de11/us-central1/api';
const API_TOKEN = import.meta.env.VITE_API_TOKEN;

/**
 * Base fetch function with authentication
 */
async function fetchWithAuth(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_TOKEN}`,
    ...options.headers
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Send a message from the dashboard to a WhatsApp user
 * @param {string} to - Phone number (e.g., "573001234567")
 * @param {string} message - Message text
 */
export async function sendMessage(to, message) {
  return fetchWithAuth('/dashboard/send-message', {
    method: 'POST',
    body: JSON.stringify({ to, message })
  });
}

/**
 * Start an intervention (handoff) for a specific client
 * @param {string} clientId - Client phone number
 * @param {string} clientName - Client name (optional)
 */
export async function startIntervention(clientId, clientName = 'Cliente') {
  return fetchWithAuth('/dashboard/intervene', {
    method: 'POST',
    body: JSON.stringify({ clientId, clientName })
  });
}

/**
 * Close an intervention (handoff) for a specific client
 * @param {string} clientId - Client phone number
 */
export async function closeIntervention(clientId) {
  return fetchWithAuth('/dashboard/close-intervention', {
    method: 'POST',
    body: JSON.stringify({ clientId })
  });
}

/**
 * Get all active sessions (alternative to Firestore listeners)
 */
export async function getActiveSessions() {
  return fetchWithAuth('/dashboard/sessions');
}

/**
 * Get details for a specific session
 * @param {string} sessionId - Session ID (phone number)
 */
export async function getSessionDetails(sessionId) {
  return fetchWithAuth(`/dashboard/session/${sessionId}`);
}

/**
 * Health check for the dashboard API
 */
export async function healthCheck() {
  return fetchWithAuth('/dashboard/health');
}
