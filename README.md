# Luke Memory

**A second brain with a smaller job: remember, retrieve, and help you follow up.**

An always-on-top Electron companion: a small draggable widget stays on your
screen, and clicking it opens an anchored chat panel. Recall saved memories,
add notes, and manage lightweight tasks without opening a separate chat window. Screen collection is opt-in. It starts paused by default; explicitly setting
`LUKE_AUTO_CAPTURE=1` with `LUKE_ALLOW_CAPTURE=1` enables collection on launch.

![Luke Memory desk with a synthetic record and local recall answer](docs/preview.png)

This is a focused continuation of the collaborative Luke-os project. See
[NOTICE.md](NOTICE.md) for attribution and the retained [MIT license](LICENSE).

## Included

- **Desktop companion:** click the floating widget to chat; click away or press
  Escape to tuck chat away. Cmd/Ctrl+Shift+Space toggles chat from any app. Drag
  the widget to reposition it; its position is remembered across launches.
- **Memories:** explicit notes and one digest per local day, with no growing
  navigation badge. Raw screen and chat evidence stays available through search
  and the optional **Show raw activity** view.
- **Search:** SQLite FTS5 retrieval across saved titles and memory content.
- **Text agent with memory:** ordinary conversation works without saved records.
  Chat turns persist in SQLite and recent turns are restored after restart. Relevant
  records ground personal recall; only cited records appear under an answer.
  Reference markers are model-generated, not independently verified citations.
- **Compaction:** summarize new records on demand. Collection checks about every
  two minutes. Completed chats also trigger compaction once four records are
  pending; smaller batches become eligible after five minutes. Active screen
  sessions wait until their five-minute interval has closed. Each summary tracks
  its covered inputs atomically, preventing repeated summarization of the same batch. Original records and the full chat transcript
  remain available; this reduces prompt context, not disk storage.
- **Tasks:** add a task, mark it complete by stable ID, and see the pending count.
- **Quick navigation:** Cmd/Ctrl+K focuses search; Cmd/Ctrl+N opens a new note.
  The layout adapts to narrow windows, and recall chat shows a pending response state.
- **Optional screen memory:** macOS Vision OCR extracts primary-screen text locally
  every 30 seconds, without a vision LLM. New text merges into five-minute
  session records, with an overflow record if a session exceeds 12,000 characters.
  Durable pixel hashes skip identical screens across restarts; a visual-difference check tolerates tiny changes, and
  normalized text hashes suppress repeated extracted text. Raw images are transient.
  The quick panel shows a stable collection status. Duplicate counters are kept
  in diagnostics rather than turning every observation into a visible notification.

There are no stress scores, webcam/emotion analysis, clipboard interception,
keyboard/mouse tracking, productivity scoring, focus enforcement, voice coaching,
or counselor reports. This is a desktop app, not a hosted monitoring service.

## Run locally

Python 3.12+ and a Node.js version supported by the pinned Electron release are required.
The current npm scripts use macOS/Linux environment-variable syntax.

```sh
git clone https://github.com/aryanparab/luke-memory.git
cd luke-memory
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock
npm ci
cp .env.example .env
# macOS: compile the local OCR helper (requires Apple command-line tools)
npm run setup:ocr
npm start
```

The backend binds to **127.0.0.1:5051**. Electron starts with only the floating
widget visible; chat stays hidden until requested. Use the panel’s library button
or the menu-bar/tray menu to open the full memory library. Quit Luke through the
tray menu. The launcher starts its own backend when needed and stops only that
process on exit; an already running backend is reused. It never starts capture.
Browser access at http://localhost:5051 is an optional development preview.
For backend-only development:

```sh
.venv/bin/python backend/app.py
```

### Local models

Install Ollama and pull the text model:

```sh
ollama pull gemma2:2b
ollama serve
```

Omit `ollama serve` if the Ollama app is already running. Text inference is local
by default. Screen extraction uses Apple's local Vision OCR through the compiled
helper, **not** a generative vision model. OCR may miss text and does not describe
images or diagrams. Only the primary display is collected.

Set `LUKE_ALLOW_CAPTURE=1` in your private `.env`, then use **Start memory** in the
widget panel (or recording controls in the library). To explicitly opt into
collection at every launch, also set `LUKE_AUTO_CAPTURE=1`. Pause with **Pause
memory**. Screen Recording permission is required for the backend process; a
capture already in flight may finish after pausing.

Optional `LUKE_EXTRACTOR=vision` retains the earlier Ollama vision path and needs
an installed vision-capable model matching `LUKE_VISION_MODEL`, e.g. `gemma3:4b`.
The OCR default currently supports macOS; other systems require this explicit
vision path. No images go to a cloud provider.

### Optional Groq text provider

For faster cloud text chat, set these in your local `.env`:

```dotenv
LUKE_PROVIDER=groq
LUKE_TEXT_MODEL=openai/gpt-oss-20b
GROQ_API_KEY=your_key
```

With this option, questions and retrieved memory excerpts are sent to Groq.
Summaries also send the selected records to Groq. Screen images still go only to
the configured Ollama endpoint. There is no automatic cloud fallback for images
or local model failures. The default Ollama URL is loopback; changing it to a
remote host sends content to that host. Never commit keys or personal memory data.

## Architecture

```text
Electron widget → anchored chat / optional memory library
           │ same-origin local HTTP
           ▼
       Flask API ──────────► SQLite: memories + FTS5 + tasks
           │
           ├── text chat / summary ──► Ollama (default) or Groq (explicit)
           └── opt-in screen capture ──► macOS OCR (default) / local Ollama vision
```

Data lives in `.data/memory.sqlite3` by default. Set `LUKE_DATA_DIR` to another
local directory to change it. This repository does not import, copy, or publish
existing `~/.luke` history. SQLite is not encrypted; protect the data directory
like other personal files. No cloud sync or multi-user access is implemented.
The API rejects non-local hosts and cross-origin writes. Do not expose it as a
public backend.

## Checks

```sh
.venv/bin/python -m unittest discover -s tests -v
npm run check
```

Twenty-five Python regressions cover persistence, conversation restoration, follow-up
context, source filtering, task IDs, extraction retries, exact/near/text duplicate
suppression, duplicate detection after restart, compaction input coverage, screen-session batching, stale-summary protection,
curated daily digests, small-talk filtering and failure recovery, validation and local request restrictions. Four Node tests cover
widget placement across monitor boundaries. Automated capture tests use generated
images and fake extractors, never private screen contents. A separate native OCR
fixture verifies Apple's text recognition on generated text.

## Repository layout

```text
backend/app.py       Local routes and request validation
backend/store.py     Transactional SQLite and FTS5
backend/models.py    Explicit local/cloud model adapters
backend/capture.py   Opt-in OCR capture, durable dedup and compaction
backend/ocr.swift    Local macOS text-recognition helper
desktop/main.cjs     Sandboxed Electron shell and backend lifecycle
ui/                 Plain HTML/CSS/JS memory desk, chat and tasks
tests/              Synthetic local regression tests
```

## Current limits

Search uses full-text matching, not semantic vector embeddings. Only the primary
screen is captured. Captured text can include private information visible on that
screen; choose what is visible before enabling recording. There is no packaging,
auto-update, secure-at-rest encryption, or medical/behavioral assessment feature.
