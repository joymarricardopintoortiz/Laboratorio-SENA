// Plugin Mongoose de borrado lógico (RNF-015).
// Agrega eliminado/eliminadoPor/fechaEliminacion y filtra automáticamente
// los documentos eliminados en las consultas find*.
export function softDeletePlugin(schema) {
  schema.add({
    eliminado: { type: Boolean, default: false },
    eliminadoPor: { type: String, default: null },
    fechaEliminacion: { type: Date, default: null },
  });

  const filtrar = function () {
    if (this.getFilter && this.getFilter().eliminado === undefined) {
      this.where({ eliminado: { $ne: true } });
    }
  };

  schema.pre('find', filtrar);
  schema.pre('findOne', filtrar);
  schema.pre('findOneAndUpdate', filtrar);
  schema.pre('countDocuments', filtrar);

  // Borrado lógico en lugar de físico.
  schema.methods.softDelete = function (usuarioId = null) {
    this.eliminado = true;
    this.eliminadoPor = usuarioId;
    this.fechaEliminacion = new Date();
    return this.save();
  };
}
