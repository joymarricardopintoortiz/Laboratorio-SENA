// Esquemas de validación zod del módulo disposiciones.
import { z } from 'zod';
import { TIPOS_DISPOSICION } from './disposiciones.model.js';

export const crearDisposicionSchema = z.object({
  muestraId: z.string().min(1, 'La muestra es obligatoria'),
  tipo: z.enum(TIPOS_DISPOSICION, { message: 'El tipo debe ser "devolucion" o "desecho"' }),
  motivo: z.string().trim().min(3, 'El motivo debe tener al menos 3 caracteres'),
  observacion: z.string().optional(),
  fechaSalida: z.string().datetime({ message: 'fechaSalida debe ser una fecha válida' }).optional(),
  notificacionCliente: z.boolean().optional(),
});

export const listarDisposicionesSchema = z.object({
  muestra: z.string().min(1).optional(),
  muestraId: z.string().min(1).optional(),
  tipo: z.enum(TIPOS_DISPOSICION).optional(),
});
