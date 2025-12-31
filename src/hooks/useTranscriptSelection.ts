import { useState, useCallback } from 'react';
import { TermOccurrence } from '@/config/types';

interface UseTranscriptSelectionOptions {
  termOccurrences: TermOccurrence[];
  personMentions?: Record<string, string[]>; // personId -> array of segmentIds
}

interface UseTranscriptSelectionReturn {
  // State
  selectedTermId: string | undefined;
  selectedPersonId: string | undefined;

  // Actions
  selectTerm: (termId: string) => void;
  selectPerson: (personId: string) => void;
  clearSelection: () => void;

  // Two-way sync helpers
  handleTermClickInTranscript: (termId: string) => void;
  handleTermClickInSidebar: (termId: string) => void;
  handlePersonClickInSidebar: (personId: string) => void;
}

/**
 * useTranscriptSelection - Manages selected terms/people and two-way sync
 *
 * Handles the bidirectional sync between transcript and sidebar:
 * - Click term in transcript → select card in sidebar
 * - Click card in sidebar → jump to first occurrence in transcript
 *
 * Extracted from Viewer to separate concerns and make the logic testable.
 */
export const useTranscriptSelection = (
  options: UseTranscriptSelectionOptions
): UseTranscriptSelectionReturn => {
  const { termOccurrences, personMentions = {} } = options;

  const [selectedTermId, setSelectedTermId] = useState<string | undefined>(undefined);
  const [selectedPersonId, setSelectedPersonId] = useState<string | undefined>(undefined);

  const selectTerm = useCallback((termId: string) => {
    setSelectedTermId(termId);
    setSelectedPersonId(undefined); // Clear person selection when selecting term
  }, []);

  const selectPerson = useCallback((personId: string) => {
    setSelectedPersonId(personId);
    setSelectedTermId(undefined); // Clear term selection when selecting person
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTermId(undefined);
    setSelectedPersonId(undefined);
  }, []);

  /**
   * Handle term click in transcript → scroll to sidebar card
   */
  const handleTermClickInTranscript = useCallback((termId: string) => {
    selectTerm(termId);

    // Scroll sidebar to the card
    const card = document.getElementById(`term-card-${termId}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectTerm]);

  /**
   * Handle term click in sidebar → scroll to first occurrence in transcript
   */
  const handleTermClickInSidebar = useCallback((termId: string) => {
    selectTerm(termId);

    // Find first occurrence
    const occurrence = termOccurrences.find(o => o.termId === termId);
    if (occurrence) {
      const segmentEl = document.getElementById(`segment-${occurrence.segmentId}`);
      if (segmentEl) {
        segmentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectTerm, termOccurrences]);

  /**
   * Handle person click in sidebar → scroll to first mention in transcript
   * Additional mentions can be navigated via the PersonCard's arrow buttons
   */
  const handlePersonClickInSidebar = useCallback((personId: string) => {
    selectPerson(personId);

    // Navigate to first mention
    const mentions = personMentions[personId];
    if (mentions && mentions.length > 0) {
      const firstSegmentId = mentions[0];
      const segmentEl = document.getElementById(`segment-${firstSegmentId}`);
      if (segmentEl) {
        segmentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectPerson, personMentions]);

  return {
    selectedTermId,
    selectedPersonId,
    selectTerm,
    selectPerson,
    clearSelection,
    handleTermClickInTranscript,
    handleTermClickInSidebar,
    handlePersonClickInSidebar
  };
};
