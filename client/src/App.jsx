import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import SalesDashboard from './pages/SalesDashboard.jsx'
import Leads from './pages/Leads.jsx'
import Opportunities from './pages/Opportunities.jsx'
import Quotations from './pages/Quotations.jsx'
import SalesOrders from './pages/SalesOrders.jsx'
import Customers from './pages/Customers.jsx'
import Chat from './pages/Chat.jsx'
import ProjectDashboard from './pages/ProjectDashboard.jsx'
import Projects from './pages/Projects.jsx'
import ProjectDetail from './pages/ProjectDetail.jsx'
import Tasks from './pages/Tasks.jsx'
import ProcurementDashboard from './pages/ProcurementDashboard.jsx'
import MaterialRequests from './pages/MaterialRequests.jsx'
import RFQs from './pages/RFQs.jsx'
import PurchaseOrders from './pages/PurchaseOrders.jsx'
import Suppliers from './pages/Suppliers.jsx'
import SupplierDashboard from './pages/SupplierDashboard.jsx'
import SupplierRFQs from './pages/SupplierRFQs.jsx'
import SupplierPOs from './pages/SupplierPOs.jsx'
import SupplierDeliveries from './pages/SupplierDeliveries.jsx'
import StockDashboard from './pages/StockDashboard.jsx'
import StockItems from './pages/StockItems.jsx'
import GoodsReceipt from './pages/GoodsReceipt.jsx'
import DeliveryNotes from './pages/DeliveryNotes.jsx'
import Warehouses from './pages/Warehouses.jsx'
import FinanceDashboard from './pages/FinanceDashboard.jsx'
import SalesInvoices from './pages/SalesInvoices.jsx'
import Payments from './pages/Payments.jsx'
import Ledger from './pages/Ledger.jsx'
import FinancialReports from './pages/FinancialReports.jsx'
import SiteDashboard from './pages/SiteDashboard.jsx'
import Installations from './pages/Installations.jsx'
import SnagList from './pages/SnagList.jsx'
import Commissioning from './pages/Commissioning.jsx'
import ServiceDashboard from './pages/ServiceDashboard.jsx'
import ServiceTickets from './pages/ServiceTickets.jsx'
import MaintenanceVisits from './pages/MaintenanceVisits.jsx'
import HRDashboard from './pages/HRDashboard.jsx'
import Employees from './pages/Employees.jsx'
import Attendance from './pages/Attendance.jsx'
import Payroll from './pages/Payroll.jsx'
import FormModals from './components/FormModals.jsx'
import Login from './pages/Login.jsx'
import { useAuth } from './auth/AuthContext.jsx'

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="grid min-h-screen place-items-center bg-slate-100 text-sm text-slate-400">Loading…</div>
  if (!user) return <Login />
  return (
    <>
      <Routes>
        {/* main ERP shell */}
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/sales/dashboard" replace />} />
          <Route path="/sales/dashboard" element={<SalesDashboard />} />
          <Route path="/sales/leads" element={<Leads />} />
          <Route path="/sales/opportunities" element={<Opportunities />} />
          <Route path="/sales/quotations" element={<Quotations />} />
          <Route path="/sales/orders" element={<SalesOrders />} />
          <Route path="/sales/customers" element={<Customers />} />
          <Route path="/sales/chat" element={<Chat />} />

          {/* Project Management */}
          <Route path="/projects/dashboard" element={<ProjectDashboard />} />
          <Route path="/projects/all" element={<Projects />} />
          <Route path="/projects/board" element={<Tasks />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />

          {/* Procurement */}
          <Route path="/procurement/dashboard" element={<ProcurementDashboard />} />
          <Route path="/procurement/requests" element={<MaterialRequests />} />
          <Route path="/procurement/rfq" element={<RFQs />} />
          <Route path="/procurement/po" element={<PurchaseOrders />} />
          <Route path="/procurement/suppliers" element={<Suppliers />} />

          {/* Supplier Portal (external) */}
          <Route path="/supplier/dashboard" element={<SupplierDashboard />} />
          <Route path="/supplier/rfqs" element={<SupplierRFQs />} />
          <Route path="/supplier/orders" element={<SupplierPOs />} />
          <Route path="/supplier/deliveries" element={<SupplierDeliveries />} />

          {/* Warehouse / Stock */}
          <Route path="/stock/dashboard" element={<StockDashboard />} />
          <Route path="/stock/items" element={<StockItems />} />
          <Route path="/stock/receipts" element={<GoodsReceipt />} />
          <Route path="/stock/delivery" element={<DeliveryNotes />} />
          <Route path="/stock/warehouses" element={<Warehouses />} />

          {/* Finance & Accounting */}
          <Route path="/finance/dashboard" element={<FinanceDashboard />} />
          <Route path="/finance/invoices" element={<SalesInvoices />} />
          <Route path="/finance/payments" element={<Payments />} />
          <Route path="/finance/ledger" element={<Ledger />} />
          <Route path="/finance/reports" element={<FinancialReports />} />

          {/* Site Execution */}
          <Route path="/site/dashboard" element={<SiteDashboard />} />
          <Route path="/site/installations" element={<Installations />} />
          <Route path="/site/snags" element={<SnagList />} />
          <Route path="/site/commissioning" element={<Commissioning />} />

          {/* Service & Maintenance */}
          <Route path="/service/dashboard" element={<ServiceDashboard />} />
          <Route path="/service/tickets" element={<ServiceTickets />} />
          <Route path="/service/visits" element={<MaintenanceVisits />} />

          {/* HR & Payroll */}
          <Route path="/hr/dashboard" element={<HRDashboard />} />
          <Route path="/hr/employees" element={<Employees />} />
          <Route path="/hr/attendance" element={<Attendance />} />
          <Route path="/hr/payroll" element={<Payroll />} />

          <Route path="*" element={<Navigate to="/sales/dashboard" replace />} />
        </Route>
      </Routes>

      {/* global overlays — available on every route */}
      <FormModals />
    </>
  )
}
