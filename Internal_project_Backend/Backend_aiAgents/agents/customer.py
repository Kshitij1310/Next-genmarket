from __future__ import annotations

from typing import Any, Dict

from agents.base import BaseAgent
from models.agent import AgentResponse
from services.llm import ask_llm
from services.rag import retrieve_product_info, format_context


class CustomerAgent(BaseAgent):
    """Agent for handling customer queries with RAG + LLM responses."""

    def __init__(self, name: str = "customer", llm_provider: str = "openai") -> None:
        super().__init__(name=name)
        self.llm_provider = llm_provider

    def execute(self, **kwargs: Any) -> AgentResponse:
        query = kwargs.get("query")
        if not query:
            return self.respond_error("Missing customer query")

        context_items = retrieve_product_info(query)
        context = format_context(context_items)
        answer = ask_llm(query=query, context=context, provider=self.llm_provider)

        response = {
            "query": query,
            "answer": answer,
            "context_items": context_items,
        }

        self.log_event("customer_query", query=query)
        return self.respond_ok(response)
