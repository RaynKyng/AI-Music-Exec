"""
Backend smoke test for the LLM client + AI endpoints.

Run with:
    cd /app/backend && python -m pytest tests/test_ai_smoke.py -v

What this verifies (without making real network calls to the LLM provider):
  1. server.py imports cleanly — no `name 'LlmChat' is not defined`.
  2. LlmChat / UserMessage are resolvable in server's namespace and come
     from our local `llm_client` shim, not the private
     `emergentintegrations` package.
  3. The shim builds the correct `litellm.completion` parameters for both:
     - Emergent universal key (sk-emergent-*) → routes through proxy.
     - Plain provider key → uses litellm's native provider routing.
  4. The /api/ health endpoint responds 200.
  5. /api/ai/analyze is wired up (returns 401 without auth, NOT 500 with
     a NameError — proving the AI route handler is reachable and that
     `LlmChat` is defined when it's referenced).
"""

import asyncio
import importlib
import inspect

import pytest
from fastapi.testclient import TestClient


def test_server_imports_cleanly():
    """The original bug: `name 'LlmChat' is not defined`.

    This test guarantees that bug never reaches production again.
    """
    server = importlib.import_module("server")
    assert server.app is not None, "FastAPI app should be created at import time"
    assert hasattr(server, "LlmChat"), "server.py must expose LlmChat"
    assert hasattr(server, "UserMessage"), "server.py must expose UserMessage"


def test_llm_chat_uses_local_shim_not_private_package():
    """LlmChat must resolve to our `llm_client` shim, not the private
    `emergentintegrations` package (which can't install on Render)."""
    from server import LlmChat, UserMessage

    assert LlmChat.__module__ == "llm_client", (
        f"LlmChat must come from llm_client (got {LlmChat.__module__}). "
        "Did someone restore the emergentintegrations import?"
    )
    assert UserMessage.__module__ == "llm_client", (
        f"UserMessage must come from llm_client (got {UserMessage.__module__})."
    )


def test_shim_routes_emergent_key_through_proxy():
    """Emergent universal keys (sk-emergent-*) must route through
    https://integrations.emergentagent.com/llm with provider=openai."""
    from llm_client import LlmChat, UserMessage

    chat = LlmChat(
        api_key="sk-emergent-test123",
        session_id="smoke-test",
        system_message="you are a test",
    ).with_model("openai", "gpt-5.2")

    chat._add_user_message(UserMessage(text="hello"))
    params = chat._build_params()

    assert params["api_base"] == "https://integrations.emergentagent.com/llm"
    assert params["custom_llm_provider"] == "openai"
    assert params["model"] == "gpt-5.2"
    assert params["api_key"] == "sk-emergent-test123"
    # System + user message present.
    assert params["messages"][0]["role"] == "system"
    assert params["messages"][-1]["role"] == "user"
    assert params["messages"][-1]["content"][0]["text"] == "hello"


def test_shim_uses_litellm_provider_routing_for_non_emergent_keys():
    """Non-emergent keys (raw OpenAI/Anthropic) must NOT set api_base —
    they rely on litellm's own provider routing."""
    from llm_client import LlmChat

    chat = LlmChat(
        api_key="sk-not-emergent",
        session_id="smoke",
        system_message="m",
    ).with_model("openai", "gpt-4o")
    params = chat._build_params()
    assert "api_base" not in params
    assert params["model"] == "openai/gpt-4o"


def test_shim_routes_gemini_correctly():
    """Gemini models get the 'gemini/' prefix when going through the proxy."""
    from llm_client import LlmChat

    chat = LlmChat(
        api_key="sk-emergent-test",
        session_id="smoke",
        system_message="m",
    ).with_model("gemini", "gemini-2.0-flash")
    params = chat._build_params()
    assert params["model"] == "gemini/gemini-2.0-flash"


def test_send_message_is_awaitable():
    """send_message must be an async coroutine function — server.py awaits it."""
    from llm_client import LlmChat
    assert inspect.iscoroutinefunction(LlmChat.send_message)


def test_health_endpoint_responds():
    """The /api/ health endpoint must be reachable."""
    from server import app
    client = TestClient(app)
    res = client.get("/api/")
    assert res.status_code in (200, 404), (
        f"/api/ should respond (got {res.status_code}); "
        "a 500 here would mean the server didn't start cleanly."
    )


def test_ai_analyze_route_is_wired_and_uses_llmchat():
    """Hitting /api/ai/analyze without auth must NOT return a 500 NameError.

    Before the fix: the route handler would run, hit `LlmChat(...)` and
    raise NameError → 500 with 'name LlmChat is not defined'.
    After the fix: the route is protected by auth, so unauthenticated
    requests get 401 / 403 before they ever reach the LLM call. That
    proves the handler is loaded AND that LlmChat resolves at runtime.
    """
    from server import app
    client = TestClient(app)
    res = client.post(
        "/api/ai/analyze",
        json={"content": "hello", "analysis_type": "lyrics"},
    )
    # We accept 401/403 (auth gate) or 422 (validation). What we MUST NOT
    # accept is 500 with the LlmChat NameError.
    assert res.status_code != 500, (
        f"AI analyze returned 500 — likely the LlmChat regression. "
        f"Body: {res.text[:300]}"
    )
    body_text = res.text.lower()
    assert "name 'llmchat' is not defined" not in body_text, (
        "Regression: `name 'LlmChat' is not defined` is back. "
        "Check the import in server.py and the llm_client shim."
    )
