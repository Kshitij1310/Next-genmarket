from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Any, List

from langgraph.graph import StateGraph, END
from core.langgraph import SupplyState

from agents.catalog import CatalogAgent
from agents.inventory import InventoryAgent
from agents.customer import CustomerAgent
from agents.payment import PaymentAgent
from agents.aiops import AIOpsAgent
from agents.shipment import ShipmentAgent


# Orchestrator graph (event-driven ready)


def _append_event(state: SupplyState, event_type: str, payload: Dict[str, Any]) -> None:
    events: List[Dict[str, Any]] = state.get("events", [])
    events.append({
        "type": event_type,
        "payload": payload,
        "timestamp": datetime.now(timezone.utc),
    })
    state["events"] = events


catalog_agent = CatalogAgent()
inventory_agent = InventoryAgent()
customer_agent = CustomerAgent()
payment_agent = PaymentAgent()
aiops_agent = AIOpsAgent()
shipment_agent = ShipmentAgent()


def seller_upload_node(state: SupplyState) -> SupplyState:
    payload = state.get("seller_upload", {})
    # Normalize seller upload into product + inventory update
    if payload.get("product"):
        state["product"] = payload["product"]
    if payload.get("inventory_update"):
        state["inventory_update"] = payload["inventory_update"]
    _append_event(state, "seller_upload_received", {"keys": list(payload.keys())})
    return state


def catalog_node(state: SupplyState) -> SupplyState:
    product = state.get("product")
    if product:
        result = catalog_agent.execute(product=product)
        state["catalog_result"] = result.model_dump()
        _append_event(state, "catalog_completed", state["catalog_result"])
    return state


def inventory_check_node(state: SupplyState) -> SupplyState:
    thresholds = state.get("inventory_thresholds", [])
    if thresholds:
        result = inventory_agent.execute(thresholds=thresholds)
        state["inventory_check"] = result.model_dump()
        _append_event(state, "inventory_checked", state["inventory_check"])
    return state


def customer_node(state: SupplyState) -> SupplyState:
    query = state.get("customer_query")
    if query:
        result = customer_agent.execute(query=query)
        state["customer_response"] = result.model_dump()
        _append_event(state, "customer_answered", state["customer_response"])
    return state


def payment_node(state: SupplyState) -> SupplyState:
    req = state.get("payment_request")
    if req:
        result = payment_agent.execute(request=req)
        state["payment_result"] = result.model_dump()
        _append_event(state, "payment_processed", state["payment_result"])
    return state


def aiops_node(state: SupplyState) -> SupplyState:
    req = state.get("demand_request")
    if req:
        result = aiops_agent.execute(request=req)
        state["aiops_result"] = result.model_dump()
        _append_event(state, "aiops_predicted", state["aiops_result"])
    return state


def shipment_node(state: SupplyState) -> SupplyState:
    update = state.get("shipment_update")
    if update:
        result = shipment_agent.execute(update=update)
        state["shipment_result"] = result.model_dump()
        _append_event(state, "shipment_updated", state["shipment_result"])
    return state


def inventory_update_node(state: SupplyState) -> SupplyState:
    update = state.get("inventory_update")
    if update:
        inventory_agent.update_inventory(
            sku=update.get("sku"),
            qty=int(update.get("qty", 0)),
            metadata=update.get("metadata"),
        )
        state["inventory_result"] = {
            "sku": update.get("sku"),
            "qty": update.get("qty"),
        }
        _append_event(state, "inventory_updated", state["inventory_result"])
    return state


def _payment_router(state: SupplyState) -> str:
    return "payment" if state.get("payment_required") else "aiops"


# Build orchestrator graph

def build_supply_graph():
    graph = StateGraph(SupplyState)

    graph.add_node("seller_upload_node", seller_upload_node)
    graph.add_node("catalog_node", catalog_node)
    graph.add_node("inventory_check_node", inventory_check_node)
    graph.add_node("customer_node", customer_node)
    graph.add_node("payment_node", payment_node)
    graph.add_node("aiops_node", aiops_node)
    graph.add_node("shipment_node", shipment_node)
    graph.add_node("inventory_update_node", inventory_update_node)

    graph.set_entry_point("seller_upload_node")

    graph.add_edge("seller_upload_node", "catalog_node")
    graph.add_edge("catalog_node", "inventory_check_node")
    graph.add_edge("inventory_check_node", "customer_node")
    graph.add_conditional_edges("customer_node", _payment_router, {
        "payment": "payment_node",
        "aiops": "aiops_node",
    })
    graph.add_edge("payment_node", "aiops_node")
    graph.add_edge("aiops_node", "shipment_node")
    graph.add_edge("shipment_node", "inventory_update_node")
    graph.add_edge("inventory_update_node", END)

    return graph.compile()
