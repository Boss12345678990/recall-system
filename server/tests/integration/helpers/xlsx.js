import ExcelJS from 'exceljs'

export const HEADERS = ['姓名', '生日', '電話', '上次看診日', '有加 LINE', '備註']

export async function buildXlsx(rows, headers = HEADERS) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('客人資料')
  sheet.addRow(headers)
  rows.forEach((row) => sheet.addRow(row))
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
