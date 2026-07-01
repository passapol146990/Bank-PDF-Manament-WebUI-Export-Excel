"""
Bank Statement Categorization — Single-Port FastAPI App
Serves the React frontend (from ../frontend/dist) on the same port as the API.
"""
import io
import os
from pathlib import Path
from typing import List, Optional

import pandas as pd
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from sqlalchemy.orm import Session

import crud
import models
import schemas
from database import engine, get_db, run_migrations
from pdf_parser import parse_ktb_pdf

# ─── App Setup ───────────────────────────────────────────────────────────────

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Bank Statement Categorization API",
    version="2.0.0",
    # Serve docs at /api/docs so they don't conflict with the SPA
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Startup ─────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup_event():
    run_migrations()
    db = next(get_db())
    crud.seed_default_categories(db)


# ─── API Routes (all prefixed /api) ──────────────────────────────────────────

# Health
@app.get("/api/health", tags=["Health"])
def health():
    return {"status": "ok"}


# ─── Sessions ────────────────────────────────────────────────────────────────

@app.get("/api/sessions", response_model=List[schemas.UploadSessionOut], tags=["Sessions"])
def list_sessions(db: Session = Depends(get_db)):
    return crud.get_sessions(db)


@app.get("/api/sessions/{session_id}", response_model=schemas.UploadSessionOut, tags=["Sessions"])
def get_session(session_id: int, db: Session = Depends(get_db)):
    s = crud.get_session(db, session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@app.delete("/api/sessions/{session_id}", tags=["Sessions"])
def delete_session(session_id: int, db: Session = Depends(get_db)):
    crud.delete_session(db, session_id)
    return {"message": "Session and transactions deleted"}


# ─── Transactions ─────────────────────────────────────────────────────────────

@app.get("/api/transactions", response_model=List[schemas.TransactionOut], tags=["Transactions"])
def get_transactions(
    session_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50000, ge=1),
    db: Session = Depends(get_db),
):
    return crud.get_transactions(db, session_id=session_id, skip=skip, limit=limit)


@app.get("/api/transactions/stats", tags=["Transactions"])
def get_stats(session_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    return crud.get_transaction_stats(db, session_id=session_id)


@app.get("/api/transactions/category-summary", tags=["Transactions"])
def get_category_summary(session_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    return crud.get_category_summary(db, session_id=session_id)


@app.put("/api/transactions/bulk", tags=["Transactions"])
def bulk_update(request: schemas.BulkUpdateRequest, db: Session = Depends(get_db)):
    updated = crud.bulk_update_transactions(
        db, ids=request.ids, category=request.category, status=request.status
    )
    # Update session counts for affected sessions
    session_ids = set(
        tx.session_id for tx in
        db.query(models.Transaction).filter(models.Transaction.id.in_(request.ids)).all()
        if tx.session_id
    )
    for sid in session_ids:
        crud.update_session_counts(db, sid)

    return {"updated_count": len(updated), "message": f"Updated {len(updated)} transactions"}


@app.put("/api/transactions/{transaction_id}", response_model=schemas.TransactionOut, tags=["Transactions"])
def update_transaction(
    transaction_id: int,
    update: schemas.TransactionUpdate,
    db: Session = Depends(get_db),
):
    tx = crud.update_transaction(db, transaction_id, update)
    if not tx:
        raise HTTPException(404, "Transaction not found")
    if tx.session_id:
        crud.update_session_counts(db, tx.session_id)
    return tx


@app.delete("/api/transactions", tags=["Transactions"])
def delete_all(db: Session = Depends(get_db)):
    crud.delete_all_transactions(db)
    return {"message": "All data deleted"}


# ─── Upload PDF ───────────────────────────────────────────────────────────────

@app.post("/api/upload", tags=["Upload"])
async def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    filename = file.filename or ""
    ext = Path(filename).suffix.lower()

    if ext not in (".pdf", ".xlsx", ".xls", ".csv"):
        raise HTTPException(400, "Supported formats: PDF, Excel (.xlsx/.xls), CSV")

    contents = await file.read()

    if ext == ".pdf":
        return await _handle_pdf_upload(contents, filename, db)
    else:
        return await _handle_excel_upload(contents, filename, ext, db)


async def _handle_pdf_upload(contents: bytes, filename: str, db: Session):
    """Parse PDF and import transactions."""
    # Check for duplicate by file hash
    from pdf_parser import parse_ktb_pdf
    import hashlib
    file_hash = hashlib.md5(contents).hexdigest()

    existing = crud.get_session_by_hash(db, file_hash)
    if existing:
        return {
            "message": f"ไฟล์นี้เคยนำเข้าแล้ว (session #{existing.id}) — กำลังโหลดข้อมูลเดิม",
            "session_id": existing.id,
            "count": existing.total_rows,
            "is_duplicate": True,
        }

    try:
        statement = parse_ktb_pdf(contents, filename)
    except Exception as e:
        raise HTTPException(400, f"ไม่สามารถอ่าน PDF ได้: {str(e)}")

    if not statement.transactions:
        raise HTTPException(400, "ไม่พบข้อมูลรายการในไฟล์ PDF — กรุณาตรวจสอบรูปแบบไฟล์")

    # Create session
    session = crud.create_session(
        db,
        filename=filename,
        file_hash=file_hash,
        account_number=statement.account_number,
        account_name=statement.account_name,
        bank_name=statement.bank_name,
        period_start=statement.period_start,
        period_end=statement.period_end,
    )

    # Import transactions
    tx_creates = [
        schemas.TransactionCreate(
            session_id=session.id,
            date=tx.date,
            particulars=tx.particulars,
            chq_no=tx.chq_no,
            withdrawal=tx.withdrawal,
            deposit=tx.deposit,
            balance=tx.balance,
            via=tx.via,
        )
        for tx in statement.transactions
    ]
    crud.bulk_create_transactions(db, tx_creates)
    crud.update_session_counts(db, session.id)

    return {
        "message": f"นำเข้า {len(tx_creates)} รายการจาก {filename} สำเร็จ",
        "session_id": session.id,
        "count": len(tx_creates),
        "account_number": statement.account_number,
        "account_name": statement.account_name,
        "period_start": statement.period_start,
        "period_end": statement.period_end,
        "is_duplicate": False,
    }


COLUMN_ALIASES = {
    "date": "date", "วันที่": "date",
    "particulars": "particulars", "รายการ": "particulars", "description": "particulars",
    "withdrawal": "withdrawal", "ถอน": "withdrawal", "debit": "withdrawal",
    "deposit": "deposit", "ฝาก": "deposit", "credit": "deposit",
    "balance": "balance", "คงเหลือ": "balance", "ยอดคงเหลือ": "balance",
    "via": "via", "ช่องทาง": "via", "channel": "via",
}


async def _handle_excel_upload(contents: bytes, filename: str, ext: str, db: Session):
    """Parse Excel/CSV and import transactions."""
    try:
        if ext == ".csv":
            df = pd.read_csv(io.BytesIO(contents), encoding="utf-8-sig")
        else:
            df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(400, f"อ่านไฟล์ไม่ได้: {str(e)}")

    df.columns = [str(c).strip() for c in df.columns]
    df.rename(columns={col: COLUMN_ALIASES[col] for col in df.columns if col in COLUMN_ALIASES}, inplace=True)

    key_cols = [c for c in ["date", "particulars", "withdrawal", "deposit", "balance"] if c in df.columns]
    df.dropna(how="all", subset=key_cols or None, inplace=True)

    if df.empty:
        raise HTTPException(400, "ไม่พบข้อมูลในไฟล์")

    session = crud.create_session(db, filename=filename)

    def safe_str(v): return str(v).strip() if pd.notna(v) else None
    def safe_float(v):
        try: return float(v) if pd.notna(v) else None
        except: return None

    transactions = [
        schemas.TransactionCreate(
            session_id=session.id,
            date=safe_str(row.get("date")),
            particulars=safe_str(row.get("particulars")),
            withdrawal=safe_float(row.get("withdrawal")),
            deposit=safe_float(row.get("deposit")),
            balance=safe_float(row.get("balance")),
            via=safe_str(row.get("via")),
        )
        for _, row in df.iterrows()
    ]

    crud.bulk_create_transactions(db, transactions)
    crud.update_session_counts(db, session.id)

    return {
        "message": f"นำเข้า {len(transactions)} รายการสำเร็จ",
        "session_id": session.id,
        "count": len(transactions),
        "is_duplicate": False,
    }


# ─── Export ───────────────────────────────────────────────────────────────────

CATEGORY_FILL_COLORS = {
    "จ่ายพนักงาน":    "FFCDD2",
    "ซื้อของ":         "FFE0B2",
    "ค่าสาธารณูปโภค": "FFF9C4",
    "รายได้":          "C8E6C9",
    "โอนเงิน":         "BBDEFB",
    "ค่าใช้จ่ายทั่วไป":"E1BEE7",
    "Uncategorized":   "F5F5F5",
}

# Ordered export sheets — maps sheet name → list of categories to include
EXPORT_SHEET_MAP = [
    ("โอนออกซื้อของ",          ["ซื้อของ"]),
    ("โอนออกแยกบัญชีตัวเอง",   ["โอนเงิน"]),
    ("จ่ายพนักงาน",             ["จ่ายพนักงาน"]),
    ("ลูกค้าโอนให้",            ["รายได้"]),
    ("ค่าสาธารณูปโภค",          ["ค่าสาธารณูปโภค"]),
    ("อื่นๆ",                   ["ค่าใช้จ่ายทั่วไป", "Uncategorized"]),
]


def _style_header(ws, num_cols: int):
    """Apply dark header style to row 1."""
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    hdr_fill = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
    hdr_font = Font(color="FFFFFF", bold=True, size=10)
    thin = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )
    for cell in ws[1]:
        cell.fill = hdr_fill
        cell.font = hdr_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin
    ws.row_dimensions[1].height = 28


def _style_data_rows(ws, transactions_slice, col_count: int, fill_hex: str = None):
    """Apply fill + border to data rows. If fill_hex is None, uses per-row category color."""
    from openpyxl.styles import PatternFill, Alignment, Border, Side, Font
    thin = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )
    for row_idx, tx in enumerate(transactions_slice, start=2):
        hex_color = fill_hex or CATEGORY_FILL_COLORS.get(tx.category, "FFFFFF")
        row_fill = PatternFill(start_color=hex_color, end_color=hex_color, fill_type="solid")
        for col_idx in range(1, col_count + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.fill = row_fill
            cell.border = thin
            cell.alignment = Alignment(vertical="center")


def _set_col_widths(ws, df):
    from openpyxl.utils import get_column_letter
    for col_idx, col_name in enumerate(df.columns, start=1):
        col_data = df.iloc[:, col_idx - 1].astype(str)
        max_len = max(len(str(col_name)), col_data.map(len).max() if len(df) > 0 else 0)
        ws.column_dimensions[get_column_letter(col_idx)].width = min(max_len + 4, 45)


@app.get("/api/export", tags=["Export"])
def export_excel(session_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    transactions = crud.get_transactions(db, session_id=session_id)
    if not transactions:
        raise HTTPException(404, "ไม่มีข้อมูลสำหรับ Export")

    session_info = crud.get_session(db, session_id) if session_id else None
    filename_base = Path(session_info.filename).stem if session_info else "bank_statement"

    output = io.BytesIO()

    COLS = ["วันที่", "รายการ", "ผ่านทาง", "เลขที่เช็ค", "ถอน (฿)", "ฝาก (฿)", "คงเหลือ (฿)", "หมวดหมู่"]

    def tx_to_row(tx):
        return {
            "วันที่":     tx.date,
            "รายการ":     tx.particulars,
            "ผ่านทาง":    tx.via,
            "เลขที่เช็ค": tx.chq_no,
            "ถอน (฿)":    tx.withdrawal,
            "ฝาก (฿)":    tx.deposit,
            "คงเหลือ (฿)":tx.balance,
            "หมวดหมู่":   tx.category,
        }

    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        wb = writer.book

        # ── Sheet 1: รายการทั้งหมด ──────────────────────────────────────────
        all_rows = [tx_to_row(tx) for tx in transactions]
        df_all = pd.DataFrame(all_rows, columns=COLS)
        df_all.to_excel(writer, index=False, sheet_name="รายการทั้งหมด")
        ws_all = writer.sheets["รายการทั้งหมด"]
        _style_header(ws_all, len(COLS))
        _style_data_rows(ws_all, transactions, len(COLS))
        _set_col_widths(ws_all, df_all)
        ws_all.freeze_panes = "A2"

        # ── Sheets per category group ────────────────────────────────────────
        # Build a map: category_name → list of transactions
        cat_map: dict[str, list] = {}
        for tx in transactions:
            cat_map.setdefault(tx.category, []).append(tx)

        # Also collect custom categories not in EXPORT_SHEET_MAP
        covered_cats = set()
        for _, cats in EXPORT_SHEET_MAP:
            covered_cats.update(cats)

        extra_cats = [c for c in cat_map if c not in covered_cats]

        # Build full sheet list: predefined + extras
        sheet_list = list(EXPORT_SHEET_MAP)
        for cat in extra_cats:
            sheet_list.append((cat[:31], [cat]))  # sheet name max 31 chars

        for sheet_name, cat_names in sheet_list:
            group_txs = []
            for cat in cat_names:
                group_txs.extend(cat_map.get(cat, []))

            if not group_txs:
                continue  # skip empty sheets

            rows = [tx_to_row(tx) for tx in group_txs]
            df_g = pd.DataFrame(rows, columns=COLS)

            # Add subtotal row
            subtotal = {
                "วันที่":     "รวม",
                "รายการ":     f"{len(group_txs)} รายการ",
                "ผ่านทาง":    None,
                "เลขที่เช็ค": None,
                "ถอน (฿)":    df_g["ถอน (฿)"].sum(),
                "ฝาก (฿)":    df_g["ฝาก (฿)"].sum(),
                "คงเหลือ (฿)":None,
                "หมวดหมู่":   None,
            }
            df_g = pd.concat([df_g, pd.DataFrame([subtotal])], ignore_index=True)
            df_g.to_excel(writer, index=False, sheet_name=sheet_name)

            ws = writer.sheets[sheet_name]
            _style_header(ws, len(COLS))
            _style_data_rows(ws, group_txs, len(COLS))
            _set_col_widths(ws, df_g)
            ws.freeze_panes = "A2"

            # Style subtotal row
            total_row_idx = len(group_txs) + 2
            total_fill = PatternFill(start_color="374151", end_color="374151", fill_type="solid")
            total_font = Font(bold=True, color="FFFFFF", size=10)
            thin = Border(
                left=Side(style="thin"), right=Side(style="thin"),
                top=Side(style="medium"), bottom=Side(style="medium"),
            )
            for col_idx in range(1, len(COLS) + 1):
                cell = ws.cell(row=total_row_idx, column=col_idx)
                cell.fill = total_fill
                cell.font = total_font
                cell.border = thin
                cell.alignment = Alignment(horizontal="right" if col_idx >= 5 else "left", vertical="center")

        # ── Summary sheet ────────────────────────────────────────────────────
        ws_s = wb.create_sheet("สรุปยอดรวม")

        # Account info block
        row = 1
        if session_info:
            info_rows = [
                ("ไฟล์ต้นฉบับ",  session_info.filename),
                ("เลขบัญชี",     session_info.account_number or "-"),
                ("ชื่อบัญชี",    session_info.account_name   or "-"),
                ("ธนาคาร",       session_info.bank_name      or "-"),
                ("ช่วงเวลา",     f"{session_info.period_start} – {session_info.period_end}"),
            ]
            for label, val in info_rows:
                ws_s.cell(row=row, column=1, value=label).font = Font(bold=True, size=10)
                ws_s.cell(row=row, column=2, value=val)
                row += 1
            row += 1  # blank line

        # Summary table header
        sum_headers = ["หมวดหมู่", "จำนวนรายการ", "ยอดถอนรวม (฿)", "ยอดฝากรวม (฿)", "สุทธิ (฿)"]
        for col_idx, h in enumerate(sum_headers, 1):
            cell = ws_s.cell(row=row, column=col_idx, value=h)
            cell.fill = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
            cell.font = Font(bold=True, color="FFFFFF", size=10)
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = Border(
                left=Side(style="thin"), right=Side(style="thin"),
                top=Side(style="thin"), bottom=Side(style="thin"),
            )
        ws_s.row_dimensions[row].height = 24
        row += 1

        # Per-category rows
        total_wd = total_dep = 0.0
        all_cat_names = list(cat_map.keys())

        # Order: predefined first, then extras
        ordered = []
        seen = set()
        for _, cats in EXPORT_SHEET_MAP:
            for c in cats:
                if c in cat_map and c not in seen:
                    ordered.append(c)
                    seen.add(c)
        for c in all_cat_names:
            if c not in seen:
                ordered.append(c)

        thin = Border(
            left=Side(style="thin"), right=Side(style="thin"),
            top=Side(style="thin"), bottom=Side(style="thin"),
        )

        for cat in ordered:
            txs = cat_map.get(cat, [])
            wd  = sum(t.withdrawal or 0 for t in txs)
            dep = sum(t.deposit    or 0 for t in txs)
            net = dep - wd
            total_wd  += wd
            total_dep += dep

            fill_hex = CATEGORY_FILL_COLORS.get(cat, "FFFFFF")
            row_fill = PatternFill(start_color=fill_hex, end_color=fill_hex, fill_type="solid")

            vals = [cat, len(txs), wd if wd else None, dep if dep else None, net if net != 0 else None]
            for col_idx, val in enumerate(vals, 1):
                cell = ws_s.cell(row=row, column=col_idx, value=val)
                cell.fill = row_fill
                cell.border = thin
                cell.alignment = Alignment(
                    horizontal="right" if col_idx >= 2 else "left",
                    vertical="center",
                )
                if col_idx >= 3 and val is not None:
                    cell.number_format = '#,##0.00'
            row += 1

        # Grand total row
        grand_fill = PatternFill(start_color="111827", end_color="111827", fill_type="solid")
        grand_font = Font(bold=True, color="FFFFFF", size=10)
        grand_vals = ["รวมทั้งหมด", len(transactions), total_wd, total_dep, total_dep - total_wd]
        for col_idx, val in enumerate(grand_vals, 1):
            cell = ws_s.cell(row=row, column=col_idx, value=val)
            cell.fill = grand_fill
            cell.font = grand_font
            cell.border = Border(
                left=Side(style="thin"), right=Side(style="thin"),
                top=Side(style="medium"), bottom=Side(style="medium"),
            )
            cell.alignment = Alignment(horizontal="right" if col_idx >= 2 else "left", vertical="center")
            if col_idx >= 3:
                cell.number_format = '#,##0.00'

        # Column widths for summary sheet
        ws_s.column_dimensions["A"].width = 28
        ws_s.column_dimensions["B"].width = 15
        ws_s.column_dimensions["C"].width = 20
        ws_s.column_dimensions["D"].width = 20
        ws_s.column_dimensions["E"].width = 20

        # Move summary sheet to front
        wb.move_sheet("สรุปยอดรวม", offset=-len(wb.sheetnames) + 1)

    output.seek(0)
    safe_name = f"{filename_base}_categorized.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


# ─── Categories ───────────────────────────────────────────────────────────────

@app.get("/api/categories", response_model=List[schemas.CategoryConfigOut], tags=["Categories"])
def get_categories(db: Session = Depends(get_db)):
    return crud.get_categories(db)


@app.post("/api/categories", response_model=schemas.CategoryConfigOut, tags=["Categories"])
def create_category(category: schemas.CategoryConfigCreate, db: Session = Depends(get_db)):
    return crud.create_category(db, category)


@app.put("/api/categories/reorder", response_model=List[schemas.CategoryConfigOut], tags=["Categories"])
def reorder_categories(request: schemas.CategoryReorderRequest, db: Session = Depends(get_db)):
    return crud.reorder_categories(db, request.items)


@app.put("/api/categories/{category_id}", response_model=schemas.CategoryConfigOut, tags=["Categories"])
def update_category(category_id: int, update: schemas.CategoryConfigUpdate, db: Session = Depends(get_db)):
    cat = crud.update_category(db, category_id, update)
    if not cat:
        raise HTTPException(404, "Category not found")
    return cat


@app.delete("/api/categories/{category_id}", tags=["Categories"])
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = crud.delete_category(db, category_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    return {"message": "Category deleted"}


# ─── Serve React SPA (must be LAST) ──────────────────────────────────────────

FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        # Don't serve SPA for /api routes (already handled above)
        if full_path.startswith("api/"):
            raise HTTPException(404)
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(str(index))
        raise HTTPException(404, "Frontend not built. Run: cd frontend && npm run build")

    @app.get("/", include_in_schema=False)
    def serve_root():
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return {"message": "API is running. Frontend not built yet.", "docs": "/api/docs"}
