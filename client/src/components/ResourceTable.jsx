import { useState, useEffect, useCallback } from 'react'
import MasterTable from './MasterTable.jsx'
import { useData } from '../store/DataContext.jsx'

// MasterTable wired to a config-driven backend resource: auto-fetches + auto-CRUDs.
// Usage: <ResourceTable resource="stock-categories" canEdit columns={...} fields={...} title="..." />
export default function ResourceTable({ resource, params = '', canEdit, ...props }) {
  const d = useData()
  const [rows, setRows] = useState([])
  const load = useCallback(() => { d.resList(resource, params).then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([])) }, [d, resource, params])
  useEffect(() => { load() }, [load])
  return (
    <MasterTable {...props} rows={rows} canEdit={canEdit}
      onAdd={async (v) => { await d.resAdd(resource, v); load() }}
      onUpdate={async (id, v) => { await d.resUpdate(resource, id, v); load() }}
      onDelete={async (id) => { await d.resDelete(resource, id); load() }} />
  )
}
