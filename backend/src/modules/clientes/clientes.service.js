// Lógica de negocio de clientes.
import { Cliente } from './clientes.model.js';
import { AppError } from '../../utils/AppError.js';
import { registrarAuditoria } from '../../middlewares/audit.js';

export async function listar() {
  return Cliente.find().sort({ createdAt: -1 });
}

export async function obtener(id) {
  const c = await Cliente.findById(id);
  if (!c) throw new AppError('Cliente no encontrado', 404);
  return c;
}

export async function crear(datos, usuario) {
  const existe = await Cliente.findOne({ numeroDocumento: datos.numeroDocumento });
  if (existe) throw new AppError('Ya existe un cliente con ese documento', 400);
  const cliente = await Cliente.create(datos);
  await registrarAuditoria({ entidad: 'clientes', entidadId: String(cliente._id), accion: 'crear', despues: cliente.toObject(), usuario });
  return cliente;
}

export async function actualizar(id, datos, usuario) {
  const cliente = await Cliente.findById(id);
  if (!cliente) throw new AppError('Cliente no encontrado', 404);
  const antes = cliente.toObject();
  Object.assign(cliente, datos);
  await cliente.save();
  await registrarAuditoria({ entidad: 'clientes', entidadId: String(id), accion: 'actualizar', antes, despues: cliente.toObject(), usuario });
  return cliente;
}

export async function eliminar(id, usuario) {
  const cliente = await Cliente.findById(id);
  if (!cliente) throw new AppError('Cliente no encontrado', 404);
  const antes = cliente.toObject();
  await cliente.softDelete(usuario);
  await registrarAuditoria({ entidad: 'clientes', entidadId: String(id), accion: 'eliminar_logico', antes, usuario });
  return cliente;
}
