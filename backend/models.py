from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base


class UploadSession(Base):
    """Tracks each PDF/file that has been imported — enables resume functionality."""
    __tablename__ = "upload_sessions"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    file_hash = Column(String, nullable=True)          # MD5 of file to detect duplicates
    account_number = Column(String, nullable=True)
    account_name = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)
    period_start = Column(String, nullable=True)
    period_end = Column(String, nullable=True)
    total_rows = Column(Integer, default=0)
    categorized_rows = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("upload_sessions.id"), nullable=True, index=True)
    date = Column(String, nullable=True)
    particulars = Column(String, nullable=True)
    chq_no = Column(String, nullable=True)             # Cheque number (KTB has this column)
    withdrawal = Column(Float, nullable=True)
    deposit = Column(Float, nullable=True)
    balance = Column(Float, nullable=True)
    via = Column(String, nullable=True)
    category = Column(String, default="Uncategorized")
    status = Column(String, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class CategoryConfig(Base):
    __tablename__ = "category_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    color = Column(String, default="#6B7280")
    description = Column(String, nullable=True)
    sort_order = Column(Integer, default=0)   # ลำดับการแสดงใน dropdown
    created_at = Column(DateTime(timezone=True), server_default=func.now())
