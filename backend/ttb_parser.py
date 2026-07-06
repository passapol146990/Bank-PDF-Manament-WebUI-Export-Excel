import re
import io
import hashlib
from typing import List, Optional
from pdf_parser import ParsedTransaction, ParsedStatement

# balance อาจเป็น .00 (ไม่มี digit นำหน้า) เช่น "3,500.00 .00" หรือ "11,000.00 .00"
RE_TX = re.compile(
    r'^(\d{2}/\d{2}/\d{2})\s+'      # date DD/MM/YY
    r'(\w{2,4})\s+'                  # type NT/TR/CA
    r'([\d,]+\.\d{2})\s+'            # amount
    r'(\d[\d,]*\.\d{2}|\.\d{2})\s+' # balance — รองรับ .00-.99 (ไม่มี digit นำหน้า)
    r'(\S+)\s*$'                     # ref
)
RE_BF  = re.compile(r'^BF\s+(\d[\d,]*\.\d{2}|\.\d{2})')
RE_ACC = re.compile(r'(\d{3}-\d{1}-\d{5}-\d{1})')
RE_PER = re.compile(r'(\d{2}/\d{2}/\d{2})\s+(\d{4})')

SKIP_PREFIXES = (
    '438 SERMTHAI', 'THB', 'นาย ', 'นาง', 'น.ส.', 'บริษัท',
    'ออมทรัพย', 'ถ.', 'ต.', 'อ.', 'มหาสารคาม', '401 ',
)


def _n(s: str) -> float:
    return float(s.replace(',', ''))


def _skip(line: str) -> bool:
    if not line.strip():
        return True
    for p in SKIP_PREFIXES:
        if line.startswith(p):
            return True
    return False


def parse_ttb_pdf(file_bytes: bytes, filename: str = "statement.pdf") -> ParsedStatement:
    try:
        import pdfplumber
    except ImportError:
        raise RuntimeError("pdfplumber not installed. Run: pip install pdfplumber")

    file_hash = hashlib.md5(file_bytes).hexdigest()
    stmt = ParsedStatement(file_hash=file_hash, bank_name="TTB Bank")

    all_lines: List[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text(x_tolerance=3, y_tolerance=3)
            if text:
                all_lines.extend(text.split('\n'))

    if not all_lines:
        return stmt

    full_text = '\n'.join(all_lines)

    m = RE_ACC.search(full_text)
    if m:
        stmt.account_number = m.group(1)

    name_m = re.search(r'((?:นาย|นาง(?:สาว)?|น\.ส\.|บริษัท)\s+[\S ]+?)(?:\n|\r)', full_text)
    if name_m:
        stmt.account_name = name_m.group(1).strip()

    periods = RE_PER.findall(full_text)
    if periods:
        stmt.period_start = periods[0][0]
        stmt.period_end   = periods[-1][0]

    prev_bal: Optional[float] = None
    raw: List[ParsedTransaction] = []

    for line in all_lines:
        line = line.strip()
        if not line:
            continue

        m = RE_BF.match(line)
        if m:
            prev_bal = _n(m.group(1))
            continue

        if _skip(line):
            continue

        m = RE_TX.match(line)
        if not m:
            continue

        date_str, tx_type, amt_str, bal_str, ref = m.groups()
        amt = _n(amt_str)
        bal = _n(bal_str)

        # กรณี balance < 1 บาท และ prev_bal > 0 — ต้องเป็น withdrawal เสมอ
        if bal < 1.0 and prev_bal is not None and prev_bal > bal:
            is_deposit = False
        elif prev_bal is not None:
            is_deposit = bal > prev_bal
        else:
            is_deposit = None

        tx = ParsedTransaction(
            date=date_str,
            particulars=tx_type,
            via=ref,
            balance=bal,
        )

        if is_deposit is True:
            tx.deposit = amt
        elif is_deposit is False:
            tx.withdrawal = amt
        else:
            # ไม่มี context — เก็บไว้เป็น deposit ก่อน user แก้ได้
            tx.deposit = amt

        prev_bal = bal
        raw.append(tx)

    stmt.transactions = raw
    return stmt
