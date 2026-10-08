// Rutas internas del módulo disposiciones.
import { Router } from 'express';
import * as controller from './disposiciones.controller.js';
import { validate } from '../../middlewares/validate.js';
import { auth } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { crearDisposicionSchema } from './disposiciones.schema.js';

const router = Router();
router.use(auth);

// Los tres roles pueden consultar (usuario es de solo lectura).
router.get('/', requireRole('admin', 'encargado', 'usuario'), controller.listar);
router.get('/:id', requireRole('admin', 'encargado', 'usuario'), controller.obtener);

// Registrar disposición: solo personal del laboratorio.
router.post('/', requireRole('admin', 'encargado'), validate(crearDisposicionSchema), controller.crear);

export default router;
