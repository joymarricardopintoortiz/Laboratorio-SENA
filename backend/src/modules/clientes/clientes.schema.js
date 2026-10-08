// Esquemas de validación zod del módulo clientes.
import { z } from 'zod';

export const crearClienteSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio').max(120, 'El nombre no puede superar los 120 caracteres'),
  tipoDocumento: z.enum(['CC', 'NIT', 'CE', 'TI']).optional(),
  numeroDocumento: z.string().min(1, 'El documento es obligatorio').max(20, 'El documento no puede superar los 20 caracteres'),
  email: z.string().email('Correo inválido').max(150, 'El correo no puede superar los 150 caracteres'),
  telefono: z.string().max(20, 'El teléfono no puede superar los 20 caracteres').optional(),
  direccion: z.string().max(200, 'La dirección no puede superar los 200 caracteres').optional(),
  tipoCliente: z.enum(['interno', 'externo'], { message: 'tipoCliente debe ser interno o externo' }),
});

export const actualizarClienteSchema = crearClienteSchema.partial();
