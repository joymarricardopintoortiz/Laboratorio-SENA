// Respaldo de TODAS las colecciones a JSON (RNF-008).
//
// Uso:
//   npm run backup
//
// Crea la carpeta backups/AAAA-MM-DD_HHmm/ con:
//   - <coleccion>.json : arreglo con TODOS los documentos de la colección.
//   - resumen.json     : cantidad de documentos por colección, totales y el
//                        registro de los campos Buffer que NO se respaldan.
//
// Los campos pesados tipo Buffer (PDF de informes, PDF de rótulo y los
// adjuntos de las respuestas a incidencias) se excluyen para que el respaldo
// sea ligero y legible; en su lugar se deja `null` y se anota en resumen.json
// cuántos documentos lo tenían y cuántos bytes ocupaban (existencia registrada).
//
// Atlas M0 no tiene respaldos automáticos (RNF-016), por eso existe este script.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { conectarDB } from '../src/config/db.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARPETA_RESPALDOS = path.join(RAIZ, 'backups');
const VERSION_RESPALDO = 1;

// ---------- utilidades de fecha ----------
const dos = (n) => String(n).padStart(2, '0');

// Nombre de carpeta: AAAA-MM-DD_HHmm (hora local).
function nombreCarpeta(fecha = new Date()) {
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}_${dos(fecha.getHours())}${dos(fecha.getMinutes())}`;
}

// ---------- serialización a JSON seguro ----------
// MongoDB entrega ObjectId, Date, Binary y Decimal128; JSON no los entiende.
// Usamos un JSON tipo Extended JSON ligero: { $oid }, { $date }, { $numberDecimal }.
function esBuffer(valor) {
  return (
    Buffer.isBuffer(valor) ||
    valor?._bsontype === 'Binary' ||
    valor?._bsontype === 'Buffer'
  );
}

function bytesDe(valor) {
  if (Buffer.isBuffer(valor)) return valor.length;
  try {
    if (typeof valor?.buffer === 'object' && valor.buffer) return valor.buffer.length;
    if (typeof valor?.value === 'function') return valor.value(true)?.length ?? 0;
  } catch {
    /* si no se puede medir, se reporta 0 */
  }
  return 0;
}

// Los índices de arreglos no interesan para el resumen: archivos.0.contenido
// y archivos.1.contenido cuentan como archivos.*.contenido.
function normalizarRuta(ruta) {
  return ruta.replace(/\.\d+(?=\.|$)/g, '.$*');
}

function registrarBuffer(ruta, bytes, contexto) {
  const clave = normalizarRuta(ruta);
  let entrada = contexto.registro.get(clave);
  if (!entrada) {
    entrada = { documentos: 0, adjuntos: 0, bytes: 0 };
    contexto.registro.set(clave, entrada);
  }
  if (!contexto.vistos.has(clave)) {
    entrada.documentos += 1;
    contexto.vistos.add(clave);
  }
  entrada.adjuntos += 1;
  entrada.bytes += bytes;
}

function convertir(valor, ruta, contexto) {
  if (valor === null || valor === undefined) return null;
  if (esBuffer(valor)) {
    registrarBuffer(ruta, bytesDe(valor), contexto);
    return null; // el campo existe pero su contenido no viaja
  }
  if (valor instanceof Date) return { $date: valor.toISOString() };
  if (Array.isArray(valor)) return valor.map((v, i) => convertir(v, `${ruta}.${i}`, contexto));
  if (typeof valor === 'string' || typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : { $numberDouble: String(valor) };
  if (typeof valor === 'bigint') return { $numberLong: valor.toString() };

  const tipo = valor._bsontype;
  if (tipo === 'ObjectId' || tipo === 'ObjectID') return { $oid: String(valor) };
  if (tipo === 'Decimal128') return { $numberDecimal: String(valor) };
  if (tipo === 'Long' || tipo === 'Int32') return { $numberLong: String(valor) };
  if (tipo === 'Timestamp') return { $timestamp: { t: valor.t, i: valor.i } };
  if (tipo === 'MinKey') return { $minKey: 1 };
  if (tipo === 'MaxKey') return { $maxKey: 1 };
  if (valor instanceof RegExp) return { $regularExpression: { pattern: valor.source, options: valor.flags } };

  if (typeof valor === 'object') {
    if (typeof valor.toObject === 'function') {
      return convertir(valor.toObject(), ruta, contexto);
    }
    const salida = {};
    for (const [clave, v] of Object.entries(valor)) {
      salida[clave] = convertir(v, ruta ? `${ruta}.${clave}` : clave, contexto);
    }
    return salida;
  }
  return null;
}

// ---------- escritura ----------
async function exportarColeccion(db, destino, nombre) {
  const contexto = { registro: new Map(), vistos: new Set() };
  const rutaArchivo = path.join(destino, `${nombre}.json`);
  const manejador = await fs.open(rutaArchivo, 'w');
  let total = 0;
  try {
    await manejador.write('[\n');
    const cursor = db.collection(nombre).find({});
    let primero = true;
    for await (const doc of cursor) {
      contexto.vistos = new Set(); // el conteo de "documentos" es por documento
      const json = JSON.stringify(convertir(doc, '', contexto));
      await manejador.write(`${primero ? '' : ',\n'}  ${json}`);
      primero = false;
      total += 1;
    }
    await manejador.write('\n]\n');
  } finally {
    await manejador.close();
  }
  return { total, buffers: contexto.registro };
}

async function main() {
  console.log('Respaldo de la base de datos (RNF-008)...\n');
  await conectarDB();

  const db = mongoose.connection.db;
  const nombreBase = mongoose.connection.name;

  // driver de MongoDB: listCollections() devuelve un cursor, no una promesa.
  const cursorColecciones = db.listCollections();
  const listadoColecciones =
    typeof cursorColecciones.toArray === 'function'
      ? await cursorColecciones.toArray()
      : await cursorColecciones;

  const colecciones = listadoColecciones
    .filter((c) => c.type !== 'view' && !c.name.startsWith('system.'))
    .map((c) => c.name)
    .sort();

  if (colecciones.length === 0) {
    console.warn('La base de datos no tiene colecciones; no hay nada que respaldar.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const carpeta = nombreCarpeta();
  const destino = path.join(CARPETA_RESPALDOS, carpeta);
  await fs.mkdir(destino, { recursive: true });

  const resumenColecciones = {};
  const buffersGlobal = new Map();
  let totalDocumentos = 0;

  for (const nombre of colecciones) {
    const { total, buffers } = await exportarColeccion(db, destino, nombre);
    resumenColecciones[nombre] = total;
    totalDocumentos += total;
    for (const [campo, dato] of buffers) {
      const acumulado = buffersGlobal.get(campo) || { documentos: 0, adjuntos: 0, bytes: 0 };
      acumulado.documentos += dato.documentos;
      acumulado.adjuntos += dato.adjuntos;
      acumulado.bytes += dato.bytes;
      buffersGlobal.set(campo, acumulado);
    }
    console.log(`  · ${nombre.padEnd(32)} ${String(total).padStart(7)} documento(s)`);
  }

  // Sin credenciales: solo el host y el nombre de la base.
  let servidor = 'desconocido';
  try {
    servidor = mongoose.connection.host || 'desconocido';
  } catch {
    /* se deja 'desconocido' */
  }

  const resumen = {
    version: VERSION_RESPALDO,
    proyecto: 'Sistema de Gestión para el Servicio de Análisis de Laboratorio',
    carpeta,
    fecha: new Date().toISOString(),
    baseDatos: nombreBase,
    servidor,
    totalColecciones: colecciones.length,
    totalDocumentos,
    colecciones: resumenColecciones,
    buffersOmitidos: Object.fromEntries([...buffersGlobal.entries()].sort()),
    observaciones: [
      'Los campos Buffer (PDF de informes, PDF de rótulo y adjuntos de respuestas a incidencias) NO se respaldan: quedan en null.',
      'La existencia de esos campos quedó registrada en buffersOmitidos (documentos, adjuntos y bytes).',
      'Para restaurar: npm run restore -- backups/' + carpeta,
      'La restauración no borra documentos que no estén en el respaldo.',
    ],
  };

  const rutaResumen = path.join(destino, 'resumen.json');
  await fs.writeFile(rutaResumen, `${JSON.stringify(resumen, null, 2)}\n`, 'utf8');

  console.log('\nResumen:');
  console.log(`  Colecciones : ${colecciones.length}`);
  console.log(`  Documentos  : ${totalDocumentos}`);
  if (buffersGlobal.size > 0) {
    console.log('  Campos Buffer omitidos (registrados, no exportados):');
    for (const [campo, dato] of buffersGlobal) {
      console.log(
        `    · ${campo.padEnd(40)} ${String(dato.documentos).padStart(5)} doc(s), ${dato.adjuntos} archivo(s), ${dato.bytes} bytes`
      );
    }
  } else {
    console.log('  Campos Buffer omitidos: ninguno');
  }
  console.log(`\nRespaldo creado en: ${path.relative(RAIZ, destino)}`);
  console.log(`Resumen: ${path.relative(RAIZ, rutaResumen)}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error('\nNo se pudo crear el respaldo:');
  console.error(`  ${error.message}`);
  try {
    await mongoose.disconnect();
  } catch {
    /* nada */
  }
  process.exit(1);
});
