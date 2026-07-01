"""
KTB (Krungthai Bank) PDF Statement Parser
Handles ใบแจ้งรายการบัญชีเงินฝากสะสมทรัพย์

Column layout per line:
  DD/MM  PARTICULARS  [CHQ.NO]  WITHDRAWAL  DEPOSIT  BALANCE  VIA

Key insight from real PDF:
- Each line has exactly 2 numeric values: (amount, balance)
- Whether the amount is withdrawal or deposit is determined by balance movement:
    balance_new > balance_prev  →  deposit
    balance_new < balance_prev  →  withdrawal
"""
import re
import io
import hashlib
from typing import List, Optional
from dataclasses import dataclass, field


@dataclass
class ParsedTransaction:
    date: Optional[str] = None
    particulars: Optional[str] = None
    chq_no: Optional[str] = None
    withdrawal: Optional[float] = None
    deposit: Optional[float] = None
    balance: Optional[float] = None
    via: Optional[str] = None


@dataclass
class ParsedStatement:
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    bank_name: str = "Krungthai Bank"
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    transactions: List[ParsedTransaction] = field(default_factory=list)
    file_hash: Optional[str] = None


# ─── Regex ────────────────────────────────────────────────────────────────────

# Transaction line starts with DD/MM (no year on data rows)
RE_TX_DATE = re.compile(r'^(\d{2}/\d{2})\s+')

# Any number formatted with optional commas and 2 decimal places
RE_AMOUNT = re.compile(r'[\d,]+\.\d{2}')

# Account number: KTB format XXX-X-XXXXX-X
RE_ACCOUNT = re.compile(r'(\d{3}-\d{1}-\d{5}-\d{1})')

# Statement period: DD/MM/YYYY-DD/MM/YYYY  (note: no space around dash in PDF)
RE_PERIOD = re.compile(r'(\d{2}/\d{2}/\d{4})\s*[-–]\s*(\d{2}/\d{2}/\d{4})')

# Lines to skip unconditionally
SKIP_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in [
        r'^วันที่\s',
        r'^Date\s',
        r'^ใบ',
        r'^STATEMENT',
        r'^สาขา',
        r'^76/',               # address line
        r'^เรียน',
        r'^ที่อยู่',
        r'^ถ\.',
        r'^เมือง',
        r'^หน้าที่',
        r'^Page\s',
        r'^\d+\s*$',
    ]
]


def _should_skip(line: str) -> bool:
    if not line.strip():
        return True
    for pat in SKIP_PATTERNS:
        if pat.match(line):
            return True
    return False


def _parse_amount(s: str) -> Optional[float]:
    s = s.strip().replace(',', '')
    try:
        return float(s)
    except ValueError:
        return None


def _parse_tx_line(line: str) -> Optional[ParsedTransaction]:
    """
    Parse one transaction line.

    Real examples from KTB PDF:
      '02/01 TRF FR OTH BK 100.00 983.25 mPhone KTB X4282'
      '03/01 TRF. PROMPTPAY 100.00 1,083.25 mPhone SCB X0226'
      '04/01 TRF. PROMPTPAY 57,400.00 59,279.78 mPhone BBL X3440 นาย นราธิป เจริ'
      '04/01 BILL PAY E-CHN 5,442.47 1,690.78 Gtway Self Service'
      '01/01 B/F 883.25'

    Strategy:
      - Find all RE_AMOUNT matches in the line
      - Last amount  = balance
      - Second-to-last = the transaction amount (withdrawal or deposit)
      - Everything before the first amount (after date) = particulars
      - Everything after last amount = via
      - Use prev_balance to determine withdrawal vs deposit
    """
    line = line.strip()

    # Must start with DD/MM
    m = RE_TX_DATE.match(line)
    if not m:
        return None

    tx = ParsedTransaction()
    tx.date = m.group(1)
    rest = line[m.end():]

    # Skip B/F lines (brought forward balance only)
    rest_upper = rest.upper()
    if rest_upper.startswith('B/F') or 'ยอดยกมา' in rest_upper:
        # Still capture the opening balance
        amounts = RE_AMOUNT.findall(rest)
        if amounts:
            tx.particulars = 'B/F'
            tx.balance = _parse_amount(amounts[-1])
            tx._is_bf = True  # marker
        return tx

    # Find all amounts
    amount_matches = list(RE_AMOUNT.finditer(rest))
    if not amount_matches:
        return None

    # Particulars = text before first amount
    first_start = amount_matches[0].start()
    tx.particulars = re.sub(r'\s+', ' ', rest[:first_start]).strip()

    if len(amount_matches) >= 2:
        # Normal transaction: second-to-last = tx amount, last = balance
        tx_amount = _parse_amount(amount_matches[-2].group())
        tx.balance = _parse_amount(amount_matches[-1].group())
        # Via = text after last amount
        after = rest[amount_matches[-1].end():].strip()
        tx.via = after if after else None
        # Store tx_amount temporarily; W/D classification done after all lines parsed
        tx._tx_amount = tx_amount
    elif len(amount_matches) == 1:
        # Only balance (rare — some summary lines)
        tx.balance = _parse_amount(amount_matches[0].group())
        tx._tx_amount = None

    return tx


def _classify_wd(transactions: List[ParsedTransaction]) -> List[ParsedTransaction]:
    """
    Classify each transaction as withdrawal or deposit based on balance movement.

    If balance increased relative to previous → deposit
    If balance decreased → withdrawal

    This is more reliable than keyword matching.
    """
    result = []
    prev_balance = None

    for tx in transactions:
        # Skip B/F markers
        if getattr(tx, '_is_bf', False):
            if tx.balance is not None:
                prev_balance = tx.balance
            # Don't include B/F in output
            continue

        amount = getattr(tx, '_tx_amount', None)

        if amount is not None and prev_balance is not None and tx.balance is not None:
            if tx.balance >= prev_balance:
                tx.deposit = amount
                tx.withdrawal = None
            else:
                tx.withdrawal = amount
                tx.deposit = None
        elif amount is not None:
            # No prev_balance context — fallback to keyword heuristic
            particulars_lower = (tx.particulars or '').lower()
            deposit_kw = ['trf fr ', 'transfer from', 'trf fr oTH', 'deposit',
                          'รับโอน', 'เงินเข้า', 'credit']
            if any(k in particulars_lower for k in deposit_kw):
                tx.deposit = amount
            else:
                tx.withdrawal = amount

        if tx.balance is not None:
            prev_balance = tx.balance

        # Clean up internal marker
        for attr in ('_tx_amount', '_is_bf'):
            try:
                delattr(tx, attr)
            except AttributeError:
                pass

        result.append(tx)

    return result


def _extract_metadata(text: str) -> dict:
    meta = {}

    # Account number — KTB format
    m = RE_ACCOUNT.search(text)
    if m:
        meta['account_number'] = m.group(1)

    # Period
    m = RE_PERIOD.search(text)
    if m:
        meta['period_start'] = m.group(1)
        meta['period_end'] = m.group(2)

    # Account name — grab only the name part, stop before เลขที่บัญชี
    # Pattern from real PDF: "เรียน น.ส. นภารัตน์ เจริญสุข เลขที่บัญชี/Account No."
    name_match = re.search(
        r'เรียน\s+((?:นาย|นาง(?:สาว)?|น\.ส\.|บริษัท|ห้างหุ้นส่วน)\s+[^\n]+?)(?:\s+เลขที่|\s+ที่อยู่|$)',
        text
    )
    if name_match:
        meta['account_name'] = name_match.group(1).strip()
    else:
        # Fallback: look for name pattern without "เรียน"
        name_match2 = re.search(
            r'((?:นาย|นาง(?:สาว)?|น\.ส\.)\s+[\u0E00-\u0E7F]+\s+[\u0E00-\u0E7F]+)',
            text
        )
        if name_match2:
            meta['account_name'] = name_match2.group(1).strip()

    return meta


def parse_ktb_pdf(file_bytes: bytes, filename: str = "statement.pdf") -> ParsedStatement:
    """
    Parse a KTB Bank Statement PDF into structured data.

    Returns ParsedStatement with account info + list of ParsedTransaction.
    """
    try:
        import pdfplumber
    except ImportError:
        raise RuntimeError("pdfplumber not installed. Run: pip install pdfplumber")

    file_hash = hashlib.md5(file_bytes).hexdigest()
    statement = ParsedStatement(file_hash=file_hash)

    all_lines: List[str] = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text(x_tolerance=3, y_tolerance=3)
            if text:
                all_lines.extend(text.split('\n'))

    if not all_lines:
        return statement

    # Extract metadata from full text
    full_text = '\n'.join(all_lines)
    meta = _extract_metadata(full_text)
    statement.account_number = meta.get('account_number')
    statement.account_name = meta.get('account_name')
    statement.period_start = meta.get('period_start')
    statement.period_end = meta.get('period_end')

    # Parse transaction lines
    raw_transactions: List[ParsedTransaction] = []

    for line in all_lines:
        line = line.strip()
        if not line or _should_skip(line):
            continue
        tx = _parse_tx_line(line)
        if tx:
            raw_transactions.append(tx)

    # Classify withdrawal vs deposit using balance movement
    statement.transactions = _classify_wd(raw_transactions)

    return statement
