// Esquemas de validación zod de muestras.
import { z } from 'zod';

export const recibirMuestraSchema = z.object({
  solicitudId: z.string().min(1, 'La solicitud es obligatoria'),
  nombreMuestra: z.string().min(1, 'El nombre de la muestra es obligatorio').max(150, 'El nombre no puede superar los 150 caracteres'),
  descripcion: z.string().optional(),
  tipoFisico: z.enum(['solido', 'liquido']),
  cantidad: z.number().positive('La cantidad debe ser mayor que 0'),
  verificacionFisica: z.boolean().optional(),
});

export const rechazarSchema = z.object({
  motivoRechazo: z.string().min(1, 'El motivo de rechazo es obligatorio').max(300, 'El motivo no puede superar los 300 caracteres'),
});

export const parametrosSchema = z.object({
  parametrosIds: z.array(z.string().min(1)).min(1, 'Selecciona al menos un parámetro'),
});

export const ubicacionSchema = z.object({
  ubicacion: z.string().min(1, 'La ubicación es obligatoria').max(150, 'La ubicación no puede superar los 150 caracteres'),
  clasificacion: z.enum(['ingresada', 'en_proceso', 'en_analisis']),
});

export const actualizarMuestraSchema = z.object({
  nombreMuestra: z.string().optional(),
  descripcion: z.string().optional(),
  verificacionFisica: z.boolean().optional(),
  fechaEstimadaEntrega: z.string().datetime().optional(),
  fechaLimiteConservacion: z.string().datetime().optional(),
});
