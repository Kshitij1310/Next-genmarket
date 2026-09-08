from __future__ import annotations

from typing import Any, Dict


class LLMClient:
    """Mock LLM client placeholder (no external calls)."""

    def __init__(self, provider: str = "mock") -> None:
        self.provider = provider

    def generate(self, prompt: str, context: str | None = None) -> str:
        return f"Mock LLM response: {prompt}"


def build_prompt(query: str, context: str) -> str:
    return f"Customer query: {query}\n\nContext:\n{context}\n\nAnswer concisely."


def ask_llm(query: str, context: str, provider: str = "mock") -> str:
    client = LLMClient(provider=provider)
    prompt = build_prompt(query, context)
    return client.generate(prompt=prompt, context=context)
