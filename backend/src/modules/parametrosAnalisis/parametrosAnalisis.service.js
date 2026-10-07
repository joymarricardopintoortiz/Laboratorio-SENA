// Lógica de negocio del catálogo de parámetros.
import { ParametroAnalisis } from './parametrosAnalisis.model.js';
import { AppError } from '../../utils/AppError.js';
import { registrarAuditoria } from '../../middlewares/audit.js';

export const listar = () => ParametroAnalisis.find().sort({ nombre: 1 });

export async function obtener(id) {
  const p = await ParametroAnalisis.findById(id);
  if (!p) throw new AppError('Parámetro no encontrado', 404);
  return p;
}

export async function crear(datos, usuario) {
  const existe = await ParametroAnalisis.findOne({ nombre: datos.nombre });
  if (existe) throw new AppError('Ya existe un parámetro con ese nombre', 400);
  const p = await ParametroAnalisis.create(datos);
  await registrarAuditoria({ entidad: 'parametrosAnalisis', entidadId: String(p._id), accion: 'crear', despues: p.toObject(), usuario });
  return p;
}

export async function actualizar(id, datos, usuario) {
  const p = await ParametroAnalisis.findById(id);
  if (!p) throw new AppError('Parámetro no encontrado', 404);
  const antes = p.toObject();
  Object.assign(p, datos);
  await p.save();
  await registrarAuditoria({ entidad: 'parametrosAnalisis', entidadId: String(id), accion: 'actualizar', antes, despues: p.toObject(), usuario });
  return p;
}

export async function eliminar(id, usuario) {
  const p = await ParametroAnalisis.findById(id);
  if (!p) throw new AppError('Parámetro no encontrado', 404);
  const antes = p.toObject();
  await p.softDelete(usuario);
  await registrarAuditoria({ entidad: 'parametrosAnalisis', entidadId: String(id), accion: 'eliminar_logico', antes, usuario });
  return p;
}
