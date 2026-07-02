import { useState, useRef, useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import { createCategory, updateCategory, deleteCategory, reorderCategories } from '../api'

// ─── Inline edit row ──────────────────────────────────────────────────────────
function CategoryRow({ cat, isDragging, dragHandleProps, onEdit, onDelete, isProtected }) {
  const [editing, setEditing] = useState(false)
  const [name, setName]       = useState(cat.name)
  const [color, setColor]     = useState(cat.color)
  const [desc, setDesc]       = useState(cat.description || '')
  const nameRef = useRef(null)

  useEffect(() => {
    if (editing) nameRef.current?.focus()
  }, [editing])

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) { toast.error('ชื่อหมวดหมู่ต้องไม่ว่าง'); return }
    try {
      await onEdit(cat.id, { name: trimmed, color, description: desc.trim() || null })
      setEditing(false)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'แก้ไขไม่สำเร็จ', { duration: 5000 })
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter')  handleSave()
    if (e.key === 'Escape') { setEditing(false); setName(cat.name); setColor(cat.color); setDesc(cat.description || '') }
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all
        ${isDragging ? 'bg-blue-50 border-blue-300 shadow-lg scale-[1.01]' : 'bg-white border-gray-200 hover:border-gray-300'}`}
    >
      {/* Drag handle */}
      <span
        {...dragHandleProps}
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing text-base select-none shrink-0 px-0.5"
        title="ลากเพื่อเรียงลำดับ"
      >⠿</span>

      {/* Color dot / picker */}
      <label className="shrink-0 cursor-pointer" title="เปลี่ยนสี">
        <span
          className="w-5 h-5 rounded-full block border-2 border-white shadow"
          style={{ backgroundColor: editing ? color : cat.color }}
        />
        {editing && (
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            className="sr-only" />
        )}
      </label>

      {editing ? (
        /* ── Edit mode ─────────────────────────────────────────────────── */
        <div className="flex flex-1 items-center gap-2 flex-wrap min-w-0">
          <input
            ref={nameRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-[120px] text-sm border border-blue-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <input
            value={desc}
            onChange={e => setDesc(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="คำอธิบาย (ไม่จำเป็น)"
            className="flex-[2] min-w-[140px] text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-500"
          />
          <div className="flex items-center gap-1 shrink-0">
            <label className="flex items-center gap-1 text-xs cursor-pointer border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50">
              <span className="w-4 h-4 rounded-full shrink-0 border border-gray-300" style={{ backgroundColor: color }} />
              <span className="text-gray-500">สี</span>
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="sr-only" />
            </label>
            <button onClick={handleSave}
              className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
              บันทึก
            </button>
            <button onClick={() => { setEditing(false); setName(cat.name); setColor(cat.color); setDesc(cat.description || '') }}
              className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">
              ยกเลิก
            </button>
          </div>
        </div>
      ) : (
        /* ── View mode ─────────────────────────────────────────────────── */
        <>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-gray-800 truncate block">{cat.name}</span>
            {cat.description && (
              <span className="text-xs text-gray-400 truncate block">{cat.description}</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-2 py-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-200 transition-colors"
              title="แก้ไข"
            >✏️ แก้ไข</button>
            {!isProtected && (
              <button
                onClick={() => onDelete(cat)}
                className="text-xs px-2 py-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-colors"
                title="ลบ"
              >🗑️</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main CategoryManager Modal ───────────────────────────────────────────────
export default function CategoryManager({ categories, onCategoriesUpdate, onClose, keyBindings = {}, onKeyBindingsChange }) {
  const [items, setItems]         = useState([...categories].sort((a, b) => a.sort_order - b.sort_order))
  const [newName, setNewName]     = useState('')
  const [newColor, setNewColor]   = useState('#6B7280')
  const [newDesc, setNewDesc]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [activeTab, setActiveTab] = useState('categories')  // 'categories' | 'shortcuts'

  // local copy ของ bindings ที่กำลังแก้ไข
  const [localBindings, setLocalBindings] = useState({ ...keyBindings })

  // ── Drag state ────────────────────────────────────────────────────────────
  const dragIndex   = useRef(null)
  const dragOverIdx = useRef(null)
  const [draggingId, setDraggingId] = useState(null)

  useEffect(() => {
    setItems([...categories].sort((a, b) => a.sort_order - b.sort_order))
  }, [categories])

  // sync localBindings เมื่อ parent เปลี่ยน
  useEffect(() => { setLocalBindings({ ...keyBindings }) }, [keyBindings])

  // ── Add new category ──────────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const res = await createCategory({ name: trimmed, color: newColor, description: newDesc.trim() || null })
      const added = res.data
      const updated = [...items, added]
      setItems(updated)
      onCategoriesUpdate(updated)
      toast.success(`เพิ่ม "${trimmed}" แล้ว`, { duration: 5000 })
      setNewName(''); setNewColor('#6B7280'); setNewDesc('')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'เพิ่มไม่สำเร็จ', { duration: 5000 })
    } finally { setSaving(false) }
  }

  // ── Edit (inline) ─────────────────────────────────────────────────────────
  const handleEdit = async (id, data) => {
    const res = await updateCategory(id, data)
    const updated = items.map(c => c.id === id ? res.data : c)
    setItems(updated)
    onCategoriesUpdate(updated)
    toast.success('อัพเดตแล้ว', { duration: 5000 })
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (cat) => {
    if (!window.confirm(`ลบหมวดหมู่ "${cat.name}"?\nรายการที่อยู่ในหมวดนี้จะยังอยู่ แต่จะไม่มีหมวดนี้ให้เลือกใหม่`)) return
    try {
      await deleteCategory(cat.id)
      const updated = items.filter(c => c.id !== cat.id)
      setItems(updated)
      onCategoriesUpdate(updated)
      toast.success(`ลบ "${cat.name}" แล้ว`, { duration: 5000 })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'ลบไม่สำเร็จ', { duration: 5000 })
    }
  }

  // ── Drag-to-reorder (HTML5 drag API) ─────────────────────────────────────
  const handleDragStart = useCallback((e, index) => {
    dragIndex.current = index
    setDraggingId(items[index].id)
    e.dataTransfer.effectAllowed = 'move'
  }, [items])

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    dragOverIdx.current = index
  }, [])

  const handleDrop = useCallback(async (e, dropIndex) => {
    e.preventDefault()
    const from = dragIndex.current
    if (from === null || from === dropIndex) { setDraggingId(null); return }

    const reordered = [...items]
    const [moved]   = reordered.splice(from, 1)
    reordered.splice(dropIndex, 0, moved)

    // Assign sequential sort_order
    const withOrder = reordered.map((c, i) => ({ ...c, sort_order: i + 1 }))
    setItems(withOrder)
    setDraggingId(null)
    dragIndex.current   = null
    dragOverIdx.current = null

    try {
      const reorderPayload = withOrder.map(c => ({ id: c.id, sort_order: c.sort_order }))
      const res = await reorderCategories(reorderPayload)
      const serverItems = res.data
      setItems(serverItems)
      onCategoriesUpdate(serverItems)
    } catch {
      toast.error('บันทึกลำดับไม่สำเร็จ', { duration: 5000 })
    }
  }, [items, onCategoriesUpdate])

  const handleDragEnd = useCallback(() => {
    setDraggingId(null)
    dragIndex.current   = null
    dragOverIdx.current = null
  }, [])

  // Protected = ลบไม่ได้ (Uncategorized)
  const PROTECTED = ['Uncategorized']

  // ── Shortcut binding handlers ─────────────────────────────────────────────
  const handleBindingChange = (key, catName) => {
    setLocalBindings(prev => {
      const next = { ...prev }
      if (!catName) delete next[key]
      else next[key] = catName
      return next
    })
  }
  const handleSaveBindings = () => {
    onKeyBindingsChange?.(localBindings)
    toast.success('บันทึกปุ่มลัดแล้ว', { duration: 3000 })
  }
  const handleClearBindings = () => {
    setLocalBindings({})
    onKeyBindingsChange?.({})
    toast('ล้างปุ่มลัดแล้ว', { icon: '🗑️', duration: 3000 })
  }
  // คืนชื่อ cat ที่ key นี้ถูกผูกไว้ (ไม่นับ key ปัจจุบัน) — ป้องกัน duplicate
  const getConflict = (key, catName) => {
    if (!catName) return null
    const conflict = Object.entries(localBindings).find(([k, v]) => k !== key && v === catName)
    return conflict ? conflict[0] : null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-200">
          <div>
            <h2 className="text-base font-bold text-gray-800">🗂️ จัดการหมวดหมู่</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {activeTab === 'categories' ? 'ลากเพื่อเรียงลำดับ · คลิก แก้ไข เพื่อเปลี่ยนชื่อ/สี' : 'กำหนดปุ่ม 1–9 ให้หมวดหมู่ที่ใช้บ่อย'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600 transition-colors">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-white shrink-0">
          {[['categories', '📋 หมวดหมู่'], ['shortcuts', '⌨️ ปุ่มลัด']].map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px
                ${activeTab === id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab: หมวดหมู่ */}
        {activeTab === 'categories' && (<>
        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {items.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">ยังไม่มีหมวดหมู่</p>
          )}
          {items.map((cat, index) => (
            <div
              key={cat.id}
              draggable
              onDragStart={e => handleDragStart(e, index)}
              onDragOver={e => handleDragOver(e, index)}
              onDrop={e => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              <CategoryRow
                cat={cat}
                isDragging={draggingId === cat.id}
                dragHandleProps={{}}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isProtected={PROTECTED.includes(cat.name)}
              />
            </div>
          ))}
        </div>

        {/* Add new */}
        <div className="border-t border-gray-200 bg-white px-4 py-4">
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">➕ เพิ่มหมวดหมู่ใหม่</p>
          <form onSubmit={handleAdd} className="space-y-2">
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="ชื่อหมวดหมู่ เช่น ค่าเช่า, ค่าอาหาร..."
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <label className="flex items-center gap-1.5 cursor-pointer border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 shrink-0">
                <span className="w-5 h-5 rounded-full shrink-0 border border-gray-300 shadow-sm" style={{ backgroundColor: newColor }} />
                <span className="text-xs text-gray-500">สี</span>
                <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="sr-only" />
              </label>
            </div>
            <div className="flex gap-2">
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="คำอธิบาย (ไม่จำเป็น)"
                className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-500"
              />
              <button
                type="submit"
                disabled={!newName.trim() || saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg shrink-0 transition-colors"
              >
                {saving ? '⟳' : 'เพิ่ม'}
              </button>
            </div>
          </form>
        </div>
        </>)}

        {/* Tab: ปุ่มลัด */}
        {activeTab === 'shortcuts' && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="flex-1 p-4 space-y-2">
              <p className="text-xs text-gray-500 mb-3">
                กำหนดปุ่ม <kbd className="font-mono bg-gray-100 border border-gray-300 rounded px-1">1</kbd>–<kbd className="font-mono bg-gray-100 border border-gray-300 rounded px-1">9</kbd> ให้หมวดหมู่ที่ต้องการ
                · ปล่อยว่างเพื่อไม่ผูกปุ่มนั้น · แต่ละหมวดหมู่ใช้ได้แค่ 1 ปุ่ม
              </p>
              {Array.from({ length: 9 }, (_, i) => String(i + 1)).map(key => {
                const bound   = localBindings[key] || ''
                const conflict = bound ? getConflict(key, bound) : null
                return (
                  <div key={key} className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-3 py-2.5">
                    {/* Key badge */}
                    <kbd className="shrink-0 w-8 h-8 flex items-center justify-center font-mono font-bold text-sm bg-gray-800 text-white rounded-lg shadow-sm">
                      {key}
                    </kbd>
                    {/* Category selector */}
                    <select
                      value={bound}
                      onChange={e => handleBindingChange(key, e.target.value)}
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                    >
                      <option value="">— ไม่ผูกปุ่มนี้ —</option>
                      {items.filter(c => c.name !== 'Uncategorized').map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                    {/* Color dot */}
                    {bound && (() => {
                      const cat = items.find(c => c.name === bound)
                      return cat ? (
                        <span className="shrink-0 w-4 h-4 rounded-full border border-white shadow"
                          style={{ backgroundColor: cat.color }} />
                      ) : null
                    })()}
                    {/* Conflict warning */}
                    {conflict && (
                      <span className="text-xs text-amber-600 shrink-0" title={`หมวดหมู่นี้ถูกผูกกับปุ่ม ${conflict} แล้ว`}>
                        ⚠️ ซ้ำ {conflict}
                      </span>
                    )}
                    {/* Clear button */}
                    {bound && (
                      <button onClick={() => handleBindingChange(key, '')}
                        className="shrink-0 text-gray-300 hover:text-red-400 transition-colors text-sm" title="ล้าง">✕</button>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Footer actions */}
            <div className="border-t border-gray-200 bg-white px-4 py-3 flex items-center gap-2">
              <button onClick={handleSaveBindings}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                💾 บันทึกปุ่มลัด
              </button>
              <button onClick={handleClearBindings}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-lg transition-colors">
                ล้างทั้งหมด
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
