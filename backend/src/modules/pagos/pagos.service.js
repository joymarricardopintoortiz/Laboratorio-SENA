// Lógica de negocio de pagos simulados.
import { Pago } from './pagos.model.js';
import { Cotizacion } from '../cotizaciones/cotizaciones.model.js';
import { Solicitud } from '../solicitudes/solicitudes.model.js';
import { AppError } from '../../utils/AppError.js';
import { registrarAuditoria } from '../../middlewares/audit.js';
import { generarReferencia, confirmarPagoSimulado } from '../../services/pagoSimulado.service.js';

export const listar = () => Pago.find().populate('cotizacion').populate('solicitud').sort({ createdAt: -1 });

export async function crear({ cotizacion: cotizacionId }, usuario) {
  const cotizacion = await Cotizacion.findById(cotizacionId).populate('solicitud');
  if (!cotizacion) throw new AppError('Cotización no encontrada', 404);
  if (cotizacion.estado !== 'aceptada') throw new AppError('La cotización debe estar aceptada para generar el pago', 400);

  const pago = await Pago.create({
    cotizacion: cotizacion._id,
    solicitud: cotizacion.solicitud._id,
    referencia: generarReferencia(),
    monto: cotizacion.total,
  });
  await registrarAuditoria({ entidad: 'pagos', entidadId: String(pago._id), accion: 'crear', despues: pago.toObject(), usuario });
  return pago;
}

export async function confirmar(referencia, usuario) {
  const pago = await Pago.findOne({ referencia });
  if (!pago) throw new AppError('Pago no encontrado', 404);
  const antes = pago.toObject();
  await confirmarPagoSimulado(pago);

  // Si la solicitud requiere pago (externa), al confirmar pasa a pagada.
  const solicitud = await Solicitud.findById(pago.solicitud);
  if (solicitud && solicitud.requierePago) {
    solicitud.estado = 'pagada';
    await solicitud.save();
  } else if (solicitud) {
    solicitud.estado = 'pagada';
    await solicitud.save();
  }

  await registrarAuditoria({ entidad: 'pagos', entidadId: String(pago._id), accion: 'confirmar', antes, despues: pago.toObject(), usuario });
  return pago;
}
