from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "supplychain"

    blockchain_enabled: bool = False
    web3_provider_url: str | None = None

    openai_api_key: str | None = None
    openai_model: str = "gpt-5"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_exp_minutes: int = 60
    stripe_secret_key: str | None = None
    stripe_success_url: str = "http://localhost:5173/orders?payment=success"
    stripe_cancel_url: str = "http://localhost:5173/orders?payment=cancel"
    stripe_webhook_secret: str | None = None

    log_level: str = "INFO"

    # SMTP for reorder agent emails
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str = "jaysolulab@gmail.com"

    # Reorder scheduler
    reorder_enabled: bool = False
    reorder_interval_minutes: int = 60
    api_base_url: str = "http://127.0.0.1:8000"


settings = Settings()
