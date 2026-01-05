# How to Query the Firestore Emulator

This guide shows you how to query and extract data from the Firestore emulator during local development.

## Quick Reference

```bash
# List all documents in a collection
npm run db:debug list _metrics

# Get a specific document
npm run db:debug get _metrics vsux1xi7PALTwxjdP2K0

# Save output to file
npm run db:debug get _metrics vsux1xi7PALTwxjdP2K0 > output.json
```

## Why Not Use curl?

You might expect to query the Firestore emulator REST API directly:

```bash
# ❌ This doesn't work
curl "http://localhost:8080/v1/projects/audio-transcript-analyzer-01/databases/(default)/documents/_metrics"
```

**Two problems:**

1. **Wrong port**: Firestore emulator runs on port **8081** (not 8080)
2. **Authentication required**: Security rules are enforced even in the emulator. Direct REST API calls without auth tokens are blocked.

While you can use the web UI at `http://localhost:4000/firestore`, it's not scriptable or command-line friendly.

## Solution: Use the Debug Script

The `scripts/debug-firestore.js` script uses the Firebase Admin SDK to bypass security rules and query the emulator directly.

### List All Documents in a Collection

```bash
npm run db:debug list _metrics
```

**Output:**
```
📁 Collection: _metrics (1 documents)

📄 vsux1xi7PALTwxjdP2K0
{
  "conversationId": "c_1767463097228",
  "userId": "wfodUGTqYzk7vGSFASXx0ffOKB1y",
  "status": "success",
  ...
}
---
```

### Get a Specific Document

```bash
npm run db:debug get _metrics vsux1xi7PALTwxjdP2K0
```

**Output:**
```
📄 Document: _metrics/vsux1xi7PALTwxjdP2K0

{
  "conversationId": "c_1767463097228",
  "userId": "wfodUGTqYzk7vGSFASXx0ffOKB1y",
  ...
}
```

### Query Any Collection

```bash
npm run db:debug list conversations
npm run db:debug get conversations c_1767463097228
npm run db:debug list _user_stats
npm run db:debug get _user_stats wfodUGTqYzk7vGSFASXx0ffOKB1y
```

## Saving Output

Pipe the output to a file or use with other tools:

```bash
# Save JSON to file
npm run db:debug get _metrics vsux1xi7PALTwxjdP2K0 > metrics-snapshot.json

# Extract specific fields with jq
npm run db:debug get _metrics vsux1xi7PALTwxjdP2K0 | jq '.estimatedCost'

# Count documents
npm run db:debug list conversations | grep "📄" | wc -l
```

## How It Works

The script at `scripts/debug-firestore.js`:

1. Initializes Firebase Admin SDK (bypasses security rules)
2. Connects to the emulator at `localhost:8081`
3. Queries Firestore collections/documents
4. Outputs formatted JSON

**Key configuration:**
```javascript
// Points to emulator instead of production
db.settings({
  host: 'localhost:8081',
  ssl: false
});
```

## Common Collections

| Collection | Description |
|------------|-------------|
| `conversations` | User transcript data |
| `_metrics` | Processing metrics and costs |
| `_user_stats` | Per-user aggregated statistics |
| `_user_events` | User activity event log |
| `_pricing` | Pricing configuration |

## Troubleshooting

### "Cannot find package 'firebase-admin'"

Install the dependency:
```bash
npm install
```

The `firebase-admin` package is listed in `devDependencies`.

### "Connection refused" or "Failed to connect"

Make sure the Firestore emulator is running:
```bash
npm run dev:emulators
# or
npm run dev:full
```

Check the emulator is running on port 8081:
```bash
lsof -i :8081
```

### Script returns empty results

The collection might be empty, or the document ID might be wrong. Use the web UI to verify:
```
http://localhost:4000/firestore
```

## Related Documentation

- [How to Run Firebase Emulators](./run-firebase-emulators-cleanly.md) - Starting the emulator
- [Local Development Guide](./local-development.md) - Full development workflow
- [Data Model Reference](../reference/data-model.md) - Collection schemas
