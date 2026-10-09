// Cola de reenvío de notificaciones pospuestas por el límite diario de correos.
//
// Regla: como máximo MAIL_LIMITE_DIA (10) correos por día calendario de Bogotá.
// Lo que no entra en el cupo queda "pendiente" con una proximaTentativa y este
// servicio lo retoma solo, en orden de creación, en cuanto hay cupo.
//
// El intervalo usa .unref() para no mantener vivo el proceso: los scripts y las
// pruebas que importan esto nunca se quedan colgados por la cola.
import { Notificacion, MAX_INTENTOS } from '../modules/notificaciones/notificaciones.model.js';
import { enviarNotificacion } from '../modules/notificaciones/notificaciones.service.js';
import { cupoRestante } from './mail.service.js';

// Revisión cada 30 minutos; el primer intento ocurre pasados 45 s del arranque
// (para no competir con la conexión a la base de datos).
const INTERVALO_MS = 30 * 60 * 1000;
const ESPERA_INICIAL_MS = 45 * 1000;

let enMarcha = false;
let temporizador = null;

// Envía todas las notificaciones vencidas que entren en el cupo restante del día.
export async function procesarCola() {
  if (enMarcha) return { revisadas: 0, enviadas: 0 };
  enMarcha = true;

  try {
    const cupo = await cupoRestante();
    if (cupo <= 0) return { revisadas: 0, enviadas: 0, cupo: 0 };

    // El plugin de borrado lógico ya excluye los documentos eliminados.
    const pendientes = await Notificacion.find({
      estado: 'pendiente',
      proximaTentativa: { $lte: new Date() },
      intentos: { $lt: MAX_INTENTOS },
    })
      .sort({ fechaProgramada: 1, proximaTentativa: 1 })
      .limit(cupo);

    if (pendientes.length === 0) return { revisadas: 0, enviadas: 0, cupo };

    let enviadas = 0;
    for (const notificacion of pendientes) {
      // Se revalida el cupo en cada envío: otro proceso pudo consumirlo.
      const restante = await cupoRestante();
      if (restante <= 0) break;
      await enviarNotificacion(notificacion);
      if (notificacion.estado === 'enviada') enviadas += 1;
    }

    if (enviadas > 0) {
      console.log(`📨 Cola de correos: ${enviadas} aviso(s) pospuesto(s) enviado(s).`);
    }
    return { revisadas: pendientes.length, enviadas, cupo };
  } catch (error) {
    console.warn(`⚠️  Cola de correos: ${error.message}`);
    return { revisadas: 0, enviadas: 0, error: error.message };
  } finally {
    enMarcha = false;
  }
}

// Arranca la revisión periódica. Solo la llama src/server.js.
export function iniciarCola() {
  if (temporizador) return;
  temporizador = setInterval(() => {
    procesarCola();
  }, INTERVALO_MS);
  // .unref(): la cola no debe impedir que el proceso termine.
  temporizador.unref?.();

  setTimeout(() => {
    procesarCola();
  }, ESPERA_INICIAL_MS).unref?.();

  console.log(`📨 Cola de correos activa: revisión cada ${INTERVALO_MS / 60000} min.`);
}
