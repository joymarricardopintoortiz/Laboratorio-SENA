// Esquemas de validación zod del módulo notificaciones.
import { z } from 'zod';
import { TIPOS_NOTIFICACION, ESTADOS_NOTIFICACION } from './notificaciones.model.js';

// GET /api/interno/notificaciones?muestra=&estado=&tipo=
export const listarNotificacionesSchema = z.object({
  muestra: z.string().min(1).optional(),
  muestraId: z.string().min(1).optional(),
  estado: z.enum(ESTADOS_NOTIFICACION).optional(),
  tipo: z.enum(TIPOS_NOTIFICACION).optional(),
});
