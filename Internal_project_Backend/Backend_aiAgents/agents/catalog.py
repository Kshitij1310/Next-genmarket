from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

from agents.base import BaseAgent
from models.agent import AgentResponse
from services.llm import ask_llm


@dataclass
class ProductInput:
    sku: str
    name: str
    description: str
    attributes: Dict[str, Any]


class CatalogAgent(BaseAgent):
    """Agent for product catalog normalization and categorization."""

    def __init__(self, name: str = "catalog", llm_provider: str = "openai") -> None:
        super().__init__(name=name)
        self.llm_provider = llm_provider

    def execute(self, **kwargs: Any) -> AgentResponse:
        product = kwargs.get("product")
        if not product:
            return self.respond_error("Missing product payload")

        payload = product if isinstance(product, ProductInput) else ProductInput(**product)

        category = self.classify_product(payload)
        errors = self.validate_attributes(payload)
        cleaned = self.store_cleaned_product(payload, category, errors)

        return self.respond_ok({"product": cleaned, "errors": errors})

    def classify_product(self, product: ProductInput) -> str:
        """Classify product using LLM (placeholder)."""
        prompt = (
            "Classify the product into a concise category. "
            "Return only the category name."
        )
        context = f"Name: {product.name}\nDescription: {product.description}"
        category = ask_llm(query=prompt, context=context, provider=self.llm_provider)
        return category.strip()

    def validate_attributes(self, product: ProductInput) -> List[str]:
        """Basic attribute validation. Extend with schema rules later."""
        errors: List[str] = []
        if not product.sku:
            errors.append("SKU is required")
        if not product.name:
            errors.append("Name is required")
        if not isinstance(product.attributes, dict):
            errors.append("Attributes must be an object")
        return errors

    def store_cleaned_product(self, product: ProductInput, category: str, errors: List[str]) -> Dict[str, Any]:
        """Persist normalized product data."""
        payload: Dict[str, Any] = {
            "sku": product.sku,
            "name": product.name,
            "description": product.description,
            "attributes": product.attributes,
            "category": category,
            "validation_errors": errors,
            "source": self.name,
        }

        self.db.catalog.update_one({"sku": product.sku}, {"$set": payload}, upsert=True)
        self.log_event("catalog_updated", sku=product.sku, category=category)
        return payload
