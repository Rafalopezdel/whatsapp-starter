import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * MessageBubble Component
 * Renders individual message bubbles in WhatsApp style
 */
export default function MessageBubble({ message, index }) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isAgent = message.role === 'agent';
  const isSystem = message.role === 'system';

  // Extract message content
  let messageText = '';
  if (typeof message.content === 'string') {
    messageText = message.content;
  } else if (Array.isArray(message.content)) {
    // Handle Claude's content array format
    const textContent = message.content.find(item => item.type === 'text');
    messageText = textContent?.text || JSON.stringify(message.content);
  } else {
    messageText = JSON.stringify(message.content);
  }

  // Get timestamp if available
  const timestamp = message.timestamp ? new Date(message.timestamp) : null;

  // System messages (like tool calls)
  if (isSystem || message.type === 'tool_use' || message.type === 'tool_result') {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-gray-200 px-3 py-1 rounded-lg text-xs text-gray-600 max-w-md text-center">
          {message.type === 'tool_use' && `🔧 Llamando herramienta: ${message.name}`}
          {message.type === 'tool_result' && `✅ Resultado de herramienta`}
          {isSystem && messageText}
        </div>
      </div>
    );
  }

  // User messages (from client via WhatsApp)
  if (isUser) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] xs:max-w-[75%] md:max-w-[70%] bg-white rounded-lg px-2 xs:px-3 md:px-4 py-2 shadow-sm">
          <div className="flex items-start gap-1.5 xs:gap-2">
            <span className="text-sm xs:text-base md:text-lg flex-shrink-0">📱</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                {messageText}
              </p>
              {timestamp && (
                <p className="text-xs text-gray-500 mt-1">
                  {format(timestamp, 'HH:mm', { locale: es })}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Assistant messages (from AI bot)
  if (isAssistant) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] xs:max-w-[75%] md:max-w-[70%] bg-whatsapp-light rounded-lg px-2 xs:px-3 md:px-4 py-2 shadow-sm">
          <div className="flex items-start gap-1.5 xs:gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                {messageText}
              </p>
              {timestamp && (
                <p className="text-xs text-gray-500 mt-1 text-right">
                  {format(timestamp, 'HH:mm', { locale: es })}
                </p>
              )}
            </div>
            <span className="text-sm xs:text-base md:text-lg flex-shrink-0">🤖</span>
          </div>
        </div>
      </div>
    );
  }

  // Agent messages (from human agent via dashboard)
  if (isAgent) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] xs:max-w-[75%] md:max-w-[70%] bg-orange-100 rounded-lg px-2 xs:px-3 md:px-4 py-2 shadow-sm">
          <div className="flex items-start gap-1.5 xs:gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-orange-700 font-semibold mb-1">Agente</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                {messageText}
              </p>
              {timestamp && (
                <p className="text-xs text-gray-500 mt-1 text-right">
                  {format(timestamp, 'HH:mm', { locale: es })}
                </p>
              )}
            </div>
            <span className="text-sm xs:text-base md:text-lg flex-shrink-0">👤</span>
          </div>
        </div>
      </div>
    );
  }

  // Fallback for unknown message types
  return (
    <div className="flex justify-center my-2">
      <div className="bg-gray-100 px-3 py-1 rounded-lg text-xs text-gray-500">
        Mensaje desconocido
      </div>
    </div>
  );
}
