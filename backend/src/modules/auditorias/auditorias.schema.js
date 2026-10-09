// Esquemas de validación zod del módulo auditorias (solo lectura, solo admin).
import { z } from 'zod';

// GET /api/interno/auditorias — filtros sobre la query.
// Nota de mapeo: `coleccion` filtra por el campo `entidad` del registro,
// `documentoId` por `entidadId` y `usuarioId` por `usuario` (email o id).
export const listarAuditoriasSchema = z
  .object({
    coleccion: z.string().trim().min(1, 'El filtro coleccion no puede estar vacío').max(50, 'El filtro coleccion no puede superar los 50 caracteres').optional(),
    documentoId: z.string().trim().min(1, 'El filtro documentoId no puede estar vacío').max(30, 'El filtro documentoId no puede superar los 30 caracteres').optional(),
    usuarioId: z.string().trim().min(1, 'El filtro usuarioId no puede estar vacío').max(150, 'El filtro usuarioId no puede superar los 150 caracteres').optional(),
    desde: z.coerce.date({ error: 'El filtro desde debe ser una fecha válida (ISO)' }).optional(),
    hasta: z.coerce.date({ error: 'El filtro hasta debe ser una fecha válida (ISO)' }).optional(),
    pagina: z.coerce.number({ error: 'El filtro pagina debe ser un número' }).int().positive().default(1),
    limite: z.coerce.number({ error: 'El filtro limite debe ser un número' }).int().positive().max(100).default(20),
  })
  .refine((q) => !(q.desde && q.hasta) || q.desde <= q.hasta, {
    message: 'El rango de fechas no es válido: "desde" debe ser anterior o igual a "hasta"',
    path: ['desde'],
  });
