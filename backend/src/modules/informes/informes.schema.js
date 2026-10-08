// Esquemas de validación zod del módulo informes.
import { z } from 'zod';
import { ESTADOS_INFORME } from './informes.model.js';

export const generarInformeSchema = z.object({
  muestraId: z.string().min(1, 'La muestra es obligatoria'),
});

export const listarInformesSchema = z.object({
  muestraId: z.string().min(1).optional(),
  muestra: z.string().min(1).optional(),
  estado: z.enum(ESTADOS_INFORME).optional(),
});

export const enviarInformeSchema = z.object({
  conAdjunto: z.boolean().optional(), // false → solo enlace público
});
