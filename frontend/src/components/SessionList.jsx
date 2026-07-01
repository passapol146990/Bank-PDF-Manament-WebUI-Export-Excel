import React from 'react'

function formatDate(isoStr) {
  if (!isoStr) return '-'
  try {
    return new Date(isoStr).toLocaleString('th-TH', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return isoStr }
}

function ProgressBar({ value, total }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-1.5 rounded-full bg-blue-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 shrink-0">{pct}%</span>
    </div>
  )
}

export default function SessionList({ sessions, activeSessionId, onSelect, onDelete }) {
  if (!sessions || sessions.length === 0) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700">📁 ไฟล์ที่นำเข้า ({sessions.length})</h2>
        <span className="text-xs text-gray-400">คลิกเพื่อกลับมาทำงานต่อ</span>
      </div>
      <div className="divide-y divide-gray-50">
        {sessions.map((s) => {
          const isActive = s.id === activeSessionId
          return (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                isActive ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50 border-l-4 border-transparent'
              }`}
            >
              {/* Icon */}
              <div className="shrink-0 mt-0.5 text-xl">
                {s.filename.endsWith('.pdf') ? '📄' : '📊'}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-800 truncate" title={s.filename}>
                    {s.filename}
                  </p>
                  {isActive && (
                    <span className="shrink-0 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      กำลังใช้งาน
                    </span>
                  )}
                </div>

                {(s.account_name || s.account_number) && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {s.account_name && <span>{s.account_name}</span>}
                    {s.account_name && s.account_number && <span className="mx-1">·</span>}
                    {s.account_number && <span className="font-mono">{s.account_number}</span>}
                  </p>
                )}

                {(s.period_start || s.period_end) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s.period_start} – {s.period_end}
                  </p>
                )}

                <div className="mt-1.5">
                  <ProgressBar value={s.categorized_rows} total={s.total_rows} />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {s.categorized_rows} / {s.total_rows} รายการ · {formatDate(s.created_at)}
                </p>
              </div>

              {/* Delete */}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(s.id) }}
                className="shrink-0 text-gray-300 hover:text-red-500 transition-colors p-1 rounded"
                title="ลบ session นี้"
              >
                🗑️
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
