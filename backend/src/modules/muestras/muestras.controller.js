// Controladores HTTP de muestras.
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './muestras.service.js';
import { AppError } from '../../utils/AppError.js';
import { historial as historialCambiosFecha } from '../cambiosFecha/cambiosFecha.service.js';

const usuarioId = (req) => req.usuario?.email || req.usuario?._id || null;

export const recibir = asyncHandler(async (req, res) => {
  const { muestra, advertencia } = await service.recibir(req.body, usuarioId(req));
  res.status(201).json({
    ok: true,
    mensaje: advertencia || 'Muestra recibida',
    advertencia,
    muestra,
  });
});

export const aceptar = asyncHandler(async (req, res) => {
  const muestra = await service.aceptar(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: 'Muestra aceptada', muestra });
});

export const rechazar = asyncHandler(async (req, res) => {
  const muestra = await service.rechazar(req.params.id, req.body.motivoRechazo, usuarioId(req));
  res.json({ ok: true, mensaje: 'Muestra rechazada', muestra });
});

export const seleccionarParametros = asyncHandler(async (req, res) => {
  const muestra = await service.seleccionarParametros(req.params.id, req.body.parametrosIds, usuarioId(req));
  res.json({ ok: true, mensaje: 'Parámetros asignados', muestra });
});

export const generarRotulo = asyncHandler(async (req, res) => {
  const muestra = await service.generarRotulo(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: 'Rótulo generado e impreso', muestra: { ...muestra.toObject(), rotuloPdf: undefined } });
});

export const descargarRotulo = asyncHandler(async (req, res) => {
  const muestra = await service.obtenerConRotulo(req.params.id);
  if (!muestra.rotuloPdf) throw new AppError('La muestra no tiene rótulo generado', 404);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="rotulo-${muestra.codigo || muestra._id}.pdf"` });
  res.send(muestra.rotuloPdf);
});

export const ubicacion = asyncHandler(async (req, res) => {
  const muestra = await service.actualizarUbicacion(req.params.id, req.body, usuarioId(req));
  res.json({ ok: true, mensaje: 'Ubicación actualizada', muestra });
});

export const listar = asyncHandler(async (req, res) => {
  const muestras = await service.listarInventario(req.query);
  res.json({ ok: true, muestras });
});

export const obtener = asyncHandler(async (req, res) => {
  res.json({ ok: true, muestra: await service.obtener(req.params.id) });
});

export const actualizar = asyncHandler(async (req, res) => {
  const muestra = await service.actualizar(req.params.id, req.body, usuarioId(req));
  res.json({ ok: true, mensaje: 'Muestra actualizada', muestra });
});

export const eliminar = asyncHandler(async (req, res) => {
  await service.eliminar(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: 'Muestra eliminada (borrado lógico)' });
});

export const cambiarEstado = asyncHandler(async (req, res) => {
  const muestra = await service.cambiarEstado(req.params.id, req.body, usuarioId(req));
  res.json({ ok: true, mensaje: 'Estado actualizado', muestra });
});

export const historial = asyncHandler(async (req, res) => {
  res.json({ ok: true, eventos: await service.obtenerHistorial(req.params.id) });
});

export const observacion = asyncHandler(async (req, res) => {
  await service.agregarObservacion(req.params.id, req.body, usuarioId(req));
  res.status(201).json({ ok: true, mensaje: 'Observación registrada' });
});

export const corregir = asyncHandler(async (req, res) => {
  const muestra = await service.corregir(req.params.id, req.body, usuarioId(req));
  res.json({ ok: true, mensaje: 'Corrección registrada', muestra });
});

export const iniciar = asyncHandler(async (req, res) => {
  const muestra = await service.iniciar(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: 'Proceso iniciado', muestra });
});

export const cerrar = asyncHandler(async (req, res) => {
  const muestra = await service.cerrar(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: 'Muestra cerrada', muestra });
});

export const cambiarFecha = asyncHandler(async (req, res) => {
  const muestra = await service.cambiarFechaEstimada(req.params.id, req.body, usuarioId(req));
  res.json({ ok: true, mensaje: 'Fecha estimada actualizada', muestra });
});

export const historialFechas = asyncHandler(async (req, res) => {
  res.json({ ok: true, cambios: await historialCambiosFecha(req.params.id) });
});
