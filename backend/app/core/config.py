"""
SoapPV-AI Backend Configuration
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "SoapPV-AI"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://soappv:soappv_secret@localhost:5432/soappv_db"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # ML
    MODEL_DIR: str = "app/ml/artifacts"
    TARGET_PV_MIN: float = 3.8
    TARGET_PV_MAX: float = 4.2
    
    # CORS
    CORS_ORIGINS: list = ["http://localhost:3000", "http://localhost:3001"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
