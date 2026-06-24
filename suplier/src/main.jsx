import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { SupplierProvider } from './store/SupplierContext.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SupplierProvider>
          <App />
        </SupplierProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
