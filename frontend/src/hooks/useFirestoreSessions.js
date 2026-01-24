import { useState, useEffect } from 'react';

/**
 * Hook to fetch all conversations from Firebase Storage (via API endpoint)
 * Returns all conversations ordered by last update (most recent first)
 * This provides permanent history, unlike Firestore sessions which expire after 30 minutes
 */
export function useFirestoreSessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let intervalId;

    const fetchConversations = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get the Cloud Function URL and auth token from environment
        const apiUrl = import.meta.env.VITE_API_URL || 'https://us-central1-whatsapp-starter-4de11.cloudfunctions.net/api';
        const token = import.meta.env.VITE_API_TOKEN;

        // Fetch conversations from Storage endpoint
        const response = await fetch(`${apiUrl}/conversations?token=${token}`);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Map conversations.json structure to frontend session structure
        const sessionsData = data.conversations.map(conv => {
          return {
            id: conv.userId,
            sessionId: conv.userId,
            phoneNumber: conv.userId,
            documentNumber: conv.userDocument || null,
            // Map messages array to conversationHistory format (with media support)
            conversationHistory: conv.messages.map(msg => ({
              role: msg.role,
              content: msg.text,
              type: msg.mediaUrl ? 'media' : 'text',
              // Media fields
              mediaUrl: msg.mediaUrl || null,
              mediaType: msg.mediaType || null,
              mimeType: msg.mimeType || null,
              timestamp: msg.timestamp || null,
            })),
            lastUpdated: new Date(conv.timestamp),
            createdAt: new Date(conv.timestamp),
            appointmentId: null, // Not stored in conversations.json
            data: {
              userName: conv.userName || null
            },
            messages: []
          };
        });

        // Sort by most recent first
        sessionsData.sort((a, b) => b.lastUpdated - a.lastUpdated);

        setSessions(sessionsData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching conversations:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    // Initial fetch
    fetchConversations();

    // Poll every 10 seconds for updates (simulates real-time)
    intervalId = setInterval(fetchConversations, 10000);

    // Cleanup on unmount
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  return { sessions, loading, error };
}
