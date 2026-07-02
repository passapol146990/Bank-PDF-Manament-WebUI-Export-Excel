import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { updateTransaction, bulkUpdateTransactions } from '../api'
import CategoryManager from './CategoryManager'

// ─── Color helpers ────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}
function getRowStyle(hex) {
  if (!hex || hex === '#6B7280') return {}
  const { r, g, b } = hexToRgb(hex)
  return { backgroundColor: `rgba(${r},${g},${b},0.08)` }
}
function getBadgeStyle(hex) {
  if (!hex || hex === '#6B7280') return {}
  const { r, g, b } = hexToRgb(hex)
  const clamp = v => Math.max(0, Math.min(255, v - 60))
  return {
    backgroundColor: `rgba(${r},${g},${b},0.15)`,
    color: `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`,
    borderColor: `rgba(${r},${g},${b},0.4)`,
  }
}

const PAGE_SIZE_OPTIONS = [25, 50, 100]
const UNDO_LIMIT = 50   // เก็บประวัติสูงสุด 50 รายการ

function fmt(val) {
  if (val == null || val === '') return '-'
  return Number(val).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Pagination Bar ───────────────────────────────────────────────────────────
function PaginationBar({ page, totalPages, pageSize, totalItems, onPage, onPageSize, onJumpUncategorized }) {
  const [jumpVal, setJumpVal] = useState('')
  const handleJump = (e) => {
    e.preventDefault()
    const n = parseInt(jumpVal, 10)
    if (n >= 1 && n <= totalPages) { onPage(n); setJumpVal('') }
  }
  const pages = useMemo(() => {
    const arr = []
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) arr.push(i)
      else if (arr[arr.length - 1] !== '…') arr.push('…')
    }
    return arr
  }, [page, totalPages])
  const start = Math.min((page - 1) * pageSize + 1, totalItems)
  const end   = Math.min(page * pageSize, totalItems)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50 select-none">
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500">{start}–{end} จาก {totalItems} รายการ</span>
        <select value={pageSize} onChange={e => { onPageSize(Number(e.target.value)); onPage(1) }}
          className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300">
          {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s} / หน้า</option>)}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(1)}          disabled={page===1}          className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">«</button>
        <button onClick={() => onPage(page-1)}     disabled={page===1}          className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">‹</button>
        {pages.map((p,i) => p==='…'
          ? <span key={`d${i}`} className="px-1 text-gray-400 text-xs">…</span>
          : <button key={p} onClick={() => onPage(p)}
              className={`min-w-[28px] py-1 text-xs rounded border transition-colors ${p===page?'bg-blue-600 text-white border-blue-600 font-semibold':'border-gray-200 hover:bg-gray-100'}`}>{p}</button>
        )}
        <button onClick={() => onPage(page+1)}     disabled={page===totalPages} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">›</button>
        <button onClick={() => onPage(totalPages)} disabled={page===totalPages} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">»</button>
      </div>
      <div className="flex items-center gap-2">
        <form onSubmit={handleJump} className="flex items-center gap-1">
          <span className="text-xs text-gray-400">ไปหน้า</span>
          <input type="number" min={1} max={totalPages} value={jumpVal} onChange={e => setJumpVal(e.target.value)}
            placeholder={String(page)} className="w-14 text-xs border border-gray-200 rounded px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-blue-300" />
          <button type="submit" className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded">ไป</button>
        </form>
        <button onClick={onJumpUncategorized}
          className="text-xs px-3 py-1.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300 rounded-lg font-medium transition-colors whitespace-nowrap"
          title="ข้ามไปหน้าถัดไปที่ยังมีรายการไม่ถูกจัดหมวดหมู่">
          ⏭ ข้ามไปที่ยังไม่จัด
        </button>
      </div>
    </div>
  )
}

// ─── Keyboard Shortcut Legend ─────────────────────────────────────────────────
function ShortcutLegend({ shortcutMap, categoryColorMap }) {
  const entries = Object.entries(shortcutMap).sort(([a], [b]) => a.localeCompare(b))
  if (!entries.length) return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-t border-gray-100">
      <span className="text-xs text-gray-400">⌨️ ยังไม่ได้กำหนดปุ่มลัด — กด</span>
      <span className="text-xs font-medium text-blue-600">🗂️ จัดการหมวดหมู่</span>
      <span className="text-xs text-gray-400">เพื่อตั้งค่า</span>
    </div>
  )
  return (
    <div className="flex flex-wrap gap-1.5 px-4 py-2 bg-gray-50 border-t border-gray-100">
      <span className="text-xs text-gray-400 self-center mr-1">⌨️ ปุ่มลัด:</span>
      {entries.map(([key, cat]) => {
        const hex = categoryColorMap[cat]
        const { r, g, b } = hex ? hexToRgb(hex) : { r: 107, g: 114, b: 128 }
        return (
          <span key={key} className="inline-flex items-center gap-1 text-xs rounded-md px-2 py-0.5 border"
            style={{ backgroundColor: `rgba(${r},${g},${b},0.12)`, borderColor: `rgba(${r},${g},${b},0.35)`, color: `rgb(${Math.max(0,r-50)},${Math.max(0,g-50)},${Math.max(0,b-50)})` }}>
            <kbd className="font-mono font-bold">{key}</kbd>
            <span>{cat}</span>
          </span>
        )
      })}
      <span className="text-xs text-gray-400 self-center ml-2">
        · <kbd className="font-mono bg-gray-200 px-1 rounded text-gray-600">Ctrl+Z</kbd> ย้อนกลับ
        · <kbd className="font-mono bg-gray-200 px-1 rounded text-gray-600">Ctrl+Y</kbd> ไปข้างหน้า
      </span>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function StatementGrid({ transactions, categories, onTransactionsUpdate, onCategoriesUpdate }) {
  const [selectedIds, setSelectedIds]       = useState(new Set())
  const [bulkCategory, setBulkCategory]     = useState('')
  const [savingIds, setSavingIds]           = useState(new Set())
  const [filterCategory, setFilterCategory] = useState('all')
  const [search, setSearch]                 = useState('')
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [page, setPage]                     = useState(1)
  const [pageSize, setPageSize]             = useState(50)
  const [isFullscreen, setIsFullscreen]     = useState(false)
  const [highlightTxId, setHighlightTxId]   = useState(null)

  // ── Undo/Redo stacks (ref = ไม่ trigger re-render) ──────────────────────
  // entry: { ids: [id,...], prevCategories: {id: cat}, nextCategory: string }
  const undoStack = useRef([])   // undo stack
  const redoStack = useRef([])   // redo stack
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 })
  const syncHistorySize = useCallback(() => {
    setHistorySize({ undo: undoStack.current.length, redo: redoStack.current.length })
  }, [])

  const isDragging     = useRef(false)
  const dragSelectMode = useRef(null)
  const saveTimeouts   = useRef({})
  const selectedIdsRef = useRef(selectedIds)
  const tableTopRef    = useRef(null)
  useEffect(() => { selectedIdsRef.current = selectedIds }, [selectedIds])

  // กด Esc = ออก fullscreen
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen])

  // Sort categories by sort_order
  const categoryOptions = useMemo(() => {
    const sorted = [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const withoutUncat = sorted.map(c => c.name).filter(n => n !== 'Uncategorized')
    return ['Uncategorized', ...withoutUncat]
  }, [categories])

  // shortcutMap: อ่านจาก localStorage — user กำหนดเองใน CategoryManager
  const [keyBindings, setKeyBindings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kb_shortcuts') || '{}') }
    catch { return {} }
  })
  // sync เมื่อ tab อื่น/component อื่น update localStorage
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'kb_shortcuts') {
        try { setKeyBindings(JSON.parse(e.newValue || '{}')) } catch {}
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const shortcutMap = useMemo(() => {
    // กรองเฉพาะ key ที่มี value (ไม่ว่าง) และ category ยังมีอยู่จริง
    const valid = {}
    Object.entries(keyBindings).forEach(([key, cat]) => {
      if (cat && categoryOptions.includes(cat)) valid[key] = cat
    })
    return valid
  }, [keyBindings, categoryOptions])

  // Map name → hex color
  const categoryColorMap = useMemo(() => {
    const map = {}
    categories.forEach(c => { map[c.name] = c.color })
    return map
  }, [categories])

  // Filtered + paginated
  const filtered = useMemo(() => {
    let d = [...transactions]
    if (filterCategory !== 'all') d = d.filter(t => t.category === filterCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      d = d.filter(t =>
        (t.particulars || '').toLowerCase().includes(q) ||
        (t.date        || '').toLowerCase().includes(q) ||
        (t.via         || '').toLowerCase().includes(q)
      )
    }
    return d
  }, [transactions, filterCategory, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  useEffect(() => { setPage(1) }, [filterCategory, search, pageSize])
  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize])

  const scrollToTableTop = useCallback(() => {
    tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const scrollToRow = useCallback((txId) => {
    setHighlightTxId(txId)
    setTimeout(() => {
      document.getElementById(`tx-${txId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => setHighlightTxId(null), 2000)
    }, 50)
  }, [])

  // ── Retry helper ──────────────────────────────────────────────────────────
  const withRetry = useCallback(async (fn, { maxRetries = 3, baseDelay = 500 } = {}) => {
    let lastErr
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try { return await fn() }
      catch (err) {
        lastErr = err
        if (attempt < maxRetries) await new Promise(r => setTimeout(r, baseDelay * attempt))
      }
    }
    throw lastErr
  }, [])

  // ── Core: apply category to IDs (optimistic + save + undo record) ─────────
  const applyCategory = useCallback((ids, newCategory, { skipUndo = false, prevCategoryMap = null } = {}) => {
    if (!ids.length) return

    // snapshot ก่อนเปลี่ยน (เพื่อ undo)
    const prevMap = prevCategoryMap ?? Object.fromEntries(
      transactions.filter(t => ids.includes(t.id)).map(t => [t.id, t.category])
    )

    // optimistic update
    onTransactionsUpdate(prev => prev.map(t =>
      ids.includes(t.id) ? { ...t, category: newCategory, status: 'categorized' } : t
    ))

    // เพิ่ม undo entry
    if (!skipUndo) {
      undoStack.current = [
        { ids, prevCategories: prevMap, nextCategory: newCategory },
        ...undoStack.current,
      ].slice(0, UNDO_LIMIT)
      redoStack.current = []   // clear redo เมื่อมี action ใหม่
      syncHistorySize()
    }

    // debounce save ต่อ id — retry 3 รอบถ้าล้มเหลว
    ids.forEach(id => {
      if (saveTimeouts.current[id]) clearTimeout(saveTimeouts.current[id])
      setSavingIds(prev => new Set([...prev, id]))
      saveTimeouts.current[id] = setTimeout(async () => {
        let attempt = 0
        const maxRetries = 3
        let success = false
        while (attempt < maxRetries) {
          attempt++
          try {
            await updateTransaction(id, { category: newCategory, status: 'categorized' })
            success = true
            break
          } catch {
            if (attempt < maxRetries) {
              // หน่วง exponential backoff ก่อน retry (500ms, 1000ms)
              await new Promise(r => setTimeout(r, 500 * attempt))
            }
          }
        }
        if (!success) {
          toast.error(`บันทึก #${id} ไม่สำเร็จ (ลอง ${maxRetries} รอบแล้ว)`, { duration: 5000 })
        }
        setSavingIds(prev => { const n = new Set(prev); n.delete(id); return n })
      }, 400)
    })
  }, [transactions, onTransactionsUpdate, withRetry, syncHistorySize])

  // ── Undo ──────────────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (!undoStack.current.length) return
    const entry = undoStack.current.shift()

    // ย้าย entry ไป redo stack
    redoStack.current = [entry, ...redoStack.current].slice(0, UNDO_LIMIT)
    syncHistorySize()

    // restore แต่ละ id กลับ prevCategory ของมัน
    const { ids, prevCategories } = entry

    // group by prevCategory เพื่อ batch update
    const groups = {}
    ids.forEach(id => {
      const prev = prevCategories[id] || 'Uncategorized'
      if (!groups[prev]) groups[prev] = []
      groups[prev].push(id)
    })

    Object.entries(groups).forEach(([prevCat, groupIds]) => {
      applyCategory(groupIds, prevCat, { skipUndo: true })
    })

    toast(`↩ ย้อนกลับแล้ว`, { icon: '↩', duration: 2000 })
  }, [applyCategory, syncHistorySize])

  // ── Redo ──────────────────────────────────────────────────────────────────
  const handleRedo = useCallback(() => {
    if (!redoStack.current.length) return
    const entry = redoStack.current.shift()

    undoStack.current = [entry, ...undoStack.current].slice(0, UNDO_LIMIT)
    syncHistorySize()

    const prevMap = Object.fromEntries(
      transactions.filter(t => entry.ids.includes(t.id)).map(t => [t.id, t.category])
    )
    applyCategory(entry.ids, entry.nextCategory, { skipUndo: true, prevCategoryMap: prevMap })
    toast(`↪ ไปข้างหน้าแล้ว`, { icon: '↪', duration: 2000 })
  }, [applyCategory, syncHistorySize, transactions])

  // ── Single row change (dropdown) ──────────────────────────────────────────
  const handleCategoryChange = useCallback((id, category) => {
    applyCategory([id], category)
  }, [applyCategory])

  // ── Bulk apply ────────────────────────────────────────────────────────────
  const handleBulkApply = useCallback(async () => {
    if (!bulkCategory || selectedIds.size === 0) {
      toast.error('เลือกรายการและหมวดหมู่ก่อน', { duration: 5000 }); return
    }
    const ids = [...selectedIds]
    const tid = toast.loading(`กำลังบันทึก ${ids.length} รายการ...`)
    try {
      await withRetry(() => bulkUpdateTransactions(ids, bulkCategory))
      applyCategory(ids, bulkCategory)
      toast.success(`อัพเดต ${ids.length} รายการ → ${bulkCategory}`, { id: tid, duration: 5000 })
      setSelectedIds(new Set()); setBulkCategory('')
    } catch {
      toast.error('อัพเดตไม่สำเร็จ (ลองซ้ำ 3 รอบแล้ว)', { id: tid, duration: 5000 })
    }
  }, [bulkCategory, selectedIds, applyCategory, withRetry])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  // 1-9 = กำหนดหมวดหมู่ให้ selected rows (หรือ hovered row ถ้าไม่ได้เลือก)
  // Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
  const hoveredTxIdRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      // ไม่ fire ถ้า focus อยู่บน input/textarea (พิมพ์ข้อความ)
      // แต่ยังทำงานได้ถ้า focus อยู่บน select ในตาราง (category dropdown)
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      // ถ้าเป็น SELECT ให้ block เฉพาะที่ไม่ใช่ category column ในตาราง
      if (tag === 'SELECT' && !document.activeElement?.closest('td')) return

      // Undo
      if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); handleUndo(); return }
      // Redo
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault(); handleRedo(); return
      }

      // แปลง e.code → digit string รองรับทั้ง Digit1-9 (แถวตัวเลขบนแป้น)
      // และ Numpad1-9 (numpad ขวา) — ทำงานถูกต้องแม้ NumLock เปิด/ปิด
      let digit = null
      if (e.code?.startsWith('Digit'))  digit = e.code.replace('Digit', '')
      if (e.code?.startsWith('Numpad')) digit = e.code.replace('Numpad', '')
      // กรองเฉพาะ 1-9
      if (!digit || !['1','2','3','4','5','6','7','8','9'].includes(digit)) return

      const cat = shortcutMap[digit]
      if (!cat) return
      e.preventDefault()

      // ถ้า focus อยู่บน select ในตาราง ให้ blur ออกก่อนเพื่อป้องกัน browser เปลี่ยน option
      // และดึง tx id จาก tr ที่ select อยู่
      let focusedRowId = null
      if (document.activeElement?.tagName === 'SELECT') {
        const tr = document.activeElement.closest('tr[id^="tx-"]')
        if (tr) focusedRowId = parseInt(tr.id.replace('tx-', ''), 10)
        document.activeElement.blur()
      }

      const targets = selectedIdsRef.current.size > 0
        ? [...selectedIdsRef.current]
        : (hoveredTxIdRef.current ?? focusedRowId)
          ? [hoveredTxIdRef.current ?? focusedRowId]
          : []

      if (!targets.length) return

      applyCategory(targets, cat)
      const label = targets.length > 1 ? `${targets.length} รายการ` : `#${targets[0]}`
      toast.success(`${digit} → ${cat} (${label})`, { duration: 2500 })
      // ล้าง selection ทันทีหลังกำหนดสำเร็จ
      setSelectedIds(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcutMap, applyCategory, handleUndo, handleRedo])

  // Jump to uncategorized
  const handleJumpUncategorized = useCallback(() => {
    const afterStart = page * pageSize
    const idx = filtered.findIndex((t, i) => i >= afterStart && t.category === 'Uncategorized')
    if (idx !== -1) { setPage(Math.floor(idx / pageSize) + 1); scrollToTableTop(); return }
    const fromStart = filtered.findIndex(t => t.category === 'Uncategorized')
    if (fromStart === -1) {
      toast.success('🎉 จัดหมวดหมู่ครบทุกรายการแล้ว!', { duration: 5000 })
    } else {
      const tp = Math.floor(fromStart / pageSize) + 1
      setPage(tp); scrollToTableTop()
      toast(`ข้ามไปหน้า ${tp} (จากต้น)`, { icon: '🔄', duration: 3000 })
    }
  }, [filtered, page, pageSize, scrollToTableTop])

  // ── Selection ─────────────────────────────────────────────────────────────
  const allPageSelected = pageRows.length > 0 && pageRows.every(t => selectedIds.has(t.id))
  const toggleSelect = (id) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSelectAll = () => {
    const ids = pageRows.map(t => t.id)
    setSelectedIds(prev => {
      const n = new Set(prev)
      if (allPageSelected) ids.forEach(id => n.delete(id))
      else ids.forEach(id => n.add(id))
      return n
    })
  }

  // ── Drag-to-select ────────────────────────────────────────────────────────
  const handleRowMouseDown = useCallback((e, id) => {
    if (e.button === 2) {
      e.preventDefault()
      isDragging.current = true; dragSelectMode.current = 'deselect'
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n }); return
    }
    if (e.button !== 0) return
    e.preventDefault()
    isDragging.current = true
    const already = selectedIdsRef.current.has(id)
    dragSelectMode.current = already ? 'deselect' : 'select'
    setSelectedIds(prev => { const n = new Set(prev); already ? n.delete(id) : n.add(id); return n })
  }, [])
  const handleRowMouseEnter = useCallback((id) => {
    hoveredTxIdRef.current = id
    if (!isDragging.current) return
    setSelectedIds(prev => {
      const n = new Set(prev)
      dragSelectMode.current === 'select' ? n.add(id) : n.delete(id)
      return n
    })
  }, [])
  // ไม่ใช้ onMouseLeave ต่อ row เพราะ re-render จะ fire leave แล้ว reset ref
  // reset เฉพาะตอน mouse ออกจากตารางทั้งหมด (จัดการที่ wrapper div แทน)
  const handleTableMouseLeave = useCallback(() => { hoveredTxIdRef.current = null }, [])
  const handleContextMenu = useCallback((e) => e.preventDefault(), [])
  useEffect(() => {
    const stop = () => { isDragging.current = false }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  const handleCategoriesUpdate = useCallback((updated) => {
    onCategoriesUpdate(updated)
  }, [onCategoriesUpdate])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {showCategoryManager && (
        <CategoryManager categories={categories} onCategoriesUpdate={handleCategoriesUpdate}
          keyBindings={keyBindings} onKeyBindingsChange={(kb) => {
            setKeyBindings(kb)
            localStorage.setItem('kb_shortcuts', JSON.stringify(kb))
          }}
          onClose={() => setShowCategoryManager(false)} />
      )}

      {/* Floating bulk-action bar */}
      <div className={`fixed bottom-6 right-6 z-40 transition-all duration-300 ease-out
        ${selectedIds.size > 0 ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-6 opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-2 bg-gray-900 text-white rounded-2xl shadow-2xl px-4 py-3 border border-gray-700">
          <div className="flex items-center gap-1.5 pr-3 border-r border-gray-700 shrink-0">
            <span className="bg-blue-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">{selectedIds.size}</span>
            <span className="text-xs text-gray-300 whitespace-nowrap">รายการ</span>
          </div>
          <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}
            className="text-sm bg-gray-800 border border-gray-600 text-white rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[160px] cursor-pointer">
            <option value="">-- เลือกหมวดหมู่ --</option>
            {categoryOptions.filter(c => c !== 'Uncategorized').map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={handleBulkApply} disabled={!bulkCategory}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap">
            ✅ ใช้เลย
          </button>
          {/* Undo / Redo */}
          <button onClick={handleUndo} disabled={historySize.undo === 0}
            title={`ย้อนกลับ (Ctrl+Z) — ${historySize.undo} รายการ`}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-30 text-base">↩</button>
          <button onClick={handleRedo} disabled={historySize.redo === 0}
            title={`ไปข้างหน้า (Ctrl+Y) — ${historySize.redo} รายการ`}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-30 text-base">↪</button>
          <button onClick={() => setShowCategoryManager(true)} title="จัดการหมวดหมู่"
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl transition-colors text-base">🗂️</button>
          <button onClick={() => { setSelectedIds(new Set()); setBulkCategory('') }} title="ล้างการเลือก"
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl transition-colors text-base">✕</button>
        </div>
      </div>

      {/* Main card */}
      <div ref={tableTopRef} className={`bg-white flex flex-col transition-all duration-200
        ${isFullscreen ? 'fixed inset-0 z-30 rounded-none shadow-none' : 'rounded-2xl shadow-sm border border-gray-100 overflow-hidden'}`}>

        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">🔍</span>
              <input type="text" placeholder="ค้นหารายการ, วันที่, ช่องทาง..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option value="all">ทุกหมวดหมู่</option>
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => setShowCategoryManager(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 text-gray-600 font-medium transition-colors whitespace-nowrap">
              🗂️ จัดการหมวดหมู่
            </button>
            {/* Undo/Redo ในส่วนของ toolbar เมื่อไม่มีการเลือก */}
            <div className="flex items-center gap-1">
              <button onClick={handleUndo} disabled={historySize.undo === 0}
                title={`ย้อนกลับ Ctrl+Z (${historySize.undo})`}
                className="flex items-center gap-1 px-2 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30 transition-colors">
                ↩<span className="text-xs hidden sm:inline">ย้อน</span>
              </button>
              <button onClick={handleRedo} disabled={historySize.redo === 0}
                title={`ไปข้างหน้า Ctrl+Y (${historySize.redo})`}
                className="flex items-center gap-1 px-2 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30 transition-colors">
                ↪<span className="text-xs hidden sm:inline">หน้า</span>
              </button>
            </div>
            <span className="text-sm text-gray-400 select-none">{filtered.length} / {transactions.length} รายการ</span>
            <button onClick={() => setIsFullscreen(f => !f)} title={isFullscreen ? 'ออกจากเต็มจอ (Esc)' : 'เต็มจอ'}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors ml-auto">
              {isFullscreen ? '⊠' : '⛶'}
            </button>
          </div>
          {transactions.length > 0 && (
            <p className="text-xs text-gray-400 select-none mt-2">
              💡 <strong>คลิกซ้ายค้างลาก</strong> = เลือก &nbsp;|&nbsp; <strong>คลิกขวาค้างลาก</strong> = ยกเลิก &nbsp;|&nbsp; <strong>hover แล้วกดตัวเลข</strong> = กำหนดหมวดหมู่ทันที
              {isFullscreen && <span className="ml-2">· <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono text-gray-500">Esc</kbd> ออกเต็มจอ</span>}
            </p>
          )}
        </div>

        {/* Shortcut legend */}
        {transactions.length > 0 && (
          <ShortcutLegend shortcutMap={shortcutMap} categoryColorMap={categoryColorMap} />
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto" style={{ userSelect: 'none', minHeight: isFullscreen ? 0 : undefined }}
          onContextMenu={handleContextMenu}
          onMouseLeave={handleTableMouseLeave}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-white text-xs uppercase tracking-wide">
                <th className="px-3 py-3 w-10 bg-gray-800 text-center sticky top-0 z-20">
                  <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll}
                    className="rounded cursor-pointer accent-blue-400" />
                </th>
                {['#','วันที่','รายการ','ถอน (฿)','ฝาก (฿)','คงเหลือ (฿)','ช่องทาง'].map(h => (
                  <th key={h} className={`px-3 py-3 bg-gray-800 sticky top-0 z-20 ${['ถอน (฿)','ฝาก (฿)','คงเหลือ (฿)'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
                <th className="px-3 py-3 text-left min-w-[190px] bg-gray-800 sticky top-0 z-20">หมวดหมู่</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-20 text-gray-400">
                  <div className="text-5xl mb-3">📂</div>
                  <div className="text-sm">ไม่มีข้อมูล — อัพโหลด PDF หรือ Excel เพื่อเริ่มต้น</div>
                </td></tr>
              ) : pageRows.map(tx => {
                const isSel     = selectedIds.has(tx.id)
                const isSave    = savingIds.has(tx.id)
                const isHL      = highlightTxId === tx.id
                const catHex    = categoryColorMap[tx.category]
                return (
                  <tr key={tx.id} id={`tx-${tx.id}`}
                    onMouseDown={e => handleRowMouseDown(e, tx.id)}
                    onMouseEnter={() => handleRowMouseEnter(tx.id)}
                    style={isSel || isHL ? {} : getRowStyle(catHex)}
                    className={`border-b border-gray-100 cursor-pointer transition-colors
                      ${isHL  ? 'bg-yellow-50 outline outline-2 outline-yellow-400 outline-offset-[-2px]' : ''}
                      ${isSel ? '!bg-blue-50 outline outline-2 outline-blue-400 outline-offset-[-2px]' : ''}
                      ${!isSel && !isHL ? 'hover:brightness-95' : ''}`}
                  >
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={isSel} onChange={() => toggleSelect(tx.id)}
                        onClick={e => e.stopPropagation()} className="rounded accent-blue-500 w-4 h-4 cursor-pointer" />
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{tx.id}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs font-mono">{tx.date || '-'}</td>
                    <td className="px-3 py-2 text-gray-800 max-w-xs" title={tx.particulars}>
                      <div className="truncate">{tx.particulars || '-'}</div>
                      {tx.via && <div className="text-xs text-gray-400 truncate mt-0.5">{tx.via}</div>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-red-500 tabular-nums">
                      {tx.withdrawal ? fmt(tx.withdrawal) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-green-600 tabular-nums">
                      {tx.deposit ? fmt(tx.deposit) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-700 tabular-nums text-xs">
                      {tx.balance ? fmt(tx.balance) : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs max-w-[120px] truncate hidden lg:table-cell">{tx.via || '-'}</td>
                    <td className="px-3 py-2" onMouseDown={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <select value={tx.category || 'Uncategorized'}
                          onChange={e => handleCategoryChange(tx.id, e.target.value)}
                          style={getBadgeStyle(catHex)}
                          className="text-xs border rounded-lg px-2 py-1.5 w-full cursor-pointer font-medium focus:outline-none focus:ring-2 focus:ring-blue-300">
                          {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {isSave && <span className="animate-spin text-blue-400 text-sm shrink-0">⟳</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > 0 && (
          <PaginationBar
            page={page} totalPages={totalPages}
            pageSize={pageSize} totalItems={filtered.length}
            onPage={(p) => { setPage(p); scrollToTableTop() }}
            onPageSize={setPageSize}
            onJumpUncategorized={handleJumpUncategorized}
          />
        )}
      </div>
    </>
  )
}
