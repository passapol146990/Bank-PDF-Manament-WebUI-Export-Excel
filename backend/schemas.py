from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ─── Upload Session ───────────────────────────────────────────────────────────

class UploadSessionOut(BaseModel):
    id: int
    filename: str
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    bank_name: Optional[str] = None
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    total_rows: int = 0
    categorized_rows: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Transaction ──────────────────────────────────────────────────────────────

class TransactionBase(BaseModel):
    date: Optional[str] = None
    particulars: Optional[str] = None
    chq_no: Optional[str] = None
    withdrawal: Optional[float] = None
    deposit: Optional[float] = None
    balance: Optional[float] = None
    via: Optional[str] = None
    category: Optional[str] = "Uncategorized"
    status: Optional[str] = "pending"


class TransactionCreate(TransactionBase):
    session_id: Optional[int] = None


class TransactionUpdate(BaseModel):
    category: Optional[str] = None
    status: Optional[str] = None


class TransactionOut(TransactionBase):
    id: int
    session_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BulkUpdateRequest(BaseModel):
    ids: List[int]
    category: str
    status: Optional[str] = "categorized"


# ─── Category ─────────────────────────────────────────────────────────────────

class CategoryConfigBase(BaseModel):
    name: str
    color: Optional[str] = "#6B7280"
    description: Optional[str] = None
    sort_order: Optional[int] = 0


class CategoryConfigCreate(CategoryConfigBase):
    pass


class CategoryConfigUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class CategoryConfigOut(CategoryConfigBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CategoryReorderItem(BaseModel):
    id: int
    sort_order: int


class CategoryReorderRequest(BaseModel):
    items: List[CategoryReorderItem]
