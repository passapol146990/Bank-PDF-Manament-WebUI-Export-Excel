# AGENT.md — Bank Statement Categorization App
> Context ย่อสำหรับ AI Agent — อ่านไฟล์นี้ก่อนลงมือทำงานทุกครั้ง

---

## Project Overview
Web app จัดหมวดหมู่รายการธนาคาร รองรับ **KTB** และ **TTB**
- Upload PDF/Excel/CSV/JSON → parse → ตาราง → จัดหมวดหมู่ → export Excel
- **Single port**: FastAPI serve React build บน port 8000
- DB: SQLite (`backend/bank_statements.db`)

---

## Tech Stack
| Layer | Stack |
|-------|-------|
| Backend | Python, FastAPI, SQLAlchemy, pdfplumber, pandas, openpyxl |
| Frontend | React 18 (Vite), Tailwind CSS 3, Axios, Recharts, react-hot-toast |
| DB | SQLite via SQLAlchemy |

---

## File Structure
```
backend/
├── main.py           # FastAPI app, all /api/* endpoints, serve React dist
├── models.py         # UploadSession, Transaction, CategoryConfig
├── schemas.py        # Pydantic v2 schemas
├── crud.py           # DB operations
├── pdf_parser.py     # KTB PDF parser
├── ttb_parser.py     # TTB PDF parser
├── database.py       # SQLite engine, get_db(), run_migrations()
└── requirements.txt

frontend/
├── src/
│   ├── App.jsx                    # Main shell, session/upload/export
│   ├── api.js                     # Axios client (baseURL: /api)
│   ├── main.jsx
│   ├── index.css
│   └── components/
│       ├── StatementGrid.jsx      # Table, pagination, drag-select, bulk, flow edit
│       ├── DashboardSummary.jsx   # Stats + charts
│       ├── SessionList.jsx        # File list + checkbox toggle
│       ├── CategoryManager.jsx    # Manage categories + keyboard shortcuts
│       └── CategoryRemapPage.jsx  # Remap category names
└── vite.config.js    # proxy /api → 127.0.0.1:8000
```

---

## Database Models
```
UploadSession: id, filename, file_hash(MD5), account_number, account_name,
               bank_name, period_start, period_end, total_rows, categorized_rows

Transaction:   id, session_id(FK), date, particulars, chq_no, withdrawal,
               deposit, balance, via, category(default:Uncategorized), status(default:pending)

CategoryConfig: id, name, color, description, sort_order
```

---

## API Endpoints (all prefixed `/api`)
```
GET    /health
GET    /sessions
DELETE /sessions/{id}

GET    /transactions?session_id=X&session_ids=1,2,3   (multi-session support)
PUT    /transactions/{id}           update category/status/withdrawal/deposit/balance
PUT    /transactions/bulk           {ids, category, status, withdrawal, deposit}
PUT    /transactions/bulk-flow      {ids, flow: "in"|"out"}
POST   /transactions/bulk-assign    bulk by date/row range + flow_filter
GET    /transactions/stats
GET    /transactions/category-summary
GET    /transactions/distinct-categories
POST   /transactions/remap-category

POST   /upload?bank=ktb|ttb        PDF/xlsx/csv/json
GET    /export?session_ids=1,2,3   multi-session export → xlsx (RFC 5987 filename)

GET    /categories
POST   /categories
PUT    /categories/{id}
DELETE /categories/{id}
PUT    /categories/reorder

GET    /api/docs
```

---

## PDF Parsers

### pdf_parser.py (KTB)
- Pattern: `DD/MM  PARTICULARS  AMOUNT  BALANCE  VIA`
- W/D: balance movement (เพิ่ม=deposit, ลด=withdrawal)
- Extract: account_number (`\d{3}-\d-\d{5}-\d`), account_name, period

### ttb_parser.py (TTB)
- Pattern: `DD/MM/YY  TYPE  AMOUNT  BALANCE  REF`
- TYPE: NT, TR, CA, FE etc.
- BF line = opening balance สำหรับ classify W/D
- W/D: balance movement เหมือน KTB
- Extract: account_number, account_name, period

### Upload flow (PDF)
1. ผู้ใช้เลือกไฟล์ → **BankSelectModal popup** → เลือก KTB หรือ TTB → confirm
2. POST /upload?bank=ktb|ttb

---

## Frontend Key Behaviors

### Multi-session (checkedSessionIds)
- **SessionList**: checkbox ติ๊กแต่ละ session / select all
- transactions โหลดจากทุก session ที่ติ๊ก (`session_ids=1,2,3`)
- export เฉพาะ session ที่ติ๊ก
- `checkedSessionIds` บันทึกลง `localStorage` — persist หลัง refresh

### StatementGrid.jsx
- **ลำดับ #**: แสดง `(page-1)*pageSize + index + 1` ไม่ใช่ DB id
- **เรียงวันที่**: `DD/MM/YY` หรือ `DD/MM` → sort key `YYYY-MM-DD`
- **Drag-to-select**: left drag = select, right drag = deselect
- **Bulk save**: `applyCategory` ส่ง `PUT /transactions/bulk` ครั้งเดียว (ไม่ใช่ทีละ id)
- **Undo/Redo**: Ctrl+Z / Ctrl+Y, stack 50 รายการ
- **Keyboard shortcuts**: 1-9 กำหนด category ให้ hovered/selected rows
- **FlowEditCell**: hover → ✏️ → toggle เงินออก/เข้า + แก้ยอด (retry 3 รอบ)
- **Bulk flow**: floating bar ปุ่ม ↑ออก/↓เข้า → PUT /bulk-flow (1 request)
- **⚡ กำหนดช่วง Bulk**: modal 3 ขั้นตอน
  1. ช่วงวันที่ (`DD/MM/YY`) หรือช่วงลำดับที่
  2. ประเภทเงิน (ทั้งหมด / เข้า / ออก)
  3. เลือกหมวดหมู่ → ยืนยัน
- **Category ไม่ตรง DB**: แสดง badge 📌 สีส้ม + dropdown เปลี่ยนหมวดหมู่

### BulkAssign date format
- DB มีวันที่ 2 format: `DD/MM/YY` และ `DD/MM` (ไม่มีปี)
- parse_date_key() รองรับทั้งสองโดย detect default_year จาก data จริง

### App.jsx
- BankSelectModal: popup ก่อน upload PDF ทุกครั้ง
- Export: RFC 5987 Content-Disposition รองรับชื่อไฟล์ภาษาไทย

### Retry pattern
```js
async function retryFn(fn, max=3, delay=500) {
  for (let i=1; i<=max; i++) {
    try { return await fn() } catch(e) { if(i<max) await sleep(delay*i) else throw e }
  }
}
```
ใช้กับทุก save operation — category, flow, bulk

---

## Export Excel Structure
Sheet order (สรุปยอดรวมอยู่หน้าสุด):
1. **สรุปยอดรวม** — account info + summary table + grand total (formula-based)
2. **รายการทั้งหมด** — all transactions, color-coded
3. **โอนออกซื้อของ** / **โอนออกแยกบัญชีตัวเอง** / **จ่ายพนักงาน**
4. **ลูกค้าโอนให้** / **ค่าสาธารณูปโภค** / **อื่นๆ**
5. **[custom sheets]** — category นอก EXPORT_SHEET_MAP

Export filename: RFC 5987 (`filename*=UTF-8''...`) รองรับภาษาไทย

---

## Default Categories
| Category | Hex |
|---------|-----|
| จ่ายพนักงาน | #EF4444 |
| ซื้อของ | #F97316 |
| ค่าสาธารณูปโภค | #EAB308 |
| รายได้ | #22C55E |
| โอนเงิน | #3B82F6 |
| ค่าใช้จ่ายทั่วไป | #8B5CF6 |
| Uncategorized | #6B7280 |

---

## How to Run

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Frontend build
cd frontend && npm install && npm run build

# Start (single port)
cd backend && venv\Scripts\activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
# → http://localhost:8000

# หรือ npm start (preview)
cd frontend && npm start
```

```bash
# Dev mode (HMR)
# T1: cd backend && venv\Scripts\activate && uvicorn main:app --reload --port 8000
# T2: cd frontend && npm run dev
# → http://localhost:5173
# Vite proxy: /api → 127.0.0.1:8000 (ต้องใช้ 127.0.0.1 ไม่ใช่ localhost — Node 18+ IPv6 issue)
```

---

## Known Issues / Notes
- SQLite ไม่รองรับ concurrent writes — production ควรใช้ PostgreSQL
- ไม่มี user auth (single-user app)
- TTB parser รองรับ format `DD/MM/YY TYPE AMOUNT BALANCE REF` เท่านั้น
- DB date field มีทั้ง `DD/MM/YY` และ `DD/MM` (ไม่มีปี) — parse_date_key รองรับทั้งสอง
