// Consultas públicas de solo lectura por código de seguimiento (RF-075 a RF-085).
//
// Reglas de seguridad (RNF-004):
// - Cada documento se convierte a un objeto con lista BLANCA de campos públicos;
//   jamás se devuelve el documento crudo de Mongoose.
// - NUNCA se exponen: _id internos, usuarioId, observacionesInternas, auditorías,
//   datos de otros clientes, parámetros internos ni ubicación física.
// - Un código inexistente y una muestra eliminada responden IGUAL (404), sin
//   revelar si alguna vez existió.
import { isValidObjectId } from 'mongoose';
import { Muestra } from '../muestras/muestras.model.js';
import { EventoTrazabilidad } from '../eventosTrazabilidad/eventosTrazabilidad.model.js';
import { Incidencia } from '../incidencias/incidencias.model.js';
import { CambioFecha } from '../cambiosFecha/cambiosFecha.model.js';
import { registrarRespuestaCliente } from '../incidencias/respuestasIncidencias.service.js';
import { AppError } from '../../utils/AppError.js';

// Mismo mensaje para "no existe", "está eliminada" y "no es válido".
const MENSAJE_NO_ENCONTRADA = 'No se encontró ninguna muestra con ese código de seguimiento. Verifica el código e inténtalo de nuevo.';

const hora = (fecha) => (fecha ? new Date(fecha).toLocaleTimeString('es-CO', { hour12: false }) : null);
// Las fechas de entrega se guardan como medianoche UTC: se muestran en UTC para
// que un cambio de zona horaria no corra un día hacia atrás o hacia adelante.
const fechaLarga = (fecha) => (fecha
  ? new Date(fecha).toLocaleDateString('es-CO', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })
  : null);

async function buscarMuestraPorCodigo(codigo) {
  const codigoLimpio = String(codigo ?? '').trim();
  if (!codigoLimpio) throw new AppError(MENSAJE_NO_ENCONTRADA, 404);
  // findOne aplica el filtro de borrado lógico: una muestra eliminada responde
  // exactamente igual que una que nunca existió.
  const muestra = await Muestra.findOne({ codigoSeguimiento: codigoLimpio });
  if (!muestra) throw new AppError(MENSAJE_NO_ENCONTRADA, 404);
  return muestra;
}

// Carga dinámica del modelo de un módulo que aún no existe (Fase 7: informes,
// facturas). Si el módulo no está implementado, la sección se OMITE.
async function cargarModelo(ruta, nombre) {
  try {
    const modulo = await import(ruta);
    const Modelo = modulo[nombre];
    return typeof Modelo?.findOne === 'function' ? Modelo : null;
  } catch {
    return null;
  }
}

// Devuelve el nombre del campo por el que el modelo se relaciona con la muestra.
function llaveMuestra(Modelo) {
  const rutas = Modelo.schema?.paths || {};
  if (rutas.muestraId) return 'muestraId';
  if (rutas.muestra) return 'muestra';
  if (rutas.solicitudId) return 'solicitudId';
  return null;
}

// Disponibilidad del informe: SOLO estado y fecha, nunca el archivo ni el PDF
// (RF-083). Se muestra la versión publicada más reciente.
async function estadoInforme(muestra) {
  const Informe = await cargarModelo('../informes/informes.model.js', 'Informe');
  const llave = Informe && llaveMuestra(Informe);
  if (!llave) return null;
  const valor = llave === 'solicitudId' ? muestra.solicitudId : muestra._id;
  if (!valor) return { disponible: false, estado: null, fecha: null };

  const informes = await Informe.find({ [llave]: valor })
    .select('estado fechaDisponibilidad version createdAt')
    .sort({ version: -1, createdAt: -1 })
    .limit(50)
    .lean();
  if (!informes.length) return { disponible: false, estado: null, fecha: null };

  const publicado = informes.find((i) => ['disponible', 'enviado'].includes(i.estado));
  const elegido = publicado || informes[0];
  return {
    disponible: Boolean(publicado),
    estado: elegido.estado ?? null,
    fecha: elegido.fechaDisponibilidad || elegido.createdAt || null,
  };
}

// Estado de facturación público: solo estado, número y fecha.
// El documento del proveedor, el pago y los internos NUNCA salen por aquí.
async function estadoFacturacion(muestra) {
  const Factura = await cargarModelo('../facturas/facturas.model.js', 'Factura');
  const llave = Factura && llaveMuestra(Factura);
  if (!llave) return null;
  const valor = llave === 'solicitudId' ? muestra.solicitudId : muestra._id;
  if (!valor) return { existe: false, estado: null, numero: null, fecha: null };

  const factura = await Factura.findOne({ [llave]: valor })
    .select('estado numero fechaGeneracion createdAt')
    .sort({ createdAt: -1 })
    .lean();
  if (!factura) return { existe: false, estado: null, numero: null, fecha: null };

  return {
    existe: true,
    estado: factura.estado ?? null,
    numero: factura.numero ?? null,
    fecha: factura.fechaGeneracion || factura.createdAt || null,
  };
}

// Descarga pública del PDF protegida por el mismo codigoSeguimiento (RF-083).
// Solo informes ya publicados; jamás devuelve borradores ni el JSON con el PDF.
export async function descargarInformePublico(codigoSeguimiento) {
  const muestra = await buscarMuestraPorCodigo(codigoSeguimiento);
  const Informe = await cargarModelo('../informes/informes.model.js', 'Informe');
  if (!Informe) throw new AppError('El informe aún no está disponible. Intenta más tarde.', 404);

  const informe = await Informe.findOne({
    muestraId: muestra._id,
    estado: { $in: ['disponible', 'enviado'] },
  })
    .select('+archivo numeroInforme fechaDisponibilidad')
    .sort({ version: -1, createdAt: -1 });

  if (!informe || !informe.archivo?.length) {
    throw new AppError('El informe de esta muestra aún no está disponible para descarga', 404);
  }

  return {
    archivo: informe.archivo,
    numeroInforme: informe.numeroInforme,
    nombreArchivo: `${informe.numeroInforme}.pdf`,
  };
}

// RF-077: consulta pública. Proyecta SOLO campos públicos y devuelve los datos
// ya armados (lista blanca) para que ninguna consulta posterior filtre de más.
export async function consultarSeguimiento(codigo) {
  const inicio = Date.now();
  const muestra = await buscarMuestraPorCodigo(codigo);

  const [eventos, cambios, incidencias, informe, facturacion] = await Promise.all([
    // visibleCliente=true: el historial interno nunca sale por aquí.
    EventoTrazabilidad.find({ muestraId: muestra._id, visibleCliente: true })
      .select('fecha tipoEvento descripcion estadoAnterior estadoNuevo')
      .sort({ fecha: 1 })
      .lean(),
    CambioFecha.find({ muestraId: muestra._id })
      .select('fechaAnterior fechaNueva motivo fechaCambio')
      .sort({ fechaCambio: 1 })
      .lean(),
    Incidencia.find({ muestraId: muestra._id, visibleCliente: true })
      .select('tipo titulo descripcion estado requiereRespuesta fechaCreacion nuevaFechaEstimada motivo fechaCierre')
      .sort({ fechaCreacion: 1 })
      .lean(),
    estadoInforme(muestra),
    estadoFacturacion(muestra),
  ]);

  const seguimiento = {
    codigoSeguimiento: muestra.codigoSeguimiento,
    codigo: muestra.codigo,
    nombreMuestra: muestra.nombreMuestra,
    estado: muestra.estado,
    fechaRecepcion: muestra.fechaRecepcion,
    fechaEstimadaEntrega: muestra.fechaEstimadaEntrega,
    // Historial visible: fecha, hora, descripción y estado (sin usuarioId).
    historial: eventos.map((e) => ({
      fecha: e.fecha,
      hora: hora(e.fecha),
      tipo: e.tipoEvento,
      descripcion: e.descripcion || '',
      estado: e.estadoNuevo || e.estadoAnterior || null,
    })),
    // Demoras y nuevas fechas visibles para el cliente.
    cambiosFecha: cambios.map((c) => ({
      fechaAnterior: c.fechaAnterior,
      fechaNueva: c.fechaNueva,
      motivo: c.motivo || '',
      fechaCambio: c.fechaCambio,
    })),
    // Incidencias visibles: nunca observacionesInternas ni usuarios internos.
    incidencias: incidencias.map((i) => ({
      id: String(i._id),
      tipo: i.tipo,
      titulo: i.titulo,
      descripcion: i.descripcion || '',
      estado: i.estado,
      requiereRespuesta: Boolean(i.requiereRespuesta),
      puedeResponder: i.estado === 'esperando_cliente',
      fechaCreacion: i.fechaCreacion,
      nuevaFechaEstimada: i.tipo === 'demora' ? i.nuevaFechaEstimada : null,
      motivo: i.motivo || '',
      fechaCierre: i.fechaCierre,
    })),
  };

  // Se añaden solo si el módulo correspondiente ya existe (Fase 7).
  if (informe) seguimiento.informe = informe;
  if (facturacion) seguimiento.facturacion = facturacion;

  seguimiento.tiempoConsultaMs = Date.now() - inicio;
  return seguimiento;
}

// RF-079 / RF-081: el cliente responde una incidencia que está esperando respuesta.
// Solo acepta POST esta ruta concreta; el resto de la superficie pública es de
// solo lectura (RNF-005).
export async function responderIncidencia({ codigoSeguimiento, incidenciaId, mensaje, archivos = [] }) {
  const muestra = await buscarMuestraPorCodigo(codigoSeguimiento);

  // Id inválido responde 404 con el mismo mensaje: no se puede sondear la BD.
  if (!isValidObjectId(incidenciaId)) throw new AppError(MENSAJE_NO_ENCONTRADA, 404);

  const incidencia = await Incidencia.findById(incidenciaId);
  if (!incidencia || String(incidencia.muestraId) !== String(muestra._id)) {
    throw new AppError('La incidencia no existe para este código de seguimiento', 404);
  }
  if (!incidencia.visibleCliente) {
    throw new AppError('La incidencia no está disponible para el cliente', 404);
  }
  if (incidencia.estado !== 'esperando_cliente') {
    throw new AppError('La incidencia no está esperando respuesta del cliente', 400);
  }

  // Mismo servicio que usa el personal interno, con la validación de multer de la Fase 5.
  const respuesta = await registrarRespuestaCliente(incidencia._id, { mensaje }, archivos);

  return {
    fecha: respuesta.fecha,
    archivos: (respuesta.archivos || []).map((a) => ({ nombre: a.nombre, tamano: a.tamano })),
    incidencia: { id: String(incidencia._id), titulo: incidencia.titulo, estado: incidencia.estado },
  };
}
