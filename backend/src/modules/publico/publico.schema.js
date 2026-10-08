// Esquemas de validación zod de la API pública (sin login).
import { z } from 'zod';

// POST /api/publico/seguimiento/:codigoSeguimiento/incidencias/:incidenciaId/respuesta
// Los archivos los valida multer (MAX_FILE_MB, máx. 3, solo PDF/JPG/PNG).
export const responderIncidenciaSchema = z.object({
  mensaje: z
    .string({ error: 'El mensaje es obligatorio' })
    .trim()
    .min(3, 'El mensaje debe tener al menos 3 caracteres')
    .max(2000, 'El mensaje no puede superar los 2000 caracteres'),
});
