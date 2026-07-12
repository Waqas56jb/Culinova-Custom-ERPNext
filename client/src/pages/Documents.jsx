import { useState, useEffect, useCallback } from 'react'
import { FileText, Plus, History, Trash2, ExternalLink, Loader2, Eye } from 'lucide-react'
import { PageHeader, Badge } from '../components/ui.jsx'
import { Modal, Field, Select } from '../components/Modal.jsx'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

const isImage = (u = '') => /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(u)
const isPdf = (u = '') => /\.pdf(\?|$)/i.test(u)

const DOC_TYPES = ['Contract', 'Datasheet', 'Certificate', 'Drawing', 'Invoice', 'Registration', 'Report', 'Other']

export default function Documents() {
  const d = useData()
  const { user } = useAuth()
  const canEdit = !!user
  const [rows, setRows] = useState([])
  const [add, setAdd] = useState(null)
  const [ver, setVer] = useState(null)     // document being versioned/viewed
  const [preview, setPreview] = useState(null) // document being previewed inline
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(() => { d.docList().then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([])) }, [d])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!add.name) return setErr('Name is required')
    setBusy(true); setErr('')
    try { await d.docAdd(add); setAdd(null); load() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const openVersions = async (doc) => { setVer({ doc, full: null, newUrl: '', note: '' }); const full = await d.docGet(doc.id); setVer((v) => ({ ...v, full })) }
  const addVersion = async () => {
    setBusy(true)
    try { await d.docNewVersion(ver.doc.id, { file_url: ver.newUrl, note: ver.note }); const full = await d.docGet(ver.doc.id); setVer((v) => ({ ...v, full, newUrl: '', note: '' })); load() } catch (e) { alert(e.message) } finally { setBusy(false) }
  }
  const remove = async (id) => { if (confirm('Delete this document and all versions?')) { await d.docDelete(id); load() } }

  return (
    <>
      <PageHeader title="Document Management" subtitle="Central document library with version history">
        {canEdit && <button className="btn-primary" onClick={() => { setErr(''); setAdd({ name: '', doc_type: 'Contract', file_url: '' }) }}><Plus size={16} /> Upload Document</button>}
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-slate-50/60"><th className="th">Document</th><th className="th">Type</th><th className="th">Version</th><th className="th">Uploaded By</th><th className="th">Date</th><th className="th text-right">Actions</th></tr></thead>
            <tbody>
              {rows.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-ink"><FileText size={14} className="mr-1.5 inline text-slate-400" />{doc.name}</td>
                  <td className="td"><Badge tone="gray">{doc.doc_type || '—'}</Badge></td>
                  <td className="td"><Badge tone="blue">v{doc.version}</Badge></td>
                  <td className="td text-slate-500">{doc.uploaded_by_name || '—'}</td>
                  <td className="td text-slate-500 whitespace-nowrap">{new Date(doc.created_at).toLocaleDateString()}</td>
                  <td className="td text-right">
                    {doc.file_url && <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title="Preview" onClick={() => setPreview(doc)}><Eye size={15} /></button>}
                    {doc.file_url && <a href={doc.file_url} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 inline-block" title="Open in new tab"><ExternalLink size={15} /></a>}
                    <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title="Version history" onClick={() => openVersions(doc)}><History size={15} /></button>
                    {canEdit && <button className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500" title="Delete" onClick={() => remove(doc.id)}><Trash2 size={15} /></button>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="td text-slate-400" colSpan={6}>No documents yet. Click “Upload Document”.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* upload modal */}
      <Modal open={!!add} onClose={() => setAdd(null)} title="Upload Document" subtitle="Store a document URL — version history is kept automatically"
        footer={<><button className="btn-ghost" onClick={() => setAdd(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Loader2 size={16} className="animate-spin" /> : null} Save</button></>}>
        {add && (
          <div className="space-y-3">
            <Field label="Document Name *" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
            <Select label="Type" value={add.doc_type} onChange={(e) => setAdd({ ...add, doc_type: e.target.value })} options={DOC_TYPES} />
            <Field label="File URL" value={add.file_url} onChange={(e) => setAdd({ ...add, file_url: e.target.value })} placeholder="https://… (PDF / image / doc)" hint="Upload to storage and paste the link" />
            {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</div>}
          </div>
        )}
      </Modal>

      {/* version history modal */}
      <Modal open={!!ver} onClose={() => setVer(null)} title="Version History" subtitle={ver?.doc?.name}
        footer={<button className="btn-ghost" onClick={() => setVer(null)}>Close</button>}>
        {ver && (
          <div className="space-y-3">
            {!ver.full ? <div className="grid place-items-center py-6 text-muted"><Loader2 className="animate-spin" /></div> : (
              <div className="space-y-1.5">
                {(ver.full.versions || []).map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                    <div><Badge tone="blue">v{v.version}</Badge> <span className="ml-1 text-slate-600">{v.note}</span><span className="block text-[11px] text-muted">{v.uploaded_by_name} · {new Date(v.created_at).toLocaleString()}</span></div>
                    {v.file_url && <a href={v.file_url} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-brand-600">open</a>}
                  </div>
                ))}
              </div>
            )}
            {canEdit && (
              <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3">
                <p className="mb-2 text-xs font-bold text-brand-700">Upload a new version</p>
                <Field label="New file URL" value={ver.newUrl} onChange={(e) => setVer({ ...ver, newUrl: e.target.value })} placeholder="https://…" />
                <div className="mt-2 flex items-end gap-2">
                  <div className="flex-1">
                    <Field label="Change note" value={ver.note} onChange={(e) => setVer({ ...ver, note: e.target.value })} placeholder="e.g. updated pricing sheet" />
                  </div>
                  <button className="btn-primary !py-2 shrink-0" disabled={busy || !ver.newUrl} onClick={addVersion}>{busy ? <Loader2 size={14} className="animate-spin" /> : null} Add version</button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* inline preview modal */}
      <Modal open={!!preview} onClose={() => setPreview(null)} size="xl" title={preview?.name} subtitle={preview?.doc_type}
        footer={<>{preview?.file_url && <a href={preview.file_url} target="_blank" rel="noreferrer" className="btn-ghost">Open in new tab</a>}<button className="btn-ghost" onClick={() => setPreview(null)}>Close</button></>}>
        {preview && (
          <div className="grid place-items-center">
            {isImage(preview.file_url)
              ? <img src={preview.file_url} alt={preview.name} className="max-h-[70vh] w-auto rounded-lg border border-slate-200" />
              : isPdf(preview.file_url)
                ? <iframe src={preview.file_url} title={preview.name} className="h-[70vh] w-full rounded-lg border border-slate-200" />
                : <div className="py-10 text-center text-sm text-muted"><FileText size={40} className="mx-auto mb-2 text-slate-300" />No inline preview for this file type.<br /><a href={preview.file_url} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-brand-600">Open in new tab →</a></div>}
          </div>
        )}
      </Modal>
    </>
  )
}
