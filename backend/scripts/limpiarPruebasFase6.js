// Uso puntual: borra (lógicamente) los datos de prueba "PRUEBA FASE 6"
// que quedaron de las corridas interrumpidas de scripts/verificarFase6.js.
import { conectarDB } from '../src/config/db.js';
import { Cliente } from '../src/modules/clientes/clientes.model.js';
import { Solicitud } from '../src/modules/solicitudes/solicitudes.model.js';
import { Muestra } from '../src/modules/muestras/muestras.model.js';
import { Incidencia } from '../src/modules/incidencias/incidencias.model.js';
import { RespuestaIncidencia } from '../src/modules/incidencias/respuestasIncidencias.model.js';
import { Notificacion } from '../src/modules/notificaciones/notificaciones.model.js';
import { EventoTrazabilidad } from '../src/modules/eventosTrazabilidad/eventosTrazabilidad.model.js';
import { CambioFecha } from '../src/modules/cambiosFecha/cambiosFecha.model.js';

async function borrar(coleccion, filtro, etiqueta) {
  const docs = await coleccion.find(filtro);
  // Los modelos sin plugin de borrado lógico se dejan intactos (regla RNF-015).
  if (docs.some((d) => typeof d.softDelete !== 'function')) {
    console.log(`${etiqueta}: ${docs.length} registro(s) sin borrado lógico → se omiten`);
    return;
  }
  for (const d of docs) await d.softDelete('limpieza-fase6');
  console.log(`${etiqueta}: ${docs.length} borrado(s) lógico(s)`);
}

async function main() {
  await conectarDB();

  const muestras = await Muestra.find({ nombreMuestra: /^PRUEBA FASE 6/ });
  const idsMuestra = muestras.map((m) => m._id);

  const incidencias = await Incidencia.find({ titulo: /^PRUEBA FASE 6/ });
  const idsIncidencia = incidencias.map((i) => i._id);

  await borrar(RespuestaIncidencia, { incidenciaId: { $in: idsIncidencia } }, 'respuestas a incidencias');
  await borrar(Incidencia, { titulo: /^PRUEBA FASE 6/ }, 'incidencias');
  await borrar(Notificacion, { muestraId: { $in: idsMuestra } }, 'notificaciones');
  await borrar(EventoTrazabilidad, { muestraId: { $in: idsMuestra } }, 'eventos de trazabilidad');
  await borrar(CambioFecha, { muestraId: { $in: idsMuestra } }, 'cambios de fecha');
  await borrar(Muestra, { nombreMuestra: /^PRUEBA FASE 6/ }, 'muestras');
  await borrar(Solicitud, { descripcion: 'PRUEBA FASE 6' }, 'solicitudes');
  await borrar(Solicitud, { descripcion: 'PRUEBA FASE 6 correo' }, 'solicitudes (correo)');
  await borrar(Cliente, { nombre: /^PRUEBA FASE 6/ }, 'clientes');

  process.exit(0);
}

main().catch((e) => {
  console.error('Error en la limpieza:', e.message);
  process.exit(1);
});
