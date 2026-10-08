// Verificación de la Fase 6 (RF-075 a RF-085, RF-107 a RF-112, RNF-004/005/013).
//
// Uso:
//   1. Arranca el servidor:  npm run dev
//   2. Ejecuta:              node scripts/verificarFase6.js
//
// Opcional: BASE=http://localhost:3001 node scripts/verificarFase6.js
//
// Crea datos de prueba claramente identificados ("PRUEBA FASE 6") y los borra
// (borrado lógico) al terminar.
import 'dotenv/config';

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
  // Convención de este script: todo lo que no sea /publico ni /health es interno.
  const prefijo = ruta.startsWith('/publico') || ruta.startsWith('/health') ? '/api' : '/api/interno';
  const respuesta = await fetch(`${BASE}${prefijo}${ruta}`, {
    method: metodo,
    headers,
    body: form ? form : body ? JSON.stringify(body) : undefined,
  });
  return { status: respuesta.status, data: await json(respuesta) };
}

// Recorre el JSON buscando campos prohibidos (RF-082 / RNF-004).
const PROHIBIDOS = [
  '_id', 'usuarioId', 'observacionesInternas', 'creadaPor', 'revisadaPor',
  'acciones', 'clienteId', 'solicitudId', 'parametrosSeleccionados',
  'ubicacionActual', 'rotuloPdf', 'eliminadoPor', 'auditoria', 'auditorias',
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

// PDF mínimo válido para probar la subida de archivos.
const PDF_MINIMO = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF\n'
);

// ---------------------------------------------------------------------------
// Prueba de fallo forzado de correo (MAIL_USER inválido) + reintento RF-112.
// Se ejecuta con:  VERIFICAR_CORREO=1 BASE=http://localhost:3001 node scripts/verificarFase6.js
// (el segundo servidor debe arrancar con MAIL_USER inválido en el entorno)
// ---------------------------------------------------------------------------
async function verificarCorreoFallido() {
  console.log(`\n=== Verificación de fallo de correo contra ${BASE} ===\n`);

  const salud = await api('/health');
  if (salud.status !== 200) {
    console.error('El servidor no está arriba:', salud.status, salud.data);
    process.exit(1);
  }

  const login = await api('/auth/login', {
    metodo: 'POST',
    body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  });
  const token = login.data?.token;
  if (!token) { console.error('Login fallido:', login.data); process.exit(1); }

  const marca = Date.now();
  const cliente = (await api('/clientes', {
    metodo: 'POST', token,
    body: {
      nombre: `PRUEBA FASE 6 correo ${marca}`,
      numeroDocumento: `888${String(marca).slice(-7)}`,
      email: `prueba.correo.${marca}@example.com`,
      tipoCliente: 'interno',
    },
  })).data.cliente;
  const solicitud = (await api('/solicitudes', {
    metodo: 'POST', token,
    body: { cliente: cliente._id, tipoCliente: 'interno', descripcion: 'PRUEBA FASE 6 correo' },
  })).data.solicitud;
  const muestra = (await api('/muestras', {
    metodo: 'POST', token,
    body: { solicitudId: solicitud._id, nombreMuestra: 'PRUEBA FASE 6 correo', tipoFisico: 'liquido', cantidad: 450 },
  })).data.muestra;
  await api(`/muestras/${muestra._id}/aceptar`, { metodo: 'POST', token });

  // La creación de la incidencia dispara la notificación (MAIL_USER inválido).
  const creacion = await api('/incidencias', {
    metodo: 'POST', token,
    body: {
      muestraId: muestra._id,
      tipo: 'requiere_accion_cliente',
      titulo: 'PRUEBA FASE 6 correo inválido',
      descripcion: 'Esta incidencia dispara una notificación que no puede enviarse.',
    },
  });
  registrar('La operación NO se rompe cuando el correo falla', creacion.status === 201,
    `status=${creacion.status}`);

  const listado = (await api(`/notificaciones?muestra=${muestra._id}`, { token })).data.notificaciones || [];
  const notificacion = listado[0];
  registrar('La notificación quedó registrada como FALLIDA', notificacion?.estado === 'fallida',
    `estado=${notificacion?.estado}, intentos=${notificacion?.intentos}`);
  registrar('Guarda errorUltimoIntento con el motivo', Boolean(notificacion?.errorUltimoIntento),
    notificacion?.errorUltimoIntento || 'vacío');

  if (!notificacion) return;

  // Reintentos: la creación ya es el intento 1, caben 2 más (máximo 3).
  let ultima = notificacion;
  for (let intento = 2; intento <= 3; intento += 1) {
    const r = await api(`/notificaciones/${notificacion._id}/reintentar`, { metodo: 'POST', token });
    ultima = (await api(`/notificaciones/${notificacion._id}`, { token })).data.notificacion;
    registrar(`Reintento ${intento} aceptado y sigue fallida (creds aún inválidas)`,
      r.status === 200 && ultima.estado === 'fallida' && ultima.intentos === intento,
      `status=${r.status}, intentos=${ultima.intentos}, estado=${ultima.estado}`);
  }

  const cuarto = await api(`/notificaciones/${notificacion._id}/reintentar`, { metodo: 'POST', token });
  registrar('4.º reintento rechazado: límite de 3 intentos (RF-112)',
    cuarto.status === 400 && /3 intentos/.test(cuarto.data?.mensaje || ''),
    `status=${cuarto.status} | ${cuarto.data?.mensaje}`);

  // Un rol "usuario" no puede reintentar (solo lectura) y un "usuario" sin JWT no pasa.
  const sinToken = await api(`/notificaciones/${notificacion._id}/reintentar`, { metodo: 'POST' });
  registrar('Reintento sin token → 401', sinToken.status === 401, `status=${sinToken.status}`);
  const listadoSinToken = await api('/notificaciones');
  registrar('Listado sin token → 401', listadoSinToken.status === 401, `status=${listadoSinToken.status}`);

  await api(`/muestras/${muestra._id}`, { metodo: 'DELETE', token });
  await api(`/solicitudes/${solicitud._id}`, { metodo: 'DELETE', token });
  await api(`/clientes/${cliente._id}`, { metodo: 'DELETE', token });

  const fallidos = resultados.filter((r) => !r.ok);
  console.log(`\n=== Resultado: ${resultados.length - fallidos.length}/${resultados.length} pruebas OK ===`);
  if (fallidos.length) {
    fallidos.forEach((f) => console.log(`  ❌ ${f.nombre} — ${f.detalle}`));
    process.exit(1);
  }
  process.exit(0);
}

async function main() {
  if (process.env.VERIFICAR_CORREO === '1') return verificarCorreoFallido();
  console.log(`\n=== Verificación Fase 6 contra ${BASE} ===\n`);

  // ---------------------------------------------------------------- salud
  const salud = await api('/health');
  if (salud.status !== 200 || salud.data.baseDatos !== 'conectada') {
    console.error('El servidor no está arriba o no tiene BD:', salud.status, salud.data);
    process.exit(1);
  }
  registrar('Servidor arriba y base de datos conectada', true, `estado=${salud.data.baseDatos}`);

  // ------------------------------------------------------------ autenticar
  const login = await api('/auth/login', {
    metodo: 'POST',
    body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  });
  const token = login.data?.token || login.data?.jwt;
  if (!token) {
    console.error('No se pudo iniciar sesión:', login.data);
    process.exit(1);
  }
  registrar('Login de administrador', true);

  // ------------------------------------------------------- datos de prueba
  const marca = Date.now();
  const cliente = (await api('/clientes', {
    metodo: 'POST', token,
    body: {
      nombre: `PRUEBA FASE 6 cliente ${marca}`,
      numeroDocumento: `999${String(marca).slice(-7)}`,
      email: process.env.MAIL_USER || 'prueba.fase6@example.com',
      tipoCliente: 'interno',
    },
  })).data.cliente;

  const solicitud = (await api('/solicitudes', {
    metodo: 'POST', token,
    body: { cliente: cliente._id, tipoCliente: 'interno', descripcion: 'PRUEBA FASE 6' },
  })).data.solicitud;

  const muestra = (await api('/muestras', {
    metodo: 'POST', token,
    body: { solicitudId: solicitud._id, nombreMuestra: 'PRUEBA FASE 6 agua', tipoFisico: 'liquido', cantidad: 500 },
  })).data.muestra;

  const aceptada = (await api(`/muestras/${muestra._id}/aceptar`, { metodo: 'POST', token })).data.muestra;
  const codigo = aceptada.codigoSeguimiento;
  registrar('Muestra creada y aceptada (codigoSeguimiento generado)', Boolean(codigo), codigo);

  // ------------------------------------------------- 1) consulta pública
  const t0 = Date.now();
  const publica = await api(`/publico/seguimiento/${codigo}`);
  const ms = Date.now() - t0;
  const s = publica.data?.seguimiento;
  const camposFaltantes = ['nombreMuestra', 'codigo', 'estado', 'fechaRecepcion', 'fechaEstimadaEntrega', 'historial', 'incidencias']
    .filter((c) => !(c in (s || {})));
  registrar(
    'GET /api/publico/seguimiento devuelve los campos públicos',
    publica.status === 200 && publica.data.ok === true && camposFaltantes.length === 0,
    `status=${publica.status}${camposFaltantes.length ? ` faltan: ${camposFaltantes.join(', ')}` : ''}`
  );
  registrar('Tiempo de respuesta < 2 s (RNF-013)', ms < 2000, `${ms} ms`);
  registrar('La respuesta NO contiene campos prohibidos', buscarProhibidos(publica.data).length === 0,
    buscarProhibidos(publica.data).join(', ') || 'ninguno');

  // --------------------------------------------- 2) código inexistente 404
  const inexistente = await api('/publico/seguimiento/ codigo-que-no-existe-000 ');
  registrar('Código inexistente → 404 con mensaje claro',
    inexistente.status === 404 && inexistente.data.ok === false,
    `status=${inexistente.status} | ${inexistente.data?.mensaje}`);

  // -------------------------------------------- 3) muestra eliminada → 404
  const borrable = (await api('/muestras', {
    metodo: 'POST', token,
    body: { solicitudId: solicitud._id, nombreMuestra: 'PRUEBA FASE 6 borrable', tipoFisico: 'liquido', cantidad: 400 },
  })).data.muestra;
  const borrableAceptada = (await api(`/muestras/${borrable._id}/aceptar`, { metodo: 'POST', token })).data.muestra;
  await api(`/muestras/${borrable._id}`, { metodo: 'DELETE', token });
  const eliminada = await api(`/publico/seguimiento/${borrableAceptada.codigoSeguimiento}`);
  registrar('Muestra eliminada (borrado lógico) → 404',
    eliminada.status === 404 && eliminada.data?.mensaje === inexistente.data?.mensaje,
    `status=${eliminada.status} (mismo mensaje que código inexistente)`);

  // ---------------------------------------- 4) incidencia que espera cliente
  const incidencia = (await api('/incidencias', {
    metodo: 'POST', token,
    body: {
      muestraId: muestra._id,
      tipo: 'requiere_accion_cliente',
      titulo: 'PRUEBA FASE 6 confirma la recepción',
      descripcion: 'Necesitamos que confirmes la recepción de la muestra.',
      observacionesInternas: 'ESTO NO DEBE FILTRARSE',
    },
  })).data.incidencia;

  const publica2 = await api(`/publico/seguimiento/${codigo}`);
  const incVisible = (publica2.data.seguimiento.incidencias || []).find((i) => i.id === String(incidencia._id));
  const proibidos2 = buscarProhibidos(publica2.data);
  registrar('La incidencia visible aparece en la consulta pública', Boolean(incVisible),
    incVisible ? `estado=${incVisible.estado}, puedeResponder=${incVisible.puedeResponder}` : 'no aparece');
  registrar('No se filtra observacionesInternas ni datos internos', proibidos2.length === 0,
    proibidos2.join(', ') || 'ninguno');

  // ------------------------------------------------ 5) métodos bloqueados
  const metodos = [
    ['PUT', '/publico/seguimiento'],
    ['DELETE', '/publico/seguimiento'],
    ['POST', '/publico/seguimiento/otro-cualquiera'],
    ['PATCH', '/publico/seguimiento'],
  ];
  const respuestas = await Promise.all(
    metodos.map(([metodo, ruta]) => api(ruta, { metodo, token, body: { a: 1 } }))
  );
  const resumen = respuestas.map((r, i) => `${metodos[i][0]}=${r.status}`).join(', ');
  const okMetodos = respuestas.every((r) => [404, 405].includes(r.status) && r.data?.ok === false);
  registrar('RNF-005: POST/PUT/PATCH/DELETE no permitidos en /api/publico', okMetodos, resumen);

  // Fase 7: el ÚNICO POST nuevo permitido en /api/publico es responder la
  // encuesta con su token. Con un token inexistente responde 404 (nunca 405);
  // los demás métodos y rutas siguen bloqueados arriba.
  const encuestaPost = await api('/publico/encuestas/token-que-no-existe-000', {
    metodo: 'POST', body: { respuestas: [{ pregunta: '¿Cómo fue el servicio?', calificacion: 5 }] },
  });
  registrar('Fase 7: POST /api/publico/encuestas/:token está permitido (404 por token, no 405)',
    encuestaPost.status === 404 && encuestaPost.data?.ok === false,
    `status=${encuestaPost.status} | ${encuestaPost.data?.mensaje}`);
  const encuestaGet = await api('/publico/encuestas/token-que-no-existe-000');
  registrar('GET /api/publico/encuestas/:token → 404 con mensaje claro', encuestaGet.status === 404,
    `status=${encuestaGet.status} | ${encuestaGet.data?.mensaje}`);

  // ------------------------------------- 6) respuesta del cliente con PDF
  const form = new FormData();
  form.append('mensaje', 'Confirmamos la recepción de la muestra, adjuntamos el acta.');
  form.append('archivos', new Blob([PDF_MINIMO], { type: 'application/pdf' }), 'acta.pdf');
  const respuesta = await api(
    `/publico/seguimiento/${codigo}/incidencias/${incidencia._id}/respuesta`,
    { metodo: 'POST', form }
  );
  registrar('POST de respuesta del cliente con PDF (RF-079)', respuesta.status === 201,
    `status=${respuesta.status} | ${respuesta.data?.mensaje || JSON.stringify(respuesta.data)}`);

  const publica3 = await api(`/publico/seguimiento/${codigo}`);
  const incActualizada = (publica3.data.seguimiento.incidencias || []).find((i) => i.id === String(incidencia._id));
  registrar('La incidencia pasó a en_revision tras la respuesta',
    incActualizada?.estado === 'en_revision', `estado=${incActualizada?.estado}`);
  registrar('La consulta pública sigue sin campos prohibidos', buscarProhibidos(publica3.data).length === 0,
    buscarProhibidos(publica3.data).join(', ') || 'ninguno');

  // ------------------------------------------------- 7) notificaciones
  const notis = await api('/notificaciones', { token });
  registrar('GET /api/interno/notificaciones', notis.status === 200 && Array.isArray(notis.data?.notificaciones),
    `${notis.data?.notificaciones?.length ?? 0} notificaciones`);
  const notisFiltradas = await api('/notificaciones?tipo=incidencia', { token });
  registrar('Filtro por tipo', notisFiltradas.status === 200
    && notisFiltradas.data.notificaciones.every((n) => n.tipo === 'incidencia'),
    `${notisFiltradas.data?.notificaciones?.length ?? 0} de tipo incidencia`);

  const cambio = await api(`/muestras/${muestra._id}/estado`, {
    metodo: 'PATCH', token, body: { estadoNuevo: 'en_proceso' },
  });
  registrar('Cambio de estado (RF-107)', cambio.status === 200, `status=${cambio.status}`);

  const trasCambio = await api('/notificaciones?tipo=cambio_etapa', { token });
  const creada = (trasCambio.data?.notificaciones || []).find((n) => String(n.muestraId) === String(muestra._id));
  registrar('El cambio de estado generó una notificación', Boolean(creada),
    creada ? `estado=${creada.estado}, intentos=${creada.intentos}, error=${creada.errorUltimoIntento || 'ninguno'}` : 'sin notificación');
  if (creada) {
    registrar('La notificación quedó enviada o fallida (nunca pendiente)',
      ['enviada', 'fallida'].includes(creada.estado), creada.estado);
    if (creada.estado === 'fallida') {
      const reintentar = await api(`/notificaciones/${creada._id}/reintentar`, { metodo: 'POST', token });
      registrar('Reintento de notificación fallida (RF-112)', reintentar.status === 200,
        `status=${reintentar.status} | ${reintentar.data?.mensaje}`);
      const trasReintento = (await api(`/notificaciones/${creada._id}`, { token })).data.notificacion;
      registrar('Límite de 3 intentos respetado', (trasReintento?.intentos ?? 0) <= 3,
        `intentos=${trasReintento?.intentos}`);
    }
  }

  // Evento de trazabilidad "notificación enviada"
  const trazabilidad = await api(`/muestras/${muestra._id}/trazabilidad`, { token });
  const eventoNotif = (trazabilidad.data?.historial || trazabilidad.data?.eventos || [])
    .filter((e) => String(e.descripcion || '').toLowerCase().includes('notificación enviada'));
  registrar('Evento de trazabilidad "notificación enviada" registrado',
    eventoNotif.length > 0 || creada?.estado === 'fallida',
    eventoNotif.length ? `${eventoNotif.length} evento(s)` : 'sin evento (la notificación no se envió)');

  // ------------------------------------- 7b) cliente sin correo (RF-110)
  await api(`/clientes/${cliente._id}`, { metodo: 'DELETE', token });
  const cambioSinCorreo = await api(`/muestras/${muestra._id}/estado`, {
    metodo: 'PATCH', token, body: { estadoNuevo: 'en_analisis' },
  });
  const notisMuestra = (await api(`/notificaciones?muestra=${muestra._id}`, { token })).data.notificaciones || [];
  const ultimaEtapa = notisMuestra
    .filter((n) => n.tipo === 'cambio_etapa')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  registrar('Cliente sin correo → notificación fallida y la operación continúa (RF-110)',
    cambioSinCorreo.status === 200
      && ultimaEtapa?.estado === 'fallida'
      && /correo/i.test(ultimaEtapa?.errorUltimoIntento || ''),
    `cambio=${cambioSinCorreo.status}, estado=${ultimaEtapa?.estado}, error=${ultimaEtapa?.errorUltimoIntento}`);

  // ------------------------------------------------------ 8) rate limit
  const estadosRate = [];
  let vio429 = false;
  for (let i = 0; i < 34; i += 1) {
    const r = await fetch(`${BASE}/api/publico/seguimiento/${codigo}`);
    estadosRate.push(r.status);
    if (r.status === 429) { vio429 = true; break; }
  }
  const cuerpo429 = vio429 ? await (await fetch(`${BASE}/api/publico/seguimiento/${codigo}`)).json() : null;
  registrar('Rate limit: a partir de la consulta 31 responde 429 (RNF-013)', vio429,
    `últimos estados: ${[...new Set(estadosRate)].join(', ')}${cuerpo429 ? ` | ${cuerpo429.mensaje}` : ''}`);

  // ------------------------------------------------------- 9) limpieza
  await api(`/muestras/${muestra._id}`, { metodo: 'DELETE', token });
  await api(`/solicitudes/${solicitud._id}`, { metodo: 'DELETE', token });
  await api(`/clientes/${cliente._id}`, { metodo: 'DELETE', token });
  registrar('Datos de prueba borrados (borrado lógico)', true);

  // --------------------------------------------------------- resumen
  const fallidos = resultados.filter((r) => !r.ok);
  console.log(`\n=== Resultado: ${resultados.length - fallidos.length}/${resultados.length} pruebas OK ===`);
  if (fallidos.length) {
    console.log('Pruebas fallidas:');
    fallidos.forEach((f) => console.log(`  ❌ ${f.nombre} — ${f.detalle}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('\n💥 Error inesperado en la verificación:', e.message);
  if (e.cause) console.error('   Causa:', e.cause.code || '', e.cause.message || e.cause);
  console.error(e.stack);
  process.exit(1);
});
