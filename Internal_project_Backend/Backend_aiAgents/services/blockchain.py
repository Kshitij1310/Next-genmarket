from web3 import Web3
from core.config import settings


# Optional blockchain integration

def send_payment(to_address: str, amount_wei: int) -> str | None:
    if not settings.blockchain_enabled:
        return None

    if not settings.web3_provider_url:
        raise ValueError("WEB3_PROVIDER_URL is required when blockchain is enabled")

    w3 = Web3(Web3.HTTPProvider(settings.web3_provider_url))

    if not w3.is_connected():
        raise ConnectionError("Unable to connect to web3 provider")

    # Placeholder: integrate wallet management / signing here
    # For POC we only return a fake tx hash
    return w3.keccak(text=f"{to_address}:{amount_wei}").hex()
