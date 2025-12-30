/**
 * Tests for chat utility functions
 *
 * Verifies prompt building, timestamp validation, and metrics calculation.
 * Not testing the full Cloud Function (requires Firebase emulator),
 * just the core utility logic.
 */

import { describe, it, expect } from '@jest/globals';
import { buildChatPrompt } from '../utils/promptBuilder';
import { validateTimestampSources, extractSegmentIndices } from '../utils/timestampValidation';
import { calculateChatCost, classifyQueryType } from '../utils/chatMetrics';
import type { Conversation, Segment, Speaker } from '../../../types';

describe('Chat Utilities', () => {
  describe('buildChatPrompt', () => {
    it('should include transcript segments in the prompt', () => {
      const conversation: Partial<Conversation> = {
        segments: [
          { segmentId: 's1', index: 0, speakerId: 'sp1', startMs: 0, endMs: 5000, text: 'Hello world' },
          { segmentId: 's2', index: 1, speakerId: 'sp2', startMs: 5000, endMs: 10000, text: 'How are you?' }
        ] as Segment[],
        speakers: {
          sp1: { speakerId: 'sp1', displayName: 'Alice', colorIndex: 0 },
          sp2: { speakerId: 'sp2', displayName: 'Bob', colorIndex: 1 }
        } as Record<string, Speaker>,
        topics: [],
        terms: {},
        people: []
      };

      const prompt = buildChatPrompt(conversation as Conversation, 'What did they discuss?');

      expect(prompt).toContain('Hello world');
      expect(prompt).toContain('How are you?');
      expect(prompt).toContain('Alice');
      expect(prompt).toContain('Bob');
      expect(prompt).toContain('What did they discuss?');
    });

    it('should require timestamp citations in system instructions', () => {
      const conversation: Partial<Conversation> = {
        segments: [] as Segment[],
        speakers: {},
        topics: [],
        terms: {},
        people: []
      };

      const prompt = buildChatPrompt(conversation as Conversation, 'test question');

      expect(prompt.toLowerCase()).toContain('timestamp');
      expect(prompt.toLowerCase()).toContain('segment');
    });
  });

  describe('validateTimestampSources', () => {
    const segments: Segment[] = [
      { segmentId: 's1', index: 0, speakerId: 'sp1', startMs: 0, endMs: 5000, text: 'First segment' },
      { segmentId: 's2', index: 1, speakerId: 'sp2', startMs: 5000, endMs: 10000, text: 'Second segment' },
      { segmentId: 's3', index: 2, speakerId: 'sp1', startMs: 10000, endMs: 15000, text: 'Third segment' }
    ];

    it('should validate sources by segment index', () => {
      const rawSources = [
        { segmentIndex: 0 },
        { segmentIndex: 2 }
      ];

      const validated = validateTimestampSources(rawSources, segments);

      expect(validated).toHaveLength(2);
      expect(validated[0].segmentId).toBe('s1');
      expect(validated[0].confidence).toBe('high');
      expect(validated[1].segmentId).toBe('s3');
    });

    it('should filter out invalid segment indices', () => {
      const rawSources = [
        { segmentIndex: 0 },
        { segmentIndex: 99 }  // Invalid index
      ];

      const validated = validateTimestampSources(rawSources, segments);

      expect(validated).toHaveLength(1);
      expect(validated[0].segmentId).toBe('s1');
    });

    it('should validate sources by timestamp with tolerance', () => {
      const rawSources = [
        { startMs: 100, endMs: 4900 }  // Close to segment 0 (0-5000)
      ];

      const validated = validateTimestampSources(rawSources, segments);

      expect(validated).toHaveLength(1);
      expect(validated[0].segmentId).toBe('s1');
      expect(validated[0].confidence).toBe('high');  // Within 100ms tolerance
    });
  });

  describe('extractSegmentIndices', () => {
    it('should extract segment indices from text', () => {
      const text = 'According to [Segment 5] and segment 10, the answer is clear.';
      const indices = extractSegmentIndices(text);

      expect(indices).toEqual([5, 10]);
    });

    it('should handle multiple formats', () => {
      const text = '[Segment 3: 1:23-1:45] mentions this, and Segment 7 confirms it.';
      const indices = extractSegmentIndices(text);

      expect(indices).toEqual([3, 7]);
    });

    it('should deduplicate indices', () => {
      const text = 'Segment 5, segment 5, and [Segment 5] all say the same thing.';
      const indices = extractSegmentIndices(text);

      expect(indices).toEqual([5]);
    });
  });

  describe('calculateChatCost', () => {
    it('should calculate cost based on token usage', () => {
      const tokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'gemini-2.5-flash'
      };

      const cost = calculateChatCost(tokenUsage);

      // Expected: (1000/1M * 0.075) + (500/1M * 0.30) = 0.000075 + 0.00015 = 0.000225
      expect(cost).toBeCloseTo(0.000225, 6);
    });

    it('should handle zero tokens', () => {
      const tokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        model: 'gemini-2.5-flash'
      };

      const cost = calculateChatCost(tokenUsage);

      expect(cost).toBe(0);
    });
  });

  describe('classifyQueryType', () => {
    it('should classify follow-up questions', () => {
      expect(classifyQueryType('Also, what about pricing?')).toBe('follow_up');
      expect(classifyQueryType('And what else did they mention?')).toBe('follow_up');
      expect(classifyQueryType('What about the timeline?')).toBe('follow_up');
      expect(classifyQueryType('Tell me more about that.')).toBe('follow_up');
    });

    it('should classify initial questions', () => {
      expect(classifyQueryType('What is the main topic?')).toBe('question');
      expect(classifyQueryType('Who attended the meeting?')).toBe('question');
      expect(classifyQueryType('Summarize the discussion.')).toBe('question');
    });
  });
});
