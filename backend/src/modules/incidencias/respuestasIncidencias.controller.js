// Controladores HTTP de respuestasIncidencias.
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './respuestasIncidencias.service.js';

const usuarioId = (req) => req.usuario?.email || req.usuario?._id || null;

export const crear = asyncHandler(async (req, res) => {
  const respuesta = await service.registrar(req.params.id, { tipoUsuario: req.body.tipoUsuario || 'interno', mensaje: req.body.mensaje }, req.files, usuarioId(req));
  res.status(201).json({ ok: true, mensaje: 'Respuesta registrada', respuesta });
});

export const porIncidencia = asyncHandler(async (req, res) => {
  res.json({ ok: true, respuestas: await service.porIncidencia(req.params.id) });
});

export const descargar = asyncHandler(async (req, res) => {
  const archivo = await service.descargarArchivo(req.params.rid, Number(req.params.index));
  res.set({ 'Content-Type': archivo.tipoMime, 'Content-Disposition': `attachment; filename="${archivo.nombre}"` });
  res.send(archivo.contenido);
});
