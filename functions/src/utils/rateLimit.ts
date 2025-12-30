/**
 * Rate Limiting for Chat Queries
 *
 * Implements Firestore-backed rate limiting to prevent abuse:
 * - 20 queries per conversation per day per user
 * - Uses UTC date buckets for consistency
 * - Atomic increment to avoid race conditions
 *
 * Storage pattern: _chat_rate_limits/{conversationId}_{userId}_{YYYY-MM-DD}
 * This avoids Firestore hot spots by distributing writes across documents.
 */

import { db } from '../index';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Maximum queries allowed per conversation per day per user
 */
const MAX_QUERIES_PER_DAY = 20;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Check rate limit and increment query count atomically
 *
 * @param conversationId - Conversation being queried
 * @param userId - User making the query
 * @returns Whether the query is allowed and remaining quota
 */
export async function checkAndIncrementRateLimit(
  conversationId: string,
  userId: string
): Promise<RateLimitResult> {
  const dateBucket = getCurrentDateBucket();
  const docId = `${conversationId}_${userId}_${dateBucket}`;
  const docRef = db.collection('_chat_rate_limits').doc(docId);

  // Use transaction for atomic read-increment-write
  const result = await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);

    if (!doc.exists) {
      // First query of the day - create the document
      transaction.set(docRef, {
        conversationId,
        userId,
        dateBucket,
        queryCount: 1,
        firstQueryAt: FieldValue.serverTimestamp(),
        lastQueryAt: FieldValue.serverTimestamp()
      });

      return {
        allowed: true,
        remaining: MAX_QUERIES_PER_DAY - 1,
        resetAt: getNextResetDate()
      };
    }

    const data = doc.data();
    const currentCount = data?.queryCount || 0;

    if (currentCount >= MAX_QUERIES_PER_DAY) {
      // Rate limit exceeded
      return {
        allowed: false,
        remaining: 0,
        resetAt: getNextResetDate()
      };
    }

    // Increment the counter
    transaction.update(docRef, {
      queryCount: FieldValue.increment(1),
      lastQueryAt: FieldValue.serverTimestamp()
    });

    return {
      allowed: true,
      remaining: MAX_QUERIES_PER_DAY - currentCount - 1,
      resetAt: getNextResetDate()
    };
  });

  return result;
}

/**
 * Get current date bucket in UTC (YYYY-MM-DD format)
 *
 * Using UTC ensures consistent behavior across timezones.
 * All users' daily limits reset at midnight UTC.
 */
function getCurrentDateBucket(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the next reset date (midnight UTC tomorrow)
 */
function getNextResetDate(): Date {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0
    )
  );
  return tomorrow;
}

/**
 * Get current query count for a user/conversation (for monitoring)
 *
 * @param conversationId - Conversation ID
 * @param userId - User ID
 * @returns Current query count and remaining quota
 */
export async function getCurrentUsage(
  conversationId: string,
  userId: string
): Promise<{ used: number; remaining: number }> {
  const dateBucket = getCurrentDateBucket();
  const docId = `${conversationId}_${userId}_${dateBucket}`;
  const docRef = db.collection('_chat_rate_limits').doc(docId);

  const doc = await docRef.get();

  if (!doc.exists) {
    return {
      used: 0,
      remaining: MAX_QUERIES_PER_DAY
    };
  }

  const data = doc.data();
  const used = data?.queryCount || 0;

  return {
    used,
    remaining: Math.max(0, MAX_QUERIES_PER_DAY - used)
  };
}
