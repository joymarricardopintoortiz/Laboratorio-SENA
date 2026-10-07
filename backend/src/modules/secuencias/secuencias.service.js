// Genera consecutivos atómicos con findOneAndUpdate + $inc.
import { Secuencia } from './secuencias.model.js';

export async function siguiente(clave) {
  const doc = await Secuencia.findOneAndUpdate(
    { _id: clave },
    { $inc: { secuencia: 1 } },
    { new: true, upsert: true }
  );
  return doc.secuencia;
}
