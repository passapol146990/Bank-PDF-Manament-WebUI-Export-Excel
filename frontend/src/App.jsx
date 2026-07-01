import React, { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import {
  getSessions,
  deleteSession,
  getTransactions,
  getCategories,
  uploadFile,
  exportExcel,
} from './api'
import DashboardSummary from './components/DashboardSummary'
import StatementGrid from './components/StatementGrid'
import SessionList from './components/SessionList'

export default function App() {
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null) // message string
  const fileInputRef = useRef(null)

  // ─── Load sessions list ───────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    try {
      const res = await getSessions()
      setSessions(res.data)
      // Auto-select the most recent session if none active
      if (res.data.length > 0 && !activeSessionId) {
        setActiveSessionId(res.data[0].id)
      }
    } catch {
      // Backend not ready yet — silent fail
    }
  }, [activeSessionId])

  // ─── Load transactions for active session ────────────────────────────────
  const loadTransactions = useCallback(async (sessionId) => {
    if (!sessionId) {
      setTransactions([])
      return
    }
    setLoading(true)
    try {
      const res = await getTransactions(sessionId)
      setTransactions(res.data)
    } catch {
      toast.error('โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  // ─── Initial load ─────────────────────────────────────────────────────────
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
          const txRes = await getTransactions(firstId)
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

  // ─── Switch session ───────────────────────────────────────────────────────
  const handleSelectSession = useCallback(async (sessionId) => {
    setActiveSessionId(sessionId)
    await loadTransactions(sessionId)
  }, [loadTransactions])

  // ─── Upload ──────────────────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isPdf = file.name.toLowerCase().endsWith('.pdf')
    setUploading(true)
    setUploadProgress(isPdf ? 'กำลังอ่าน PDF และแยกข้อมูลรายการ...' : `กำลังอัพโหลด ${file.name}...`)

    const tid = toast.loading(
      isPdf ? `📄 กำลังอ่าน PDF: ${file.name}` : `📊 กำลังอัพโหลด: ${file.name}`,
      { duration: Infinity }
    )

    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await uploadFile(formData)
      const data = res.data

      if (data.is_duplicate) {
        toast.success(`ไฟล์นี้เคยนำเข้าแล้ว — โหลด session เดิม`, { id: tid })
      } else {
        toast.success(data.message, { id: tid })
      }

      // Refresh sessions and switch to new one
      const sessRes = await getSessions()
      setSessions(sessRes.data)
      if (data.session_id) {
        setActiveSessionId(data.session_id)
        await loadTransactions(data.session_id)
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'นำเข้าไม่สำเร็จ'
      toast.error(msg, { id: tid })
    } finally {
      setUploading(false)
      setUploadProgress(null)
      e.target.value = ''
    }
  }

  // ─── Export ──────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true)
    const tid = toast.loading('กำลัง Export Excel...')
    try {
      const res = await exportExcel(activeSessionId)
      const url = URL.createObjectURL(res.data)
      const activeSession = sessions.find(s => s.id === activeSessionId)
      const baseName = activeSession
        ? activeSession.filename.replace(/\.[^.]+$/, '')
        : 'bank_statement'
      const a = document.createElement('a')
      a.href = url
      a.download = `${baseName}_categorized.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export สำเร็จ!', { id: tid })
    } catch {
      toast.error('Export ไม่สำเร็จ', { id: tid })
    } finally {
      setExporting(false)
    }
  }

  // ─── Delete session ───────────────────────────────────────────────────────
  const handleDeleteSession = async (sessionId) => {
    const session = sessions.find(s => s.id === sessionId)
    if (!window.confirm(`ลบ "${session?.filename}" และข้อมูลทั้งหมด?\nไม่สามารถยกเลิกได้`)) return
    try {
      await deleteSession(sessionId)
      const remaining = sessions.filter(s => s.id !== sessionId)
      setSessions(remaining)
      if (activeSessionId === sessionId) {
        const nextId = remaining[0]?.id || null
        setActiveSessionId(nextId)
        await loadTransactions(nextId)
      }
      toast.success('ลบ session แล้ว')
    } catch {
      toast.error('ลบไม่สำเร็จ')
    }
  }

  // ─── Transactions updated (from grid) ────────────────────────────────────
  const handleTransactionsUpdate = useCallback((updater) => {
    setTransactions(updater)
    // Refresh session list counts in background
    getSessions().then(r => setSessions(r.data)).catch(() => {})
  }, [])

  const activeSession = sessions.find(s => s.id === activeSessionId)

  return (
    <div className="min-h-screen bg-gray-50">
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
              accept=".pdf,.xlsx,.xls,.csv"
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
                : <><span>📤</span> อัพโหลด PDF / Excel</>
              }
            </button>

            {activeSessionId && (
              <button
                onClick={handleExport}
                disabled={exporting || transactions.length === 0}
                className="btn-success flex items-center gap-2 text-sm"
              >
                {exporting ? <><span className="animate-spin">⟳</span> Export...</> : <><span>📥</span> Export Excel</>}
              </button>
            )}
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
        {/* Session list (resume work) */}
        <SessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
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
        ) : !activeSessionId ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-32 space-y-6">
            <div className="text-7xl">📄</div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-gray-700">เริ่มต้นด้วยการอัพโหลด PDF</h2>
              <p className="text-gray-400 text-sm max-w-md">
                รองรับ PDF Bank Statement จากธนาคารกรุงไทย (KTB) และ Excel/CSV
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary text-base px-8 py-3"
            >
              📤 อัพโหลดไฟล์
            </button>
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
