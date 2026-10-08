// Rutas internas /api/interno/* (Fase 1+: exigirán JWT y roles).
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
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
import disposicionesRoutes from '../modules/disposiciones/disposiciones.routes.js';
import informesRoutes from '../modules/informes/informes.routes.js';
import encuestasRoutes from '../modules/encuestas/encuestas.routes.js';
import facturasRoutes from '../modules/facturas/facturas.routes.js';
import usuariosRoutes from '../modules/usuarios/usuarios.routes.js';
import auditoriasRoutes from '../modules/auditorias/auditorias.routes.js';

const router = Router();

// NINGUNA ruta de /api/interno queda sin autenticación (RNF-003): este guardia
// corre ANTES de montar los módulos, así que aunque un módulo se olvide de
// declarar `router.use(auth)` la petición igual exige JWT. El único punto que
// entra sin token es el login.
const esLogin = (req) =>
  req.method === 'POST' && req.originalUrl.split('?')[0] === '/api/interno/auth/login';

router.use((req, res, next) => (esLogin(req) ? next() : auth(req, res, next)));

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
// Fase 7: disposiciones, informes, encuestas y facturas.
router.use('/disposiciones', disposicionesRoutes);
router.use('/informes', informesRoutes);
router.use('/encuestas', encuestasRoutes);
router.use('/facturas', facturasRoutes);
// Gestión de usuarios y consulta de auditorías: exclusivas del rol admin.
router.use('/usuarios', usuariosRoutes);
router.use('/auditorias', auditoriasRoutes);

export default router;
