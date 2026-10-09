// Arranque del servidor: intenta conectar la BD y levanta Express.
// Si la conexión falla, el servidor sigue arriba para que /api/health
// pueda informar que la base está desconectada, y queda programada una
// reconexión automática en segundo plano (cada 30 s) hasta que conecte.
import app from './app.js';
import { env } from './config/env.js';
import { conectarDB } from './config/db.js';
import { iniciarCola } from './services/colaCorreos.service.js';

async function main() {
  try {
    await conectarDB({ reconexionAutomatica: true });
  } catch {
    console.error('⚠️  El servidor arrancará sin conexión a la base de datos.');
  }

  app.listen(env.PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${env.PORT}`);
    // Cola que envía al día siguiente los avisos que no entraron en el cupo
    // diario de correos (MAIL_LIMITE_DIA).
    iniciarCola();
  });
}

main();
