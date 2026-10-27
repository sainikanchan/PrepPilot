import os
import sys
import tempfile

# Use an isolated database for the whole test session BEFORE importing the app.
_tmp = tempfile.mkdtemp(prefix="preppilot_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["JWT_SECRET"] = "test-secret"
# Never call a real provider during tests; relevant tests monkeypatch instead.
os.environ["OPENAI_API_KEY"] = ""
os.environ["GEMINI_API_KEY"] = ""
os.environ["QUESTION_PROVIDER"] = "openai"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def register(client, name, email, password="secret123"):
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}
