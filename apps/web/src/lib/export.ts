export async function exportToCSV(data: any[], filename: string) {
  if (data.length === 0) {
    alert("Nenhum dado para exportar");
    return;
  }
  
  const headers = Object.keys(data[0]);
  const csv = [
    headers.map(h => `"${h.replace(/"/g, '""')}"`).join(","),
    ...data.map(row => headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return "";
      const stringValue = typeof value === "string" ? value.replace(/"/g, '""') : String(value);
      return `"${stringValue}"`;
    }).join(","))
  ].join("\n");
  
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); // BOM para Excel
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportToPDF(title: string, content: string | HTMLElement) {
  // Usar window.print() para impressão/PDF
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          ${typeof content === "string" ? `<pre>${content}</pre>` : content.outerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}

export function formatDateForExport(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR");
}
