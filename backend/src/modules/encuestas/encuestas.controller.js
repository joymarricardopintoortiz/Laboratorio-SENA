// Controladores HTTP de encuestas (sin Mongoose directo).
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './encuestas.service.js';

// ---------------------------------------------------------------- uso interno
export const listar = asyncHandler(async (req, res) => {
  const filtro = {};
  if (req.query.muestraId) filtro.muestraId = req.query.muestraId;
  if (req.query.estado) filtro.estado = req.query.estado;
  res.json({ ok: true, encuestas: await service.listar(filtro) });
});

export const promedio = asyncHandler(async (req, res) => {
  const resumen = await service.promedio(req.query.muestraId || null);
  res.json({ ok: true, resumen });
});

// ---------------------------------------------------------------- uso público
// GET /api/publico/encuestas/:token  → ¿está pendiente? + preguntas
export const ver = asyncHandler(async (req, res) => {
  res.json({ ok: true, encuesta: await service.vistaPublica(req.params.token) });
});

// POST /api/publico/encuestas/:token → respuesta única (409 si ya respondida)
export const responder = asyncHandler(async (req, res) => {
  await service.responder(req.params.token, req.body, req.ip);
  res.status(201).json({
    ok: true,
    mensaje: 'Gracias, tu respuesta fue registrada.',
    encuesta: await service.vistaPublica(req.params.token),
  });
});
