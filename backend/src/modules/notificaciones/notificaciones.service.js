// Envío de notificaciones por correo. Fase 5: solo registra en consola.
// Fase 6 lo ampliará con reintentos y estados enviada/fallida.
export async function notificarIncidencia({ incidencia, muestra, accion }) {
  console.log(`🔔 [notificaciones] Incidencia "${incidencia?.titulo || incidencia?._id}" (${accion}) sobre muestra ${muestra?.codigo || muestra?._id || ''}`);
  return { registrado: true };
}
