// Rutas internas del módulo informes.
// usuario → solo lectura (GET / descarga); admin/encargado → generan y envían.
import { Router } from 'express';
import * as controller from './informes.controller.js';
import { validate } from '../../middlewares/validate.js';
import { auth } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { generarInformeSchema } from './informes.schema.js';

const router = Router();
router.use(auth);

const LECTURA = ['admin', 'encargado', 'usuario'];
const GESTION = ['admin', 'encargado'];

router.get('/', requireRole(...LECTURA), controller.listar);
router.post('/generar', requireRole(...GESTION), validate(generarInformeSchema), controller.generar);
router.get('/:id/descargar', requireRole(...LECTURA), controller.descargar);
router.post('/:id/regenerar', requireRole(...GESTION), controller.regenerar);
router.post('/:id/disponible', requireRole(...GESTION), controller.disponible);
router.post('/:id/enviar', requireRole(...GESTION), controller.enviar);

export default router;
