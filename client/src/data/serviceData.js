// CULINOVA ERP — Service & Maintenance mock data
export const seedTickets = [
  { id: 'TKT-0012', customer: 'Crowne Plaza RUH', project: 'PRJ-0040', subject: 'Chiller not cooling properly', priority: 'High', status: 'Open', sla: 'Resolution Due', date: '2026-06-22' },
  { id: 'TKT-0011', customer: 'Al Faisaliah Catering', project: 'PRJ-0038', subject: 'Dishwasher water leak', priority: 'Medium', status: 'In Progress', sla: 'On Track', date: '2026-06-20' },
  { id: 'TKT-0010', customer: 'Crowne Plaza RUH', project: 'PRJ-0040', subject: 'Routine check request', priority: 'Low', status: 'Resolved', sla: 'Met', date: '2026-06-10' },
]

export const seedVisits = [
  { id: 'VIS-0021', customer: 'Crowne Plaza RUH', project: 'PRJ-0040', type: 'Preventive', date: '2026-07-05', technician: 'Hassan', status: 'Scheduled' },
  { id: 'VIS-0020', customer: 'Al Faisaliah Catering', project: 'PRJ-0038', type: 'Corrective', date: '2026-06-25', technician: 'Hassan', status: 'Scheduled' },
  { id: 'VIS-0019', customer: 'Crowne Plaza RUH', project: 'PRJ-0040', type: 'Preventive', date: '2026-06-05', technician: 'Faisal', status: 'Completed' },
]

export const seedContracts = [
  { id: 'AMC-0007', customer: 'Crowne Plaza RUH', project: 'PRJ-0040', start: '2026-05-20', end: '2027-05-20', status: 'Active' },
  { id: 'AMC-0006', customer: 'Al Faisaliah Catering', project: 'PRJ-0038', start: '2026-06-15', end: '2027-06-15', status: 'Active' },
]
