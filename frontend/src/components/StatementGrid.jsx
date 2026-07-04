import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { updateTransaction, bulkUpdateTransactions } from '../api'
import CategoryManager from './CategoryManager'

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return { r: parseInt(h.substring(0,2),16), g: parseInt(h.substring(2,4),16), b: parseInt(h.substring(4,6),16) }
}
function getRowStyle(hex) {
  if (!hex || hex === '#6B7280') return {}
  const { r, g, b } = hexToRgb(hex)
  return { backgroundColor: `rgba(${r},${g},${b},0.08)` }
}
function getBadgeStyle(hex) {
  if (!hex || hex === '#6B7280') return {}
  const { r, g, b } = hexToRgb(hex)
  const c = v => Math.max(0, Math.min(255, v - 60))
  return { backgroundColor: `rgba(${r},${g},${b},0.15)`, color: `rgb(${c(r)},${c(g)},${c(b)})`, borderColor: `rgba(${r},${g},${b},0.4)` }
}
function parseDateSortKey(s) {
  if (!s) return ''
  const p = s.trim().split('/')
  if (p.length === 3) { let [d,m,y] = p; if (y.length===2) y='20'+y; return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}` }
  return s
}
function fmt(val) {
  if (val==null||val==='') return '-'
  return Number(val).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})
}

const PAGE_SIZE_OPTIONS = [25,50,100]
const UNDO_LIMIT = 50

async function retryFn(fn, max=3, delay=500) {
  let err
  for (let i=1; i<=max; i++) {
    try { return await fn() } catch(e) { err=e; if(i<max) await new Promise(r=>setTimeout(r,delay*i)) }
  }
  throw err
}

function FlowEditCell({ tx, onSave }) {
  const amount = tx.withdrawal ?? tx.deposit ?? null
  const isOut = tx.withdrawal != null
  const [editing, setEditing] = useState(false)
  const [flow, setFlow] = useState(isOut ? 'out' : 'in')
  const [val, setVal] = useState(amount!=null ? String(amount) : '')
  const ref = useRef(null)
  useEffect(() => { setFlow(tx.withdrawal!=null?'out':'in'); const a=tx.withdrawal??tx.deposit??null; setVal(a!=null?String(a):'') }, [tx.withdrawal,tx.deposit])
  const open = e => { e.stopPropagation(); setEditing(true); setTimeout(()=>ref.current?.select(),50) }
  const save = e => {
    e?.stopPropagation()
    const n = parseFloat(String(val).replace(/,/g,''))
    if (isNaN(n)||n<0) { toast.error('ยอดเงินไม่ถูกต้อง'); return }
    onSave(tx.id, flow, n); setEditing(false)
  }
  if (!editing) return (
    <div className="flex items-center justify-between gap-1 group">
      <div className="flex gap-1 items-center min-w-0">
        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${isOut?'bg-red-50 text-red-600 border-red-200':'bg-green-50 text-green-600 border-green-200'}`}>
          {isOut?'↑ออก':'↓เข้า'}
        </span>
        <span className={`font-mono font-semibold tabular-nums text-xs ${isOut?'text-red-500':'text-green-600'}`}>
          {amount!=null ? fmt(amount) : <span className="text-gray-300">-</span>}
        </span>
      </div>
      <button onClick={open} onMouseDown={e=>e.stopPropagation()}
        className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all text-xs" title="แก้ไข">✏️</button>
    </div>
  )
  return (
    <div className="flex flex-col gap-1.5 bg-white border border-blue-300 rounded-lg shadow-lg p-2 z-50 min-w-[160px]" onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
      <div className="flex rounded-md overflow-hidden border border-gray-200 text-xs font-semibold">
        <button onClick={()=>setFlow('out')} className={`flex-1 py-1 transition-colors ${flow==='out'?'bg-red-500 text-white':'bg-white text-gray-500 hover:bg-red-50'}`}>↑ เงินออก</button>
        <button onClick={()=>setFlow('in')} className={`flex-1 py-1 transition-colors ${flow==='in'?'bg-green-500 text-white':'bg-white text-gray-500 hover:bg-green-50'}`}>↓ เงินเข้า</button>
      </div>
      <input ref={ref} type="number" min="0" step="0.01" value={val} onChange={e=>setVal(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter')save(e);if(e.key==='Escape'){setEditing(false);e.stopPropagation()}}}
        placeholder="ยอดเงิน" className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300 text-right font-mono"/>
      <div className="flex gap-1">
        <button onClick={save} className="flex-1 text-xs py-1 bg-blue-600 hover:bg-blue-500 text-white rounded font-semibold">✓ บันทึก</button>
        <button onClick={e=>{e.stopPropagation();setEditing(false)}} className="flex-1 text-xs py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded">ยกเลิก</button>
      </div>
    </div>
  )
}

function PaginationBar({ page, totalPages, pageSize, totalItems, onPage, onPageSize, onJumpUncategorized }) {
  const [jumpVal, setJumpVal] = useState('')
  const handleJump = e => { e.preventDefault(); const n=parseInt(jumpVal,10); if(n>=1&&n<=totalPages){onPage(n);setJumpVal('')} }
  const pages = useMemo(() => {
    const arr=[]
    for(let i=1;i<=totalPages;i++){
      if(i===1||i===totalPages||(i>=page-2&&i<=page+2)) arr.push(i)
      else if(arr[arr.length-1]!=='…') arr.push('…')
    }
    return arr
  },[page,totalPages])
  const start=Math.min((page-1)*pageSize+1,totalItems), end=Math.min(page*pageSize,totalItems)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50 select-none">
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500">{start}–{end} จาก {totalItems}</span>
        <select value={pageSize} onChange={e=>{onPageSize(Number(e.target.value));onPage(1)}} className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none">
          {PAGE_SIZE_OPTIONS.map(s=><option key={s} value={s}>{s}/หน้า</option>)}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={()=>onPage(1)} disabled={page===1} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">«</button>
        <button onClick={()=>onPage(page-1)} disabled={page===1} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">‹</button>
        {pages.map((p,i)=>p==='…'?<span key={`d${i}`} className="px-1 text-gray-400 text-xs">…</span>
          :<button key={p} onClick={()=>onPage(p)} className={`min-w-[28px] py-1 text-xs rounded border transition-colors ${p===page?'bg-blue-600 text-white border-blue-600 font-semibold':'border-gray-200 hover:bg-gray-100'}`}>{p}</button>)}
        <button onClick={()=>onPage(page+1)} disabled={page===totalPages} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">›</button>
        <button onClick={()=>onPage(totalPages)} disabled={page===totalPages} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">»</button>
      </div>
      <div className="flex items-center gap-2">
        <form onSubmit={handleJump} className="flex items-center gap-1">
          <span className="text-xs text-gray-400">ไปหน้า</span>
          <input type="number" min={1} max={totalPages} value={jumpVal} onChange={e=>setJumpVal(e.target.value)}
            placeholder={String(page)} className="w-14 text-xs border border-gray-200 rounded px-2 py-1 text-center focus:outline-none"/>
          <button type="submit" className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded">ไป</button>
        </form>
        <button onClick={onJumpUncategorized} className="text-xs px-3 py-1.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300 rounded-lg font-medium transition-colors whitespace-nowrap">⏭ ข้ามไปที่ยังไม่จัด</button>
      </div>
    </div>
  )
}

function ShortcutLegend({ shortcutMap, categoryColorMap }) {
  const entries = Object.entries(shortcutMap).sort(([a],[b])=>a.localeCompare(b))
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
      {entries.map(([key,cat])=>{
        const hex=categoryColorMap[cat]; const {r,g,b}=hex?hexToRgb(hex):{r:107,g:114,b:128}
        return <span key={key} className="inline-flex items-center gap-1 text-xs rounded-md px-2 py-0.5 border"
          style={{backgroundColor:`rgba(${r},${g},${b},0.12)`,borderColor:`rgba(${r},${g},${b},0.35)`,color:`rgb(${Math.max(0,r-50)},${Math.max(0,g-50)},${Math.max(0,b-50)})`}}>
          <kbd className="font-mono font-bold">{key}</kbd><span>{cat}</span>
        </span>
      })}
      <span className="text-xs text-gray-400 self-center ml-2">· <kbd className="font-mono bg-gray-200 px-1 rounded text-gray-600">Ctrl+Z</kbd> ย้อน · <kbd className="font-mono bg-gray-200 px-1 rounded text-gray-600">Ctrl+Y</kbd> หน้า</span>
    </div>
  )
}

export default function StatementGrid({ transactions, categories, onTransactionsUpdate, onCategoriesUpdate }) {
  const [selectedIds, setSelectedIds]   = useState(new Set())
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkFlow, setBulkFlow]         = useState('')
  const [savingIds, setSavingIds]       = useState(new Set())
  const [filterCategory, setFilterCategory] = useState('all')
  const [search, setSearch]             = useState('')
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [page, setPage]                 = useState(1)
  const [pageSize, setPageSize]         = useState(50)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [highlightTxId, setHighlightTxId] = useState(null)
  const undoStack = useRef([])
  const redoStack = useRef([])
  const [historySize, setHistorySize]   = useState({ undo:0, redo:0 })
  const syncHistorySize = useCallback(() => setHistorySize({undo:undoStack.current.length,redo:redoStack.current.length}),[])
  const isDragging     = useRef(false)
  const dragSelectMode = useRef(null)
  const saveTimeouts   = useRef({})
  const selectedIdsRef = useRef(selectedIds)
  const hoveredTxIdRef = useRef(null)
  const tableTopRef    = useRef(null)
  useEffect(()=>{ selectedIdsRef.current=selectedIds },[selectedIds])
  useEffect(()=>{
    const onKey=e=>{ if(e.key==='Escape'&&isFullscreen) setIsFullscreen(false) }
    window.addEventListener('keydown',onKey); return()=>window.removeEventListener('keydown',onKey)
  },[isFullscreen])

  const categoryOptions = useMemo(()=>{
    const s=[...categories].sort((a,b)=>(a.sort_order??0)-(b.sort_order??0))
    return ['Uncategorized',...s.map(c=>c.name).filter(n=>n!=='Uncategorized')]
  },[categories])
  const allCategoryOptions = useMemo(()=>{
    const fromTx=[...new Set(transactions.map(t=>t.category).filter(Boolean))]
    return [...categoryOptions,...fromTx.filter(c=>!categoryOptions.includes(c))]
  },[categoryOptions,transactions])
  const [keyBindings, setKeyBindings] = useState(()=>{ try{return JSON.parse(localStorage.getItem('kb_shortcuts')||'{}')}catch{return{}} })
  useEffect(()=>{
    const h=e=>{ if(e.key==='kb_shortcuts') try{setKeyBindings(JSON.parse(e.newValue||'{}'))}catch{} }
    window.addEventListener('storage',h); return()=>window.removeEventListener('storage',h)
  },[])
  const shortcutMap = useMemo(()=>{
    const v={}; Object.entries(keyBindings).forEach(([k,c])=>{ if(c&&categoryOptions.includes(c)) v[k]=c }); return v
  },[keyBindings,categoryOptions])
  const categoryColorMap = useMemo(()=>{ const m={}; categories.forEach(c=>{m[c.name]=c.color}); return m },[categories])

  const filtered = useMemo(()=>{
    let d=[...transactions]
    if(filterCategory!=='all') d=d.filter(t=>t.category===filterCategory)
    if(search.trim()){ const q=search.toLowerCase(); d=d.filter(t=>(t.particulars||'').toLowerCase().includes(q)||(t.date||'').toLowerCase().includes(q)||(t.via||'').toLowerCase().includes(q)) }
    d.sort((a,b)=>{ const da=parseDateSortKey(a.date||''),db_=parseDateSortKey(b.date||''); return da<db_?-1:da>db_?1:a.id-b.id })
    return d
  },[transactions,filterCategory,search])
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize))
  useEffect(()=>setPage(1),[filterCategory,search,pageSize])
  const pageRows=useMemo(()=>filtered.slice((page-1)*pageSize,page*pageSize),[filtered,page,pageSize])
  const scrollToTableTop=useCallback(()=>tableTopRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),[])

  const applyCategory = useCallback((ids, newCat, { skipUndo=false, prevCategoryMap=null }={}) => {
    if (!ids.length) return
    const prevMap = prevCategoryMap ?? Object.fromEntries(transactions.filter(t=>ids.includes(t.id)).map(t=>[t.id,t.category]))
    onTransactionsUpdate(prev=>prev.map(t=>ids.includes(t.id)?{...t,category:newCat,status:'categorized'}:t))
    if (!skipUndo) {
      undoStack.current=[{ids,prevCategories:prevMap,nextCategory:newCat},...undoStack.current].slice(0,UNDO_LIMIT)
      redoStack.current=[]; syncHistorySize()
    }
    ids.forEach(id=>{
      if(saveTimeouts.current[id]) clearTimeout(saveTimeouts.current[id])
      setSavingIds(prev=>new Set([...prev,id]))
      saveTimeouts.current[id]=setTimeout(async()=>{
        try { await retryFn(()=>updateTransaction(id,{category:newCat,status:'categorized'})) }
        catch { toast.error(`บันทึก #${id} ไม่สำเร็จ (ลอง 3 รอบแล้ว)`,{duration:5000}) }
        setSavingIds(prev=>{ const n=new Set(prev); n.delete(id); return n })
      },400)
    })
  },[transactions,onTransactionsUpdate,syncHistorySize])

  const handleUndo = useCallback(()=>{
    if(!undoStack.current.length) return
    const entry=undoStack.current.shift()
    redoStack.current=[entry,...redoStack.current].slice(0,UNDO_LIMIT); syncHistorySize()
    const groups={}
    entry.ids.forEach(id=>{ const p=entry.prevCategories[id]||'Uncategorized'; if(!groups[p])groups[p]=[]; groups[p].push(id) })
    Object.entries(groups).forEach(([c,gids])=>applyCategory(gids,c,{skipUndo:true}))
    toast('↩ ย้อนกลับแล้ว',{icon:'↩',duration:2000})
  },[applyCategory,syncHistorySize])

  const handleRedo = useCallback(()=>{
    if(!redoStack.current.length) return
    const entry=redoStack.current.shift()
    undoStack.current=[entry,...undoStack.current].slice(0,UNDO_LIMIT); syncHistorySize()
    const prevMap=Object.fromEntries(transactions.filter(t=>entry.ids.includes(t.id)).map(t=>[t.id,t.category]))
    applyCategory(entry.ids,entry.nextCategory,{skipUndo:true,prevCategoryMap:prevMap})
    toast('↪ ไปข้างหน้าแล้ว',{icon:'↪',duration:2000})
  },[applyCategory,syncHistorySize,transactions])

  const handleCategoryChange = useCallback((id,cat)=>applyCategory([id],cat),[applyCategory])

  const handleFlowEdit = useCallback(async (id, flow, amount)=>{
    const prev = transactions.find(t=>t.id===id)
    onTransactionsUpdate(p=>p.map(t=>t.id!==id?t:{...t,withdrawal:flow==='out'?amount:null,deposit:flow==='in'?amount:null}))
    try {
      await retryFn(()=>updateTransaction(id,{withdrawal:flow==='out'?amount:null,deposit:flow==='in'?amount:null}))
      toast.success(`${flow==='out'?'↑เงินออก':'↓เงินเข้า'} ${fmt(amount)} ฿`,{duration:2500})
    } catch {
      toast.error('บันทึกไม่สำเร็จ (ลอง 3 รอบแล้ว)',{duration:5000})
      onTransactionsUpdate(p=>p.map(t=>t.id!==id?t:{...t,withdrawal:prev?.withdrawal??null,deposit:prev?.deposit??null}))
    }
  },[transactions,onTransactionsUpdate])

  const handleBulkApply = useCallback(async()=>{
    const ids=[...selectedIds]
    if(ids.length===0) return
    if (bulkFlow) {
      const tid=toast.loading(`กำลังสลับ ${ids.length} รายการ...`)
      const updates=ids.map(id=>{ const t=transactions.find(x=>x.id===id); const a=t?.withdrawal??t?.deposit??0; return {id,withdrawal:bulkFlow==='out'?a:null,deposit:bulkFlow==='in'?a:null} })
      onTransactionsUpdate(prev=>prev.map(t=>{ const u=updates.find(x=>x.id===t.id); return u?{...t,...u}:t }))
      let fail=0
      await Promise.all(updates.map(async u=>{ try{ await retryFn(()=>updateTransaction(u.id,{withdrawal:u.withdrawal,deposit:u.deposit})) }catch{ fail++ } }))
      if(fail) toast.error(`${fail} รายการบันทึกไม่สำเร็จ`,{id:tid,duration:5000})
      else toast.success(`สลับ ${ids.length} รายการ → ${bulkFlow==='out'?'เงินออก':'เงินเข้า'}`,{id:tid,duration:3000})
      setBulkFlow(''); setSelectedIds(new Set()); return
    }
    if (!bulkCategory) { toast.error('เลือกหมวดหมู่หรือประเภทเงินก่อน'); return }
    const tid=toast.loading(`กำลังบันทึก ${ids.length} รายการ...`)
    try {
      await retryFn(()=>bulkUpdateTransactions(ids,bulkCategory))
      applyCategory(ids,bulkCategory)
      toast.success(`อัพเดต ${ids.length} รายการ → ${bulkCategory}`,{id:tid,duration:5000})
      setSelectedIds(new Set()); setBulkCategory('')
    } catch { toast.error('อัพเดตไม่สำเร็จ (ลอง 3 รอบแล้ว)',{id:tid,duration:5000}) }
  },[bulkCategory,bulkFlow,selectedIds,transactions,applyCategory,onTransactionsUpdate])

  useEffect(()=>{
    const onKey=e=>{
      const tag=document.activeElement?.tagName
      if(tag==='INPUT'||tag==='TEXTAREA') return
      if(tag==='SELECT'&&!document.activeElement?.closest('td')) return
      if(e.ctrlKey&&!e.shiftKey&&e.key==='z'){e.preventDefault();handleUndo();return}
      if(e.ctrlKey&&(e.key==='y'||(e.shiftKey&&e.key==='z'))){e.preventDefault();handleRedo();return}
      let digit=null
      if(e.code?.startsWith('Digit')) digit=e.code.replace('Digit','')
      if(e.code?.startsWith('Numpad')) digit=e.code.replace('Numpad','')
      if(!digit||!['1','2','3','4','5','6','7','8','9'].includes(digit)) return
      const cat=shortcutMap[digit]; if(!cat) return
      e.preventDefault()
      let focusedRowId=null
      if(document.activeElement?.tagName==='SELECT'){const tr=document.activeElement.closest('tr[id^="tx-"]');if(tr)focusedRowId=parseInt(tr.id.replace('tx-',''),10);document.activeElement.blur()}
      const targets=selectedIdsRef.current.size>0?[...selectedIdsRef.current]:(hoveredTxIdRef.current??focusedRowId)?[hoveredTxIdRef.current??focusedRowId]:[]
      if(!targets.length) return
      applyCategory(targets,cat)
      toast.success(`${digit}→${cat} (${targets.length>1?targets.length+'รายการ':'#'+targets[0]})`,{duration:2500})
      setSelectedIds(new Set())
    }
    window.addEventListener('keydown',onKey); return()=>window.removeEventListener('keydown',onKey)
  },[shortcutMap,applyCategory,handleUndo,handleRedo])

  const handleJumpUncategorized = useCallback(()=>{
    const after=page*pageSize
    const idx=filtered.findIndex((t,i)=>i>=after&&t.category==='Uncategorized')
    if(idx!==-1){setPage(Math.floor(idx/pageSize)+1);scrollToTableTop();return}
    const from=filtered.findIndex(t=>t.category==='Uncategorized')
    if(from===-1) toast.success('🎉 จัดหมวดหมู่ครบแล้ว!',{duration:5000})
    else{const tp=Math.floor(from/pageSize)+1;setPage(tp);scrollToTableTop();toast(`ข้ามไปหน้า ${tp}`,{icon:'🔄',duration:3000})}
  },[filtered,page,pageSize,scrollToTableTop])

  const allPageSelected=pageRows.length>0&&pageRows.every(t=>selectedIds.has(t.id))
  const toggleSelect=id=>setSelectedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})
  const toggleSelectAll=()=>{
    const ids=pageRows.map(t=>t.id)
    setSelectedIds(prev=>{const n=new Set(prev);if(allPageSelected)ids.forEach(id=>n.delete(id));else ids.forEach(id=>n.add(id));return n})
  }
  const handleRowMouseDown=useCallback((e,id)=>{
    if(e.button===2){e.preventDefault();isDragging.current=true;dragSelectMode.current='deselect';setSelectedIds(prev=>{const n=new Set(prev);n.delete(id);return n});return}
    if(e.button!==0) return
    e.preventDefault();isDragging.current=true
    const already=selectedIdsRef.current.has(id);dragSelectMode.current=already?'deselect':'select'
    setSelectedIds(prev=>{const n=new Set(prev);already?n.delete(id):n.add(id);return n})
  },[])
  const handleRowMouseEnter=useCallback((id)=>{
    hoveredTxIdRef.current=id
    if(!isDragging.current) return
    setSelectedIds(prev=>{const n=new Set(prev);dragSelectMode.current==='select'?n.add(id):n.delete(id);return n})
  },[])
  const handleTableMouseLeave=useCallback(()=>{hoveredTxIdRef.current=null},[])
  const handleContextMenu=useCallback(e=>e.preventDefault(),[])
  useEffect(()=>{const stop=()=>{isDragging.current=false};window.addEventListener('mouseup',stop);return()=>window.removeEventListener('mouseup',stop)},[])
  const handleCategoriesUpdate=useCallback(u=>onCategoriesUpdate(u),[onCategoriesUpdate])

  return (
    <>
      {showCategoryManager && (
        <CategoryManager categories={categories} onCategoriesUpdate={handleCategoriesUpdate}
          keyBindings={keyBindings} onKeyBindingsChange={kb=>{setKeyBindings(kb);localStorage.setItem('kb_shortcuts',JSON.stringify(kb))}}
          onClose={()=>setShowCategoryManager(false)}/>
      )}

      {/* Floating bulk-action bar */}
      <div className={`fixed bottom-6 right-6 z-40 transition-all duration-300 ease-out ${selectedIds.size>0?'translate-y-0 opacity-100 pointer-events-auto':'translate-y-6 opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-2 bg-gray-900 text-white rounded-2xl shadow-2xl px-4 py-3 border border-gray-700 flex-wrap max-w-2xl">
          <div className="flex items-center gap-1.5 pr-3 border-r border-gray-700 shrink-0">
            <span className="bg-blue-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">{selectedIds.size}</span>
            <span className="text-xs text-gray-300 whitespace-nowrap">รายการ</span>
          </div>
          {/* หมวดหมู่ */}
          <select value={bulkCategory} onChange={e=>{setBulkCategory(e.target.value);setBulkFlow('')}}
            className="text-sm bg-gray-800 border border-gray-600 text-white rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[150px] cursor-pointer">
            <option value="">-- หมวดหมู่ --</option>
            {categoryOptions.filter(c=>c!=='Uncategorized').map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          {/* ปุ่มด่วนสลับเงินออก/เข้า */}
          <div className="flex rounded-xl overflow-hidden border border-gray-600 text-xs font-semibold shrink-0">
            <button onClick={()=>{setBulkFlow('out');setBulkCategory('')}}
              className={`px-3 py-1.5 transition-colors ${bulkFlow==='out'?'bg-red-500 text-white':'bg-gray-800 text-gray-300 hover:bg-red-900'}`}>↑ออก</button>
            <button onClick={()=>{setBulkFlow('in');setBulkCategory('')}}
              className={`px-3 py-1.5 transition-colors border-l border-gray-600 ${bulkFlow==='in'?'bg-green-500 text-white':'bg-gray-800 text-gray-300 hover:bg-green-900'}`}>↓เข้า</button>
          </div>
          <button onClick={handleBulkApply} disabled={!bulkCategory&&!bulkFlow}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap">
            ✅ ใช้เลย
          </button>
          <button onClick={handleUndo} disabled={historySize.undo===0} title={`ย้อน Ctrl+Z (${historySize.undo})`}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl disabled:opacity-30">↩</button>
          <button onClick={handleRedo} disabled={historySize.redo===0} title={`หน้า Ctrl+Y (${historySize.redo})`}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl disabled:opacity-30">↪</button>
          <button onClick={()=>setShowCategoryManager(true)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl">🗂️</button>
          <button onClick={()=>{setSelectedIds(new Set());setBulkCategory('');setBulkFlow('')}} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl">✕</button>
        </div>
      </div>

      {/* Main card */}
      <div ref={tableTopRef} className={`bg-white flex flex-col transition-all duration-200 ${isFullscreen?'fixed inset-0 z-30 rounded-none shadow-none':'rounded-2xl shadow-sm border border-gray-100 overflow-hidden'}`}>
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">🔍</span>
              <input type="text" placeholder="ค้นหารายการ, วันที่, ช่องทาง..." value={search} onChange={e=>setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"/>
            </div>
            <select value={filterCategory} onChange={e=>setFilterCategory(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option value="all">ทุกหมวดหมู่</option>
              {allCategoryOptions.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={()=>setShowCategoryManager(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 text-gray-600 font-medium transition-colors whitespace-nowrap">
              🗂️ จัดการหมวดหมู่
            </button>
            <div className="flex items-center gap-1">
              <button onClick={handleUndo} disabled={historySize.undo===0} title={`ย้อน Ctrl+Z (${historySize.undo})`}
                className="flex items-center gap-1 px-2 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30 transition-colors">
                ↩<span className="text-xs hidden sm:inline">ย้อน</span>
              </button>
              <button onClick={handleRedo} disabled={historySize.redo===0} title={`หน้า Ctrl+Y (${historySize.redo})`}
                className="flex items-center gap-1 px-2 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30 transition-colors">
                ↪<span className="text-xs hidden sm:inline">หน้า</span>
              </button>
            </div>
            <span className="text-sm text-gray-400 select-none">{filtered.length}/{transactions.length} รายการ</span>
            <button onClick={()=>setIsFullscreen(f=>!f)} title={isFullscreen?'ออกจากเต็มจอ (Esc)':'เต็มจอ'}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors ml-auto">
              {isFullscreen?'⊠':'⛶'}
            </button>
          </div>
          {transactions.length>0&&(
            <p className="text-xs text-gray-400 select-none mt-2">
              💡 <strong>ลากซ้าย</strong>=เลือก · <strong>ลากขวา</strong>=ยกเลิก · <strong>hover+ตัวเลข</strong>=กำหนดหมวดหมู่ · เลือกแล้วกด <strong>↑ออก/↓เข้า</strong> ใน bar ล่าง
              {isFullscreen&&<span className="ml-2">· <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono text-gray-500">Esc</kbd></span>}
            </p>
          )}
        </div>
        {transactions.length>0&&<ShortcutLegend shortcutMap={shortcutMap} categoryColorMap={categoryColorMap}/>}

        {/* Table */}
        <div className="flex-1 overflow-auto" style={{userSelect:'none',minHeight:isFullscreen?0:undefined}}
          onContextMenu={handleContextMenu} onMouseLeave={handleTableMouseLeave}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-white text-xs uppercase tracking-wide">
                <th className="px-3 py-3 w-10 bg-gray-800 text-center sticky top-0 z-20">
                  <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} className="rounded cursor-pointer accent-blue-400"/>
                </th>
                {['#','วันที่','รายการ','เงินออก / เงินเข้า','คงเหลือ (฿)','ช่องทาง'].map(h=>(
                  <th key={h} className={`px-3 py-3 bg-gray-800 sticky top-0 z-20 ${h==='คงเหลือ (฿)'?'text-right':'text-left'}`}>{h}</th>
                ))}
                <th className="px-3 py-3 text-left min-w-[190px] bg-gray-800 sticky top-0 z-20">หมวดหมู่</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length===0?(
                <tr><td colSpan={8} className="text-center py-20 text-gray-400">
                  <div className="text-5xl mb-3">📂</div>
                  <div className="text-sm">ไม่มีข้อมูล — อัพโหลดไฟล์เพื่อเริ่มต้น</div>
                </td></tr>
              ):pageRows.map((tx, pageIdx)=>{
                const rowNum = (page - 1) * pageSize + pageIdx + 1
                const isSel=selectedIds.has(tx.id), isSave=savingIds.has(tx.id), isHL=highlightTxId===tx.id
                const catHex=categoryColorMap[tx.category]
                return (
                  <tr key={tx.id} id={`tx-${tx.id}`}
                    onMouseDown={e=>handleRowMouseDown(e,tx.id)}
                    onMouseEnter={()=>handleRowMouseEnter(tx.id)}
                    style={isSel||isHL?{}:getRowStyle(catHex)}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${isHL?'bg-yellow-50 outline outline-2 outline-yellow-400 outline-offset-[-2px]':''} ${isSel?'!bg-blue-50 outline outline-2 outline-blue-400 outline-offset-[-2px]':''} ${!isSel&&!isHL?'hover:brightness-95':''}`}>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={isSel} onChange={()=>toggleSelect(tx.id)} onClick={e=>e.stopPropagation()} className="rounded accent-blue-500 w-4 h-4 cursor-pointer"/>
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs tabular-nums">{rowNum}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs font-mono">{tx.date||'-'}</td>
                    <td className="px-3 py-2 text-gray-800 max-w-xs" title={tx.particulars}>
                      <div className="truncate">{tx.particulars||'-'}</div>
                      {tx.via&&<div className="text-xs text-gray-400 truncate mt-0.5">{tx.via}</div>}
                    </td>
                    <td className="px-3 py-2 min-w-[170px]" onMouseDown={e=>e.stopPropagation()}>
                      <FlowEditCell tx={tx} onSave={handleFlowEdit}/>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-700 tabular-nums text-xs">{tx.balance?fmt(tx.balance):'-'}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs max-w-[120px] truncate hidden lg:table-cell">{tx.via||'-'}</td>
                    <td className="px-3 py-2" onMouseDown={e=>e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        {!categoryOptions.includes(tx.category)&&tx.category!=='Uncategorized'?(
                          <div className="flex flex-col gap-0.5 w-full">
                            <span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-md font-medium truncate" title={`จากไฟล์: ${tx.category}`}>📌 {tx.category}</span>
                            <select value="" onChange={e=>e.target.value&&handleCategoryChange(tx.id,e.target.value)}
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1 w-full cursor-pointer text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300">
                              <option value="">— เปลี่ยนหมวดหมู่ —</option>
                              {categoryOptions.filter(c=>c!=='Uncategorized').map(c=><option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        ):(
                          <select value={tx.category||'Uncategorized'} onChange={e=>handleCategoryChange(tx.id,e.target.value)}
                            style={getBadgeStyle(catHex)}
                            className="text-xs border rounded-lg px-2 py-1.5 w-full cursor-pointer font-medium focus:outline-none focus:ring-2 focus:ring-blue-300">
                            {categoryOptions.map(c=><option key={c} value={c}>{c}</option>)}
                          </select>
                        )}
                        {isSave&&<span className="animate-spin text-blue-400 text-sm shrink-0">⟳</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length>0&&(
          <PaginationBar page={page} totalPages={totalPages} pageSize={pageSize} totalItems={filtered.length}
            onPage={p=>{setPage(p);scrollToTableTop()}} onPageSize={setPageSize} onJumpUncategorized={handleJumpUncategorized}/>
        )}
      </div>
    </>
  )
}
