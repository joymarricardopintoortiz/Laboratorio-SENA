// Encuestas de satisfacción (RF-099 a RF-102).
// Se crean al entregar el informe y se responden UNA sola vez desde la API pública.
import { Encuesta, generarTokenEncuesta } from './encuestas.model.js';
import { Muestra } from '../muestras/muestras.model.js';
import { Cliente } from '../clientes/clientes.model.js';
import { AppError } from '../../utils/AppError.js';
import { registrarAuditoria } from '../../middlewares/audit.js';
import { registrarEvento } from '../../services/trazabilidad.service.js';
import { enviarCorreo } from '../../services/mail.service.js';
import { env } from '../../config/env.js';

const MENSAJE_NO_ENCONTRADA = 'Encuesta no encontrada. El enlace no es válido o ya caducó.';

// El enlace siempre lleva el token: al frontend si FRONTEND_URL está definida,
// y si no a la API pública (que también responde la encuesta).
export function enlaceEncuesta(token) {
  if (env.FRONTEND_URL) {
    return `${env.FRONTEND_URL.replace(/\/+$/, '')}/encuestas/${token}`;
  }
  return `http://localhost:${env.PORT}/api/publico/encuestas/${token}`;
}

// Crea la encuesta si no existe una pendiente para la muestra y la envía por
// correo. No lanza excepciones: una falla de correo no rompe la entrega del informe.
export async function crearYEnviarEncuesta({ muestra, cliente }, usuario = 'sistema') {
  try {
    if (!muestra?._id || !cliente?._id) return null;

    let encuesta = await Encuesta.findOne({ muestraId: muestra._id, estado: 'pendiente' });
    if (!encuesta) {
      encuesta = await Encuesta.create({
        muestraId: muestra._id,
        clienteId: cliente._id,
        token: generarTokenEncuesta(),
        estado: 'pendiente',
      });
      await registrarAuditoria({
        entidad: 'encuestas',
        entidadId: String(encuesta._id),
        accion: 'crear',
        despues: { muestraId: String(muestra._id), estado: encuesta.estado },
        usuario,
      });
    } else if (encuesta.fechaEnvio) {
      return encuesta; // ya fue enviada, no se vuelve a mandar
    }

    const correo = cliente.email?.trim();
    if (!correo) {
      encuesta.fechaEnvio = null;
      await encuesta.save();
      return encuesta;
    }

    const enlace = enlaceEncuesta(encuesta.token);
    const texto = [
      'Ayúdanos a mejorar: califica el servicio recibido.',
      '',
      ...encuesta.preguntas.map((p, i) => `${i + 1}. ${p}`),
      '',
      `Responde aquí: ${enlace}`,
      `Código de seguimiento: ${muestra.codigoSeguimiento || 'no disponible'}`,
      '',
      'Solo puedes responder una vez. Este es un mensaje automático; no respondas a este correo.',
    ].join('\n');

    try {
      await enviarCorreo({
        para: correo,
        asunto: `Encuesta de satisfacción — muestra ${muestra.codigo || ''}`.trim(),
        texto,
        html: [
          '<p>Ayúdanos a mejorar: califica el servicio recibido.</p>',
          '<ol>' + encuesta.preguntas.map((p) => `<li>${p}</li>`).join('') + '</ol>',
          `<p><a href="${enlace}">Responder la encuesta</a></p>`,
          `<p style="font-size:12px;color:#666">Código de seguimiento: ${muestra.codigoSeguimiento || 'no disponible'}. Solo puedes responder una vez. Mensaje automático.</p>`,
        ].join(''),
        // Las encuestas no forman parte del cupo diario de avisos de muestra.
        respetarCupo: false,
      });
      encuesta.fechaEnvio = new Date();
      await encuesta.save();
      await registrarEvento({
        muestraId: muestra._id,
        tipoEvento: 'notificacion',
        descripcion: 'Encuesta de satisfacción enviada al cliente',
        usuarioId: usuario,
        visibleCliente: false,
      });
    } catch (error) {
      console.error('❌ No se pudo enviar la encuesta:', error.message);
    }

    return encuesta;
  } catch (error) {
    console.error('❌ crearYEnviarEncuesta:', error.message);
    return null;
  }
}

// Vista pública: SIN ids internos ni datos de la muestra.
export async function vistaPublica(token) {
  const encuesta = await Encuesta.findOne({ token: String(token || '').trim() });
  if (!encuesta) throw new AppError(MENSAJE_NO_ENCONTRADA, 404);
  return {
    estado: encuesta.estado,
    respondida: encuesta.estado === 'respondida',
    preguntas: encuesta.preguntas,
    fechaEnvio: encuesta.fechaEnvio,
    fechaRespuesta: encuesta.fechaRespuesta,
    respuestas: encuesta.respuestas.map((r) => ({
      pregunta: r.pregunta,
      calificacion: r.calificacion,
      comentario: r.comentario || '',
    })),
  };
}

// RF-101: respuesta única. Si ya fue respondida → 409.
export async function responder(token, { respuestas }, ip = null) {
  const encuesta = await Encuesta.findOne({ token: String(token || '').trim() });
  if (!encuesta) throw new AppError(MENSAJE_NO_ENCONTRADA, 404);
  if (encuesta.estado === 'respondida') {
    throw new AppError('Esta encuesta ya fue respondida. Gracias por tu participación.', 409);
  }

  encuesta.respuestas = respuestas.map((r) => ({
    pregunta: r.pregunta,
    calificacion: r.calificacion,
    comentario: r.comentario || '',
  }));
  encuesta.estado = 'respondida';
  encuesta.fechaRespuesta = new Date();
  await encuesta.save();

  await registrarAuditoria({
    entidad: 'encuestas',
    entidadId: String(encuesta._id),
    accion: 'responder',
    despues: { estado: encuesta.estado, cantidadRespuestas: encuesta.respuestas.length },
    usuario: 'cliente',
    ip,
  });
  await registrarEvento({
    muestraId: encuesta.muestraId,
    tipoEvento: 'observacion',
    descripcion: 'Encuesta de satisfacción respondida por el cliente',
    usuarioId: 'cliente',
    visibleCliente: true,
  });

  return encuesta;
}

// ------------------------------------------------------------------
// Uso interno (solo lectura para todos los roles)
// ------------------------------------------------------------------
export const listar = (filtro = {}) => Encuesta.find(filtro)
  .populate('muestraId', 'codigo nombreMuestra')
  .populate('clienteId', 'nombre email')
  .sort({ createdAt: -1 });

// Promedio general y por pregunta de las encuestas respondidas.
export async function promedio(muestraId = null) {
  const filtro = { estado: 'respondida' };
  if (muestraId) filtro.muestraId = muestraId;

  const encuestas = await Encuesta.find(filtro);
  const porPregunta = new Map();
  let total = 0;
  let cantidad = 0;

  for (const encuesta of encuestas) {
    for (const respuesta of encuesta.respuestas) {
      total += respuesta.calificacion;
      cantidad += 1;
      const actual = porPregunta.get(respuesta.pregunta) || { pregunta: respuesta.pregunta, total: 0, cantidad: 0 };
      actual.total += respuesta.calificacion;
      actual.cantidad += 1;
      porPregunta.set(respuesta.pregunta, actual);
    }
  }

  return {
    cantidadEncuestasRespondidas: encuestas.length,
    cantidadRespuestas: cantidad,
    promedio: cantidad ? Math.round((total / cantidad) * 100) / 100 : null,
    porPregunta: [...porPregunta.values()].map((p) => ({
      pregunta: p.pregunta,
      cantidad: p.cantidad,
      promedio: Math.round((p.total / p.cantidad) * 100) / 100,
    })),
  };
}
