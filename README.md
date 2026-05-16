# Search Memory Agent
### Exa API + Continual Learning · Privacy-First Build

---

## What this is

A local research agent that:
- Breaks your query into sub-queries and searches Exa's neural search API
- Scores results by relevance using keyword overlap + domain trust signals
- Learns from your 👍👎 feedback — trusted domains get score boosts in future searches
- Saves research memories you can reuse across sessions
- Applies memory context automatically when a new query matches past research

---

## Quick start

1. **Open `index.html`** directly in any modern browser (Chrome, Firefox, Edge)
   - No server needed. No npm install. Just double-click the file.

2. **Your Exa API key is pre-loaded** for this prototype.
   - To change it: click **"API Setup"** in the top-right corner.

3. **Type a query** and press **Ctrl+Enter** (or click Run Agent).

---

## Privacy architecture

| Data | Where it goes | Who can see it |
|------|--------------|----------------|
| Search queries | Sent to Exa's API | Exa (per their privacy policy) |
| Results, scores | Browser memory only | You only |
| Feedback signals (👍👎) | localStorage | You only |
| Saved memories | localStorage | You only |
| API key | sessionStorage (cleared on tab close) | You only |
| Analytics / telemetry | Nowhere — there is none | N/A |

### What "local-only" means
All learning data (feedback, domain signals, memories) is stored in your browser's
`localStorage`. It never leaves your device. If you clear browser data or open a
different browser, the memory is gone — it's truly local.

### API key security
The current build stores the key in `sessionStorage` (auto-cleared when the tab closes).
**For production use**, never put an API key in frontend code. Route Exa calls through
a backend proxy (Node.js/Python server) that holds the key server-side.

### Your rights
- **Export**: click "Export my data" → downloads a JSON of all memories + signals
- **Wipe**: click "Wipe all local data" → permanently deletes everything from localStorage
- **Delete individual memories**: click ✕ on any memory card

---

## Features

### Agent loop
- Query decomposition: every search becomes 3 targeted sub-queries
- Parallel Exa search with highlights (token-efficient)
- Deduplication by URL
- Relevance scoring: keyword match + Exa's own score + domain trust signal

### Continual learning
- Every 👍 feedback raises that domain's trust score
- Every 👎 feedback lowers it
- Future result scores are blended (80% content relevance + 20% domain trust)
- Learning tab shows trusted vs noisy domains with a precision rate metric

### Memory
- Save any result with 💾
- Memories are matched against future queries by keyword overlap (>28% match threshold)
- Matched memory shows a context banner and boosts trusted domains in scoring
- Click any memory card to prefill the query box

### Privacy dashboard
- Real-time count of queries run, memories saved, feedback signals given
- Full data flow map showing what goes where
- One-click export and wipe

---

## Search depth options

| Mode | Latency | Best for |
|------|---------|----------|
| Fast | ~450ms | Quick lookups, real-time use |
| Auto | ~1s | Default — balanced |
| Deep | ~4-12s | Complex research, structured synthesis |

---

## Planned improvements (pitch to Exa)

1. **Encrypted localStorage** using WebCrypto API — memory protected by a passphrase
2. **Backend proxy** — API key never touches the frontend
3. **Rate limiting** — prevent accidental quota exhaustion
4. **Optional opt-in sync** — user-controlled, end-to-end encrypted sync across devices
5. **Query improvement curve** — graph showing result quality improving over sessions
6. **DPDP Act / GDPR compliance layer** — consent banner, data retention limits, audit log

---

## Tech stack

- Pure HTML + CSS + Vanilla JS (zero dependencies, zero build step)
- Exa Search API (`https://api.exa.ai/search`)
- Browser localStorage / sessionStorage
- Google Fonts (IBM Plex Mono + IBM Plex Sans)

---

## For the Exa team email

Key points to highlight:
- Demonstrates a real gap in Exa's API: **statelessness**
- Shows a learning loop that makes Exa searches measurably better per session
- Built with privacy as a first-class feature — aligns with Exa's no-ads mission
- Identifies 6 concrete product improvements Exa could build natively
- Fully working prototype, not a mockup

Contact: Will Bryk (CEO) · @WilliamBryk on Twitter
