// Pagos simulados: sin pasarela y sin datos de tarjeta (RNF-018).
import crypto from 'node:crypto';

// Genera una referencia de pago impredecible.
export function generarReferencia() {
  return `PAY-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// Confirma un pago simulado (marca el pago como confirmado).
export async function confirmarPagoSimulado(pago) {
  pago.estado = 'confirmado';
  pago.fechaConfirmacion = new Date();
  await pago.save();
  return pago;
}
