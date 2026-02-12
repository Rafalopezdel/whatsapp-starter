import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import StatusIndicator from './StatusIndicator';
import MessageBubble from './MessageBubble';

/**
 * ChatWindow Component
 * Displays the full conversation for a selected session
 */
export default function ChatWindow({ session, handoff, onSendMessage, onSendMedia, onIntervene, onCloseIntervention, onStartConversation, onBackToList, showBackButton }) {
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
        onStartConversation={onStartConversation}
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
        onSendMedia={onSendMedia}
      />
    </div>
  );
}

/**
 * ChatWindowHeader Component
 * Header showing user info and intervention controls
 */
function ChatWindowHeader({ userName, userDocument, phoneNumber, status, hasActiveHandoff, onIntervene, onCloseIntervention, onStartConversation, onBackToList, showBackButton }) {
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

          {/* Start conversation button (send template) - only show when no active handoff */}
          {!hasActiveHandoff && (
            <button
              onClick={onStartConversation}
              className="p-1.5 xs:px-2 xs:py-1.5 md:px-4 md:py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-xs md:text-sm font-medium whitespace-nowrap"
              title="Enviar mensaje para iniciar conversación"
            >
              {/* Icono en pantallas muy pequeñas */}
              <svg className="w-4 h-4 xs:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="hidden xs:inline sm:hidden">Contactar</span>
              <span className="hidden sm:inline">Iniciar Chat</span>
            </button>
          )}

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
 * Message input area with text, file attachment, and voice recording
 */
function ChatWindowInput({ sessionId, status, onSendMessage, onSendMedia }) {
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isSending, setIsSending] = useState(false);

  const canSend = status === 'agent_intervening';

  // Handle text message submit
  const handleSubmit = (e) => {
    e.preventDefault();
    const message = inputRef.current.value.trim();
    if (!message || !canSend) return;

    onSendMessage(sessionId, message);
    inputRef.current.value = '';
  };

  // Handle file selection
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !canSend) return;

    setIsSending(true);

    try {
      // Determine media type
      let mediaType = 'document';
      if (file.type.startsWith('image/')) mediaType = 'image';
      else if (file.type.startsWith('video/')) mediaType = 'video';
      else if (file.type.startsWith('audio/')) mediaType = 'audio';

      // Convert file to base64
      const base64 = await fileToBase64(file);

      // Send media
      await onSendMedia(sessionId, mediaType, base64, file.name, file.type, null);
    } catch (error) {
      console.error('Error sending file:', error);
      alert(`Error al enviar archivo: ${error.message}`);
    } finally {
      setIsSending(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Convert file to base64
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Get supported audio MIME type for WhatsApp (in order of preference)
  const getSupportedAudioMimeType = () => {
    // WhatsApp accepts: audio/ogg, audio/opus, audio/mp4, audio/aac, audio/mpeg, audio/amr
    const mimeTypes = [
      'audio/ogg; codecs=opus',
      'audio/ogg',
      'audio/mp4',
      'audio/mpeg',
      'audio/aac'
    ];

    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        console.log(`🎤 Using audio format: ${mimeType}`);
        return mimeType;
      }
    }

    // Fallback - let browser choose (might not be WhatsApp compatible)
    console.warn('⚠️ No WhatsApp-compatible audio format found, using default');
    return undefined;
  };

  // Start voice recording
  const startRecording = async () => {
    if (!canSend) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = getSupportedAudioMimeType();
      const options = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, options);

      console.log(`🎤 MediaRecorder created with mimeType: ${mediaRecorder.mimeType}`);

      audioChunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        if (audioChunksRef.current.length > 0) {
          setIsSending(true);
          try {
            // Get the actual mimeType used
            const actualMimeType = mediaRecorder.mimeType;

            const audioBlob = new Blob(audioChunksRef.current, {
              type: actualMimeType
            });

            // Convert to base64
            const base64 = await blobToBase64(audioBlob);

            // Determine file extension based on mime type
            let ext = 'ogg';
            if (actualMimeType.includes('mp4') || actualMimeType.includes('m4a')) ext = 'm4a';
            else if (actualMimeType.includes('mpeg') || actualMimeType.includes('mp3')) ext = 'mp3';
            else if (actualMimeType.includes('aac')) ext = 'aac';
            else if (actualMimeType.includes('ogg') || actualMimeType.includes('opus')) ext = 'ogg';

            // Clean mimeType for WhatsApp (remove codecs info)
            let cleanMimeType = actualMimeType.split(';')[0].trim();
            // Map to WhatsApp accepted types
            if (cleanMimeType === 'audio/webm') cleanMimeType = 'audio/ogg'; // Fallback

            console.log(`🎤 Sending audio: ${ext}, mimeType: ${cleanMimeType}`);

            // Send audio
            await onSendMedia(sessionId, 'audio', base64, `voice_note.${ext}`, cleanMimeType, null);
          } catch (error) {
            console.error('Error sending voice note:', error);
            alert(`Error al enviar nota de voz: ${error.message}`);
          } finally {
            setIsSending(false);
          }
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration counter
      const startTime = Date.now();
      const interval = setInterval(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
        } else {
          clearInterval(interval);
        }
      }, 1000);

    } catch (error) {
      console.error('Error starting recording:', error);
      alert('No se pudo acceder al micrófono. Verifica los permisos.');
    }
  };

  // Stop voice recording and send
  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setRecordingDuration(0);
    }
  };

  // Cancel voice recording without sending
  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      // Clear chunks so nothing gets sent
      audioChunksRef.current = [];
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      setRecordingDuration(0);
    }
  };

  // Convert blob to base64
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Format recording duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white border-t border-gray-200 px-2 xs:px-3 md:px-4 py-2 md:py-3 flex-shrink-0">
      {!canSend && (
        <div className="mb-2 px-2 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
          <span className="hidden xs:inline">⚠️ Debes iniciar una intervención para enviar mensajes</span>
          <span className="xs:hidden">⚠️ Inicia intervención para enviar</span>
        </div>
      )}

      {/* Recording indicator - mobile optimized */}
      {isRecording && (
        <div className="mb-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          {/* Cancel button */}
          <button
            onClick={cancelRecording}
            className="p-1.5 text-gray-500 hover:text-gray-700 active:scale-95 transition-all"
            title="Cancelar"
            aria-label="Cancelar grabación"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Recording info */}
          <div className="flex items-center gap-2 flex-1">
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm text-red-700 font-medium">
              <span className="hidden xs:inline">Grabando </span>
              <span className="font-mono">{formatDuration(recordingDuration)}</span>
            </span>
          </div>

          {/* Send button */}
          <button
            onClick={stopRecording}
            className="px-3 py-1.5 bg-teal-500 text-white rounded-full text-sm font-medium active:bg-teal-600 active:scale-95 transition-all flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
            <span className="hidden xs:inline">Enviar</span>
          </button>
        </div>
      )}

      {/* Sending indicator */}
      {isSending && (
        <div className="mb-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-blue-700">Enviando...</span>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        onChange={handleFileSelect}
        className="hidden"
      />

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        {/* Attachment button - always visible */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canSend || isSending || isRecording}
          className={`
            flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-all duration-150 select-none
            ${canSend && !isSending && !isRecording
              ? 'text-gray-600 hover:bg-gray-100 active:bg-gray-200 active:scale-95'
              : 'text-gray-400 cursor-not-allowed'
            }
          `}
          title="Adjuntar archivo"
          aria-label="Adjuntar archivo"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          placeholder={canSend ? "Mensaje..." : "Intervenir primero..."}
          disabled={!canSend || isSending || isRecording}
          className={`
            flex-1 min-w-0 px-4 py-2.5 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-whatsapp-green text-base
            ${!canSend || isSending || isRecording ? 'bg-gray-100 cursor-not-allowed' : ''}
          `}
          style={{ fontSize: '16px' }} /* Prevent iOS zoom */
        />

        {/* Voice recording button - always visible */}
        <button
          type="button"
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onMouseLeave={isRecording ? stopRecording : undefined}
          onTouchStart={(e) => {
            e.preventDefault();
            startRecording();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            stopRecording();
          }}
          onContextMenu={(e) => e.preventDefault()}
          disabled={!canSend || isSending}
          className={`
            flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-all duration-150 select-none
            ${isRecording
              ? 'bg-red-500 text-white scale-110 shadow-lg'
              : canSend && !isSending
                ? 'text-gray-600 hover:bg-gray-100 active:bg-teal-100 active:text-teal-600 active:scale-95'
                : 'text-gray-400 cursor-not-allowed'
            }
          `}
          style={{ touchAction: 'none' }}
          title="Mantener presionado para grabar"
          aria-label="Grabar nota de voz"
        >
          <svg className="w-6 h-6" fill={isRecording ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>

        {/* Send button - always visible */}
        <button
          type="submit"
          disabled={!canSend || isSending || isRecording}
          className={`
            flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-all duration-150 select-none
            ${canSend && !isSending && !isRecording
              ? 'bg-whatsapp-green text-white hover:bg-whatsapp-dark active:bg-green-700 active:scale-95'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
          title="Enviar mensaje"
          aria-label="Enviar mensaje"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
