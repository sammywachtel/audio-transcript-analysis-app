/**
 * Transcription Cloud Function
 *
 * Triggered when an audio file is uploaded to Firebase Storage.
 * 1. Downloads the audio file
 * 2. Sends it to Gemini API for transcription
 * 3. Saves the results to Firestore
 *
 * The Gemini API key is stored as a Firebase secret (not in client code).
 * This keeps it secure from being exposed in the browser.
 */

import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { FieldValue } from 'firebase-admin/firestore';
import { db, bucket } from './index';
import { ProgressManager, ProcessingStep } from './progressManager';
import { transcribeWithWhisperX, transcribeWithWhisperXRobust, WhisperXSegment, WhisperXDiarizationHints } from './alignment';
import {
  recordMetrics,
  calculateCost,
  GeminiUsage,
  LLMUsage
} from './metrics';
import { recordUserEvent } from './userEvents';

// Define secrets (set via: firebase functions:secrets:set <SECRET_NAME>)
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const replicateApiToken = defineSecret('REPLICATE_API_TOKEN');
const huggingfaceAccessToken = defineSecret('HUGGINGFACE_ACCESS_TOKEN');  // For speaker diarization

/**
 * Custom error for abort requests - allows clean exit from processing
 */
class AbortRequestedError extends Error {
  constructor(conversationId: string) {
    super(`Processing aborted by user for conversation ${conversationId}`);
    this.name = 'AbortRequestedError';
  }
}

/**
 * Check if abort has been requested for this conversation.
 * Throws AbortRequestedError if abort flag is set.
 */
async function checkAbort(conversationId: string): Promise<void> {
  const doc = await db.collection('conversations').doc(conversationId).get();
  if (doc.exists && doc.data()?.abortRequested === true) {
    console.log('[Transcribe] Abort requested, stopping processing:', { conversationId });
    throw new AbortRequestedError(conversationId);
  }
}

/**
 * Retry an operation with exponential backoff.
 * Useful for transient Firestore timeouts (DEADLINE_EXCEEDED).
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries = 3,
  baseDelayMs = 2000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRetryable = errorMessage.includes('DEADLINE_EXCEEDED') ||
                          errorMessage.includes('UNAVAILABLE') ||
                          errorMessage.includes('RESOURCE_EXHAUSTED');

      if (!isRetryable || attempt === maxRetries) {
        console.error(`[Retry] ${operationName} failed after ${attempt} attempts:`, errorMessage);
        throw error;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[Retry] ${operationName} attempt ${attempt} failed, retrying in ${delay}ms...`, {
        error: errorMessage,
        attempt,
        maxRetries,
        delayMs: delay
      });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error(`${operationName} failed after ${maxRetries} retries`);
}

// Gemini analysis-only response (analyzes WhisperX transcript)
interface GeminiAnalysis {
  title: string;
  topics: { title: string; startSegmentIndex: number; endSegmentIndex: number; type: 'main' | 'tangent' }[];
  terms: { id: string; term: string; definition: string; aliases: string[] }[];
  people: { name: string; affiliation: string }[];
  speakerNotes?: {
    speakerId: string;
    inferredName?: string;  // Real name if speaker introduces themselves
    role?: string;          // e.g., "host", "guest", "interviewer"
    notes?: string;         // Additional context
  }[];
}

/**
 * Result from Gemini analysis including token usage for cost tracking
 */
interface GeminiAnalysisResult {
  analysis: GeminiAnalysis;
  tokenUsage: GeminiUsage;
}

/**
 * Result from speaker correction analysis including token usage
 */
interface SpeakerCorrectionResult {
  corrections: SpeakerCorrection[];
  tokenUsage: GeminiUsage;
}

interface Speaker {
  speakerId: string;
  displayName: string;
  colorIndex: number;
}

interface Segment {
  segmentId: string;
  index: number;
  speakerId: string;
  startMs: number;
  endMs: number;
  text: string;
}

interface Term {
  termId: string;
  key: string;
  display: string;
  definition: string;
  aliases: string[];
}

interface TermOccurrence {
  occurrenceId: string;
  termId: string;
  segmentId: string;
  startChar: number;
  endChar: number;
}

interface Topic {
  topicId: string;
  title: string;
  startIndex: number;
  endIndex: number;
  type: 'main' | 'tangent';
  parentTopicId?: string;
}

interface Person {
  personId: string;
  name: string;
  affiliation?: string;
  userNotes?: string;
}

/**
 * Represents a speaker correction identified by Gemini analysis.
 * Used to fix mid-segment speaker changes that pyannote misses.
 */
interface SpeakerCorrection {
  segmentIndex: number;
  action: 'split' | 'reassign';
  reason: string;
  // For split action:
  splitAtChar?: number;
  speakerBefore?: string;
  speakerAfter?: string;
  // For reassign action:
  newSpeaker?: string;
}

/**
 * Hints for WhisperX diarization, extracted from Gemini pre-analysis.
 * Passing num_speakers and speaker names improves diarization accuracy.
 */
interface WhisperXHints {
  numSpeakers?: number;
  speakerNames?: string[];  // e.g., ["Jimmy", "Bill"] for the prompt parameter
}

/**
 * Result from Gemini pre-analysis of audio.
 * Provides speaker hints for WhisperX AND full content analysis in one pass.
 */
interface GeminiPreAnalysisResult {
  hints: WhisperXHints;
  analysis: GeminiAnalysis;
  tokenUsage: GeminiUsage;
}

/**
 * Pre-analyze audio with Gemini to extract speaker hints and content analysis.
 *
 * This runs BEFORE WhisperX to:
 * 1. Determine speaker count and names (hints for better diarization)
 * 2. Extract terms, topics, people (full analysis - saves a second Gemini call)
 *
 * By front-loading analysis, we avoid wasting WhisperX compute on broken diarization.
 */
async function preAnalyzeAudioWithGemini(
  audioBuffer: Buffer,
  apiKey: string
): Promise<GeminiPreAnalysisResult> {
  console.log('[Gemini Pre-Analysis] Starting audio analysis for speaker hints + content...');
  const startTime = Date.now();

  const genAI = new GoogleGenerativeAI(apiKey);

  // Use gemini-2.5-flash for audio analysis
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          // Speaker hints for WhisperX
          speakerCount: { type: SchemaType.INTEGER },
          speakers: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                id: { type: SchemaType.STRING },  // SPEAKER_00, SPEAKER_01, etc.
                name: { type: SchemaType.STRING }, // Inferred name if mentioned
                role: { type: SchemaType.STRING }  // host, guest, interviewer, etc.
              },
              required: ['id']
            }
          },
          // Full content analysis (same as existing GeminiAnalysis)
          title: { type: SchemaType.STRING },
          topics: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                title: { type: SchemaType.STRING },
                startApproxSeconds: { type: SchemaType.NUMBER },
                endApproxSeconds: { type: SchemaType.NUMBER },
                type: { type: SchemaType.STRING }
              },
              required: ['title', 'type']
            }
          },
          terms: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                term: { type: SchemaType.STRING },
                definition: { type: SchemaType.STRING },
                aliases: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
              },
              required: ['term', 'definition']
            }
          },
          people: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                name: { type: SchemaType.STRING },
                affiliation: { type: SchemaType.STRING }
              },
              required: ['name']
            }
          }
        },
        required: ['speakerCount', 'speakers', 'title', 'topics', 'terms', 'people']
      }
    }
  });

  // Convert audio to base64
  const audioBase64 = audioBuffer.toString('base64');

  // Detect MIME type
  let mimeType = 'audio/mpeg';
  if (audioBuffer[0] === 0x52 && audioBuffer[1] === 0x49) {
    mimeType = 'audio/wav';
  } else if (audioBuffer[0] === 0x4F && audioBuffer[1] === 0x67) {
    mimeType = 'audio/ogg';
  }

  const prompt = `
Analyze this audio file and extract the following information:

## Speaker Analysis (CRITICAL - be accurate about speaker count)
1. How many distinct speakers are in this audio? Count carefully.
2. For each speaker, provide:
   - id: Use format SPEAKER_00, SPEAKER_01, etc.
   - name: If the speaker introduces themselves or is addressed by name, provide it
   - role: If apparent (e.g., "host", "guest", "interviewer", "expert")

## Content Analysis
3. title: A descriptive title for this conversation/audio
4. topics: Major topics discussed, with approximate start/end times in seconds and type ("main" or "tangent")
5. terms: Technical terms, jargon, or concepts that warrant definition
6. people: People MENTIONED in the conversation (NOT the speakers themselves)

Important:
- Be conservative with speaker count - don't hallucinate extra speakers
- Only include people in the "people" array if they are MENTIONED, not if they are speaking
- For terms, focus on domain-specific vocabulary that a listener might need explained
`;

  console.log('[Gemini Pre-Analysis] Sending audio to Gemini...');

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType,
        data: audioBase64
      }
    }
  ]);

  const durationMs = Date.now() - startTime;
  const responseText = result.response.text();

  // Extract token usage
  const usageMetadata = result.response.usageMetadata;
  const tokenUsage: GeminiUsage = {
    inputTokens: usageMetadata?.promptTokenCount || 0,
    outputTokens: usageMetadata?.candidatesTokenCount || 0,
    model: 'gemini-2.5-flash'
  };

  console.log(`[Gemini Pre-Analysis] Response received in ${(durationMs / 1000).toFixed(1)}s`, {
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens
  });

  // Parse response
  const cleanJson = responseText.replace(/```json\s*|\s*```/g, '').trim();
  const parsed = JSON.parse(cleanJson) as {
    speakerCount: number;
    speakers: Array<{ id: string; name?: string; role?: string }>;
    title: string;
    topics: Array<{ title: string; startApproxSeconds?: number; endApproxSeconds?: number; type: string }>;
    terms: Array<{ term: string; definition: string; aliases?: string[] }>;
    people: Array<{ name: string; affiliation?: string }>;
  };

  // Build WhisperX hints
  const speakerNames = parsed.speakers
    .filter(s => s.name)
    .map(s => s.name as string);

  const hints: WhisperXHints = {
    numSpeakers: parsed.speakerCount,
    speakerNames: speakerNames.length > 0 ? speakerNames : undefined
  };

  // Convert to GeminiAnalysis format (topics need segment indices, which we'll map later)
  const analysis: GeminiAnalysis = {
    title: parsed.title,
    // Topics will be remapped to segment indices after WhisperX provides timestamps
    topics: parsed.topics.map((t, idx) => ({
      title: t.title,
      startSegmentIndex: 0,  // Will be mapped after WhisperX
      endSegmentIndex: 0,    // Will be mapped after WhisperX
      type: t.type === 'tangent' ? 'tangent' as const : 'main' as const,
      // Store approximate times for later mapping
      _startApproxSeconds: t.startApproxSeconds,
      _endApproxSeconds: t.endApproxSeconds
    } as GeminiAnalysis['topics'][0] & { _startApproxSeconds?: number; _endApproxSeconds?: number })),
    terms: parsed.terms.map(t => ({
      id: `term_${t.term.toLowerCase().replace(/\s+/g, '_')}`,
      term: t.term,
      definition: t.definition,
      aliases: t.aliases || []
    })),
    people: parsed.people.map(p => ({
      name: p.name,
      affiliation: p.affiliation || ''
    })),
    speakerNotes: parsed.speakers.map(s => ({
      speakerId: s.id,
      inferredName: s.name,
      role: s.role
    }))
  };

  console.log('[Gemini Pre-Analysis] ✅ Analysis complete:', {
    speakerCount: hints.numSpeakers,
    speakerNames: hints.speakerNames,
    topicCount: analysis.topics.length,
    termCount: analysis.terms.length,
    peopleCount: analysis.people.length
  });

  return { hints, analysis, tokenUsage };
}

/**
 * Fallback transcription using Gemini when WhisperX fails.
 * Uses Gemini's audio understanding capabilities for transcription.
 * Note: Timestamps are approximate (Gemini estimates, not word-level).
 */
async function transcribeWithGeminiFallback(
  audioBuffer: Buffer,
  apiKey: string
): Promise<{ segments: WhisperXSegment[]; status: 'success' | 'error'; error?: string; usedFallback?: boolean }> {
  console.log('[Gemini Fallback] Starting transcription...');

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    // Use gemini-2.5-flash for transcription (supports audio)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            segments: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  text: { type: SchemaType.STRING },
                  startSeconds: { type: SchemaType.NUMBER },
                  endSeconds: { type: SchemaType.NUMBER },
                  speaker: { type: SchemaType.STRING }
                },
                required: ['text', 'startSeconds', 'endSeconds']
              }
            }
          },
          required: ['segments']
        }
      }
    });

    // Convert audio to base64 for Gemini
    const audioBase64 = audioBuffer.toString('base64');

    // Detect MIME type from buffer (simplified - assume common formats)
    let mimeType = 'audio/mpeg'; // Default
    if (audioBuffer[0] === 0x52 && audioBuffer[1] === 0x49) { // RIFF header
      mimeType = 'audio/wav';
    } else if (audioBuffer[0] === 0x4F && audioBuffer[1] === 0x67) { // OggS
      mimeType = 'audio/ogg';
    }

    const prompt = `
Transcribe this audio file into segments. For each segment, provide:
- The spoken text
- Approximate start time in seconds
- Approximate end time in seconds
- Speaker label if you can identify different speakers (use "SPEAKER_00", "SPEAKER_01", etc.)

Focus on accuracy of the transcription. Timestamps should be your best estimate.
Group related sentences into segments (typically 1-4 sentences per segment).
If you detect multiple speakers, assign consistent speaker labels throughout.

Return as JSON with a "segments" array.
`;

    console.log('[Gemini Fallback] Sending audio to Gemini...');
    const startTime = Date.now();

    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType,
          data: audioBase64
        }
      }
    ]);

    const durationMs = Date.now() - startTime;
    const responseText = result.response.text();

    console.log(`[Gemini Fallback] Response received in ${(durationMs / 1000).toFixed(1)}s`);

    // Parse the response
    const cleanJson = responseText.replace(/```json\s*|\s*```/g, '').trim();
    const parsed = JSON.parse(cleanJson) as {
      segments: Array<{
        text: string;
        startSeconds: number;
        endSeconds: number;
        speaker?: string;
      }>;
    };

    // Convert to WhisperXSegment format
    const segments: WhisperXSegment[] = parsed.segments.map(seg => ({
      text: seg.text,
      start: seg.startSeconds,
      end: seg.endSeconds,
      speaker: seg.speaker
    }));

    console.log(`[Gemini Fallback] ✅ Transcribed ${segments.length} segments`);

    return {
      segments,
      status: 'success',
      usedFallback: true
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Gemini Fallback] ❌ Transcription failed: ${errorMsg}`);

    return {
      segments: [],
      status: 'error',
      error: `Gemini transcription failed: ${errorMsg}`
    };
  }
}

/**
 * Triggered when an audio file is uploaded to storage.
 * Path pattern: audio/{userId}/{conversationId}.{extension}
 */
export const transcribeAudio = onObjectFinalized(
  {
    secrets: [geminiApiKey, replicateApiToken, huggingfaceAccessToken],
    memory: '1GiB', // Audio processing needs more memory
    timeoutSeconds: 540, // 9 minutes (max for 1st gen functions)
    region: 'us-central1'
  },
  async (event) => {
    const filePath = event.data.name;
    const contentType = event.data.contentType;

    // DEBUG: Log raw event data for troubleshooting
    console.debug('[Transcribe] Storage event received:', {
      bucket: event.data.bucket,
      name: event.data.name,
      contentType: event.data.contentType,
      size: event.data.size,
      timeCreated: event.data.timeCreated,
      updated: event.data.updated,
      md5Hash: event.data.md5Hash,
      generation: event.data.generation,
      metageneration: event.data.metageneration
    });

    // Only process audio files in the audio/ directory
    if (!filePath.startsWith('audio/') || !contentType?.startsWith('audio/')) {
      console.debug('[Transcribe] Skipping non-audio file:', { filePath, contentType });
      return;
    }

    // Parse path: audio/{userId}/{conversationId}.{ext}
    const pathParts = filePath.split('/');
    if (pathParts.length !== 3) {
      console.error('[Transcribe] Invalid audio path structure:', filePath);
      return;
    }

    const userId = pathParts[1];
    const fileName = pathParts[2];
    const conversationId = fileName.split('.')[0];
    const fileExtension = fileName.split('.').pop();

    console.log('[Transcribe] Processing audio file:', {
      filePath,
      userId,
      conversationId,
      contentType,
      fileExtension,
      sizeBytes: event.data.size,
      sizeMB: (event.data.size / (1024 * 1024)).toFixed(2)
    });

    // Initialize progress tracking (before try block so it's accessible in catch)
    const progressManager = new ProgressManager(conversationId);

    // Track partial metrics for abort scenarios - updated as processing progresses
    // This allows us to record resource usage even if user aborts mid-process
    const partialMetrics = {
      timingMs: {
        download: 0,
        whisperx: 0,
        buildSegments: 0,
        gemini: 0,
        speakerCorrection: 0,
        transform: 0,
        firestore: 0,
        total: 0
      },
      llmUsage: {
        geminiAnalysis: { inputTokens: 0, outputTokens: 0, model: 'gemini-2.5-flash' as const },
        geminiSpeakerCorrection: { inputTokens: 0, outputTokens: 0, model: 'gemini-2.5-flash' as const },
        whisperx: { predictionId: '', computeTimeSeconds: 0, model: 'whisperx-diarization' as const },
        diarization: { predictionId: '', computeTimeSeconds: 0, model: 'pyannote-diarization' as const }
      },
      segmentCount: 0,
      speakerCount: 0,
      termCount: 0,
      topicCount: 0,
      personCount: 0,
      speakerCorrectionsApplied: 0,
      audioSizeMB: event.data.size ? event.data.size / (1024 * 1024) : 0,
      durationMs: 0,
      processStartTime: Date.now()
    };

    try {
      // Update status to processing
      await db.collection('conversations').doc(conversationId).update({
        status: 'processing',
        updatedAt: FieldValue.serverTimestamp()
      });

      // Start transcription step
      await progressManager.setStep(ProcessingStep.TRANSCRIBING);

      // Download audio file to memory
      console.debug('[Transcribe] Starting audio download from Storage...');
      const downloadStartTime = Date.now();
      const file = bucket.file(filePath);
      const [audioBuffer] = await file.download();
      const downloadDurationMs = Date.now() - downloadStartTime;

      console.log('[Transcribe] Audio downloaded:', {
        conversationId,
        bufferSizeBytes: audioBuffer.length,
        bufferSizeMB: (audioBuffer.length / (1024 * 1024)).toFixed(2),
        downloadDurationMs,
        downloadSpeedMBps: ((audioBuffer.length / (1024 * 1024)) / (downloadDurationMs / 1000)).toFixed(2)
      });

      // Update partial metrics after download
      partialMetrics.timingMs.download = downloadDurationMs;

      // Check for abort after download
      await checkAbort(conversationId);

      // === GEMINI-FIRST ARCHITECTURE ===
      // Step 1: Pre-analyze with Gemini to get speaker hints + full content analysis
      // This runs BEFORE WhisperX to provide hints that improve diarization accuracy
      console.log('[Transcribe] Step 1: Pre-analyzing audio with Gemini...');
      const preAnalysisStartTime = Date.now();

      let preAnalysisResult: GeminiPreAnalysisResult | null = null;
      let whisperxHints: WhisperXDiarizationHints | undefined;

      try {
        preAnalysisResult = await preAnalyzeAudioWithGemini(
          audioBuffer,
          geminiApiKey.value()
        );

        // Convert to WhisperX hints format
        whisperxHints = {
          numSpeakers: preAnalysisResult.hints.numSpeakers,
          speakerNames: preAnalysisResult.hints.speakerNames
        };

        console.log('[Transcribe] Pre-analysis complete:', {
          speakerCount: whisperxHints.numSpeakers,
          speakerNames: whisperxHints.speakerNames,
          durationMs: Date.now() - preAnalysisStartTime
        });
      } catch (error) {
        // Pre-analysis is optional - continue without hints if it fails
        console.warn('[Transcribe] Pre-analysis failed, continuing without hints:', error);
      }

      const preAnalysisDurationMs = Date.now() - preAnalysisStartTime;

      // Check for abort after pre-analysis
      await checkAbort(conversationId);

      // Step 2: Get transcript + timestamps from WhisperX (with hints from Gemini)
      console.log('[Transcribe] Step 2: Calling WhisperX for transcription with hints...');
      const whisperxStartTime = Date.now();

      // Pass HF token for speaker diarization (optional but recommended)
      const hfToken = huggingfaceAccessToken.value();
      if (!hfToken) {
        console.warn('[Transcribe] HUGGINGFACE_ACCESS_TOKEN not set - speaker diarization will be disabled');
      }

      // Try robust WhisperX first (handles large responses better)
      let whisperxResult = await transcribeWithWhisperXRobust(
        audioBuffer,
        replicateApiToken.value(),
        hfToken || undefined,
        2, // maxRetries
        whisperxHints  // Pass the hints from Gemini pre-analysis
      );

      // If robust method failed, try standard method as backup
      if (whisperxResult.status === 'error') {
        console.warn('[Transcribe] Robust WhisperX failed, trying standard method...');
        whisperxResult = await transcribeWithWhisperX(
          audioBuffer,
          replicateApiToken.value(),
          hfToken || undefined,
          whisperxHints  // Pass hints here too
        );
      }

      const whisperxDurationMs = Date.now() - whisperxStartTime;

      // If WhisperX completely failed, fall back to Gemini transcription
      if (whisperxResult.status === 'error') {
        console.warn('[Transcribe] WhisperX failed completely, falling back to Gemini transcription...');

        const geminiTranscriptResult = await transcribeWithGeminiFallback(
          audioBuffer,
          geminiApiKey.value()
        );

        if (geminiTranscriptResult.status === 'error') {
          throw new Error(`Both WhisperX and Gemini transcription failed. WhisperX: ${whisperxResult.error}. Gemini: ${geminiTranscriptResult.error}`);
        }

        // Use Gemini result with fallback alignment status
        whisperxResult = geminiTranscriptResult;
        console.log('[Transcribe] Using Gemini transcription as fallback (timestamps may be approximate)');

        // Update progress to note fallback
        await progressManager.setStep(ProcessingStep.ANALYZING);
      }

      // Track if we used the Gemini fallback for alignment status
      const usedGeminiFallback = 'usedFallback' in whisperxResult && whisperxResult.usedFallback === true;

      console.log('[Transcribe] WhisperX transcription complete:', {
        conversationId,
        durationMs: whisperxDurationMs,
        durationSec: (whisperxDurationMs / 1000).toFixed(1),
        segmentCount: whisperxResult.segments.length,
        firstSegment: whisperxResult.segments[0],
        lastSegment: whisperxResult.segments[whisperxResult.segments.length - 1]
      });

      // Update partial metrics after WhisperX (most expensive step)
      partialMetrics.timingMs.whisperx = whisperxDurationMs;
      // Estimate compute time from wall-clock time (GPU runs in real-time for transcription)
      // This is approximate but captures the relative cost for abort scenarios
      const estimatedComputeSeconds = whisperxDurationMs / 1000;
      partialMetrics.llmUsage.whisperx.computeTimeSeconds = estimatedComputeSeconds;
      partialMetrics.llmUsage.diarization.computeTimeSeconds = estimatedComputeSeconds * 0.3; // ~30% is diarization

      // Check for abort after WhisperX (most expensive step)
      await checkAbort(conversationId);

      // Step 2: Build segments from WhisperX output
      console.debug('[Transcribe] Step 2: Building segments from WhisperX...');
      const buildStartTime = Date.now();

      const whisperxSegments = buildSegmentsFromWhisperX(whisperxResult.segments);

      // Step 2.5: Fix segment boundaries (diarization often splits a few words late)
      console.debug('[Transcribe] Step 2.5: Fixing segment boundaries...');
      whisperxSegments.segments = fixSegmentBoundaries(whisperxSegments.segments);

      const buildDurationMs = Date.now() - buildStartTime;
      console.debug('[Transcribe] Segments built:', {
        buildDurationMs,
        segmentCount: whisperxSegments.segments.length,
        speakerCount: whisperxSegments.speakers.length
      });

      // Update progress: analyzing with Gemini
      await progressManager.setStep(ProcessingStep.ANALYZING);

      // Step 3: Get content analysis (use pre-analysis if available, otherwise call Gemini)
      let analysis: GeminiAnalysis;
      let geminiAnalysisTokens: GeminiUsage;
      let geminiDurationMs: number;

      if (preAnalysisResult) {
        // Use pre-analysis result (already paid for audio tokens, analysis included)
        console.log('[Transcribe] Step 3: Using pre-analysis results (no additional Gemini call)');

        // Map topic timestamps (approximate seconds) to segment indices
        analysis = {
          ...preAnalysisResult.analysis,
          topics: mapTopicTimesToSegmentIndices(
            preAnalysisResult.analysis.topics,
            whisperxSegments.segments
          )
        };
        geminiAnalysisTokens = preAnalysisResult.tokenUsage;
        geminiDurationMs = preAnalysisDurationMs; // Use pre-analysis time

        console.log('[Transcribe] Pre-analysis results applied:', {
          conversationId,
          title: analysis.title,
          termCount: analysis.terms?.length ?? 0,
          topicCount: analysis.topics?.length ?? 0,
          personCount: analysis.people?.length ?? 0,
          inputTokens: geminiAnalysisTokens.inputTokens,
          outputTokens: geminiAnalysisTokens.outputTokens
        });
      } else {
        // Fallback: Call Gemini to analyze the transcript (pre-analysis failed or not available)
        console.log('[Transcribe] Step 3: Calling Gemini for analysis (fallback)...');
        const geminiStartTime = Date.now();

        const analysisResult = await analyzeTranscriptWithGemini(
          whisperxSegments.segments,
          whisperxSegments.speakers,
          geminiApiKey.value()
        );
        analysis = analysisResult.analysis;
        geminiAnalysisTokens = analysisResult.tokenUsage;

        geminiDurationMs = Date.now() - geminiStartTime;
        console.log('[Transcribe] Gemini analysis complete:', {
          conversationId,
          durationMs: geminiDurationMs,
          durationSec: (geminiDurationMs / 1000).toFixed(1),
          title: analysis.title,
          termCount: analysis.terms?.length ?? 0,
          topicCount: analysis.topics?.length ?? 0,
          personCount: analysis.people?.length ?? 0,
          inputTokens: geminiAnalysisTokens.inputTokens,
          outputTokens: geminiAnalysisTokens.outputTokens
        });
      }

      // Update partial metrics after Gemini analysis
      partialMetrics.timingMs.gemini = geminiDurationMs;
      partialMetrics.llmUsage.geminiAnalysis = {
        inputTokens: geminiAnalysisTokens.inputTokens,
        outputTokens: geminiAnalysisTokens.outputTokens,
        model: 'gemini-2.5-flash'
      };
      partialMetrics.segmentCount = whisperxSegments.segments.length;
      partialMetrics.speakerCount = whisperxSegments.speakers.length;
      partialMetrics.termCount = analysis.terms?.length ?? 0;
      partialMetrics.topicCount = analysis.topics?.length ?? 0;
      partialMetrics.personCount = analysis.people?.length ?? 0;

      // Check for abort after Gemini analysis
      await checkAbort(conversationId);

      // Step 3.5: Speaker reassignment pass (reassign only, no splits/timestamp changes)
      console.log('[Transcribe] Step 3.5: Identifying speaker reassignments...');
      const speakerCorrectionStartTime = Date.now();

      const correctionResult = await identifySpeakerReassignments(
        whisperxSegments.segments,
        whisperxSegments.speakers,
        geminiApiKey.value()
      );
      const { corrections: speakerCorrections, tokenUsage: geminiCorrectionTokens } = correctionResult;

      const speakerCorrectionDurationMs = Date.now() - speakerCorrectionStartTime;
      console.log('[Transcribe] Speaker reassignment analysis complete:', {
        conversationId,
        durationMs: speakerCorrectionDurationMs,
        durationSec: (speakerCorrectionDurationMs / 1000).toFixed(1),
        correctionCount: speakerCorrections.length,
        inputTokens: geminiCorrectionTokens.inputTokens,
        outputTokens: geminiCorrectionTokens.outputTokens
      });

      // Update partial metrics after speaker correction
      partialMetrics.timingMs.speakerCorrection = speakerCorrectionDurationMs;
      partialMetrics.llmUsage.geminiSpeakerCorrection = {
        inputTokens: geminiCorrectionTokens.inputTokens,
        outputTokens: geminiCorrectionTokens.outputTokens,
        model: 'gemini-2.5-flash'
      };
      partialMetrics.speakerCorrectionsApplied = speakerCorrections.length;

      // Apply speaker reassignments (no timestamp manipulation)
      if (speakerCorrections.length > 0) {
        whisperxSegments.segments = applySpeakerReassignments(
          whisperxSegments.segments,
          speakerCorrections,
          whisperxSegments.speakers.map(s => s.id)
        );
      }

      // Update progress: finalizing
      await progressManager.setStep(ProcessingStep.FINALIZING);

      // Step 4: Transform to our data model (merge WhisperX + Gemini)
      console.debug('[Transcribe] Step 4: Merging WhisperX and Gemini data...');
      const transformStartTime = Date.now();

      const processedData = mergeWhisperXAndGeminiData(
        whisperxSegments,
        analysis,
        conversationId,
        userId
      );

      const transformDurationMs = Date.now() - transformStartTime;
      console.debug('[Transcribe] Transform complete:', {
        transformDurationMs,
        finalSegmentCount: processedData.segments.length,
        termOccurrenceCount: processedData.termOccurrences.length,
        durationMs: processedData.durationMs
      });

      // Check for abort before final save
      await checkAbort(conversationId);

      // Determine alignment status based on transcription source
      const finalAlignmentStatus = usedGeminiFallback ? 'fallback' : 'aligned';

      // Save results to Firestore (with retry for transient failures)
      console.debug('[Transcribe] Saving results to Firestore...');
      const firestoreStartTime = Date.now();
      await retryWithBackoff(
        () => db.collection('conversations').doc(conversationId).update({
          ...processedData,
          status: 'complete',
          alignmentStatus: finalAlignmentStatus,
          alignmentError: usedGeminiFallback ? 'WhisperX failed, used Gemini fallback' : null,
          abortRequested: false,  // Clear any abort flag
          audioStoragePath: filePath,
          updatedAt: FieldValue.serverTimestamp()
        }),
        'Firestore save results'
      );
      const firestoreDurationMs = Date.now() - firestoreStartTime;

      const totalDurationMs = Date.now() - downloadStartTime;
      console.log('[Transcribe] ✅ Transcription complete (NEW ARCHITECTURE):', {
        conversationId,
        segmentCount: processedData.segments.length,
        speakerCount: Object.keys(processedData.speakers).length,
        termCount: Object.keys(processedData.terms).length,
        topicCount: processedData.topics.length,
        personCount: processedData.people.length,
        alignmentStatus: finalAlignmentStatus,
        usedGeminiFallback,
        speakerCorrectionsApplied: speakerCorrections.length,
        timingMs: {
          download: downloadDurationMs,
          whisperx: whisperxDurationMs,
          buildSegments: buildDurationMs,
          gemini: geminiDurationMs,
          speakerCorrection: speakerCorrectionDurationMs,
          transform: transformDurationMs,
          firestore: firestoreDurationMs,
          total: totalDurationMs
        }
      });

      // Build LLM usage breakdown for cost tracking
      const llmUsage: LLMUsage = {
        geminiAnalysis: geminiAnalysisTokens,
        geminiSpeakerCorrection: geminiCorrectionTokens,
        whisperx: {
          // Use wall clock time as approximation for Replicate compute time
          // (actual billing uses their internal compute time which is close)
          computeTimeSeconds: whisperxDurationMs / 1000,
          model: 'whisperx'
        }
        // diarization is built into whisperx model now, no separate call
      };

      // Calculate estimated costs based on pricing from database
      const estimatedCost = await calculateCost(llmUsage);

      console.log('[Transcribe] LLM usage and cost breakdown:', {
        conversationId,
        geminiAnalysisTokens: geminiAnalysisTokens.inputTokens + geminiAnalysisTokens.outputTokens,
        geminiCorrectionTokens: geminiCorrectionTokens.inputTokens + geminiCorrectionTokens.outputTokens,
        whisperxComputeSec: llmUsage.whisperx.computeTimeSeconds.toFixed(1),
        estimatedCostUsd: estimatedCost.totalUsd.toFixed(6)
      });

      // Record metrics for observability dashboard
      await recordMetrics({
        conversationId,
        userId,
        status: 'success',
        alignmentStatus: finalAlignmentStatus,
        timingMs: {
          download: downloadDurationMs,
          whisperx: whisperxDurationMs,
          buildSegments: buildDurationMs,
          gemini: geminiDurationMs,
          speakerCorrection: speakerCorrectionDurationMs,
          transform: transformDurationMs,
          firestore: firestoreDurationMs,
          total: totalDurationMs
        },
        segmentCount: processedData.segments.length,
        speakerCount: Object.keys(processedData.speakers).length,
        termCount: Object.keys(processedData.terms).length,
        topicCount: processedData.topics.length,
        personCount: processedData.people.length,
        speakerCorrectionsApplied: speakerCorrections.length,
        audioSizeMB: audioBuffer.length / (1024 * 1024),
        durationMs: processedData.durationMs,
        llmUsage,
        estimatedCost
      });

      // Record processing_completed event for user stats
      await recordUserEvent({
        eventType: 'processing_completed',
        userId,
        conversationId,
        metadata: {
          durationMs: processedData.durationMs,
          estimatedCostUsd: estimatedCost.totalUsd,
          segmentCount: processedData.segments.length
        }
      });

      // Mark processing as complete
      await progressManager.setComplete();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isAbort = error instanceof AbortRequestedError;

      if (isAbort) {
        // Handle abort - record partial metrics since we still consumed resources
        console.log('[Transcribe] ⏹️ Processing aborted by user:', { conversationId });

        // Calculate total time elapsed
        partialMetrics.timingMs.total = Date.now() - partialMetrics.processStartTime;

        // Calculate estimated cost from whatever LLM resources were consumed
        const partialCost = await calculateCost(partialMetrics.llmUsage);

        console.log('[Transcribe] Recording partial metrics on abort:', {
          conversationId,
          elapsedMs: partialMetrics.timingMs.total,
          whisperxTime: partialMetrics.llmUsage.whisperx.computeTimeSeconds,
          geminiInputTokens: partialMetrics.llmUsage.geminiAnalysis.inputTokens,
          estimatedCostUsd: partialCost.totalUsd
        });

        // Record metrics for observability - aborted jobs still cost money!
        await recordMetrics({
          conversationId,
          userId,
          status: 'aborted',
          errorMessage: 'Processing was cancelled by user',
          timingMs: partialMetrics.timingMs,
          segmentCount: partialMetrics.segmentCount,
          speakerCount: partialMetrics.speakerCount,
          termCount: partialMetrics.termCount,
          topicCount: partialMetrics.topicCount,
          personCount: partialMetrics.personCount,
          speakerCorrectionsApplied: partialMetrics.speakerCorrectionsApplied,
          audioSizeMB: partialMetrics.audioSizeMB,
          durationMs: partialMetrics.durationMs,
          llmUsage: partialMetrics.llmUsage,
          estimatedCost: partialCost
        });

        // Record processing_aborted event for user stats
        await recordUserEvent({
          eventType: 'processing_aborted',
          userId,
          conversationId,
          metadata: {
            estimatedCostUsd: partialCost.totalUsd,
            elapsedMs: partialMetrics.timingMs.total
          }
        });

        await db.collection('conversations').doc(conversationId).update({
          status: 'aborted',
          processingError: 'Processing was cancelled by user',
          abortRequested: false,  // Clear the flag
          updatedAt: FieldValue.serverTimestamp()
        });

        await progressManager.setFailed('Aborted by user');
        return;
      }

      console.error('[Transcribe] ❌ Transcription failed:', {
        conversationId,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined
      });

      // Record failure metrics for observability dashboard
      await recordMetrics({
        conversationId,
        userId,
        status: 'failed',
        errorMessage,
        timingMs: {
          download: 0,
          whisperx: 0,
          buildSegments: 0,
          gemini: 0,
          speakerCorrection: 0,
          transform: 0,
          firestore: 0,
          total: 0
        },
        segmentCount: 0,
        speakerCount: 0,
        termCount: 0,
        topicCount: 0,
        personCount: 0,
        speakerCorrectionsApplied: 0,
        audioSizeMB: 0,
        durationMs: 0
      });

      // Record processing_failed event for user stats
      await recordUserEvent({
        eventType: 'processing_failed',
        userId,
        conversationId,
        metadata: {
          errorMessage
        }
      });

      // Mark processing as failed
      await progressManager.setFailed(errorMessage);

      // Update status to failed
      await db.collection('conversations').doc(conversationId).update({
        status: 'failed',
        processingError: errorMessage,
        updatedAt: FieldValue.serverTimestamp()
      });

      console.debug('[Transcribe] Firestore updated with failed status');
    }
  }
);

/**
 * Map topic approximate times (from Gemini pre-analysis) to segment indices.
 *
 * Gemini pre-analysis returns topics with approximate start/end times in seconds.
 * We need to map these to segment indices based on WhisperX timestamps.
 */
function mapTopicTimesToSegmentIndices(
  topics: Array<GeminiAnalysis['topics'][0] & { _startApproxSeconds?: number; _endApproxSeconds?: number }>,
  segments: Array<{ startMs: number; endMs: number; index: number }>
): GeminiAnalysis['topics'] {
  if (topics.length === 0 || segments.length === 0) {
    return topics.map(t => ({
      title: t.title,
      startSegmentIndex: 0,
      endSegmentIndex: segments.length - 1,
      type: t.type
    }));
  }

  return topics.map(topic => {
    // Find segment closest to start time
    const startTimeMs = (topic._startApproxSeconds || 0) * 1000;
    const endTimeMs = (topic._endApproxSeconds || Infinity) * 1000;

    let startSegmentIndex = 0;
    let endSegmentIndex = segments.length - 1;

    // Find first segment that starts after or contains the topic start time
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].startMs >= startTimeMs || segments[i].endMs >= startTimeMs) {
        startSegmentIndex = i;
        break;
      }
    }

    // Find last segment that starts before or contains the topic end time
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].startMs <= endTimeMs) {
        endSegmentIndex = i;
        break;
      }
    }

    // Ensure end >= start
    if (endSegmentIndex < startSegmentIndex) {
      endSegmentIndex = startSegmentIndex;
    }

    return {
      title: topic.title,
      startSegmentIndex,
      endSegmentIndex,
      type: topic.type
    };
  });
}

/**
 * NEW: Build segments from WhisperX output
 *
 * IMPORTANT: WhisperX (rafaelgalle/whisper-diarization-advanced) returns WORD-LEVEL
 * segments, not sentence-level. We must group consecutive words by speaker into
 * proper sentence-level segments for a usable transcript.
 */
function buildSegmentsFromWhisperX(whisperxSegments: WhisperXSegment[]): {
  segments: Array<{ text: string; startMs: number; endMs: number; speakerId: string; index: number }>;
  speakers: Array<{ id: string; name: string }>;
} {
  // Extract unique speakers from WhisperX (e.g., "SPEAKER_00", "SPEAKER_01")
  const speakerSet = new Set<string>();
  whisperxSegments.forEach(seg => {
    if (seg.speaker) {
      speakerSet.add(seg.speaker);
    }
  });

  // Create speaker list with friendly names
  const speakers = Array.from(speakerSet).sort().map((id, idx) => ({
    id,
    name: `Speaker ${idx + 1}`  // "SPEAKER_00" -> "Speaker 1"
  }));

  // If no speaker diarization, use default speaker
  if (speakers.length === 0) {
    speakers.push({ id: 'SPEAKER_00', name: 'Speaker 1' });
  }

  // Check if we have word-level segments (typical for whisper-diarization-advanced)
  // Word-level: many short segments with single words
  // Sentence-level: fewer segments with multiple words
  const avgWordsPerSegment = whisperxSegments.reduce((sum, seg) =>
    sum + seg.text.split(/\s+/).length, 0) / Math.max(whisperxSegments.length, 1);

  const isWordLevel = avgWordsPerSegment < 2;

  if (isWordLevel) {
    // Check if diarization is broken (near 50/50 speaker split = alternating speakers)
    const speakerWordCounts: Record<string, number> = {};
    whisperxSegments.forEach(seg => {
      const spk = seg.speaker || 'SPEAKER_00';
      speakerWordCounts[spk] = (speakerWordCounts[spk] || 0) + 1;
    });

    const speakerCounts = Object.values(speakerWordCounts);
    const totalWords = speakerCounts.reduce((a, b) => a + b, 0);
    const maxSpeakerRatio = Math.max(...speakerCounts) / totalWords;

    // If the dominant speaker has less than 60% of words, diarization is likely broken
    // (real conversations rarely have exactly equal speaker time at the word level)
    const isDiarizationBroken = speakers.length >= 2 && maxSpeakerRatio < 0.6;

    if (isDiarizationBroken) {
      console.log('[BuildSegments] Detected BROKEN diarization (near 50/50 split on word-level)');
      console.log(`[BuildSegments] Speaker distribution: ${JSON.stringify(speakerWordCounts)}`);
      console.log('[BuildSegments] Grouping by sentence boundaries ONLY, ignoring speaker assignments');

      // Deduplicate repeated words (common WhisperX issue)
      const deduplicatedSegments = deduplicateWhisperXWords(whisperxSegments);
      return groupWordSegmentsIgnoringSpeaker(deduplicatedSegments, speakers);
    }

    console.log('[BuildSegments] Detected WORD-LEVEL output, grouping into sentences...');
    // Deduplicate repeated words (common WhisperX issue)
    const deduplicatedSegments = deduplicateWhisperXWords(whisperxSegments);
    return groupWordSegmentsBySpeaker(deduplicatedSegments, speakers);
  }

  // Sentence-level output - use as-is
  const segments = whisperxSegments.map((seg, idx) => ({
    text: seg.text,
    startMs: Math.floor(seg.start * 1000),
    endMs: Math.floor(seg.end * 1000),
    speakerId: seg.speaker || 'SPEAKER_00',
    index: idx
  }));

  console.debug('[BuildSegments] Built segments:', {
    segmentCount: segments.length,
    speakerCount: speakers.length,
    speakers: speakers.map(s => s.id).join(', ')
  });

  return { segments, speakers };
}

/**
 * Group word-level segments into sentence-level segments by speaker.
 *
 * Strategy:
 * 1. Group consecutive words with the same speaker
 * 2. Split at natural sentence boundaries (., !, ?) when they occur
 * 3. Also split if a segment gets too long (prevents giant monologue segments)
 */
function groupWordSegmentsBySpeaker(
  wordSegments: WhisperXSegment[],
  speakers: Array<{ id: string; name: string }>
): {
  segments: Array<{ text: string; startMs: number; endMs: number; speakerId: string; index: number }>;
  speakers: Array<{ id: string; name: string }>;
} {
  if (wordSegments.length === 0) {
    return { segments: [], speakers };
  }

  const MAX_SEGMENT_WORDS = 50;  // Split long monologues at ~50 words
  const MIN_SEGMENT_WORDS = 3;   // Minimum words before allowing sentence-end split

  const groupedSegments: Array<{
    text: string;
    startMs: number;
    endMs: number;
    speakerId: string;
    index: number;
  }> = [];

  let currentWords: string[] = [];
  let currentSpeaker = wordSegments[0].speaker || 'SPEAKER_00';
  let currentStartMs = Math.floor(wordSegments[0].start * 1000);
  let currentEndMs = Math.floor(wordSegments[0].end * 1000);

  const finishCurrentSegment = () => {
    if (currentWords.length > 0) {
      groupedSegments.push({
        text: currentWords.join(' '),
        startMs: currentStartMs,
        endMs: currentEndMs,
        speakerId: currentSpeaker,
        index: groupedSegments.length
      });
      currentWords = [];
    }
  };

  for (let i = 0; i < wordSegments.length; i++) {
    const word = wordSegments[i];
    const wordSpeaker = word.speaker || 'SPEAKER_00';
    const wordText = word.text.trim();
    const wordEndMs = Math.floor(word.end * 1000);

    // Speaker change - finish current segment
    if (wordSpeaker !== currentSpeaker) {
      finishCurrentSegment();
      currentSpeaker = wordSpeaker;
      currentStartMs = Math.floor(word.start * 1000);
    }

    // Add word to current segment
    currentWords.push(wordText);
    currentEndMs = wordEndMs;

    // Check if we should split the segment
    const shouldSplitAtSentence = currentWords.length >= MIN_SEGMENT_WORDS &&
      /[.!?]$/.test(wordText);
    const shouldSplitAtLength = currentWords.length >= MAX_SEGMENT_WORDS;

    if (shouldSplitAtSentence || shouldSplitAtLength) {
      finishCurrentSegment();
      // Next word will start a new segment
      if (i + 1 < wordSegments.length) {
        currentStartMs = Math.floor(wordSegments[i + 1].start * 1000);
      }
    }
  }

  // Don't forget the last segment
  finishCurrentSegment();

  // Re-index all segments
  groupedSegments.forEach((seg, idx) => {
    seg.index = idx;
  });

  console.log('[BuildSegments] Grouped word-level segments:', {
    inputWordCount: wordSegments.length,
    outputSegmentCount: groupedSegments.length,
    compressionRatio: (wordSegments.length / Math.max(groupedSegments.length, 1)).toFixed(1),
    speakerCount: speakers.length,
    speakers: speakers.map(s => s.id).join(', ')
  });

  // Log speaker distribution for debugging
  const speakerCounts: Record<string, number> = {};
  groupedSegments.forEach(seg => {
    speakerCounts[seg.speakerId] = (speakerCounts[seg.speakerId] || 0) + 1;
  });
  console.debug('[BuildSegments] Speaker distribution:', speakerCounts);

  return { segments: groupedSegments, speakers };
}

/**
 * Deduplicate consecutive repeated words from WhisperX output.
 *
 * WhisperX sometimes stutters and returns duplicate words. This function
 * removes consecutive identical words while preserving timing from the first occurrence.
 */
function deduplicateWhisperXWords(segments: WhisperXSegment[]): WhisperXSegment[] {
  if (segments.length === 0) return segments;

  const deduplicated: WhisperXSegment[] = [];
  let lastWord = '';

  for (const seg of segments) {
    const word = seg.text.trim().toLowerCase();

    // Skip if this is an exact duplicate of the previous word
    if (word === lastWord) {
      continue;
    }

    deduplicated.push(seg);
    lastWord = word;
  }

  const removed = segments.length - deduplicated.length;
  if (removed > 0) {
    console.log(`[BuildSegments] Deduplicated ${removed} repeated words (${((removed / segments.length) * 100).toFixed(1)}%)`);
  }

  return deduplicated;
}

/**
 * Group word-level segments into sentences IGNORING speaker assignments.
 *
 * Used when WhisperX diarization is broken (e.g., alternating speakers on every word).
 * Groups purely by sentence boundaries, assigns all segments to SPEAKER_00,
 * and lets the speaker reassignment step (Gemini) assign proper speakers later.
 */
function groupWordSegmentsIgnoringSpeaker(
  wordSegments: WhisperXSegment[],
  speakers: Array<{ id: string; name: string }>
): {
  segments: Array<{ text: string; startMs: number; endMs: number; speakerId: string; index: number }>;
  speakers: Array<{ id: string; name: string }>;
} {
  if (wordSegments.length === 0) {
    return { segments: [], speakers };
  }

  const MAX_SEGMENT_WORDS = 50;  // Split long segments at ~50 words
  const MIN_SEGMENT_WORDS = 3;   // Minimum words before allowing sentence-end split

  const groupedSegments: Array<{
    text: string;
    startMs: number;
    endMs: number;
    speakerId: string;
    index: number;
  }> = [];

  let currentWords: string[] = [];
  let currentStartMs = Math.floor(wordSegments[0].start * 1000);
  let currentEndMs = Math.floor(wordSegments[0].end * 1000);

  // Use first speaker as default - Gemini reassignment will fix it
  const defaultSpeaker = speakers[0]?.id || 'SPEAKER_00';

  const finishCurrentSegment = () => {
    if (currentWords.length > 0) {
      groupedSegments.push({
        text: currentWords.join(' '),
        startMs: currentStartMs,
        endMs: currentEndMs,
        speakerId: defaultSpeaker,  // Will be reassigned by Gemini
        index: groupedSegments.length
      });
      currentWords = [];
    }
  };

  for (let i = 0; i < wordSegments.length; i++) {
    const word = wordSegments[i];
    const wordText = word.text.trim();
    const wordEndMs = Math.floor(word.end * 1000);

    // If this is the first word of a new segment, set start time
    if (currentWords.length === 0) {
      currentStartMs = Math.floor(word.start * 1000);
    }

    // Add word to current segment
    currentWords.push(wordText);
    currentEndMs = wordEndMs;

    // Check if we should split the segment (sentence boundary or max length)
    const shouldSplitAtSentence = currentWords.length >= MIN_SEGMENT_WORDS &&
      /[.!?]$/.test(wordText);
    const shouldSplitAtLength = currentWords.length >= MAX_SEGMENT_WORDS;

    if (shouldSplitAtSentence || shouldSplitAtLength) {
      finishCurrentSegment();
    }
  }

  // Don't forget the last segment
  finishCurrentSegment();

  // Re-index all segments
  groupedSegments.forEach((seg, idx) => {
    seg.index = idx;
  });

  console.log('[BuildSegments] Grouped word-level segments (ignoring broken diarization):', {
    inputWordCount: wordSegments.length,
    outputSegmentCount: groupedSegments.length,
    compressionRatio: (wordSegments.length / Math.max(groupedSegments.length, 1)).toFixed(1),
    note: 'All segments assigned to default speaker - Gemini will reassign'
  });

  return { segments: groupedSegments, speakers };
}

/**
 * Fix segment boundaries where diarization split too late.
 *
 * Common issue: speaker change detected a few words late, so the end of
 * one speaker's sentence gets attached to the start of the next speaker's segment.
 *
 * Example: "all these other things. Anyways. But having tools..."
 *          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ should be in previous segment
 *
 * Heuristic: If a segment starts with a sentence fragment (text ending in
 * sentence-ending punctuation within first N chars), move it to prev segment.
 */
function fixSegmentBoundaries(
  segments: Array<{ text: string; startMs: number; endMs: number; speakerId: string; index: number }>
): Array<{ text: string; startMs: number; endMs: number; speakerId: string; index: number }> {
  if (segments.length < 2) {
    return segments;
  }

  const MAX_FRAGMENT_CHARS = 80;  // Only look for fragments in first 80 chars
  const MIN_REMAINING_CHARS = 20; // Don't move if it leaves segment too short

  // Regex to find sentence-ending punctuation followed by space and more text
  // Matches: "text here. More text" or "question? Answer" or "wow! Response"
  const fragmentPattern = /^(.+?[.!?])\s+([A-Z].*)/s;

  let movedCount = 0;
  const result = [...segments];

  for (let i = 1; i < result.length; i++) {
    const current = result[i];
    const previous = result[i - 1];

    // Only fix boundaries between DIFFERENT speakers
    if (current.speakerId === previous.speakerId) {
      continue;
    }

    const text = current.text.trim();

    // Check if segment starts with a fragment (sentence ending within first N chars)
    const match = text.match(fragmentPattern);
    if (!match) {
      continue;
    }

    const fragment = match[1];  // The part to move (e.g., "all these other things. Anyways.")
    const remainder = match[2]; // The part to keep (e.g., "But having tools...")

    // Only move if fragment is reasonably short and remainder is long enough
    if (fragment.length > MAX_FRAGMENT_CHARS || remainder.length < MIN_REMAINING_CHARS) {
      continue;
    }

    // Additional check: fragment should look like a continuation, not a complete thought
    // Skip if fragment starts with common sentence starters
    const startsWithSentenceStarter = /^(I|You|We|They|He|She|It|The|A|An|This|That|So|But|And|Or|If|When|What|How|Why|Where|Who)\s/i.test(fragment);
    if (startsWithSentenceStarter && fragment.length > 40) {
      // Longer fragments starting with sentence starters are probably intentional
      continue;
    }

    console.debug(`[FixBoundaries] Moving fragment from segment ${i} to ${i-1}:`, {
      fragment: fragment.substring(0, 50) + (fragment.length > 50 ? '...' : ''),
      fromSpeaker: current.speakerId,
      toSpeaker: previous.speakerId
    });

    // Calculate new timestamps (interpolate based on character ratio)
    const totalChars = current.text.length;
    const fragmentRatio = fragment.length / totalChars;
    const durationMs = current.endMs - current.startMs;
    const fragmentDurationMs = Math.floor(durationMs * fragmentRatio);
    const newBoundaryMs = current.startMs + fragmentDurationMs;

    // Update previous segment: append fragment and extend end time
    result[i - 1] = {
      ...previous,
      text: previous.text.trimEnd() + ' ' + fragment,
      endMs: newBoundaryMs
    };

    // Update current segment: remove fragment and adjust start time
    result[i] = {
      ...current,
      text: remainder,
      startMs: newBoundaryMs
    };

    movedCount++;
  }

  if (movedCount > 0) {
    console.log(`[FixBoundaries] Moved ${movedCount} sentence fragments to previous segments`);
  }

  // Re-index segments
  return result.map((seg, idx) => ({ ...seg, index: idx }));
}

/**
 * NEW: Analyze transcript with Gemini (text-only, no audio)
 * Returns analysis results AND token usage for cost tracking
 */
async function analyzeTranscriptWithGemini(
  segments: Array<{ text: string; startMs: number; endMs: number; speakerId: string; index: number }>,
  speakers: Array<{ id: string; name: string }>,
  apiKey: string
): Promise<GeminiAnalysisResult> {
  const genAI = new GoogleGenerativeAI(apiKey);

  // Use gemini-2.5-flash for analysis
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          topics: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                title: { type: SchemaType.STRING },
                startSegmentIndex: { type: SchemaType.INTEGER },
                endSegmentIndex: { type: SchemaType.INTEGER },
                type: { type: SchemaType.STRING }
              },
              required: ['title', 'startSegmentIndex', 'endSegmentIndex', 'type']
            }
          },
          terms: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                id: { type: SchemaType.STRING },
                term: { type: SchemaType.STRING },
                definition: { type: SchemaType.STRING },
                aliases: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
              },
              required: ['id', 'term', 'definition', 'aliases']
            }
          },
          people: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                name: { type: SchemaType.STRING },
                affiliation: { type: SchemaType.STRING }
              },
              required: ['name']
            }
          },
          speakerNotes: {
            type: SchemaType.ARRAY,
            description: 'Speaker identification and notes inferred from content',
            items: {
              type: SchemaType.OBJECT,
              properties: {
                speakerId: { type: SchemaType.STRING },
                inferredName: { type: SchemaType.STRING, description: 'Real name if speaker introduces themselves (e.g., "Hi, I\'m John")' },
                role: { type: SchemaType.STRING, description: 'Inferred role (e.g., "host", "guest", "interviewer")' },
                notes: { type: SchemaType.STRING, description: 'Additional context about this speaker' }
              },
              required: ['speakerId']
            }
          }
        },
        required: ['title', 'topics', 'terms', 'people']
      }
    }
  });

  // Format transcript with segment indices and speaker labels
  const formattedTranscript = segments.map((seg, idx) => {
    const speakerName = speakers.find(s => s.id === seg.speakerId)?.name || seg.speakerId;
    return `[${idx}] ${speakerName}: ${seg.text}`;
  }).join('\n\n');

  const speakerList = speakers.map(s => `${s.id} (${s.name})`).join(', ');

  const prompt = `
Analyze this audio transcript and extract:

1. TITLE: Generate a concise, descriptive title for this conversation (5-10 words).

2. TOPICS: Identify topic segments with their approximate positions.
   For each topic, specify which segment indices it covers (0-based).
   Mark topics as "main" or "tangent" based on whether they're central to the conversation.

3. TERMS: Extract key technical terms, acronyms, names, and domain-specific vocabulary.
   Provide clear, concise definitions based on context.
   Include common aliases or variations.

4. PEOPLE: Identify mentions of people (names, titles, references).
   These should be DISTINCT from the speakers themselves.
   Extract their name and any inferred role/affiliation/organization.

5. SPEAKER IDENTIFICATION: For each speaker, try to identify:
   - inferredName: Their actual name if they introduce themselves (e.g., "Hi, I'm John",
     "This is Sarah", "My name is...", or if another speaker addresses them by name)
   - role: Their role in the conversation (e.g., "host", "guest", "interviewer", "expert")
   - notes: Any additional context (e.g., "works at Google", "PhD in AI")

   IMPORTANT: Only set inferredName if you have HIGH CONFIDENCE from explicit introduction
   or direct address. Don't guess names from context clues alone.

The transcript has speaker labels: ${speakerList}

Transcript (with speaker labels and segment indices):
${formattedTranscript}

Return your analysis as JSON matching the provided schema.
`;

  console.debug('[Gemini Analysis] Sending request...', {
    promptLength: prompt.length,
    segmentCount: segments.length,
    speakerCount: speakers.length
  });

  const result = await model.generateContent([{ text: prompt }]);
  const responseText = result.response.text();

  // Extract token usage for cost tracking
  const usageMetadata = result.response.usageMetadata;
  const tokenUsage: GeminiUsage = {
    inputTokens: usageMetadata?.promptTokenCount ?? 0,
    outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
    model: 'gemini-2.5-flash'
  };

  console.debug('[Gemini Analysis] Raw response received:', {
    responseLength: responseText.length,
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens
  });

  const cleanJson = responseText.replace(/```json\s*|\s*```/g, '').trim();

  try {
    const parsed = JSON.parse(cleanJson) as GeminiAnalysis;
    console.debug('[Gemini Analysis] JSON parsed successfully');
    return {
      analysis: parsed,
      tokenUsage
    };
  } catch (parseError) {
    console.error('[Gemini Analysis] JSON parse failed:', {
      error: parseError instanceof Error ? parseError.message : String(parseError),
      cleanJsonPreview: cleanJson.substring(0, 500)
    });
    throw parseError;
  }
}

/**
 * Identify speaker corrections using Gemini conversational analysis.
 * Only identifies REASSIGN corrections (entire segment to different speaker).
 * Split corrections are disabled as they caused timestamp issues.
 * Returns corrections AND token usage for cost tracking.
 */
async function identifySpeakerReassignments(
  segments: Array<{ text: string; startMs: number; endMs: number; speakerId: string; index: number }>,
  speakers: Array<{ id: string; name: string }>,
  apiKey: string
): Promise<SpeakerCorrectionResult> {
  const genAI = new GoogleGenerativeAI(apiKey);

  // Use gemini-2.5-flash for speaker reassignment analysis
  // Schema simplified to only support reassign (no split)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          corrections: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                segmentIndex: { type: SchemaType.INTEGER },
                newSpeaker: { type: SchemaType.STRING },
                reason: { type: SchemaType.STRING }
              },
              required: ['segmentIndex', 'newSpeaker', 'reason']
            }
          }
        },
        required: ['corrections']
      }
    }
  });

  // Format transcript with segment indices and speaker labels
  const formattedTranscript = segments.map((seg, idx) => {
    const speakerName = speakers.find(s => s.id === seg.speakerId)?.name || seg.speakerId;
    return `[${idx}] ${speakerName}: ${seg.text}`;
  }).join('\n\n');

  const speakerList = speakers.map(s => `${s.id} (${s.name})`).join(', ');

  // Calculate speaker distribution to help Gemini understand the imbalance
  const speakerCounts: Record<string, number> = {};
  segments.forEach(seg => {
    speakerCounts[seg.speakerId] = (speakerCounts[seg.speakerId] || 0) + 1;
  });
  const speakerDistribution = Object.entries(speakerCounts)
    .map(([id, count]) => `${id}: ${count} segments (${Math.round(count / segments.length * 100)}%)`)
    .join(', ');

  const prompt = `
You are an expert at identifying speaker attribution errors in conversation transcripts.

CURRENT SPEAKER DISTRIBUTION: ${speakerDistribution}

Analyze this transcript and identify segments where the ENTIRE SEGMENT is attributed to the WRONG speaker.

Focus on these patterns that indicate MISATTRIBUTION:

1. QUESTION/ANSWER PATTERNS:
   - If Speaker 1 asks questions and Speaker 2 gives answers, but a question is attributed to Speaker 2
   - Interview patterns: interviewer asks, interviewee responds
   - Example: "Where do you go shopping?" should be the interviewer, not interviewee

2. ROLE CONSISTENCY:
   - One speaker is clearly the questioner/interviewer throughout
   - One speaker is clearly the responder/interviewee throughout
   - Short responses ("New Look, Primark", "Normal places") are typically from the responder

3. CONVERSATIONAL FLOW:
   - Back-and-forth exchanges where attribution doesn't make sense
   - A question followed by another question from the "same" speaker (likely wrong)
   - An answer that doesn't fit the previous question's context

4. SHORT ACKNOWLEDGMENTS:
   - Brief responses like "Yeah", "Mm-hmm", "Right" during someone's extended speech
   - These are often from the listener, not the speaker

IMPORTANT GUIDELINES:
- Only identify segments where the ENTIRE segment should be reassigned to a different speaker
- Do NOT suggest splitting segments - only whole-segment reassignments
- Be conservative - only flag clear errors based on conversational logic
- Provide the newSpeaker ID (must be one of: ${speakerList})

Available speakers: ${speakerList}

Transcript (with speaker labels and segment indices):
${formattedTranscript}

Return your analysis as JSON with an array of corrections.
Each correction needs: segmentIndex (0-based), newSpeaker (the correct speaker ID), reason (brief explanation).
If no corrections are needed, return an empty array.
`;

  console.log('[Speaker Reassignment] Analyzing transcript...', {
    promptLength: prompt.length,
    segmentCount: segments.length,
    speakerCount: speakers.length,
    speakerDistribution
  });

  const result = await model.generateContent([{ text: prompt }]);
  const responseText = result.response.text();

  // Extract token usage for cost tracking
  const usageMetadata = result.response.usageMetadata;
  const tokenUsage: GeminiUsage = {
    inputTokens: usageMetadata?.promptTokenCount ?? 0,
    outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
    model: 'gemini-2.5-flash'
  };

  console.debug('[Speaker Reassignment] Raw response received:', {
    responseLength: responseText.length,
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens
  });

  const cleanJson = responseText.replace(/```json\s*|\s*```/g, '').trim();

  try {
    const parsed = JSON.parse(cleanJson) as { corrections: Array<{ segmentIndex: number; newSpeaker: string; reason: string }> };

    // Convert to SpeakerCorrection format with action='reassign'
    const corrections: SpeakerCorrection[] = parsed.corrections.map(c => ({
      segmentIndex: c.segmentIndex,
      action: 'reassign' as const,
      reason: c.reason,
      newSpeaker: c.newSpeaker
    }));

    console.log('[Speaker Reassignment] Analysis complete:', {
      correctionCount: corrections.length,
      corrections: corrections.map(c => `[${c.segmentIndex}] -> ${c.newSpeaker}: ${c.reason?.substring(0, 50)}`)
    });

    return {
      corrections,
      tokenUsage
    };
  } catch (parseError) {
    console.error('[Speaker Reassignment] JSON parse failed:', {
      error: parseError instanceof Error ? parseError.message : String(parseError),
      cleanJsonPreview: cleanJson.substring(0, 500)
    });
    // Don't fail the whole transcription if speaker correction fails
    // Still return token usage even on parse failure (Gemini was still called)
    return {
      corrections: [],
      tokenUsage
    };
  }
}

/**
 * Apply speaker reassignments to segments.
 * Only changes speaker IDs - NO timestamp manipulation.
 * This is the safe version that won't cause timestamp clustering issues.
 */
function applySpeakerReassignments(
  segments: Array<{ text: string; startMs: number; endMs: number; speakerId: string; index: number }>,
  corrections: SpeakerCorrection[],
  allSpeakers: string[]
): Array<{ text: string; startMs: number; endMs: number; speakerId: string; index: number }> {
  if (corrections.length === 0) {
    return segments;
  }

  // Only process reassign actions (ignore any split actions that might slip through)
  const reassignments = corrections.filter(c => c.action === 'reassign' && c.newSpeaker);

  if (reassignments.length === 0) {
    return segments;
  }

  const result = [...segments];

  for (const correction of reassignments) {
    const { segmentIndex, newSpeaker } = correction;

    // Validate segment index
    if (segmentIndex < 0 || segmentIndex >= result.length) {
      console.warn(`[Speaker Reassignment] Invalid segment index ${segmentIndex}, skipping`);
      continue;
    }

    // Validate new speaker exists
    if (!allSpeakers.includes(newSpeaker!)) {
      console.warn(`[Speaker Reassignment] Unknown speaker ${newSpeaker}, skipping`);
      continue;
    }

    const oldSpeaker = result[segmentIndex].speakerId;

    // Only apply if actually changing speaker
    if (oldSpeaker !== newSpeaker) {
      console.debug(`[Speaker Reassignment] Segment ${segmentIndex}: ${oldSpeaker} -> ${newSpeaker}`);
      result[segmentIndex] = {
        ...result[segmentIndex],
        speakerId: newSpeaker!
      };
    }
  }

  return result;
}

/**
 * DEPRECATED: Apply speaker corrections to segments.
 * Handles both 'split' and 'reassign' actions.
 * Use applySpeakerReassignments instead (no timestamp manipulation).
 */
export function _applySpeakerCorrections(
  segments: Array<{ text: string; startMs: number; endMs: number; speakerId: string; index: number }>,
  corrections: SpeakerCorrection[],
  allSpeakers: string[]
): Array<{ text: string; startMs: number; endMs: number; speakerId: string; index: number }> {
  if (corrections.length === 0) {
    console.debug('[Apply Corrections] No corrections to apply');
    return segments;
  }

  console.log('[Apply Corrections] Applying corrections...', {
    correctionCount: corrections.length,
    splitCount: corrections.filter(c => c.action === 'split').length,
    reassignCount: corrections.filter(c => c.action === 'reassign').length,
    availableSpeakers: allSpeakers
  });

  let modifiedSegments = [...segments];

  // Sort corrections by segment index DESCENDING to avoid index shifting
  const sortedCorrections = [...corrections].sort((a, b) => b.segmentIndex - a.segmentIndex);

  sortedCorrections.forEach(correction => {
    const segIndex = correction.segmentIndex;

    if (segIndex < 0 || segIndex >= modifiedSegments.length) {
      console.warn('[Apply Corrections] Invalid segment index, skipping:', {
        segmentIndex: segIndex,
        totalSegments: modifiedSegments.length
      });
      return;
    }

    const segment = modifiedSegments[segIndex];

    if (correction.action === 'reassign') {
      // Simple reassignment - just change the speaker
      if (!correction.newSpeaker) {
        console.warn('[Apply Corrections] Reassign action missing newSpeaker, skipping:', correction);
        return;
      }

      console.debug('[Apply Corrections] Reassigning segment:', {
        segmentIndex: segIndex,
        oldSpeaker: segment.speakerId,
        newSpeaker: correction.newSpeaker,
        reason: correction.reason
      });

      modifiedSegments[segIndex] = {
        ...segment,
        speakerId: correction.newSpeaker
      };

    } else if (correction.action === 'split') {
      // Split segment at character position
      // speakerBefore is optional - defaults to original segment's speaker
      // speakerAfter can be inferred for 2-speaker conversations
      if (!correction.splitAtChar) {
        console.warn('[Apply Corrections] Split action missing splitAtChar, skipping:', correction);
        return;
      }

      // Default speakerBefore to original speaker if not provided
      const speakerBefore = correction.speakerBefore || segment.speakerId;

      // Infer speakerAfter if not provided
      let speakerAfter = correction.speakerAfter;
      if (!speakerAfter) {
        // For 2-speaker conversations, the "other" speaker is obvious
        if (allSpeakers.length === 2) {
          speakerAfter = allSpeakers.find(s => s !== speakerBefore) || speakerBefore;
          console.debug('[Apply Corrections] Inferred speakerAfter for 2-speaker conversation:', {
            speakerBefore,
            speakerAfter,
            allSpeakers
          });
        } else {
          // Can't infer with >2 speakers - skip this correction
          console.warn('[Apply Corrections] Split action missing speakerAfter and cannot infer (>2 speakers), skipping:', correction);
          return;
        }
      }

      const splitPos = correction.splitAtChar;
      if (splitPos <= 0 || splitPos >= segment.text.length) {
        console.warn('[Apply Corrections] Invalid split position, skipping:', {
          splitAtChar: splitPos,
          textLength: segment.text.length
        });
        return;
      }

      const textBefore = segment.text.substring(0, splitPos).trim();
      const textAfter = segment.text.substring(splitPos).trim();

      // Interpolate timestamps based on character ratio (rough but reasonable)
      const charRatio = textBefore.length / segment.text.length;
      const durationMs = segment.endMs - segment.startMs;
      const splitTimeMs = segment.startMs + Math.floor(durationMs * charRatio);

      console.debug('[Apply Corrections] Splitting segment:', {
        segmentIndex: segIndex,
        splitAtChar: splitPos,
        charRatio: charRatio.toFixed(2),
        speakerBefore: speakerBefore,
        speakerAfter: speakerAfter,
        reason: correction.reason,
        beforeLength: textBefore.length,
        afterLength: textAfter.length
      });

      // Create two new segments
      const segmentBefore = {
        text: textBefore,
        startMs: segment.startMs,
        endMs: splitTimeMs,
        speakerId: speakerBefore,
        index: segment.index  // Will be re-indexed later
      };

      const segmentAfter = {
        text: textAfter,
        startMs: splitTimeMs,
        endMs: segment.endMs,
        speakerId: speakerAfter,
        index: segment.index  // Will be re-indexed later
      };

      // Replace the original segment with the two new ones
      modifiedSegments.splice(segIndex, 1, segmentBefore, segmentAfter);
    }
  });

  // Re-index all segments after corrections
  modifiedSegments = modifiedSegments.map((seg, idx) => ({
    ...seg,
    index: idx
  }));

  console.log('[Apply Corrections] Corrections applied:', {
    originalSegmentCount: segments.length,
    finalSegmentCount: modifiedSegments.length,
    segmentsAdded: modifiedSegments.length - segments.length
  });

  return modifiedSegments;
}

/**
 * NEW: Merge WhisperX segments with Gemini analysis
 */
function mergeWhisperXAndGeminiData(
  whisperxData: {
    segments: Array<{ text: string; startMs: number; endMs: number; speakerId: string; index: number }>;
    speakers: Array<{ id: string; name: string }>;
  },
  analysis: GeminiAnalysis,
  conversationId: string,
  userId: string
): {
  title: string;
  speakers: Record<string, Speaker>;
  segments: Segment[];
  terms: Record<string, Term>;
  termOccurrences: TermOccurrence[];
  topics: Topic[];
  people: Person[];
  durationMs: number;
} {
  console.debug('[Merge] Merging WhisperX and Gemini data...');

  // Build a set of names mentioned in the People list (people talked ABOUT, not speakers)
  // We use this to prevent Gemini from confusing mentioned people with actual speakers
  const mentionedPeopleNames = new Set<string>(
    (analysis.people || [])
      .map(p => p.name?.toLowerCase().trim())
      .filter((name): name is string => !!name)
  );

  // Map speakers (use Gemini's inferred names/roles if available)
  const speakers: Record<string, Speaker> = {};
  whisperxData.speakers.forEach((s, idx) => {
    let displayName = s.name;  // Default: "Speaker 1", "Speaker 2", etc.

    // If Gemini identified the speaker, use that information
    if (analysis.speakerNotes) {
      const speakerNote = analysis.speakerNotes.find(n => n.speakerId === s.id);
      if (speakerNote) {
        if (speakerNote.inferredName) {
          const inferredLower = speakerNote.inferredName.toLowerCase().trim();

          // SAFETY CHECK: Don't use the inferred name if it matches someone in the People list
          // This prevents confusing people talked ABOUT with actual speakers
          if (mentionedPeopleNames.has(inferredLower)) {
            console.warn(`[Merge] Rejecting inferred speaker name "${speakerNote.inferredName}" - matches someone in People list (talked about, not a speaker)`);
            // Fall through to use role or default name instead
            if (speakerNote.role) {
              displayName = `${s.name} (${speakerNote.role})`;
            }
          } else {
            // Use the real name if detected (e.g., "John" instead of "Speaker 1")
            displayName = speakerNote.inferredName;
            // Optionally append role if we have it
            if (speakerNote.role) {
              displayName = `${speakerNote.inferredName} (${speakerNote.role})`;
            }
          }
        } else if (speakerNote.role) {
          // No name but we know the role (e.g., "Speaker 1 (host)")
          displayName = `${s.name} (${speakerNote.role})`;
        } else if (speakerNote.notes) {
          // Just notes (e.g., "Speaker 1 (works at Google)")
          displayName = `${s.name} (${speakerNote.notes})`;
        }
      }
    }

    speakers[s.id] = {
      speakerId: s.id,
      displayName,
      colorIndex: idx
    };
  });

  // Log speaker identification results
  const speakerSummary = Object.values(speakers).map(s => s.displayName).join(', ');
  console.debug(`[Merge] Speaker identification: ${speakerSummary}`);

  // Map segments (already have correct timestamps from WhisperX)
  const segments: Segment[] = whisperxData.segments.map((seg, idx) => ({
    segmentId: `seg_${idx}`,
    index: idx,
    speakerId: seg.speakerId,
    startMs: seg.startMs,
    endMs: seg.endMs,
    text: seg.text
  }));

  // Map terms
  const terms: Record<string, Term> = {};
  analysis.terms.forEach(t => {
    terms[t.id] = {
      termId: t.id,
      key: t.term.toLowerCase(),
      display: t.term,
      definition: t.definition,
      aliases: t.aliases || []
    };
  });

  // Calculate term occurrences
  const termOccurrences: TermOccurrence[] = [];
  let occCount = 0;

  segments.forEach(seg => {
    Object.values(terms).forEach(term => {
      const patterns = [term.display, ...term.aliases].map(p =>
        p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      );
      const regex = new RegExp(`\\b(${patterns.join('|')})\\b`, 'gi');

      let match;
      while ((match = regex.exec(seg.text)) !== null) {
        termOccurrences.push({
          occurrenceId: `occ_${occCount++}`,
          termId: term.termId,
          segmentId: seg.segmentId,
          startChar: match.index,
          endChar: match.index + match[0].length
        });
      }
    });
  });

  // Map topics
  const topics: Topic[] = analysis.topics.map((t, idx) => ({
    topicId: `top_${idx}`,
    title: t.title,
    startIndex: t.startSegmentIndex,
    endIndex: t.endSegmentIndex,
    type: t.type as 'main' | 'tangent'
  }));

  // Map people
  const people: Person[] = (analysis.people || []).map((p, idx) => ({
    personId: `p_${idx}`,
    name: p.name,
    affiliation: p.affiliation
  }));

  // Calculate duration from WhisperX segments
  const lastSegment = segments[segments.length - 1];
  const durationMs = lastSegment ? lastSegment.endMs : 0;

  console.debug('[Merge] Merge complete:', {
    title: analysis.title,
    speakerCount: Object.keys(speakers).length,
    segmentCount: segments.length,
    termCount: Object.keys(terms).length,
    termOccurrenceCount: termOccurrences.length,
    topicCount: topics.length,
    personCount: people.length,
    durationMs
  });

  return {
    title: analysis.title,
    speakers,
    segments,
    terms,
    termOccurrences,
    topics,
    people,
    durationMs
  };
}
