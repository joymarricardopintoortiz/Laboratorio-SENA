// Envía un correo de prueba usando mail.service.
// Uso: node scripts/probarCorreo.js
import { enviarCorreo } from '../src/services/mail.service.js';
import { env } from '../src/config/env.js';

async function main() {
  const destino = env.MAIL_USER || 'destinatario@ejemplo.com';
  console.log(`Enviando correo de prueba a ${destino}...`);
  await enviarCorreo({
    para: destino,
    asunto: 'Prueba de correo - Laboratorio',
    texto: 'Este es un correo de prueba del backend del laboratorio.',
    html: '<h2>Prueba de correo</h2><p>Este es un correo de prueba del backend del laboratorio.</p>',
  });
  console.log('Listo.');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Error enviando correo:', e.message);
  process.exit(1);
});
