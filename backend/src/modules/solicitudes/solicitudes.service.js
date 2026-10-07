// Lógica de negocio de solicitudes.
import { Solicitud } from './solicitudes.model.js';
import { Cliente } from '../clientes/clientes.model.js';
import { AppError } from '../../utils/AppError.js';
import { registrarAuditoria } from '../../middlewares/audit.js';

export async function listar() {
  return Solicitud.find().populate('cliente', 'nombre email tipoCliente').sort({ createdAt: -1 });
}

export async function obtener(id) {
  const s = await Solicitud.findById(id).populate('cliente', 'nombre email tipoCliente');
  if (!s) throw new AppError('Solicitud no encontrada', 404);
  return s;
}

export async function crear(datos, usuario) {
  const cliente = await Cliente.findById(datos.cliente);
  if (!cliente) throw new AppError('El cliente no existe', 400);
  if (datos.atencionInmediata && !datos.motivoAtencionInmediata?.trim()) {
    throw new AppError('El motivo es obligatorio cuando hay atención inmediata', 400);
  }
  const solicitud = await Solicitud.create({
    ...datos,
    requierePago: datos.tipoCliente === 'externo',
  });
  await registrarAuditoria({ entidad: 'solicitudes', entidadId: String(solicitud._id), accion: 'crear', despues: solicitud.toObject(), usuario });
  return solicitud;
}

export async function actualizar(id, datos, usuario) {
  const solicitud = await Solicitud.findById(id);
  if (!solicitud) throw new AppError('Solicitud no encontrada', 404);
  const antes = solicitud.toObject();
  if (datos.atencionInmediata && !datos.motivoAtencionInmediata?.trim() && !solicitud.motivoAtencionInmediata) {
    throw new AppError('El motivo es obligatorio cuando hay atención inmediata', 400);
  }
  Object.assign(solicitud, datos);
  await solicitud.save();
  await registrarAuditoria({ entidad: 'solicitudes', entidadId: String(id), accion: 'actualizar', antes, despues: solicitud.toObject(), usuario });
  return solicitud;
}

export async function eliminar(id, usuario) {
  const solicitud = await Solicitud.findById(id);
  if (!solicitud) throw new AppError('Solicitud no encontrada', 404);
  const antes = solicitud.toObject();
  await solicitud.softDelete(usuario);
  await registrarAuditoria({ entidad: 'solicitudes', entidadId: String(id), accion: 'eliminar_logico', antes, usuario });
  return solicitud;
}
