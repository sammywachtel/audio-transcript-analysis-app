# How to Use the Chat Feature

This guide explains how to use the chat feature to ask questions about your transcript conversations.

## Overview

The chat feature allows you to ask natural language questions about your transcript and get AI-powered answers with timestamp citations that link directly to relevant segments.

**Key Features:**
- Persistent chat history (survives page reloads and works across devices)
- Timestamp citations that link to transcript segments
- 50 message limit per conversation
- Export chat history as JSON
- Clear history when needed

## Starting a Chat

1. Open any completed conversation in the Viewer
2. Click the **Chat** tab in the right sidebar
3. Type your question in the input field at the bottom
4. Press Enter or click Send

### Example Questions

- "What are the main topics discussed?"
- "Who are the key people mentioned?"
- "What decisions were made?"
- "Can you summarize the conversation?"
- "What did Speaker 1 say about the budget?"

## Understanding Chat Responses

### Timestamp Citations

When the AI references specific parts of the transcript, it includes clickable timestamp citations. Click any timestamp to:
- Jump to that segment in the transcript
- Seek the audio to that exact moment

### Unanswerable Questions

If the AI determines it cannot answer based on the transcript content, you'll see a message indicating the question is unanswerable. Try rephrasing or asking a more specific question.

### Cost Display

Each message shows the AI processing cost in USD. This helps you track your usage.

## Chat History Persistence

Your chat history is automatically saved to the cloud and persists across:
- Page reloads
- Different devices
- Browser sessions

**Loading Older Messages:**
- The chat initially loads the 10 most recent messages
- Click "Load older messages" at the top to view earlier conversations
- Messages load in batches of 10

## Message Limits

Each conversation has a **50 message limit** (user messages + AI responses combined).

### Limit Warnings

- **45-49 messages:** Yellow warning badge shows "Near limit"
- **50 messages:** Red badge shows "Limit reached" and input is disabled

### When You Hit the Limit

You have two options:

1. **Clear History:** Delete all messages to start fresh
2. **Export History:** Save your conversation before clearing

## Managing Chat History

### Clearing History

1. Click the trash icon in the chat controls bar
2. Review the confirmation modal
3. Click "Clear History" to permanently delete all messages
4. Message count resets to 0/50

**Important:** This action cannot be undone. Consider exporting first.

### Exporting History

1. Click the download icon in the chat controls bar
2. A JSON file downloads with all messages and metadata

**Export includes:**
- All messages (user + assistant)
- Timestamps
- Timestamp citations
- Processing costs
- Export date and conversation info

The JSON format is structured for easy reading and processing:

```json
{
  "conversationTitle": "Team Meeting - Q1 Planning",
  "conversationId": "abc123",
  "exportedAt": "2025-01-15T10:30:00Z",
  "messageCount": 24,
  "messages": [
    {
      "role": "user",
      "content": "What were the main action items?",
      "createdAt": "2025-01-15T10:15:00Z"
    },
    {
      "role": "assistant",
      "content": "The main action items discussed were...",
      "sources": [...],
      "costUsd": 0.002,
      "createdAt": "2025-01-15T10:15:05Z"
    }
  ]
}
```

## Tips for Better Results

1. **Be specific:** Instead of "Tell me about this," ask "What did Speaker 2 say about the new product launch?"

2. **Reference context:** The AI knows about speakers, terms, topics, and people mentioned in the transcript

3. **Ask follow-ups:** The AI maintains context within the conversation

4. **Use the limit wisely:** If approaching the limit, consider starting a fresh conversation or exporting important discussions

## Troubleshooting

### Messages Not Appearing

- Check your internet connection
- Refresh the page
- Verify you're signed in with the correct account

### "Load older" Button Missing

- This appears only when there are messages older than the currently displayed ones
- If you see all messages, the button won't appear

### Chat Input Disabled

- Check if you've hit the 50 message limit (look for red warning banner)
- Clear history to continue chatting

### Error Messages

If you see an error:
- Check the error message for specific details
- Common issues: network problems, rate limits, authentication
- Try refreshing the page or signing out and back in

## Privacy and Data

- Chat history is private to your account
- Messages are stored in your Firestore database
- Deleting a conversation also deletes all associated chat history
- No one else can see your chat conversations

## Related Documentation

- **[Data Model Reference](../reference/data-model.md)** - Chat history data structure
- **[Architecture Reference](../reference/architecture.md)** - How chat works under the hood
