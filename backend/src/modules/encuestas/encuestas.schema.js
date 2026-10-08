// Esquemas de validación zod del módulo encuestas.
import { z } from 'zod';

// POST /api/publico/encuestas/:token  (solo se puede responder UNA vez)
export const responderEncuestaSchema = z.object({
  respuestas: z
    .array(
      z.object({
        pregunta: z.string().trim().min(1, 'La pregunta es obligatoria'),
        calificacion: z
          .number({ message: 'La calificación debe ser un número del 1 al 5' })
          .int('La calificación debe ser un número entero')
          .min(1, 'La calificación mínima es 1')
          .max(5, 'La calificación máxima es 5'),
        comentario: z.string().max(500, 'El comentario no puede superar 500 caracteres').optional(),
      })
    )
    .min(1, 'Debes responder al menos una pregunta')
    .max(20, 'Demasiadas respuestas'),
});
