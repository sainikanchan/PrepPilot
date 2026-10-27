import os

from dotenv import load_dotenv

# Load backend/.env when present; real environment variables take precedence.
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./preppilot.db")
JWT_SECRET = os.getenv("JWT_SECRET", "preppilot-dev-secret-change-me")
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRE_MINUTES", "1440"))

# Optional LLM provider for dynamic question generation. Leave the key empty
# to run purely from the built-in question bank.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
QUESTION_GEN_TIMEOUT_SECONDS = float(os.getenv("QUESTION_GEN_TIMEOUT_SECONDS", "15"))

# Provider selection for dynamic question generation.
QUESTION_PROVIDER = os.getenv("QUESTION_PROVIDER", "openai").strip().lower()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
GEMINI_BASE_URL = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
