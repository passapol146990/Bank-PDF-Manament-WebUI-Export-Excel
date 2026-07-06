import React, { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import {
  getSessions,
  deleteSession,
  getTransactions,
  getCategories,
  uploadFile,
  reimportFile,
  exportExcel,
} from './api'
import DashboardSummary from './components/DashboardSummary'
import StatementGrid from './components/StatementGrid'
import SessionList from './components/SessionList'
import CategoryRemapPage from './components/CategoryRemapPage'

const BANKS = [
  { value: 'ktb', label: 'KTB ธนาคารกรุงไทย',     icon: '🏦', desc: 'ใบแจ้งรายการบัญชีเงินฝากสะสมทรัพย์' },
  { value: 'ttb', label: 'TTB ทีทีบี (TMB+Thanachart)', icon: '🏦', desc: 'Statement แบบ NT/TR/CA' },
]

function BankSelectModal({ filename, onConfirm, onCancel }) {
  const [bank, setBank] = useState('ktb')
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-gray-900 px-6 py-4">
          <h2 className="text-white font-bold text-base">📄 เลือกรูปแบบธนาคาร</h2>
          <p className="text-gray-400 text-xs mt-0.5 truncate">{filename}</p>
        </div>
        <div className="p-5 space-y-3">
          {BANKS.map(b => (
            <label key={b.value}
              className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${bank === b.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <input type="radio" name="bank" value={b.value} checked={bank === b.value}
                onChange={() => setBank(b.value)} className="mt-0.5 accent-blue-500"/>
              <div>
                <p className={`text-sm font-semibold ${bank === b.value ? 'text-blue-700' : 'text-gray-800'}`}>
                  {b.icon} {b.label}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{b.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onCancel}
            className="flex-1 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            ยกเลิก
          </button>
          <button onClick={() => onConfirm(bank)}
            className="flex-1 py-2 text-sm rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors">
            📤 อัพโหลด
          </button>
        </div>
      </div>
    </div>
  )
}

function ReimportModal({ filename, sessionId, count, onReimport, onKeepOld, onCancel }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="bg-amber-600 px-6 py-4">
          <h2 className="text-white font-bold text-base">⚠️ ไฟล์นี้เคยนำเข้าแล้ว</h2>
          <p className="text-amber-100 text-xs mt-0.5 truncate">{filename}</p>
        </div>
        <div className="p-5 space-y-3 text-sm text-gray-700">
          <p>Session #{sessionId} มีข้อมูลอยู่ <strong>{count} รายการ</strong></p>
          <p>ต้องการทำอะไร?</p>
          <div className="space-y-2 pt-1">
            <button onClick={onReimport}
              className="w-full text-left p-3 rounded-xl border-2 border-blue-500 bg-blue-50 hover:bg-blue-100 transition-colors">
              <p className="font-semibold text-blue-700">🔄 อัพเดตข้อมูลใหม่ (แนะนำ)</p>
              <p className="text-xs text-blue-500 mt-0.5">ลบรายการเดิมแล้ว import ใหม่ — <strong>คง category ที่จัดไว้แล้ว</strong></p>
            </button>
            <button onClick={onKeepOld}
              className="w-full text-left p-3 rounded-xl border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors">
              <p className="font-semibold text-gray-700">📂 โหลด session เดิม</p>
              <p className="text-xs text-gray-400 mt-0.5">ไม่เปลี่ยนแปลงข้อมูลใด ๆ</p>
            </button>
          </div>
        </div>
        <div className="px-5 pb-5">
          <button onClick={onCancel}
            className="w-full py-2 text-sm rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50">
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [checkedSessionIds, setCheckedSessionIds] = useState(() => {
    try {
      const saved = localStorage.getItem('checkedSessionIds')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [showRemap, setShowRemap] = useState(false)
  const [selectedBank, setSelectedBank] = useState('ktb')
  const [pendingFile, setPendingFile] = useState(null)       // { file, bank }
  const [reimportPrompt, setReimportPrompt] = useState(null) // { file, bank, sessionId, count }
  const fileInputRef = useRef(null)

  // บันทึก checkedSessionIds ลง localStorage
  useEffect(() => {
    localStorage.setItem('checkedSessionIds', JSON.stringify([...checkedSessionIds]))
  }, [checkedSessionIds])

  const loadSessions = useCallback(async () => {
    try {
      const res = await getSessions()
      setSessions(res.data)
      if (res.data.length > 0 && !activeSessionId) {
        setActiveSessionId(res.data[0].id)
      }
    } catch {}
  }, [activeSessionId])

  const loadTransactions = useCallback(async (sessionIds) => {
    if (!sessionIds || sessionIds.length === 0) { setTransactions([]); return }
    setLoading(true)
    try {
      const res = await getTransactions(null, sessionIds)
      setTransactions(res.data)
    } catch { toast.error('โหลดข้อมูลไม่สำเร็จ') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        const [catRes, sessRes] = await Promise.all([getCategories(), getSessions()])
        setCategories(catRes.data)
        const sessionList = sessRes.data
        setSessions(sessionList)
        if (sessionList.length > 0) {
          const firstId = sessionList[0].id
          setActiveSessionId(firstId)
          // ใช้ค่าจาก localStorage ถ้ามี และ filter เฉพาะ session ที่ยังมีอยู่จริง
          const validIds = new Set(sessionList.map(s => s.id))
          const saved = checkedSessionIds.size > 0
            ? new Set([...checkedSessionIds].filter(id => validIds.has(id)))
            : new Set(sessionList.map(s => s.id))
          setCheckedSessionIds(saved)
          const txRes = await getTransactions(null, [...saved])
          setTransactions(txRes.data)
        }
      } catch {
        toast.error('ไม่สามารถเชื่อมต่อ server ได้ — ตรวจสอบว่า backend ทำงานอยู่')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const handleSelectSession = useCallback(async (sessionId) => {
    setActiveSessionId(sessionId)
  }, [])

  const handleToggleCheck = useCallback(async (sessionId) => {
    setCheckedSessionIds(prev => {
      const next = new Set(prev)
      next.has(sessionId) ? next.delete(sessionId) : next.add(sessionId)
      return next
    })
  }, [])

  const handleToggleAll = useCallback((ids) => {
    setCheckedSessionIds(new Set(ids))
  }, [])

  // โหลด transactions ใหม่เมื่อ checkedSessionIds เปลี่ยน
  useEffect(() => {
    if (checkedSessionIds.size > 0) {
      loadTransactions([...checkedSessionIds])
    } else {
      setTransactions([])
    }
  }, [checkedSessionIds, loadTransactions])

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const isPdf = file.name.toLowerCase().endsWith('.pdf')
    if (isPdf) {
      setPendingFile(file)
      return
    }
    await doUpload(file, 'ktb')
  }

  const doUpload = async (file, bank) => {
    const isPdf = file.name.toLowerCase().endsWith('.pdf')
    const isJson = file.name.toLowerCase().endsWith('.json')
    setUploading(true)
    setUploadProgress(
      isPdf ? 'กำลังอ่าน PDF และแยกข้อมูลรายการ...' :
      isJson ? `กำลังประมวลผล JSON: ${file.name}...` :
      `กำลังอัพโหลด ${file.name}...`
    )
    const tid = toast.loading(
      isPdf  ? `📄 กำลังอ่าน PDF: ${file.name}` :
      isJson ? `📋 กำลังอ่าน JSON: ${file.name}` :
               `📊 กำลังอัพโหลด: ${file.name}`,
      { duration: Infinity }
    )
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await uploadFile(formData, bank)
      const data = res.data

      if (data.is_duplicate && data.can_reimport) {
        toast.dismiss(tid)
        setUploading(false)
        setUploadProgress(null)
        setReimportPrompt({ file, bank, sessionId: data.session_id, count: data.count, filename: data.filename || file.name })
        return
      }

      if (data.is_duplicate) {
        toast.success('ไฟล์นี้เคยนำเข้าแล้ว — โหลด session เดิม', { id: tid })
      } else {
        toast.success(data.message, { id: tid })
      }
      await _afterUpload(data)
    } catch (err) {
      const msg = err.response?.data?.detail || 'นำเข้าไม่สำเร็จ'
      toast.error(msg, { id: tid })
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }

  const doReimport = async (file, bank) => {
    setUploading(true)
    setUploadProgress('กำลัง Re-import และคืนค่า category...')
    const tid = toast.loading(`🔄 กำลัง Re-import: ${file.name}`, { duration: Infinity })
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await reimportFile(formData, bank)
      const data = res.data
      toast.success(data.message, { id: tid })
      await _afterUpload(data)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Re-import ไม่สำเร็จ'
      toast.error(msg, { id: tid })
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }

  const _afterUpload = async (data) => {
    const sessRes = await getSessions()
    setSessions(sessRes.data)
    if (data.session_id) {
      setActiveSessionId(data.session_id)
      setCheckedSessionIds(prev => new Set([...prev, data.session_id]))
    }
  }

  const handleExport = async () => {
    const ids = [...checkedSessionIds]
    if (ids.length === 0) { toast.error('เลือกไฟล์ก่อน Export'); return }
    setExporting(true)
    const tid = toast.loading(`กำลัง Export Excel (${ids.length} ไฟล์)...`)
    try {
      const res = await exportExcel(null, ids)
      const url = URL.createObjectURL(res.data)
      const baseName = ids.length === 1
        ? (sessions.find(s => s.id === ids[0])?.filename.replace(/\.[^.]+$/,'') || 'bank_statement')
        : `combined_${ids.length}_files`
      const a = document.createElement('a')
      a.href = url; a.download = `${baseName}_categorized.xlsx`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Export สำเร็จ!', { id: tid })
    } catch {
      toast.error('Export ไม่สำเร็จ', { id: tid })
    } finally { setExporting(false) }
  }

  const handleDeleteSession = async (sessionId) => {
    const session = sessions.find(s => s.id === sessionId)
    if (!window.confirm(`ลบ "${session?.filename}" และข้อมูลทั้งหมด?\nไม่สามารถยกเลิกได้`)) return
    try {
      await deleteSession(sessionId)
      const remaining = sessions.filter(s => s.id !== sessionId)
      setSessions(remaining)
      setCheckedSessionIds(prev => { const n = new Set(prev); n.delete(sessionId); return n })
      if (activeSessionId === sessionId) setActiveSessionId(remaining[0]?.id || null)
      toast.success('ลบ session แล้ว')
    } catch { toast.error('ลบไม่สำเร็จ') }
  }

  const handleTransactionsUpdate = useCallback((updater) => {
    setTransactions(updater)
    getSessions().then(r => setSessions(r.data)).catch(() => {})
  }, [])

  const activeSession = sessions.find(s => s.id === activeSessionId)
  const checkedCount = checkedSessionIds.size

  return (
    <div className="min-h-screen bg-gray-50">
      {pendingFile && (
        <BankSelectModal
          filename={pendingFile.name}
          onConfirm={async (bank) => {
            const file = pendingFile
            setPendingFile(null)
            await doUpload(file, bank)
          }}
          onCancel={() => setPendingFile(null)}
        />
      )}
      {reimportPrompt && (
        <ReimportModal
          filename={reimportPrompt.filename}
          sessionId={reimportPrompt.sessionId}
          count={reimportPrompt.count}
          onReimport={async () => {
            const { file, bank } = reimportPrompt
            setReimportPrompt(null)
            await doReimport(file, bank)
          }}
          onKeepOld={() => {
            const { sessionId } = reimportPrompt
            setReimportPrompt(null)
            setActiveSessionId(sessionId)
            setCheckedSessionIds(prev => new Set([...prev, sessionId]))
            toast.success('โหลด session เดิมแล้ว')
          }}
          onCancel={() => setReimportPrompt(null)}
        />
      )}
      {showRemap && (
        <CategoryRemapPage
          onClose={() => setShowRemap(false)}
          onRemapped={async () => {
            // reload transactions + categories หลัง remap
            const [catRes] = await Promise.all([getCategories()])
            setCategories(catRes.data)
            if (activeSessionId) await loadTransactions(activeSessionId)
          }}
        />
      )}
      {/* Header */}
      <header className="bg-gray-900 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="bg-blue-600 rounded-xl p-2 text-xl shrink-0">🏦</div>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight">Bank Statement Categorization</h1>
              {activeSession ? (
                <p className="text-xs text-gray-400 truncate">
                  📄 {activeSession.filename}
                  {activeSession.account_number && ` · ${activeSession.account_number}`}
                  {activeSession.period_start && ` · ${activeSession.period_start} – ${activeSession.period_end}`}
                </p>
              ) : (
                <p className="text-xs text-gray-400">อัพโหลด PDF Bank Statement เพื่อเริ่มต้น</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,.json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              {uploading
                ? <><span className="animate-spin inline-block">⟳</span> กำลังประมวลผล...</>
                : <><span>📤</span> อัพโหลด PDF / Excel / JSON</>
              }
            </button>

            {checkedCount > 0 && (
              <button
                onClick={handleExport}
                disabled={exporting || transactions.length === 0}
                className="btn-success flex items-center gap-2 text-sm"
              >
                {exporting ? <><span className="animate-spin">⟳</span> Export...</> : <><span>📥</span> Export Excel {checkedCount > 1 ? `(${checkedCount} ไฟล์)` : ''}</>}
              </button>
            )}

            <button
              onClick={() => setShowRemap(true)}
              title="จัดการ category ที่ไม่ตรงกับระบบ"
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
            >
              🔄 Remap หมวดหมู่
            </button>
          </div>
        </div>

        {/* Upload progress bar */}
        {uploading && (
          <div className="bg-blue-900/50 px-6 py-2">
            <div className="flex items-center gap-3 max-w-screen-xl mx-auto">
              <div className="w-full bg-blue-800 rounded-full h-1.5 overflow-hidden">
                <div className="h-1.5 bg-blue-400 rounded-full animate-pulse w-3/4" />
              </div>
              <span className="text-xs text-blue-300 shrink-0 whitespace-nowrap">{uploadProgress}</span>
            </div>
          </div>
        )}
      </header>

      {/* Main */}
      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-5">
        <SessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          checkedIds={checkedSessionIds}
          onToggleCheck={handleToggleCheck}
          onToggleAll={handleToggleAll}
          onSelect={handleSelectSession}
          onDelete={handleDeleteSession}
        />

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center space-y-4">
              <div className="text-5xl animate-pulse">🏦</div>
              <p className="text-gray-500 font-medium">กำลังโหลดข้อมูล...</p>
            </div>
          </div>
        ) : checkedCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-6">
            <div className="text-7xl">📄</div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-gray-700">ยังไม่ได้เลือกไฟล์</h2>
              <p className="text-gray-400 text-sm max-w-md">ติ๊กเลือกไฟล์ที่ต้องการจากรายการด้านบน หรืออัพโหลดไฟล์ใหม่</p>
            </div>
            <button onClick={() => fileInputRef.current?.click()} className="btn-primary text-base px-8 py-3">📤 อัพโหลดไฟล์</button>
          </div>
        ) : (
          <>
            <DashboardSummary transactions={transactions} />
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-gray-800">
                  📋 รายการธนาคาร
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({transactions.length} รายการ)
                  </span>
                </h2>
              </div>
              <StatementGrid
                transactions={transactions}
                categories={categories}
                onTransactionsUpdate={handleTransactionsUpdate}
                onCategoriesUpdate={setCategories}
              />
            </div>
          </>
        )}
      </main>

      <footer className="text-center py-6 text-xs text-gray-400 border-t border-gray-100 mt-8">
        Bank Statement Categorization · FastAPI + React · Single Port
      </footer>
    </div>
  )
}
