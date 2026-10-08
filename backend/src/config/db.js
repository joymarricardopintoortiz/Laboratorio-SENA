// Conexión a MongoDB Atlas con Mongoose, con manejo de error claro.
import mongoose from 'mongoose';
import dns from 'node:dns';
import { env } from './env.js';

// DNS públicos de respaldo. Solo se usan si los del sistema no responden.
const DNS_RESPALDO = ['8.8.8.8', '1.1.1.1'];

// Un servidor DNS local (127.x / ::1) sin nada detrás provoca
// "querySrv ECONNREFUSED" y la conexión mongodb+srv falla.
function esDnsLocal(servidor) {
  return servidor === '::1' || servidor.startsWith('127.');
}

function dnsUtilesDelSistema() {
  return dns.getServers().filter((servidor) => !esDnsLocal(servidor));
}

function usarDnsRespaldo(motivo) {
  // Se conservan los DNS del sistema que sí sirven y se agregan los públicos.
  const combinados = [...new Set([...dnsUtilesDelSistema(), ...DNS_RESPALDO])];
  dns.setServers(combinados);
  console.warn(`⚠️  DNS del sistema inutilizable (${motivo}).`);
  console.warn(`   Se usarán también los DNS de respaldo: ${DNS_RESPALDO.join(', ')}.`);
}

function esErrorDeDns(error) {
  const texto = `${error?.code ?? ''} ${error?.message ?? ''}`;
  return /querySrv|ECONNREFUSED|ESERVFAIL|EAI_AGAIN|ENOTFOUND|getaddrinfo/i.test(texto);
}

async function intentarConexion() {
  mongoose.set('strictQuery', true);
  return mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
}

function publicarError(error) {
  console.error('❌ No se pudo conectar a MongoDB Atlas:');
  console.error(`   ${error.message}`);
  console.error('   Verifica MONGODB_URI, el usuario/clave y el acceso de red en Atlas.');
  throw error;
}

export async function conectarDB() {
  // mongodb+srv necesita resolver registros SRV por DNS.
  const usaSrv = env.MONGODB_URI.startsWith('mongodb+srv');

  if (usaSrv && dns.getServers().length > 0 && dnsUtilesDelSistema().length === 0) {
    usarDnsRespaldo('solo devuelve direcciones locales');
  }

  try {
    const conn = await intentarConexion();
    console.log(`✅ Conectado a MongoDB: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    // Si el fallo parece de DNS, se reintenta una vez con los DNS de respaldo.
    if (usaSrv && esErrorDeDns(error)) {
      usarDnsRespaldo(error.code || error.message);
      try {
        const conn = await intentarConexion();
        console.log(`✅ Conectado a MongoDB: ${conn.connection.host}/${conn.connection.name}`);
        return conn;
      } catch (errorReintento) {
        publicarError(errorReintento);
      }
    }
    publicarError(error);
  }
}

export function estadoDB() {
  // readyState: 0 = desconectado, 1 = conectado, 2 = conectando, 3 = desconectando
  return mongoose.connection.readyState;
}
