import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import StatusIndicator from './StatusIndicator';

/**
 * ChatList Component
 * Displays a list of active chat sessions on the left sidebar
 */
export default function ChatList({ sessions, handoffs, selectedSessionId, onSelectSession }) {
  // Enrich sessions with handoff status and chat state
  const enrichedSessions = useMemo(() => {
    return sessions.map(session => {
      const hasActiveHandoff = !!handoffs[session.sessionId];
      const timeSinceLastMessage = Date.now() - session.lastUpdated.getTime();

      // Determine status: bot_active, agent_intervening, or idle
      let status = 'bot_active';
      if (hasActiveHandoff) {
        status = 'agent_intervening';
      } else if (timeSinceLastMessage > 5 * 60 * 1000) { // 5 minutes
        status = 'idle';
      }

      // Get last message from conversation history
      let lastMessageText = 'Sin mensajes';
      let lastMessageRole = null;

      if (session.conversationHistory && session.conversationHistory.length > 0) {
        const lastEntry = session.conversationHistory[session.conversationHistory.length - 1];
        if (lastEntry.role === 'user' && typeof lastEntry.content === 'string') {
          lastMessageText = lastEntry.content;
          lastMessageRole = 'user';
        } else if (lastEntry.role === 'assistant' && typeof lastEntry.content === 'string') {
          lastMessageText = lastEntry.content;
          lastMessageRole = 'assistant';
        }
      }

      // Truncate message for preview
      const messagePreview = lastMessageText.length > 50
        ? lastMessageText.substring(0, 50) + '...'
        : lastMessageText;

      // Get user name from session data or use phone number
      const userName = session.data?.userName || session.phoneNumber;

      return {
        ...session,
        status,
        hasActiveHandoff,
        lastMessageText: messagePreview,
        lastMessageRole,
        userName,
        handoff: hasActiveHandoff ? handoffs[session.sessionId] : null
      };
    });
  }, [sessions, handoffs]);

  // Sort by last updated (most recent first)
  const sortedSessions = useMemo(() => {
    return [...enrichedSessions].sort((a, b) => {
      return b.lastUpdated.getTime() - a.lastUpdated.getTime();
    });
  }, [enrichedSessions]);

  return (
    <div className="h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Conversaciones</h2>
        <p className="text-xs text-gray-500 mt-1">
          {sortedSessions.length} chat{sortedSessions.length !== 1 ? 's' : ''} activo{sortedSessions.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {sortedSessions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-sm">No hay conversaciones activas</p>
            <p className="text-xs mt-2">Los chats aparecerán aquí cuando los usuarios escriban</p>
          </div>
        ) : (
          sortedSessions.map(session => (
            <ChatListItem
              key={session.sessionId}
              session={session}
              isSelected={session.sessionId === selectedSessionId}
              onClick={() => onSelectSession(session.sessionId)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * ChatListItem Component
 * Individual chat item in the list
 */
function ChatListItem({ session, isSelected, onClick }) {
  const timeAgo = formatDistanceToNow(session.lastUpdated, {
    addSuffix: true,
    locale: es
  });

  return (
    <div
      onClick={onClick}
      className={`
        px-4 py-3 border-b border-gray-100 cursor-pointer transition-colors
        ${isSelected ? 'bg-gray-100' : 'hover:bg-gray-50'}
      `}
    >
      <div className="flex items-start justify-between">
        {/* Left: User info and message preview */}
        <div className="flex-1 min-w-0 mr-2">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 truncate">
              {session.userName}
            </h3>
            <StatusIndicator status={session.status} size="small" />
          </div>

          {session.documentNumber && (
            <p className="text-xs text-gray-500 mb-1">
              Doc: {session.documentNumber}
            </p>
          )}

          <p className="text-sm text-gray-600 truncate">
            {session.lastMessageRole === 'user' ? '📱 ' : session.lastMessageRole === 'assistant' ? '🤖 ' : ''}
            {session.lastMessageText}
          </p>
        </div>

        {/* Right: Timestamp */}
        <div className="text-xs text-gray-500 whitespace-nowrap">
          {timeAgo}
        </div>
      </div>

      {/* Show intervention badge if active */}
      {session.hasActiveHandoff && (
        <div className="mt-2">
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            👤 Intervención activa
          </span>
        </div>
      )}
    </div>
  );
}
