const SPREADSHEET_NAMESPACE = "urn:schemas-microsoft-com:office:spreadsheet";
const METADATA_COLUMN = "__RecordData";

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cell(value, type = "String") {
  return `<Cell><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`;
}

function exportValue(record, column) {
  const value = record[column.key];
  if (column.array) return JSON.stringify(Array.isArray(value) ? value : []);
  return value ?? column.default ?? "";
}

export function createExcelWorkbook(recordsByStore, sheets) {
  const worksheets = sheets.map((sheet) => {
    const columns = `${sheet.columns.map(() => '<Column ss:AutoFitWidth="1"/>').join("")}<Column ss:Hidden="1"/>`;
    const header = `<Row>${sheet.columns.map((column) => cell(column.label)).join("")}${cell(METADATA_COLUMN)}</Row>`;
    const rows = (recordsByStore[sheet.id] || []).map((record) => {
      const values = sheet.columns.map((column) => {
        const value = exportValue(record, column);
        return column.type === "number" && value !== "" && Number.isFinite(Number(value))
          ? cell(Number(value), "Number")
          : cell(value);
      }).join("");
      return `<Row>${values}${cell(JSON.stringify(record))}</Row>`;
    }).join("");
    return `<Worksheet ss:Name="${escapeXml(sheet.label)}"><Table>${columns}${header}${rows}</Table></Worksheet>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${worksheets}</Workbook>`;
}

function rowValues(row) {
  const values = [];
  let index = 0;
  for (const cellNode of row.getElementsByTagNameNS("*", "Cell")) {
    const requestedIndex = Number(cellNode.getAttributeNS(SPREADSHEET_NAMESPACE, "Index") || cellNode.getAttribute("ss:Index"));
    if (Number.isFinite(requestedIndex) && requestedIndex > 0) index = requestedIndex - 1;
    values[index] = cellNode.getElementsByTagNameNS("*", "Data")[0]?.textContent || "";
    index += 1;
  }
  return values;
}

function importValue(value, column, sheetName, rowNumber) {
  if (column.type === "number") {
    if (value === "") return 0;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${sheetName} row ${rowNumber}: ${column.label} must be a number.`);
    return parsed;
  }
  if (column.array) {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch {}
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  if (column.type === "datetime-local" && value) return new Date(value).toISOString();
  return value;
}

export function parseExcelWorkbook(text, sheets) {
  if (typeof text !== "string" || text.length > 20 * 1024 * 1024) throw new Error("Excel workbook must be 20 MB or smaller.");
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("This is not a valid Excel XML workbook.");
  if (document.documentElement.localName !== "Workbook" || document.documentElement.namespaceURI !== SPREADSHEET_NAMESPACE) {
    throw new Error("This file is XML, but it is not an Excel XML workbook exported by My Wealth.");
  }

  const worksheetByName = new Map(Array.from(document.getElementsByTagNameNS("*", "Worksheet"), (worksheet) => [
    worksheet.getAttributeNS(SPREADSHEET_NAMESPACE, "Name") || worksheet.getAttribute("ss:Name") || "",
    worksheet
  ]));
  const recordsByStore = {};

  for (const sheet of sheets) {
    const worksheet = worksheetByName.get(sheet.label);
    if (!worksheet) throw new Error(`Excel workbook is missing the ${sheet.label} sheet.`);
    const rows = Array.from(worksheet.getElementsByTagNameNS("*", "Row"));
    if (!rows.length) throw new Error(`${sheet.label} sheet is missing its header row.`);
    const headers = rowValues(rows[0]);
    const metadataIndex = headers.indexOf(METADATA_COLUMN);
    const columnIndexes = new Map(sheet.columns.map((column) => [column.key, headers.findIndex((header) => header === column.label || header === column.key)]));
    for (const column of sheet.columns.filter((column) => column.required)) {
      if (columnIndexes.get(column.key) < 0) throw new Error(`${sheet.label} sheet is missing the ${column.label} column.`);
    }

    recordsByStore[sheet.id] = rows.slice(1).map((row, rowIndex) => {
      const values = rowValues(row);
      let record = {};
      if (metadataIndex >= 0 && values[metadataIndex]) {
        try {
          record = JSON.parse(values[metadataIndex]);
        } catch {
          throw new Error(`${sheet.label} row ${rowIndex + 2}: hidden record metadata is invalid.`);
        }
      }
      for (const column of sheet.columns) {
        const columnIndex = columnIndexes.get(column.key);
        if (columnIndex >= 0) record[column.key] = importValue(values[columnIndex] || "", column, sheet.label, rowIndex + 2);
      }
      return record;
    }).filter((record) => Object.values(record).some((value) => Array.isArray(value) ? value.length : String(value ?? "").trim()));
  }

  return recordsByStore;
}