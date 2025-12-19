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

// Define secret for Gemini API key (set via: firebase functions:secrets:set GEMINI_API_KEY)
const geminiApiKey = defineSecret('GEMINI_API_KEY');

// Types matching the client-side schema
interface AIResponse {
  title: string;
  speakers: { id: string; name: string }[];
  segments: { speakerId: string; startMs: number; endMs: number; text: string }[];
  terms: { id: string; term: string; definition: string; aliases: string[] }[];
  topics: { title: string; startSegmentIndex: number; endSegmentIndex: number; type: 'main' | 'tangent' }[];
  people: { name: string; affiliation: string }[];
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
 * Triggered when an audio file is uploaded to storage.
 * Path pattern: audio/{userId}/{conversationId}.{extension}
 */
export const transcribeAudio = onObjectFinalized(
  {
    secrets: [geminiApiKey],
    memory: '1GiB', // Audio processing needs more memory
    timeoutSeconds: 540, // 9 minutes (max for 1st gen functions)
    region: 'us-central1'
  },
  async (event) => {
    const filePath = event.data.name;
    const contentType = event.data.contentType;

    // Only process audio files in the audio/ directory
    if (!filePath.startsWith('audio/') || !contentType?.startsWith('audio/')) {
      console.log('Skipping non-audio file:', filePath);
      return;
    }

    // Parse path: audio/{userId}/{conversationId}.{ext}
    const pathParts = filePath.split('/');
    if (pathParts.length !== 3) {
      console.error('Invalid audio path structure:', filePath);
      return;
    }

    const userId = pathParts[1];
    const fileName = pathParts[2];
    const conversationId = fileName.split('.')[0];

    console.log('Processing audio file:', {
      filePath,
      userId,
      conversationId,
      contentType,
      size: event.data.size
    });

    try {
      // Update status to processing
      await db.collection('conversations').doc(conversationId).update({
        status: 'processing',
        updatedAt: FieldValue.serverTimestamp()
      });

      // Download audio file to memory
      const file = bucket.file(filePath);
      const [audioBuffer] = await file.download();

      console.log('Downloaded audio file:', {
        conversationId,
        bufferSize: audioBuffer.length
      });

      // Process with Gemini
      const result = await processWithGemini(
        audioBuffer,
        contentType,
        geminiApiKey.value()
      );

      // Transform AI response to our data model
      const processedData = transformAIResponse(result, conversationId, userId);

      // Save results to Firestore
      await db.collection('conversations').doc(conversationId).update({
        ...processedData,
        status: 'complete',
        audioStoragePath: filePath,
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log('Transcription complete:', {
        conversationId,
        segmentCount: processedData.segments.length,
        speakerCount: Object.keys(processedData.speakers).length
      });

    } catch (error) {
      console.error('Transcription failed:', {
        conversationId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Update status to failed
      await db.collection('conversations').doc(conversationId).update({
        status: 'failed',
        processingError: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: FieldValue.serverTimestamp()
      });
    }
  }
);

/**
 * Process audio with Gemini API
 */
async function processWithGemini(
  audioBuffer: Buffer,
  contentType: string,
  apiKey: string
): Promise<AIResponse> {
  const genAI = new GoogleGenerativeAI(apiKey);

  // Use gemini-2.5-flash for multimodal audio processing
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          speakers: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                id: { type: SchemaType.STRING },
                name: { type: SchemaType.STRING }
              },
              required: ['id', 'name']
            }
          },
          segments: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                speakerId: { type: SchemaType.STRING },
                startMs: { type: SchemaType.INTEGER },
                endMs: { type: SchemaType.INTEGER },
                text: { type: SchemaType.STRING }
              },
              required: ['speakerId', 'startMs', 'endMs', 'text']
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
        required: ['title', 'speakers', 'segments', 'terms', 'topics', 'people']
      }
    }
  });

  const prompt = `
    You are an expert transcriber and analyst. Process the attached audio file.

    Tasks:
    1. Transcribe the conversation verbatim.
    2. Identify different speakers (e.g., Speaker 1, Speaker 2) and attribute each segment to them.
    3. Segment the text based on natural pauses or speaker changes. Provide accurate start and end timestamps in milliseconds.
    4. Identify technical terms, acronyms, or complex concepts mentioned. Provide a clear, short definition for each based on the context.
    5. Identify the main topics and any tangents.
    6. Identify people mentioned in the conversation (distinct from the speakers themselves, if possible). Extract their full name and inferred affiliation/organization/role.

    Populate the JSON schema provided in the configuration.
  `;

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: contentType,
        data: audioBuffer.toString('base64')
      }
    },
    { text: prompt }
  ]);

  const responseText = result.response.text();
  const cleanJson = responseText.replace(/```json\s*|\s*```/g, '').trim();

  return JSON.parse(cleanJson) as AIResponse;
}

/**
 * Transform AI response to our internal data model
 * Matches the logic from client-side utils.ts
 */
function transformAIResponse(
  data: AIResponse,
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
  // Map speakers
  const speakers: Record<string, Speaker> = {};
  data.speakers.forEach((s, idx) => {
    speakers[s.id] = {
      speakerId: s.id,
      displayName: s.name,
      colorIndex: idx
    };
  });

  // Prepare segments with temp IDs for topic resolution
  let rawSegments = data.segments.map((s, idx) => ({
    tempId: `temp_${idx}`,
    speakerId: s.speakerId,
    startMs: s.startMs,
    endMs: s.endMs,
    text: s.text
  }));

  // Resolve topics to temp segment IDs
  const rawTopics = data.topics.map((t, idx) => {
    const startSeg = rawSegments[t.startSegmentIndex] || rawSegments[0];
    const endSeg = rawSegments[t.endSegmentIndex] || rawSegments[rawSegments.length - 1];
    return {
      topicId: `top_${idx}`,
      title: t.title,
      type: t.type,
      startSegmentTempId: startSeg?.tempId,
      endSegmentTempId: endSeg?.tempId
    };
  });

  // Sort segments chronologically
  rawSegments.sort((a, b) => a.startMs - b.startMs);

  // Finalize segments with stable IDs
  const segments: (Segment & { tempId: string })[] = rawSegments.map((s, idx) => ({
    segmentId: `seg_${idx}`,
    tempId: s.tempId,
    index: idx,
    speakerId: s.speakerId,
    startMs: s.startMs,
    endMs: s.endMs,
    text: s.text
  }));

  // Map terms
  const terms: Record<string, Term> = {};
  data.terms.forEach(t => {
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

  // Finalize topics
  const topics: Topic[] = rawTopics.map(t => {
    const startIndex = segments.findIndex(s => s.tempId === t.startSegmentTempId);
    const endIndex = segments.findIndex(s => s.tempId === t.endSegmentTempId);
    return {
      topicId: t.topicId,
      title: t.title,
      startIndex: startIndex === -1 ? 0 : startIndex,
      endIndex: endIndex === -1 ? 0 : endIndex,
      type: t.type as 'main' | 'tangent'
    };
  });

  // Map people
  const people: Person[] = (data.people || []).map((p, idx) => ({
    personId: `p_${idx}`,
    name: p.name,
    affiliation: p.affiliation
  }));

  // Calculate duration
  const lastSegment = segments[segments.length - 1];
  const durationMs = lastSegment ? lastSegment.endMs : 0;

  // Clean up temp IDs
  const cleanSegments: Segment[] = segments.map(({ tempId, ...rest }) => rest);

  return {
    title: data.title,
    speakers,
    segments: cleanSegments,
    terms,
    termOccurrences,
    topics,
    people,
    durationMs
  };
}
