import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const uploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');

export async function saveUploadBuffer(buffer, originalName) {
  await fs.mkdir(uploadsDir, { recursive: true });
  const ext = path.extname(originalName || '') || '.xlsx';
  const storedFileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  await fs.writeFile(path.join(uploadsDir, storedFileName), buffer);
  return storedFileName;
}

export function storedUploadPath(storedFileName) {
  return path.join(uploadsDir, storedFileName);
}

export async function storedFileExists(storedFileName) {
  if (!storedFileName) return false;
  try {
    await fs.access(storedUploadPath(storedFileName));
    return true;
  } catch {
    return false;
  }
}

export function workbookFromBeneficiaries(headers, beneficiaries) {
  const cols = headers?.length
    ? headers
    : ['Student Index', 'Full Name', 'Level', 'Phone'];
  const rows = (beneficiaries || []).map((b) => {
    const sheet = b.sheetRow && Object.keys(b.sheetRow || {}).length
      ? b.sheetRow
      : {
        'Student Index': b.studentIndex,
        'Full Name': b.fullName,
        Level: b.level,
        Phone: b.phone,
      };
    return cols.map((h) => sheet[h] ?? '');
  });
  const ws = XLSX.utils.aoa_to_sheet([cols, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'List');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
