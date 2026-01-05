/**
 * LLM Metadata Utilities
 *
 * Builds label payloads for Gemini API calls to enable billing reconciliation.
 * Labels allow joining BigQuery billing exports to specific conversations.
 *
 * Uses Vertex AI SDK (@google-cloud/vertexai) which supports request-level labels.
 * Labels are attached to every generateContent call and appear in BigQuery billing
 * exports for automatic cost attribution.
 */

/**
 * Labels to attach to Gemini API calls for billing attribution.
 *
 * These labels appear in BigQuery billing exports via the Vertex AI SDK,
 * enabling automatic cost attribution and reconciliation.
 */
export interface GeminiLabels extends Record<string, string> {
  conversation_id: string;
  user_id: string;
  call_type:
    | 'pre_analysis'          // Gemini analyzes audio before WhisperX
    | 'fallback_transcription' // Gemini transcription when WhisperX fails
    | 'analysis'              // Post-transcription content analysis (fallback path)
    | 'speaker_identification' // Identify speakers from transcript content
    | 'speaker_correction'    // Reassign speaker labels
    | 'chat';                 // User chat queries
  environment: string;
}

/**
 * Build labels for a Gemini API call.
 *
 * @param conversationId - The conversation being processed
 * @param userId - The user who owns the conversation
 * @param callType - The type of Gemini call (for cost attribution)
 * @returns Labels object ready for API call (when SDK supports it)
 *
 * @example
 * ```typescript
 * const labels = buildGeminiLabels(conversationId, userId, 'pre_analysis');
 * const result = await model.generateContent({
 *   contents: [{ role: 'user', parts: [{ text: prompt }] }],
 *   labels
 * });
 * ```
 */
export function buildGeminiLabels(
  conversationId: string,
  userId: string,
  callType: GeminiLabels['call_type']
): GeminiLabels {
  return {
    conversation_id: conversationId,
    user_id: userId,
    call_type: callType,
    // NODE_ENV isn't set by Firebase Functions by default, so default to 'production'
    // In local emulator, you can set FUNCTIONS_EMULATOR=true
    environment: process.env.FUNCTIONS_EMULATOR === 'true'
      ? 'emulator'
      : (process.env.NODE_ENV ?? 'production')
  };
}

/**
 * Type guard to check if labels are valid.
 * Useful for validation before storing in Firestore.
 */
export function isValidGeminiLabels(labels: unknown): labels is GeminiLabels {
  if (typeof labels !== 'object' || labels === null) {
    return false;
  }
  const l = labels as Record<string, unknown>;
  return (
    typeof l.conversation_id === 'string' &&
    typeof l.user_id === 'string' &&
    typeof l.call_type === 'string' &&
    typeof l.environment === 'string'
  );
}

/**
 * Valid call types for type-safe usage.
 */
export const GEMINI_CALL_TYPES = [
  'pre_analysis',
  'fallback_transcription',
  'analysis',
  'speaker_identification',
  'speaker_correction',
  'chat'
] as const;

export type GeminiCallType = typeof GEMINI_CALL_TYPES[number];
