// Rutas internas del módulo notificaciones (requieren JWT).
// RF-111 (listado con filtros) y RF-112 (reintento de fallidas, máx. 3 intentos).
import { Router } from 'express';
import * as controller from './notificaciones.controller.js';
import { auth } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/requireRole.js';

const router = Router();
router.use(auth);

// Los tres roles pueden consultar (usuario es de solo lectura).
router.get('/', requireRole('admin', 'encargado', 'usuario'), controller.listar);
router.get('/:id', requireRole('admin', 'encargado', 'usuario'), controller.obtener);

// Solo admin y encargado pueden reintentar el envío.
router.post('/:id/reintentar', requireRole('admin', 'encargado'), controller.reintentar);

export default router;
