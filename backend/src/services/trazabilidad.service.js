// Trazabilidad: punto único para registrar eventos y actualizar ultimoEvento.
import { EventoTrazabilidad } from '../modules/eventosTrazabilidad/eventosTrazabilidad.model.js';
import { Muestra } from '../modules/muestras/muestras.model.js';

export async function registrarEvento({
  muestraId,
  tipoEvento,
  estadoAnterior = null,
  estadoNuevo = null,
  descripcion = '',
  ubicacion = '',
  visibleCliente = false,
  usuarioId = null,
  fecha = new Date(),
}) {
  const evento = await EventoTrazabilidad.create({
    muestraId, tipoEvento, estadoAnterior, estadoNuevo, descripcion, ubicacion, visibleCliente, usuarioId, fecha,
  });

  await Muestra.findByIdAndUpdate(muestraId, { ultimoEvento: { tipo: tipoEvento, fecha } });

  return evento;
}

export async function historial(muestraId) {
  return EventoTrazabilidad.find({ muestraId }).sort({ fecha: 1 });
}
