// Controladores HTTP del módulo notificaciones (sin Mongoose directo).
import { isValidObjectId } from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import * as service from './notificaciones.service.js';
import { listarNotificacionesSchema } from './notificaciones.schema.js';

const usuarioId = (req) => req.usuario?.email || req.usuario?._id || null;

// Express 5 expone req.query como solo lectura, por eso se valida aquí con zod
// y se usa el resultado en lugar de reasignarlo.
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

export const listar = asyncHandler(async (req, res) => {
  const datos = parsear(listarNotificacionesSchema, req.query);
  const muestra = datos.muestraId || datos.muestra;
  if (muestra && !isValidObjectId(muestra)) {
    throw new AppError('El identificador de muestra no es válido', 400);
  }
  const filtro = {};
  if (muestra) filtro.muestraId = muestra;
  if (datos.estado) filtro.estado = datos.estado;
  if (datos.tipo) filtro.tipo = datos.tipo;
  res.json({ ok: true, notificaciones: await service.listar(filtro) });
});

export const obtener = asyncHandler(async (req, res) => {
  res.json({ ok: true, notificacion: await service.obtener(req.params.id) });
});

export const reintentar = asyncHandler(async (req, res) => {
  const notificacion = await service.reintentar(req.params.id, usuarioId(req));
  res.json({
    ok: true,
    mensaje: notificacion.estado === 'enviada'
      ? 'Notificación reenviada correctamente'
      : `Reintento registrado (${notificacion.intentos} de 3): ${notificacion.errorUltimoIntento || 'sin detalle'}`,
    notificacion,
  });
});
