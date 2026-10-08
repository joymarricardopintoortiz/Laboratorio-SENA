// Lógica de facturas (RF-113 a RF-119).
// - Solo se factura un pago CONFIRMADO.
// - Factus solo en SANDBOX o MODO SIMULADO; jamás producción ni DIAN.
// - Si el proveedor falla, la factura queda en "error" y se puede reintentar
//   sin que se rompa el resto del sistema.
import { Factura, ESTADOS_FACTURA } from './facturas.model.js';
import { Solicitud } from '../solicitudes/solicitudes.model.js';
import { Pago } from '../pagos/pagos.model.js';
import { AppError } from '../../utils/AppError.js';
import { registrarAuditoria } from '../../middlewares/audit.js';
import { siguiente } from '../secuencias/secuencias.service.js';
import * as factus from '../../services/factus.service.js';
import { crearNotificacion } from '../notificaciones/notificaciones.service.js';
import { env } from '../../config/env.js';

const ESTADOS_INVALIDOS = ['pendiente'];

async function cargarSolicitud(solicitudId) {
  const solicitud = await Solicitud.findById(solicitudId).populate('cliente');
  if (!solicitud) throw new AppError('La solicitud no existe', 404);
  return solicitud;
}

function datosCliente(solicitud) {
  const cliente = solicitud.cliente;
  if (!cliente) return null;
  return {
    nombre: cliente.nombre,
    tipoDocumento: cliente.tipoDocumento,
    numeroDocumento: cliente.numeroDocumento,
    email: cliente.email,
    telefono: cliente.telefono || '',
    direccion: cliente.direccion || '',
    tipoCliente: cliente.tipoCliente,
  };
}

async function guardarError(factura, error, usuario) {
  const motivo = error?.message || 'Error desconocido al generar la factura';
  const antes = factura.toObject();
  factura.estado = 'error';
  factura.documento = { error: motivo, fecha: new Date().toISOString(), modo: factus.detectarModo() };
  factura.historialEstados.push({ estado: 'error', usuario, fecha: new Date(), motivo });
  await factura.save();

  await registrarAuditoria({
    entidad: 'facturas',
    entidadId: String(factura._id),
    accion: 'error',
    antes,
    despues: factura.toObject(),
    usuario,
  });
  return factura;
}

export const listar = (filtro = {}) => Factura.find(filtro)
  .populate('solicitudId', 'estado tipoCliente descripcion')
  .populate('pagoId', 'referencia monto estado')
  .sort({ createdAt: -1 });

export async function obtener(id) {
  const factura = await Factura.findById(id)
    .populate('solicitudId', 'estado tipoCliente descripcion cliente')
    .populate('pagoId', 'referencia monto estado');
  if (!factura) throw new AppError('Factura no encontrada', 404);
  return factura;
}

// RF-114: genera la factura. Bloquea pagos no confirmados y URL de producción.
export async function generar({ solicitudId, pagoId = null }, usuario) {
  // 1. Seguridad primero: jamás se habla con producción ni con la DIAN.
  //    Se valida ANTES de tocar la base para que el rechazo sea inmediato.
  factus.validarUrlSegura(env.FACTUS_BASE_URL || '');

  const solicitud = await cargarSolicitud(solicitudId);

  const filtroPago = pagoId
    ? { _id: pagoId, solicitud: solicitud._id }
    : { solicitud: solicitud._id };
  const pago = await Pago.findOne(filtroPago);
  if (!pago) throw new AppError('No se encontró un pago para esta solicitud', 404);
  if (pago.estado !== 'confirmado') {
    throw new AppError('Solo se puede facturar un pago confirmado: el pago de esta solicitud está en estado "' + pago.estado + '"', 400);
  }

  const existente = await Factura.findOne({ solicitudId: solicitud._id, estado: { $ne: 'anulada' } });
  if (existente) {
    throw new AppError(
      `La solicitud ya tiene la factura ${existente.numero} en estado "${existente.estado}". Usa el reintento si está en error o anúlala antes de generar otra.`,
      400
    );
  }

  const anio = new Date().getFullYear();
  const consecutivo = await siguiente(`facturas-${anio}`);
  const numero = `${String(consecutivo).padStart(4, '0')}-${anio}`;

  let factura = await Factura.create({
    solicitudId: solicitud._id,
    pagoId: pago._id,
    numero,
    valorTotal: pago.monto,
    estado: 'pendiente',
    generadaPor: usuario,
    historialEstados: [
      { estado: 'pendiente', usuario, fecha: new Date(), motivo: 'Creación de la factura' },
    ],
  });

  const conceptos = [
    { descripcion: solicitud.descripcion || 'Servicios de análisis de laboratorio', cantidad: 1, valor: pago.monto },
  ];

  try {
    const r = await factus.emitir({
      numero,
      valorTotal: pago.monto,
      cliente: datosCliente(solicitud),
      solicitud: {
        id: String(solicitud._id),
        tipoCliente: solicitud.tipoCliente,
        prioridad: solicitud.prioridad,
        estado: solicitud.estado,
      },
      conceptos,
    });

    factura.estado = 'generada';
    factura.documento = r.documento;
    factura.fechaGeneracion = new Date();
    factura.historialEstados.push({
      estado: 'generada',
      usuario,
      fecha: new Date(),
      motivo: r.modo === factus.MODO_SIMULADO ? 'Generada en modo simulado (sin proveedor)' : 'Generada en Factus sandbox',
    });
    await factura.save();

    await registrarAuditoria({
      entidad: 'facturas',
      entidadId: String(factura._id),
      accion: 'generar',
      despues: factura.toObject(),
      usuario,
    });
    return factura;
  } catch (error) {
    // RF-118: el fallo del proveedor deja la factura en "error" y es reintentable.
    await guardarError(factura, error, usuario);
    throw new AppError(
      error?.message || 'No fue posible generar la factura',
      error?.status && error.status !== 500 ? error.status : 502,
      { facturaId: String(factura._id), numero: factura.numero, reintentable: true }
    );
  }
}

// RF-115: consulta en el proveedor (en modo simulado consulta lo almacenado).
export async function consultar(id, usuario) {
  const factura = await obtener(id);
  const r = await factus.consultar({ numero: factura.numero, documento: factura.documento });

  await registrarAuditoria({
    entidad: 'facturas',
    entidadId: String(factura._id),
    accion: 'consultar',
    despues: { numero: factura.numero, estado: factura.estado, modo: r.modo },
    usuario,
  });
  return { factura, consulta: r.consulta, modo: r.modo };
}

// RF-116: cambio de estado con motivo → historialEstados + auditoría.
export async function cambiarEstado(id, { estado, motivo }, usuario) {
  const factura = await obtener(id);
  if (!ESTADOS_FACTURA.includes(estado)) throw new AppError('Estado de factura no válido', 400);
  if (ESTADOS_INVALIDOS.includes(estado)) {
    throw new AppError('No se puede volver al estado "pendiente": una factura ya emitida no se reinicia', 400);
  }
  if (factura.estado === estado) {
    throw new AppError(`La factura ya está en estado "${estado}"`, 400);
  }

  const antes = factura.toObject();
  factura.estado = estado;
  factura.historialEstados.push({ estado, usuario, fecha: new Date(), motivo });
  await factura.save();

  await registrarAuditoria({
    entidad: 'facturas',
    entidadId: String(factura._id),
    accion: 'cambiar_estado',
    antes,
    despues: factura.toObject(),
    usuario,
  });
  return factura;
}

// RF-118: reintenta la emisión de una factura que quedó en "error".
export async function reintentar(id, usuario) {
  factus.validarUrlSegura(env.FACTUS_BASE_URL || '');

  const factura = await Factura.findById(id).populate('solicitudId').populate('pagoId');
  if (!factura) throw new AppError('Factura no encontrada', 404);
  if (factura.estado !== 'error') {
    throw new AppError(`Solo se pueden reintentar facturas en estado "error" (estado actual: ${factura.estado})`, 400);
  }

  const pago = await Pago.findById(factura.pagoId?._id || factura.pagoId);
  if (pago && pago.estado !== 'confirmado') {
    throw new AppError('El pago asociado ya no está confirmado: no se puede reintentar', 400);
  }

  const solicitud = await Solicitud.findById(factura.solicitudId?._id || factura.solicitudId).populate('cliente');

  try {
    const r = await factus.emitir({
      numero: factura.numero,
      valorTotal: factura.valorTotal,
      cliente: datosCliente(solicitud || {}),
      solicitud: solicitud
        ? { id: String(solicitud._id), tipoCliente: solicitud.tipoCliente, prioridad: solicitud.prioridad, estado: solicitud.estado }
        : null,
      conceptos: [{ descripcion: 'Servicios de análisis de laboratorio', cantidad: 1, valor: factura.valorTotal }],
    });

    const antes = factura.toObject();
    factura.estado = 'generada';
    factura.documento = r.documento;
    factura.fechaGeneracion = new Date();
    factura.historialEstados.push({
      estado: 'generada',
      usuario,
      fecha: new Date(),
      motivo: `Reintento exitoso (${r.modo})`,
    });
    await factura.save();

    await registrarAuditoria({
      entidad: 'facturas',
      entidadId: String(factura._id),
      accion: 'reintentar',
      antes,
      despues: factura.toObject(),
      usuario,
    });
    return factura;
  } catch (error) {
    await guardarError(factura, error, usuario);
    throw new AppError(
      error?.message || 'No fue posible reintentar la factura',
      error?.status && error.status !== 500 ? error.status : 502,
      { facturaId: String(factura._id), reintentable: true }
    );
  }
}

// RF-117: envía la factura al cliente por correo (no rompe el flujo si falla).
export async function enviar(id, usuario) {
  const factura = await Factura.findById(id).populate({
    path: 'solicitudId',
    populate: { path: 'cliente', model: 'Cliente' },
  });
  if (!factura) throw new AppError('Factura no encontrada', 404);
  if (!['generada', 'enviada'].includes(factura.estado)) {
    throw new AppError(`La factura debe estar "generada" para enviarse (estado actual: ${factura.estado})`, 400);
  }

  const cliente = factura.solicitudId?.cliente;
  if (!cliente?.email) throw new AppError('El cliente de la solicitud no tiene correo registrado', 400);

  const antes = factura.toObject();
  const notificacion = await crearNotificacion({
    cliente,
    tipo: 'otro',
    asunto: `Factura ${factura.numero} — laboratorio de análisis`,
    mensaje: [
      `Tu factura ${factura.numero} ya está disponible.`,
      `Valor total: $${Number(factura.valorTotal).toLocaleString('es-CO')}.`,
      `Estado: ${factura.estado}.`,
      factura.fechaGeneracion ? `Fecha de generación: ${factura.fechaGeneracion.toLocaleDateString('es-CO')}.` : null,
      'Guarda este correo como respaldo de tu factura.',
    ].filter(Boolean).join('\n'),
  });

  if (notificacion.estado !== 'enviada') {
    throw new AppError(
      `No fue posible enviar la factura por correo: ${notificacion.errorUltimoIntento || 'error desconocido'}`,
      502
    );
  }

  if (factura.estado !== 'enviada') {
    factura.estado = 'enviada';
    factura.historialEstados.push({ estado: 'enviada', usuario, fecha: new Date(), motivo: 'Enviada al cliente por correo' });
    await factura.save();
  }

  await registrarAuditoria({
    entidad: 'facturas',
    entidadId: String(factura._id),
    accion: 'enviar',
    antes,
    despues: factura.toObject(),
    usuario,
  });

  return { factura, notificacion };
}
