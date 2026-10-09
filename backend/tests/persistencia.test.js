// Prueba de PERSISTENCIA: se ven los cambios REFLEJADOS en MongoDB Atlas.
//
// A diferencia de la prueba de humo (que comprueba respuestas HTTP), esta
// prueba lee los documentos DIRECTAMENTE de la base de datos y los imprime
// en pantalla en formato ANTES → DESPUÉS, para que se vea exactamente qué
// guarda el backend: hash bcrypt, código consecutivo, borrado lógico,
// campo activo, auditorías antes/despues, motivo interno vs. público, índices.
//
// Uso:
//   npm run test:persistencia                          (contenedor Docker :3200)
//   BASE=http://localhost:3000 npm run test:persistencia   (otro servidor)
//   (si no hay nada corriendo en 3200, arranca un servidor propio en 3100)
//
// Limpia sus datos al terminar (marcados con "PRUEBA PERSISTENCIA",
// borrados con la misma lógica que la prueba de humo).
import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { conectarDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Usuario } from '../src/modules/usuarios/usuarios.model.js';
import { Cliente } from '../src/modules/clientes/clientes.model.js';
import { Solicitud } from '../src/modules/solicitudes/solicitudes.model.js';
import { ParametroAnalisis } from '../src/modules/parametrosAnalisis/parametrosAnalisis.model.js';
import { Cotizacion } from '../src/modules/cotizaciones/cotizaciones.model.js';
import { Pago } from '../src/modules/pagos/pagos.model.js';
import { Muestra } from '../src/modules/muestras/muestras.model.js';
import { CambioFecha } from '../src/modules/cambiosFecha/cambiosFecha.model.js';
import { Auditoria } from '../src/modules/auditorias/auditorias.model.js';
import { Secuencia } from '../src/modules/secuencias/secuencias.model.js';
import { Notificacion } from '../src/modules/notificaciones/notificaciones.model.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = process.env.PUERTO_TEST || '3100';
const PUERTO_DOCKER = '3200';
const MARCA = `PRUEBA PERSISTENCIA ${Date.now()}`;

let BASE = process.env.BASE || `http://localhost:${PUERTO_DOCKER}`;
let servidorPropio = null;

const esperaCorta = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- resultados ----------
const resultados = [];
function comprobar(ok, nombre, detalle = '') {
  resultados.push({ ok, nombre, detalle });
  console.log(`${ok ? '✅' : '❌'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  return ok;
}
function exigir(ok, nombre, detalle = '') {
  if (comprobar(ok, nombre, detalle)) return true;
  throw new Error(`Fallo en: ${nombre}`);
}

// ---------- impresión de pantallas ANTES / DESPUÉS ----------
function paso(n, titulo) {
  console.log(`\n${'═'.repeat(74)}`);
  console.log(` PASO ${n} — ${titulo}`);
  console.log('═'.repeat(74));
}
function etiqueta(texto) {
  console.log(`\n   ── ${texto} ──`);
}
function accion(texto) {
  console.log(`\n   ▸ ${texto}`);
}
function imprimir(doc, cabecera) {
  if (cabecera) console.log(`\n   ${cabecera}`);
  if (doc === null || doc === undefined) {
    console.log('      (el documento NO existe en la base de datos)');
    return;
  }
  const json = JSON.stringify(doc, null, 2) ?? String(doc);
  console.log(json.split('\n').map((l) => `      ${l}`).join('\n'));
}

// Lectura CRUDA de la colección (ignora el select:false del esquema).
const crudo = (modelo) => mongoose.connection.db.collection(modelo.collection.name);

// ---------- cliente HTTP (igual que la prueba de humo) ----------
const leerJson = async (respuesta) => {
  const texto = await respuesta.text();
  try {
    return JSON.parse(texto);
  } catch {
    return { crudo: texto };
  }
};

async function api(ruta, { metodo = 'GET', token, body, esperado } = {}) {
  const encabezados = {};
  if (token) encabezados.Authorization = `Bearer ${token}`;
  if (body) encabezados['Content-Type'] = 'application/json';
  const respuesta = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: encabezados,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  const datos = await leerJson(respuesta);
  if (esperado !== undefined && respuesta.status !== esperado) {
    throw new Error(
      `${metodo} ${ruta} → ${respuesta.status} (esperaba ${esperado}): ${JSON.stringify(datos).slice(0, 300)}`
    );
  }
  return { status: respuesta.status, data: datos };
}

// ---------- servidor ----------
async function saludOk(base) {
  try {
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
    const d = await leerJson(r);
    return !!(d.ok && d.baseDatos === 'conectada');
  } catch {
    return false;
  }
}

async function asegurarServidor() {
  if (await saludOk(BASE)) {
    console.log(`Servidor encontrado en ${BASE} (no hace falta arrancar otro).`);
    return;
  }
  if (process.env.BASE) {
    throw new Error(`No hay servidor saludable en ${BASE} (BASE=${process.env.BASE}).`);
  }
  // Ni el contenedor ni nada en 3200: servidor propio en 3100.
  BASE = `http://localhost:${PUERTO}`;
  if (await saludOk(BASE)) {
    console.log(`Sin contenedor en 3200; usando servidor local en ${BASE}.`);
    return;
  }
  console.log(`Sin servidor en 3200 ni 3100; arrancando src/server.js en ${PUERTO}…`);
  servidorPropio = spawn(process.execPath, ['src/server.js'], {
    cwd: RAIZ,
    env: { ...process.env, PORT: PUERTO },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  servidorPropio.stdout.on('data', (d) => {
    if (process.env.VERBOSE) process.stdout.write(`[servidor] ${d}`);
  });
  servidorPropio.stderr.on('data', (d) => process.stderr.write(`[servidor] ${d}`));
  for (let i = 0; i < 60; i += 1) {
    if (await saludOk(BASE)) return;
    await esperaCorta(500);
  }
  throw new Error(`El servidor no arrancó en ${BASE}`);
}

// ===========================================================================
//  Prueba principal
// ===========================================================================
async function prueba(token, c) {
  const anio = new Date().getFullYear();
  const claveSecuencia = `muestras-${anio}`;

  const auditoriasInicio = await Auditoria.countDocuments({});
  const hashBcrypt = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

  // ══════════════════ 1. Contraseña: jamás en claro ══════════════════
  paso(1, 'USUARIO — cómo se guarda la contraseña');
  const email = `persistencia.${Date.now()}@example.com`;

  etiqueta(`ANTES — colección "${Usuario.collection.name}" (filtro { email: "${email}" })`);
  imprimir(await crudo(Usuario).findOne({ email }), '(vacío: el usuario todavía no existe)');

  accion(`POST /api/interno/usuarios (nombre de 120 caracteres, password "Segura123")`);
  const creado = await api('/api/interno/usuarios', {
    metodo: 'POST',
    token,
    body: {
      nombre: `${MARCA} encargado`,
      email,
      password: 'Segura123',
      rol: 'encargado',
      permisos: { editar: true, eliminar: false },
    },
    esperado: 201,
  });
  c.usuarioId = creado.data.usuario?._id;

  const docUsuario = await crudo(Usuario).findOne({ email });
  etiqueta('DESPUÉS — mismo documento, leído directo de MongoDB');
  imprimir(docUsuario);

  exigir(!!docUsuario, 'El documento quedó guardado en la colección de usuarios');
  exigir(
    hashBcrypt.test(String(docUsuario.password)) && docUsuario.password.length === 60,
    'La contraseña está guardada como hash bcrypt de 60 caracteres (nunca el texto plano)',
    `${docUsuario.password.slice(0, 20)}…`
  );
  exigir(
    creado.data.usuario?.password === undefined,
    'La respuesta de la API NO incluye el hash del password'
  );
  exigir(docUsuario.activo === true && docUsuario.eliminado === false, 'Nace activo y sin eliminar');

  // ══════════════════ 2. Auditoría del alta ══════════════════
  paso(2, 'AUDITORÍAS — antes/despues de cada acción');
  const auditoriasUsuario = await Auditoria.find({
    entidad: 'usuarios',
    entidadId: String(c.usuarioId),
  }).sort({ createdAt: 1 });

  etiqueta(`ANTES/DESPUÉS — auditorías de este usuario (${auditoriasUsuario.length} registro(s))`);
  imprimir(auditoriasUsuario);

  exigir(auditoriasUsuario.length >= 1, 'El alta quedó registrada en auditorias (append-only)');
  exigir(
    !JSON.stringify(auditoriasUsuario).includes('Segura123'),
    'La auditoría guarda el antes/después SIN el password en claro'
  );

  // ══════════════════ 3. Activar / desactivar ══════════════════
  paso(3, 'CAMPO "activo" — suspender una cuenta sin borrarla');
  etiqueta(`ANTES — activo: ${docUsuario.activo}`);
  accion('PATCH /api/interno/usuarios/{id}/estado  body { activo: false }');
  await api(`/api/interno/usuarios/${c.usuarioId}/estado`, {
    metodo: 'PATCH',
    token,
    body: { activo: false },
    esperado: 200,
  });
  const suspendido = await crudo(Usuario).findOne({ email });
  etiqueta('DESPUÉS — el mismo _id, con activo: false');
  imprimir(suspendido, '(el documento NO se borró: solo cambió el campo)');
  exigir(suspendido.activo === false, 'La cuenta quedó suspendida (activo: false) persistido');

  const loginSuspendido = await api('/api/interno/auth/login', {
    metodo: 'POST',
    body: { email, password: 'Segura123' },
  });
  exigir(loginSuspendido.status === 401, 'La cuenta suspendida NO puede iniciar sesión → 401', loginSuspendido.data.mensaje);

  accion('PATCH …/estado  body { activo: true }  (reactivar)');
  await api(`/api/interno/usuarios/${c.usuarioId}/estado`, {
    metodo: 'PATCH',
    token,
    body: { activo: true },
    esperado: 200,
  });
  exigir((await crudo(Usuario).findOne({ email })).activo === true, 'Reactivada: activo vuelve a true');

  const transicion = await Auditoria.findOne({
    entidad: 'usuarios',
    entidadId: String(c.usuarioId),
    'antes.activo': true,
    'despues.activo': false,
  });
  etiqueta('DESPUÉS — la transición queda registrada en auditorias');
  imprimir(transicion);
  exigir(!!transicion, 'La auditoría guarda antes {activo:true} → despues {activo:false}');

  // ══════════════════ 4. Validaciones: nada llega a la base ══════════════════
  paso(4, 'VALIDACIÓN — los datos inválidos NUNCA llegan a la base');
  const emailLargo = `largo.${Date.now()}@example.com`;
  const emailInvalido = `rol.${Date.now()}@example.com`;

  accion('POST /api/interno/usuarios con nombre de 121 caracteres (máx. 120)');
  const rechazadoNombre = await api('/api/interno/usuarios', {
    metodo: 'POST',
    token,
    body: { nombre: 'x'.repeat(121), email: emailLargo, password: 'Segura123', rol: 'usuario' },
  });
  accion('POST /api/interno/usuarios con rol "superadmin" (enum: admin|encargado|usuario)');
  const rechazadoRol = await api('/api/interno/usuarios', {
    metodo: 'POST',
    token,
    body: { nombre: 'Rol malo', email: emailInvalido, password: 'Segura123', rol: 'superadmin' },
  });

  etiqueta('DESPUÉS — búsqueda de los dos correos rechazados en la colección');
  const countInvalidos = await crudo(Usuario).countDocuments({ email: { $in: [emailLargo, emailInvalido] } });
  console.log(`      countDocuments({ email: { $in: [correos rechazados] } }) = ${countInvalidos}`);

  exigir(rechazadoNombre.status === 400, 'Nombre de 121 caracteres → 400', rechazadoNombre.data.mensaje);
  exigir(rechazadoRol.status === 400, 'Rol fuera del enum → 400', rechazadoRol.data.mensaje);
  exigir(countInvalidos === 0, 'Ninguno de los dos intentos creó documento en la base');

  // ══════════════════ 5. Borrado lógico del cliente ══════════════════
  paso(5, 'BORRADO LÓGICO — el documento sigue ahí, marcado');
  accion('POST /api/interno/clientes');
  const clienteDemo = await api('/api/interno/clientes', {
    metodo: 'POST',
    token,
    body: {
      nombre: `${MARCA} cliente (demo de borrado)`,
      numeroDocumento: `${Date.now()}`.slice(-10),
      email: `persistencia.cliente.${Date.now()}@example.com`,
      tipoCliente: 'externo',
      tipoDocumento: 'CC',
      telefono: '3001234567',
      direccion: 'Calle 1 # 2-3',
    },
    esperado: 201,
  });
  const clienteDemoId = clienteDemo.data.cliente._id;

  etiqueta('ANTES — colección de clientes (recién creada)');
  const antesBorrar = await crudo(Cliente).findOne({ _id: new mongoose.Types.ObjectId(clienteDemoId) });
  imprimir(antesBorrar);

  accion(`DELETE /api/interno/clientes/${clienteDemoId}`);
  await api(`/api/interno/clientes/${clienteDemoId}`, { metodo: 'DELETE', token });

  const despuesBorrar = await crudo(Cliente).findOne({ _id: new mongoose.Types.ObjectId(clienteDemoId) });
  etiqueta('DESPUÉS — el MISMO _id sigue en la base, con los 3 campos de borrado lógico');
  imprimir(despuesBorrar);

  exigir(!!despuesBorrar, 'El documento NO desapareció de la colección (sigue existiendo)');
  exigir(
    despuesBorrar.eliminado === true && !!despuesBorrar.eliminadoPor && !!despuesBorrar.fechaEliminacion,
    'Quedó marcado con eliminado + eliminadoPor + fechaEliminacion',
    `eliminadoPor: ${despuesBorrar.eliminadoPor}`
  );
  const audCliente = await Auditoria.findOne({ entidad: 'clientes', entidadId: String(clienteDemoId) });
  exigir(!!audCliente, 'La eliminación quedó registrada en auditorias', audCliente?.accion);

  // ══════════════════ 6. Consecutivos y códigos de la muestra ══════════════════
  paso(6, 'CONSECUTIVOS — secuencia atómica y códigos de la muestra');
  etiqueta(`ANTES — colección "${Secuencia.collection.name}" (${claveSecuencia})`);
  const secuenciaAntes = await crudo(Secuencia).findOne({ _id: claveSecuencia });
  imprimir(secuenciaAntes, '(puede no existir aún si nunca se ha creado una muestra este año)');

  accion('POST /api/interno/clientes (cliente ACTIVO para el flujo — el anterior quedó eliminado)');
  const clienteFlujo = await api('/api/interno/clientes', {
    metodo: 'POST',
    token,
    body: {
      nombre: `${MARCA} cliente del flujo`,
      numeroDocumento: `${Date.now() + 1}`.slice(-10),
      email: `persistencia.flujo.${Date.now()}@example.com`,
      tipoCliente: 'externo',
      tipoDocumento: 'NIT',
      telefono: '3009876543',
      direccion: 'Carrera 2 # 3-4',
    },
    esperado: 201,
  });
  c.clienteId = clienteFlujo.data.cliente._id;
  exigir(!!c.clienteId, 'Cliente del flujo creado (activo: se le puede crear una solicitud)');

  accion('POST /api/interno/parametros-analisis');
  const parametro = await api('/api/interno/parametros-analisis', {
    metodo: 'POST',
    token,
    body: { nombre: `${MARCA} turbidez`, descripcion: 'prueba de persistencia', precio: 10000, unidad: 'NTU', activo: true },
    esperado: 201,
  });
  c.parametroId = parametro.data.parametro._id;

  accion('POST /api/interno/solicitudes');
  const solicitud = await api('/api/interno/solicitudes', {
    metodo: 'POST',
    token,
    body: {
      cliente: c.clienteId,
      tipoCliente: 'externo',
      descripcion: `${MARCA} flujo de persistencia`,
      prioridad: 'media',
      atencionInmediata: false,
    },
    esperado: 201,
  });
  c.solicitudId = solicitud.data.solicitud._id;

  accion('POST /api/interno/cotizaciones');
  const cotizacion = await api('/api/interno/cotizaciones', {
    metodo: 'POST',
    token,
    body: { solicitud: c.solicitudId, items: [{ parametro: c.parametroId, cantidad: 1, descripcion: 'Análisis de turbidez' }] },
    esperado: 201,
  });
  c.cotizacionId = cotizacion.data.cotizacion._id;
  exigir(
    Number.isInteger(cotizacion.data.cotizacion.numero) && cotizacion.data.cotizacion.numero > 0,
    'Cotización creada con número consecutivo',
    String(cotizacion.data.cotizacion.numero)
  );

  await api(`/api/interno/cotizaciones/${c.cotizacionId}/aceptar`, { metodo: 'POST', token, esperado: 200 });
  const pago = await api('/api/interno/pagos', { metodo: 'POST', token, body: { cotizacion: c.cotizacionId }, esperado: 201 });
  c.referencia = pago.data.pago.referencia;
  await api(`/api/interno/pagos/${c.referencia}/confirmar`, { metodo: 'POST', token, esperado: 200 });

  accion('POST /api/interno/muestras  +  POST …/aceptar (genera código y seguimiento)');
  const muestra = await api('/api/interno/muestras', {
    metodo: 'POST',
    token,
    body: {
      solicitudId: c.solicitudId,
      nombreMuestra: `${MARCA} agua`,
      descripcion: 'muestra de la prueba de persistencia',
      tipoFisico: 'liquido',
      cantidad: 450,
      verificacionFisica: false,
    },
    esperado: 201,
  });
  c.muestraId = muestra.data.muestra._id;
  const aceptada = await api(`/api/interno/muestras/${c.muestraId}/aceptar`, { metodo: 'POST', token, esperado: 200 });
  c.codigo = aceptada.data.muestra.codigo;

  const docMuestra = await crudo(Muestra).findOne({ _id: new mongoose.Types.ObjectId(c.muestraId) });
  etiqueta(`DESPUÉS — documento de la muestra en la colección "${Muestra.collection.name}"`);
  imprimir(docMuestra);

  const secuenciaDespues = await crudo(Secuencia).findOne({ _id: claveSecuencia });
  etiqueta(`DESPUÉS — la secuencia "${claveSecuencia}" se incrementó`);
  imprimir(secuenciaDespues);

  const delta = (secuenciaDespues?.secuencia ?? 0) - (secuenciaAntes?.secuencia ?? 0);
  exigir(/^\d{4}-\d{4}$/.test(String(docMuestra.codigo)), 'codigo generado por $inc sobre secuencias', docMuestra.codigo);
  exigir(/^[a-f0-9]{32}$/.test(String(docMuestra.codigoSeguimiento)), 'codigoSeguimiento aleatorio (32 hex)', docMuestra.codigoSeguimiento);
  exigir(delta === 1, 'La secuencia avanzó exactamente 1 con esta muestra', `${secuenciaAntes?.secuencia ?? 0} → ${secuenciaDespues?.secuencia}`);

  // ══════════════════ 7. Cambio de fecha: motivo interno vs público ══════════════════
  paso(7, 'MOTIVOS — el motivo interno JAMÁS sale por la API pública');
  await api(`/api/interno/muestras/${c.muestraId}/parametros`, {
    metodo: 'PATCH',
    token,
    body: { parametrosIds: [c.parametroId] },
    esperado: 200,
  });
  await api(`/api/interno/muestras/${c.muestraId}/iniciar`, { metodo: 'POST', token, esperado: 200 });
  for (const estado of ['en_proceso', 'en_analisis']) {
    await api(`/api/interno/muestras/${c.muestraId}/estado`, { metodo: 'PATCH', token, body: { estadoNuevo: estado }, esperado: 200 });
  }
  const analisis = await api('/api/interno/analisis', {
    metodo: 'POST',
    token,
    body: { muestraId: c.muestraId, parametroId: c.parametroId, valor: 7.2, resultado: '7.2 NTU', unidad: 'NTU' },
    esperado: 201,
  });
  await api(`/api/interno/analisis/${analisis.data.analisis._id}/validar`, { metodo: 'POST', token, esperado: 200 });
  await api(`/api/interno/muestras/${c.muestraId}/estado`, { metodo: 'PATCH', token, body: { estadoNuevo: 'resultados_validados' }, esperado: 200 });
  await api(`/api/interno/muestras/${c.muestraId}/cerrar`, { metodo: 'POST', token, esperado: 200 });

  const MOTIVO_INTERNO = `${MARCA} MOTIVO INTERNO NO PUBLICO`;
  accion('PATCH /api/interno/muestras/{id}/fecha-estimada (motivo + motivoPublico)');
  await api(`/api/interno/muestras/${c.muestraId}/fecha-estimada`, {
    metodo: 'PATCH',
    token,
    body: {
      fechaNueva: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      motivo: MOTIVO_INTERNO,
      motivoPublico: 'Nueva fecha por mantenimiento del equipo',
    },
    esperado: 200,
  });

  const cambioFecha = await CambioFecha.findOne({ muestraId: new mongoose.Types.ObjectId(c.muestraId) }).sort({ createdAt: -1 });
  etiqueta(`DESPUÉS — documento en "${CambioFecha.collection.name}" con los DOS motivos guardados`);
  imprimir(cambioFecha);

  exigir(cambioFecha?.motivo === MOTIVO_INTERNO, 'En la base SÍ está guardado el motivo interno');
  exigir(cambioFecha?.motivoPublico === 'Nueva fecha por mantenimiento del equipo', 'En la base también está el motivoPublico');

  accion('GET /api/publico/seguimiento/{codigoSeguimiento}  (lo que ve el cliente)');
  const publica = await api(`/api/publico/seguimiento/${docMuestra.codigoSeguimiento}`);
  const cambiosPublicos = publica.data.seguimiento?.cambiosFecha || [];
  etiqueta('DESPUÉS — solo esto sale a la superficie pública');
  imprimir(cambiosPublicos[0] ?? null);

  exigir(cambiosPublicos.length >= 1, 'La API pública devuelve el cambio de fecha');
  exigir(
    cambiosPublicos[0]?.motivoPublico === 'Nueva fecha por mantenimiento del equipo',
    'La API pública muestra el motivoPublico',
    cambiosPublicos[0]?.motivoPublico
  );
  exigir(
    !('motivo' in (cambiosPublicos[0] || {})) && !JSON.stringify(publica.data).includes(MOTIVO_INTERNO),
    'La API pública NUNCA devuelve el motivo interno (ni el campo, ni el texto)'
  );

  // ══════════════════ 8. Auditorías: append-only ══════════════════
  paso(8, 'AUDITORÍAS — bitácora que solo crece');
  const auditoriasDespues = await Auditoria.countDocuments({});
  const ultimas = await Auditoria.find({ entidad: { $in: ['usuarios', 'clientes', 'muestras', 'solicitudes', 'cotizaciones', 'pagos'] } })
    .sort({ createdAt: -1 })
    .limit(5);

  etiqueta(`DESPUÉS — ${ultimas.length} de las últimas auditorías del flujo`);
  imprimir(ultimas.map((a) => ({
    createdAt: a.createdAt,
    entidad: a.entidad,
    accion: a.accion,
    antes: a.antes,
    despues: a.despues,
    usuario: a.usuario,
  })));

  exigir(auditoriasDespues > auditoriasInicio, 'La bitácora creció con el flujo', `${auditoriasInicio} → ${auditoriasDespues}`);
  exigir(
    !JSON.stringify(await Auditoria.find({}).sort({ createdAt: -1 }).limit(50)).includes('Segura123'),
    'Ninguna de las últimas 50 auditorías contiene el password en claro'
  );

  // ══════════════════ 9. Índices Únicos ══════════════════
  paso(9, 'ÍNDICES ÚNICOS — protecciones a nivel de base de datos');
  for (const modelo of [Usuario, Muestra, Cotizacion]) {
    const indices = await mongoose.connection.db.collection(modelo.collection.name).indexes();
    etiqueta(`Índices de "${modelo.collection.name}"`);
    console.log(
      indices
        .filter((i) => i.name !== '_id_')
        .map(
          (i) =>
            `      · ${i.name} {${Object.entries(i.key).map(([k, v]) => `${k}:${v}`).join(', ')}}` +
            `${i.unique ? '  [único]' : ''}${i.sparse ? '  [sparse]' : ''}`
        )
        .join('\n') || '      (sin índices propios)'
    );
  }
  const idxUsuario = await mongoose.connection.db.collection(Usuario.collection.name).indexes();
  const idxMuestra = await mongoose.connection.db.collection(Muestra.collection.name).indexes();
  exigir(
    idxUsuario.some((i) => i.unique && i.key.email === 1),
    'usuarios.email tiene índice ÚNICO (no pueden existir dos cuentas con el mismo correo)'
  );
  exigir(
    idxMuestra.some((i) => i.unique && i.key.codigo === 1),
    'muestras.codigo tiene índice ÚNICO'
  );
  exigir(
    idxMuestra.some((i) => i.unique && i.key.codigoSeguimiento === 1),
    'muestras.codigoSeguimiento tiene índice ÚNICO'
  );

  return c;
}

// ===========================================================================
//  Limpieza (mismo criterio que la prueba de humo: borrado lógico)
// ===========================================================================
async function limpiar(c, token) {
  if (!c) return;
  const borrados = [];

  const borrarApi = async (ruta, etiqueta) => {
    if (!ruta) return;
    try {
      const r = await api(ruta, { metodo: 'DELETE', token });
      if (r.status >= 200 && r.status < 300) borrados.push(etiqueta);
      else console.log(`   (no se pudo borrar ${etiqueta}: HTTP ${r.status})`);
    } catch (error) {
      console.log(`   (no se pudo borrar ${etiqueta}: ${error.message})`);
    }
  };

  const borrarLogico = async (modelo, filtro, etiqueta) => {
    if (!filtro) return;
    try {
      const r = await mongoose.connection.db.collection(modelo.collection.name).updateMany(filtro, {
        $set: { eliminado: true, eliminadoPor: 'prueba-persistencia', fechaEliminacion: new Date() },
      });
      if (r.modifiedCount > 0) borrados.push(`${etiqueta} (${r.modifiedCount})`);
    } catch (error) {
      console.log(`   (no se pudo marcar ${etiqueta}: ${error.message})`);
    }
  };

  await borrarApi(c.muestraId && `/api/interno/muestras/${c.muestraId}`, 'muestra');
  await borrarApi(c.solicitudId && `/api/interno/solicitudes/${c.solicitudId}`, 'solicitud');
  await borrarApi(c.clienteId && `/api/interno/clientes/${c.clienteId}`, 'cliente del flujo');
  await borrarApi(c.parametroId && `/api/interno/parametros-analisis/${c.parametroId}`, 'parámetro');
  await borrarApi(c.usuarioId && `/api/interno/usuarios/${c.usuarioId}`, 'usuario');
  // El cliente de demostración (paso 5) ya quedó borrado lógicamente ahí.

  if (c.solicitudId) {
    const solicitudId = new mongoose.Types.ObjectId(c.solicitudId);
    await borrarLogico(Cotizacion, { solicitud: solicitudId }, 'cotizaciones');
    await borrarLogico(Pago, { solicitud: solicitudId }, 'pagos');
  }
  if (c.muestraId) {
    await borrarLogico(Notificacion, { muestraId: new mongoose.Types.ObjectId(c.muestraId) }, 'notificaciones');
  }

  console.log(`\nLimpieza de "${MARCA}": ${borrados.length > 0 ? borrados.join(', ') : 'nada que borrar'}`);
}

// ===========================================================================
async function main() {
  console.log('Prueba de PERSISTENCIA — cambios reflejados en MongoDB Atlas');
  console.log(`Datos de prueba: ${MARCA}`);

  let token = null;
  let contexto = {};
  let errorFlujo = null;

  try {
    await conectarDB();
    console.log(`Base de datos: ${mongoose.connection.db.databaseName}`);

    await asegurarServidor();
    console.log(`Servidor de la API: ${BASE}\n`);

    const login = await api('/api/interno/auth/login', {
      metodo: 'POST',
      body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
      esperado: 200,
    });
    token = login.data.token;
    console.log('Login del admin → JWT\n');

    try {
      await prueba(token, contexto);
    } catch (error) {
      errorFlujo = error;
      console.log(`\n❌ ${error.message}`);
    }
  } finally {
    console.log('\n--- Limpieza de datos de prueba ---');
    try {
      await limpiar(contexto, token);
    } catch (error) {
      console.log(`   La limpieza falló: ${error.message}`);
    }
    if (servidorPropio) {
      servidorPropio.kill();
      await esperaCorta(300);
    }
    try {
      await mongoose.disconnect();
    } catch {
      /* nada */
    }
  }

  const fallidos = resultados.filter((r) => !r.ok);
  console.log('\n=== Resumen de la prueba de persistencia ===');
  console.log(`  Comprobaciones: ${resultados.length}`);
  console.log(`  Correctas     : ${resultados.length - fallidos.length}`);
  console.log(`  Fallidas      : ${fallidos.length}`);
  for (const f of fallidos) console.log(`   ❌ ${f.nombre}${f.detalle ? ` — ${f.detalle}` : ''}`);
  if (errorFlujo) console.log(`  Flujo interrumpido: ${errorFlujo.message}`);
  console.log(
    fallidos.length === 0 && !errorFlujo
      ? '\nResultado: ✅ todos los cambios quedaron reflejados correctamente en la base de datos.'
      : '\nResultado: ❌ hubo comprobaciones fallidas.'
  );
  process.exit(fallidos.length === 0 && !errorFlujo ? 0 : 1);
}

main().catch(async (error) => {
  console.error('\nNo se pudo ejecutar la prueba de persistencia:');
  console.error(`  ${error.message}`);
  if (servidorPropio) servidorPropio.kill();
  try {
    await mongoose.disconnect();
  } catch {
    /* nada */
  }
  process.exit(1);
});
