# Speaker Naming Requirements

## Overview
This document outlines the requirements for speaker identification and naming in the Audio Transcript Analysis App.

## Requirements

### Speaker Identification Strategy

**Default Behavior: Generic Tags**
- Unless people explicitly introduce themselves during the conversation, use generic speaker tags
- Format: `Speaker 1`, `Speaker 2`, `Speaker 3`, etc.
- Rationale: Prevents hallucination of names; maintains accuracy when identities are unknown

**Named Speakers**
- If a person introduces themselves during the conversation, use their actual name
- Example: "Hi, I'm Sarah" → Use "Sarah" instead of "Speaker 1"
- The AI should detect self-introductions and third-party introductions naturally

### Implementation Notes

**Current State**
- Gemini API returns speaker labels in structured output
- The `speakers` array in the response contains speaker identifiers
- Each segment references a speaker ID

**Expected Behavior**
```typescript
// Generic case (no introductions)
{
  speakers: [
    { id: "1", name: "Speaker 1" },
    { id: "2", name: "Speaker 2" }
  ]
}

// Named case (with introductions)
{
  speakers: [
    { id: "1", name: "Sarah" },
    { id: "2", name: "Speaker 2" }  // Only Sarah introduced herself
  ]
}
```

### AI Prompt Guidance
The Gemini API prompt should be updated to include this instruction:
- "For speaker names, use generic labels like 'Speaker 1', 'Speaker 2' unless the person explicitly introduces themselves by name during the conversation."

### Future Enhancements
- User ability to manually rename speakers after transcript generation
- Remember speaker names across conversations (requires backend/auth)
- Voice fingerprinting for automatic speaker recognition (advanced feature)

## Related Files
- `src/utils.ts` - Contains `processAudioWithGemini()` where speaker detection happens
- `src/types.ts` - Defines `Speaker` interface
- `src/components/viewer/TranscriptSegment.tsx` - Renders speaker labels

## Status
- **Current**: Not explicitly enforced in prompt
- **Required**: Add explicit instruction to Gemini API prompt
- **Priority**: Medium (affects transcript quality and accuracy)
