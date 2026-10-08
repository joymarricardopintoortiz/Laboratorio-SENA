// Consulta de las auditorías (append-only, solo lectura y solo admin).
import { Auditoria } from './auditorias.model.js';

// Filtros: coleccion (campo `entidad`), documentoId (campo `entidadId`),
// usuarioId (campo `usuario`) y rango de fechas `desde`/`hasta` sobre createdAt.
export async function listar({ coleccion, documentoId, usuarioId, desde, hasta, pagina = 1, limite = 20 } = {}) {
  const filtro = {};
  if (coleccion) filtro.entidad = coleccion;
  if (documentoId) filtro.entidadId = documentoId;
  if (usuarioId) filtro.usuario = usuarioId;
  if (desde || hasta) {
    filtro.createdAt = {};
    if (desde) filtro.createdAt.$gte = new Date(desde);
    if (hasta) filtro.createdAt.$lte = new Date(hasta);
  }

  const [total, auditorias] = await Promise.all([
    Auditoria.countDocuments(filtro),
    Auditoria.find(filtro)
      .sort({ createdAt: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite)
      .lean(),
  ]);

  return {
    auditorias,
    paginacion: {
      pagina,
      limite,
      total,
      paginas: Math.max(1, Math.ceil(total / limite)),
    },
  };
}
