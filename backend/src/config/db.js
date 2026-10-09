// Conexión a MongoDB Atlas con Mongoose, con manejo de error claro.
//
// Mejoras sobre la versión básica:
//   1. Reintentos con espera creciente: una caída transitoria de la red o de
//      Atlas no debe dejar al servidor sin base de datos.
//   2. DNS de respaldo (8.8.8.8 / 1.1.1.1) si los del sistema no resuelven SRV.
//   3. Reconexión automática en segundo plano cuando el proceso la pide
//      (ver conectarDB({ reconexionAutomatica: true }) en src/server.js).
import mongoose from 'mongoose';
import dns from 'node:dns';
import { env } from './env.js';

// DNS públicos de respaldo. Solo se usan si los del sistema no responden.
const DNS_RESPALDO = ['8.8.8.8', '1.1.1.1'];

// Tiempo (ms) que espera el driver por un servidor disponible antes de rendirse.
const TIMEOUT_SELECCION_MS = 10000;
// Esperas (ms) entre el intento 1-2 y 2-3 al arrancar.
const ESPERAS_REINTENTO = [2000, 5000];
// Espera (ms) entre reintentos en segundo plano cuando la conexión se pierde.
const INTERVALO_RECONEXION_MS = 30000;

let reconexionActivada = false;
let reconexionEnCurso = false;
let escuchadoresInstalados = false;
// Verdadero mientras se está intentando conectar: los eventos 'disconnected' /
// 'error' que Mongoose emite durante un intento fallido son esperados y no
// deben generar avisos ni reintentos duplicados.
let intentando = false;

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

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

async function intentarConexion() {
  mongoose.set('strictQuery', true);
  intentando = true;
  try {
    return await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: TIMEOUT_SELECCION_MS,
    });
  } finally {
    intentando = false;
  }
}

function conectarOk(conn) {
  console.log(`✅ Conectado a MongoDB: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
}

function publicarError(error) {
  console.error('❌ No se pudo conectar a MongoDB Atlas:');
  console.error(`   ${error.message}`);
  console.error('   Verifica MONGODB_URI, el usuario/clave y el acceso de red en Atlas.');
  if (reconexionActivada) {
    console.error(`   ⏳ Se reintentará automáticamente cada ${INTERVALO_RECONEXION_MS / 1000} s mientras el servidor esté en pie.`);
  }
  throw error;
}

// Programa un nuevo intento de conexión en segundo plano. Siempre está
// protegido por reconexionEnCurso para no acumular timers.
function programarReconexion(motivo) {
  if (!reconexionActivada || reconexionEnCurso) return;
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) return;

  reconexionEnCurso = true;
  setTimeout(async () => {
    reconexionEnCurso = false;
    if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) return;
    try {
      const conn = await intentarConexion();
      console.log(`✅ Reconectado a MongoDB (${motivo}): ${conn.connection.host}/${conn.connection.name}`);
    } catch (error) {
      console.warn(`⚠️  Sigue sin conexión a MongoDB (${error.message}).`);
      console.warn(`   Nuevo intento en ${INTERVALO_RECONEXION_MS / 1000} s.`);
      programarReconexion(motivo);
    }
  }, INTERVALO_RECONEXION_MS);
}

// Escucha la pérdida de conexión una vez que el proceso está en marcha.
function escucharDesconexion() {
  if (escuchadoresInstalados) return;
  escuchadoresInstalados = true;

  mongoose.connection.on('disconnected', () => {
    if (intentando || reconexionEnCurso) return;
    console.warn('⚠️  Se perdió la conexión con MongoDB.');
    programarReconexion('desconexión');
  });
  mongoose.connection.on('error', (error) => {
    if (intentando) return;
    console.warn(`⚠️  Error de MongoDB: ${error.message}`);
  });
}

export async function conectarDB({ reconexionAutomatica = false } = {}) {
  reconexionActivada = reconexionAutomatica;

  // mongodb+srv necesita resolver registros SRV por DNS.
  const usaSrv = env.MONGODB_URI.startsWith('mongodb+srv');

  if (usaSrv && dns.getServers().length > 0 && dnsUtilesDelSistema().length === 0) {
    usarDnsRespaldo('solo devuelve direcciones locales');
  }

  // Tres intentos en todos los casos: la red hacia Atlas es intermitente y un
  // solo intento dejaba scripts y pruebas sin base por un corte de un instante.
  // Si conecta al primer intento (lo normal), no se espera nada extra.
  // La reconexión en segundo plano, en cambio, solo la pide el servidor.
  const totalIntentos = ESPERAS_REINTENTO.length + 1;
  let ultimoError = null;
  let dnsYaAjustado = false;

  for (let intento = 1; intento <= totalIntentos; intento += 1) {
    try {
      const conn = await intentarConexion();
      if (reconexionAutomatica) escucharDesconexion();
      return conectarOk(conn);
    } catch (error) {
      ultimoError = error;

      // Si el fallo parece de DNS, se usa el respaldo en el siguiente intento.
      if (usaSrv && !dnsYaAjustado && esErrorDeDns(error)) {
        dnsYaAjustado = true;
        usarDnsRespaldo(error.code || error.message);
      }

      if (intento < totalIntentos) {
        const espera = ESPERAS_REINTENTO[intento - 1] ?? ESPERAS_REINTENTO.at(-1);
        console.warn(`⚠️  Intento ${intento}/${totalIntentos} de conexión a MongoDB falló (${error.message}).`);
        console.warn(`   Se reintenta en ${espera / 1000} s...`);
        await dormir(espera);
      }
    }
  }

  // Todos los intentos fallaron: se lanza el error y, si el proceso lo pidió,
  // queda programada la reconexión en segundo plano.
  if (reconexionAutomatica) {
    escucharDesconexion();
    programarReconexion('arranque');
  }
  publicarError(ultimoError);
}

export function estadoDB() {
  // readyState: 0 = desconectado, 1 = conectado, 2 = conectando, 3 = desconectando
  return mongoose.connection.readyState;
}
