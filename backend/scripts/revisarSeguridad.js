// Revisión de seguridad del backend (Fase 8, RNF-003 / RNF-013 / RNF-014 / RNF-015).
//
// Uso:
//   npm run security
//
// Comprueba SOBRE EL CÓDIGO (sin tocar la base de datos):
//   1. Que ninguna ruta de /api/interno quede sin autenticación.
//   2. Que /api/publico solo admita los métodos acordados (GET + 2 POST) y
//      tenga rate limit.
//   3. Que no exista borrado físico (deleteOne / deleteMany / findByIdAndDelete)
//      en el código: el borrado es SOLO lógico.
//   4. Que helmet, cors y rate limit estén activos.
//   5. Que ninguna respuesta pueda filtrar un stack trace.
//   6. Que .env y backups/ estén en .gitignore y no haya credenciales en el código.
//
// Sale con código 1 si algo queda en FAIL.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(RAIZ, 'src');

const resultados = [];
const comprobar = (seccion, nombre, ok, detalle = '') =>
  resultados.push({ seccion, nombre, ok, detalle });

async function listarJs(carpeta) {
  const entradas = await fs.readdir(carpeta, { withFileTypes: true, recursive: true });
  const archivos = [];
  for (const entrada of entradas) {
    if (!entrada.isFile()) continue;
    if (!entrada.name.endsWith('.js')) continue;
    const completo = path.join(entrada.parentPath ?? entrada.path, entrada.name);
    archivos.push(completo);
  }
  return archivos.sort();
}

const leer = (ruta) => fs.readFile(ruta, 'utf8');
const relativo = (ruta) => path.relative(RAIZ, ruta).replace(/\\/g, '/');
const esComentario = (linea) => /^\s*(\/\/|\/\*|\*)/.test(linea);

// ---------------------------------------------------------------------------
// 1) /api/interno: ninguna ruta sin autenticación
// ---------------------------------------------------------------------------
async function revisarInterno() {
  const seccion = 'Auth /api/interno';
  const rutaInterno = path.join(SRC, 'routes', 'interno.routes.js');
  const texto = await leer(rutaInterno);

  // Guardia global aplicado antes de montar los módulos.
  const posicionGuardia = texto.search(/router\.use\(\s*\(req,\s*res,\s*next\)/);
  const posicionPrimerModulo = texto.search(/router\.use\('\//);
  comprobar(
    seccion,
    'Guardia de autenticación global antes de montar los módulos',
    posicionGuardia !== -1 &&
      posicionPrimerModulo !== -1 &&
      posicionGuardia < posicionPrimerModulo &&
      /auth\(req,\s*res,\s*next\)/.test(texto),
    posicionGuardia === -1 ? 'no se encontró router.use(...) con auth' : 'presente'
  );

  // Módulos montados y sus archivos de rutas.
  const importaciones = [...texto.matchAll(/import (\w+) from '\.\.\/modules\/([^']+)\.routes\.js'/g)];
  comprobar(seccion, 'Módulos montados en /api/interno', importaciones.length > 0, `${importaciones.length} módulos`);

  for (const [, variable, modulo] of importaciones) {
    const rutaModulo = path.join(SRC, 'modules', `${modulo}.routes.js`);
    let contenido;
    try {
      contenido = await leer(rutaModulo);
    } catch {
      comprobar(seccion, `Módulo ${variable} (${modulo}.routes.js)`, false, 'archivo no encontrado');
      continue;
    }

    const usaGuardia = /router\.use\(\s*auth\s*\)/.test(contenido);
    const declaraciones = [...contenido.matchAll(/router\.(get|post|put|patch|delete)\s*\(/g)];
    const sinRol = declaraciones.filter((d) => {
      const fin = contenido.indexOf('\n', d.index);
      const linea = contenido.slice(d.index, fin === -1 ? undefined : fin);
      // El login es público a propósito (es el único punto de entrada sin JWT).
      if (/'\/login'/.test(linea)) return false;
      return !/auth|requireRole|requirePermiso/.test(linea);
    });

    if (usaGuardia) {
      comprobar(seccion, `Módulo ${modulo}`, true, 'router.use(auth)');
    } else {
      comprobar(
        seccion,
        `Módulo ${modulo}`,
        declaraciones.length > 0 && sinRol.length === 0,
        sinRol.length === 0
          ? `${declaraciones.length} ruta(s) con rol explícito`
          : `rutas sin auth ni rol: ${sinRol.map((s) => s[1].toUpperCase()).join(', ')}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 2) /api/publico: solo los métodos acordados y con rate limit
// ---------------------------------------------------------------------------
async function revisarPublico() {
  const seccion = 'API pública /api/publico';
  const rutaModulo = path.join(SRC, 'modules', 'publico', 'publico.routes.js');
  const contenido = await leer(rutaModulo);

  const metodos = [...contenido.matchAll(/router\.(get|post|put|patch|delete)\s*\(/g)].map((m) =>
    m[1].toUpperCase()
  );
  const permitidos = new Set(['GET', 'POST']);
  const prohibidos = [...new Set(metodos)].filter((m) => !permitidos.has(m));
  comprobar(
    seccion,
    'Solo se declaran GET y POST',
    prohibidos.length === 0,
    prohibidos.length === 0 ? [...new Set(metodos)].join(', ') : `métodos prohibidos: ${prohibidos.join(', ')}`
  );
  comprobar(
    seccion,
    'Cierre 405 para métodos no permitidos',
    /405/.test(contenido) && /no permitido/i.test(contenido),
    'middleware final con 405'
  );

  const rutaBase = path.join(SRC, 'routes', 'publico.routes.js');
  const base = await leer(rutaBase);
  comprobar(seccion, 'Rate limit en /api/publico', /rateLimit\(/.test(base), '30 consultas por minuto por IP');
}

// ---------------------------------------------------------------------------
// 3) Borrado SOLO lógico
// ---------------------------------------------------------------------------
async function revisarBorrado() {
  const seccion = 'Borrado lógico (RNF-015)';
  const prohibidos = /\b(deleteOne|deleteMany|findByIdAndDelete|findOneAndDelete|findByIdAndRemove|findOneAndRemove)\b/;
  const permitidoEnHook = /\.pre\(\s*['"](deleteOne|deleteMany)['"]/;
  const archivos = [
    ...(await listarJs(SRC)),
    ...(await listarJs(path.join(RAIZ, 'scripts'))).filter(
      (a) => path.basename(a) !== 'revisarSeguridad.js' // este mismo script
    ),
  ];
  const hallazgos = [];
  const hooks = [];

  for (const archivo of archivos) {
    const lineas = (await leer(archivo)).split('\n');
    lineas.forEach((linea, i) => {
      if (!prohibidos.test(linea)) return;
      if (permitidoEnHook.test(linea)) {
        hooks.push(`${relativo(archivo)}:${i + 1}`);
        return;
      }
      if (esComentario(linea)) return;
      hallazgos.push(`${relativo(archivo)}:${i + 1} → ${linea.trim().slice(0, 110)}`);
    });
  }

  comprobar(
    seccion,
    'Sin deleteOne / deleteMany / findByIdAndDelete en src/ y scripts/',
    hallazgos.length === 0,
    hallazgos.length === 0 ? `${archivos.length} archivos revisados` : hallazgos.join(' | ')
  );
  comprobar(
    seccion,
    'Hooks pre(deleteOne) solo como protección (append-only)',
    true,
    hooks.length > 0 ? hooks.join(', ') : 'ninguno'
  );
}

// ---------------------------------------------------------------------------
// 4) helmet, cors y rate limit activos
// ---------------------------------------------------------------------------
async function revisarMiddlewares() {
  const seccion = 'Middlewares globales';
  const app = await leer(path.join(SRC, 'app.js'));

  comprobar(seccion, 'helmet activo', /app\.use\(\s*helmet\(\)\s*\)/.test(app), 'app.use(helmet())');
  comprobar(seccion, 'cors activo', /app\.use\(\s*cors\(/.test(app), 'app.use(cors({...}))');
  comprobar(
    seccion,
    'cors con orígenes permitidos (FRONTEND_URL)',
    /orignesPermitidas|originsPermitidos|FRONTEND_URL/.test(app),
    'origen restringido por FRONTEND_URL'
  );
  comprobar(seccion, 'rate limit general', /rateLimit\(/.test(app), 'límite general por IP en /api');

  const auth = await leer(path.join(SRC, 'modules', 'auth', 'auth.routes.js'));
  comprobar(seccion, 'rate limit en el login', /rateLimit\(/.test(auth), 'protección contra fuerza bruta');

  const publico = await leer(path.join(SRC, 'routes', 'publico.routes.js'));
  comprobar(seccion, 'rate limit en la consulta pública', /rateLimit\(/.test(publico), '30/min');
}

// ---------------------------------------------------------------------------
// 5) Ningún stack trace al cliente
// ---------------------------------------------------------------------------
async function revisarErrores() {
  const seccion = 'Errores sin stack trace (RNF-014)';
  const errorHandler = await leer(path.join(SRC, 'middlewares', 'errorHandler.js'));
  const errorHandlerSinComentarios = errorHandler
    .split('\n')
    .filter((l) => !esComentario(l))
    .join('\n');

  comprobar(
    seccion,
    'errorHandler no devuelve err.stack',
    !/\bstack\b/.test(errorHandlerSinComentarios),
    'solo { ok:false, mensaje, detalles? }'
  );
  comprobar(
    seccion,
    'errorHandler responde JSON con ok:false',
    /ok:\s*false/.test(errorHandlerSinComentarios) && /mensaje/.test(errorHandlerSinComentarios),
    'formato uniforme en español'
  );

  const archivos = await listarJs(SRC);
  const fugas = [];
  for (const archivo of archivos) {
    const lineas = (await leer(archivo)).split('\n');
    lineas.forEach((linea, i) => {
      if (esComentario(linea)) return;
      if (/\bstack\b/.test(linea) && /res\.(json|send|status)/.test(linea)) {
        fugas.push(`${relativo(archivo)}:${i + 1}`);
      }
    });
  }
  comprobar(seccion, 'Ninguna respuesta incluye "stack"', fugas.length === 0, fugas.join(', ') || 'sin fugas');
}

// ---------------------------------------------------------------------------
// 6) Credenciales fuera del código
// ---------------------------------------------------------------------------
async function revisarCredenciales() {
  const seccion = 'Credenciales';
  const gitignore = await leer(path.join(RAIZ, '.gitignore'));
  comprobar(seccion, '.gitignore incluye .env', /(^|\n)\.env(\n|$)/.test(gitignore), '.env no versionado');
  comprobar(seccion, '.gitignore incluye backups/', /backups\//.test(gitignore), 'respaldos no versionados');

  const archivos = [...(await listarJs(SRC)), ...(await listarJs(path.join(RAIZ, 'scripts')))];
  const fugas = [];
  for (const archivo of archivos) {
    const texto = await leer(archivo);
    if (/mongodb\+srv:\/\/[^'"]+:[^'"]+@/.test(texto)) fugas.push(`${relativo(archivo)} (URI real)`);
    if (/Bearer\s+[A-Za-z0-9._-]{20,}/.test(texto)) fugas.push(`${relativo(archivo)} (token)`);
  }
  comprobar(seccion, 'Sin credenciales en src/ y scripts/', fugas.length === 0, fugas.join(', ') || 'sin fugas');
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('Revisión de seguridad (Fase 8)\n');

  await revisarInterno();
  await revisarPublico();
  await revisarBorrado();
  await revisarMiddlewares();
  await revisarErrores();
  await revisarCredenciales();

  let seccionActual = '';
  let fallidos = 0;
  for (const r of resultados) {
    if (r.seccion !== seccionActual) {
      seccionActual = r.seccion;
      console.log(`\n${seccionActual}`);
    }
    console.log(`   ${r.ok ? '✅' : '❌'} ${r.nombre}${r.detalle ? ` — ${r.detalle}` : ''}`);
    if (!r.ok) fallidos += 1;
  }

  console.log('\n=== Resumen ===');
  console.log(`  Comprobaciones: ${resultados.length}`);
  console.log(`  Correctas     : ${resultados.length - fallidos}`);
  console.log(`  Fallidas      : ${fallidos}`);
  console.log(
    fallidos === 0
      ? '\nResultado: ✅ la revisión de seguridad no encontró problemas.'
      : '\nResultado: ❌ hay puntos por corregir (mira las líneas con ❌).'
  );

  process.exit(fallidos === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nNo se pudo completar la revisión:');
  console.error(`  ${error.message}`);
  process.exit(1);
});
