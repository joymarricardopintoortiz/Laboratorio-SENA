// Controladores HTTP de informes (sin Mongoose directo).
import { isValidObjectId } from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import * as service from './informes.service.js';
import { listarInformesSchema } from './informes.schema.js';

const usuarioId = (req) => req.usuario?.email || req.usuario?._id || null;

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

function idValido(id, mensaje = 'Identificador no válido') {
  if (!isValidObjectId(id)) throw new AppError(mensaje, 400);
}

export const listar = asyncHandler(async (req, res) => {
  const datos = parsear(listarInformesSchema, req.query);
  const muestra = datos.muestraId || datos.muestra;
  if (muestra) idValido(muestra, 'El identificador de muestra no es válido');

  const filtro = {};
  if (muestra) filtro.muestraId = muestra;
  if (datos.estado) filtro.estado = datos.estado;

  res.json({ ok: true, informes: await service.listar(filtro) });
});

export const generar = asyncHandler(async (req, res) => {
  idValido(req.body.muestraId, 'Identificador de muestra no válido');
  const informe = await service.generar(req.body.muestraId, usuarioId(req));
  res.status(201).json({
    ok: true,
    mensaje: `Informe ${informe.numeroInforme} generado`,
    informe,
  });
});

export const regenerar = asyncHandler(async (req, res) => {
  idValido(req.params.id, 'Identificador de informe no válido');
  const { informe, anterior } = await service.regenerar(req.params.id, usuarioId(req));
  res.status(201).json({
    ok: true,
    mensaje: `Informe regenerado como versión ${informe.version} (se conserva ${anterior.numeroInforme})`,
    informe,
    historial: [anterior, informe].map((i) => ({
      numeroInforme: i.numeroInforme,
      version: i.version,
      estado: i.estado,
      fechaGeneracion: i.fechaGeneracion,
    })),
  });
});

export const disponible = asyncHandler(async (req, res) => {
  idValido(req.params.id, 'Identificador de informe no válido');
  const informe = await service.marcarDisponible(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: `Informe ${informe.numeroInforme} disponible`, informe });
});

export const enviar = asyncHandler(async (req, res) => {
  idValido(req.params.id, 'Identificador de informe no válido');
  const { informe, notificacion } = await service.enviar(req.params.id, usuarioId(req), {
    conAdjunto: req.body?.conAdjunto !== false,
  });
  res.json({
    ok: true,
    mensaje: `Informe ${informe.numeroInforme} enviado al cliente`,
    informe,
    notificacion,
  });
});

export const descargar = asyncHandler(async (req, res) => {
  idValido(req.params.id, 'Identificador de informe no válido');
  const informe = await service.descargar(req.params.id);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${informe.numeroInforme}.pdf"`);
  res.setHeader('Content-Length', String(informe.archivo.length));
  res.status(200).end(informe.archivo);
});
