# AGENT.md — Bank Statement Categorization App
> Context ย่อสำหรับ AI Agent — อ่านไฟล์นี้ก่อนลงมือทำงานทุกครั้ง

---

## Project Overview
Web app จัดหมวดหมู่รายการธนาคาร KTB (Krungthai Bank)
- Upload PDF statement → parse → แสดงตาราง → จัดหมวดหมู่ → export Excel
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
├── main.py          # FastAPI app, all /api/* endpoints, serve React dist
├── models.py        # UploadSession, Transaction, CategoryConfig
├── schemas.py       # Pydantic v2 schemas
├── crud.py          # DB operations
├── pdf_parser.py    # KTB PDF parser (pdfplumber, balance-movement W/D logic)
├── database.py      # SQLite engine, get_db()
└── requirements.txt

frontend/
├── src/
│   ├── App.jsx               # Main shell, session management, upload/export
│   ├── api.js                # Axios client (baseURL: /api)
│   ├── main.jsx              # ReactDOM entry, Toaster (duration:5000, loading:Infinity)
│   ├── index.css             # Tailwind + .table-scroll-container sticky header fix
│   └── components/
│       ├── StatementGrid.jsx  # Table + pagination + drag-select + auto-save
│       ├── DashboardSummary.jsx # Stats cards + Pie/Bar charts (Recharts)
│       └── SessionList.jsx    # Uploaded files list + resume progress
└── vite.config.js            # proxy /api → localhost:8000
```

---

## Database Models
```
UploadSession: id, filename, file_hash(MD5), account_number, account_name,
               bank_name, period_start, period_end, total_rows, categorized_rows

Transaction:   id, session_id(FK), date, particulars, chq_no, withdrawal,
               deposit, balance, via, category(default:Uncategorized), status(default:pending)

CategoryConfig: id, name, color, description
```

---

## API Endpoints (all prefixed `/api`)
```
GET    /health
GET    /sessions                    → list all sessions
DELETE /sessions/{id}               → delete session + its transactions
GET    /transactions?session_id=X   → get transactions (up to 50000)
PUT    /transactions/{id}           → update category/status (auto-save)
PUT    /transactions/bulk           → bulk update {ids, category, status}
DELETE /transactions                → delete all
GET    /transactions/stats
GET    /transactions/category-summary
POST   /upload                      → upload PDF/xlsx/csv → parse → store
GET    /export?session_id=X         → download categorized Excel
GET    /categories
POST   /categories
DELETE /categories/{id}
GET    /api/docs                    → Swagger UI
```

---

## PDF Parser (`pdf_parser.py`)
- ใช้ `pdfplumber` extract text line by line
- Pattern: `DD/MM  PARTICULARS  AMOUNT  BALANCE  VIA`
- **W/D classification**: ใช้ balance movement (balance เพิ่ม = deposit, ลด = withdrawal) ไม่ใช้ keyword
- Skip: header rows, B/F lines, page footers
- Extract metadata: account_number (regex `\d{3}-\d-\d{5}-\d`), account_name, period

---

## Frontend Key Behaviors

### StatementGrid.jsx
- **Pagination**: 25/50/100 rows per page, page number buttons + jump-to-page input
- **⏭ ข้ามไปที่ยังไม่จัด**: กดเพื่อข้ามไปหน้าถัดที่มี Uncategorized row (wrap around)
- **Drag-to-select**: left-click drag = select, right-click drag = deselect
- **stale closure fix**: ใช้ `selectedIdsRef` sync ทุก render
- **Auto-save**: debounce 400ms ต่อ row → PUT /api/transactions/{id}
- **Bulk apply**: เลือกหลาย row + dropdown → PUT /api/transactions/bulk
- **Add category**: ปุ่ม ➕ เปิด modal กรอกชื่อ+สี → POST /api/categories
- **No sort**: รักษาลำดับเอกสารต้นฉบับ (order by id)

### App.jsx
- Auto-load sessions on mount, auto-select session[0]
- Upload: PDF → loading toast (Infinity duration) → parse → switch to new session
- Export: GET /api/export?session_id=X → download .xlsx ชื่อไฟล์ตาม PDF ต้นฉบับ
- Session resume: คลิก SessionList item → load transactions ของ session นั้น

### Toast durations
- success/error: 5000ms
- loading: Infinity (ต้องปิดด้วย `toast.success(..., { id: tid })`)

### Sticky header fix
```css
.table-scroll-container { overflow-x: auto; overflow-y: auto; max-height: 600px; }
.table-scroll-container table { border-collapse: separate; border-spacing: 0; }
.table-scroll-container thead th { position: sticky; top: 0; z-index: 20; box-shadow: 0 1px 0 #374151; }
```

---

## Export Excel Structure
Sheet order (สรุปยอดรวม อยู่หน้าสุด):
1. **สรุปยอดรวม** — account info + category summary table + grand total
2. **รายการทั้งหมด** — all transactions, color-coded by category
3. **โอนออกซื้อของ** — category: ซื้อของ + subtotal row
4. **โอนออกแยกบัญชีตัวเอง** — category: โอนเงิน
5. **จ่ายพนักงาน** — category: จ่ายพนักงาน
6. **ลูกค้าโอนให้** — category: รายได้
7. **ค่าสาธารณูปโภค** — category: ค่าสาธารณูปโภค
8. **อื่นๆ** — categories: ค่าใช้จ่ายทั่วไป + Uncategorized
9. **[custom]** — custom categories ที่ user เพิ่มเอง (auto-created)

---

## Default Categories & Colors
| Category | Hex | Tailwind |
|---------|-----|---------|
| จ่ายพนักงาน | #EF4444 | red |
| ซื้อของ | #F97316 | orange |
| ค่าสาธารณูปโภค | #EAB308 | yellow |
| รายได้ | #22C55E | green |
| โอนเงิน | #3B82F6 | blue |
| ค่าใช้จ่ายทั่วไป | #8B5CF6 | purple |
| Uncategorized | #6B7280 | gray |

---

## How to Run

```bash
# Backend (first time)
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Frontend build (production mode)
cd frontend
npm install
npm run build

# Start server (single port)
cd backend
venv\Scripts\activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
# → http://localhost:8000
```

```bash
# Dev mode (2 terminals, HMR)
# T1: cd backend && venv\Scripts\activate && uvicorn main:app --reload --port 8000
# T2: cd frontend && npm run dev
# → http://localhost:5173
```

---

## Known Issues / TODO
- [ ] PDF parser รองรับเฉพาะ KTB format — ธนาคารอื่นยังไม่ได้ทดสอบ
- [ ] ไม่มี user auth (single-user app)
- [ ] SQLite ไม่รองรับ concurrent writes — ถ้าต้องการ production ใช้ PostgreSQL แทน
