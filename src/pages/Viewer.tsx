import React, { useState, useCallback, useEffect } from 'react';
import { Person } from '@/config/types';
import { useConversations } from '../contexts/ConversationContext';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { usePersonMentions } from '../hooks/usePersonMentions';
import { useTranscriptSelection } from '../hooks/useTranscriptSelection';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useChat } from '../hooks/useChat';
import { useChatHistory } from '../hooks/useChatHistory';
import { ViewerHeader } from '../components/viewer/ViewerHeader';
import { TranscriptView } from '../components/viewer/TranscriptView';
import { Sidebar } from '../components/viewer/Sidebar';
import { AudioPlayer } from '../components/viewer/AudioPlayer';
import { RenameSpeakerModal } from '../components/viewer/RenameSpeakerModal';
import { KeyboardShortcutsModal } from '../components/viewer/KeyboardShortcutsModal';
import { HelpCircle } from 'lucide-react';

interface ViewerProps {
  onBack: () => void;
  onStatsClick?: () => void;
  targetSegmentId?: string;
}

/**
 * Viewer - Main transcript viewing page
 *
 * REFACTORED: Stripped down to orchestration logic only.
 * - State management → ConversationContext
 * - Audio sync → useAudioPlayer hook
 * - Person mentions → usePersonMentions hook
 * - Selection state → useTranscriptSelection hook
 * - Auto-scroll → useAutoScroll hook
 * - Header → ViewerHeader component
 * - Transcript → TranscriptView component
 * - Speaker rename → RenameSpeakerModal component
 *
 * This went from 516 lines to ~130 lines. Much easier to reason about.
 */
export const Viewer: React.FC<ViewerProps> = ({ onBack, onStatsClick, targetSegmentId }) => {
  const { activeConversation, updateConversation, getAudioUrl } = useConversations();

  // Bail if no active conversation (shouldn't happen, but TypeScript safety)
  if (!activeConversation) {
    return null;
  }

  const [conversation, setConversation] = useState(activeConversation);
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Fetch audio URL from Firebase Storage on mount
  // The URL is generated on-demand because Storage download URLs expire
  useEffect(() => {
    const fetchUrl = async () => {
      if (!activeConversation.conversationId) return;

      console.log('[Viewer] Fetching audio URL for conversation:', activeConversation.conversationId);
      const url = await getAudioUrl(activeConversation.conversationId);
      if (url) {
        console.log('[Viewer] Audio URL fetched successfully');
        setAudioUrl(url);
      } else {
        console.log('[Viewer] No audio URL available (audioStoragePath may be missing)');
      }
    };

    fetchUrl();
  }, [activeConversation.conversationId, getAudioUrl]);

  // Audio playback logic (drift correction, play/pause, seeking)
  const {
    isPlaying,
    currentTime,
    duration,
    activeSegmentIndex,
    isSyncing,
    driftCorrectionApplied,
    driftRatio,
    driftMs,
    syncOffset,
    togglePlay,
    seek,
    scrub,
    setSyncOffset
  } = useAudioPlayer(conversation, {
    audioUrl: audioUrl ?? undefined,
    initialDuration: conversation.durationMs,
    segments: conversation.segments,
    onDriftCorrected: (fixedConversation) => {
      setConversation(fixedConversation);
      updateConversation(fixedConversation);
    }
  });

  // Person mention detection (regex-based)
  const { mentionsMap, personOccurrences } = usePersonMentions(
    conversation.people,
    conversation.segments
  );

  // Selection state and two-way sync (transcript ↔ sidebar)
  const {
    selectedTermId,
    selectedPersonId,
    handleTermClickInTranscript,
    handleTermClickInSidebar,
    handlePersonClickInSidebar
  } = useTranscriptSelection({
    termOccurrences: conversation.termOccurrences,
    personMentions: mentionsMap
  });

  // Auto-scroll to active segment during playback
  useAutoScroll(isPlaying, activeSegmentIndex, conversation.segments);

  // Scroll to target segment if provided (from search deep-link)
  useEffect(() => {
    if (targetSegmentId) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        const el = document.getElementById(`segment-${targetSegmentId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Briefly highlight the target segment
          el.classList.add('ring-2', 'ring-blue-400', 'bg-blue-50');
          setTimeout(() => {
            el.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50');
          }, 2000);
        }
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [targetSegmentId]);

  // Keyboard shortcuts (Space, ←/→, J/K, ?, Escape)
  const {
    showFirstTimeTooltip,
    dismissTooltip,
    helpModalOpen,
    closeHelpModal
  } = useKeyboardShortcuts({
    togglePlay,
    seekBack: () => seek(currentTime - 5000),
    seekForward: () => seek(currentTime + 5000),
    openHelp: () => {} // Modal state handled by hook
  });

  // Chat history persistence
  const {
    messages: chatMessages,
    isLoading: chatHistoryLoading,
    hasOlder: chatHasOlder,
    messageCount: chatMessageCount,
    loadOlder: chatLoadOlder,
    refreshCount: chatRefreshCount
  } = useChatHistory({
    conversationId: conversation.conversationId,
    enabled: true
  });

  // Chat sending logic
  const {
    draftInput: chatDraftInput,
    setDraftInput: chatSetDraftInput,
    isLoading: chatIsLoading,
    error: chatError,
    sendMessage: chatSendMessage,
    clearError: chatClearError,
    isAtLimit: chatIsAtLimit
  } = useChat({
    conversationId: conversation.conversationId,
    messageCount: chatMessageCount
  });

  /**
   * Handle speaker rename
   */
  const handleRenameSpeaker = useCallback((speakerId: string) => {
    setEditingSpeakerId(speakerId);
  }, []);

  /**
   * Handle segment speaker reassignment
   * Allows user to change which speaker a specific segment is attributed to
   */
  const handleReassignSpeaker = useCallback((segmentId: string, newSpeakerId: string) => {
    const updatedSegments = conversation.segments.map(seg =>
      seg.segmentId === segmentId
        ? { ...seg, speakerId: newSpeakerId }
        : seg
    );

    const updatedConversation = {
      ...conversation,
      segments: updatedSegments
    };

    setConversation(updatedConversation);
    updateConversation(updatedConversation);

    console.log('[Viewer] Reassigned segment speaker:', {
      segmentId,
      newSpeakerId,
      newSpeakerName: conversation.speakers[newSpeakerId]?.displayName
    });
  }, [conversation, updateConversation]);

  const saveSpeakerName = useCallback((newName: string) => {
    if (editingSpeakerId && newName.trim()) {
      const updatedConversation = {
        ...conversation,
        speakers: {
          ...conversation.speakers,
          [editingSpeakerId]: {
            ...conversation.speakers[editingSpeakerId],
            displayName: newName.trim()
          }
        }
      };

      setConversation(updatedConversation);
      updateConversation(updatedConversation);
    }
    setEditingSpeakerId(null);
  }, [editingSpeakerId, conversation, updateConversation]);

  /**
   * Handle person note updates
   */
  const handleUpdatePerson = useCallback((updatedPerson: Person) => {
    const updatedConversation = {
      ...conversation,
      people: conversation.people.map(p =>
        p.personId === updatedPerson.personId ? updatedPerson : p
      )
    };
    setConversation(updatedConversation);
    updateConversation(updatedConversation);
  }, [conversation, updateConversation]);

  /**
   * Navigate to specific segment (from person mentions)
   */
  const handleNavigateToSegment = useCallback((segmentId: string) => {
    const el = document.getElementById(`segment-${segmentId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  /**
   * Handle timestamp click from chat messages
   * Navigates to segment and seeks audio
   */
  const handleChatTimestampClick = useCallback((segmentId: string, startMs: number) => {
    // Scroll to segment
    handleNavigateToSegment(segmentId);
    // Seek audio to timestamp
    seek(startMs);
  }, [handleNavigateToSegment, seek]);

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <ViewerHeader
        title={conversation.title}
        createdAt={conversation.createdAt}
        isSyncing={isSyncing}
        onBack={onBack}
        onStatsClick={onStatsClick}
        driftCorrectionApplied={driftCorrectionApplied}
        driftRatio={driftRatio}
        driftMs={driftMs}
        alignmentStatus={conversation.alignmentStatus}
        alignmentError={conversation.alignmentError}
      />

      {/* First-time keyboard shortcuts tooltip */}
      {showFirstTimeTooltip && (
        <div className="fixed top-20 right-4 z-40 bg-slate-900 text-white text-sm rounded-lg p-4 shadow-xl max-w-xs animate-in fade-in slide-in-from-right duration-300">
          <div className="flex items-start gap-3">
            <HelpCircle size={20} className="text-blue-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold mb-1">Keyboard Shortcuts Available</p>
              <p className="text-slate-300 text-xs mb-3">
                Use Space to play/pause, arrow keys to seek, and ? to see all shortcuts.
              </p>
              <button
                onClick={dismissTooltip}
                className="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Transcript Area */}
        <TranscriptView
          conversation={conversation}
          activeSegmentIndex={activeSegmentIndex}
          selectedTermId={selectedTermId}
          selectedPersonId={selectedPersonId}
          personOccurrences={personOccurrences}
          onSeek={seek}
          onTermClick={handleTermClickInTranscript}
          onRenameSpeaker={handleRenameSpeaker}
          onReassignSpeaker={handleReassignSpeaker}
        />

        {/* Sidebar (Desktop) */}
        <div className="hidden lg:block w-80 shrink-0 z-10 shadow-xl shadow-slate-200/50">
          <Sidebar
            terms={Object.values(conversation.terms)}
            people={conversation.people || []}
            selectedTermId={selectedTermId}
            selectedPersonId={selectedPersonId}
            onTermSelect={handleTermClickInSidebar}
            onPersonSelect={handlePersonClickInSidebar}
            onUpdatePerson={handleUpdatePerson}
            personMentions={mentionsMap}
            onNavigateToSegment={handleChatTimestampClick}
            // Chat props
            conversationId={conversation.conversationId}
            chatMessages={chatMessages}
            chatMessageCount={chatMessageCount}
            chatDraftInput={chatDraftInput}
            chatSetDraftInput={chatSetDraftInput}
            chatOnSendMessage={chatSendMessage}
            chatIsLoading={chatIsLoading}
            chatIsAtLimit={chatIsAtLimit}
            chatError={chatError}
            chatOnClearError={chatClearError}
            chatOnClearHistoryComplete={chatRefreshCount}
            chatHasOlderMessages={chatHasOlder}
            chatOnLoadOlder={chatLoadOlder}
            chatIsLoadingOlder={chatHistoryLoading}
            conversationTitle={conversation.title}
            conversationDurationMs={conversation.durationMs}
            speakers={conversation.speakers}
          />
        </div>
      </div>

      {/* Footer Player */}
      <AudioPlayer
        currentTimeMs={currentTime}
        durationMs={duration}
        isPlaying={isPlaying}
        onPlayPause={togglePlay}
        onSeek={seek}
        onScrub={scrub}
        syncOffset={syncOffset}
        onSyncOffsetChange={setSyncOffset}
      />

      {/* Rename Speaker Modal */}
      {editingSpeakerId && (
        <RenameSpeakerModal
          initialName={conversation.speakers[editingSpeakerId].displayName}
          onClose={() => setEditingSpeakerId(null)}
          onSave={saveSpeakerName}
        />
      )}

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={helpModalOpen}
        onClose={closeHelpModal}
      />
    </div>
  );
};
