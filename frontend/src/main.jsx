import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 5000,
        style: {
          background: '#1F2937',
          color: '#F9FAFB',
          fontSize: '14px',
        },
        success: {
          duration: 5000,
          iconTheme: { primary: '#22C55E', secondary: '#F9FAFB' },
        },
        error: {
          duration: 5000,
          iconTheme: { primary: '#EF4444', secondary: '#F9FAFB' },
        },
        loading: {
          duration: Infinity,
        },
      }}
    />
  </React.StrictMode>,
)
