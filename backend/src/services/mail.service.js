// Envío de correos con Nodemailer (RNF-019).
// - SMTP configurable: MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_APP_PASSWORD, MAIL_FROM.
// - secure=true cuando el puerto es 465.
// - Si MAIL_USER o MAIL_HOST están vacíos, usa una cuenta de prueba de Ethereal
//   e imprime la URL de vista previa de cada correo enviado.
// - LÍMITE DIARIO (MAIL_LIMITE_DIA): cada envío reserva un cupo atómico en la
//   colección `secuencias` con la clave 'correos-AAAA-MM-DD' (día de Bogotá).
//   Sin cupo se lanza un error con code='LIMITE_DIARIO' y el llamador decide
//   (las notificaciones se posponen al día siguiente).
// - VALIDACIÓN DEL DESTINO: un correo mal formado o un dominio sin registro MX
//   jamás llega al SMTP → no se genera el rebote que ensucia la bandeja.
import dns from 'node:dns';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { Secuencia } from '../modules/secuencias/secuencias.model.js';

let transporter = null;
let origenPrueba = false;

// Errores con código propio para que el llamador sepa qué hacer.
export const ERROR_LIMITE = 'LIMITE_DIARIO';
export const ERROR_DESTINO = 'DESTINO_INVALIDO';

// Respuestas SMTP 5xx que significan "esta dirección no existe / no es válida":
// en ese caso NO tiene sentido reintentar (cada intento sería otro rebote).
const CODIGOS_DESTINO_INVALIDO = new Set([511, 512, 513, 550, 553]);

// Textos típicos de un SMTP que rechaza el destinatario.
const TEXTO_DESTINO_INVALIDO =
  /user unknown|user not found|does not exist|address rejected|recipient rejected|no such user|mailbox unavailable|invalid recipient|unknown recipient|unknown user|address not found/i;

function errorConCodigo(codigo, mensaje) {
  const error = new Error(mensaje);
  error.code = codigo;
  return error;
}

// ---------------------------------------------------------------------------
// Cupo diario
// ---------------------------------------------------------------------------

// Día calendario actual en la zona del proyecto (America/Bogota) → 'AAAA-MM-DD'.
function diaDeHoy() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const claveCupo = () => `correos-${diaDeHoy()}`;

// Próxima medianoche en America/Bogota (UTC-5 sin horario de verano → 05:00 UTC).
// Es el momento en que se restablece el cupo diario de correos.
export function proximaMedianocheBogota() {
  // Se desplaza "ahora" a la referencia de Bogotá, suma un día y vuelve a UTC.
  const desplazado = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const [a, m, d] = new Date(desplazado.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .split('-')
    .map(Number);
  return new Date(Date.UTC(a, m - 1, d, 5, 0, 0));
}

// Reserva UN cupo del día de forma atómica. Devuelve false si ya se usaron
// los N permitidos (el filtro secuencia < límite no matchea y el upsert
// intenta crear un _id repetido → E11000, que aquí significa "sin cupo").
export async function reservarCupo() {
  const clave = claveCupo();
  try {
    await Secuencia.findOneAndUpdate(
      { _id: clave, secuencia: { $lt: env.MAIL_LIMITE_DIA } },
      { $inc: { secuencia: 1 } },
      { new: true, upsert: true }
    );
    return true;
  } catch (error) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

// Devuelve el cupo si el envío no salió (el mensaje no ocupa un lugar del día).
async function liberarCupo() {
  try {
    await Secuencia.updateOne({ _id: claveCupo(), secuencia: { $gt: 0 } }, { $inc: { secuencia: -1 } });
  } catch {
    /* el contador es auxiliar: un fallo aquí no interrumpe el envío */
  }
}

// Cupo disponible para el día de hoy (lo usa la cola de reenvío).
export async function cupoRestante() {
  const doc = await Secuencia.findById(claveCupo()).catch(() => null);
  return Math.max(0, env.MAIL_LIMITE_DIA - (doc?.secuencia || 0));
}

// ---------------------------------------------------------------------------
// Validación del destino (evita rebotes)
// ---------------------------------------------------------------------------

export function formatoCorreoValido(correo) {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(String(correo || '').trim());
}

// Consulta MX por dominio, con caché en memoria para no repetir DNS.
const cacheMx = new Map();
async function dominioConMx(dominio) {
  if (cacheMx.has(dominio)) return cacheMx.get(dominio);
  let tieneMx = false;
  try {
    const registros = await dns.promises.resolveMx(dominio);
    // MX nulo (RFC 7505, exchange '.') = el dominio declara que NO recibe correo.
    tieneMx = registros.some((r) => !!r.exchange && r.exchange !== '.');
  } catch {
    tieneMx = false;
  }
  cacheMx.set(dominio, tieneMx);
  return tieneMx;
}

// Lanza ERROR_DESTINO si el correo no es válido o el dominio no recibe correo.
export async function validarDestino(correo) {
  const destino = String(correo || '').trim();
  if (!formatoCorreoValido(destino)) {
    throw errorConCodigo(
      ERROR_DESTINO,
      `La dirección "${destino || '(vacía)'}" no tiene un formato de correo válido.`
    );
  }
  const dominio = destino.split('@')[1].toLowerCase();
  if (!(await dominioConMx(dominio))) {
    throw errorConCodigo(
      ERROR_DESTINO,
      `El dominio "${dominio}" no tiene registros MX: no puede recibir correo.`
    );
  }
}

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

async function obtenerTransporter() {
  if (transporter) return transporter;

  if (env.MAIL_USER && env.MAIL_HOST) {
    const puerto = Number(env.MAIL_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: env.MAIL_HOST,
      port: puerto,
      secure: puerto === 465, // true para 465 (SSL), false para 587 (STARTTLS)
      auth: { user: env.MAIL_USER, pass: env.MAIL_APP_PASSWORD },
      // Tiempos límite: un correo averiado no debe colgar la operación que lo disparó.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
    origenPrueba = false;
    console.log(`📧 Correo: usando SMTP ${env.MAIL_HOST}:${puerto} como ${env.MAIL_USER}`);
  } else {
    const cuenta = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: cuenta.user, pass: cuenta.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
    origenPrueba = true;
    console.log(`📧 Correo: sin SMTP real, usando cuenta de prueba Ethereal (${cuenta.user})`);
  }

  return transporter;
}

// Traduce un error del SMTP al código propio correspondiente.
function clasificarErrorSmtp(error) {
  const codigo = error?.responseCode;
  const texto = `${error?.response ?? ''} ${error?.message ?? ''}`;
  if ((typeof codigo === 'number' && CODIGOS_DESTINO_INVALIDO.has(codigo)) || TEXTO_DESTINO_INVALIDO.test(texto)) {
    return errorConCodigo(
      ERROR_DESTINO,
      `El servidor rechazó la dirección del destinatario (${codigo || 'sin código'}): ${error?.message || texto.trim()}`
    );
  }
  return error;
}

// Envía un correo y devuelve info del envío. Si es cuenta de prueba,
// imprime la URL de vista previa en consola.
// adjuntos: arreglo opcional de { nombre, contenido(Buffer), tipoMime }.
// respetarCupo: por defecto true. Cotización y encuesta lo pasan en false
// porque no forman parte del límite diario de avisos de muestra.
export async function enviarCorreo({ para, asunto, html, texto, adjuntos = null, respetarCupo = true }) {
  // 1) El destino se valida ANTES de reservar cupo y ANTES de hablar con el SMTP.
  await validarDestino(para);

  // 2) Reserva del cupo diario.
  if (respetarCupo && !(await reservarCupo())) {
    throw errorConCodigo(
      ERROR_LIMITE,
      `Se alcanzó el límite diario de ${env.MAIL_LIMITE_DIA} correos. El mensaje se enviará mañana.`
    );
  }

  const t = await obtenerTransporter();
  try {
    const info = await t.sendMail({
      from: env.MAIL_FROM || env.MAIL_USER || 'no-reply@laboratorio.local',
      to: para,
      subject: asunto,
      html,
      text: texto,
      attachments: (adjuntos || []).map((a) => ({
        filename: a.nombre,
        content: a.contenido,
        contentType: a.tipoMime || 'application/octet-stream',
      })),
    });

    if (origenPrueba) {
      console.log(`🔗 Vista previa del correo: ${nodemailer.getTestMessageUrl(info)}`);
    } else {
      console.log(`✅ Correo enviado a ${para} (id: ${info.messageId})`);
    }

    return info;
  } catch (error) {
    // El mensaje no salió: se devuelve el cupo para que no se pierda.
    if (respetarCupo) await liberarCupo();
    throw clasificarErrorSmtp(error);
  }
}
