// Rutas internas /api/interno/* (Fase 1+: exigirán JWT y roles).
import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import clientesRoutes from '../modules/clientes/clientes.routes.js';
import solicitudesRoutes from '../modules/solicitudes/solicitudes.routes.js';
import parametrosRoutes from '../modules/parametrosAnalisis/parametrosAnalisis.routes.js';
import cotizacionesRoutes from '../modules/cotizaciones/cotizaciones.routes.js';
import pagosRoutes from '../modules/pagos/pagos.routes.js';
import muestrasRoutes from '../modules/muestras/muestras.routes.js';
import analisisRoutes from '../modules/analisisMuestras/analisisMuestras.routes.js';
import incidenciasRoutes from '../modules/incidencias/incidencias.routes.js';
import notificacionesRoutes from '../modules/notificaciones/notificaciones.routes.js';

const router = Router();

// Auth: login público; perfil requiere JWT.
router.use('/auth', authRoutes);
router.use('/clientes', clientesRoutes);
router.use('/solicitudes', solicitudesRoutes);
router.use('/parametros-analisis', parametrosRoutes);
router.use('/cotizaciones', cotizacionesRoutes);
router.use('/pagos', pagosRoutes);
router.use('/muestras', muestrasRoutes);
router.use('/analisis', analisisRoutes);
router.use('/incidencias', incidenciasRoutes);
router.use('/notificaciones', notificacionesRoutes);

export default router;
