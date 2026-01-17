import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import StatusIndicator from './StatusIndicator';
import MessageBubble from './MessageBubble';

/**
 * ChatWindow Component
 * Displays the full conversation for a selected session
 */
export default function ChatWindow({ session, handoff, onSendMessage, onIntervene, onCloseIntervention, onBackToList, showBackButton }) {
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.conversationHistory]);

  if (!session) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <div className="text-6xl mb-4">💬</div>
          <p className="text-lg font-medium">Selecciona una conversación</p>
          <p className="text-sm mt-2">Elige un chat de la lista para ver los mensajes</p>
        </div>
      </div>
    );
  }

  // Determine chat status
  const hasActiveHandoff = !!handoff;
  const timeSinceLastMessage = Date.now() - session.lastUpdated.getTime();
  let status = 'bot_active';
  if (hasActiveHandoff) {
    status = 'agent_intervening';
  } else if (timeSinceLastMessage > 5 * 60 * 1000) {
    status = 'idle';
  }

  const userName = session.data?.userName || session.phoneNumber;
  const userDocument = session.documentNumber || 'Sin documento';

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <ChatWindowHeader
        userName={userName}
        userDocument={userDocument}
        phoneNumber={session.phoneNumber}
        status={status}
        hasActiveHandoff={hasActiveHandoff}
        onIntervene={onIntervene}
        onCloseIntervention={onCloseIntervention}
        onBackToList={onBackToList}
        showBackButton={showBackButton}
      />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-2 xs:p-3 md:p-4 space-y-2 min-h-0">
        {session.conversationHistory && session.conversationHistory.length > 0 ? (
          session.conversationHistory
            .filter(message => {
              // Filter out technical messages (tool_use, tool_result)
              if (message.type === 'tool_use' || message.type === 'tool_result') {
                return false;
              }
              // Filter out messages that are just JSON arrays (tool calling artifacts)
              if (typeof message.content === 'string' &&
                  message.content.trim().startsWith('[{') &&
                  message.content.trim().endsWith('}]')) {
                return false;
              }
              return true;
            })
            .map((message, index) => (
              <MessageBubble
                key={index}
                message={message}
                index={index}
              />
            ))
        ) : (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-sm">No hay mensajes en esta conversación</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <ChatWindowInput
        sessionId={session.sessionId}
        status={status}
        onSendMessage={onSendMessage}
      />
    </div>
  );
}

/**
 * ChatWindowHeader Component
 * Header showing user info and intervention controls
 */
function ChatWindowHeader({ userName, userDocument, phoneNumber, status, hasActiveHandoff, onIntervene, onCloseIntervention, onBackToList, showBackButton }) {
  return (
    <div className="bg-white border-b border-gray-200 px-2 xs:px-3 md:px-4 py-2 xs:py-3 flex-shrink-0">
      <div className="flex items-center justify-between gap-1 xs:gap-2">
        {/* Left: Back button (mobile) + User info */}
        <div className="flex items-center gap-1 xs:gap-2 md:gap-3 flex-1 min-w-0">
          {/* Back button - solo visible en móvil */}
          {showBackButton && (
            <button
              onClick={onBackToList}
              className="md:hidden flex-shrink-0 p-1 xs:p-2 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Volver a la lista"
            >
              <svg className="w-5 h-5 xs:w-6 xs:h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Avatar placeholder - oculto en pantallas muy pequeñas */}
          <div className="hidden xs:flex w-8 h-8 md:w-10 md:h-10 flex-shrink-0 rounded-full bg-gray-300 items-center justify-center text-white font-semibold text-sm md:text-base">
            {userName.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-sm xs:text-base md:text-lg font-semibold text-gray-900 truncate">{userName}</h2>
            <div className="flex items-center gap-1 md:gap-2 text-xs text-gray-500">
              <span className="hidden sm:inline">Doc: {userDocument}</span>
              <span className="hidden sm:inline">•</span>
              <span className="truncate text-xs">{phoneNumber}</span>
            </div>
          </div>
        </div>

        {/* Right: Status and controls */}
        <div className="flex items-center gap-1 xs:gap-2 flex-shrink-0">
          {/* Status indicator - solo visible en pantallas xs+ */}
          <div className="hidden xs:block md:hidden">
            <StatusIndicator status={status} size="small" showLabel={false} />
          </div>
          <div className="hidden md:block">
            <StatusIndicator status={status} size="normal" showLabel={true} />
          </div>

          {/* Intervention button */}
          {hasActiveHandoff ? (
            <button
              onClick={onCloseIntervention}
              className="p-1.5 xs:px-2 xs:py-1.5 md:px-4 md:py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-xs md:text-sm font-medium whitespace-nowrap"
              title="Cerrar Intervención"
            >
              {/* Icono en pantallas muy pequeñas */}
              <svg className="w-4 h-4 xs:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="hidden xs:inline sm:hidden">Cerrar</span>
              <span className="hidden sm:inline">Cerrar Intervención</span>
            </button>
          ) : (
            <button
              onClick={onIntervene}
              className="p-1.5 xs:px-2 xs:py-1.5 md:px-4 md:py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-xs md:text-sm font-medium whitespace-nowrap"
              title="Intervenir"
            >
              {/* Icono en pantallas muy pequeñas */}
              <svg className="w-4 h-4 xs:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="hidden xs:inline">Intervenir</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ChatWindowInput Component
 * Message input area (read-only for now, will add send functionality later)
 */
function ChatWindowInput({ sessionId, status, onSendMessage }) {
  const inputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const message = inputRef.current.value.trim();
    if (!message) return;

    onSendMessage(sessionId, message);
    inputRef.current.value = '';
  };

  const canSend = status === 'agent_intervening';

  return (
    <div className="bg-white border-t border-gray-200 px-2 xs:px-3 md:px-4 py-2 md:py-3 flex-shrink-0">
      {!canSend && (
        <div className="mb-2 px-2 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
          <span className="hidden xs:inline">⚠️ Debes iniciar una intervención para enviar mensajes</span>
          <span className="xs:hidden">⚠️ Inicia intervención para enviar</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-1.5 xs:gap-2">
        <input
          ref={inputRef}
          type="text"
          placeholder={canSend ? "Mensaje..." : "Intervenir..."}
          disabled={!canSend}
          className={`
            flex-1 min-w-0 px-2 xs:px-3 md:px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp-green text-sm xs:text-base
            ${!canSend ? 'bg-gray-100 cursor-not-allowed' : ''}
          `}
        />
        <button
          type="submit"
          disabled={!canSend}
          className={`
            flex-shrink-0 p-2 xs:px-3 xs:py-2 md:px-6 md:py-2.5 rounded-lg font-medium transition-colors text-sm md:text-base
            ${canSend
              ? 'bg-whatsapp-green text-white hover:bg-whatsapp-dark'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
          title="Enviar mensaje"
        >
          {/* Icono en pantallas muy pequeñas */}
          <svg className="w-5 h-5 xs:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          <span className="hidden xs:inline">Enviar</span>
        </button>
      </form>
    </div>
  );
}
