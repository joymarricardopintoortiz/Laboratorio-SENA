// Lógica de negocio de cotizaciones.
import { Cotizacion } from './cotizaciones.model.js';
import { Solicitud } from '../solicitudes/solicitudes.model.js';
import { ParametroAnalisis } from '../parametrosAnalisis/parametrosAnalisis.model.js';
import { Cliente } from '../clientes/clientes.model.js';
import { AppError } from '../../utils/AppError.js';
import { registrarAuditoria } from '../../middlewares/audit.js';
import { siguiente } from '../secuencias/secuencias.service.js';
import { enviarCorreo } from '../../services/mail.service.js';

export const listar = () =>
  Cotizacion.find().populate('solicitud').populate('items.parametro', 'nombre precio').sort({ createdAt: -1 });

export async function obtener(id) {
  const c = await Cotizacion.findById(id).populate('solicitud').populate('items.parametro', 'nombre precio');
  if (!c) throw new AppError('Cotización no encontrada', 404);
  return c;
}

export async function crear(datos, usuario) {
  const solicitud = await Solicitud.findById(datos.solicitud);
  if (!solicitud) throw new AppError('La solicitud no existe', 400);

  const items = [];
  let subtotal = 0;
  for (const item of datos.items) {
    const parametro = await ParametroAnalisis.findById(item.parametro);
    if (!parametro) throw new AppError(`Parámetro no encontrado: ${item.parametro}`, 400);
    const cantidad = item.cantidad;
    const precioUnitario = parametro.precio;
    const sub = cantidad * precioUnitario;
    subtotal += sub;
    items.push({ parametro: parametro._id, descripcion: item.descripcion || parametro.nombre, cantidad, precioUnitario, subtotal: sub });
  }

  const numero = await siguiente('cotizaciones');
  const cotizacion = await Cotizacion.create({ solicitud: solicitud._id, numero, items, subtotal, total: subtotal });

  solicitud.estado = 'cotizada';
  await solicitud.save();

  await registrarAuditoria({ entidad: 'cotizaciones', entidadId: String(cotizacion._id), accion: 'crear', despues: cotizacion.toObject(), usuario });
  return cotizacion;
}

// Envía la cotización por correo. Si falla, la marca como envio_fallido
// con un mensaje claro, sin romper el flujo.
export async function enviar(id, usuario) {
  const cotizacion = await Cotizacion.findById(id).populate({ path: 'solicitud', populate: { path: 'cliente' } });
  if (!cotizacion) throw new AppError('Cotización no encontrada', 404);

  const cliente = cotizacion.solicitud?.cliente;
  if (!cliente?.email) throw new AppError('La solicitud no tiene un cliente con correo', 400);

  const antes = cotizacion.toObject();
  const lineas = cotizacion.items.map((i) => `${i.descripcion} x${i.cantidad} - $${i.subtotal}`).join('<br>');

  try {
    await enviarCorreo({
      para: cliente.email,
      asunto: `Cotización #${cotizacion.numero} - Laboratorio`,
      html: `<h2>Cotización #${cotizacion.numero}</h2><p>${lineas}</p><b>Total: $${cotizacion.total}</b>`,
      texto: `Cotización #${cotizacion.numero}. Total: $${cotizacion.total}`,
      // Las cotizaciones no forman parte del cupo diario de avisos de muestra.
      respetarCupo: false,
    });
    cotizacion.estado = 'enviada';
    cotizacion.enviadaPorCorreo = true;
    cotizacion.errorCorreo = '';
  } catch (error) {
    cotizacion.estado = 'envio_fallido';
    cotizacion.enviadaPorCorreo = false;
    cotizacion.errorCorreo = error.message;
  }

  await cotizacion.save();
  await registrarAuditoria({ entidad: 'cotizaciones', entidadId: String(id), accion: 'enviar_correo', antes, despues: cotizacion.toObject(), usuario });
  return cotizacion;
}

export async function aceptar(id, usuario) {
  const cotizacion = await Cotizacion.findById(id).populate('solicitud');
  if (!cotizacion) throw new AppError('Cotización no encontrada', 404);
  const antes = cotizacion.toObject();
  cotizacion.estado = 'aceptada';
  await cotizacion.save();
  cotizacion.solicitud.estado = 'aceptada';
  await cotizacion.solicitud.save();
  await registrarAuditoria({ entidad: 'cotizaciones', entidadId: String(id), accion: 'aceptar', antes, despues: cotizacion.toObject(), usuario });
  return cotizacion;
}

export async function rechazar(id, usuario) {
  const cotizacion = await Cotizacion.findById(id).populate('solicitud');
  if (!cotizacion) throw new AppError('Cotización no encontrada', 404);
  const antes = cotizacion.toObject();
  cotizacion.estado = 'rechazada';
  await cotizacion.save();
  cotizacion.solicitud.estado = 'rechazada';
  await cotizacion.solicitud.save();
  await registrarAuditoria({ entidad: 'cotizaciones', entidadId: String(id), accion: 'rechazar', antes, despues: cotizacion.toObject(), usuario });
  return cotizacion;
}
