// Modelo de auditorias (append-only): registra antes/después de cada modificación.
import mongoose from 'mongoose';

const auditoriaSchema = new mongoose.Schema(
  {
    // Longitudes según docs/CREACION_TABLAS.md (VARCHAR 50/30/30/150/45).
    entidad: { type: String, required: true, maxlength: 50 },   // ej: 'muestras', 'clientes'
    entidadId: { type: String, default: null, maxlength: 30 },
    accion: { type: String, required: true, maxlength: 30 },    // crear, actualizar, eliminar_logico...
    antes: { type: Object, default: null },
    despues: { type: Object, default: null },
    usuario: { type: String, default: null, maxlength: 150 },   // usuario que hizo el cambio
    ip: { type: String, default: null, maxlength: 45 },         // IPv4 o IPv6
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

// Índices: auditorías de una entidad concreta y orden cronológico (append-only).
auditoriaSchema.index({ entidad: 1, entidadId: 1, createdAt: -1 });
auditoriaSchema.index({ createdAt: -1 });

export const Auditoria = mongoose.model('Auditoria', auditoriaSchema);
