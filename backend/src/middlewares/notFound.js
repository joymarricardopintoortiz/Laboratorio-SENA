// Respuesta 404 uniforme para rutas no encontradas.
export const notFound = (req, res) => {
  res.status(404).json({ ok: false, mensaje: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
};
