// Modelo de muestras con borrado lógico e índices (RNF-015, RF-032, RF-075).
import mongoose from 'mongoose';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';
import { ESTADOS_MUESTRA } from '../../config/constants.js';

const muestraSchema = new mongoose.Schema(
  {
    solicitudId: { type: mongoose.Schema.Types.ObjectId, ref: 'Solicitud', required: true },
    clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', required: true },
    nombreMuestra: { type: String, required: true, trim: true },
    descripcion: { type: String, default: '' },
    tipoFisico: { type: String, enum: ['solido', 'liquido'], required: true },
    cantidad: { type: Number, required: true, min: 0 },
    unidad: { type: String, required: true }, // 'g' (sólidos) | 'ml' (líquidos)
    verificacionFisica: { type: Boolean, default: false },
    estadoRecepcion: { type: String, enum: ['pendiente', 'aceptada', 'rechazada'], default: 'pendiente' },
    motivoRechazo: { type: String, default: '' },
    codigo: { type: String, default: null }, // 0042-2026
    codigoSeguimiento: { type: String, default: null }, // aleatorio e impredecible
    estado: { type: String, enum: ESTADOS_MUESTRA, default: 'ingresada' },
    parametrosSeleccionados: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ParametroAnalisis' }],
    rotuloImpreso: { type: Boolean, default: false },
    rotuloPdf: { type: Buffer, default: null, select: false }, // PDF guardado en la BD (RNF-016)
    ubicacionActual: {
      clasificacion: { type: String, enum: ['ingresada', 'en_proceso', 'en_analisis'], default: 'ingresada' },
      ubicacion: { type: String, default: '' },
      actualizadoEn: { type: Date, default: Date.now },
    },
    fechaRecepcion: { type: Date, default: Date.now },
    fechaInicio: { type: Date, default: null },
    fechaEstimadaEntrega: { type: Date, default: null },
    fechaCierre: { type: Date, default: null },
    fechaLimiteConservacion: { type: Date, default: null },
    // RF-091: true cuando venció el plazo de conservación sin disposición.
    pendienteDisposicion: { type: Boolean, default: false },
    ultimoEvento: {
      tipo: { type: String, default: null },
      fecha: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// Índices exigidos.
muestraSchema.index({ codigo: 1 }, { unique: true, sparse: true });
muestraSchema.index({ codigoSeguimiento: 1 }, { unique: true, sparse: true });
muestraSchema.index({ estado: 1, fechaRecepcion: -1 });
muestraSchema.index({ solicitudId: 1 });
// Listado de muestras por cliente y pendientes de disposición (RF-091).
muestraSchema.index({ clienteId: 1 });
muestraSchema.index({ pendienteDisposicion: 1, fechaLimiteConservacion: 1 });

muestraSchema.plugin(softDeletePlugin);

export const Muestra = mongoose.model('Muestra', muestraSchema);
