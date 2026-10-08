// Integración con Factus (facturación electrónica) — SOLO SANDBOX o SIMULADO.
//
// Reglas de la Fase 7 (RF-113 a RF-116):
//  - NUNCA se envía información a la DIAN ni se usa entorno de producción.
//  - Si FACTUS_BASE_URL / CLIENT_ID / CLIENT_SECRET están vacíos → MODO SIMULADO.
//  - Si la URL apunta a producción (o a la DIAN) se RECHAZA con error claro.
//
// Este módulo nunca lanza excepciones no controladas: todo error termina en
// AppError con mensaje en español, para que el módulo facturas pueda guardar
// la factura en estado "error" y permitir el reintento.
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

export const MODO_SIMULADO = 'simulado';
export const MODO_SANDBOX = 'sandbox';

const TIEMPO_MAXIMO_MS = 15000;

// Detecta si la URL apunta a producción de Factus, a la DIAN o a otro destino
// prohibido. Devuelve null si está bien, o el motivo del rechazo.
export function motivoUrlProhibida(url) {
  if (!url || !String(url).trim()) return null;

  let parsed;
  try {
    parsed = new URL(String(url).trim());
  } catch {
    return 'La URL de Factus no es una URL válida (ejemplo válido: https://api-sandbox.factus.co)';
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return `El protocolo de la URL de Factus no está permitido (${parsed.protocol})`;
  }

  const host = parsed.hostname.toLowerCase();
  const texto = `${host}${parsed.pathname}`.toLowerCase();

  // Jamás hacia la DIAN.
  if (texto.includes('dian')) {
    return 'Está prohibido enviar información a la DIAN: usa solo SANDBOX o el modo simulado';
  }

  // Palabras clave de producción explícita.
  if (texto.includes('produccion') || texto.includes('producción') || texto.includes('production')) {
    return `La URL de Factus parece ser de PRODUCCIÓN (${host}): está bloqueada. Usa la URL de SANDBOX o deja la variable vacía para trabajar en modo simulado`;
  }

  // Producción de Factus: cualquier subdominio de factus.co sin "sandbox".
  const esFactus = /(^|\.)factus\.co$/.test(host);
  if (esFactus && !texto.includes('sandbox')) {
    return `La URL de Factus (${host}) corresponde al entorno de PRODUCCIÓN y está bloqueada. Usa la URL de SANDBOX o deja la variable vacía para trabajar en modo simulado`;
  }

  return null;
}

// Lanza AppError(400) si la URL no es segura. Si url está vacía → todo bien
// (es el modo simulado).
export function validarUrlSegura(url) {
  const motivo = motivoUrlProhibida(url);
  if (motivo) throw new AppError(motivo, 400);
  return true;
}

// 'simulado' si faltan credenciales/URL; 'sandbox' si hay configuración.
export function detectarModo() {
  const url = env.FACTUS_BASE_URL?.trim() || '';
  const clientId = env.FACTUS_CLIENT_ID?.trim() || '';
  const clientSecret = env.FACTUS_CLIENT_SECRET?.trim() || '';

  if (!url || !clientId || !clientSecret) return MODO_SIMULADO;
  validarUrlSegura(url); // falla rápido si apunta a producción
  return MODO_SANDBOX;
}

export function obtenerConfiguracion() {
  return {
    modo: detectarModo(),
    baseUrl: (env.FACTUS_BASE_URL || '').trim().replace(/\/+$/, ''),
    clientId: (env.FACTUS_CLIENT_ID || '').trim(),
    clientSecret: (env.FACTUS_CLIENT_SECRET || '').trim(),
  };
}

// Documento claramente marcado como SIMULADO (no tiene validez ante la DIAN).
function documentoSimulado({ numero, valorTotal, cliente, solicitud, conceptos, fecha }) {
  return {
    simulado: true,
    advertencia: 'DOCUMENTO SIMULADO — SIN VALIDEZ ANTE LA DIAN',
    nota: 'Se generó en MODO SIMULADO porque no hay credenciales de Factus (FACTUS_BASE_URL, FACTUS_CLIENT_ID, FACTUS_CLIENT_SECRET).',
    proveedor: 'Factus (modo simulado)',
    numero,
    fechaEmision: fecha,
    moneda: 'COP',
    valorTotal,
    cliente: cliente || null,
    solicitud: solicitud || null,
    conceptos: conceptos || [],
  };
}

async function obtenerToken({ baseUrl, clientId, clientSecret }) {
  const respuesta = await fetch(`${baseUrl}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    throw new Error(`Factus devolvió ${respuesta.status} al autenticar. ${detalle.slice(0, 300)}`);
  }

  const datos = await respuesta.json();
  const token = datos.access_token || datos.token;
  if (!token) throw new Error('Factus no devolvió un token de acceso');
  return token;
}

// Emite la factura en el proveedor. Devuelve { modo, numero, documento }.
// Nunca lanza algo distinto a AppError.
export async function emitir({ numero, valorTotal, cliente, solicitud, conceptos = [] }) {
  const config = obtenerConfiguracion();

  if (config.modo === MODO_SIMULADO) {
    return {
      modo: MODO_SIMULADO,
      numero,
      documento: documentoSimulado({
        numero,
        valorTotal,
        cliente,
        solicitud,
        conceptos,
        fecha: new Date().toISOString(),
      }),
    };
  }

  // MODO SANDBOX (doble validación: aquí y en facturas.service).
  validarUrlSegura(config.baseUrl);

  try {
    const token = await obtenerToken(config);
    const respuesta = await fetch(`${config.baseUrl}/api/v1/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'application/json' },
      body: JSON.stringify({
        reference: numero,
        total: valorTotal,
        currency: 'COP',
        customer: cliente,
        bill: { reference: numero, items: conceptos },
        notes: 'Entorno SANDBOX — sin envío a la DIAN',
      }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Factus (sandbox) respondió ${respuesta.status}. ${detalle.slice(0, 300)}`);
    }

    const documento = await respuesta.json();
    return { modo: MODO_SANDBOX, numero, documento };
  } catch (error) {
    const motivo = error instanceof AppError ? error.mensaje : error.message;
    throw new AppError(`No fue posible generar la factura en Factus (sandbox): ${motivo}`, 502);
  }
}

// Consulta el estado de una factura ya emitida en el proveedor.
export async function consultar({ numero, documento }) {
  const config = obtenerConfiguracion();

  if (config.modo === MODO_SIMULADO) {
    return {
      modo: MODO_SIMULADO,
      consulta: {
        ...documento,
        consultadoEn: new Date().toISOString(),
        nota: 'Consulta local: el modo simulado no consulta ningún proveedor externo.',
      },
    };
  }

  validarUrlSegura(config.baseUrl);

  try {
    const token = await obtenerToken(config);
    const respuesta = await fetch(`${config.baseUrl}/api/v1/bills/${encodeURIComponent(numero)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });

    if (respuesta.status === 404) {
      throw new AppError(`Factus (sandbox) no tiene registrada la factura ${numero}`, 404);
    }
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new AppError(`Factus (sandbox) respondió ${respuesta.status} al consultar. ${detalle.slice(0, 300)}`, 502);
    }

    return { modo: MODO_SANDBOX, consulta: await respuesta.json() };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`No fue posible consultar la factura en Factus (sandbox): ${error.message}`, 502);
  }
}
