import { useState, useEffect, useMemo } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useFirestoreSessions } from '../hooks/useFirestoreSessions';
import { useFirestoreHandoffs } from '../hooks/useFirestoreHandoffs';
import { sendMessage, sendMedia, startIntervention, closeIntervention } from '../services/api';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';

function Dashboard() {
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showChatInMobile, setShowChatInMobile] = useState(false);

  // Real-time Firestore listeners - only run when authenticated
  const { sessions, loading: sessionsLoading, error: sessionsError } = useFirestoreSessions();
  const { handoffs, loading: handoffsLoading, error: handoffsError } = useFirestoreHandoffs();

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;

    const query = searchQuery.toLowerCase();
    return sessions.filter(session => {
      const userName = session.data?.userName || session.phoneNumber;
      return userName.toLowerCase().includes(query);
    });
  }, [sessions, searchQuery]);

  // Auto-select session from URL parameter (?client=573xxx)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('client');

    if (clientId && sessions.length > 0) {
      const session = sessions.find(s => s.sessionId === clientId || s.phoneNumber === clientId);
      if (session) {
        setSelectedSessionId(session.sessionId);
        console.log(`✅ Auto-selected session from URL: ${clientId}`);

        // Clean URL (remove parameter without page reload)
        const url = new URL(window.location);
        url.searchParams.delete('client');
        window.history.replaceState({}, '', url);
      }
    }
  }, [sessions]);

  // Find selected session
  const selectedSession = sessions.find(s => s.sessionId === selectedSessionId);
  const selectedHandoff = selectedSessionId ? handoffs[selectedSessionId] : null;

  // Handler: Select session
  const handleSelectSession = (sessionId) => {
    setSelectedSessionId(sessionId);
    setShowChatInMobile(true);
  };

  // Handler: Back to list (mobile only)
  const handleBackToList = () => {
    setShowChatInMobile(false);
  };

  // Handler: Send message
  const handleSendMessage = async (sessionId, message) => {
    try {
      await sendMessage(sessionId, message);
      console.log('✅ Message sent successfully');
    } catch (error) {
      console.error('❌ Error sending message:', error);
      alert(`Error al enviar mensaje: ${error.message}`);
    }
  };

  // Handler: Send media
  const handleSendMedia = async (sessionId, mediaType, mediaData, filename, mimeType, caption) => {
    try {
      await sendMedia(sessionId, mediaType, mediaData, filename, mimeType, caption);
      console.log(`✅ ${mediaType} sent successfully`);
    } catch (error) {
      console.error('❌ Error sending media:', error);
      alert(`Error al enviar ${mediaType}: ${error.message}`);
    }
  };

  // Handler: Start intervention
  const handleIntervene = async () => {
    if (!selectedSession) return;

    try {
      const clientName = selectedSession.data?.userName || 'Cliente';
      await startIntervention(selectedSession.sessionId, clientName);
      console.log('✅ Intervention started');
    } catch (error) {
      console.error('❌ Error starting intervention:', error);
      alert(`Error al iniciar intervención: ${error.message}`);
    }
  };

  // Handler: Close intervention
  const handleCloseIntervention = async () => {
    if (!selectedSession) return;

    try {
      await closeIntervention(selectedSession.sessionId);
      console.log('✅ Intervention closed');
    } catch (error) {
      console.error('❌ Error closing intervention:', error);
      alert(`Error al cerrar intervención: ${error.message}`);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top header */}
      <header className="bg-whatsapp-dark text-white px-3 md:px-6 py-3 md:py-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
            <div className="text-2xl md:text-3xl flex-shrink-0">💬</div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base md:text-xl font-bold truncate">Dashboard Clínica Dental</h1>
              <p className="text-xs md:text-sm text-green-200 hidden sm:block">Panel de Control de Conversaciones</p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
            {sessionsError && (
              <div className="text-xs md:text-sm text-red-200 hidden md:block">
                ⚠️ Error: {sessionsError}
              </div>
            )}
            {handoffsError && (
              <div className="text-xs md:text-sm text-red-200 hidden md:block">
                ⚠️ Error: {handoffsError}
              </div>
            )}
            <div className="text-xs md:text-sm whitespace-nowrap">
              {sessionsLoading ? '⏳' : `${filteredSessions.length} chat${filteredSessions.length !== 1 ? 's' : ''}`}
            </div>
            <button
              onClick={handleLogout}
              className="ml-2 px-2 py-1 md:px-3 md:py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs md:text-sm rounded-lg transition-colors duration-200"
              title="Cerrar sesión"
            >
              <span className="hidden md:inline">Salir</span>
              <span className="md:hidden">🚪</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content: Chat list + Chat window */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar: Chat list */}
        <div className={`${showChatInMobile ? 'hidden' : 'flex'} md:flex w-full md:w-96 flex-col`}>
          {/* Search bar */}
          <div className="bg-white border-b border-gray-200 px-4 py-3">
            <input
              type="text"
              placeholder="🔍 Buscar por nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp-green text-base"
            />
            {searchQuery && (
              <p className="text-sm text-gray-500 mt-2">
                {filteredSessions.length} resultado{filteredSessions.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Chat list */}
          <div className="flex-1 overflow-hidden">
            <ChatList
              sessions={filteredSessions}
              handoffs={handoffs}
              selectedSessionId={selectedSessionId}
              onSelectSession={handleSelectSession}
            />
          </div>
        </div>

        {/* Right panel: Chat window */}
        <div className={`${!showChatInMobile ? 'hidden' : 'flex'} md:flex flex-1 w-full justify-center`}>
          <ChatWindow
            session={selectedSession}
            handoff={selectedHandoff}
            onSendMessage={handleSendMessage}
            onSendMedia={handleSendMedia}
            onIntervene={handleIntervene}
            onCloseIntervention={handleCloseIntervention}
            onBackToList={handleBackToList}
            showBackButton={true}
          />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
