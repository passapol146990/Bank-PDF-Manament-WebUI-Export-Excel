from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./bank_statements.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations():
    """Add any missing columns to existing tables (safe, idempotent)."""
    with engine.connect() as conn:
        # Add sort_order to category_configs if it doesn't exist
        try:
            conn.execute(text("ALTER TABLE category_configs ADD COLUMN sort_order INTEGER DEFAULT 0"))
            conn.commit()
        except Exception:
            pass  # Column already exists — ignore
