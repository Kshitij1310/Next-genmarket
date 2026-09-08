from typing import Callable, Dict


AgentFn = Callable[..., dict]


class AgentRegistry:
    def __init__(self) -> None:
        self._agents: Dict[str, AgentFn] = {}

    def register(self, name: str, fn: AgentFn) -> None:
        if name in self._agents:
            raise ValueError(f"Agent already registered: {name}")
        self._agents[name] = fn

    def get(self, name: str) -> AgentFn:
        if name not in self._agents:
            raise KeyError(f"Unknown agent: {name}")
        return self._agents[name]

    def list(self) -> list[str]:
        return sorted(self._agents.keys())
