// Controladores de la API pública (sin login, solo lectura por código).
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './publico.service.js';

// GET /api/publico/seguimiento/:codigoSeguimiento
export const seguimiento = asyncHandler(async (req, res) => {
  const seguimiento = await service.consultarSeguimiento(req.params.codigoSeguimiento);
  res.json({ ok: true, seguimiento });
});

// GET /api/publico/seguimiento/:codigoSeguimiento/informe (PDF protegido por
// el mismo código de seguimiento y por el rate limit).
export const descargarInforme = asyncHandler(async (req, res) => {
  const { archivo, nombreArchivo } = await service.descargarInformePublico(req.params.codigoSeguimiento);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.setHeader('Content-Length', String(archivo.length));
  res.status(200).end(archivo);
});

// POST /api/publico/seguimiento/:codigoSeguimiento/incidencias/:incidenciaId/respuesta
export const responder = asyncHandler(async (req, res) => {
  const respuesta = await service.responderIncidencia({
    codigoSeguimiento: req.params.codigoSeguimiento,
    incidenciaId: req.params.incidenciaId,
    mensaje: req.body?.mensaje,
    archivos: req.files || [],
  });
  res.status(201).json({ ok: true, mensaje: 'Respuesta registrada. El laboratorio la revisará próximamente.', respuesta });
});
