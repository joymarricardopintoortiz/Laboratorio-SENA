// Rutas del módulo auditorias: SOLO lectura y SOLO para el rol admin.
// La colección es append-only (el modelo bloquea findOneAndUpdate y deleteOne),
// por lo que aquí no se declara ninguna ruta de escritura.
import { Router } from 'express';
import * as controller from './auditorias.controller.js';
import { auth } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/requireRole.js';

const router = Router();
router.use(auth);
router.use(requireRole('admin'));

// Los filtros (coleccion, documentoId, usuarioId, desde/hasta, pagina, limite)
// se validan con zod dentro del controller (req.query es solo lectura en Express 5).
router.get('/', controller.listar);

export default router;
