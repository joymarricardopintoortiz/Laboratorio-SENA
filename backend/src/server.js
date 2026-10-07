// Arranque del servidor: intenta conectar la BD y levanta Express.
// Si la conexión falla, el servidor sigue arriba para que /api/health
// pueda informar que la base está desconectada.
import app from './app.js';
import { env } from './config/env.js';
import { conectarDB } from './config/db.js';

async function main() {
  try {
    await conectarDB();
  } catch {
    console.error('⚠️  El servidor arrancará sin conexión a la base de datos.');
  }

  app.listen(env.PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${env.PORT}`);
  });
}

main();
