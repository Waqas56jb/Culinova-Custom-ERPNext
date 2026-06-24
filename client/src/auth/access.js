// Mirrors the backend RBAC — role → which panels are visible.
export const rolePanels = {
  Management: ['*'],
  'Sales User': ['sales'],
  'Project Manager': ['projects', 'procurement', 'site'],
  'Purchase User': ['procurement'],
  'Stock User': ['warehouse'],
  'Accounts User': ['finance'],
  'Site Engineer': ['site'],
  'Service User': ['service'],
  'HR User': ['hr'],
}

export const ROLES = Object.keys(rolePanels)

export function canSee(role, panel) {
  const p = rolePanels[role] || []
  return p.includes('*') || p.includes(panel)
}

export const roleMeta = {
  Management: { who: 'Mohammed B. Amr', title: 'CEO', initials: 'MA' },
  'Sales User': { who: 'Ahmed Shaban', title: 'Sales Executive', initials: 'AH' },
  'Project Manager': { who: 'Omar Siddiqui', title: 'Project Manager', initials: 'OM' },
  'Purchase User': { who: 'Khalid Nasser', title: 'Procurement Officer', initials: 'KN' },
  'Stock User': { who: 'Yusuf Rana', title: 'Storekeeper', initials: 'YR' },
  'Accounts User': { who: 'Sara Hassan', title: 'Accountant', initials: 'SH' },
  'Site Engineer': { who: 'Faisal Omar', title: 'Site Engineer', initials: 'FO' },
  'Service User': { who: 'Tariq Aziz', title: 'Service Coordinator', initials: 'TA' },
}
