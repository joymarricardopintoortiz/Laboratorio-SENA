// Lógica de cambios de fecha estimada.
import { CambioFecha } from './cambiosFecha.model.js';

export async function registrarCambio({ muestraId, fechaAnterior, fechaNueva, motivo, usuarioId }) {
  return CambioFecha.create({ muestraId, fechaAnterior, fechaNueva, motivo, usuarioId, fechaCambio: new Date() });
}

export const historial = (muestraId) => CambioFecha.find({ muestraId }).sort({ fechaCambio: -1 });
