// Lógica de resultados de análisis.
import { AnalisisMuestra } from './analisisMuestras.model.js';
import { Muestra } from '../muestras/muestras.model.js';
import { ParametroAnalisis } from '../parametrosAnalisis/parametrosAnalisis.model.js';
import { AppError } from '../../utils/AppError.js';
import { registrarEvento } from '../../services/trazabilidad.service.js';
import { registrarAuditoria } from '../../middlewares/audit.js';

export async function registrar({ muestraId, parametroId, valor, resultado, unidad }, usuario) {
  const muestra = await Muestra.findById(muestraId);
  if (!muestra) throw new AppError('Muestra no encontrada', 404);
  const parametro = await ParametroAnalisis.findById(parametroId);
  if (!parametro) throw new AppError('Parámetro no encontrado', 404);

  const ejecuciones = await AnalisisMuestra.countDocuments({ muestraId, parametroId });
  const analisis = await AnalisisMuestra.create({
    muestraId, parametroId,
    numeroEjecucion: ejecuciones + 1,
    tipo: ejecuciones === 0 ? 'inicial' : 'repeticion',
    motivoRepeticion: ejecuciones === 0 ? '' : 'Repetición registrada',
    resultado: resultado || '',
    valor: valor ?? null,
    unidad: unidad || parametro.unidad || '',
    realizadoPor: usuario,
    estado: 'completado',
  });
  await registrarEvento({ muestraId, tipoEvento: 'resultado', descripcion: `Resultado de ${parametro.nombre}: ${valor ?? resultado}`, usuarioId: usuario });
  await registrarAuditoria({ entidad: 'analisisMuestras', entidadId: String(analisis._id), accion: 'registrar', despues: analisis.toObject(), usuario });
  return analisis;
}

// Repetir exige motivo y crea NUEVA ejecución (no sobrescribe).
export async function repetir(id, { motivoRepeticion, valor, resultado, unidad }, usuario) {
  const anterior = await AnalisisMuestra.findById(id);
  if (!anterior) throw new AppError('Análisis no encontrado', 404);
  if (!motivoRepeticion?.trim()) throw new AppError('El motivo de repetición es obligatorio', 400);

  const ejecuciones = await AnalisisMuestra.countDocuments({ muestraId: anterior.muestraId, parametroId: anterior.parametroId });
  const repeticion = await AnalisisMuestra.create({
    muestraId: anterior.muestraId,
    parametroId: anterior.parametroId,
    numeroEjecucion: ejecuciones + 1,
    tipo: 'repeticion',
    motivoRepeticion,
    resultado: resultado || '',
    valor: valor ?? null,
    unidad: unidad || anterior.unidad,
    realizadoPor: usuario,
    estado: 'completado',
  });
  await registrarEvento({ muestraId: anterior.muestraId, tipoEvento: 'repeticion', descripcion: `Repetición: ${motivoRepeticion}`, usuarioId: usuario });
  await registrarAuditoria({ entidad: 'analisisMuestras', entidadId: String(repeticion._id), accion: 'repetir', despues: repeticion.toObject(), usuario });
  return repeticion;
}

export async function validar(id, usuario) {
  const analisis = await AnalisisMuestra.findById(id);
  if (!analisis) throw new AppError('Análisis no encontrado', 404);
  const antes = analisis.toObject();
  analisis.estado = 'validado';
  analisis.validadoPor = usuario;
  analisis.fechaValidacion = new Date();
  await analisis.save();
  await registrarEvento({ muestraId: analisis.muestraId, tipoEvento: 'validacion', descripcion: 'Resultado validado', usuarioId: usuario });
  await registrarAuditoria({ entidad: 'analisisMuestras', entidadId: String(id), accion: 'validar', antes, despues: analisis.toObject(), usuario });
  return analisis;
}

export const porMuestra = (muestraId) =>
  AnalisisMuestra.find({ muestraId }).populate('parametroId', 'nombre unidad').sort({ parametroId: 1, numeroEjecucion: 1 });
