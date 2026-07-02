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
export const getTransactions = (sessionId = null) =>
  api.get('/transactions', { params: sessionId ? { session_id: sessionId } : {} })

export const updateTransaction = (id, data) => api.put(`/transactions/${id}`, data)

export const bulkUpdateTransactions = (ids, category) =>
  api.put('/transactions/bulk', { ids, category, status: 'categorized' })

export const deleteAllTransactions = () => api.delete('/transactions')

export const getStats = (sessionId = null) =>
  api.get('/transactions/stats', { params: sessionId ? { session_id: sessionId } : {} })

export const getCategorySummary = (sessionId = null) =>
  api.get('/transactions/category-summary', { params: sessionId ? { session_id: sessionId } : {} })

// ─── Upload ───────────────────────────────────────────────────────────────────
export const uploadFile = (formData) =>
  api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

// ─── Export ───────────────────────────────────────────────────────────────────
export const exportExcel = (sessionId = null) =>
  api.get('/export', {
    responseType: 'blob',
    params: sessionId ? { session_id: sessionId } : {},
  })

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
