/**
 * Get Signed Audio URL Cloud Function
 *
 * Generates a signed download URL for an audio file.
 * Called by the client to get a fresh URL for playback.
 *
 * This is an alternative to client-side getDownloadURL() that gives us
 * more control over URL expiration and access logging.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, bucket } from './index';

interface GetAudioUrlRequest {
  conversationId: string;
}

interface GetAudioUrlResponse {
  url: string;
  expiresAt: string;
}

/**
 * Get a signed URL for audio playback
 *
 * Security:
 * - Requires authentication
 * - Verifies user owns the conversation
 * - Returns time-limited URL (1 hour)
 */
export const getSignedAudioUrl = onCall<GetAudioUrlRequest>(
  {
    region: 'us-central1',
    memory: '256MiB'
  },
  async (request): Promise<GetAudioUrlResponse> => {
    // Require authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in to access audio');
    }

    const { conversationId } = request.data;
    const userId = request.auth.uid;

    if (!conversationId) {
      throw new HttpsError('invalid-argument', 'conversationId is required');
    }

    // Verify user owns the conversation
    const conversationDoc = await db.collection('conversations').doc(conversationId).get();

    if (!conversationDoc.exists) {
      throw new HttpsError('not-found', 'Conversation not found');
    }

    const conversationData = conversationDoc.data();

    if (conversationData?.userId !== userId) {
      throw new HttpsError('permission-denied', 'You do not have access to this conversation');
    }

    const audioStoragePath = conversationData?.audioStoragePath;

    if (!audioStoragePath) {
      throw new HttpsError('not-found', 'No audio file associated with this conversation');
    }

    // Generate signed URL (expires in 1 hour)
    const file = bucket.file(audioStoragePath);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    try {
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: expiresAt
      });

      console.log('Generated signed URL for audio:', {
        conversationId,
        userId,
        path: audioStoragePath,
        expiresAt: expiresAt.toISOString()
      });

      return {
        url,
        expiresAt: expiresAt.toISOString()
      };
    } catch (error) {
      console.error('Failed to generate signed URL:', {
        conversationId,
        path: audioStoragePath,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new HttpsError('internal', 'Failed to generate audio URL');
    }
  }
);
