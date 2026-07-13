import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowRight, ListChecks, Clock, AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { Modal, Field, Select } from '../components/Modal.jsx'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

// The board columns ARE the task statuses (project_tasks.status). The values stored in the DB are the
// keys — Open / Working / Review / Done — which is exactly what ui.jsx:statusTone already knows.
const cols = [
  { key: 'Open', label: 'To Do', color: '#94a3b8', soft: 'bg-slate-100 text-slate-600' },
  { key: 'Working', label: 'In Progress', color: '#3b82f6', soft: 'bg-blue-50 text-blue-600' },
  { key: 'Review', label: 'Review', color: '#E0A82E', soft: 'bg-amber-50 text-amber-600' },
  { key: 'Done', label: 'Done', color: '#0EA99A', soft: 'bg-emerald-50 text-emerald-600' },
]
const STATUS_OPTIONS = cols.map((c) => ({ value: c.key, label: c.label }))
const KNOWN = new Set(cols.map((c) => c.key))
// Never hide a task: anything with a status the board doesn't know (incl. the legacy 'Overdue' /
// 'In Progress' strings) still lands in a real column instead of vanishing.
const colOf = (t) => (KNOWN.has(t.status) ? t.status : t.status === 'In Progress' ? 'Working' : 'Open')

const statusFilters = ['All', 'On Track', 'At Risk', 'Delayed', 'Completed']

const today = () => new Date().toISOString().slice(0, 10)
// 'Overdue' is NOT a status any code path ever writes — it is DERIVED: past its due date and not done.
const isOverdue = (t) => !!t.due_date && t.due_date < today() && t.status !== 'Done'

const initials = (n) => String(n || '').trim().slice(0, 2).toUpperCase()

export default function Tasks() {
  const navigate = useNavigate()
  const { projects, team, lookupTeam, addTask, updateTask, deleteTask } = useData()
  const { user } = useAuth()
  const canCreate = ['Create', 'Edit', 'Approval', 'Full Admin'].includes(user?.access_level)
  const canEdit = ['Edit', 'Approval', 'Full Admin'].includes(user?.access_level)
  const canDelete = user?.access_level === 'Full Admin'   // server: levelActions — only Full Admin may delete

  const [q, setQ] = useState('')
  const [sf, setSf] = useState('All')
  const [modal, setModal] = useState(null)   // { task, projectId } — task === null ⇒ create

  // Assignee names come from the team list (project_tasks stores assignee_id, a uuid — there is no
  // `assignee` name column). /pm/team is loaded by the store; /lookups/team is the fallback for any
  // internal role. Fetched at most once (the store's value identity changes on every render).
  const [fallbackTeam, setFallbackTeam] = useState([])
  const fetched = useRef(false)
  useEffect(() => {
    if (team?.length || fetched.current) return
    fetched.current = true
    lookupTeam().then((r) => setFallbackTeam(r || [])).catch(() => setFallbackTeam([]))
  }, [team, lookupTeam])
  const people = team?.length ? team : fallbackTeam

  const nameById = useMemo(() => {
    const m = {}
    people.forEach((u) => { if (u?.id) m[u.id] = u.name })
    return m
  }, [people])
  // null  → genuinely unassigned;  string → the person's name (or an honest 'Unknown user')
  const assigneeName = (t) => (t.assignee_id ? nameById[t.assignee_id] || 'Unknown user' : null)

  const ql = q.trim().toLowerCase()
  const matches = (p) => {
    if (sf !== 'All' && p.status !== sf) return false
    if (!ql) return true
    const inProject = [p.ref, p.number, p.id, p.name, p.customer, p.salesOrder].filter(Boolean).join(' ').toLowerCase().includes(ql)
    const inTask = (p.tasks || []).some((t) => `${t.name || ''} ${assigneeName(t) || ''}`.toLowerCase().includes(ql))
    return inProject || inTask
  }
  const shown = projects.filter(matches)

  // company-wide summary (derived from the real rows — no dead 'Overdue' status)
  const allTasks = projects.flatMap((p) => p.tasks || [])
  const summary = {
    total: allTasks.length,
    progress: allTasks.filter((t) => colOf(t) === 'Working').length,
    done: allTasks.filter((t) => t.status === 'Done').length,
    overdue: allTasks.filter(isOverdue).length,
  }

  const openNew = (projectId = '') => setModal({ task: null, projectId: projectId || projects[0]?.id || '' })
  const openEdit = (t) => { if (canEdit) setModal({ task: t, projectId: t.project_id }) }

  return (
    <>
      <PageHeader title="Task Board" subtitle="Tasks grouped by project — see completion at a glance">
        {canCreate && projects.length > 0 && (
          <button className="btn-primary" onClick={() => openNew()}><Plus size={16} /> New Task</button>
        )}
      </PageHeader>

      {/* summary chips */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard icon={ListChecks} label="Total Tasks" value={summary.total} accent="from-violet-500 to-indigo-600" />
        <SummaryCard icon={Clock} label="In Progress" value={summary.progress} accent="from-blue-500 to-blue-600" />
        <SummaryCard icon={CheckCircle2} label="Completed" value={summary.done} accent="from-emerald-500 to-teal-600" />
        <SummaryCard icon={AlertTriangle} label="Overdue" value={summary.overdue} accent="from-rose-500 to-rose-600" />
      </div>

      {/* toolbar */}
      <div className="card mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks"
            placeholder="Search by project name, number, sales order, customer or assignee…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {statusFilters.map((x) => (
            <button key={x} onClick={() => setSf(x)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${sf === x ? 'bg-brand-500 text-white shadow-soft' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{x}</button>
          ))}
        </div>
      </div>

      {/* project groups */}
      <div className="space-y-5">
        {shown.map((p) => {
          const tasks = p.tasks || []
          const total = tasks.length
          const done = tasks.filter((t) => t.status === 'Done').length
          const pct = total ? Math.round((done / total) * 100) : 0
          return (
            <div key={p.id} className="card overflow-hidden animate-fade-up">
              {/* group header */}
              <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-xl font-extrabold tracking-tight text-brand-600">{p.ref || p.number || p.id}</span>
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-sm font-semibold text-ink">{p.name}</p>
                  <p className="text-xs text-muted">{p.customer} · {p.salesOrder}</p>
                </div>
                <div className="flex items-center gap-4 lg:w-96">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold text-ink">{done} / {total} tasks done</span>
                      <span className="text-muted">{pct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
                  </div>
                  {canCreate && <button onClick={() => openNew(p.id)} className="btn-ghost !px-3 !py-2 text-xs"><Plus size={13} /> Task</button>}
                  <button onClick={() => navigate(`/projects/${p.id}`)} className="btn-ghost !px-3 !py-2 text-xs">Open <ArrowRight size={13} /></button>
                </div>
              </div>

              {total === 0 ? (
                <p className="p-6 text-center text-sm text-muted">
                  No tasks yet{canCreate ? <> — click <span className="font-semibold text-ink">New Task</span> to plan work</> : ''}.
                </p>
              ) : (
                /* mini board */
                <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
                  {cols.map((col) => {
                    const items = tasks.filter((t) => colOf(t) === col.key)
                    return (
                      <div key={col.key} className="rounded-xl bg-slate-50/70 p-2.5">
                        <div className="mb-2 flex items-center gap-2 px-1">
                          <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                          <span className="text-xs font-bold text-ink">{col.label}</span>
                          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${col.soft}`}>{items.length}</span>
                        </div>
                        <div className="space-y-2">
                          {items.map((t) => (
                            <TaskCard key={t.id} task={t} who={assigneeName(t)} canEdit={canEdit} onOpen={() => openEdit(t)} />
                          ))}
                          {items.length === 0 && <p className="py-3 text-center text-[11px] text-slate-300">—</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {shown.length === 0 && (
          <div className="card grid place-items-center py-20 text-center text-sm text-slate-400">
            <Search size={36} className="mb-3 text-slate-300" />
            {projects.length === 0
              ? 'No projects yet — projects are created from confirmed Sales Orders'
              : 'No projects match your search'}
          </div>
        )}
      </div>

      {modal && (
        <TaskModal
          task={modal.task}
          defaultProjectId={modal.projectId}
          projects={projects}
          people={people}
          canDelete={canDelete}
          onClose={() => setModal(null)}
          addTask={addTask}
          updateTask={updateTask}
          deleteTask={deleteTask}
        />
      )}
    </>
  )
}

function TaskCard({ task, who, canEdit, onOpen }) {
  const over = isOverdue(task)
  const pct = Math.max(0, Math.min(100, Number(task.progress) || 0))
  const body = (
    <>
      <p className="text-[13px] font-semibold leading-snug text-ink">{task.name}</p>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
        {who
          ? <><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-navy-700 to-brand-600 text-[8px] font-bold text-white">{initials(who)}</span><span className="truncate">{who}</span></>
          : <span className="text-slate-400">Unassigned</span>}
        <span className={`ml-auto shrink-0 ${over ? 'font-semibold text-rose-600' : ''}`}>
          {over ? `Overdue · ${task.due_date}` : task.due_date || ''}
        </span>
      </div>
      {pct > 0 && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="h-1 flex-1 rounded-full bg-slate-100"><div className="h-1 rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
          <span className="text-[10px] text-muted">{pct}%</span>
        </div>
      )}
    </>
  )
  if (!canEdit) return <div className="rounded-lg border border-slate-200/70 bg-white p-2.5 shadow-soft">{body}</div>
  return (
    <button type="button" onClick={onOpen} title="Edit task"
      className="w-full rounded-lg border border-slate-200/70 bg-white p-2.5 text-left shadow-soft transition hover:border-brand-300 hover:shadow-md">
      {body}
    </button>
  )
}

// ── NEW / EDIT TASK ──────────────────────────────────────────────────────────────
// Writes the REAL columns: project_id, name, assignee_id (uuid), status, due_date, progress.
// '' is coerced to null — Postgres rejects '' for a uuid/date/int column (22P02).
function TaskModal({ task, defaultProjectId, projects, people, canDelete, onClose, addTask, updateTask, deleteTask }) {
  const editing = !!task
  const [projectId, setProjectId] = useState(task?.project_id || defaultProjectId || '')
  const [name, setName] = useState(task?.name || '')
  const [assignee, setAssignee] = useState(task?.assignee_id || '')
  const [status, setStatus] = useState(task && KNOWN.has(task.status) ? task.status : 'Open')
  const [due, setDue] = useState(task?.due_date || '')
  const [progress, setProgress] = useState(task?.progress == null ? '' : String(task.progress))
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const projectOptions = [
    { value: '', label: '— Select project —' },
    ...projects.map((p) => ({ value: p.id, label: `${p.ref || p.number || p.id} · ${p.name}` })),
  ]
  const peopleOptions = [
    { value: '', label: '— Unassigned —' },
    ...people.map((u) => ({ value: u.id, label: u.label || `${u.name}${u.role ? ` · ${u.role}` : ''}` })),
  ]

  const save = async () => {
    setErr('')
    if (!projectId) { setErr('Pick the project this task belongs to.'); return }
    if (!name.trim()) { setErr('Task name is required.'); return }
    const pctRaw = progress === '' ? 0 : Number(progress)
    if (Number.isNaN(pctRaw) || pctRaw < 0 || pctRaw > 100) { setErr('Progress must be a number between 0 and 100.'); return }
    const pct = Math.round(pctRaw)
    setBusy('save')
    try {
      if (editing) {
        await updateTask(projectId, task.id, {
          project_id: projectId,
          name: name.trim(),
          status,
          due_date: due || null,          // never send '' to a date column
          assignee_id: assignee || null,  // never send '' to a uuid column
          progress: pct,
        })
      } else {
        await addTask(projectId, { name: name.trim(), status, due: due || null, assignee_id: assignee || null, progress: pct })
      }
      onClose()   // only on success — a failure keeps the modal (and the user's input) open
    } catch (e) {
      setErr(e?.message || 'Could not save the task.')
      setBusy('')
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete task "${task.name}"? This cannot be undone.`)) return
    setErr(''); setBusy('delete')
    try { await deleteTask(task.project_id, task.id); onClose() }
    catch (e) { setErr(e?.message || 'Could not delete the task.'); setBusy('') }
  }

  return (
    <Modal open onClose={onClose} size="md"
      title={editing ? 'Edit Task' : 'New Task'}
      subtitle={editing ? 'Update the status, assignee, due date or progress' : 'Plan a piece of work against a project'}
      footer={<>
        {editing && canDelete && (
          <button className="btn-ghost !text-rose-600" disabled={!!busy} onClick={remove}>
            <Trash2 size={14} /> {busy === 'delete' ? 'Deleting…' : 'Delete'}
          </button>
        )}
        <button className="btn-ghost" disabled={!!busy} onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!!busy} onClick={save}>
          {busy === 'save' ? 'Saving…' : editing ? 'Save changes' : 'Create task'}
        </button>
      </>}>

      <Select label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} options={projectOptions} />
      <Field label="Task name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Install extraction hood" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} options={peopleOptions} />
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS} />
        <Field label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <Field label="Progress %" type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} placeholder="0" />
      </div>

      {people.length === 0 && <p className="text-[11px] text-muted">No team members available to assign — the task will be created unassigned.</p>}
      {editing && !canDelete && <p className="text-[11px] text-muted">Deleting a task needs Full Admin access.</p>}
      {err && <p className="text-xs font-semibold text-rose-600">{err}</p>}
    </Modal>
  )
}

function SummaryCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="card card-pad flex items-center gap-3 animate-fade-up">
      <div className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${accent} text-white`}><Icon size={18} /></div>
      <div>
        <p className="text-xl font-extrabold text-ink">{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </div>
  )
}
