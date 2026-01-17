const admin = require('firebase-admin');
const { getActiveHandoffByClient } = require('./handoffService');
const conversationLogService = require('./conversationLogService');
const logger = require('../utils/logger');

/**
 * Dashboard Service
 * Business logic for retrieving and managing chat sessions for the web dashboard
 */

const db = admin.firestore();

/**
 * Gets all sessions from Firestore (no time limit)
 * Enriches session data with handoff status and user information
 * @returns {Promise<Array>} Array of session objects
 */
async function getActiveSessions() {
  try {
    // Get ALL sessions from Firestore (no time limit)
    const sessionsSnapshot = await db.collection('sessions')
      .orderBy('last_updated', 'desc')
      .get();

    if (sessionsSnapshot.empty) {
      logger.log('📊 Dashboard: No active sessions found');
      return [];
    }

    // Get handoffs to determine intervention status
    const handoffsSnapshot = await db.collection('open-handoffs')
      .where('status', '==', 'active')
      .get();

    const activeHandoffs = {};
    handoffsSnapshot.forEach(doc => {
      const data = doc.data();
      activeHandoffs[data.clientId] = {
        id: doc.id,
        ...data
      };
    });

    // Enrich sessions with additional data
    const enrichedSessions = await Promise.all(
      sessionsSnapshot.docs.map(async (doc) => {
        const sessionData = doc.data();
        const sessionId = doc.id;

        // Get user data from conversations.json for persistent memory
        const userData = await conversationLogService.getUserData(sessionId);

        // Determine intervention status
        const hasActiveHandoff = !!activeHandoffs[sessionId];

        // Calculate last message timestamp
        const lastUpdated = sessionData.last_updated?.toDate() || new Date();

        // Extract last user message from conversation history
        let lastMessage = 'Sin mensajes';
        let lastMessageRole = null;
        if (sessionData.conversation_history && sessionData.conversation_history.length > 0) {
          const lastEntry = sessionData.conversation_history[sessionData.conversation_history.length - 1];
          if (lastEntry.role === 'user' && typeof lastEntry.content === 'string') {
            lastMessage = lastEntry.content.substring(0, 50) + (lastEntry.content.length > 50 ? '...' : '');
            lastMessageRole = 'user';
          } else if (lastEntry.role === 'assistant' && typeof lastEntry.content === 'string') {
            lastMessage = lastEntry.content.substring(0, 50) + (lastEntry.content.length > 50 ? '...' : '');
            lastMessageRole = 'assistant';
          }
        }

        // Determine chat status
        let status = 'bot_active'; // Default: bot is handling
        if (hasActiveHandoff) {
          status = 'agent_intervening';
        } else {
          const timeSinceLastMessage = Date.now() - lastUpdated.getTime();
          if (timeSinceLastMessage > 5 * 60 * 1000) { // 5 minutes
            status = 'idle';
          }
        }

        return {
          sessionId: sessionId,
          phoneNumber: sessionId,
          userName: userData?.userName || sessionData.data?.userName || sessionId,
          userDocument: userData?.userDocument || sessionData.document_number || null,
          lastMessage: lastMessage,
          lastMessageRole: lastMessageRole,
          lastUpdated: lastUpdated.toISOString(),
          status: status,
          hasActiveHandoff: hasActiveHandoff,
          handoffId: hasActiveHandoff ? activeHandoffs[sessionId].id : null,
          messageCount: sessionData.conversation_history?.length || 0,
          appointmentId: sessionData.id_sesion || null
        };
      })
    );

    logger.log(`📊 Dashboard: Enriched ${enrichedSessions.length} sessions`);

    return enrichedSessions;
  } catch (error) {
    logger.error('❌ Dashboard: Error getting active sessions:', error);
    throw error;
  }
}

/**
 * Gets a specific session by ID with full conversation history
 * @param {string} sessionId - Session ID (phone number)
 * @returns {Promise<Object|null>} Session object with full history or null
 */
async function getSessionById(sessionId) {
  try {
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();

    if (!sessionDoc.exists) {
      logger.log(`📊 Dashboard: Session ${sessionId} not found`);
      return null;
    }

    const sessionData = sessionDoc.data();

    // Get user data from conversations.json
    const userData = await conversationLogService.getUserData(sessionId);

    // Get handoff status
    const handoff = await getActiveHandoffByClient(sessionId);

    // Format conversation history for display
    const formattedHistory = sessionData.conversation_history?.map(entry => {
      return {
        role: entry.role,
        content: typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content),
        timestamp: entry.timestamp || null
      };
    }) || [];

    return {
      sessionId: sessionId,
      phoneNumber: sessionId,
      userName: userData?.userName || sessionData.data?.userName || sessionId,
      userDocument: userData?.userDocument || sessionData.document_number || null,
      conversationHistory: formattedHistory,
      lastUpdated: sessionData.last_updated?.toDate()?.toISOString() || null,
      createdAt: sessionData.created_at?.toDate()?.toISOString() || null,
      hasActiveHandoff: !!handoff,
      handoffId: handoff?.id || null,
      appointmentId: sessionData.id_sesion || null,
      documentNumber: sessionData.document_number || null
    };
  } catch (error) {
    logger.error(`❌ Dashboard: Error getting session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Gets session statistics for dashboard overview
 * @returns {Promise<Object>} Statistics object
 */
async function getSessionStats() {
  try {
    // Get all sessions count
    const sessionsSnapshot = await db.collection('sessions').get();

    // Get active handoffs count
    const handoffsSnapshot = await db.collection('open-handoffs')
      .where('status', '==', 'active')
      .get();

    return {
      activeSessions: sessionsSnapshot.size,
      activeInterventions: handoffsSnapshot.size,
      totalSessions: sessionsSnapshot.size,
      botHandling: sessionsSnapshot.size - handoffsSnapshot.size,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('❌ Dashboard: Error getting session stats:', error);
    throw error;
  }
}

module.exports = {
  getActiveSessions,
  getSessionById,
  getSessionStats
};
