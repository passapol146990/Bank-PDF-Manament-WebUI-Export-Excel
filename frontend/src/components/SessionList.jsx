import React from 'react'

function formatDate(s) {
  if (!s) return '-'
  try { return new Date(s).toLocaleString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) }
  catch { return s }
}

function ProgressBar({ value, total }) {
  const pct = total > 0 ? Math.round((value/total)*100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{width:`${pct}%`}}/>
      </div>
      <span className="text-xs text-gray-500 shrink-0">{pct}%</span>
    </div>
  )
}

export default function SessionList({ sessions, activeSessionId, checkedIds, onToggleCheck, onToggleAll, onSelect, onDelete }) {
  if (!sessions || sessions.length === 0) return null
  const allChecked = sessions.length > 0 && sessions.every(s => checkedIds.has(s.id))
  const someChecked = sessions.some(s => checkedIds.has(s.id))

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
        <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = !allChecked && someChecked }}
          onChange={() => onToggleAll(allChecked ? [] : sessions.map(s => s.id))}
          className="w-4 h-4 rounded accent-blue-500 cursor-pointer"/>
        <h2 className="text-sm font-bold text-gray-700 flex-1">📁 ไฟล์ที่นำเข้า ({sessions.length})</h2>
        {someChecked && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            เลือก {sessions.filter(s => checkedIds.has(s.id)).length} ไฟล์
          </span>
        )}
        <span className="text-xs text-gray-400">☑ ติ๊กเพื่อเลือกไฟล์ที่ต้องการแสดงและ Export</span>
      </div>
      <div className="divide-y divide-gray-50">
        {sessions.map(s => {
          const isActive = s.id === activeSessionId
          const isChecked = checkedIds.has(s.id)
          return (
            <div key={s.id}
              className={`flex items-start gap-3 px-4 py-3 transition-colors ${isActive?'bg-blue-50 border-l-4 border-blue-500':'border-l-4 border-transparent'} ${!isChecked?'opacity-50':''}`}>
              {/* Checkbox */}
              <div className="shrink-0 mt-1" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={isChecked} onChange={() => onToggleCheck(s.id)}
                  className="w-4 h-4 rounded accent-blue-500 cursor-pointer"/>
              </div>
              {/* Clickable area → switch active session */}
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(s.id)}>
                <div className="flex items-center gap-2">
                  <span className="text-xl shrink-0">{s.filename.endsWith('.pdf')?'📄':s.filename.endsWith('.json')?'📋':'📊'}</span>
                  <p className="text-sm font-medium text-gray-800 truncate" title={s.filename}>{s.filename}</p>
                  {isActive && <span className="shrink-0 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">กำลังดู</span>}
                  {!isChecked && <span className="shrink-0 text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">ซ่อน</span>}
                </div>
                {(s.account_name || s.account_number) && (
                  <p className="text-xs text-gray-500 mt-0.5 ml-7">
                    {s.account_name}{s.account_name && s.account_number && ' · '}{s.account_number && <span className="font-mono">{s.account_number}</span>}
                  </p>
                )}
                {(s.period_start || s.period_end) && <p className="text-xs text-gray-400 mt-0.5 ml-7">{s.period_start} – {s.period_end}</p>}
                <div className="mt-1.5 ml-7"><ProgressBar value={s.categorized_rows} total={s.total_rows}/></div>
                <p className="text-xs text-gray-400 mt-1 ml-7">{s.categorized_rows}/{s.total_rows} รายการ · {formatDate(s.created_at)}</p>
              </div>
              {/* Delete */}
              <button onClick={e=>{e.stopPropagation();onDelete(s.id)}}
                className="shrink-0 text-gray-300 hover:text-red-500 transition-colors p-1 rounded" title="ลบ">🗑️</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
