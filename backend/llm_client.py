"""
Drop-in replacement for emergentintegrations.llm.chat:LlmChat / UserMessage.

Why this file exists:
  The private `emergentintegrations` package isn't reliably installable on
  Render (it lives on a private pip index, and even when the index URL is
  added some deployed copies of server.py end up without the import — this
  module restores `LlmChat` symbol from a fully public dependency).

  This shim wraps `litellm` (which IS on public PyPI and already pinned in
  requirements.txt) and preserves the exact same public API surface used
  by server.py:

      chat = LlmChat(api_key=..., session_id=..., system_message=...)
      chat.with_model("openai", "gpt-5.2")
      chat.with_params(temperature=0.7)            # optional
      response_text = await chat.send_message(UserMessage(text="..."))

  Routing rules (identical to the original `emergentintegrations`):

  * If the API key starts with "sk-emergent-" we route through Emergent's
    universal LLM proxy at https://integrations.emergentagent.com/llm with
    `custom_llm_provider="openai"`. For Gemini, the model name is
    prefixed with "gemini/".
  * For non-emergent keys (raw OpenAI / Anthropic keys), litellm handles
    routing itself based on the provider string.

  The X-App-ID header is forwarded if APP_URL / REACT_APP_BACKEND_URL is set.
"""

import os
import asyncio
from typing import List, Dict, Any, Optional

import litellm


# ---------------------------------------------------------------------------
# Small data classes — preserve the original public API used by server.py
# ---------------------------------------------------------------------------


class FileContent:
    def __init__(self, content_type: str, file_content_base64: str) -> None:
        self.content_type = content_type
        self.file_content_base64 = file_content_base64


class ImageContent(FileContent):
    def __init__(self, image_base64: str) -> None:
        super().__init__("image", image_base64)


class UserMessage:
    def __init__(self, text: Optional[str] = None, file_contents: Optional[list] = None) -> None:
        self.text = text
        self.file_contents = file_contents or []


class ChatError(Exception):
    """Raised when the underlying LLM provider call fails."""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _get_proxy_url() -> str:
    """Resolve the Emergent integration proxy URL.

    Mirrors emergentintegrations.llm.utils.get_integration_proxy_url.
    """
    return (
        os.getenv("INTEGRATION_PROXY_URL")
        or os.getenv("integration_proxy_url")
        or "https://integrations.emergentagent.com"
    )


def _get_app_identifier() -> Optional[str]:
    """Resolve the X-App-ID header value.

    Mirrors emergentintegrations.llm.utils.get_app_identifier.
    """
    return os.getenv("APP_URL") or os.getenv("REACT_APP_BACKEND_URL")


def _is_emergent_key(api_key: Optional[str]) -> bool:
    return bool(api_key) and api_key.startswith("sk-emergent-")


# ---------------------------------------------------------------------------
# LlmChat — drop-in replacement
# ---------------------------------------------------------------------------


class LlmChat:
    def __init__(
        self,
        api_key: str,
        session_id: str,
        system_message: str,
        initial_messages: Optional[List[Dict[str, Any]]] = None,
        custom_headers: Optional[Dict[str, str]] = None,
    ) -> None:
        self.api_key = api_key
        self.session_id = session_id
        self.provider = "openai"
        self.model = "gpt-4o"
        self.messages: List[Dict[str, Any]] = initial_messages or [
            {"role": "system", "content": system_message}
        ]
        self.extra_params: Dict[str, Any] = {}
        self.custom_headers: Dict[str, str] = dict(custom_headers or {})

        app_url = _get_app_identifier()
        if app_url:
            self.custom_headers["X-App-ID"] = app_url

    # Builder methods (preserve original chaining API) ----------------------

    def with_model(self, provider: str, model: str) -> "LlmChat":
        self.provider = provider
        self.model = model
        return self

    def with_params(self, **params: Any) -> "LlmChat":
        self.extra_params.update(params)
        return self

    # Core call -------------------------------------------------------------

    def _add_user_message(self, user_message: UserMessage) -> None:
        if user_message.text:
            # Use the multi-part content shape so future image_contents
            # appended after still produce a valid OpenAI/LiteLLM message.
            self.messages.append(
                {
                    "role": "user",
                    "content": [{"type": "text", "text": user_message.text}],
                }
            )
        for content in user_message.file_contents or []:
            if isinstance(content, ImageContent):
                # Detect mime type from base64 prefix
                b64 = content.file_content_base64
                if b64.startswith("iVBORw0KGgo"):
                    mime = "image/png"
                elif b64.startswith("/9j/"):
                    mime = "image/jpeg"
                elif b64.startswith("R0lGOD"):
                    mime = "image/gif"
                elif b64.startswith("UklGR"):
                    mime = "image/webp"
                else:
                    mime = "image/png"
                self.messages.append(
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:{mime};base64,{b64}"},
                            }
                        ],
                    }
                )

    def _build_params(self) -> Dict[str, Any]:
        params: Dict[str, Any] = {
            "model": f"{self.provider}/{self.model}",
            "messages": self.messages,
            "api_key": self.api_key,
        }

        if _is_emergent_key(self.api_key):
            # Universal Emergent key — route through the integration proxy.
            params["api_base"] = _get_proxy_url() + "/llm"
            params["custom_llm_provider"] = "openai"
            if self.provider == "gemini":
                params["model"] = f"gemini/{self.model}"
            else:
                params["model"] = self.model
            if self.custom_headers:
                params["extra_headers"] = self.custom_headers

        params.update(self.extra_params)
        return params

    async def send_message(self, user_message: UserMessage) -> str:
        self._add_user_message(user_message)
        params = self._build_params()

        try:
            # litellm.acompletion is the async sibling of litellm.completion.
            # Fall back to running the sync version in a thread if acompletion
            # isn't available in the installed version of litellm.
            acompletion = getattr(litellm, "acompletion", None)
            if acompletion is not None:
                response = await acompletion(**params)
            else:
                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(
                    None, lambda: litellm.completion(**params)
                )
        except Exception as e:
            raise ChatError(f"Failed to generate chat completion: {e}") from e

        try:
            content = response.choices[0].message.content
        except Exception as e:
            raise ChatError(f"Failed to extract response text: {e}") from e

        if content is None:
            content = ""

        # Persist the assistant turn so subsequent send_message calls see it.
        self.messages.append({"role": "assistant", "content": content})
        return content


__all__ = [
    "LlmChat",
    "UserMessage",
    "FileContent",
    "ImageContent",
    "ChatError",
]
