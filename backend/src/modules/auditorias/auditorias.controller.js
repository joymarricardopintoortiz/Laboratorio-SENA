// Controladores HTTP del módulo auditorias (sin Mongoose directo).
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import * as service from './auditorias.service.js';
import { listarAuditoriasSchema } from './auditorias.schema.js';

// Express 5 expone req.query como solo lectura, por eso se valida aquí con zod
// y se usa el resultado en lugar de reasignarlo (mismo patrón que notificaciones).
function parsear(esquema, datos) {
  const resultado = esquema.safeParse(datos);
  if (!resultado.success) {
    throw new AppError('Datos inválidos', 400, resultado.error.issues.map((i) => ({
      campo: i.path.join('.'),
      mensaje: i.message,
    })));
  }
  return resultado.data;
}

// GET /api/interno/auditorias — consulta paginada (solo admin, solo lectura).
export const listar = asyncHandler(async (req, res) => {
  const filtros = parsear(listarAuditoriasSchema, req.query);
  const { auditorias, paginacion } = await service.listar(filtros);
  res.json({ ok: true, auditorias, paginacion });
});
