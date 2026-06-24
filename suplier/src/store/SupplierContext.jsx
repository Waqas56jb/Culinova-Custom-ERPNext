import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'

const Ctx = createContext(null)
export const useSupplier = () => useContext(Ctx)

export function SupplierProvider({ children }) {
  const { user } = useAuth()
  const [rfqs, setRfqs] = useState([])
  const [orders, setOrders] = useState([])

  const load = useCallback(async () => {
    try {
      const o = await api('/portal/supplier/overview')
      setRfqs((o.rfqs || []).map((r) => ({ id: r.id, ref: r.number, item: r.item_name, qty: Number(r.qty) || 1, status: r.status, due: '' })))
      setOrders((o.purchaseOrders || []).map((p) => ({ id: p.id, ref: p.number, item: p.item_name, qty: Number(p.qty) || 1, amount: Number(p.amount) || 0, status: p.status, shipment: p.shipment, accepted: p.accepted })))
    } catch { /* not authed */ }
  }, [])
  useEffect(() => { if (user) load() }, [user, load])

  const submitQuote = async (id, price) => { await api('/portal/supplier/quote', { method: 'POST', body: { rfq_id: id, quote: Number(price) || 0 } }); await load() }
  const acceptOrder = async (id) => { await api(`/portal/supplier/po/${id}`, { method: 'PATCH', body: { accepted: true } }); await load() }
  const setShipment = async (id, shipment) => { await api(`/portal/supplier/po/${id}`, { method: 'PATCH', body: { shipment } }); await load() }

  return <Ctx.Provider value={{ rfqs, orders, submitQuote, acceptOrder, setShipment }}>{children}</Ctx.Provider>
}
