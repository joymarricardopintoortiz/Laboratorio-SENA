// Generación de PDFs (informes, rótulos) con pdfkit.
// Devuelve un Buffer con el PDF listo para guardar o enviar.
import PDFDocument from 'pdfkit';

export function generarPDF({ titulo, lineas = [] }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(titulo, { align: 'center' });
    doc.moveDown();
    doc.fontSize(11);
    for (const linea of lineas) {
      doc.text(linea);
      doc.moveDown(0.3);
    }
    doc.moveDown();
    doc.fontSize(9).fillColor('gray').text(`Generado: ${new Date().toLocaleString('es-CO')}`);
    doc.end();
  });
}

// Rótulo de muestra.
export function generarRotuloPDF({ codigo, nombreMuestra, parametros, fechaRecepcion }) {
  return generarPDF({
    titulo: 'RÓTULO DE MUESTRA',
    lineas: [
      `Código: ${codigo}`,
      `Muestra: ${nombreMuestra}`,
      `Parámetros: ${parametros.join(', ') || 'Sin asignar'}`,
      `Fecha de recepción: ${new Date(fechaRecepcion).toLocaleDateString('es-CO')}`,
    ],
  });
}
