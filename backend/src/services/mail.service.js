// Envío de correos con Nodemailer (RNF-019).
// - SMTP configurable: MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_APP_PASSWORD, MAIL_FROM.
// - secure=true cuando el puerto es 465.
// - Si MAIL_USER o MAIL_HOST están vacíos, usa una cuenta de prueba de Ethereal
//   e imprime la URL de vista previa de cada correo enviado.
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;
let origenPrueba = false;

async function obtenerTransporter() {
  if (transporter) return transporter;

  if (env.MAIL_USER && env.MAIL_HOST) {
    const puerto = Number(env.MAIL_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: env.MAIL_HOST,
      port: puerto,
      secure: puerto === 465, // true para 465 (SSL), false para 587 (STARTTLS)
      auth: { user: env.MAIL_USER, pass: env.MAIL_APP_PASSWORD },
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
    });
    origenPrueba = true;
    console.log(`📧 Correo: sin SMTP real, usando cuenta de prueba Ethereal (${cuenta.user})`);
  }

  return transporter;
}

// Envía un correo y devuelve info del envío. Si es cuenta de prueba,
// imprime la URL de vista previa en consola.
export async function enviarCorreo({ para, asunto, html, texto }) {
  const t = await obtenerTransporter();
  const info = await t.sendMail({
    from: env.MAIL_FROM || env.MAIL_USER || 'no-reply@laboratorio.local',
    to: para,
    subject: asunto,
    html,
    text: texto,
  });

  if (origenPrueba) {
    console.log(`🔗 Vista previa del correo: ${nodemailer.getTestMessageUrl(info)}`);
  } else {
    console.log(`✅ Correo enviado a ${para} (id: ${info.messageId})`);
  }

  return info;
}
