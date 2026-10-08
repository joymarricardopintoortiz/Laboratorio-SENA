// Informes de resultado (RF-094 a RF-098).
// - Solo se genera si TODOS los análisis de la muestra están validados.
// - Regenerar crea una versión nueva y conserva la anterior (historial).
// - Cada paso deja evento de trazabilidad y auditoría.
import { Informe, ESTADOS_INFORME } from './informes.model.js';
import { Muestra } from '../muestras/muestras.model.js';
import { Cliente } from '../clientes/clientes.model.js';
import { AnalisisMuestra } from '../analisisMuestras/analisisMuestras.model.js';
import { AppError } from '../../utils/AppError.js';
import { registrarAuditoria } from '../../middlewares/audit.js';
import { registrarEvento } from '../../services/trazabilidad.service.js';
import { generarPDF } from '../../services/pdf.service.js';
import { siguiente } from '../secuencias/secuencias.service.js';
import { crearNotificacion } from '../notificaciones/notificaciones.service.js';
import { crearYEnviarEncuesta } from '../encuestas/encuestas.service.js';
import { env } from '../../config/env.js';

const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-CO') : 'sin registrar');
const hora = (f) => (f ? new Date(f).toLocaleString('es-CO') : 'sin registrar');
const dinero = (v) => `$${Number(v || 0).toLocaleString('es-CO')}`;

export const listar = (filtro = {}) => Informe.find(filtro)
  .sort({ createdAt: -1 })
  .select('-archivo');

// Enlace público del informe (solo estado/fecha y descarga con códigoSeguimiento).
export function enlacePublico(muestra) {
  if (!muestra?.codigoSeguimiento) return null;
  const base = (env.FRONTEND_URL || '').replace(/\/+$/, '');
  if (base) return `${base}/seguimiento/${muestra.codigoSeguimiento}/informe`;
  return `http://localhost:${env.PORT}/api/publico/seguimiento/${muestra.codigoSeguimiento}/informe`;
}

// Carga muestra + cliente + análisis (con el nombre del parámetro).
async function cargarContexto(muestraId) {
  const muestra = await Muestra.findById(muestraId);
  if (!muestra) throw new AppError('Muestra no encontrada', 404);

  const cliente = await Cliente.findById(muestra.clienteId);
  const analisis = await AnalisisMuestra.find({ muestraId: muestra._id })
    .populate('parametroId', 'nombre unidad categoria');

  return { muestra, cliente, analisis };
}

// RF-095: el informe solo se genera con todos los resultados validados.
async function exigirResultadosValidados(analisis) {
  if (!analisis.length) {
    throw new AppError('La muestra no tiene análisis registrados: no se puede generar el informe', 400);
  }
  const pendientes = analisis.filter((a) => a.estado !== 'validado');
  if (pendientes.length) {
    const nombres = pendientes
      .map((a) => a.parametroId?.nombre || 'parámetro sin nombre')
      .join(', ');
    throw new AppError(
      `La muestra tiene ${pendientes.length} resultado(s) sin validar (${nombres}). El informe solo se genera con todos los resultados validados.`,
      400
    );
  }
  return analisis;
}

// Construye el contenido del PDF.
function construirLineas({ muestra, cliente, analisis, numeroInforme }) {
  const lineas = [
    `Informe: ${numeroInforme}`,
    `Código de la muestra: ${muestra.codigo || 'sin asignar'}`,
    `Código de seguimiento: ${muestra.codigoSeguimiento || 'sin asignar'}`,
    '',
    '--- MUESTRA ---',
    `Nombre: ${muestra.nombreMuestra}`,
    `Descripción: ${muestra.descripcion || 'sin descripción'}`,
    `Tipo físico: ${muestra.tipoFisico}   Cantidad: ${muestra.cantidad} ${muestra.unidad || ''}`.trim(),
    `Estado: ${muestra.estado}`,
    `Fecha de recepción: ${hora(muestra.fechaRecepcion)}`,
    `Fecha estimada de entrega: ${fecha(muestra.fechaEstimadaEntrega)}`,
    `Fecha de cierre: ${fecha(muestra.fechaCierre)}`,
    muestra.ubicacion?.almacen ? `Ubicación: ${muestra.ubicacion.almacen}` : null,
    '',
    '--- CLIENTE ---',
    `Nombre: ${cliente?.nombre || 'no registrado'}`,
    `Documento: ${cliente ? `${cliente.tipoDocumento} ${cliente.numeroDocumento}` : 'no registrado'}`,
    `Correo: ${cliente?.email || 'no registrado'}`,
    `Tipo de cliente: ${cliente?.tipoCliente || 'no registrado'}`,
    '',
    '--- PARÁMETROS Y RESULTADOS (validados) ---',
    ...analisis.map((a, i) => {
      const nombre = a.parametroId?.nombre || 'Parámetro sin nombre';
      const unidad = a.unidad || a.parametroId?.unidad || '';
      const valor = a.valor !== null && a.valor !== undefined ? a.valor : a.resultado;
      return `${i + 1}. ${nombre}: ${valor}${unidad ? ` ${unidad}` : ''} — validado por ${a.validadoPor || 's/n'} el ${fecha(a.fechaValidacion)}`;
    }),
    '',
    `Fecha de emisión del informe: ${hora(new Date())}`,
    'Este informe fue generado electrónicamente por el Sistema de Gestión del Servicio de Análisis de Laboratorio (SENA).',
  ];

  return lineas.filter((l) => l !== null && l !== undefined);
}

async function construirPDF({ muestra, cliente, analisis, numeroInforme }) {
  const pdf = await generarPDF({
    titulo: 'INFORME DE ANÁLISIS DE LABORATORIO',
    lineas: construirLineas({ muestra, cliente, analisis, numeroInforme }),
  });

  const limite = env.MAX_FILE_MB * 1024 * 1024;
  if (pdf.length > limite) {
    throw new AppError(
      `El PDF generado supera el límite permitido de ${env.MAX_FILE_MB} MB (${(pdf.length / 1024 / 1024).toFixed(2)} MB)`,
      413
    );
  }
  return pdf;
}

async function crearInforme({ muestra, cliente, analisis, version = 1, regeneradoDe = null }, usuario) {
  const anio = new Date().getFullYear();
  const consecutivo = await siguiente(`informes-${anio}`);
  const numeroInforme = `${String(consecutivo).padStart(4, '0')}-${anio}`;

  const archivo = await construirPDF({ muestra, cliente, analisis, numeroInforme });

  return Informe.create({
    muestraId: muestra._id,
    numeroInforme,
    estado: 'generado',
    archivo,
    version,
    regeneradoDe,
    generadoPor: usuario,
    fechaGeneracion: new Date(),
  });
}

// Copia segura del informe para auditoría: nunca guarda el PDF en la auditoría.
function paraAuditoria(informe) {
  const copia = informe && typeof informe.toObject === 'function' ? informe.toObject() : { ...informe };
  delete copia.archivo;
  return copia;
}

async function evento(informe, usuario, descripcion, accion) {
  await registrarEvento({
    muestraId: informe.muestraId,
    tipoEvento: 'resultado',
    descripcion,
    usuarioId: usuario,
    visibleCliente: true,
  });
  await registrarAuditoria({
    entidad: 'informes',
    entidadId: String(informe._id),
    accion,
    despues: paraAuditoria(informe),
    usuario,
  });
}

// RF-095: genera el informe.
export async function generar(muestraId, usuario) {
  const { muestra, cliente, analisis } = await cargarContexto(muestraId);
  await exigirResultadosValidados(analisis);

  const informe = await crearInforme({ muestra, cliente, analisis }, usuario);
  await evento(informe, usuario, `Informe ${informe.numeroInforme} generado`, 'generar');

  return informe;
}

// RF-098: regenera en una versión nueva; la anterior se conserva (historial).
export async function regenerar(id, usuario) {
  const anterior = await Informe.findById(id);
  if (!anterior) throw new AppError('Informe no encontrado', 404);

  const { muestra, cliente, analisis } = await cargarContexto(anterior.muestraId);
  await exigirResultadosValidados(analisis);

  const informe = await crearInforme({
    muestra,
    cliente,
    analisis,
    version: (anterior.version || 1) + 1,
    regeneradoDe: anterior._id,
  }, usuario);

  await evento(
    informe,
    usuario,
    `Informe ${informe.numeroInforme} regenerado (versión ${informe.version}) a partir de ${anterior.numeroInforme}`,
    'regenerar'
  );
  return { informe, anterior };
}

// RF-096: marca el informe como disponible y dispara la encuesta al cliente.
export async function marcarDisponible(id, usuario) {
  const informe = await Informe.findById(id);
  if (!informe) throw new AppError('Informe no encontrado', 404);
  if (informe.estado === 'disponible' || informe.estado === 'enviado') {
    throw new AppError(`El informe ya está en estado "${informe.estado}"`, 400);
  }

  const antes = informe.toObject();
  informe.estado = 'disponible';
  informe.fechaDisponibilidad = new Date();
  await informe.save();

  await evento(informe, usuario, `Informe ${informe.numeroInforme} disponible para el cliente`, 'disponible');

  // Entrega al cliente: se crea/envía la encuesta de satisfacción (RF-099).
  const muestra = await Muestra.findById(informe.muestraId);
  const cliente = muestra ? await Cliente.findById(muestra.clienteId) : null;
  if (muestra && cliente) await crearYEnviarEncuesta({ muestra, cliente }, usuario);

  await registrarAuditoria({
    entidad: 'informes',
    entidadId: String(informe._id),
    accion: 'disponible',
    antes: paraAuditoria(antes),
    despues: paraAuditoria(informe),
    usuario,
  });
  return informe;
}

// RF-097: envía el informe al cliente (PDF adjunto o enlace público) y
// crea/envía la encuesta de satisfacción.
export async function enviar(id, usuario, { conAdjunto = true } = {}) {
  const informe = await Informe.findById(id).select('+archivo');
  if (!informe) throw new AppError('Informe no encontrado', 404);
  if (informe.estado === 'borrador') {
    throw new AppError('El informe está en borrador: no se puede enviar', 400);
  }
  if (!informe.archivo) throw new AppError('El informe no tiene archivo PDF adjunto', 400);

  const muestra = await Muestra.findById(informe.muestraId);
  if (!muestra) throw new AppError('La muestra del informe ya no existe', 404);
  const cliente = await Cliente.findById(muestra.clienteId);
  if (!cliente?.email) throw new AppError('El cliente no tiene correo registrado', 400);

  const enlace = enlacePublico(muestra);
  const adjunto = conAdjunto
    ? [{ nombre: `${informe.numeroInforme}.pdf`, contenido: informe.archivo, tipoMime: 'application/pdf' }]
    : null;

  const antes = informe.toObject();
  const notificacion = await crearNotificacion({
    muestra,
    cliente,
    tipo: 'resultados_disponibles',
    asunto: `Resultados disponibles — informe ${informe.numeroInforme}`,
    mensaje: [
      `Los resultados de la muestra "${muestra.nombreMuestra}" ya están disponibles.`,
      `Informe: ${informe.numeroInforme} (versión ${informe.version || 1}).`,
      enlace ? `Puedes consultarlo en: ${enlace}` : 'Consulta el informe con tu código de seguimiento.',
    ].join('\n'),
    adjuntos: adjunto,
    enlace,
  });

  if (notificacion.estado !== 'enviada') {
    throw new AppError(
      `No fue posible enviar el informe al cliente: ${notificacion.errorUltimoIntento || 'error desconocido'}`,
      502
    );
  }

  if (informe.estado !== 'enviado') {
    informe.estado = 'enviado';
    await informe.save();
  }

  await evento(informe, usuario, `Informe ${informe.numeroInforme} enviado al cliente`, 'enviar');
  await registrarAuditoria({
    entidad: 'informes',
    entidadId: String(informe._id),
    accion: 'enviar',
    antes: paraAuditoria(antes),
    despues: paraAuditoria(informe),
    usuario,
  });

  // Al entregar el informe se crea y envía la encuesta (RF-099).
  await crearYEnviarEncuesta({ muestra, cliente }, usuario);

  return { informe, notificacion };
}

// Descarga interna del PDF (select +archivo).
export async function descargar(id) {
  const informe = await Informe.findById(id).select('+archivo');
  if (!informe || !informe.archivo?.length) {
    throw new AppError('El archivo del informe no está disponible', 404);
  }
  return informe;
}

export { ESTADOS_INFORME, exigirResultadosValidados, cargarContexto };
