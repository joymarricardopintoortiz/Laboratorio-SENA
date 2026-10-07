// Valida req.body (o params/query) con un esquema zod.
// Uso: validate(esquema) donde esquema = z.object({...})
import { AppError } from '../utils/AppError.js';

export const validate = (esquema, propiedad = 'body') => (req, res, next) => {
  const result = esquema.safeParse(req[propiedad]);
  if (!result.success) {
    const detalles = result.error.issues.map((i) => ({
      campo: i.path.join('.'),
      mensaje: i.message,
    }));
    return next(new AppError('Datos inválidos', 400, detalles));
  }
  req[propiedad] = result.data;
  next();
};
