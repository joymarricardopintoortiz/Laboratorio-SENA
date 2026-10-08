// Rutas internas del módulo encuestas (solo lectura: todos los roles).
import { Router } from 'express';
import * as controller from './encuestas.controller.js';
import { auth } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/requireRole.js';

const router = Router();
router.use(auth);

router.get('/promedio', requireRole('admin', 'encargado', 'usuario'), controller.promedio);
router.get('/', requireRole('admin', 'encargado', 'usuario'), controller.listar);

export default router;
