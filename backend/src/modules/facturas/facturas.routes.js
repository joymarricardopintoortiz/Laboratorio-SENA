// Rutas internas del módulo facturas.
// usuario → solo lectura (GET); admin/encargado → generan y gestionan.
import { Router } from 'express';
import * as controller from './facturas.controller.js';
import { validate } from '../../middlewares/validate.js';
import { auth } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { generarFacturaSchema, cambiarEstadoFacturaSchema } from './facturas.schema.js';

const router = Router();
router.use(auth);

const LECTURA = ['admin', 'encargado', 'usuario'];
const GESTION = ['admin', 'encargado'];

router.get('/', requireRole(...LECTURA), controller.listar);
router.post('/generar', requireRole(...GESTION), validate(generarFacturaSchema), controller.generar);
router.get('/:id', requireRole(...LECTURA), controller.obtener);
router.get('/:id/consultar', requireRole(...LECTURA), controller.consultar);
router.post('/:id/estado', requireRole(...GESTION), validate(cambiarEstadoFacturaSchema), controller.cambiarEstado);
router.post('/:id/reintentar', requireRole(...GESTION), controller.reintentar);
router.post('/:id/enviar', requireRole(...GESTION), controller.enviar);

export default router;
