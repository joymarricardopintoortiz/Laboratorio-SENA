// Lógica de incidencias (RF-063 a RF-074).
import { Incidencia } from './incidencias.model.js';
import { Muestra } from '../muestras/muestras.model.js';
import { AppError } from '../../utils/AppError.js';
import { registrarAuditoria } from '../../middlewares/audit.js';
import { registrarEvento } from '../../services/trazabilidad.service.js';
import { registrarCambio } from '../cambiosFecha/cambiosFecha.service.js';
import { notificarIncidencia } from '../notificaciones/notificaciones.service.js';

export const listar = (filtro = {}) => Incidencia.find(filtro).sort({ fechaCreacion: -1 });

export async function obtener(id) {
  const i = await Incidencia.findById(id);
  if (!i) throw new AppError('Incidencia no encontrada', 404);
  return i;
}

// Vista segura para cliente: NUNCA incluye observaciones internas.
export function vistaPublica(incidencia) {
  const obj = incidencia.toObject ? incidencia.toObject() : incidencia;
  delete obj.observacionesInternas;
  delete obj.creadaPor;
  delete obj.revisadaPor;
  obj.acciones = (obj.acciones || []).map((a) => ({ tipo: a.tipo, fecha: a.fecha, comentario: a.comentario }));
  return obj;
}

export async function crear(datos, usuario) {
  const muestra = await Muestra.findById(datos.muestraId);
  if (!muestra) throw new AppError('La muestra no existe', 400);

  // Retrasos: exigen nuevaFechaEstimada y motivo.
  if (datos.tipo === 'demora' && (!datos.nuevaFechaEstimada || !datos.motivo?.trim())) {
    throw new AppError('La incidencia de demora exige nuevaFechaEstimada y motivo', 400);
  }

  const requiereRespuesta = datos.tipo === 'requiere_accion_cliente' ? true : !!datos.requiereRespuesta;
  const estado = datos.tipo === 'requiere_accion_cliente' ? 'esperando_cliente' : 'abierta';

  const incidencia = await Incidencia.create({
    muestraId: muestra._id,
    tipo: datos.tipo,
    titulo: datos.titulo,
    descripcion: datos.descripcion || '',
    observacionesInternas: datos.observacionesInternas || '',
    visibleCliente: datos.visibleCliente ?? (datos.tipo !== 'informativa'),
    requiereRespuesta,
    estado,
    nuevaFechaEstimada: datos.tipo === 'demora' ? new Date(datos.nuevaFechaEstimada) : null,
    motivo: datos.motivo || '',
    creadaPor: usuario,
    acciones: [{ tipo: 'creada', usuario, fecha: new Date(), comentario: datos.titulo }],
  });

  // Demora: actualiza la fecha estimada de la muestra (vía cambiosFecha) y evento visible.
  if (datos.tipo === 'demora') {
    const fechaAnterior = muestra.fechaEstimadaEntrega;
    muestra.fechaEstimadaEntrega = new Date(datos.nuevaFechaEstimada);
    await muestra.save();
    await registrarCambio({ muestraId: muestra._id, fechaAnterior, fechaNueva: new Date(datos.nuevaFechaEstimada), motivo: datos.motivo, usuarioId: usuario });
    await registrarEvento({ muestraId: muestra._id, tipoEvento: 'cambio_fecha', descripcion: `Incidencia de demora: ${datos.motivo}`, usuarioId: usuario, visibleCliente: true });
    incidencia.acciones.push({ tipo: 'demora_fecha', usuario, fecha: new Date(), comentario: datos.motivo });
    await incidencia.save();
  }
  // RF-072: NO se cambia el estado de la muestra automáticamente.

  await registrarAuditoria({ entidad: 'incidencias', entidadId: String(incidencia._id), accion: 'crear', despues: incidencia.toObject(), usuario });
  await registrarEvento({ muestraId: muestra._id, tipoEvento: 'observacion', descripcion: `Incidencia (${datos.tipo}): ${datos.titulo}`, usuarioId: usuario, visibleCliente: incidencia.visibleCliente });
  await notificarIncidencia({ incidencia, muestra, accion: 'creada' });
  return incidencia;
}

export async function actualizar(id, datos, usuario) {
  const incidencia = await Incidencia.findById(id);
  if (!incidencia) throw new AppError('Incidencia no encontrada', 404);
  const antes = incidencia.toObject();
  const permitidos = ['titulo', 'descripcion', 'observacionesInternas', 'visibleCliente', 'estado'];
  for (const c of permitidos) if (datos[c] !== undefined) incidencia[c] = datos[c];
  incidencia.acciones.push({ tipo: 'actualizada', usuario, fecha: new Date(), comentario: '' });
  await incidencia.save();
  await registrarAuditoria({ entidad: 'incidencias', entidadId: String(id), accion: 'actualizar', antes, despues: incidencia.toObject(), usuario });
  return incidencia;
}

export async function aprobar(id, usuario) {
  const incidencia = await Incidencia.findById(id);
  if (!incidencia) throw new AppError('Incidencia no encontrada', 404);
  if (!incidencia.requiereRespuesta && incidencia.tipo !== 'requiere_accion_cliente') {
    throw new AppError('Solo se pueden aprobar incidencias que requieren decisión', 400);
  }
  const antes = incidencia.toObject();
  incidencia.estado = 'aprobada';
  incidencia.revisadaPor = usuario;
  incidencia.acciones.push({ tipo: 'aprobada', usuario, fecha: new Date(), comentario: '' });
  await incidencia.save();
  await registrarAuditoria({ entidad: 'incidencias', entidadId: String(id), accion: 'aprobar', antes, despues: incidencia.toObject(), usuario });
  await registrarEvento({ muestraId: incidencia.muestraId, tipoEvento: 'observacion', descripcion: `Incidencia aprobada: ${incidencia.titulo}`, usuarioId: usuario, visibleCliente: incidencia.visibleCliente });
  await notificarIncidencia({ incidencia, accion: 'aprobada' });
  return incidencia;
}

export async function cerrar(id, motivo, usuario) {
  const incidencia = await Incidencia.findById(id);
  if (!incidencia) throw new AppError('Incidencia no encontrada', 404);
  if (incidencia.estado === 'esperando_cliente' && !motivo?.trim()) {
    throw new AppError('Para cerrar una incidencia esperando al cliente debes indicar un motivo', 400);
  }
  const antes = incidencia.toObject();
  incidencia.estado = 'cerrada';
  incidencia.fechaCierre = new Date();
  incidencia.acciones.push({ tipo: 'cerrada', usuario, fecha: new Date(), comentario: motivo || '' });
  await incidencia.save();
  await registrarAuditoria({ entidad: 'incidencias', entidadId: String(id), accion: 'cerrar', antes, despues: incidencia.toObject(), usuario });
  return incidencia;
}

export async function eliminar(id, usuario) {
  const incidencia = await Incidencia.findById(id);
  if (!incidencia) throw new AppError('Incidencia no encontrada', 404);
  const antes = incidencia.toObject();
  await incidencia.softDelete(usuario);
  await registrarAuditoria({ entidad: 'incidencias', entidadId: String(id), accion: 'eliminar_logico', antes, usuario });
  return incidencia;
}
