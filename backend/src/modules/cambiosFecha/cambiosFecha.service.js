// Lógica de cambios de fecha estimada.
import { CambioFecha } from './cambiosFecha.model.js';

// `motivo` es interno (auditoría) y `motivoPublico` es lo único visible para el
// cliente en la consulta pública de seguimiento.
export async function registrarCambio({ muestraId, fechaAnterior, fechaNueva, motivo, motivoPublico = '', usuarioId }) {
  return CambioFecha.create({
    muestraId,
    fechaAnterior,
    fechaNueva,
    motivo,
    motivoPublico: motivoPublico || '',
    usuarioId,
    fechaCambio: new Date(),
  });
}

export const historial = (muestraId) => CambioFecha.find({ muestraId }).sort({ fechaCambio: -1 });
