import { Conversation } from './types';

export const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const cn = (...classes: (string | undefined | null | false)[]) => {
  return classes.filter(Boolean).join(' ');
};

/**
 * Creates a placeholder conversation for testing/development.
 * In production, conversations are created by the Cloud Function after audio upload.
 */
export const createMockConversation = (file: File): Conversation => {
  return {
    conversationId: `c_${Date.now()}`,
    userId: 'local', // Placeholder - will be set by ConversationContext
    title: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    durationMs: 12500, // Mock duration
    status: 'processing', // Will be updated to 'complete' by Cloud Function
    speakers: {
      'spk_a': { speakerId: 'spk_a', displayName: 'Host', colorIndex: 0 },
      'spk_b': { speakerId: 'spk_b', displayName: 'Guest', colorIndex: 1 },
    },
    terms: {},
    termOccurrences: [],
    topics: [
      { topicId: 'top_new', title: 'Introduction', startIndex: 0, endIndex: 0, type: 'main' }
    ],
    people: [],
    segments: [
      {
        segmentId: 'seg_new_1',
        index: 0,
        speakerId: 'spk_a',
        startMs: 0,
        endMs: 5000,
        text: `Processing audio file "${file.name}"...`
      }
    ]
  };
};
