// Middleware/helper para registrar en auditorias.
// registrarAuditoria(...) se llama desde servicios con antes/después.
// auditMiddleware(entidad, accion) envuelve la ruta y registra método, usuario e IP.
import { Auditoria } from '../modules/auditorias/auditorias.model.js';

export async function registrarAuditoria({ entidad, entidadId = null, accion, antes = null, despues = null, usuario = null, ip = null }) {
  try {
    await Auditoria.create({ entidad, entidadId, accion, antes, despues, usuario, ip });
  } catch (error) {
    // La auditoría no debe romper el flujo, pero sí queda en consola.
    console.error('No se pudo registrar la auditoría:', error.message);
  }
}

export const auditMiddleware = (entidad, accion) => (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      registrarAuditoria({
        entidad,
        accion,
        usuario: req.usuario?._id || req.usuario?.email || null,
        ip: req.ip,
        despues: req.body ? { rutas: req.originalUrl } : null,
      });
    }
  });
  next();
};
