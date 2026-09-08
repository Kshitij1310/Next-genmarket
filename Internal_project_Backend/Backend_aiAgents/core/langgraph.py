from langgraph.graph import StateGraph
from typing import TypedDict, List, Dict, Any


class SupplyState(TypedDict, total=False):
    # Input payloads
    seller_upload: Dict[str, Any]
    product: Dict[str, Any]
    inventory_thresholds: List[Dict[str, Any]]
    customer_query: str
    payment_request: Dict[str, Any]
    demand_request: Dict[str, Any]
    shipment_update: Dict[str, Any]
    inventory_update: Dict[str, Any]

    # Flow flags
    payment_required: bool

    # Outputs
    catalog_result: Dict[str, Any]
    inventory_check: Dict[str, Any]
    customer_response: Dict[str, Any]
    payment_result: Dict[str, Any]
    aiops_result: Dict[str, Any]
    shipment_result: Dict[str, Any]
    inventory_result: Dict[str, Any]

    # Event stream
    events: List[Dict[str, Any]]


# Placeholder for future graph wiring

def build_graph():
    graph = StateGraph(SupplyState)
    return graph
