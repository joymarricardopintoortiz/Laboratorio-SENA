// Conexión a MongoDB Atlas con Mongoose, con manejo de error claro.
import mongoose from 'mongoose';
import { env } from './env.js';

export async function conectarDB() {
  try {
    mongoose.set('strictQuery', true);
    const conn = await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`✅ Conectado a MongoDB: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error('❌ No se pudo conectar a MongoDB Atlas:');
    console.error(`   ${error.message}`);
    console.error('   Verifica MONGODB_URI, el usuario/clave y el acceso de red en Atlas.');
    throw error;
  }
}

export function estadoDB() {
  // readyState: 0 = desconectado, 1 = conectado, 2 = conectando, 3 = desconectando
  return mongoose.connection.readyState;
}
