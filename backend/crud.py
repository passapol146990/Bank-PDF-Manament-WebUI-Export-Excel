from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import models
import schemas


# ─── Upload Session ───────────────────────────────────────────────────────────

def get_sessions(db: Session):
    return db.query(models.UploadSession).order_by(models.UploadSession.created_at.desc()).all()


def get_session(db: Session, session_id: int):
    return db.query(models.UploadSession).filter(models.UploadSession.id == session_id).first()


def get_session_by_hash(db: Session, file_hash: str):
    return db.query(models.UploadSession).filter(models.UploadSession.file_hash == file_hash).first()


def create_session(db: Session, filename: str, file_hash: str = None,
                   account_number: str = None, account_name: str = None,
                   bank_name: str = None, period_start: str = None,
                   period_end: str = None) -> models.UploadSession:
    session = models.UploadSession(
        filename=filename,
        file_hash=file_hash,
        account_number=account_number,
        account_name=account_name,
        bank_name=bank_name or "Krungthai Bank",
        period_start=period_start,
        period_end=period_end,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def update_session_counts(db: Session, session_id: int):
    """Recount and update categorized_rows for a session."""
    total = db.query(func.count(models.Transaction.id)).filter(
        models.Transaction.session_id == session_id
    ).scalar() or 0

    categorized = db.query(func.count(models.Transaction.id)).filter(
        models.Transaction.session_id == session_id,
        models.Transaction.category != "Uncategorized",
    ).scalar() or 0

    db.query(models.UploadSession).filter(
        models.UploadSession.id == session_id
    ).update({"total_rows": total, "categorized_rows": categorized})
    db.commit()


def delete_session(db: Session, session_id: int):
    """Delete a session and all its transactions."""
    db.query(models.Transaction).filter(
        models.Transaction.session_id == session_id
    ).delete()
    db.query(models.UploadSession).filter(
        models.UploadSession.id == session_id
    ).delete()
    db.commit()


# ─── Transaction CRUD ────────────────────────────────────────────────────────

def get_transactions(db: Session, session_id: int = None, session_ids: list = None, skip: int = 0, limit: int = 50000):
    q = db.query(models.Transaction)
    if session_ids:
        q = q.filter(models.Transaction.session_id.in_(session_ids))
    elif session_id is not None:
        q = q.filter(models.Transaction.session_id == session_id)
    return q.order_by(models.Transaction.id).offset(skip).limit(limit).all()


def get_transaction(db: Session, transaction_id: int):
    return db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id
    ).first()


def bulk_create_transactions(db: Session, transactions: List[schemas.TransactionCreate]):
    db_transactions = [models.Transaction(**t.model_dump()) for t in transactions]
    db.bulk_save_objects(db_transactions)
    db.commit()


def update_transaction(db: Session, transaction_id: int, update: schemas.TransactionUpdate):
    db_tx = get_transaction(db, transaction_id)
    if not db_tx:
        return None
    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_tx, key, value)
    db.commit()
    db.refresh(db_tx)
    return db_tx


def bulk_update_transactions(db: Session, ids: List[int], category: str, status: str = "categorized"):
    db.query(models.Transaction).filter(
        models.Transaction.id.in_(ids)
    ).update({"category": category, "status": status}, synchronize_session=False)
    db.commit()
    return db.query(models.Transaction).filter(
        models.Transaction.id.in_(ids)
    ).all()


def delete_all_transactions(db: Session):
    db.query(models.Transaction).delete()
    db.query(models.UploadSession).delete()
    db.commit()


def get_transaction_stats(db: Session, session_id: int = None, session_ids: list = None):
    q_base = db.query(models.Transaction)
    if session_ids:
        q_base = q_base.filter(models.Transaction.session_id.in_(session_ids))
    elif session_id:
        q_base = q_base.filter(models.Transaction.session_id == session_id)

    total = q_base.with_entities(func.count(models.Transaction.id)).scalar() or 0
    categorized = q_base.filter(
        models.Transaction.category != "Uncategorized"
    ).with_entities(func.count(models.Transaction.id)).scalar() or 0

    total_withdrawal = q_base.with_entities(
        func.sum(models.Transaction.withdrawal)
    ).scalar() or 0.0

    total_deposit = q_base.with_entities(
        func.sum(models.Transaction.deposit)
    ).scalar() or 0.0

    uncategorized_amount = q_base.filter(
        models.Transaction.category == "Uncategorized"
    ).with_entities(func.sum(models.Transaction.withdrawal)).scalar() or 0.0

    return {
        "total": total,
        "categorized": categorized,
        "uncategorized": total - categorized,
        "total_withdrawal": total_withdrawal,
        "total_deposit": total_deposit,
        "uncategorized_amount": uncategorized_amount,
    }


def get_category_summary(db: Session, session_id: int = None, session_ids: list = None):
    q = db.query(
        models.Transaction.category,
        func.count(models.Transaction.id).label("count"),
        func.sum(models.Transaction.withdrawal).label("total_withdrawal"),
        func.sum(models.Transaction.deposit).label("total_deposit"),
    )
    if session_ids:
        q = q.filter(models.Transaction.session_id.in_(session_ids))
    elif session_id:
        q = q.filter(models.Transaction.session_id == session_id)
    results = q.group_by(models.Transaction.category).all()

    return [
        {
            "category": r.category,
            "count": r.count,
            "total_withdrawal": r.total_withdrawal or 0.0,
            "total_deposit": r.total_deposit or 0.0,
        }
        for r in results
    ]


# ─── CategoryConfig CRUD ─────────────────────────────────────────────────────

def get_categories(db: Session):
    return db.query(models.CategoryConfig).order_by(models.CategoryConfig.sort_order, models.CategoryConfig.id).all()


def create_category(db: Session, category: schemas.CategoryConfigCreate):
    # Auto-assign sort_order to end if not specified
    if category.sort_order == 0:
        max_order = db.query(func.max(models.CategoryConfig.sort_order)).scalar() or 0
        sort_order = max_order + 1
    else:
        sort_order = category.sort_order
    data = category.model_dump()
    data["sort_order"] = sort_order
    db_cat = models.CategoryConfig(**data)
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat


def update_category(db: Session, category_id: int, update: schemas.CategoryConfigUpdate):
    db_cat = db.query(models.CategoryConfig).filter(
        models.CategoryConfig.id == category_id
    ).first()
    if not db_cat:
        return None
    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_cat, key, value)
    db.commit()
    db.refresh(db_cat)
    return db_cat


def reorder_categories(db: Session, items: list):
    """Bulk-update sort_order for multiple categories."""
    for item in items:
        db.query(models.CategoryConfig).filter(
            models.CategoryConfig.id == item.id
        ).update({"sort_order": item.sort_order})
    db.commit()
    return get_categories(db)


def delete_category(db: Session, category_id: int):
    db_cat = db.query(models.CategoryConfig).filter(
        models.CategoryConfig.id == category_id
    ).first()
    if db_cat:
        db.delete(db_cat)
        db.commit()
    return db_cat


def seed_default_categories(db: Session):
    existing = db.query(models.CategoryConfig).count()
    if existing > 0:
        # Migrate: add sort_order to existing rows that have sort_order=0
        rows = db.query(models.CategoryConfig).order_by(models.CategoryConfig.id).all()
        need_fix = all(r.sort_order == 0 for r in rows)
        if need_fix:
            for i, row in enumerate(rows):
                row.sort_order = i + 1
            db.commit()
        return

    defaults = [
        {"name": "จ่ายพนักงาน",     "color": "#EF4444", "description": "เงินเดือนและค่าจ้าง",          "sort_order": 1},
        {"name": "ซื้อของ",           "color": "#F97316", "description": "ค่าวัตถุดิบและสินค้า",          "sort_order": 2},
        {"name": "ค่าสาธารณูปโภค",  "color": "#EAB308", "description": "ค่าไฟ ค่าน้ำ อินเทอร์เน็ต",   "sort_order": 3},
        {"name": "รายได้",            "color": "#22C55E", "description": "รายรับจากการขาย",               "sort_order": 4},
        {"name": "โอนเงิน",           "color": "#3B82F6", "description": "โอนเงินระหว่างบัญชี",           "sort_order": 5},
        {"name": "ค่าใช้จ่ายทั่วไป", "color": "#8B5CF6", "description": "ค่าใช้จ่ายอื่นๆ",               "sort_order": 6},
        {"name": "Uncategorized",     "color": "#6B7280", "description": "ยังไม่ได้จัดหมวดหมู่",          "sort_order": 7},
    ]

    for cat in defaults:
        db_cat = models.CategoryConfig(**cat)
        db.add(db_cat)
    db.commit()
