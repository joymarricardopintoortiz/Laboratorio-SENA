// Rutas del módulo cotizaciones.
import { Router } from 'express';
import * as controller from './cotizaciones.controller.js';
import { validate } from '../../middlewares/validate.js';
import { auth } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { crearCotizacionSchema } from './cotizaciones.schema.js';

const router = Router();
router.use(auth);

router.get('/', requireRole('admin', 'encargado', 'usuario'), controller.listar);
router.get('/:id', requireRole('admin', 'encargado', 'usuario'), controller.obtener);
router.post('/', requireRole('admin', 'encargado'), validate(crearCotizacionSchema), controller.crear);
router.post('/:id/enviar', requireRole('admin', 'encargado'), controller.enviar);
router.post('/:id/aceptar', requireRole('admin', 'encargado'), controller.aceptar);
router.post('/:id/rechazar', requireRole('admin', 'encargado'), controller.rechazar);

export default router;
