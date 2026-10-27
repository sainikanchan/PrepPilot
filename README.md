# PrepPilot

PrepPilot is a full-stack interview-preparation platform. A candidate logs in,
configures an interview (domain, difficulty, question count), answers questions
with speech-to-text support while a live camera/microphone preview and a
combined in-memory recording run, and receives a real, data-driven evaluation
report with per-answer feedback, adaptive difficulty history, and delivery
metrics.

## Architecture

```
PrepPilot/
├── backend/            FastAPI + SQLAlchemy + SQLite
│   ├── app/
│   │   ├── main.py            App wiring, CORS, safe schema patch, seed
│   │   ├── config.py          Env-based configuration
│   │   ├── database.py        Engine/session/Base + get_db
│   │   ├── models.py          User, Question, InterviewSession, InterviewAnswer
│   │   ├── schemas.py         Pydantic request/response models
│   │   ├── security.py        PBKDF2 password hashing, JWT, get_current_user
│   │   ├── routers/           auth, profile, interviews, reports
│   │   └── services/
│   │       ├── nlp_service.py spaCy pipeline + scoring + STAR heuristics
│   │       ├── question_bank.py  Seed question bank data
│   │       └── report_service.py Report assembly from saved data
│   ├── tests/             pytest suite (API + NLP + isolation + seeding)
│   └── preppilot.db       SQLite database (keep this file)
└── Frontend/           React 18 + Vite + react-router + MediaPipe
    └── src/main.jsx    Full SPA (auth, dashboard, setup, interview, report, profile)
```

## Tech stack

- Backend: Python 3.12, FastAPI, SQLAlchemy 2, PyJWT, spaCy 3.8
- NLP: spaCy `en_core_web_md` (tokenizer, tagger, parser, NER, word vectors)
- Frontend: React 18, Vite 6, react-router-dom 6, @mediapipe/tasks-vision
- DB: SQLite (default), configurable via `DATABASE_URL`

## Prerequisites

- Python 3.12 (3.11+ generally works)
- Node 18+ (v22 verified)
- Internet access once, to download the spaCy model

## Backend setup

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m spacy download en_core_web_md
cp .env.example .env             # edit JWT_SECRET for real deployments
uvicorn app.main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs

## Frontend setup

```bash
cd Frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
```

The frontend expects the API at `http://127.0.0.1:8000/api` (override with
`VITE_API_URL`).

## Environment variables (backend/.env)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./preppilot.db` | SQLAlchemy URL |
| `JWT_SECRET` | dev fallback | **Change in production** |
| `TOKEN_EXPIRE_MINUTES` | `1440` | JWT lifetime |

## Database and seeding

Schema is created automatically on startup. Seeding is **idempotent** and runs
at startup: it inserts only seed questions whose `text` is not already present.
Nothing is deleted; existing questions, users, and interview history are kept.
To re-run manually:

```bash
cd backend && .venv/bin/python -c "from app.main import seed_questions; seed_questions()"
```

## NLP pipeline

`app/services/nlp_service.py`:

1. **Preprocessing** – whitespace normalization, sentence segmentation,
   tokenization, stop-word filtering, lemmatization, noun-phrase extraction,
   NER (spaCy `en_core_web_md`, loaded once).
2. **Concept extraction** – expected concepts matched via lemmatized overlap,
   noun-chunk presence, a curated synonym map, and per-concept vector
   similarity (no exact-string-only matching).
3. **Semantic similarity** – cosine similarity of spaCy word vectors against
   the question's reference answer. Transparent TF-IDF fallback if the model
   is unavailable; the active method is always reported in `evaluationMethod`.
4. **Evaluation dimensions** (each returned with evidence):
   relevance, concept coverage, technical depth, clarity, completeness,
   structure. Technical questions include a limited `correctness` estimate
   derived from similarity + coverage. Behavioral questions include a **STAR**
   component check (situation/task/action/result present or missing), labeled
   as heuristic.

## Adaptive difficulty

Rule-based (not ML): after each evaluated answer the next question is swapped
within the same domain toward a stronger/weaker/equal difficulty level
(strong ≥ 80 → up, weak < 50 → down, else same), never repeating a question,
with every change recorded in `adaptationHistory` including the reason.

## Delivery metrics

Speech rate, pause count, face presence, framing/eye-contact estimate, and a
delivery/confidence estimate are computed in the browser (Web Speech API +
MediaPipe) and stored per answer. They are **separate** from answer correctness
and are labeled as estimates, not psychological measurements. Raw audio/video
is kept in memory only and never uploaded.

## Testing

```bash
cd backend
.venv/bin/python -m pytest tests -q
```

Covers: registration, login, invalid credentials, protected route without
token, interview start, selected count, answer submission, duplicate guard,
empty answer, strong/weak/irrelevant scoring, technical evaluation, STAR,
next question, adaptive difficulty, completion, report retrieval, report and
session ownership (two accounts), and idempotent seeding.

Frontend: `cd Frontend && npm run build` (verified with Vite 6).

## Browser limitations

- Speech recognition uses the browser Web Speech API (Chrome/Edge best).
  Unsupported browsers get a clear message and a manual text fallback.
- Combined recording uses `MediaRecorder`; MIME support is checked and
  unsupported formats are handled. Recording is kept in memory and not
  persisted.
- Camera/microphone delivery metrics are estimates and cannot prove
  confidence, honesty, or competence.

## Demo instructions

1. Start backend (`uvicorn app.main:app --port 8000`) and frontend (`npm run dev`).
2. Register or log in → Dashboard.
3. Pick domain, difficulty, question count → Start Interview.
4. Grant camera + microphone permission; observe live preview and recording indicator.
5. Speak an answer (or type), review the transcript, submit.
6. See evaluation feedback and, on behavioral questions, STAR analysis.
7. Watch adaptive difficulty (history after each answer).
8. Finish → report with per-answer analysis and delivery summary.
9. Log in as a second account: profile, dashboard, and reports are separate.

## Dynamic question generation (optional)

Interview start and Practice Mode use a hybrid selector
(`backend/app/services/question_generation.py`): randomized bank selection
always works; when an OpenAI-compatible provider is configured, generated
questions are validated and preferred, with automatic fallback to the bank on
missing key, timeout, or invalid output.

Configure via backend env vars (in `backend/.env`):

```
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
QUESTION_GEN_TIMEOUT_SECONDS=15
```

Generated questions are stored in the `questions` table with
`source='generated'`; bank questions keep `source='question_bank'`. Per-session
duplicates are prevented; a user's questions from their 3 most recent sessions
are deprioritized when a fresh alternative exists.

## Gemini as the question provider

Set in `backend/.env` ( placeholders only in `.env.example` ):

```
QUESTION_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-3-flash-preview
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
```

Create a key in Google AI Studio, paste it into `backend/.env` (never in
frontend code or tracked files — root `.gitignore` ignores `.env`), and
restart the backend. Free-tier availability and limits depend on Google's
current terms and your account. Falls back to the randomized bank on any
provider failure, and OpenAI remains available via `QUESTION_PROVIDER=openai`
with the existing `OPENAI_*` settings.
