// Revisión de índices de TODAS las colecciones (Fase 8).
//
// Uso:
//   npm run indexes           lista, elimina duplicados y crea los que falten
//   npm run indexes -- solo   solo lista (no modifica nada)
//
// Qué hace:
//   1. Lista los índices de cada colección (antes).
//   2. Detecta duplicados: mismo patrón de campos con distinto nombre.
//   3. Aplica los índices de los esquemas Mongoose (syncIndexes): crea los que
//      faltan y elimina los que ya no corresponden al esquema.
//   4. Comprueba los índices exigidos por las consultas frecuentes
//      (estado+fechas, codigo, codigoSeguimiento, token y muestraId).
//   5. Reporta el resultado; sale con código 1 si falta algún índice exigido.
import mongoose from 'mongoose';
import { conectarDB } from '../src/config/db.js';

// Se importan TODOS los modelos para que mongoose.models quede completo.
import '../src/modules/usuarios/usuarios.model.js';
import '../src/modules/clientes/clientes.model.js';
import '../src/modules/solicitudes/solicitudes.model.js';
import '../src/modules/parametrosAnalisis/parametrosAnalisis.model.js';
import '../src/modules/cotizaciones/cotizaciones.model.js';
import '../src/modules/pagos/pagos.model.js';
import '../src/modules/secuencias/secuencias.model.js';
import '../src/modules/muestras/muestras.model.js';
import '../src/modules/analisisMuestras/analisisMuestras.model.js';
import '../src/modules/eventosTrazabilidad/eventosTrazabilidad.model.js';
import '../src/modules/cambiosFecha/cambiosFecha.model.js';
import '../src/modules/incidencias/incidencias.model.js';
import '../src/modules/incidencias/respuestasIncidencias.model.js';
import '../src/modules/disposiciones/disposiciones.model.js';
import '../src/modules/informes/informes.model.js';
import '../src/modules/encuestas/encuestas.model.js';
import '../src/modules/facturas/facturas.model.js';
import '../src/modules/notificaciones/notificaciones.model.js';
import '../src/modules/auditorias/auditorias.model.js';

const SOLO_LECTURA = process.argv.slice(2).includes('solo');

// Índices exigidos por las consultas frecuentes del sistema.
const EXIGIDOS = [
  // --- código de muestra y seguimiento ---
  { modelo: 'Muestra', clave: { codigo: 1 }, grupo: 'codigo' },
  { modelo: 'Muestra', clave: { codigoSeguimiento: 1 }, grupo: 'codigoSeguimiento' },
  { modelo: 'Encuesta', clave: { token: 1 }, grupo: 'token' },
  // --- estado + fechas ---
  { modelo: 'Muestra', clave: { estado: 1, fechaRecepcion: -1 }, grupo: 'estado+fechas' },
  { modelo: 'Solicitud', clave: { estado: 1, createdAt: -1 }, grupo: 'estado+fechas' },
  { modelo: 'Cotizacion', clave: { estado: 1, createdAt: -1 }, grupo: 'estado+fechas' },
  { modelo: 'Pago', clave: { estado: 1, createdAt: -1 }, grupo: 'estado+fechas' },
  { modelo: 'Informe', clave: { estado: 1, fechaGeneracion: -1 }, grupo: 'estado+fechas' },
  { modelo: 'Factura', clave: { estado: 1, fechaGeneracion: -1 }, grupo: 'estado+fechas' },
  { modelo: 'Incidencia', clave: { estado: 1, fechaCreacion: -1 }, grupo: 'estado+fechas' },
  { modelo: 'Notificacion', clave: { estado: 1, tipo: 1 }, grupo: 'estado+fechas' },
  { modelo: 'Auditoria', clave: { entidad: 1, entidadId: 1, createdAt: -1 }, grupo: 'estado+fechas' },
  // --- muestraId ---
  { modelo: 'EventoTrazabilidad', clave: { muestraId: 1, visibleCliente: 1, fecha: 1 }, grupo: 'muestraId' },
  { modelo: 'EventoTrazabilidad', clave: { muestraId: 1, fecha: 1 }, grupo: 'muestraId' },
  { modelo: 'AnalisisMuestra', clave: { muestraId: 1 }, grupo: 'muestraId' },
  { modelo: 'Encuesta', clave: { muestraId: 1 }, grupo: 'muestraId' },
  { modelo: 'Incidencia', clave: { muestraId: 1, estado: 1 }, grupo: 'muestraId' },
  { modelo: 'Disposicion', clave: { muestraId: 1 }, grupo: 'muestraId' },
  { modelo: 'Informe', clave: { muestraId: 1, version: -1 }, grupo: 'muestraId' },
  { modelo: 'CambioFecha', clave: { muestraId: 1 }, grupo: 'muestraId' },
  { modelo: 'Notificacion', clave: { muestraId: 1, estado: 1 }, grupo: 'muestraId' },
  { modelo: 'RespuestaIncidencia', clave: { incidenciaId: 1 }, grupo: 'muestraId' },
  { modelo: 'Factura', clave: { solicitudId: 1 }, grupo: 'muestraId' },
  // --- unicidades ---
  { modelo: 'Usuario', clave: { email: 1 }, grupo: 'unico' },
  { modelo: 'Cliente', clave: { numeroDocumento: 1 }, grupo: 'unico' },
  { modelo: 'ParametroAnalisis', clave: { nombre: 1 }, grupo: 'unico' },
  { modelo: 'Pago', clave: { referencia: 1 }, grupo: 'unico' },
  { modelo: 'Cotizacion', clave: { numero: 1 }, grupo: 'unico' },
  { modelo: 'Informe', clave: { numeroInforme: 1 }, grupo: 'unico' },
  { modelo: 'Factura', clave: { numero: 1 }, grupo: 'unico' },
];

// Normaliza {estado:1, fecha:-1} → cadena comparable sin importar el orden.
function claveNormalizada(clave) {
  return Object.keys(clave)
    .sort()
    .map((k) => `${k}:${clave[k]}`)
    .join(',');
}

async function listarIndices(db, coleccion) {
  try {
    return await db.collection(coleccion).indexes();
  } catch (error) {
    if (error.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
}

// Índices con el mismo patrón de campos (duplicados).
function detectarDuplicados(indices) {
  const porClave = new Map();
  for (const indice of indices) {
    if (indice.name === '_id_') continue;
    const clave = claveNormalizada(indice.key);
    if (!porClave.has(clave)) porClave.set(clave, []);
    porClave.get(clave).push(indice);
  }
  return [...porClave.entries()].filter(([, lista]) => lista.length > 1);
}

// Entre índices duplicados se conserva el que mejor coincide con el esquema
// (los que son únicos o parciales protegen más que un índice simple).
function elegirIndice(lista, modelo) {
  const esquemas = modelo.schema.indexes(); // [ [campos, opciones], ... ]
  const puntuaciones = new Map();
  for (const indice of lista) {
    const norm = claveNormalizada(indice.key);
    const esquema = esquemas.find(([campos]) => claveNormalizada(campos) === norm);
    let puntuacion = indice.unique ? 1 : 0;
    if (esquema) {
      const opciones = esquema[1] || {};
      if (!!indice.unique === !!opciones.unique) puntuacion += 2;
      if (!!indice.sparse === !!opciones.sparse) puntuacion += 1;
      if (
        JSON.stringify(indice.partialFilterExpression ?? null) ===
        JSON.stringify(opciones.partialFilterExpression ?? null)
      ) {
        puntuacion += 2;
      }
    }
    puntuaciones.set(indice.name, puntuacion);
  }
  return [...lista].sort(
    (a, b) => puntuaciones.get(b.name) - puntuaciones.get(a.name) || a.name.localeCompare(b.name)
  )[0];
}

function formatoIndice(indice) {
  const detalles = [];
  if (indice.unique) detalles.push('único');
  if (indice.sparse) detalles.push('sparse');
  if (indice.partialFilterExpression) detalles.push('parcial');
  const campos = Object.entries(indice.key)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
  return `${indice.name.padEnd(42)} {${campos}}${detalles.length ? `  [${detalles.join(', ')}]` : ''}`;
}

async function main() {
  console.log(`Revisión de índices (Fase 8)${SOLO_LECTURA ? ' — modo solo lectura' : ''}\n`);
  await conectarDB();
  const db = mongoose.connection.db;

  const modelos = Object.values(mongoose.models).sort((a, b) =>
    a.collection.name.localeCompare(b.collection.name)
  );

  // ---------- 1) estado ANTES ----------
  console.log('=== Índices ANTES ===');
  const antes = new Map();
  let totalDuplicados = 0;

  for (const modelo of modelos) {
    const coleccion = modelo.collection.name;
    const indices = await listarIndices(db, coleccion);
    antes.set(coleccion, indices);
    console.log(`\n${coleccion} (${indices.length} índice(s))`);
    for (const indice of indices) console.log(`   ${formatoIndice(indice)}`);

    const duplicados = detectarDuplicados(indices);
    if (duplicados.length > 0) {
      for (const [clave, lista] of duplicados) {
        totalDuplicados += lista.length - 1;
        console.log(`   ⚠ DUPLICADO en {${clave}}: ${lista.map((i) => i.name).join(' | ')}`);
      }
    }
  }

  // Índices que no pertenecen a ningún modelo (huérfanos).
  const coleccionesModelo = new Set(modelos.map((m) => m.collection.name));
  const cursor = db.listCollections();
  const todas = typeof cursor.toArray === 'function' ? await cursor.toArray() : await cursor;
  const sinModelo = todas
    .filter((c) => !coleccionesModelo.has(c.name) && !c.name.startsWith('system.') && c.type !== 'view')
    .map((c) => c.name);
  if (sinModelo.length > 0) {
    console.log(`\n⚠ Colecciones sin modelo Mongoose (no se revisan): ${sinModelo.join(', ')}`);
  }

  // ---------- 2) correcciones ----------
  if (SOLO_LECTURA) {
    console.log('\n=== Modo solo lectura: no se modificó nada ===');
  } else {
    // 2a) Eliminar duplicados: mismo patrón de campos, se conserva el que
    //     mejor coincide con el esquema (único / parcial / sparse).
    console.log('\n=== Eliminando índices duplicados ===');
    let eliminadosDuplicados = 0;
    for (const modelo of modelos) {
      const coleccion = modelo.collection.name;
      const duplicados = detectarDuplicados(antes.get(coleccion) || []);
      for (const [clave, lista] of duplicados) {
        const conservar = elegirIndice(lista, modelo);
        for (const indice of lista) {
          if (indice.name === conservar.name) continue;
          try {
            await db.collection(coleccion).dropIndex(indice.name);
            eliminadosDuplicados += 1;
            console.log(
              `   · ${coleccion}: eliminado ${indice.name} (duplicado de ${conservar.name} en {${clave}})`
            );
          } catch (error) {
            console.log(`   ✗ ${coleccion}: no se pudo eliminar ${indice.name} (${error.message})`);
          }
        }
      }
    }
    if (eliminadosDuplicados === 0) console.log('   No se encontraron duplicados que eliminar.');

    // 2b) Sincronizar con los esquemas: crea los que faltan y retira los que
    //     ya no corresponden al esquema.
    console.log('\n=== Aplicando los índices de los esquemas (syncIndexes) ===');
    for (const modelo of modelos) {
      const coleccion = modelo.collection.name;
      try {
        await modelo.syncIndexes();
        const despues = await listarIndices(db, coleccion);
        const nombresAntes = new Set((antes.get(coleccion) || []).map((i) => i.name));
        const nombresDespues = new Set(despues.map((i) => i.name));
        const creados = [...nombresDespues].filter((n) => !nombresAntes.has(n));
        const eliminados = [...nombresAntes].filter((n) => !nombresDespues.has(n));
        if (creados.length === 0 && eliminados.length === 0) {
          console.log(`   · ${coleccion}: sin cambios`);
        } else {
          if (creados.length) console.log(`   · ${coleccion}: CREADOS ${creados.join(', ')}`);
          if (eliminados.length) console.log(`   · ${coleccion}: ELIMINADOS ${eliminados.join(', ')}`);
        }
      } catch (error) {
        console.log(`   ✗ ${coleccion}: no se pudo sincronizar (${error.message})`);
      }
    }
  }

  // ---------- 3) estado DESPUÉS ----------
  console.log('\n=== Índices DESPUÉS ===');
  const despuesGlobal = new Map();
  let duplicadosRestantes = 0;
  for (const modelo of modelos) {
    const coleccion = modelo.collection.name;
    const indices = await listarIndices(db, coleccion);
    despuesGlobal.set(coleccion, indices);
    console.log(`\n${coleccion} (${indices.length} índice(s))`);
    for (const indice of indices) console.log(`   ${formatoIndice(indice)}`);
    duplicadosRestantes += detectarDuplicados(indices).reduce((suma, [, l]) => suma + l.length - 1, 0);
  }

  // ---------- 4) verificación de los exigidos ----------
  console.log('\n=== Índices exigidos por las consultas frecuentes ===');
  let faltantes = 0;
  const porGrupo = {};
  for (const exigido of EXIGIDOS) {
    const coleccion = mongoose.model(exigido.modelo).collection.name;
    const norm = claveNormalizada(exigido.clave);
    const existeAntes = (antes.get(coleccion) || []).some((i) => claveNormalizada(i.key) === norm);
    const existeAhora = (despuesGlobal.get(coleccion) || []).some(
      (i) => claveNormalizada(i.key) === norm
    );
    const estado = existeAhora ? 'OK' : 'FALTA';
    if (!existeAhora) faltantes += 1;
    porGrupo[exigido.grupo] = porGrupo[exigido.grupo] || { total: 0, ok: 0 };
    porGrupo[exigido.grupo].total += 1;
    if (existeAhora) porGrupo[exigido.grupo].ok += 1;
    const detalle = existeAntes
      ? 'ya existía'
      : existeAhora
        ? 'CREADO en esta revisión'
        : 'sigue faltando';
    console.log(
      `   ${existeAhora ? '✅' : '❌'} [${exigido.grupo.padEnd(15)}] ${exigido.modelo.padEnd(22)} {${norm}} → ${estado} (${detalle})`
    );
  }

  // ---------- 5) resumen ----------
  console.log('\n=== Resumen ===');
  console.log(`  Colecciones revisadas : ${modelos.length}`);
  console.log(`  Duplicados antes      : ${totalDuplicados}`);
  console.log(`  Duplicados después    : ${duplicadosRestantes}`);
  for (const [grupo, dato] of Object.entries(porGrupo)) {
    console.log(`  Exigidos ${grupo.padEnd(17)}: ${dato.ok}/${dato.total}`);
  }
  console.log(`  Faltantes             : ${faltantes}`);

  const hayProblemas = faltantes > 0 || duplicadosRestantes > 0;
  console.log(
    hayProblemas
      ? '\nResultado: ⚠ hay índices duplicados o faltantes por corregir.'
      : '\nResultado: ✅ todos los índices exigidos existen y no hay duplicados.'
  );

  await mongoose.disconnect();
  process.exit(hayProblemas ? 1 : 0);
}

main().catch(async (error) => {
  console.error('\nNo se pudo revisar los índices:');
  console.error(`  ${error.message}`);
  try {
    await mongoose.disconnect();
  } catch {
    /* nada */
  }
  process.exit(1);
});
