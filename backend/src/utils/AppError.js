// Error de aplicación con código HTTP y detalles opcionales.
export class AppError extends Error {
  constructor(mensaje, status = 500, detalles = undefined) {
    super(mensaje);
    this.status = status;
    this.detalles = detalles;
  }
}
