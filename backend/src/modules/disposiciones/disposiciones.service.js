// Lógica de disposiciones y conservación (RF-086 a RF-093).
import { Disposicion, TIPOS_DISPOSICION } from './disposiciones.model.js';
import { Muestra } from '../muestras/muestras.model.js';
import { AppError } from '../../utils/AppError.js';
import { registrarAuditoria } from '../../middlewares/audit.js';
import { registrarEvento } from '../../services/trazabilidad.service.js';
import { notificarDisposicion } from '../notificaciones/notificaciones.service.js';

// Solo estas dos situaciones permiten disponer de la muestra.
const ESTADOS_PERMITIDOS = ['cerrada', 'rechazada'];

export const listar = (filtro = {}) => Disposicion.find(filtro)
  .populate('muestraId', 'codigo nombreMuestra estado')
  .sort({ fechaCreacion: -1 });

export async function obtener(id) {
  const disposicion = await Disposicion.findById(id).populate('muestraId', 'codigo nombreMuestra estado');
  if (!disposicion) throw new AppError('Disposición no encontrada', 404);
  return disposicion;
}

// RF-087: registra la disposición y mueve la muestra a devuelta/desechada.
export async function registrar(datos, usuario) {
  const { muestraId, tipo, motivo, observacion = '', fechaSalida, notificacionCliente = false } = datos;

  if (!TIPOS_DISPOSICION.includes(tipo)) {
    throw new AppError('El tipo de disposición debe ser "devolucion" o "desecho"', 400);
  }

  const muestra = await Muestra.findById(muestraId);
  if (!muestra) throw new AppError('Muestra no encontrada', 404);

  // Primero se comprueba que no exista ya una disposición: la muestra puede
  // haber pasado a "devuelta" o "desechada" con la disposición anterior.
  const existente = await Disposicion.findOne({ muestraId: muestra._id });
  if (existente) throw new AppError('La muestra ya tiene una disposición registrada', 400);

  if (!ESTADOS_PERMITIDOS.includes(muestra.estado)) {
    throw new AppError(
      `Solo se puede registrar una disposición sobre muestras cerradas o rechazadas (estado actual: ${muestra.estado})`,
      400
    );
  }

  const disposicion = await Disposicion.create({
    muestraId: muestra._id,
    tipo,
    motivo,
    observacion,
    fechaSalida: fechaSalida ? new Date(fechaSalida) : new Date(),
    notificacionCliente,
    realizadaPor: usuario,
  });

  // La muestra cambia de estado por trazabilidad: evento + auditoría.
  const antes = muestra.toObject();
  const estadoAnterior = muestra.estado;
  muestra.estado = tipo === 'devolucion' ? 'devuelta' : 'desechada';
  muestra.pendienteDisposicion = false;
  await muestra.save();

  await registrarEvento({
    muestraId: muestra._id,
    tipoEvento: 'cambio_estado',
    estadoAnterior,
    estadoNuevo: muestra.estado,
    descripcion: `Disposición registrada (${tipo}): ${motivo}`,
    usuarioId: usuario,
    visibleCliente: true,
  });
  await registrarAuditoria({
    entidad: 'disposiciones',
    entidadId: String(disposicion._id),
    accion: 'crear',
    despues: disposicion.toObject(),
    usuario,
  });
  await registrarAuditoria({
    entidad: 'muestras',
    entidadId: String(muestra._id),
    accion: 'disposicion',
    antes,
    despues: muestra.toObject(),
    usuario,
  });

  // Solo si el usuario lo pidió (RF-090).
  if (notificacionCliente) {
    await notificarDisposicion({ muestra, tipo, motivo });
  }

  return { disposicion, muestra };
}

// RF-092: marca como pendiente de disposición todo lo vencido y lo devuelve.
export async function pendientesDisposicion(usuario = 'sistema') {
  await marcarVencidas(usuario);
  return Muestra.find({ estado: 'cerrada', pendienteDisposicion: true })
    .select('codigo nombreMuestra estado fechaCierre fechaLimiteConservacion pendienteDisposicion clienteId')
    .populate('clienteId', 'nombre email')
    .sort({ fechaLimiteConservacion: 1 });
}

// RF-091: plazo vencido → la muestra queda marcada como pendiente de disposición.
export async function marcarVencidas(usuario = 'sistema') {
  const ahora = new Date();
  const vencidas = await Muestra.find({
    estado: 'cerrada',
    pendienteDisposicion: false,
    fechaLimiteConservacion: { $lte: ahora },
  });

  for (const muestra of vencidas) {
    muestra.pendienteDisposicion = true;
    await muestra.save();
    await registrarEvento({
      muestraId: muestra._id,
      tipoEvento: 'observacion',
      descripcion: `Vencido el plazo de conservación (${muestra.fechaLimiteConservacion?.toISOString().slice(0, 10)}): pendiente de disposición`,
      usuarioId: usuario,
      visibleCliente: true,
    });
  }
  return vencidas.length;
}
