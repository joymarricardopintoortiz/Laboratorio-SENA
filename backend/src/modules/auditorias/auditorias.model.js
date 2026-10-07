// Modelo de auditorias (append-only): registra antes/después de cada modificación.
import mongoose from 'mongoose';

const auditoriaSchema = new mongoose.Schema(
  {
    entidad: { type: String, required: true },       // ej: 'muestras', 'clientes'
    entidadId: { type: String, default: null },
    accion: { type: String, required: true },        // crear, actualizar, eliminar_logico...
    antes: { type: Object, default: null },
    despues: { type: Object, default: null },
    usuario: { type: String, default: null },        // usuario que hizo el cambio
    ip: { type: String, default: null },
  },
  { timestamps: true }
);

// Append-only: no permitir actualizar ni borrar registros de auditoría.
auditoriaSchema.pre('findOneAndUpdate', function () {
  throw new Error('Las auditorias no se pueden modificar');
});
auditoriaSchema.pre('deleteOne', function () {
  throw new Error('Las auditorias no se pueden borrar');
});

export const Auditoria = mongoose.model('Auditoria', auditoriaSchema);
