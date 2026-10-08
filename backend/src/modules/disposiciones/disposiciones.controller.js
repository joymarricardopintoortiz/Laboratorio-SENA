// Controladores HTTP de disposiciones (sin Mongoose directo).
import { isValidObjectId } from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import * as service from './disposiciones.service.js';
import { listarDisposicionesSchema } from './disposiciones.schema.js';

const usuarioId = (req) => req.usuario?.email || req.usuario?._id || null;

// Express 5 expone req.query como solo lectura: se valida con zod aquí mismo.
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

export const crear = asyncHandler(async (req, res) => {
  const { disposicion, muestra } = await service.registrar(req.body, usuarioId(req));
  res.status(201).json({ ok: true, mensaje: 'Disposición registrada', disposicion, muestra });
});

export const listar = asyncHandler(async (req, res) => {
  const datos = parsear(listarDisposicionesSchema, req.query);
  const muestra = datos.muestraId || datos.muestra;
  if (muestra && !isValidObjectId(muestra)) {
    throw new AppError('El identificador de muestra no es válido', 400);
  }
  const filtro = {};
  if (muestra) filtro.muestraId = muestra;
  if (datos.tipo) filtro.tipo = datos.tipo;
  res.json({ ok: true, disposiciones: await service.listar(filtro) });
});

export const obtener = asyncHandler(async (req, res) => {
  res.json({ ok: true, disposicion: await service.obtener(req.params.id) });
});
