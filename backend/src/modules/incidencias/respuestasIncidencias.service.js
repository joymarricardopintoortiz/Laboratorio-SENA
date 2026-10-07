// Lógica de respuestas a incidencias con adjuntos.
import { RespuestaIncidencia } from './respuestasIncidencias.model.js';
import { Incidencia } from './incidencias.model.js';
import { AppError } from '../../utils/AppError.js';
import { registrarAuditoria } from '../../middlewares/audit.js';
import { registrarEvento } from '../../services/trazabilidad.service.js';

export async function registrar(incidenciaId, { tipoUsuario, mensaje }, archivos = [], usuario) {
  const incidencia = await Incidencia.findById(incidenciaId);
  if (!incidencia) throw new AppError('Incidencia no encontrada', 404);

  const respuesta = await RespuestaIncidencia.create({
    incidenciaId,
    tipoUsuario,
    usuarioId: usuario,
    mensaje: mensaje || '',
    archivos: (archivos || []).map((f) => ({ nombre: f.originalname, tipoMime: f.mimetype, tamano: f.size, contenido: f.buffer })),
  });

  // Al responder el cliente, la incidencia pasa a en_revision y se crea evento.
  if (tipoUsuario === 'cliente') {
    incidencia.estado = 'en_revision';
    incidencia.acciones.push({ tipo: 'respuesta_cliente', usuario, fecha: new Date(), comentario: mensaje || '' });
    await incidencia.save();
    await registrarEvento({ muestraId: incidencia.muestraId, tipoEvento: 'observacion', descripcion: 'El cliente respondió la incidencia', usuarioId: usuario, visibleCliente: incidencia.visibleCliente });
  } else {
    incidencia.acciones.push({ tipo: 'respuesta_interna', usuario, fecha: new Date(), comentario: mensaje || '' });
    await incidencia.save();
  }

  await registrarAuditoria({ entidad: 'respuestasIncidencias', entidadId: String(respuesta._id), accion: 'crear', despues: { incidenciaId, tipoUsuario, mensaje }, usuario });
  return respuesta;
}

// Servicio específico para el cliente (Fase 6 lo expondrá por código de seguimiento).
export async function registrarRespuestaCliente(incidenciaId, { mensaje }, archivos = []) {
  return registrar(incidenciaId, { tipoUsuario: 'cliente', mensaje }, archivos, null);
}

export const porIncidencia = (incidenciaId) => RespuestaIncidencia.find({ incidenciaId }).sort({ fecha: 1 });

// Descarga de un archivo: pide el contenido de forma explícita.
export async function descargarArchivo(respuestaId, indice) {
  const respuesta = await RespuestaIncidencia.findById(respuestaId).select('+archivos.contenido');
  if (!respuesta) throw new AppError('Respuesta no encontrada', 404);
  const archivo = respuesta.archivos[indice];
  if (!archivo) throw new AppError('Archivo no encontrado', 404);
  return archivo;
}
