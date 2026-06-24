export function notFound(req, res) {
  res.status(404).json({ error: 'Route not found' })
}

export function errorHandler(err, req, res, _next) {
  console.error(err)
  const status = err.status || 500
  res.status(status).json({ error: err.message || 'Internal server error' })
}

// wrap async handlers so thrown errors reach errorHandler
export const asyncWrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
