import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * AudioPlayer Component
 * Custom WhatsApp-style audio player with play/pause, progress bar, and options menu
 */
function AudioPlayer({ mediaUrl }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  // Format time as mm:ss
  const formatTime = (time) => {
    if (isNaN(time) || time === 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Handle play/pause
  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Handle progress bar click
  const handleProgressClick = (e) => {
    if (audioRef.current && duration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const newTime = (clickX / rect.width) * duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // Handle playback rate change
  const changePlaybackRate = (rate) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
    setShowMenu(false);
  };

  // Handle download
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = mediaUrl;
    link.download = 'audio';
    link.click();
    setShowMenu(false);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mb-2 flex items-center gap-2 bg-gray-100 rounded-full px-2 py-1.5 min-w-[200px] max-w-[280px]">
      {/* Hidden audio element */}
      <audio ref={audioRef} src={mediaUrl} preload="metadata" />

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        className="flex-shrink-0 w-10 h-10 rounded-full bg-teal-500 hover:bg-teal-600 flex items-center justify-center text-white transition-colors"
        aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
      >
        {isPlaying ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Progress section */}
      <div className="flex-1 min-w-0">
        {/* Waveform-like progress bar */}
        <div
          className="h-8 flex items-center gap-[2px] cursor-pointer"
          onClick={handleProgressClick}
        >
          {/* Generate waveform bars */}
          {Array.from({ length: 30 }).map((_, i) => {
            const barProgress = (i / 30) * 100;
            const isActive = barProgress <= progress;
            // Create varying heights for waveform effect
            const heights = [12, 18, 24, 20, 28, 16, 22, 26, 14, 20, 24, 18, 28, 22, 16, 26, 20, 24, 18, 14, 22, 28, 16, 20, 26, 18, 24, 22, 14, 20];
            const height = heights[i % heights.length];
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-colors ${isActive ? 'bg-teal-500' : 'bg-gray-300'}`}
                style={{ height: `${height}px` }}
              />
            );
          })}
        </div>

        {/* Time display */}
        <div className="flex justify-between text-xs text-gray-500 -mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Options menu */}
      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-1.5 hover:bg-gray-200 rounded-full transition-colors"
          aria-label="Opciones"
        >
          <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
          </svg>
        </button>

        {/* Dropdown menu */}
        {showMenu && (
          <div className="absolute right-0 bottom-full mb-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[160px]">
            <button
              onClick={handleDownload}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Descargar
            </button>
            <div className="border-t border-gray-100 my-1" />
            <div className="px-4 py-1 text-xs text-gray-500 font-medium">Velocidad</div>
            {[0.5, 1, 1.5, 2].map((rate) => (
              <button
                key={rate}
                onClick={() => changePlaybackRate(rate)}
                className={`w-full px-4 py-1.5 text-left text-sm flex items-center justify-between ${
                  playbackRate === rate ? 'text-teal-600 bg-teal-50' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span>{rate}x</span>
                {playbackRate === rate && (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * MediaContent Component
 * Renders media content (images, videos, audio, documents)
 */
function MediaContent({ mediaUrl, mediaType, mimeType }) {
  if (!mediaUrl) return null;

  switch (mediaType) {
    case 'image':
    case 'sticker':
      return (
        <div className="mb-2">
          <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={mediaUrl}
              alt="Imagen"
              className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
              style={{ maxHeight: '300px' }}
              loading="lazy"
            />
          </a>
        </div>
      );

    case 'video':
      return (
        <div className="mb-2">
          <video
            controls
            src={mediaUrl}
            className="max-w-full rounded-lg"
            style={{ maxHeight: '300px' }}
            preload="metadata"
          />
        </div>
      );

    case 'audio':
      return <AudioPlayer mediaUrl={mediaUrl} />;

    case 'document':
      return (
        <div className="mb-2">
          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <span className="text-2xl">📄</span>
            <span className="text-sm text-blue-600 underline">Descargar documento</span>
          </a>
        </div>
      );

    default:
      return (
        <div className="mb-2">
          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 underline"
          >
            📎 Ver archivo
          </a>
        </div>
      );
  }
}

/**
 * MessageBubble Component
 * Renders individual message bubbles in WhatsApp style
 */
export default function MessageBubble({ message, index }) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isAgent = message.role === 'agent';
  const isSystem = message.role === 'system';

  // Check for media content
  const hasMedia = !!message.mediaUrl;
  const mediaUrl = message.mediaUrl;
  const mediaType = message.mediaType;
  const mimeType = message.mimeType;

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

  // Hide text if it's just a media placeholder like "[image]"
  const isMediaPlaceholder = messageText.match(/^\[(image|video|audio|document|sticker)\]$/i);
  const showText = messageText && !isMediaPlaceholder;

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
              {hasMedia && (
                <MediaContent mediaUrl={mediaUrl} mediaType={mediaType} mimeType={mimeType} />
              )}
              {showText && (
                <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                  {messageText}
                </p>
              )}
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
              {hasMedia && (
                <MediaContent mediaUrl={mediaUrl} mediaType={mediaType} mimeType={mimeType} />
              )}
              {showText && (
                <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                  {messageText}
                </p>
              )}
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
              {hasMedia && (
                <MediaContent mediaUrl={mediaUrl} mediaType={mediaType} mimeType={mimeType} />
              )}
              {showText && (
                <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                  {messageText}
                </p>
              )}
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
