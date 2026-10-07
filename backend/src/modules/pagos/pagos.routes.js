// Rutas del módulo pagos.
import { Router } from 'express';
import * as controller from './pagos.controller.js';
import { validate } from '../../middlewares/validate.js';
import { auth } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { crearPagoSchema } from './pagos.schema.js';

const router = Router();
router.use(auth);

router.get('/', requireRole('admin', 'encargado', 'usuario'), controller.listar);
router.post('/', requireRole('admin', 'encargado'), validate(crearPagoSchema), controller.crear);
router.post('/:referencia/confirmar', requireRole('admin', 'encargado'), controller.confirmar);

export default router;
