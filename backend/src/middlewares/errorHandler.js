// Manejo centralizado de errores: siempre JSON { ok:false, mensaje, detalles? }.
// Nunca expone stack traces al cliente.
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  const mensaje = err.status ? err.message : 'Error interno del servidor';
  if (!err.status) console.error(err);
  res.status(status).json({
    ok: false,
    mensaje,
    ...(err.detalles ? { detalles: err.detalles } : {}),
  });
};
