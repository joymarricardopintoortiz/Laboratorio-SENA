// Verificación de la Fase 7 (RF-086 a RF-106, RNF-017).
//
// Uso:
//   1. Arranca el servidor:            node src/server.js      (o npm run dev)
//   2. Ejecuta:                        node scripts/verificarFase7.js
//      Opcional:                       BASE=http://localhost:3001 node scripts/verificarFase7.js
//
// Modo producción de Factus (rechazo de URL de producción):
//   - Arranca OTRO servidor con:  FACTUS_BASE_URL=https://api.factus.co node src/server.js
//   - Ejecuta:                    VERIFICAR_PRODUCCION=1 BASE=http://localhost:3002 node scripts/verificarFase7.js
//
// Crea datos de prueba claramente identificados ("PRUEBA FASE 7") y los deja en
// borrado lógico al terminar.
import 'dotenv/config';
import mongoose from 'mongoose';
import { conectarDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Usuario } from '../src/modules/usuarios/usuarios.model.js';
import { Informe } from '../src/modules/informes/informes.model.js';
import { Encuesta } from '../src/modules/encuestas/encuestas.model.js';
import { Disposicion } from '../src/modules/disposiciones/disposiciones.model.js';
import { Factura } from '../src/modules/facturas/facturas.model.js';
import { Pago } from '../src/modules/pagos/pagos.model.js';
import { Cotizacion } from '../src/modules/cotizaciones/cotizaciones.model.js';
import { sumarDiasHabiles, esHabil, claveFecha } from '../src/utils/diasHabiles.js';
import { motivoUrlProhibida, detectarModo, MODO_SIMULADO } from '../src/services/factus.service.js';

const BASE = process.env.BASE || 'http://localhost:3000';
const resultados = [];

function registrar(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle });
  console.log(`${ok ? '✅' : '❌'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

const json = async (r) => {
  const texto = await r.text();
  try { return JSON.parse(texto); } catch { return { crudo: texto }; }
};

async function api(ruta, { metodo = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !form) headers['Content-Type'] = 'application/json';
  // Convención: todo lo que no sea /publico ni /health es interno.
  const prefijo = ruta.startsWith('/publico') || ruta.startsWith('/health') ? '/api' : '/api/interno';
  const respuesta = await fetch(`${BASE}${prefijo}${ruta}`, {
    method: metodo,
    headers,
    body: form ? form : body ? JSON.stringify(body) : undefined,
  });
  return { status: respuesta.status, data: await json(respuesta), headers: respuesta.headers };
}

// Campos que NUNCA pueden aparecer en la API pública (RF-082 / RNF-004 / RF-106).
const PROHIBIDOS = [
  '_id', 'usuarioId', 'observacionesInternas', 'creadaPor', 'revisadaPor',
  'acciones', 'clienteId', 'solicitudId', 'parametrosSeleccionados',
  'ubicacionActual', 'rotuloPdf', 'eliminadoPor', 'auditoria', 'auditorias',
  'archivo', 'documento', 'pagoId', 'historialEstados', 'generadaPor',
  'generadoPor', 'realizadaPor', 'password', 'token',
];

function buscarProhibidos(obj, ruta = '') {
  const hallados = [];
  if (obj === null || typeof obj !== 'object') return hallados;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => hallados.push(...buscarProhibidos(v, `${ruta}[${i}]`)));
    return hallados;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (PROHIBIDOS.includes(k)) hallados.push(`${ruta}.${k}`);
    hallados.push(...buscarProhibidos(v, `${ruta}.${k}`));
  }
  return hallados;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// El rate limit de Fase 6 comparte ventana con esta prueba: espera a que se libere.
async function esperarRateLimit() {
  for (let i = 0; i < 24; i += 1) {
    const r = await fetch(`${BASE}/api/publico/seguimiento/prueba-ventana-libre`);
    if (r.status !== 429) return true;
    await dormir(5000);
  }
  return false;
}

async function login(email, password) {
  const r = await api('/auth/login', { metodo: 'POST', body: { email, password } });
  return r.data?.token || r.data?.jwt || null;
}

// ---------------------------------------------------------------------------
// Modo 1: rechazo de una URL de producción de Factus.
// ---------------------------------------------------------------------------
async function verificarProduccion() {
  console.log(`\n=== Verificación Fase 7 (PRODUCCIÓN de Factus) contra ${BASE} ===\n`);

  const salud = await api('/health');
  if (salud.status !== 200) { console.error('El servidor no está arriba:', salud.status); process.exit(1); }

  const token = await login(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  if (!token) { console.error('Login fallido'); process.exit(1); }
  registrar('Login de administrador', true, 'servidor iniciado con FACTUS_BASE_URL de producción');

  const r = await api('/facturas/generar', {
    metodo: 'POST', token, body: { solicitudId: new mongoose.Types.ObjectId().toString() },
  });
  registrar(
    'URL de producción de Factus rechazada con error claro (RF-116)',
    r.status === 400 && /PRODUCCIÓN/i.test(r.data?.mensaje || ''),
    `status=${r.status} | ${r.data?.mensaje}`
  );

  const reintento = await api(`/facturas/${new mongoose.Types.ObjectId()}/reintentar`, { metodo: 'POST', token });
  registrar(
    'El reintento también valida la URL de producción',
    reintento.status === 400 && /PRODUCCIÓN/i.test(reintento.data?.mensaje || ''),
    `status=${reintento.status} | ${reintento.data?.mensaje}`
  );

  return resumen();
}

function resumen() {
  const fallidos = resultados.filter((r) => !r.ok);
  console.log(`\n=== Resultado: ${resultados.length - fallidos.length}/${resultados.length} pruebas OK ===`);
  if (fallidos.length) {
    console.log('Pruebas fallidas:');
    fallidos.forEach((f) => console.log(`  ❌ ${f.nombre} — ${f.detalle}`));
    return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Modo 2: verificación completa de la Fase 7.
// ---------------------------------------------------------------------------
async function main() {
  if (process.env.VERIFICAR_PRODUCCION === '1') {
    return process.exit(await verificarProduccion());
  }
  console.log(`\n=== Verificación Fase 7 contra ${BASE} ===\n`);

  // ==================================================== 0) pruebas unitarias
  console.log('--- Unidades: días hábiles y validación de Factus ---');
  registrar(
    'sumarDiasHabiles cruza fin de semana y festivo (01 may 2026)',
    claveFecha(sumarDiasHabiles('2026-04-29T12:00:00', 7)) === '2026-05-11',
    `2026-04-29 + 7 hábiles = ${claveFecha(sumarDiasHabiles('2026-04-29T12:00:00', 7))} (esperado 2026-05-11)`
  );
  registrar(
    'sumarDiasHabiles: si el día de origen es festivo, arranca desde el siguiente hábil',
    claveFecha(sumarDiasHabiles('2026-05-01T12:00:00', 1)) === '2026-05-04',
    `2026-05-01 (viernes festivo) + 1 hábil = ${claveFecha(sumarDiasHabiles('2026-05-01T12:00:00', 1))} (esperado 2026-05-04)`
  );
  registrar(
    'esHabil excluye sábados, domingos y festivos',
    !esHabil('2026-05-02') && !esHabil('2026-05-03') && !esHabil('2026-05-01') && esHabil('2026-05-04'),
    'sáb/dom/festivo = false, lunes = true'
  );

  const urlProduccion = motivoUrlProhibida('https://api.factus.co');
  const urlSandbox = motivoUrlProhibida('https://api-sandbox.factus.co');
  const urlDian = motivoUrlProhibida('https://api.dian.gov.co/factura');
  const urlVacia = motivoUrlProhibida('');
  const urlLocal = motivoUrlProhibida('http://localhost:9999');
  let modo = MODO_SIMULADO;
  try { modo = detectarModo(); } catch (e) { modo = `RECHAZADO: ${e.mensaje || e.message}`; }
  registrar('Rechaza la URL de producción de Factus', Boolean(urlProduccion) && /PRODUCCIÓN/i.test(urlProduccion), urlProduccion || 'sin motivo');
  registrar('Rechaza cualquier destino que hable con la DIAN', Boolean(urlDian) && /DIAN/i.test(urlDian), urlDian || 'sin motivo');
  registrar('Acepta la URL de SANDBOX', urlSandbox === null, urlSandbox || 'permitida');
  registrar('URL vacía = modo simulado (permitida)', urlVacia === null, urlVacia || 'permitida');
  registrar('Acepta localhost para pruebas', urlLocal === null, urlLocal || 'permitida');
  registrar('Modo de Factus detectado', true, `${modo}${modo === MODO_SIMULADO ? ' (sin credenciales en .env)' : ''}`);

  // ==================================================== 1) salud y sesión
  const salud = await api('/health');
  if (salud.status !== 200 || salud.data.baseDatos !== 'conectada') {
    console.error('El servidor no está arriba o no tiene BD:', salud.status, salud.data);
    process.exit(1);
  }
  registrar('Servidor arriba y base de datos conectada', true, `estado=${salud.data.baseDatos}`);

  const ventana = await esperarRateLimit();
  registrar('Ventana de rate limit libre para las pruebas públicas', ventana, ventana ? 'lista' : 'aún bloqueada (429)');

  const token = await login(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  if (!token) { console.error('No se pudo iniciar sesión:', env.ADMIN_EMAIL); process.exit(1); }
  registrar('Login de administrador', true);

  // Usuario de solo lectura (rol "usuario") para probar requireRole.
  // Se busca también en los borrados lógicos: el email es único en la colección.
  await conectarDB();
  const usuarios = mongoose.connection.collection('usuarios');
  const emailLector = 'lector.fase7@example.com';
  const existente = await usuarios.findOne({ email: emailLector });
  if (existente) {
    await usuarios.updateOne({ _id: existente._id }, { $set: { eliminado: false } });
  } else {
    await Usuario.create({
      nombre: 'PRUEBA FASE 7 lector',
      email: emailLector,
      password: 'LectorFase7!',
      rol: 'usuario',
    });
  }
  const lector = await Usuario.findOne({ email: emailLector });
  const tokenLector = await login(emailLector, 'LectorFase7!');
  registrar('Login de usuario con rol "usuario" (solo lectura)', Boolean(tokenLector) && Boolean(lector));

  // ==================================================== 2) datos de prueba
  const marca = Date.now();
  const cliente = (await api('/clientes', {
    metodo: 'POST', token,
    body: {
      nombre: `PRUEBA FASE 7 cliente ${marca}`,
      numeroDocumento: `777${String(marca).slice(-7)}`,
      email: env.MAIL_USER || 'prueba.fase7@example.com',
      tipoCliente: 'interno',
    },
  })).data.cliente;

  const solicitud = (await api('/solicitudes', {
    metodo: 'POST', token,
    body: { cliente: cliente._id, tipoCliente: 'interno', descripcion: 'PRUEBA FASE 7' },
  })).data.solicitud;

  // Parámetro: se reutiliza uno del catálogo o se crea uno de prueba.
  const catalogo = (await api('/parametros-analisis', { token })).data.parametros || [];
  let parametro = catalogo[0];
  if (!parametro) {
    parametro = (await api('/parametros-analisis', {
      metodo: 'POST', token,
      body: { nombre: `PRUEBA FASE 7 parámetro ${marca}`, precio: 10000, unidad: 'NTU' },
    })).data.parametro;
  }

  const muestra = (await api('/muestras', {
    metodo: 'POST', token,
    body: { solicitudId: solicitud._id, nombreMuestra: 'PRUEBA FASE 7 agua', tipoFisico: 'liquido', cantidad: 450 },
  })).data.muestra;
  const aceptada = (await api(`/muestras/${muestra._id}/aceptar`, { metodo: 'POST', token })).data.muestra;
  const codigo = aceptada.codigoSeguimiento;
  const parametros = (await api(`/muestras/${muestra._id}/parametros`, {
    metodo: 'PATCH', token, body: { parametrosIds: [parametro._id] },
  })).status;
  registrar('Datos de prueba creados (cliente, solicitud, muestra aceptada)', Boolean(codigo) && parametros === 200,
    `codigo=${codigo}, parametro=${parametro?.nombre}, asignarParametros=${parametros}`);

  // ========================================= 3) disposición sobre muestra NO cerrada
  const sobreAbierta = await api('/disposiciones', {
    metodo: 'POST', token,
    body: { muestraId: muestra._id, tipo: 'devolucion', motivo: 'PRUEBA FASE 7 sin cerrar' },
  });
  registrar('Disposición sobre muestra no cerrada → 400 (RF-087)',
    sobreAbierta.status === 400 && /cerradas o rechazadas/i.test(sobreAbierta.data?.mensaje || ''),
    `status=${sobreAbierta.status} | ${sobreAbierta.data?.mensaje}`);

  // ========================================= 4) análisis: informe con resultados pendientes
  await api(`/muestras/${muestra._id}/estado`, { metodo: 'PATCH', token, body: { estadoNuevo: 'en_proceso' } });
  await api(`/muestras/${muestra._id}/estado`, { metodo: 'PATCH', token, body: { estadoNuevo: 'en_analisis' } });

  const analisis = (await api('/analisis', {
    metodo: 'POST', token,
    body: { muestraId: muestra._id, parametroId: parametro._id, valor: 7.2, resultado: '7.2', unidad: 'pH' },
  })).data.analisis;

  const informePendiente = await api('/informes/generar', {
    metodo: 'POST', token, body: { muestraId: muestra._id },
  });
  registrar('Informe con resultados pendientes → 400 (RF-095)',
    informePendiente.status === 400 && /sin validar/i.test(informePendiente.data?.mensaje || ''),
    `status=${informePendiente.status} | ${informePendiente.data?.mensaje}`);

  await api(`/analisis/${analisis._id}/validar`, { metodo: 'POST', token });

  // ========================================= 5) generar el informe (PDF)
  const generado = await api('/informes/generar', { metodo: 'POST', token, body: { muestraId: muestra._id } });
  const informe = generado.data?.informe;
  registrar('Informe con todos los resultados validados → generado',
    generado.status === 201 && /^\d{4}-\d{4}$/.test(informe?.numeroInforme || ''),
    `status=${generado.status}, numero=${informe?.numeroInforme}`);
  registrar('El informe nace en estado "generado"', informe?.estado === 'generado', `estado=${informe?.estado}`);

  const descarga = await fetch(`${BASE}/api/interno/informes/${informe._id}/descargar`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const bytes = Buffer.from(await descarga.arrayBuffer());
  registrar('Descarga interna del PDF (RF-096)',
    descarga.status === 200 && /pdf/i.test(descarga.headers.get('content-type') || '') && bytes.subarray(0, 4).toString() === '%PDF',
    `status=${descarga.status}, tipo=${descarga.headers.get('content-type')}, bytes=${bytes.length}`);

  // ========================================= 6) marcar disponible + encuesta
  const disponible = await api(`/informes/${informe._id}/disponible`, { metodo: 'POST', token });
  registrar('Marcar informe disponible (RF-096)',
    disponible.status === 200 && disponible.data?.informe?.estado === 'disponible'
      && Boolean(disponible.data?.informe?.fechaDisponibilidad),
    `status=${disponible.status}, estado=${disponible.data?.informe?.estado}`);

  const encuestas = (await api(`/encuestas?muestraId=${muestra._id}`, { token })).data.encuestas || [];
  const encuesta = encuestas[0];
  registrar('Al entregar el informe se creó la encuesta de satisfacción (RF-099)',
    encuestas.length >= 1 && Boolean(encuesta?.token) && encuesta?.estado === 'pendiente',
    `cantidad=${encuestas.length}, estado=${encuesta?.estado}`);

  // ========================================= 7) API pública con informe
  const publica1 = await api(`/publico/seguimiento/${codigo}`);
  const s1 = publica1.data?.seguimiento;
  registrar('La consulta pública muestra la disponibilidad del informe (solo estado y fecha)',
    publica1.status === 200 && s1?.informe?.disponible === true && Boolean(s1?.informe?.fecha)
      && !('archivo' in (s1?.informe || {})),
    `informe=${JSON.stringify(s1?.informe)}`);
  registrar('La consulta pública no filtra campos internos ni el PDF',
    buscarProhibidos(publica1.data).length === 0, buscarProhibidos(publica1.data).join(', ') || 'ninguno');

  const descargaPublica = await fetch(`${BASE}/api/publico/seguimiento/${codigo}/informe`);
  const pdfPublico = Buffer.from(await descargaPublica.arrayBuffer());
  registrar('Descarga pública del PDF con el codigoSeguimiento (RF-083)',
    descargaPublica.status === 200 && pdfPublico.subarray(0, 4).toString() === '%PDF'
      && /pdf/i.test(descargaPublica.headers.get('content-type') || ''),
    `status=${descargaPublica.status}, bytes=${pdfPublico.length}`);

  const descargaMala = await fetch(`${BASE}/api/publico/seguimiento/codigo-que-no-existe/informe`);
  registrar('Descarga pública con código inválido → 404', descargaMala.status === 404,
    `status=${descargaMala.status}`);

  // ========================================= 8) enviar el informe al cliente
  const enviado = await api(`/informes/${informe._id}/enviar`, { metodo: 'POST', token, body: {} });
  const notiResultados = (enviado.data?.notificacion) || null;
  registrar('Enviar informe al cliente (RF-097, notificación resultados_disponibles)',
    enviado.status === 200 && notiResultados?.tipo === 'resultados_disponibles'
      && ['enviada', 'fallida'].includes(notiResultados?.estado),
    `status=${enviado.status}, tipo=${notiResultados?.tipo}, estado=${notiResultados?.estado}`);

  // ========================================= 9) regenerar conserva historial
  const regenerado = await api(`/informes/${informe._id}/regenerar`, { metodo: 'POST', token });
  const informe2 = regenerado.data?.informe;
  const listadoInformes = (await api(`/informes?muestraId=${muestra._id}`, { token })).data.informes || [];
  registrar('Regenerar crea una versión nueva con otro número',
    regenerado.status === 201 && informe2?.version === 2 && informe2?.numeroInforme !== informe.numeroInforme,
    `status=${regenerado.status}, version=${informe2?.version}, numero=${informe2?.numeroInforme}`);
  registrar('El historial de informes se conserva (la versión anterior sigue existiendo)',
    listadoInformes.length >= 2 && listadoInformes.some((i) => i.numeroInforme === informe.numeroInforme),
    `${listadoInformes.length} versión(es)`);

  // ========================================= 10) encuesta pública (respuesta única)
  const tokenEncuesta = encuesta?.token;
  const verEncuesta = await api(`/publico/encuestas/${tokenEncuesta}`);
  registrar('GET público de la encuesta: estado y preguntas (sin ids internos)',
    verEncuesta.status === 200 && verEncuesta.data?.encuesta?.estado === 'pendiente'
      && Array.isArray(verEncuesta.data?.encuesta?.preguntas) && verEncuesta.data.encuesta.preguntas.length > 0,
    `status=${verEncuesta.status}, preguntas=${verEncuesta.data?.encuesta?.preguntas?.length ?? 0}`);
  registrar('La respuesta pública de la encuesta no expone ids internos',
    buscarProhibidos(verEncuesta.data).length === 0, buscarProhibidos(verEncuesta.data).join(', ') || 'ninguno');

  const responder = await api(`/publico/encuestas/${tokenEncuesta}`, {
    metodo: 'POST',
    body: {
      respuestas: (verEncuesta.data.encuesta.preguntas || []).map((p, i) => ({
        pregunta: p,
        calificacion: i === 0 ? 5 : 4,
        comentario: 'PRUEBA FASE 7',
      })),
    },
  });
  registrar('POST público de la encuesta → 201 (RF-101)', responder.status === 201,
    `status=${responder.status} | ${responder.data?.mensaje}`);

  const segundaVez = await api(`/publico/encuestas/${tokenEncuesta}`, {
    metodo: 'POST',
    body: { respuestas: [{ pregunta: '¿Otra?', calificacion: 1 }] },
  });
  registrar('Encuesta respondida dos veces → 409 con mensaje claro (RF-101)',
    segundaVez.status === 409 && /ya fue respondida/i.test(segundaVez.data?.mensaje || ''),
    `status=${segundaVez.status} | ${segundaVez.data?.mensaje}`);

  const tokenFalso = await api('/publico/encuestas/esto-no-es-un-token');
  registrar('GET de encuesta con token inválido → 404', tokenFalso.status === 404,
    `status=${tokenFalso.status}`);

  const otrosMetodos = await Promise.all([
    api(`/publico/encuestas/${tokenEncuesta}`, { metodo: 'PUT', body: { a: 1 } }),
    api('/publico/encuestas', { metodo: 'DELETE' }),
    api('/publico/informes', { metodo: 'POST', body: { a: 1 } }),
  ]);
  registrar('RNF-005: PUT/DELETE/POST no permitidos fuera de la encuesta',
    otrosMetodos.every((r) => [404, 405].includes(r.status)),
    otrosMetodos.map((r) => r.status).join(', '));

  // ========================================= 11) cierre: conservación
  await api(`/muestras/${muestra._id}/estado`, { metodo: 'PATCH', token, body: { estadoNuevo: 'resultados_validados' } });
  const cerrada = await api(`/muestras/${muestra._id}/cerrar`, { metodo: 'POST', token });
  const muestraCerrada = cerrada.data?.muestra;
  const esperadoLimite = claveFecha(sumarDiasHabiles(muestraCerrada?.fechaCierre || new Date(), 7));
  registrar('Al cerrar se calcula fechaLimiteConservacion (7 días hábiles) (RF-086)',
    cerrada.status === 200 && Boolean(muestraCerrada?.fechaLimiteConservacion)
      && claveFecha(muestraCerrada.fechaLimiteConservacion) === esperadoLimite,
    `status=${cerrada.status}, límite=${claveFecha(muestraCerrada?.fechaLimiteConservacion)}, esperado=${esperadoLimite}`);

  const notisMuestra = (await api(`/notificaciones?muestra=${muestra._id}`, { token })).data.notificaciones || [];
  const notiConservacion = notisMuestra.find((n) => n.tipo === 'conservacion');
  registrar('Notificación tipo "conservacion" al cerrar la muestra (RF-086)',
    Boolean(notiConservacion) && ['enviada', 'fallida'].includes(notiConservacion.estado),
    notiConservacion ? `estado=${notiConservacion.estado}` : 'sin notificación');

  // ========================================= 12) pendientes de disposición
  const pendientes1 = await api('/muestras/pendientes-disposicion', { token });
  const lista1 = pendientes1.data?.muestras || [];
  registrar('GET /muestras/pendientes-disposicion responde 200',
    pendientes1.status === 200 && Array.isArray(lista1),
    `status=${pendientes1.status}, cantidad=${lista1.length}`);
  registrar('Una muestra con plazo vigente NO aparece como pendiente',
    !lista1.some((m) => String(m._id) === String(muestra._id)),
    lista1.some((m) => String(m._id) === String(muestra._id)) ? 'aparece indebidamente' : 'correcto');

  await api(`/muestras/${muestra._id}/corregir`, {
    metodo: 'PUT', token,
    body: { fechaLimiteConservacion: '2020-01-01', descripcionCorreccion: 'PRUEBA FASE 7 plazo vencido' },
  });
  const pendientes2 = await api('/muestras/pendientes-disposicion', { token });
  const lista2 = pendientes2.data?.muestras || [];
  const miMuestra = lista2.find((m) => String(m._id) === String(muestra._id));
  registrar('Con el plazo vencido la muestra queda marcada como pendiente de disposición (RF-091)',
    Boolean(miMuestra) && miMuestra.pendienteDisposicion === true,
    miMuestra ? `pendienteDisposicion=${miMuestra.pendienteDisposicion}` : 'no aparece');

  // ========================================= 13) disposición válida
  const disposicion = await api('/disposiciones', {
    metodo: 'POST', token,
    body: {
      muestraId: muestra._id,
      tipo: 'devolucion',
      motivo: 'PRUEBA FASE 7 sin espacio en refrigeración',
      observacion: 'Se devuelve al cliente',
      notificacionCliente: true,
    },
  });
  registrar('Disposición sobre muestra cerrada → registrada (RF-087)',
    disposicion.status === 201 && disposicion.data?.muestra?.estado === 'devuelta',
    `status=${disposicion.status}, estado muestra=${disposicion.data?.muestra?.estado}`);

  const segundaDisposicion = await api('/disposiciones', {
    metodo: 'POST', token,
    body: { muestraId: muestra._id, tipo: 'desecho', motivo: 'PRUEBA FASE 7 segunda' },
  });
  registrar('Una muestra no puede tener dos disposiciones (RF-088)',
    segundaDisposicion.status === 400 && /ya tiene una disposición/i.test(segundaDisposicion.data?.mensaje || ''),
    `status=${segundaDisposicion.status} | ${segundaDisposicion.data?.mensaje}`);

  const trazabilidad = (await api(`/muestras/${muestra._id}/trazabilidad`, { token })).data;
  const eventos = trazabilidad?.historial || trazabilidad?.eventos || [];
  registrar('Trazabilidad: evento de cierre y de disposición registrados',
    eventos.some((e) => e.tipoEvento === 'cierre') && eventos.some((e) => /Disposición registrada/i.test(e.descripcion || '')),
    `${eventos.length} evento(s)`);

  // ========================================= 14) facturas
  const cotizacion = (await api('/cotizaciones', {
    metodo: 'POST', token,
    body: { solicitud: solicitud._id, items: [{ parametro: parametro._id, cantidad: 1 }] },
  })).data.cotizacion;
  await api(`/cotizaciones/${cotizacion._id}/aceptar`, { metodo: 'POST', token });
  const pago = (await api('/pagos', { metodo: 'POST', token, body: { cotizacion: cotizacion._id } })).data.pago;

  const sinConfirmar = await api('/facturas/generar', {
    metodo: 'POST', token, body: { solicitudId: solicitud._id },
  });
  registrar('Factura con pago sin confirmar → bloqueada (RF-114)',
    sinConfirmar.status === 400 && /pago confirmado/i.test(sinConfirmar.data?.mensaje || ''),
    `status=${sinConfirmar.status} | ${sinConfirmar.data?.mensaje}`);

  await api(`/pagos/${pago.referencia}/confirmar`, { metodo: 'POST', token });

  const facturaCreada = await api('/facturas/generar', {
    metodo: 'POST', token, body: { solicitudId: solicitud._id },
  });
  const factura = facturaCreada.data?.factura;
  const esSimulado = modo === MODO_SIMULADO;
  registrar('Factura con pago confirmado → generada en modo simulado',
    facturaCreada.status === 201 && /^\d{4}-\d{4}$/.test(factura?.numero || '') && factura?.estado === 'generada',
    `status=${facturaCreada.status}, numero=${factura?.numero}, estado=${factura?.estado}`);
  registrar('El documento del proveedor está marcado como SIMULADO (sin validez DIAN)',
    Boolean(factura?.documento) && (esSimulado ? factura.documento.simulado === true : true),
    esSimulado ? `simulado=${factura?.documento?.simulado}, advertencia=${factura?.documento?.advertencia}` : 'modo sandbox');
  registrar('historialEstados registra pendiente → generada',
    Array.isArray(factura?.historialEstados)
      && factura.historialEstados.some((h) => h.estado === 'pendiente')
      && factura.historialEstados.some((h) => h.estado === 'generada'),
    (factura?.historialEstados || []).map((h) => h.estado).join(' → '));

  const duplicada = await api('/facturas/generar', {
    metodo: 'POST', token, body: { solicitudId: solicitud._id },
  });
  registrar('No se permite facturar dos veces la misma solicitud',
    duplicada.status === 400 && /ya tiene la factura/i.test(duplicada.data?.mensaje || ''),
    `status=${duplicada.status} | ${duplicada.data?.mensaje}`);

  const consulta = await api(`/facturas/${factura._id}/consultar`, { token });
  registrar('Consulta de la factura (modo simulado: consulta local)',
    consulta.status === 200 && Boolean(consulta.data?.consulta),
    `status=${consulta.status}, modo=${consulta.data?.modo}`);

  const enviarFactura = await api(`/facturas/${factura._id}/enviar`, { metodo: 'POST', token });
  registrar('Enviar la factura al cliente por correo (RF-117)',
    enviarFactura.status === 200 && ['enviada', 'fallida'].includes(enviarFactura.data?.notificacion?.estado),
    `status=${enviarFactura.status}, estado correo=${enviarFactura.data?.notificacion?.estado}`);

  const cambioEstado = await api(`/facturas/${factura._id}/estado`, {
    metodo: 'POST', token,
    body: { estado: 'anulada', motivo: 'PRUEBA FASE 7 anulación de prueba' },
  });
  const facturaTrasCambio = (await api(`/facturas/${factura._id}`, { token })).data.factura;
  registrar('Cambio de estado con motivo → queda en historialEstados (RF-116)',
    cambioEstado.status === 200
      && facturaTrasCambio?.historialEstados?.some((h) => h.estado === 'anulada' && /PRUEBA FASE 7/.test(h.motivo || '')),
    `status=${cambioEstado.status}, historial=${(facturaTrasCambio?.historialEstados || []).map((h) => h.estado).join(' → ')}`);

  // ========================================= 15) API pública con factura
  const publica2 = await api(`/publico/seguimiento/${codigo}`);
  const s2 = publica2.data?.seguimiento;
  registrar('La consulta pública muestra la factura (solo estado, número y fecha)',
    publica2.status === 200 && s2?.facturacion?.existe === true && Boolean(s2?.facturacion?.numero)
      && !('documento' in (s2?.facturacion || {})) && !('historialEstados' in (s2?.facturacion || {})),
    `facturacion=${JSON.stringify(s2?.facturacion)}`);
  registrar('La consulta pública sigue sin campos internos ni el PDF',
    buscarProhibidos(publica2.data).length === 0, buscarProhibidos(publica2.data).join(', ') || 'ninguno');
  registrar('La consulta pública responde en menos de 2 s (RNF-013)',
    (s2?.tiempoConsultaMs ?? 0) < 2000, `${s2?.tiempoConsultaMs} ms`);

  // ========================================= 16) auth y roles
  const sinToken = await api('/informes/generar', { metodo: 'POST', body: { muestraId: muestra._id } });
  registrar('POST /api/interno/informes sin token → 401', sinToken.status === 401, `status=${sinToken.status}`);

  const comoLector = await api('/informes/generar', {
    metodo: 'POST', token: tokenLector, body: { muestraId: muestra._id },
  });
  registrar('Rol "usuario" no puede generar informes → 403 (solo lectura)', comoLector.status === 403,
    `status=${comoLector.status}`);

  const comoLectorGET = await api('/informes', { token: tokenLector });
  registrar('Rol "usuario" SÍ puede consultar informes → 200', comoLectorGET.status === 200,
    `status=${comoLectorGET.status}`);

  const facturasLector = await api('/facturas/generar', {
    metodo: 'POST', token: tokenLector, body: { solicitudId: solicitud._id },
  });
  registrar('Rol "usuario" no puede generar facturas → 403', facturasLector.status === 403,
    `status=${facturasLector.status}`);

  // ==================================================== 17) limpieza
  await api(`/muestras/${muestra._id}`, { metodo: 'DELETE', token });
  await api(`/solicitudes/${solicitud._id}`, { metodo: 'DELETE', token });
  await api(`/clientes/${cliente._id}`, { metodo: 'DELETE', token });

  await Informe.updateMany({ muestraId: muestra._id }, { $set: { eliminado: true } });
  await Encuesta.updateMany({ muestraId: muestra._id }, { $set: { eliminado: true } });
  await Disposicion.updateMany({ muestraId: muestra._id }, { $set: { eliminado: true } });
  await Factura.updateMany({ solicitudId: solicitud._id }, { $set: { eliminado: true } });
  await Pago.updateMany({ solicitud: solicitud._id }, { $set: { eliminado: true } });
  await Cotizacion.updateMany({ solicitud: solicitud._id }, { $set: { eliminado: true } });
  await usuarios.updateOne({ email: emailLector }, { $set: { eliminado: true } });
  registrar('Datos de prueba dejados en borrado lógico', true,
    'muestra, solicitud, cliente, informes, encuesta, disposición, factura, pago, cotización y usuario lector');

  await mongoose.disconnect();
  return resumen();
}

main()
  .then((codigo) => process.exit(codigo))
  .catch(async (e) => {
    console.error('\n💥 Error inesperado en la verificación:', e.message);
    if (e.cause) console.error('   Causa:', e.cause.code || '', e.cause.message || e.cause);
    console.error(e.stack);
    try { await mongoose.disconnect(); } catch { /* sin conexión */ }
    process.exit(1);
  });
