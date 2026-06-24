# CULINOVA ERP — Client (Frontend)

Modern, responsive ERP frontend built with **React + Vite + Tailwind CSS + Recharts**.
Currently implements the **Sales & Estimation** role end-to-end (no login yet — mock data).

## Run locally
```bash
cd client
npm install
npm run dev
```
Open http://localhost:5173

## Build
```bash
npm run build
npm run preview
```

## Structure
```
src/
  components/   Sidebar, Topbar, Layout, ui (KpiCard, ChartCard, Badge)
  pages/        SalesDashboard, Leads, Opportunities, Quotations, SalesOrders, Customers
  data/         mockData.js  (later replaced by ERPNext REST API)
```

## Implemented (Sales role)
- Sales Dashboard — KPIs, sales-vs-target area chart, quotation-status donut,
  pipeline funnel, top customers, lead sources, recent activity, AI insights panel
- Leads — filter/search table with convert action
- Opportunities — Kanban pipeline by stage
- Quotations / Estimation — GP-protection business rule highlighting
- Sales Orders — delivery/billing status + auto Project link
- Customers — accounts & outstanding balances

> Other internal modules appear in the sidebar (locked) to show the full vision.
