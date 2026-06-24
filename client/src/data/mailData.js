// CULINOVA ERP — email composer template (logic, not data).
export const emailTemplates = {
  quotation: (customerName, qtnId, amount) => ({
    subject: `Quotation ${qtnId} — Culinova Commercial Kitchen`,
    body: `Dear ${customerName || 'Customer'},\n\nThank you for your interest in Culinova.\n\nPlease find attached our detailed quotation (${qtnId}) for your project, including supply, installation and commissioning.\n\nTotal: ${amount || ''}\nThis quotation is valid for 30 days.\n\nPlease do not hesitate to contact us for any clarification.\n\nBest regards,\nCulinova — Sales & Estimation`,
  }),
}
