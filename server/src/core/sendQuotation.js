/**
 * Sprint 3 Block 2 — real quotation send (G49)
 *
 * Path chosen: EMAIL with PORTAL LINK (no PDF attachment).
 * Reason: server has no pdfkit/puppeteer/react-pdf; QuotationPrint is client-only React.
 * Adding heavy PDF deps was flagged as out of scope — portal link is honest + deploy-friendly.
 * When SMTP_* env not set → skip email, still mark Sent + portal notify.
 */

import nodemailer from 'nodemailer'
import { supabase } from '../config/supabase.js'
import { logAudit } from './audit.js'
import { assertTransition } from './quotationStatus.js'
import { validateRequiredFields } from '../modules/sales/quotation.rules.js'
import { creditStatus } from './customerCredit.js'
import { customerPortalUrl, URLS } from '../config/deploy.js'

/** Never put localhost in customer-facing emails (phones cannot open it). */
const portalBase = () => {
  const u = customerPortalUrl()
  try {
    const host = new URL(u).hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
      return URLS.erp.customer
    }
  } catch { /* fall through */ }
  return u
}

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_FROM)
}

async function sendEmail({ to, subject, text, html }) {
  if (!smtpConfigured()) {
    return { sent: false, skipped: true, reason: 'email skipped: smtp not configured' }
  }
  if (!to) {
    return { sent: false, skipped: true, reason: 'email skipped: no recipient' }
  }
  const port = Number(process.env.SMTP_PORT) || 587
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  })
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html,
  })
  return { sent: true, skipped: false }
}

async function notifyCustomerPortal(q, actorName) {
  const name = (q.customer || '').trim()
  if (!name) return { portal: false, recipients: 0 }

  let qUsers = supabase.from('users').select('id, email, name').eq('role', 'Customer').ilike('name', name)
  const { data: byName } = await qUsers
  let users = byName || []
  if (!users.length && q.customer_email) {
    const { data: byEmail } = await supabase.from('users').select('id, email, name')
      .eq('role', 'Customer').ilike('email', q.customer_email)
    users = byEmail || []
  }
  if (!users.length) return { portal: false, recipients: 0 }

  const link = `${portalBase()}/quotations`
  const rows = users.map((u) => ({
    user_id: u.id,
    type: 'quotation_sent',
    ref_type: 'quotation',
    ref_id: q.id,
    action_status: 'info',
    title: `New quotation ${q.number}`,
    body: `CULINOVA sent quotation ${q.number} for ${q.project_name || 'your project'} (valid ${q.validity_days || '—'} days). Open the portal to review: ${link}`,
    sender: actorName || 'CULINOVA Sales',
  }))
  await supabase.from('notifications').insert(rows)

  // Chat thread mirror (portal already reads messages)
  await supabase.from('messages').insert({
    customer_name: name,
    customer_email: q.customer_email || users[0]?.email || null,
    sender: 'staff',
    body: `📄 Quotation ${q.number} has been sent for your review. Please Accept, Reject, or request a concession in your portal.`,
  })

  return { portal: true, recipients: users.length }
}

function emailBodies(q) {
  const link = `${portalBase()}/quotations`
  const subject = `CULINOVA Quotation ${q.number}`
  const text = [
    `Dear ${q.customer || 'Customer'},`,
    '',
    `Please find your quotation ${q.number}.`,
    `Project: ${q.project_name || '—'}`,
    `Validity: ${q.validity_days || '—'} days${q.valid_till ? ` (until ${q.valid_till})` : ''}`,
    `Total: SAR ${Math.round(Number(q.total_amount) || 0).toLocaleString('en-US')}`,
    '',
    `Review and respond in the customer portal:`,
    link,
    '',
    'Thank you,',
    'CULINOVA',
  ].join('\n')
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;line-height:1.5">
      <p>Dear ${escapeHtml(q.customer || 'Customer')},</p>
      <p>Please find your quotation <b>${escapeHtml(q.number)}</b>.</p>
      <ul>
        <li>Project: ${escapeHtml(q.project_name || '—')}</li>
        <li>Validity: ${escapeHtml(String(q.validity_days || '—'))} days${q.valid_till ? ` (until ${escapeHtml(q.valid_till)})` : ''}</li>
        <li>Total: <b>SAR ${Math.round(Number(q.total_amount) || 0).toLocaleString('en-US')}</b></li>
      </ul>
      <p><a href="${link}" style="display:inline-block;background:#0EA99A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open in portal</a></p>
      <p style="color:#64748b;font-size:12px;margin-top:24px">CULINOVA · Commercial kitchen solutions</p>
    </div>`
  return { subject, text, html }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/**
 * Full send: status Sent + portal notify + email (portal link) + audit.
 * @returns {{ ok, status, channels, credit_warning?, sent_to }}
 */
export async function sendQuotationToCustomer({ quotationId, actor, confirmOverdue = false }) {
  const { data: q } = await supabase.from('quotations').select('*').eq('id', quotationId).single()
  if (!q) {
    const err = new Error('Not found')
    err.status = 404
    throw err
  }
  if (q.approval_status === 'Pending' || q.status === 'Pending Approval') {
    const err = new Error('Quotation needs approval before it can be sent')
    err.status = 403
    throw err
  }
  const missing = validateRequiredFields(q)
  if (missing.length) {
    const err = new Error('Quotation is incomplete and cannot be sent to the customer')
    err.status = 422
    err.missing_fields = missing
    throw err
  }
  try { assertTransition(q.status, 'Sent') } catch (e) {
    throw e
  }

  const credit = await creditStatus(q.customer)
  if (credit.has_overdue && !confirmOverdue) {
    const err = new Error(`Customer has overdue balance SAR ${credit.overdue_amount} — confirm send anyway`)
    err.status = 422
    err.code = 'CREDIT_OVERDUE_CONFIRM'
    err.credit_warning = {
      overdue_amount: credit.overdue_amount,
      overdue_invoice_count: credit.overdue_invoice_count,
      active_quotations_count: credit.active_quotations_count,
    }
    throw err
  }

  await supabase.from('quotations').update({
    status: 'Sent',
    sent_at: new Date().toISOString(),
  }).eq('id', q.id)

  const portal = await notifyCustomerPortal(q, actor?.name)
  const mail = emailBodies(q)
  const to = q.customer_email || null
  let emailResult
  try {
    emailResult = await sendEmail({ to, ...mail })
  } catch (e) {
    emailResult = { sent: false, skipped: true, reason: `email failed: ${e.message}` }
    console.warn('[sendQuotation]', emailResult.reason)
  }
  if (emailResult.skipped) console.warn('[sendQuotation]', emailResult.reason)

  const channels = {
    portal: !!portal.portal,
    portal_recipients: portal.recipients || 0,
    email: emailResult.sent ? 'sent' : 'skipped',
    email_detail: emailResult.reason || null,
    pdf: 'portal-link', // no server PDF lib
  }

  await logAudit(actor, 'quotation', q.id, 'quotation_sent', {
    to,
    channels,
    confirm_overdue: !!confirmOverdue,
  })

  return {
    ok: true,
    status: 'Sent',
    sent_to: to,
    channels,
    credit_warning: credit.has_overdue
      ? { overdue_amount: credit.overdue_amount, overdue_invoice_count: credit.overdue_invoice_count }
      : null,
  }
}
