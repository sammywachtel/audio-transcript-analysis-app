/**
 * Process Transcription HTTP Function
 *
 * Long-running HTTP function invoked by Cloud Tasks to process audio transcription.
 * Receives a queued job from the storage trigger and performs the full transcription pipeline:
 * 1. Downloads audio from Storage
 * 2. Calls Gemini for pre-analysis (speaker hints)
 * 3. Calls WhisperX for transcription + alignment
 * 4. Calls Gemini for content analysis (topics, terms, people)
 * 5. Saves results to Firestore
 *
 * This function has a 60-minute timeout (vs 9-minute limit for storage triggers)
 * to handle large audio files (46MB+) that can take 10-15+ minutes to process.
 *
 * Cloud Tasks provides automatic retry with exponential backoff on 500 errors.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './index';
import { executeTranscriptionPipeline } from './transcribe';

// Define secrets (same as transcribeAudio - needed for heavy processing)
const replicateApiToken = defineSecret('REPLICATE_API_TOKEN');
const huggingfaceAccessToken = defineSecret('HUGGINGFACE_ACCESS_TOKEN');

/**
 * Cloud Tasks payload for transcription job
 */
interface TranscriptionTaskPayload {
  conversationId: string;
  userId: string;
  filePath: string;
}

/**
 * HTTP function invoked by Cloud Tasks to process audio transcription.
 *
 * Security: Only accepts requests from Cloud Tasks (x-cloudtasks-taskname header).
 * Returns 200 on success (Cloud Tasks won't retry).
 * Returns 500 on failure (Cloud Tasks will retry with backoff).
 */
export const processTranscription = onRequest(
  {
    memory: '1GiB',
    timeoutSeconds: 3600, // 60 minutes (enough for large files)
    region: 'us-central1',
    invoker: 'private', // Only Cloud Tasks can call this
    secrets: [replicateApiToken, huggingfaceAccessToken]
  },
  async (req, res) => {
    // Validate Cloud Tasks header (security check - prevents direct invocation)
    const taskName = req.headers['x-cloudtasks-taskname'];
    if (!taskName && process.env.K_SERVICE) { // K_SERVICE is set in Cloud Run
      console.error('[ProcessTranscription] Forbidden: Direct invocation not allowed');
      res.status(403).send('Forbidden: Direct invocation not allowed');
      return;
    }

    console.log('[ProcessTranscription] Task started:', {
      taskName,
      timestamp: new Date().toISOString()
    });

    // Parse request payload
    let payload: TranscriptionTaskPayload;
    try {
      payload = req.body as TranscriptionTaskPayload;

      if (!payload.conversationId || !payload.userId || !payload.filePath) {
        throw new Error('Missing required fields: conversationId, userId, or filePath');
      }

      console.log('[ProcessTranscription] Processing task:', {
        conversationId: payload.conversationId,
        userId: payload.userId,
        filePath: payload.filePath
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid request payload';
      console.error('[ProcessTranscription] Invalid payload:', errorMessage);
      res.status(400).send(`Bad Request: ${errorMessage}`);
      return;
    }

    const { conversationId, userId, filePath } = payload;

    try {
      // Update Firestore to mark processing started
      await db.collection('conversations').doc(conversationId).update({
        status: 'processing',
        processingStartedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log('[ProcessTranscription] Starting transcription pipeline...');

      // Execute the full transcription pipeline (shared with transcribeAudio)
      // This is the heavy processing that was extracted from transcribeAudio
      await executeTranscriptionPipeline({
        conversationId,
        userId,
        filePath,
        replicateApiToken: replicateApiToken.value(),
        huggingfaceAccessToken: huggingfaceAccessToken.value()
      });

      console.log('[ProcessTranscription] ✅ Task completed successfully:', { conversationId });

      // Return 200 so Cloud Tasks doesn't retry
      res.status(200).send('OK');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error('[ProcessTranscription] ❌ Task failed:', {
        conversationId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });

      // Update Firestore to mark processing failed
      // (executeTranscriptionPipeline may have already done this, but being safe)
      try {
        await db.collection('conversations').doc(conversationId).update({
          status: 'failed',
          processingError: errorMessage,
          updatedAt: FieldValue.serverTimestamp()
        });
      } catch (updateError) {
        console.error('[ProcessTranscription] Failed to update Firestore status:', updateError);
      }

      // Return 500 so Cloud Tasks will retry
      res.status(500).send(`Internal Server Error: ${errorMessage}`);
    }
  }
);
