import axios from 'axios'

// In production (single-port), API is on the same origin.
// In dev (vite proxy), /api is proxied to localhost:8000.
const api = axios.create({
  baseURL: '/api',
  timeout: 60000,  // 60s for large PDF parsing
})

// ─── Sessions ─────────────────────────────────────────────────────────────────
export const getSessions = () => api.get('/sessions')
export const deleteSession = (id) => api.delete(`/sessions/${id}`)

// ─── Transactions ─────────────────────────────────────────────────────────────
export const getTransactions = (sessionId = null, sessionIds = null) => {
  const params = {}
  if (sessionIds && sessionIds.length > 0) params.session_ids = sessionIds.join(',')
  else if (sessionId) params.session_id = sessionId
  return api.get('/transactions', { params })
}

export const updateTransaction = (id, data) => api.put(`/transactions/${id}`, data)

export const bulkUpdateTransactions = (ids, category) =>
  api.put('/transactions/bulk', { ids, category, status: 'categorized' })

export const deleteAllTransactions = () => api.delete('/transactions')

export const getStats = (sessionId = null, sessionIds = null) => {
  const params = {}
  if (sessionIds && sessionIds.length > 0) params.session_ids = sessionIds.join(',')
  else if (sessionId) params.session_id = sessionId
  return api.get('/transactions/stats', { params })
}

export const getCategorySummary = (sessionId = null, sessionIds = null) => {
  const params = {}
  if (sessionIds && sessionIds.length > 0) params.session_ids = sessionIds.join(',')
  else if (sessionId) params.session_id = sessionId
  return api.get('/transactions/category-summary', { params })
}

// ─── Upload ───────────────────────────────────────────────────────────────────
export const uploadFile = (formData, bank = 'ktb') =>
  api.post(`/upload?bank=${bank}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

// ─── Export ───────────────────────────────────────────────────────────────────
export const exportExcel = (sessionId = null, sessionIds = null) => {
  const params = {}
  if (sessionIds && sessionIds.length > 0) params.session_ids = sessionIds.join(',')
  else if (sessionId) params.session_id = sessionId
  return api.get('/export', { responseType: 'blob', params })
}

// ─── Categories ───────────────────────────────────────────────────────────────
export const getCategories = () => api.get('/categories')
export const createCategory = (data) => api.post('/categories', data)
export const updateCategory = (id, data) => api.put(`/categories/${id}`, data)
export const deleteCategory = (id) => api.delete(`/categories/${id}`)
export const reorderCategories = (items) => api.put('/categories/reorder', { items })

// ─── Category Remap ───────────────────────────────────────────────────────────
export const getDistinctCategories = () => api.get('/transactions/distinct-categories')
export const remapCategory = (oldName, newName) =>
  api.post('/transactions/remap-category', { old_name: oldName, new_name: newName })

export default api
