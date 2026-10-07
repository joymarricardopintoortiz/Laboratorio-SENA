// Esquemas de validación zod de incidencias.
import { z } from 'zod';

export const crearIncidenciaSchema = z
  .object({
    muestraId: z.string().min(1, 'La muestra es obligatoria'),
    tipo: z.enum(['informativa', 'demora', 'requiere_accion_cliente']),
    titulo: z.string().min(1, 'El título es obligatorio'),
    descripcion: z.string().optional(),
    observacionesInternas: z.string().optional(),
    visibleCliente: z.boolean().optional(),
    requiereRespuesta: z.boolean().optional(),
    nuevaFechaEstimada: z.string().optional(),
    motivo: z.string().optional(),
  })
  .refine((d) => d.tipo !== 'demora' || (d.nuevaFechaEstimada && d.motivo?.trim()), {
    message: 'La incidencia de demora exige nuevaFechaEstimada y motivo',
    path: ['nuevaFechaEstimada'],
  });

export const actualizarIncidenciaSchema = z.object({
  titulo: z.string().optional(),
  descripcion: z.string().optional(),
  observacionesInternas: z.string().optional(),
  visibleCliente: z.boolean().optional(),
  estado: z.enum(['abierta', 'en_revision', 'esperando_cliente', 'aprobada', 'cerrada']).optional(),
});

export const cerrarSchema = z.object({ motivo: z.string().optional() });
