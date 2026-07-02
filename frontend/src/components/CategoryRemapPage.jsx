import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { getDistinctCategories, remapCategory, getCategories } from '../api'

/**
 * CategoryRemapPage — หน้าจัดการ category ที่อยู่ใน transactions จริง
 * ใช้สำหรับกรณีเปลี่ยนชื่อ category แล้ว transaction ยังเก็บชื่อเก่าอยู่
 */
export default function CategoryRemapPage({ onClose, onRemapped }) {
  const [txCategories, setTxCategories]   = useState([])   // category ที่มีใน tx จริง
  const [sysCategories, setSysCategories] = useState([])   // category ที่ตั้งไว้ในระบบ
  const [remaps, setRemaps]               = useState({})   // { oldName: newName }
  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [txRes, sysRes] = await Promise.all([getDistinctCategories(), getCategories()])
      const txCats  = txRes.data   // [{category, count}]
      const sysCats = sysRes.data  // [{id, name, color, ...}]
      setTxCategories(txCats)
      setSysCategories(sysCats)

      // pre-fill: ถ้าชื่อตรงกันอยู่แล้ว ให้ map ตัวเอง
      const init = {}
      txCats.forEach(({ category }) => {
        const match = sysCats.find(s => s.name === category)
        init[category] = match ? category : ''
      })
      setRemaps(init)
    } catch {
      toast.error('โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // หา category ที่ยังไม่ match (ชื่อใน tx ไม่มีในระบบ)
  const sysNames = sysCategories.map(c => c.name)
  const unmatchedRows = txCategories.filter(({ category }) => !sysNames.includes(category))
  const matchedRows   = txCategories.filter(({ category }) =>  sysNames.includes(category))

  const handleRemapChange = (oldName, newName) => {
    setRemaps(prev => ({ ...prev, [oldName]: newName }))
  }

  const handleSave = async () => {
    // เฉพาะ row ที่ต้องการ remap (oldName ≠ newName และ newName ไม่ว่าง)
    const toRemap = Object.entries(remaps).filter(
      ([oldName, newName]) => newName && newName !== oldName
    )
    if (!toRemap.length) {
      toast('ไม่มีรายการที่ต้องเปลี่ยน', { icon: 'ℹ️', duration: 3000 })
      return
    }
    setSaving(true)
    const tid = toast.loading(`กำลังอัปเดต ${toRemap.length} หมวดหมู่...`)
    let successCount = 0
    let failCount    = 0
    for (const [oldName, newName] of toRemap) {
      try {
        const res = await remapCategory(oldName, newName)
        successCount += res.data.updated_count
      } catch {
        failCount++
        toast.error(`เปลี่ยน "${oldName}" ไม่สำเร็จ`, { duration: 5000 })
      }
    }
    toast.success(
      `อัปเดต ${successCount} รายการสำเร็จ${failCount ? ` (ล้มเหลว ${failCount} หมวด)` : ''}`,
      { id: tid, duration: 5000 }
    )
    setSaving(false)
    onRemapped?.()   // แจ้ง parent ให้ reload transactions
    await load()     // reload ข้อมูลใหม่
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-800">🔄 จัดการหมวดหมู่ใน Transaction</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              แก้ไข transaction ที่ยังเก็บชื่อหมวดหมู่เก่าอยู่ให้ตรงกับชื่อปัจจุบัน
            </p>
          </div>
          <button onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-xl text-gray-400 hover:text-gray-600 transition-colors">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="text-gray-400 animate-pulse text-sm">กำลังโหลด...</span>
            </div>
          ) : (
            <>
              {/* ─── ส่วนที่ต้องแก้ไข ─────────────────────────────────── */}
              {unmatchedRows.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                    <h3 className="text-sm font-semibold text-gray-700">
                      ชื่อไม่ตรงกับระบบ
                      <span className="ml-2 text-xs font-normal text-red-500">({unmatchedRows.length} หมวด)</span>
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {unmatchedRows.map(({ category, count }) => (
                      <RemapRow key={category}
                        oldName={category} count={count}
                        sysCategories={sysCategories}
                        value={remaps[category] || ''}
                        onChange={v => handleRemapChange(category, v)}
                        status="unmatched"
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* ─── ส่วนที่ OK แล้ว ──────────────────────────────────── */}
              {matchedRows.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                    <h3 className="text-sm font-semibold text-gray-700">
                      ตรงกับระบบแล้ว
                      <span className="ml-2 text-xs font-normal text-green-600">({matchedRows.length} หมวด)</span>
                    </h3>
                    <span className="text-xs text-gray-400 ml-1">· สามารถ remap ใหม่ได้ถ้าต้องการ</span>
                  </div>
                  <div className="space-y-2">
                    {matchedRows.map(({ category, count }) => (
                      <RemapRow key={category}
                        oldName={category} count={count}
                        sysCategories={sysCategories}
                        value={remaps[category] || category}
                        onChange={v => handleRemapChange(category, v)}
                        status="matched"
                      />
                    ))}
                  </div>
                </section>
              )}

              {txCategories.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-12">ยังไม่มี transaction ในระบบ</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-400">
            * การ remap จะอัปเดต category ใน transaction ทั้งหมดที่ใช้ชื่อเก่า
          </p>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-colors">
              ปิด
            </button>
            <button onClick={handleSave} disabled={saving || loading}
              className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors flex items-center gap-2">
              {saving ? <><span className="animate-spin">⟳</span> กำลังบันทึก...</> : '💾 บันทึกการเปลี่ยนแปลง'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Row component ────────────────────────────────────────────────────────────
function RemapRow({ oldName, count, sysCategories, value, onChange, status }) {
  const isChanged = value && value !== oldName
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors
      ${status === 'unmatched' ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>

      {/* Old name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium truncate ${status === 'unmatched' ? 'text-red-700' : 'text-gray-700'}`}>
            {oldName}
          </span>
          <span className="text-xs text-gray-400 shrink-0 bg-gray-100 rounded px-1.5 py-0.5">
            {count} รายการ
          </span>
        </div>
      </div>

      {/* Arrow */}
      <span className="text-gray-300 shrink-0">→</span>

      {/* Target dropdown */}
      <div className="flex items-center gap-2 shrink-0">
        <select value={value} onChange={e => onChange(e.target.value)}
          className={`text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 min-w-[180px]
            ${isChanged ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700'}`}>
          <option value="">— ไม่เปลี่ยน —</option>
          {sysCategories.map(c => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>

        {/* Status indicator */}
        {isChanged && (
          <span className="text-blue-500 text-sm shrink-0" title="จะถูก remap">✏️</span>
        )}
        {!isChanged && value === oldName && status === 'matched' && (
          <span className="text-green-500 text-sm shrink-0" title="ตรงกันแล้ว">✓</span>
        )}
        {status === 'unmatched' && !value && (
          <span className="text-red-400 text-sm shrink-0" title="ยังไม่ได้เลือก">⚠️</span>
        )}
      </div>
    </div>
  )
}
