import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { updateTransaction, bulkUpdateTransactions } from '../api'
import CategoryManager from './CategoryManager'

// แปลง hex color → row background (10% opacity) และ badge style แบบ dynamic
// รองรับทั้งหมวดหมู่ default และที่ user เพิ่มเอง
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return { r, g, b }
}

// คืน inline style สำหรับ row background (สีอ่อนมาก ~8% opacity)
function getRowStyle(hex) {
  if (!hex || hex === '#6B7280') return {}   // Uncategorized → white
  const { r, g, b } = hexToRgb(hex)
  return { backgroundColor: `rgba(${r},${g},${b},0.08)` }
}

// คืน inline style สำหรับ badge/select ในคอลัมน์หมวดหมู่ (20% opacity bg + border)
function getBadgeStyle(hex) {
  if (!hex || hex === '#6B7280') return {}
  const { r, g, b } = hexToRgb(hex)
  return {
    backgroundColor: `rgba(${r},${g},${b},0.15)`,
    color: shadeHex(hex, -60),          // เข้มขึ้นเพื่อความอ่านง่าย
    borderColor: `rgba(${r},${g},${b},0.4)`,
  }
}

// ทำให้ hex color เข้มขึ้น/อ่อนลง (delta < 0 = เข้มขึ้น)
function shadeHex(hex, delta) {
  const { r, g, b } = hexToRgb(hex)
  const clamp = v => Math.max(0, Math.min(255, v + delta))
  return `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`
}

const PAGE_SIZE_OPTIONS = [25, 50, 100]

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

  // Build page number array with ellipsis
  const pages = useMemo(() => {
    const arr = []
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2))
        arr.push(i)
      else if (arr[arr.length - 1] !== '…')
        arr.push('…')
    }
    return arr
  }, [page, totalPages])

  const start = Math.min((page - 1) * pageSize + 1, totalItems)
  const end   = Math.min(page * pageSize, totalItems)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50 select-none">

      {/* Left: row count + page size picker */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500">
          {start}–{end} จาก {totalItems} รายการ
        </span>
        <select
          value={pageSize}
          onChange={e => { onPageSize(Number(e.target.value)); onPage(1) }}
          className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s} / หน้า</option>)}
        </select>
      </div>

      {/* Center: prev / numbered pages / next */}
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(1)}        disabled={page === 1}          className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">«</button>
        <button onClick={() => onPage(page - 1)} disabled={page === 1}          className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">‹</button>
        {pages.map((p, i) =>
          p === '…'
            ? <span key={`d${i}`} className="px-1 text-gray-400 text-xs">…</span>
            : <button
                key={p}
                onClick={() => onPage(p)}
                className={`min-w-[28px] py-1 text-xs rounded border transition-colors
                  ${p === page ? 'bg-blue-600 text-white border-blue-600 font-semibold' : 'border-gray-200 hover:bg-gray-100'}`}
              >{p}</button>
        )}
        <button onClick={() => onPage(page + 1)} disabled={page === totalPages} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">›</button>
        <button onClick={() => onPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">»</button>
      </div>

      {/* Right: jump-to-page + skip-uncategorized */}
      <div className="flex items-center gap-2">
        <form onSubmit={handleJump} className="flex items-center gap-1">
          <span className="text-xs text-gray-400">ไปหน้า</span>
          <input
            type="number" min={1} max={totalPages}
            value={jumpVal} onChange={e => setJumpVal(e.target.value)}
            placeholder={String(page)}
            className="w-14 text-xs border border-gray-200 rounded px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button type="submit" className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded">ไป</button>
        </form>
        <button
          onClick={onJumpUncategorized}
          className="text-xs px-3 py-1.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300 rounded-lg font-medium transition-colors whitespace-nowrap"
          title="ข้ามไปหน้าถัดไปที่ยังมีรายการไม่ถูกจัดหมวดหมู่"
        >
          ⏭ ข้ามไปที่ยังไม่จัด
        </button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function StatementGrid({ transactions, categories, onTransactionsUpdate, onCategoriesUpdate }) {
  const [selectedIds, setSelectedIds]         = useState(new Set())
  const [bulkCategory, setBulkCategory]       = useState('')
  const [savingIds, setSavingIds]             = useState(new Set())
  const [filterCategory, setFilterCategory]   = useState('all')
  const [search, setSearch]                   = useState('')
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [page, setPage]                       = useState(1)
  const [pageSize, setPageSize]               = useState(50)
  const [isFullscreen, setIsFullscreen]       = useState(false)
  const [highlightTxId, setHighlightTxId]     = useState(null)  // id ของ row ที่ต้องการโฟกัส

  // scroll ไปที่ด้านบนตาราง
  const scrollToTableTop = useCallback(() => {
    tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // scroll ไปที่ row id และ highlight ชั่วคราว
  const scrollToRow = useCallback((txId) => {
    setHighlightTxId(txId)
    // รอ render ก่อน แล้วค่อย scroll
    setTimeout(() => {
      const el = document.getElementById(`tx-${txId}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // ปิด highlight หลัง 2 วินาที
      setTimeout(() => setHighlightTxId(null), 2000)
    }, 50)
  }, [])

  const isDragging     = useRef(false)
  const dragSelectMode = useRef(null)
  const saveTimeouts   = useRef({})
  const selectedIdsRef = useRef(selectedIds)
  const tableTopRef    = useRef(null)   // scroll-to-top เมื่อเปลี่ยนหน้า
  useEffect(() => { selectedIdsRef.current = selectedIds }, [selectedIds])

  // กด Esc เพื่อออกจาก fullscreen
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen])

  // Sort categories by sort_order for dropdown
  const categoryOptions = useMemo(() => {
    const sorted = [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const names = sorted.map(c => c.name)
    // Ensure Uncategorized appears last
    const withoutUncat = names.filter(n => n !== 'Uncategorized')
    return ['Uncategorized', ...withoutUncat]
  }, [categories])

  // Map: category name → hex color (for dynamic row/badge coloring)
  const categoryColorMap = useMemo(() => {
    const map = {}
    categories.forEach(c => { map[c.name] = c.color })
    return map
  }, [categories])

  // Filtered list (full, for pagination math)
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

  // Reset page when filter/search/pageSize changes
  useEffect(() => { setPage(1) }, [filterCategory, search, pageSize])

  // Current page slice — only these rows are rendered → fixes performance
  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize])

  // Jump to next page that has at least one Uncategorized row
  const handleJumpUncategorized = useCallback(() => {
    const afterStart = page * pageSize
    const idx = filtered.findIndex((t, i) => i >= afterStart && t.category === 'Uncategorized')
    if (idx !== -1) {
      setPage(Math.floor(idx / pageSize) + 1)
      return
    }
    // Wrap from beginning
    const fromStart = filtered.findIndex(t => t.category === 'Uncategorized')
    if (fromStart === -1) {
      toast.success('🎉 จัดหมวดหมู่ครบทุกรายการแล้ว!', { duration: 5000 })
    } else {
      const tp = Math.floor(fromStart / pageSize) + 1
      setPage(tp)
      toast(`ข้ามไปหน้า ${tp} (จากต้น)`, { icon: '🔄', duration: 3000 })
    }
  }, [filtered, page, pageSize])

  // Selection — scoped to current page's rows only for "select all"
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

  // Drag-to-select
  const handleRowMouseDown = useCallback((e, id) => {
    if (e.button === 2) {
      e.preventDefault()
      isDragging.current = true; dragSelectMode.current = 'deselect'
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
      return
    }
    if (e.button !== 0) return
    e.preventDefault()
    isDragging.current = true
    const already = selectedIdsRef.current.has(id)
    dragSelectMode.current = already ? 'deselect' : 'select'
    setSelectedIds(prev => { const n = new Set(prev); already ? n.delete(id) : n.add(id); return n })
  }, [])

  const handleRowMouseEnter = useCallback((id) => {
    if (!isDragging.current) return
    setSelectedIds(prev => { const n = new Set(prev); dragSelectMode.current === 'select' ? n.add(id) : n.delete(id); return n })
  }, [])

  const handleContextMenu = useCallback((e) => e.preventDefault(), [])

  useEffect(() => {
    const stop = () => { isDragging.current = false }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  // Retry helper — ลอง fn สูงสุด maxRetries รอบ, หน่วงเพิ่มขึ้นทุกรอบ (exponential backoff)
  const withRetry = useCallback(async (fn, { maxRetries = 3, baseDelay = 500 } = {}) => {
    let lastErr
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastErr = err
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, baseDelay * attempt))
        }
      }
    }
    throw lastErr
  }, [])

  // Auto-save (single row) — retry 3 รอบถ้าล้มเหลว
  const handleCategoryChange = useCallback((id, category) => {
    onTransactionsUpdate(prev => prev.map(t => t.id === id ? { ...t, category, status: 'categorized' } : t))
    if (saveTimeouts.current[id]) clearTimeout(saveTimeouts.current[id])
    setSavingIds(prev => new Set([...prev, id]))
    saveTimeouts.current[id] = setTimeout(async () => {
      try {
        await withRetry(
          () => updateTransaction(id, { category, status: 'categorized' }),
          { maxRetries: 3, baseDelay: 500 }
        )
        toast.success(`บันทึกแล้ว: ${category}`, { id: `sv-${id}`, duration: 5000 })
      } catch {
        toast.error('บันทึกไม่สำเร็จ (ลองซ้ำ 3 รอบแล้ว)', { id: `er-${id}`, duration: 5000 })
      } finally {
        setSavingIds(prev => { const n = new Set(prev); n.delete(id); return n })
      }
    }, 400)
  }, [onTransactionsUpdate, withRetry])

  // Bulk apply — retry 3 รอบถ้าล้มเหลว
  const handleBulkApply = async () => {
    if (!bulkCategory || selectedIds.size === 0) { toast.error('เลือกรายการและหมวดหมู่ก่อน', { duration: 5000 }); return }
    const ids = [...selectedIds]
    const tid = toast.loading(`กำลังบันทึก ${ids.length} รายการ...`)
    try {
      await withRetry(
        () => bulkUpdateTransactions(ids, bulkCategory),
        { maxRetries: 3, baseDelay: 500 }
      )
      onTransactionsUpdate(prev => prev.map(t => ids.includes(t.id) ? { ...t, category: bulkCategory, status: 'categorized' } : t))
      toast.success(`อัพเดต ${ids.length} รายการ → ${bulkCategory}`, { id: tid, duration: 5000 })
      setSelectedIds(new Set()); setBulkCategory('')
    } catch {
      toast.error('อัพเดตไม่สำเร็จ (ลองซ้ำ 3 รอบแล้ว)', { id: tid, duration: 5000 })
    }
  }

  // Categories updated from manager
  const handleCategoriesUpdate = useCallback((updated) => {
    onCategoriesUpdate(updated)
  }, [onCategoriesUpdate])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {showCategoryManager && (
        <CategoryManager
          categories={categories}
          onCategoriesUpdate={handleCategoriesUpdate}
          onClose={() => setShowCategoryManager(false)}
        />
      )}

      {/* ── Floating bulk-action bar (bottom-right) ── */}
      <div
        className={`fixed bottom-6 right-6 z-40 transition-all duration-300 ease-out
          ${selectedIds.size > 0
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : 'translate-y-6 opacity-0 pointer-events-none'}`}
      >
        <div className="flex items-center gap-2 bg-gray-900 text-white rounded-2xl shadow-2xl px-4 py-3 border border-gray-700">
          <div className="flex items-center gap-1.5 pr-3 border-r border-gray-700 shrink-0">
            <span className="bg-blue-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
              {selectedIds.size}
            </span>
            <span className="text-xs text-gray-300 whitespace-nowrap">รายการ</span>
          </div>
          <select
            value={bulkCategory}
            onChange={e => setBulkCategory(e.target.value)}
            className="text-sm bg-gray-800 border border-gray-600 text-white rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[160px] cursor-pointer"
          >
            <option value="">-- เลือกหมวดหมู่ --</option>
            {categoryOptions.filter(c => c !== 'Uncategorized').map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button onClick={handleBulkApply} disabled={!bulkCategory}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap">
            ✅ ใช้เลย
          </button>
          <button onClick={() => setShowCategoryManager(true)} title="จัดการหมวดหมู่"
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl transition-colors text-base">
            🗂️
          </button>
          <button onClick={() => { setSelectedIds(new Set()); setBulkCategory('') }} title="ล้างการเลือก"
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl transition-colors text-base">
            ✕
          </button>
        </div>
      </div>

      {/* ── Main card — fullscreen or normal ── */}
      <div className={`bg-white flex flex-col transition-all duration-200
        ${isFullscreen
          ? 'fixed inset-0 z-30 rounded-none shadow-none'
          : 'rounded-2xl shadow-sm border border-gray-100 overflow-hidden'}`}
      >
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
            <span className="text-sm text-gray-400 select-none">
              {filtered.length} / {transactions.length} รายการ
            </span>
            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen(f => !f)}
              title={isFullscreen ? 'ออกจากเต็มจอ (Esc)' : 'เต็มจอ'}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors text-base ml-auto"
            >
              {isFullscreen ? '⊠' : '⛶'}
            </button>
          </div>
          {transactions.length > 0 && (
            <p className="text-xs text-gray-400 select-none mt-2">
              💡 <strong>คลิกซ้ายค้างลาก</strong> = เลือก &nbsp;|&nbsp; <strong>คลิกขวาค้างลาก</strong> = ยกเลิกการเลือก &nbsp;|&nbsp; เลือกแล้วใช้ <strong>แถบด้านล่างขวา</strong> กำหนดหมวดหมู่
              {isFullscreen && <span className="ml-3 text-gray-300">· กด <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-gray-500 font-mono">Esc</kbd> เพื่อออก</span>}
            </p>
          )}
        </div>

        {/* Table — flex-1 + overflow ทำให้ stretch เต็มความสูงตอน fullscreen */}
        <div
          className="flex-1 overflow-auto"
          style={{ userSelect: 'none', minHeight: isFullscreen ? 0 : undefined }}
          onContextMenu={handleContextMenu}
        >
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
                const isSel  = selectedIds.has(tx.id)
                const isSave = savingIds.has(tx.id)
                const catHex = categoryColorMap[tx.category]
                return (
                  <tr key={tx.id}
                    onMouseDown={e => handleRowMouseDown(e, tx.id)}
                    onMouseEnter={() => handleRowMouseEnter(tx.id)}
                    style={isSel ? {} : getRowStyle(catHex)}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${isSel ? '!bg-blue-50 outline outline-2 outline-blue-400 outline-offset-[-2px]' : 'hover:brightness-95'}`}
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
                        <select value={tx.category || 'Uncategorized'} onChange={e => handleCategoryChange(tx.id, e.target.value)}
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
            onPage={setPage} onPageSize={setPageSize}
            onJumpUncategorized={handleJumpUncategorized}
          />
        )}
      </div>
    </>
  )
}
