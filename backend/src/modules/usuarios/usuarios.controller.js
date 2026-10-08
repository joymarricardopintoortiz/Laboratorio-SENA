// Controladores HTTP del módulo usuarios (sin Mongoose directo).
// Todas las rutas de este módulo son exclusivas del rol admin.
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './usuarios.service.js';

const responsable = (req) => req.usuario?.email || null;
const responsableId = (req) => req.usuario?._id || null;

export const listar = asyncHandler(async (req, res) => {
  res.json({ ok: true, usuarios: await service.listar() });
});

export const obtener = asyncHandler(async (req, res) => {
  res.json({ ok: true, usuario: await service.obtener(req.params.id) });
});

export const crear = asyncHandler(async (req, res) => {
  const usuario = await service.crear(req.body, responsable(req));
  res.status(201).json({ ok: true, mensaje: 'Usuario creado', usuario });
});

export const actualizar = asyncHandler(async (req, res) => {
  const usuario = await service.actualizar(req.params.id, req.body, responsable(req), responsableId(req));
  res.json({ ok: true, mensaje: 'Usuario actualizado', usuario });
});

export const cambiarEstado = asyncHandler(async (req, res) => {
  const { activo } = req.body;
  const usuario = await service.activarDesactivar(req.params.id, activo, responsable(req), responsableId(req));
  res.json({
    ok: true,
    mensaje: activo ? 'Usuario activado' : 'Usuario desactivado (ya no puede iniciar sesión)',
    usuario,
  });
});

export const eliminar = asyncHandler(async (req, res) => {
  await service.eliminar(req.params.id, responsable(req), responsableId(req));
  res.json({ ok: true, mensaje: 'Usuario eliminado (borrado lógico)' });
});
