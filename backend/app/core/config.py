from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "AI LIMS Backend"
    app_version: str = "0.1.0"
    database_url: str = "sqlite:///./ai_lims_dev.db"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_from_name: str = "AI LIMS"
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False


settings = Settings()
