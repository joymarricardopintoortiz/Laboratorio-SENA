// Rutas del módulo analisisMuestras.
import { Router } from 'express';
import * as controller from './analisisMuestras.controller.js';
import { validate } from '../../middlewares/validate.js';
import { auth } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { z } from 'zod';

const router = Router();
router.use(auth);

const registrarSchema = z.object({
  muestraId: z.string().min(1),
  parametroId: z.string().min(1),
  valor: z.number().optional(),
  resultado: z.string().optional(),
  unidad: z.string().optional(),
});

const repetirSchema = z.object({
  motivoRepeticion: z.string().min(1, 'El motivo de repetición es obligatorio'),
  valor: z.number().optional(),
  resultado: z.string().optional(),
  unidad: z.string().optional(),
});

router.post('/', requireRole('admin', 'encargado'), validate(registrarSchema), controller.registrar);
router.post('/:id/repetir', requireRole('admin', 'encargado'), validate(repetirSchema), controller.repetir);
router.post('/:id/validar', requireRole('admin', 'encargado'), controller.validar);
router.get('/muestra/:muestraId', requireRole('admin', 'encargado', 'usuario'), controller.porMuestra);

export default router;
