// Prueba de humo del flujo completo (Fase 8).
//
// Uso:
//   npm test
//   BASE=http://localhost:3000 npm test     (contra un servidor ya corriendo)
//   PUERTO_TEST=3100 npm test
//
// Qué hace:
//   1. Arranca el servidor (src/server.js) en un proceso hijo sobre PUERTO_TEST
//      (por defecto 3100) y espera a que /api/health diga "conectada".
//   2. Recorre el flujo completo del sistema:
//      cliente -> solicitud -> cotización -> aceptación -> pago simulado ->
//      recepción de muestra -> inicio -> resultados -> cierre -> informe ->
//      factura simulada -> consulta pública -> encuesta.
//   3. Comprueba reglas de negocio y de seguridad (401 sin token, 405 en la
//      superficie pública, errores sin stack trace, consulta pública < 2 s,
//      gestión de usuarios solo admin, auditorías solo admin y que el motivo
//      interno de un cambio de fecha nunca sale en la API pública).
//   4. LIMPIA los datos de prueba al terminar (borrado lógico), aunque falle.
//
// Los datos de prueba se marcan con "PRUEBA HUMO" para poder encontrarlos.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { conectarDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Informe } from '../src/modules/informes/informes.model.js';
import { Encuesta } from '../src/modules/encuestas/encuestas.model.js';
import { Factura } from '../src/modules/facturas/facturas.model.js';
import { Pago } from '../src/modules/pagos/pagos.model.js';
import { Cotizacion } from '../src/modules/cotizaciones/cotizaciones.model.js';
import { Notificacion } from '../src/modules/notificaciones/notificaciones.model.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = process.env.PUERTO_TEST || '3100';
const BASE = process.env.BASE || `http://localhost:${PUERTO}`;
const MARCA = `PRUEBA HUMO ${Date.now()}`;

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

// ---------- cliente HTTP ----------
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
    // Los correos pueden tardar hasta ~20 s si el SMTP no responde.
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

// Campos que NUNCA pueden aparecer en la API pública (RF-082 / RNF-004).
const PROHIBIDOS = [
  '_id', 'usuarioId', 'observacionesInternas', 'creadaPor', 'revisadaPor', 'acciones',
  'clienteId', 'solicitudId', 'parametrosSeleccionados', 'ubicacionActual', 'rotuloPdf',
  'eliminadoPor', 'auditoria', 'auditorias', 'archivo', 'documento', 'pagoId',
  'historialEstados', 'generadaPor', 'generadoPor', 'realizadaPor', 'password', 'token',
  'incidenciaId', 'muestraId',
];
function camposProhibidos(objeto, ruta = '') {
  const hallados = [];
  if (objeto === null || typeof objeto !== 'object') return hallados;
  if (Array.isArray(objeto)) {
    objeto.forEach((v, i) => hallados.push(...camposProhibidos(v, `${ruta}[${i}]`)));
    return hallados;
  }
  for (const [k, v] of Object.entries(objeto)) {
    if (PROHIBIDOS.includes(k)) hallados.push(`${ruta}.${k}`);
    hallados.push(...camposProhibidos(v, `${ruta}.${k}`));
  }
  return hallados;
}

// Ninguna respuesta puede filtrar trazas de pila ni rutas internas (RNF-005).
function sinStack(datos) {
  const texto = JSON.stringify(datos) ?? '';
  return !('stack' in (datos ?? {})) && !/\n\s+at /.test(texto) && !/node:internal|[\\/]backend[\\/]/.test(texto);
}

// ---------- servidor ----------
function arrancarServidor() {
  const hijo = spawn(process.execPath, ['src/server.js'], {
    cwd: RAIZ,
    env: { ...process.env, PORT: PUERTO },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  hijo.stdout.on('data', (d) => {
    if (process.env.VERBOSE) process.stdout.write(`[servidor] ${d}`);
  });
  hijo.stderr.on('data', (d) => process.stderr.write(`[servidor] ${d}`));
  return hijo;
}

async function esperarSalud(intentosMax = 60) {
  for (let i = 0; i < intentosMax; i += 1) {
    try {
      const respuesta = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
      const datos = await leerJson(respuesta);
      if (datos.ok && datos.baseDatos === 'conectada') return datos;
      if (datos.ok) throw new Error(`La base de datos está "${datos.baseDatos}"`);
    } catch (error) {
      if (i === intentosMax - 1) throw new Error(`El servidor no arrancó en ${BASE}: ${error.message}`);
      await esperaCorta(500);
    }
  }
  throw new Error('El servidor no respondió');
}

// ===========================================================================
//  Flujo completo
// ===========================================================================
async function flujo(c, token) {
  c.token = token;

  // --- salud y seguridad básica ---
  const salud = await api('/api/health');
  exigir(salud.status === 200 && salud.data.ok === true, 'GET /api/health responde');
  exigir(salud.data.baseDatos === 'conectada', 'La base de datos está conectada', salud.data.baseDatos);

  const sinToken = await api('/api/interno/clientes');
  exigir(sinToken.status === 401, 'Sin token → 401', JSON.stringify(sinToken.data).slice(0, 120));

  const metodoPublico = await fetch(`${BASE}/api/publico/seguimiento/no-existe`, { method: 'PUT' });
  const datosMetodo = await leerJson(metodoPublico);
  exigir(
    metodoPublico.status === 405 && datosMetodo.ok === false,
    'PUT en /api/publico → 405 (solo GET/POST)',
    datosMetodo.mensaje
  );

  // --- login (ya realizado: se comprueba que el token sirve) ---
  const perfil = await api('/api/interno/auth/perfil', { token, esperado: 200 });
  exigir(perfil.data.usuario?.rol === 'admin', 'Perfil propio con JWT', perfil.data.usuario?.email);

  const sinPermiso = await fetch(`${BASE}/api/interno/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'x', numeroDocumento: '1', email: 'x@x.com', tipoCliente: 'interno' }),
  });
  exigir(sinPermiso.status === 401, 'POST sin token → 401');

  const errorJson = await fetch(`${BASE}/api/interno/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{esto no es json',
  });
  const datosError = await leerJson(errorJson);
  exigir(
    errorJson.status >= 400 && errorJson.status < 500,
    'JSON inválido → 4xx',
    `${errorJson.status}: ${datosError.mensaje}`
  );
  exigir(sinStack(datosError), 'El error no filtra stack trace', JSON.stringify(datosError).slice(0, 160));

  // --- gestión de usuarios (solo admin) ---
  const emailEncargado = `encargado.humo.${Date.now()}@example.com`;
  const usuarioCreado = await api('/api/interno/usuarios', {
    metodo: 'POST',
    token: c.token,
    body: {
      nombre: `${MARCA} encargado`,
      email: emailEncargado,
      password: 'Segura123',
      rol: 'encargado',
      permisos: { editar: true, eliminar: false },
    },
    esperado: 201,
  });
  c.usuarioEncargadoId = usuarioCreado.data.usuario?._id;
  exigir(!!c.usuarioEncargadoId, 'Usuario encargado creado por el admin');
  exigir(
    usuarioCreado.data.usuario?.password === undefined,
    'La respuesta de crear usuario nunca incluye el hash del password'
  );

  const passwordCorta = await api('/api/interno/usuarios', {
    metodo: 'POST',
    token: c.token,
    body: { nombre: 'Corto', email: `corto.humo.${Date.now()}@example.com`, password: '1234567', rol: 'usuario' },
  });
  exigir(passwordCorta.status === 400, 'Contraseña menor a 8 caracteres → 400', passwordCorta.data.mensaje);

  const loginEncargado = await api('/api/interno/auth/login', {
    metodo: 'POST',
    body: { email: emailEncargado, password: 'Segura123' },
    esperado: 200,
  });
  c.tokenEncargado = loginEncargado.data.token;
  exigir(
    loginEncargado.data.usuario?.rol === 'encargado',
    'Login con el encargado recién creado'
  );

  // Regla: la gestión de usuarios es exclusiva del admin.
  const creacionNoAdmin = await api('/api/interno/usuarios', {
    metodo: 'POST',
    token: c.tokenEncargado,
    body: { nombre: 'No Debe', email: `nodebe.humo.${Date.now()}@example.com`, password: 'Segura123', rol: 'usuario' },
  });
  exigir(
    creacionNoAdmin.status === 403,
    'El encargado NO puede crear usuarios → 403',
    creacionNoAdmin.data.mensaje
  );

  const listadoNoAdmin = await api('/api/interno/usuarios', { token: c.tokenEncargado });
  exigir(listadoNoAdmin.status === 403, 'El encargado NO puede listar usuarios → 403', listadoNoAdmin.data.mensaje);

  // --- auditorías (solo admin, solo lectura) ---
  const auditorias = await api('/api/interno/auditorias?limite=5', { token: c.token, esperado: 200 });
  exigir(
    Array.isArray(auditorias.data.auditorias) && auditorias.data.paginacion?.total >= 1,
    'GET /api/interno/auditorias (admin) con paginación',
    `total: ${auditorias.data.paginacion?.total}`
  );
  const auditoriasNoAdmin = await api('/api/interno/auditorias', { token: c.tokenEncargado });
  exigir(
    auditoriasNoAdmin.status === 403,
    'El encargado NO puede ver auditorías → 403',
    auditoriasNoAdmin.data.mensaje
  );

  // --- parámetro de análisis ---
  const parametro = await api('/api/interno/parametros-analisis', {
    metodo: 'POST',
    token: c.token,
    body: {
      nombre: `${MARCA} turbidez`,
      descripcion: 'parámetro de la prueba de humo',
      precio: 10000,
      unidad: 'NTU',
      activo: true,
    },
    esperado: 201,
  });
  c.parametroId = parametro.data.parametro._id;
  exigir(!!c.parametroId, 'Parámetro de análisis creado');

  // --- cliente ---
  const cliente = await api('/api/interno/clientes', {
    metodo: 'POST',
    token: c.token,
    body: {
      nombre: `${MARCA} cliente`,
      numeroDocumento: `${Date.now()}`.slice(-10),
      email: `prueba.humo.${Date.now()}@example.com`,
      tipoCliente: 'externo',
      tipoDocumento: 'CC',
      telefono: '3001234567',
      direccion: 'Calle 1 # 2-3',
    },
    esperado: 201,
  });
  c.clienteId = cliente.data.cliente._id;
  exigir(!!c.clienteId, 'Cliente creado');

  // --- solicitud ---
  const solicitud = await api('/api/interno/solicitudes', {
    metodo: 'POST',
    token: c.token,
    body: {
      cliente: c.clienteId,
      tipoCliente: 'externo',
      descripcion: `${MARCA} flujo completo`,
      prioridad: 'media',
      atencionInmediata: false,
    },
    esperado: 201,
  });
  c.solicitudId = solicitud.data.solicitud._id;
  exigir(
    solicitud.data.solicitud.requierePago === true,
    'Solicitud creada (externa → requiere pago)',
    `estado: ${solicitud.data.solicitud.estado}`
  );

  // --- cotización ---
  const cotizacion = await api('/api/interno/cotizaciones', {
    metodo: 'POST',
    token: c.token,
    body: {
      solicitud: c.solicitudId,
      items: [{ parametro: c.parametroId, cantidad: 1, descripcion: 'Análisis de turbidez' }],
    },
    esperado: 201,
  });
  c.cotizacionId = cotizacion.data.cotizacion._id;
  exigir(
    Number.isInteger(cotizacion.data.cotizacion.numero) && cotizacion.data.cotizacion.numero > 0,
    'Cotización creada con número consecutivo',
    String(cotizacion.data.cotizacion.numero)
  );

  // --- aceptación ---
  const aceptada = await api(`/api/interno/cotizaciones/${c.cotizacionId}/aceptar`, {
    metodo: 'POST',
    token: c.token,
    esperado: 200,
  });
  exigir(aceptada.data.cotizacion.estado === 'aceptada', 'Cotización aceptada');

  // --- pago simulado ---
  const pago = await api('/api/interno/pagos', {
    metodo: 'POST',
    token: c.token,
    body: { cotizacion: c.cotizacionId },
    esperado: 201,
  });
  c.referencia = pago.data.pago.referencia;
  exigir(
    String(c.referencia).length > 5 && pago.data.pago.metodo === 'simulado',
    'Pago simulado generado (sin pasarela)',
    c.referencia
  );

  // Regla: no se recibe una muestra externa sin pago confirmado.
  const bloqueoSinPago = await api('/api/interno/muestras', {
    metodo: 'POST',
    token: c.token,
    body: { solicitudId: c.solicitudId, nombreMuestra: `${MARCA} agua`, tipoFisico: 'liquido', cantidad: 450 },
  });
  exigir(
    bloqueoSinPago.status === 400,
    'Recepción bloqueada sin pago confirmado',
    bloqueoSinPago.data.mensaje
  );

  const confirmacion = await api(`/api/interno/pagos/${c.referencia}/confirmar`, {
    metodo: 'POST',
    token: c.token,
    esperado: 200,
  });
  exigir(
    confirmacion.data.pago.estado === 'confirmado',
    'Pago confirmado (simulado)',
    confirmacion.data.mensaje
  );

  // --- recepción de la muestra ---
  const muestra = await api('/api/interno/muestras', {
    metodo: 'POST',
    token: c.token,
    body: {
      solicitudId: c.solicitudId,
      nombreMuestra: `${MARCA} agua`,
      descripcion: 'muestra de la prueba de humo',
      tipoFisico: 'liquido',
      cantidad: 450,
      verificacionFisica: false,
    },
    esperado: 201,
  });
  c.muestraId = muestra.data.muestra._id;
  exigir(
    muestra.data.muestra.estadoRecepcion === 'pendiente' && muestra.data.muestra.unidad === 'ml',
    'Muestra recibida',
    `estado: ${muestra.data.muestra.estado}`
  );

  // --- aceptación: genera código y códigoSeguimiento ---
  const aceptarMuestra = await api(`/api/interno/muestras/${c.muestraId}/aceptar`, {
    metodo: 'POST',
    token: c.token,
    esperado: 200,
  });
  c.codigo = aceptarMuestra.data.muestra.codigo;
  c.codigoSeguimiento = aceptarMuestra.data.muestra.codigoSeguimiento;
  exigir(/^\d{4}-\d{4}$/.test(String(c.codigo)), 'Código consecutivo generado', c.codigo);
  exigir(
    /^[a-f0-9]{32}$/.test(String(c.codigoSeguimiento)) && c.codigoSeguimiento !== c.codigo,
    'codigoSeguimiento aleatorio y distinto del código',
    c.codigoSeguimiento
  );

  // --- parámetros de la muestra ---
  const parametros = await api(`/api/interno/muestras/${c.muestraId}/parametros`, {
    metodo: 'PATCH',
    token: c.token,
    body: { parametrosIds: [c.parametroId] },
    esperado: 200,
  });
  exigir(
    parametros.data.muestra.parametrosSeleccionados.length === 1,
    'Parámetros asignados a la muestra'
  );

  // --- inicio ---
  const inicio = await api(`/api/interno/muestras/${c.muestraId}/iniciar`, {
    metodo: 'POST',
    token: c.token,
    esperado: 200,
  });
  exigir(!!inicio.data.muestra.fechaInicio, 'Análisis iniciado con pago confirmado');

  // --- estados ---
  for (const estado of ['en_proceso', 'en_analisis']) {
    const cambio = await api(`/api/interno/muestras/${c.muestraId}/estado`, {
      metodo: 'PATCH',
      token: c.token,
      body: { estadoNuevo: estado },
      esperado: 200,
    });
    exigir(cambio.data.muestra.estado === estado, `Estado → ${estado}`);
  }

  // --- resultados ---
  const analisis = await api('/api/interno/analisis', {
    metodo: 'POST',
    token: c.token,
    body: {
      muestraId: c.muestraId,
      parametroId: c.parametroId,
      valor: 7.2,
      resultado: '7.2 NTU',
      unidad: 'NTU',
    },
    esperado: 201,
  });
  c.analisisId = analisis.data.analisis._id;
  exigir(analisis.data.analisis.tipo === 'inicial', 'Resultado registrado');

  const validado = await api(`/api/interno/analisis/${c.analisisId}/validar`, {
    metodo: 'POST',
    token: c.token,
    esperado: 200,
  });
  exigir(validado.data.analisis.estado === 'validado', 'Resultado validado');

  const validados = await api(`/api/interno/muestras/${c.muestraId}/estado`, {
    metodo: 'PATCH',
    token: c.token,
    body: { estadoNuevo: 'resultados_validados' },
    esperado: 200,
  });
  exigir(validados.data.muestra.estado === 'resultados_validados', 'Estado → resultados_validados');

  // --- cierre ---
  const cierre = await api(`/api/interno/muestras/${c.muestraId}/cerrar`, {
    metodo: 'POST',
    token: c.token,
    esperado: 200,
  });
  exigir(
    cierre.data.muestra.estado === 'cerrada' && !!cierre.data.muestra.fechaLimiteConservacion,
    'Muestra cerrada con fecha límite de conservación (7 días hábiles)',
    String(cierre.data.muestra.fechaLimiteConservacion).slice(0, 10)
  );

  // --- cambio de fecha con motivo interno y motivo público ---
  const MOTIVO_INTERNO = `${MARCA} MOTIVO INTERNO NO PUBLICO`;
  c.motivoInterno = MOTIVO_INTERNO;
  const cambioFecha = await api(`/api/interno/muestras/${c.muestraId}/fecha-estimada`, {
    metodo: 'PATCH',
    token: c.token,
    body: {
      fechaNueva: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      motivo: MOTIVO_INTERNO,
      motivoPublico: 'Nueva fecha por mantenimiento del equipo',
    },
    esperado: 200,
  });
  exigir(
    !!cambioFecha.data.muestra?.fechaEstimadaEntrega,
    'Cambio de fecha con motivo interno y motivo público'
  );

  // --- informe ---
  const informe = await api('/api/interno/informes/generar', {
    metodo: 'POST',
    token: c.token,
    body: { muestraId: c.muestraId },
    esperado: 201,
  });
  c.informeId = informe.data.informe._id;
  exigir(
    /^\d{4}-\d{4}$/.test(String(informe.data.informe.numeroInforme)),
    'Informe generado',
    informe.data.informe.numeroInforme
  );

  const disponible = await api(`/api/interno/informes/${c.informeId}/disponible`, {
    metodo: 'POST',
    token: c.token,
    esperado: 200,
  });
  exigir(
    disponible.data.informe.estado === 'disponible',
    'Informe disponible (crea la encuesta de satisfacción)'
  );

  // --- factura simulada ---
  const factura = await api('/api/interno/facturas/generar', {
    metodo: 'POST',
    token: c.token,
    body: { solicitudId: c.solicitudId },
    esperado: 201,
  });
  c.facturaId = factura.data.factura._id;
  exigir(
    factura.data.factura.estado === 'generada' && factura.data.factura.documento?.simulado === true,
    'Factura SIMULADA generada (sin enviar nada a la DIAN)',
    factura.data.factura.numero
  );

  // --- consulta pública ---
  const inicioConsulta = Date.now();
  const publica = await api(`/api/publico/seguimiento/${c.codigoSeguimiento}`);
  const duracion = Date.now() - inicioConsulta;
  exigir(publica.status === 200 && publica.data.ok === true, 'Consulta pública por códigoSeguimiento');
  exigir(duracion < 2000, 'Consulta pública < 2 s (RNF-013)', `${duracion} ms`);
  const fugas = camposProhibidos(publica.data);
  exigir(fugas.length === 0, 'La respuesta pública no expone campos internos', fugas.join(', '));
  exigir(
    publica.data.seguimiento?.estado === 'cerrada',
    'La consulta pública devuelve el estado actual',
    publica.data.seguimiento?.estado
  );

  // Motivo del cambio de fecha: solo sale el motivo público, nunca el interno.
  const cambiosPublicos = publica.data.seguimiento?.cambiosFecha || [];
  exigir(cambiosPublicos.length >= 1, 'La consulta pública incluye el cambio de fecha');
  exigir(
    cambiosPublicos[0]?.motivoPublico === 'Nueva fecha por mantenimiento del equipo',
    'La consulta pública muestra el motivoPublico',
    cambiosPublicos[0]?.motivoPublico
  );
  exigir(
    !('motivo' in (cambiosPublicos[0] || {})),
    'La consulta pública NUNCA incluye el campo "motivo" (interno)'
  );
  exigir(
    !JSON.stringify(publica.data).includes(c.motivoInterno),
    'El motivo interno no aparece en ninguna parte de la respuesta pública'
  );

  const publicaInvalida = await api('/api/publico/seguimiento/00000000000000000000000000000000');
  exigir(publicaInvalida.status === 404, 'Código de seguimiento inexistente → 404', publicaInvalida.data.mensaje);

  // --- encuesta ---
  const encuestas = await api(`/api/interno/encuestas?muestraId=${c.muestraId}`, {
    token: c.token,
    esperado: 200,
  });
  const encuesta = (encuestas.data.encuestas || [])[0];
  exigir(!!encuesta?.token, 'Encuesta creada con token', encuesta?.token);

  const verEncuesta = await api(`/api/publico/encuestas/${encuesta.token}`);
  exigir(verEncuesta.status === 200, 'Encuesta visible por token público');

  const responder = await api(`/api/publico/encuestas/${encuesta.token}`, {
    metodo: 'POST',
    body: {
      respuestas: verEncuesta.data.encuesta.preguntas.map((pregunta, i) => ({
        pregunta,
        calificacion: i === 1 ? 4 : 5,
        comentario: i === 0 ? MARCA : '',
      })),
    },
    esperado: 201,
  });
  exigir(
    responder.data.encuesta.estado === 'respondida',
    'Encuesta respondida por el cliente (respuesta única)'
  );

  const repetir = await api(`/api/publico/encuestas/${encuesta.token}`, {
    metodo: 'POST',
    body: { respuestas: [{ pregunta: 'x', calificacion: 3 }] },
  });
  exigir(repetir.status === 409, 'Segunda respuesta a la encuesta → 409', repetir.data.mensaje);

  return c;
}

// ===========================================================================
//  Limpieza de los datos de prueba (borrado lógico)
// ===========================================================================
async function limpiar(c, token) {
  if (!c) return;
  const borrados = [];

  const borrarApi = async (ruta, etiqueta) => {
    if (!ruta) return;
    try {
      const r = await api(ruta, { metodo: 'DELETE', token });
      if (r.status >= 200 && r.status < 300) borrados.push(etiqueta);
      else console.log(`   (no se pudo borrar ${etiqueta}: HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 140)})`);
    } catch (error) {
      console.log(`   (no se pudo borrar ${etiqueta}: ${error.message})`);
    }
  };

  const borrarLogico = async (modelo, filtro, etiqueta) => {
    if (!filtro) return;
    try {
      const r = await modelo.updateMany(filtro, {
        $set: {
          eliminado: true,
          eliminadoPor: 'prueba-humo',
          fechaEliminacion: new Date(),
        },
      });
      if (r.modifiedCount > 0) borrados.push(`${etiqueta} (${r.modifiedCount})`);
    } catch (error) {
      console.log(`   (no se pudo marcar ${etiqueta}: ${error.message})`);
    }
  };

  await borrarApi(c.muestraId && `/api/interno/muestras/${c.muestraId}`, 'muestra');
  await borrarApi(c.solicitudId && `/api/interno/solicitudes/${c.solicitudId}`, 'solicitud');
  await borrarApi(c.clienteId && `/api/interno/clientes/${c.clienteId}`, 'cliente');
  await borrarApi(c.parametroId && `/api/interno/parametros-analisis/${c.parametroId}`, 'parámetro');
  await borrarApi(c.usuarioEncargadoId && `/api/interno/usuarios/${c.usuarioEncargadoId}`, 'usuario encargado');

  try {
    await conectarDB();
    if (c.muestraId) {
      const muestraId = new mongoose.Types.ObjectId(c.muestraId);
      await borrarLogico(Informe, { muestraId }, 'informes');
      await borrarLogico(Encuesta, { muestraId }, 'encuestas');
      await borrarLogico(Notificacion, { muestraId }, 'notificaciones');
    }
    if (c.solicitudId) {
      const solicitudId = new mongoose.Types.ObjectId(c.solicitudId);
      await borrarLogico(Factura, { solicitudId }, 'facturas');
      await borrarLogico(Pago, { solicitud: solicitudId }, 'pagos');
      await borrarLogico(Cotizacion, { solicitud: solicitudId }, 'cotizaciones');
    }
    await mongoose.disconnect();
  } catch (error) {
    console.log(`   (limpieza en la base: ${error.message})`);
  }

  console.log(`\nLimpieza de "${MARCA}": ${borrados.length > 0 ? borrados.join(', ') : 'nada que borrar'}`);
}

// ===========================================================================
async function main() {
  console.log('Prueba de humo del flujo completo (Fase 8)');
  console.log(`Base: ${BASE}`);
  console.log(`Datos de prueba: ${MARCA}\n`);

  let servidor = null;
  let servidoresPropios = false;
  let contexto = {};
  let token = null;
  let errorFlujo = null;

  try {
    // ¿Ya hay un servidor en BASE? Si no, arrancamos el nuestro.
    try {
      const previo = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
      const datos = await leerJson(previo);
      if (!datos.ok) throw new Error('sin servidor');
    } catch {
      servidor = arrancarServidor();
      servidoresPropios = true;
    }

    const salud = await esperarSalud();
    console.log(`Servidor listo (${salud.baseDatos}).\n`);

    try {
      const login = await api('/api/interno/auth/login', {
        metodo: 'POST',
        body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
        esperado: 200,
      });
      token = login.data.token;
      comprobar(true, 'Login del admin → JWT');

      // El contexto se pasa vacío y se rellena sobre la marcha: si el flujo
      // falla a mitad, la limpieza igual borra lo que sí se llegó a crear.
      contexto = contexto || {};
      await flujo(contexto, token);
    } catch (error) {
      errorFlujo = error;
      resultados.push({ ok: false, nombre: 'Flujo completo', detalle: error.message });
      console.log(`\n❌ ${error.message}`);
    }
  } finally {
    console.log('\n--- Limpieza de datos de prueba ---');
    try {
      await limpiar(contexto, token);
    } catch (error) {
      console.log(`   La limpieza falló: ${error.message}`);
    }
    if (servidor && servidoresPropios) {
      servidor.kill();
      await esperaCorta(300);
    }
  }

  const fallidos = resultados.filter((r) => !r.ok);
  console.log('\n=== Resumen de la prueba de humo ===');
  console.log(`  Comprobaciones: ${resultados.length}`);
  console.log(`  Correctas     : ${resultados.length - fallidos.length}`);
  console.log(`  Fallidas      : ${fallidos.length}`);
  if (fallidos.length > 0) {
    for (const f of fallidos) console.log(`   ❌ ${f.nombre}: ${f.detalle}`);
  }
  console.log(
    fallidos.length === 0 && !errorFlujo
      ? '\nResultado: ✅ el flujo completo funcionó de punta a punta.'
      : '\nResultado: ❌ la prueba de humo encontró problemas.'
  );

  process.exit(fallidos.length === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('\nLa prueba de humo no pudo ejecutarse:');
  console.error(`  ${error.message}`);
  process.exit(1);
});
