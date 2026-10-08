// Lógica de negocio de muestras (RF-015 a RF-039).
import crypto from 'node:crypto';
import { Muestra } from './muestras.model.js';
import { Solicitud } from '../solicitudes/solicitudes.model.js';
import { Pago } from '../pagos/pagos.model.js';
import { ParametroAnalisis } from '../parametrosAnalisis/parametrosAnalisis.model.js';
import { AppError } from '../../utils/AppError.js';
import { registrarAuditoria } from '../../middlewares/audit.js';
import { siguiente } from '../secuencias/secuencias.service.js';
import { generarRotuloPDF } from '../../services/pdf.service.js';
import { registrarEvento, historial } from '../../services/trazabilidad.service.js';
import { registrarCambio } from '../cambiosFecha/cambiosFecha.service.js';
import { AnalisisMuestra } from '../analisisMuestras/analisisMuestras.model.js';
import {
  notificarCambioEstado,
  notificarCambioFecha,
  notificarResultados,
} from '../notificaciones/notificaciones.service.js';

// Transiciones permitidas de estado.
const TRANSICIONES = {
  ingresada: ['en_proceso'],
  en_proceso: ['en_analisis'],
  en_analisis: ['resultados_validados', 'en_proceso'], // en_proceso = repetir (con motivo)
  resultados_validados: ['cerrada'],
  cerrada: [],
  rechazada: [],
  en_almacen: [],
  devuelta: [],
  desechada: [],
};

// Cambio manual de estado (admin/encargado) con validación de transición.
export async function cambiarEstado(id, { estadoNuevo, motivo }, usuario) {
  const muestra = await Muestra.findById(id);
  if (!muestra) throw new AppError('Muestra no encontrada', 404);
  if (muestra.estadoRecepcion === 'rechazada' || muestra.estado === 'rechazada') {
    throw new AppError('Una muestra rechazada no puede avanzar de estado', 400);
  }
  const permitidos = TRANSICIONES[muestra.estado] || [];
  if (!permitidos.includes(estadoNuevo)) {
    throw new AppError(`Transición no permitida: ${muestra.estado} → ${estadoNuevo}`, 400);
  }
  // en_analisis → en_proceso es repetición y exige motivo.
  if (muestra.estado === 'en_analisis' && estadoNuevo === 'en_proceso' && !motivo?.trim()) {
    throw new AppError('Debes indicar un motivo para repetir el proceso', 400);
  }

  const antes = muestra.toObject();
  const estadoAnterior = muestra.estado;
  muestra.estado = estadoNuevo;
  await muestra.save();

  await registrarEvento({ muestraId: muestra._id, tipoEvento: 'cambio_estado', estadoAnterior, estadoNuevo, descripcion: motivo || '', usuarioId: usuario, visibleCliente: true });
  await registrarAuditoria({ entidad: 'muestras', entidadId: String(id), accion: 'cambio_estado', antes, despues: muestra.toObject(), usuario });
  // RF-107: aviso al cliente sobre el cambio de etapa (no rompe la operación).
  await notificarCambioEstado({ muestra, estadoAnterior, estadoNuevo });
  return muestra;
}

export const obtenerHistorial = (id) => historial(id);

// Observación interna (visibleCliente=false por defecto).
export async function agregarObservacion(id, { descripcion, visibleCliente = false }, usuario) {
  const muestra = await Muestra.findById(id);
  if (!muestra) throw new AppError('Muestra no encontrada', 404);
  await registrarEvento({ muestraId: muestra._id, tipoEvento: 'observacion', descripcion, visibleCliente, usuarioId: usuario });
  await registrarAuditoria({ entidad: 'muestras', entidadId: String(id), accion: 'observacion', despues: { descripcion, visibleCliente }, usuario });
  return muestra;
}

// Corrige datos de la muestra: evento + auditoría con antes/después.
export async function corregir(id, datos, usuario) {
  const muestra = await Muestra.findById(id);
  if (!muestra) throw new AppError('Muestra no encontrada', 404);
  const antes = muestra.toObject();
  const permitidos = ['nombreMuestra', 'descripcion', 'verificacionFisica', 'fechaEstimadaEntrega', 'fechaLimiteConservacion'];
  for (const campo of permitidos) {
    if (datos[campo] !== undefined) muestra[campo] = datos[campo];
  }
  await muestra.save();
  await registrarEvento({ muestraId: muestra._id, tipoEvento: 'correccion', descripcion: datos.descripcionCorreccion || 'Corrección de datos', usuarioId: usuario });
  await registrarAuditoria({ entidad: 'muestras', entidadId: String(id), accion: 'correccion', antes, despues: muestra.toObject(), usuario });
  return muestra;
}

// Inicio formal: bloqueado si la solicitud requiere pago y no está confirmado.
export async function iniciar(id, usuario) {
  const muestra = await Muestra.findById(id).populate('solicitudId');
  if (!muestra) throw new AppError('Muestra no encontrada', 404);
  const solicitud = muestra.solicitudId;
  if (solicitud && solicitud.requierePago) {
    const pago = await Pago.findOne({ solicitud: solicitud._id, estado: 'confirmado' });
    if (!pago) throw new AppError('No se puede iniciar: la solicitud requiere pago y no está confirmado', 400);
  }
  const antes = muestra.toObject();
  muestra.fechaInicio = new Date();
  await muestra.save();
  await registrarEvento({ muestraId: muestra._id, tipoEvento: 'inicio', descripcion: 'Inicio formal del proceso', usuarioId: usuario, visibleCliente: true });
  await registrarAuditoria({ entidad: 'muestras', entidadId: String(id), accion: 'iniciar', antes, despues: muestra.toObject(), usuario });
  return muestra;
}

// Cierre: solo si todos los parámetros seleccionados tienen resultado validado.
export async function cerrar(id, usuario) {
  const muestra = await Muestra.findById(id);
  if (!muestra) throw new AppError('Muestra no encontrada', 404);
  const parametros = muestra.parametrosSeleccionados.map(String);
  if (parametros.length === 0) throw new AppError('La muestra no tiene parámetros seleccionados', 400);

  for (const parametroId of parametros) {
    const validado = await AnalisisMuestra.findOne({ muestraId: muestra._id, parametroId, estado: 'validado' });
    if (!validado) throw new AppError('No se puede cerrar: hay parámetros sin resultado validado', 400);
  }

  const antes = muestra.toObject();
  muestra.estado = 'cerrada';
  muestra.fechaCierre = new Date();
  await muestra.save();
  await registrarEvento({ muestraId: muestra._id, tipoEvento: 'cierre', estadoNuevo: 'cerrada', descripcion: 'Proceso cerrado', usuarioId: usuario, visibleCliente: true });
  await registrarAuditoria({ entidad: 'muestras', entidadId: String(id), accion: 'cerrar', antes, despues: muestra.toObject(), usuario });
  // RF-109: al validar el cierre, los resultados quedan disponibles para el cliente.
  await notificarResultados({ muestra });
  return muestra;
}

// Cambia la fecha estimada de entrega: exige motivo y guarda historial.
export async function cambiarFechaEstimada(id, { fechaNueva, motivo }, usuario) {
  const muestra = await Muestra.findById(id);
  if (!muestra) throw new AppError('Muestra no encontrada', 404);
  if (!motivo?.trim()) throw new AppError('El motivo del cambio es obligatorio', 400);
  if (!fechaNueva) throw new AppError('La nueva fecha es obligatoria', 400);

  const antes = muestra.toObject();
  const fechaAnterior = muestra.fechaEstimadaEntrega;
  muestra.fechaEstimadaEntrega = new Date(fechaNueva);
  await muestra.save();

  await registrarCambio({ muestraId: muestra._id, fechaAnterior, fechaNueva: new Date(fechaNueva), motivo, usuarioId: usuario });
  await registrarEvento({ muestraId: muestra._id, tipoEvento: 'cambio_fecha', descripcion: `Fecha estimada: ${motivo}`, usuarioId: usuario, visibleCliente: true });
  await registrarAuditoria({ entidad: 'muestras', entidadId: String(id), accion: 'cambio_fecha', antes, despues: muestra.toObject(), usuario });
  // RF-108: aviso al cliente de la nueva fecha estimada.
  await notificarCambioFecha({ muestra, fechaAnterior, fechaNueva: muestra.fechaEstimadaEntrega, motivo });
  return muestra;
}


const codigoSeguimiento = () => crypto.randomBytes(16).toString('hex');

// Recepción de la muestra.
export async function recibir(datos, usuario) {
  const solicitud = await Solicitud.findById(datos.solicitudId);
  if (!solicitud) throw new AppError('La solicitud no existe', 400);

  // Solicitudes externas requieren pago confirmado.
  if (solicitud.requierePago !== false && solicitud.tipoCliente === 'externo') {
    const pago = await Pago.findOne({ solicitud: solicitud._id, estado: 'confirmado' });
    if (!pago) throw new AppError('No se puede recibir la muestra: la solicitud externa no tiene el pago confirmado', 400);
  }

  const unidad = datos.tipoFisico === 'solido' ? 'g' : 'ml';
  const advertencia = datos.cantidad < 300
    ? `ADVERTENCIA: la cantidad (${datos.cantidad} ${unidad}) es menor a 300 ${unidad}. Se registra de todas formas.`
    : null;

  const muestra = await Muestra.create({
    solicitudId: solicitud._id,
    clienteId: solicitud.cliente,
    nombreMuestra: datos.nombreMuestra,
    descripcion: datos.descripcion || '',
    tipoFisico: datos.tipoFisico,
    cantidad: datos.cantidad,
    unidad,
    verificacionFisica: datos.verificacionFisica ?? false,
    estadoRecepcion: 'pendiente',
    fechaRecepcion: new Date(),
  });

  await registrarAuditoria({ entidad: 'muestras', entidadId: String(muestra._id), accion: 'recibir', despues: muestra.toObject(), usuario });
  await registrarEvento({ muestraId: muestra._id, tipoEvento: 'recepcion', descripcion: `Muestra recibida: ${muestra.nombreMuestra}`, usuarioId: usuario });
  return { muestra, advertencia };
}

// Aceptar: genera codigo y codigoSeguimiento (solo aquí).
export async function aceptar(id, usuario) {
  const muestra = await Muestra.findById(id);
  if (!muestra) throw new AppError('Muestra no encontrada', 404);
  if (muestra.estadoRecepcion === 'aceptada') throw new AppError('La muestra ya fue aceptada', 400);

  const antes = muestra.toObject();
  const year = new Date().getFullYear();
  const consecutivo = await siguiente(`muestras-${year}`);
  muestra.codigo = `${String(consecutivo).padStart(4, '0')}-${year}`;
  muestra.codigoSeguimiento = codigoSeguimiento();
  muestra.estadoRecepcion = 'aceptada';
  muestra.estado = 'ingresada';
  await muestra.save();

  await registrarAuditoria({ entidad: 'muestras', entidadId: String(id), accion: 'aceptar', antes, despues: muestra.toObject(), usuario });
  await registrarEvento({ muestraId: muestra._id, tipoEvento: 'ingreso', estadoNuevo: 'ingresada', descripcion: `Muestra aceptada con código ${muestra.codigo}`, usuarioId: usuario });
  return muestra;
}

// Rechazar: exige motivo, no genera código, se conserva.
export async function rechazar(id, motivoRechazo, usuario) {
  const muestra = await Muestra.findById(id);
  if (!muestra) throw new AppError('Muestra no encontrada', 404);
  if (!motivoRechazo?.trim()) throw new AppError('El motivo de rechazo es obligatorio', 400);

  const antes = muestra.toObject();
  muestra.estadoRecepcion = 'rechazada';
  muestra.motivoRechazo = motivoRechazo;
  muestra.estado = 'rechazada';
  await muestra.save();

  await registrarAuditoria({ entidad: 'muestras', entidadId: String(id), accion: 'rechazar', antes, despues: muestra.toObject(), usuario });
  await registrarEvento({ muestraId: muestra._id, tipoEvento: 'rechazo', estadoNuevo: 'rechazada', descripcion: `Rechazada: ${motivoRechazo}`, usuarioId: usuario });
  return muestra;
}

// Selección de parámetros desde el catálogo.
export async function seleccionarParametros(id, parametrosIds, usuario) {
  const muestra = await Muestra.findById(id);
  if (!muestra) throw new AppError('Muestra no encontrada', 404);
  const antes = muestra.toObject();

  const validos = await ParametroAnalisis.find({ _id: { $in: parametrosIds } });
  if (validos.length !== parametrosIds.length) throw new AppError('Alguno de los parámetros no existe en el catálogo', 400);

  muestra.parametrosSeleccionados = parametrosIds;
  await muestra.save();
  await registrarAuditoria({ entidad: 'muestras', entidadId: String(id), accion: 'seleccionar_parametros', antes, despues: muestra.toObject(), usuario });
  return muestra;
}

// Rótulo: genera PDF con pdf.service, lo guarda en la BD y marca rotuloImpreso.
export async function generarRotulo(id, usuario) {
  const muestra = await Muestra.findById(id).populate('parametrosSeleccionados', 'nombre');
  if (!muestra) throw new AppError('Muestra no encontrada', 404);
  if (!muestra.codigo) throw new AppError('La muestra aún no tiene código (debe estar aceptada)', 400);

  const antes = muestra.toObject();
  const pdf = await generarRotuloPDF({
    codigo: muestra.codigo,
    nombreMuestra: muestra.nombreMuestra,
    parametros: muestra.parametrosSeleccionados.map((p) => p.nombre),
    fechaRecepcion: muestra.fechaRecepcion,
  });

  muestra.rotuloPdf = pdf;
  muestra.rotuloImpreso = true;
  await muestra.save();

  await registrarAuditoria({ entidad: 'muestras', entidadId: String(id), accion: 'generar_rotulo', antes, despues: muestra.toObject(), usuario });
  await registrarEvento({ muestraId: muestra._id, tipoEvento: 'rotulo', descripcion: 'Rótulo generado e impreso', usuarioId: usuario });
  return muestra;
}

// Actualiza la ubicación física y clasificación.
export async function actualizarUbicacion(id, { ubicacion, clasificacion }, usuario) {
  const muestra = await Muestra.findById(id);
  if (!muestra) throw new AppError('Muestra no encontrada', 404);
  const antes = muestra.toObject();
  muestra.ubicacionActual = { ubicacion, clasificacion, actualizadoEn: new Date() };
  await muestra.save();
  await registrarAuditoria({ entidad: 'muestras', entidadId: String(id), accion: 'actualizar_ubicacion', antes, despues: muestra.toObject(), usuario });
  await registrarEvento({ muestraId: muestra._id, tipoEvento: 'ubicacion', descripcion: `Ubicación: ${ubicacion} (${clasificacion})`, ubicacion, usuarioId: usuario });
  return muestra;
}

// Listado de inventario con filtros y orden de llegada.
export async function listarInventario({ estado, codigo, desde, hasta, orden = 'reciente' }) {
  const filtro = {};
  if (estado) filtro.estado = estado;
  if (codigo) filtro.codigo = codigo;
  if (desde || hasta) {
    filtro.fechaRecepcion = {};
    if (desde) filtro.fechaRecepcion.$gte = new Date(desde);
    if (hasta) filtro.fechaRecepcion.$lte = new Date(hasta);
  }
  const sort = orden === 'llegada' ? { fechaRecepcion: 1 } : { fechaRecepcion: -1 };
  return Muestra.find(filtro).populate('solicitudId', 'estado prioridad').populate('clienteId', 'nombre email').sort(sort);
}

export async function obtener(id) {
  const m = await Muestra.findById(id)
    .populate('solicitudId')
    .populate('clienteId', 'nombre email')
    .populate('parametrosSeleccionados', 'nombre precio');
  if (!m) throw new AppError('Muestra no encontrada', 404);
  return m;
}

export async function obtenerConRotulo(id) {
  const m = await Muestra.findById(id).select('+rotuloPdf');
  if (!m) throw new AppError('Muestra no encontrada', 404);
  return m;
}

export async function actualizar(id, datos, usuario) {
  const muestra = await Muestra.findById(id);
  if (!muestra) throw new AppError('Muestra no encontrada', 404);
  const antes = muestra.toObject();
  Object.assign(muestra, datos);
  await muestra.save();
  await registrarAuditoria({ entidad: 'muestras', entidadId: String(id), accion: 'actualizar', antes, despues: muestra.toObject(), usuario });
  return muestra;
}

export async function eliminar(id, usuario) {
  const muestra = await Muestra.findById(id);
  if (!muestra) throw new AppError('Muestra no encontrada', 404);
  const antes = muestra.toObject();
  await muestra.softDelete(usuario);
  await registrarAuditoria({ entidad: 'muestras', entidadId: String(id), accion: 'eliminar_logico', antes, usuario });
  return muestra;
}
