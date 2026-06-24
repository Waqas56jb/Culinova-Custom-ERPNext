// CULINOVA ERP — Site Execution (Contracting) mock data
export const seedSnags = [
  { id: 'SNAG-03', project: 'PRJ-0042', item: 'Stainless Steel Exhaust Hood System', desc: 'Minor dent on left panel — needs replacement', severity: 'Low', status: 'Open', date: '2026-07-01' },
  { id: 'SNAG-02', project: 'PRJ-0041', item: 'Cold Room', desc: 'Door seal gap, cold leak', severity: 'Medium', status: 'Open', date: '2026-06-29' },
  { id: 'SNAG-01', project: 'PRJ-0040', item: 'Banquet Cooking Range', desc: 'Gas pressure low at burner 4', severity: 'High', status: 'Resolved', date: '2026-05-12' },
]

export const seedCommissioning = [
  { id: 'TC-01', project: 'PRJ-0042', test: 'Gas leak test', status: 'Passed' },
  { id: 'TC-02', project: 'PRJ-0042', test: 'Electrical load test', status: 'Pending' },
  { id: 'TC-03', project: 'PRJ-0042', test: 'Exhaust airflow test', status: 'Pending' },
  { id: 'TC-04', project: 'PRJ-0041', test: 'Refrigeration temperature test', status: 'Pending' },
  { id: 'TC-05', project: 'PRJ-0040', test: 'Final safety inspection', status: 'Passed' },
]
