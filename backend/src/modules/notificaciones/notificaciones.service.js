// Notificaciones al cliente por correo (RF-107 a RF-112).
//
// Reglas:
// - Nunca lanza excepciones: un fallo de correo NO rompe la operación que la disparó.
// - Si el envío falla, la notificación queda "fallida" con errorUltimoIntento.
// - Si el cliente no tiene correo, queda fallida con un mensaje claro y se continúa.
// - El correo lleva siempre el codigoSeguimiento y qué cambió, SIN datos internos.
import { Notificacion, MAX_INTENTOS } from './notificaciones.model.js';
import { Muestra } from '../muestras/muestras.model.js';
import { Cliente } from '../clientes/clientes.model.js';
import { enviarCorreo, ERROR_LIMITE, ERROR_DESTINO, proximaMedianocheBogota } from '../../services/mail.service.js';
import { env } from '../../config/env.js';
import { registrarEvento } from '../../services/trazabilidad.service.js';
import { registrarAuditoria } from '../../middlewares/audit.js';
import { AppError } from '../../utils/AppError.js';

const MENSAJE_SIN_CORREO = 'El cliente no tiene correo registrado; no se pudo enviar la notificación.';

// Etiquetas legibles de los estados de la muestra para el cuerpo del correo.
const ETIQUETAS_ESTADO = {
  ingresada: 'recibida en el laboratorio',
  en_proceso: 'en proceso',
  en_analisis: 'en análisis',
  resultados_validados: 'resultados validados',
  cerrada: 'cerrada',
  rechazada: 'rechazada',
  en_almacen: 'almacenada',
  devuelta: 'devuelta',
  desechada: 'desechada',
};

const etiqueta = (estado) => ETIQUETAS_ESTADO[estado] || estado || '';

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const fechaLarga = (fecha) => (fecha
  ? new Date(fecha).toLocaleDateString('es-CO', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })
  : 'no definida');

// El correo explica qué cambió e incluye el codigoSeguimiento. Nada de datos internos.
function cuerpoCorreo({ asunto, mensaje, codigoSeguimiento, codigo, enlace = null }) {
  const texto = [
    asunto,
    '',
    mensaje,
    '',
    `Código de seguimiento: ${codigoSeguimiento || 'no disponible'}`,
    codigo ? `Código de la muestra: ${codigo}` : null,
    enlace ? `Enlace: ${enlace}` : null,
    '',
    'Consulta el estado de tu muestra con tu código de seguimiento en la consulta pública del laboratorio.',
    'Este es un mensaje automático; no respondas a este correo.',
  ].filter((linea) => linea !== null && linea !== undefined).join('\n');

  const html = [
    `<p>${escapar(asunto)}</p>`,
    `<p style="white-space:pre-line">${escapar(mensaje)}</p>`,
    `<p><strong>Código de seguimiento:</strong> ${escapar(codigoSeguimiento || 'no disponible')}${codigo ? ` &nbsp;|&nbsp; <strong>Código de la muestra:</strong> ${escapar(codigo)}` : ''}</p>`,
    enlace ? `<p><a href="${escapar(enlace)}">${escapar(enlace)}</a></p>` : '',
    '<hr style="border:none;border-top:1px solid #ddd">',
    '<p style="font-size:12px;color:#666">Consulta el estado de tu muestra con tu código de seguimiento en la consulta pública del laboratorio. Este es un mensaje automático; no respondas a este correo.</p>',
  ].join('');

  return { texto, html };
}

async function cargarCliente(muestra) {
  if (!muestra?.clienteId) return null;
  try {
    return await Cliente.findById(muestra.clienteId);
  } catch {
    return null;
  }
}

// Carga la muestra asociada sin lanzar errores (usado por el envío y los disparadores).
async function buscarMuestra(id) {
  if (!id) return null;
  try {
    return await Muestra.findById(id);
  } catch {
    return null;
  }
}

// Envía (o reintenta) una notificación ya creada. No lanza excepciones.
// adjuntos (opcional): PDF del informe. enlace (opcional): URL pública.
export async function enviarNotificacion(notificacion, { muestra = null, cliente = null, adjuntos = null, enlace = null } = {}) {
  try {
    const muestraDoc = muestra || await buscarMuestra(notificacion.muestraId);
    const clienteDoc = cliente || await cargarCliente(muestraDoc);

    // Destino: se usa el correo ACTUAL del cliente si está enlazado; si la
    // muestra/cliente ya no existe (borrado lógico, aviso sin muestra), se
    // recurre al correo capturado en la notificación al crearse.
    const correo = clienteDoc
      ? clienteDoc.email?.trim() || null
      : notificacion.correoDestino?.trim() || null;

    notificacion.correoDestino = correo;

    if (!correo) {
      // RF-110: sin correo la operación continúa; solo queda registrada como fallida.
      notificacion.intentos = Math.min(MAX_INTENTOS, (notificacion.intentos || 0) + 1);
      notificacion.estado = 'fallida';
      notificacion.errorUltimoIntento = MENSAJE_SIN_CORREO;
      notificacion.proximaTentativa = null;
    } else {
      const { texto, html } = cuerpoCorreo({
        asunto: notificacion.asunto,
        mensaje: notificacion.mensaje,
        codigoSeguimiento: muestraDoc?.codigoSeguimiento,
        codigo: muestraDoc?.codigo,
        enlace,
      });

      // Si el destino vuelve a ser válido (p. ej. el cliente corrigió su
      // correo), la notificación vuelve a ser reintentable.
      notificacion.reintentable = true;
      let cuentaComoIntento = true;

      try {
        await enviarCorreo({ para: correo, asunto: notificacion.asunto, html, texto, adjuntos });
        notificacion.estado = 'enviada';
        notificacion.fechaEnvio = new Date();
        notificacion.errorUltimoIntento = null;
        notificacion.proximaTentativa = null;
      } catch (error) {
        if (error?.code === ERROR_LIMITE) {
          // Límite diario alcanzado: NO es un fallo ni consume un intento.
          // La cola del día siguiente la vuelve a tomar en el mismo orden.
          cuentaComoIntento = false;
          notificacion.estado = 'pendiente';
          notificacion.proximaTentativa = proximaMedianocheBogota();
          notificacion.errorUltimoIntento =
            `Límite diario de ${env.MAIL_LIMITE_DIA} correos alcanzado; se enviará mañana.`;
        } else if (error?.code === ERROR_DESTINO) {
          // El destino no existe (sin MX o rechazado por el SMTP): no se
          // reintenta, porque cada intento generaría otro rebote en la bandeja.
          notificacion.estado = 'fallida';
          notificacion.reintentable = false;
          notificacion.proximaTentativa = null;
          notificacion.errorUltimoIntento = String(error.message || 'Destino de correo inválido').slice(0, 300);
        } else {
          notificacion.estado = 'fallida';
          notificacion.proximaTentativa = null;
          notificacion.errorUltimoIntento = String(error?.message || 'Error desconocido al enviar el correo').slice(0, 300);
        }
      }

      if (cuentaComoIntento) {
        notificacion.intentos = Math.min(MAX_INTENTOS, (notificacion.intentos || 0) + 1);
      }
    }

    await notificacion.save();

    // Trazabilidad: evento "notificación enviada" solo cuando salió bien.
    if (notificacion.estado === 'enviada' && notificacion.muestraId) {
      await registrarEvento({
        muestraId: notificacion.muestraId,
        tipoEvento: 'notificacion',
        descripcion: `Notificación enviada: ${notificacion.asunto}`,
        visibleCliente: false,
        usuarioId: 'sistema',
      });
    }
    return notificacion;
  } catch (error) {
    // Último recurso: jamás propagar el error hacia quien disparó la notificación.
    console.error('❌ No se pudo enviar la notificación:', error.message);
    return notificacion;
  }
}

// Crea la notificación y la envía. No lanza excepciones.
export async function crearNotificacion({ muestra = null, cliente = null, tipo, asunto, mensaje, adjuntos = null, enlace = null }) {
  try {
    const notificacion = await Notificacion.create({
      muestraId: muestra?._id || null,
      clienteId: cliente?._id || muestra?.clienteId || null,
      tipo,
      asunto,
      mensaje,
      correoDestino: cliente?.email?.trim() || null,
      estado: 'pendiente',
      fechaProgramada: new Date(),
    });

    await registrarAuditoria({
      entidad: 'notificaciones',
      entidadId: String(notificacion._id),
      accion: 'crear',
      despues: { tipo, asunto, medio: 'correo', estado: notificacion.estado },
      usuario: 'sistema',
    });

    return await enviarNotificacion(notificacion, { muestra, cliente, adjuntos, enlace });
  } catch (error) {
    console.error('❌ No se pudo crear la notificación:', error.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Disparadores automáticos (RF-107 a RF-109)
// ---------------------------------------------------------------------------

export async function notificarCambioEstado({ muestra, estadoAnterior, estadoNuevo }) {
  try {
    if (!muestra) return null;
    const cliente = await cargarCliente(muestra);
    return await crearNotificacion({
      muestra,
      cliente,
      tipo: 'cambio_etapa',
      asunto: `Tu muestra ${muestra.codigo || ''} cambió de estado`.trim(),
      mensaje: `La muestra "${muestra.nombreMuestra}" pasó de "${etiqueta(estadoAnterior)}" a "${etiqueta(estadoNuevo)}".\nUsa tu código de seguimiento para consultar el detalle en la consulta pública.`,
    });
  } catch (error) {
    console.error('❌ notificarCambioEstado:', error.message);
    return null;
  }
}

// El correo va al cliente: usa solo el motivo PÚBLICO (el motivo interno del
// cambio de fecha jamás se comunica al exterior).
export async function notificarCambioFecha({ muestra, fechaAnterior, fechaNueva, motivoPublico = '' }) {
  try {
    if (!muestra) return null;
    const cliente = await cargarCliente(muestra);
    return await crearNotificacion({
      muestra,
      cliente,
      tipo: 'cambio_fecha',
      asunto: `Nueva fecha estimada para tu muestra ${muestra.codigo || ''}`.trim(),
      mensaje: `La fecha estimada de entrega de "${muestra.nombreMuestra}" cambió de ${fechaLarga(fechaAnterior)} a ${fechaLarga(fechaNueva)}.\nMotivo: ${motivoPublico?.trim() || 'no indicado'}.`,
    });
  } catch (error) {
    console.error('❌ notificarCambioFecha:', error.message);
    return null;
  }
}

export async function notificarResultados({ muestra }) {
  try {
    if (!muestra) return null;
    const cliente = await cargarCliente(muestra);
    return await crearNotificacion({
      muestra,
      cliente,
      tipo: 'resultados_disponibles',
      asunto: `Resultados disponibles para tu muestra ${muestra.codigo || ''}`.trim(),
      mensaje: `Los resultados de "${muestra.nombreMuestra}" fueron validados y ya están disponibles.\nEl proceso se encuentra cerrado; puedes consultar el detalle con tu código de seguimiento.`,
    });
  } catch (error) {
    console.error('❌ notificarResultados:', error.message);
    return null;
  }
}

// RF-086: aviso al cliente de que la muestra está en su plazo de conservación.
export async function notificarConservacion({ muestra, fechaLimite }) {
  try {
    if (!muestra) return null;
    const cliente = await cargarCliente(muestra);
    return await crearNotificacion({
      muestra,
      cliente,
      tipo: 'conservacion',
      asunto: `Plazo de conservación de tu muestra ${muestra.codigo || ''}`.trim(),
      mensaje: `El proceso de "${muestra.nombreMuestra}" fue cerrado.
La muestra se conservará en el laboratorio hasta el ${fechaLarga(fechaLimite)} (7 días hábiles).
Después de esa fecha se recomienda retirarla (devolución) o disponer de ella.`,
    });
  } catch (error) {
    console.error('❌ notificarConservacion:', error.message);
    return null;
  }
}

// RF-086: aviso al cliente de la disposición final (devolución o desecho).
export async function notificarDisposicion({ muestra, tipo, motivo }) {
  try {
    if (!muestra) return null;
    const cliente = await cargarCliente(muestra);
    const texto = tipo === 'devolucion' ? 'devuelta' : 'desechada';
    return await crearNotificacion({
      muestra,
      cliente,
      tipo: 'otro',
      asunto: `Muestra ${texto}: ${muestra.codigo || ''}`.trim(),
      mensaje: `Tu muestra "${muestra.nombreMuestra}" fue ${texto} por el laboratorio.
Motivo: ${motivo || 'no indicado'}.`,
    });
  } catch (error) {
    console.error('❌ notificarDisposicion:', error.message);
    return null;
  }
}

// Reemplaza el gancho de la Fase 5: notifica incidencias visibles al cliente.
// Si la incidencia no es visible, no se envía nada.
export async function notificarIncidencia({ incidencia, muestra = null, accion = 'creada' } = {}) {
  try {
    if (!incidencia || incidencia.visibleCliente === false) return null;

    const muestraDoc = muestra || await buscarMuestra(incidencia.muestraId);
    if (!muestraDoc) return null;
    const cliente = await cargarCliente(muestraDoc);

    const textos = {
      creada: 'Se registró una incidencia relacionada con tu muestra.',
      aprobada: 'El laboratorio aprobó la incidencia registrada en tu muestra.',
      cerrada: 'El laboratorio cerró la incidencia registrada en tu muestra.',
    };
    const pideRespuesta = incidencia.estado === 'esperando_cliente' || incidencia.requiereRespuesta;

    const mensaje = [
      `${textos[accion] || 'Actualización de una incidencia de tu muestra.'}`,
      `Incidencia: ${incidencia.titulo}`,
      incidencia.descripcion ? `Descripción: ${incidencia.descripcion}` : '',
      incidencia.tipo === 'demora' && incidencia.nuevaFechaEstimada
        ? `Nueva fecha estimada de entrega: ${fechaLarga(incidencia.nuevaFechaEstimada)}.`
        : '',
      incidencia.motivo ? `Motivo: ${incidencia.motivo}` : '',
      pideRespuesta
        ? 'Necesitamos que respondas desde la consulta pública usando tu código de seguimiento.'
        : '',
    ].filter(Boolean).join('\n\n');

    return await crearNotificacion({ muestra: muestraDoc, cliente, tipo: 'incidencia', asunto: `Incidencia en tu muestra ${muestraDoc.codigo || ''}`.trim(), mensaje });
  } catch (error) {
    console.error('❌ notificarIncidencia:', error.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Consultas y reintento (RF-111, RF-112)
// ---------------------------------------------------------------------------

export const listar = (filtro = {}) => Notificacion.find(filtro).sort({ createdAt: -1 });

export async function obtener(id) {
  const notificacion = await Notificacion.findById(id);
  if (!notificacion) throw new AppError('Notificación no encontrada', 404);
  return notificacion;
}

// RF-112: reintento manual de notificaciones fallidas, máximo MAX_INTENTOS intentos.
export async function reintentar(id, usuario = null) {
  const notificacion = await Notificacion.findById(id);
  if (!notificacion) throw new AppError('Notificación no encontrada', 404);
  if (notificacion.estado !== 'fallida') {
    throw new AppError('Solo se pueden reintentar notificaciones fallidas', 400);
  }
  if (notificacion.reintentable === false) {
    throw new AppError(
      'La dirección de correo del cliente no es válida (dominio sin MX o rechazado por el servidor). Corrige el correo del cliente antes de reintentar.',
      400
    );
  }
  if ((notificacion.intentos || 0) >= MAX_INTENTOS) {
    throw new AppError(`Se alcanzó el límite de ${MAX_INTENTOS} intentos de envío`, 400);
  }

  const antes = { estado: notificacion.estado, intentos: notificacion.intentos, errorUltimoIntento: notificacion.errorUltimoIntento };
  await enviarNotificacion(notificacion);

  await registrarAuditoria({
    entidad: 'notificaciones',
    entidadId: String(notificacion._id),
    accion: 'reintentar',
    antes,
    despues: { estado: notificacion.estado, intentos: notificacion.intentos, errorUltimoIntento: notificacion.errorUltimoIntento },
    usuario,
  });

  return notificacion;
}
