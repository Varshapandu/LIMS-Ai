from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "AI LIMS Backend"
    app_version: str = "0.1.0"
    environment: str = "dev"
    database_url: str = "sqlite:///./ai_lims_dev.db"

    # Auth
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"

    # CORS — comma-separated origins
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # SMTP
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_from_name: str = "AI LIMS"
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False

    # Razorpay Payment Gateway
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""

    @model_validator(mode="after")
    def _validate_secrets(self) -> "Settings":
        if not self.jwt_secret or self.jwt_secret == "change-me":
            if self.environment != "dev":
                raise ValueError(
                    "JWT_SECRET must be set to a strong random value in non-dev environments. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
                )
            # In dev, warn but allow startup with the weak default
            import warnings
            warnings.warn(
                "JWT_SECRET is not set or still 'change-me'. "
                "This is acceptable for local dev only.",
                stacklevel=2,
            )
            if not self.jwt_secret:
                self.jwt_secret = "dev-only-insecure-secret"
        return self

    @property
    def cors_origins(self) -> list[str]:
        """Parse the comma-separated ALLOWED_ORIGINS into a list."""
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


settings = Settings()
