// Restaura un respaldo creado con scripts/backup.js (RNF-008).
//
// Uso:
//   npm run restore -- backups/2026-10-08_0736
//   npm run restore -- 2026-10-08_0736          (se busca dentro de backups/)
//   npm run restore -- "C:/ruta/al/respaldo"
//   npm run restore -- backups/2026-10-08_0736 --sin-confirmacion   (sin preguntar)
//
// Reglas de seguridad:
//   1. Antes de escribir se muestra el respaldo, lo que hay en la BD y cuántos
//      documentos chocan por _id.
//   2. Hay que escribir SI para continuar; si hay choques, hay que escribir
//      SOBRESCRIBIR (nada se sobrescribe sin avisar y sin confirmación).
//   3. No se borra NINGÚN documento: solo se insertan los que faltan y se
//      reemplazan los que ya existen con el mismo _id.
//   4. Los campos Buffer no viajan en el respaldo (se excluyeron en backup.js);
//      quedan en null y se recuerda al final cómo regenerarlos.
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { conectarDB } from '../src/config/db.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARPETA_RESPALDOS = path.join(RAIZ, 'backups');
const TAMANO_LOTE = 500;

// ---------- argumentos ----------
const argumentos = process.argv.slice(2);
const sinConfirmacion = argumentos.includes('--sin-confirmacion');
const nombreCarpeta = argumentos.find((a) => !a.startsWith('--'));

if (!nombreCarpeta) {
  console.error('Falta la carpeta del respaldo.');
  console.error('Uso: npm run restore -- backups/AAAA-MM-DD_HHmm');
  console.error('     npm run restore -- AAAA-MM-DD_HHmm --sin-confirmacion');
  process.exit(1);
}

// Acepta ruta absoluta, relativa al proyecto o solo el nombre de la carpeta.
async function resolverCarpeta(valor) {
  const candidatas = [
    valor,
    path.resolve(valor),
    path.join(CARPETA_RESPALDOS, valor),
    path.join(RAIZ, valor),
  ];
  for (const candidata of candidatas) {
    try {
      const estadistica = await fs.stat(candidata);
      if (estadistica.isDirectory()) return candidata;
    } catch {
      /* seguimos con la siguiente */
    }
  }
  return null;
}

// ---------- inverso de la serialización de backup.js ----------
function revivir(valor) {
  if (valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map(revivir);

  const claves = Object.keys(valor);
  if (claves.length === 1) {
    const [clave] = claves;
    if (clave === '$oid') return new mongoose.Types.ObjectId(valor.$oid);
    if (clave === '$date') return new Date(valor.$date);
    if (clave === '$numberDecimal') return valor.$numberDecimal;
    if (clave === '$numberLong' || clave === '$numberDouble') return Number(valor[clave]);
    if (clave === '$regularExpression') {
      return new RegExp(valor.$regularExpression.pattern, valor.$regularExpression.options);
    }
  }

  const salida = {};
  for (const [clave, v] of Object.entries(valor)) salida[clave] = revivir(v);
  return salida;
}

// ---------- confirmación por consola ----------
// Devuelve '' si la entrada se cierra sin responder (se cancela por seguridad).
async function preguntar(consigna) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  // Si stdin se cierra sin dar respuesta, mejor cancelar que quedarse colgado.
  const alCerrar = new Promise((resolver) => rl.once('close', () => resolver('')));
  try {
    const respuesta = await Promise.race([rl.question(consigna), alCerrar]);
    return String(respuesta ?? '').trim();
  } finally {
    rl.close();
  }
}

const normalizar = (texto) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

// ---------- lectura del respaldo ----------
async function leerRespaldo(carpeta) {
  const rutaResumen = path.join(carpeta, 'resumen.json');
  let resumen;
  try {
    resumen = JSON.parse(await fs.readFile(rutaResumen, 'utf8'));
  } catch {
    throw new Error(
      `No encontré resumen.json en "${carpeta}". ¿Es una carpeta creada por npm run backup?`
    );
  }

  const archivos = (await fs.readdir(carpeta)).filter((f) => f.endsWith('.json') && f !== 'resumen.json');
  const colecciones = {};
  for (const archivo of archivos) {
    const texto = await fs.readFile(path.join(carpeta, archivo), 'utf8');
    const documentos = JSON.parse(texto);
    if (!Array.isArray(documentos)) {
      throw new Error(`El archivo ${archivo} no contiene un arreglo de documentos.`);
    }
    colecciones[path.basename(archivo, '.json')] = documentos;
  }
  return { resumen, colecciones };
}

// ---------- restauración ----------
async function main() {
  const carpeta = await resolverCarpeta(nombreCarpeta);
  if (!carpeta) {
    console.error(`No existe la carpeta del respaldo: ${nombreCarpeta}`);
    console.error('Esperaba algo como: npm run restore -- backups/AAAA-MM-DD_HHmm');
    process.exit(1);
  }

  const { resumen, colecciones } = await leerRespaldo(carpeta);

  console.log('Restauración de respaldo\n');
  console.log(`  Carpeta     : ${path.relative(RAIZ, carpeta)}`);
  console.log(`  Fecha       : ${resumen.fecha || 'desconocida'}`);
  console.log(`  Base destino: (la configurada en .env)`);
  console.log(`  Documentos  : ${resumen.totalDocumentos ?? 'desconocido'}`);

  const buffers = resumen.buffersOmitidos || {};
  if (Object.keys(buffers).length > 0) {
    console.log('\n  Campos Buffer que NO vienen en el respaldo (quedarán en null):');
    for (const [campo, dato] of Object.entries(buffers)) {
      console.log(`    · ${campo} (${dato.documentos} doc(s), ${dato.bytes} bytes)`);
    }
  }

  await conectarDB();
  const db = mongoose.connection.db;

  console.log('\nAnalizando la base de datos destino...');
  let totalChoques = 0;
  let totalNuevos = 0;
  const plan = [];

  for (const [nombre, documentos] of Object.entries(colecciones)) {
    const idsExistentes = new Set(
      (await db.collection(nombre).find({}, { projection: { _id: 1 } }).toArray()).map((d) =>
        String(d._id)
      )
    );
    let choques = 0;
    for (const doc of documentos) {
      if (doc._id !== undefined && idsExistentes.has(String(doc._id))) choques += 1;
    }
    const nuevos = documentos.length - choques;
    totalChoques += choques;
    totalNuevos += nuevos;
    plan.push({ nombre, documentos }); // el arreglo completo, para restaurarlo después
    const enBD = idsExistentes.size;
    console.log(
      `  · ${nombre.padEnd(30)} respaldo ${String(documentos.length).padStart(5)} | en BD ${String(enBD).padStart(5)} | chocan ${String(choques).padStart(5)} | nuevos ${String(nuevos).padStart(5)}`
    );
  }

  const enBDExtra = await db.listCollections().toArray().catch(() => []);

  console.log(`\n  Total a insertar : ${totalNuevos}`);
  console.log(`  Total a reemplazar: ${totalChoques}`);
  console.log('  Documentos que existen en la BD pero no en el respaldo: NO se tocan ni se borran.');

  if (totalChoques > 0) {
    console.log('\n⚠️  ATENCIÓN: hay documentos existentes con el mismo _id que serán REEMPLAZADOS.');
  }

  // --- confirmación ---
  if (sinConfirmacion) {
    console.log('\n(--sin-confirmacion: se continúa sin preguntar)');
  } else {
    const respuesta = await preguntar(
      totalChoques > 0
        ? '\nEscribe SOBRESCRIBIR para restaurar y reemplazar los documentos que chocan: '
        : '\nEscribe SI para continuar con la restauración: '
    );
    const esperado = totalChoques > 0 ? 'sobrescribir' : 'si';
    if (normalizar(respuesta) !== esperado) {
      console.log('\nRestauración cancelada: no se modificó nada.');
      await mongoose.disconnect();
      process.exit(0);
    }
  }

  // --- aplicación ---
  console.log('\nRestaurando...');
  let insertados = 0;
  let reemplazados = 0;

  for (const { nombre, documentos } of plan) {
    if (documentos.length === 0) continue;
    let localInsertados = 0;
    let localReemplazados = 0;

    for (let i = 0; i < documentos.length; i += TAMANO_LOTE) {
      const lote = documentos.slice(i, i + TAMANO_LOTE);
      const operaciones = lote.map((doc) => {
        const { _id, ...resto } = doc;
        const id = _id === undefined ? new mongoose.Types.ObjectId() : revivir(_id);
        return {
          replaceOne: {
            filter: { _id: id },
            replacement: revivir(resto),
            upsert: true,
          },
        };
      });

      const resultado = await db.collection(nombre).bulkWrite(operaciones, { ordered: false });
      localInsertados += resultado.upsertedCount;
      localReemplazados += resultado.modifiedCount;
    }

    insertados += localInsertados;
    reemplazados += localReemplazados;
    console.log(
      `  · ${nombre.padEnd(30)} insertados ${String(localInsertados).padStart(5)} | reemplazados ${String(localReemplazados).padStart(5)}`
    );
  }

  console.log('\nRestauración terminada.');
  console.log(`  Insertados   : ${insertados}`);
  console.log(`  Reemplazados : ${reemplazados}`);
  if (Object.keys(buffers).length > 0) {
    console.log('\n  Recuerda que los PDF y adjuntos no se respaldan; se deben regenerar desde la app');
    console.log('  (informes → regenerar, rótulo → generar de nuevo, respuestas → readjuntar).');
  }
  const nombresRespaldados = Object.keys(colecciones);
  const sinRespaldar = enBDExtra
    .map((c) => c.name)
    .filter((n) => !nombresRespaldados.includes(n) && !n.startsWith('system.'));
  if (sinRespaldar.length > 0) {
    console.log(`  Colecciones de la BD sin respaldo (intactas): ${sinRespaldar.join(', ')}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error('\nNo se pudo restaurar:');
  console.error(`  ${error.message}`);
  try {
    await mongoose.disconnect();
  } catch {
    /* nada */
  }
  process.exit(1);
});
