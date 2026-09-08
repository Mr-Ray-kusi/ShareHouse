const DB_NAME = 'sharehouse-desk';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('marks')) db.createObjectStore('marks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('exceptions')) db.createObjectStore('exceptions', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function storeOp(storeName, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    if (req && req !== store) {
      req.onerror = () => reject(req.error);
    }
  }));
}

export function isNetworkError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!err) return false;
  if (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK') return true;
  if (err.response) return false;
  return Boolean(err.request);
}

export function foldOffline(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export async function savePack(pack) {
  await storeOp('kv', 'readwrite', (store) => store.put(pack, 'pack'));
}

export async function getPack() {
  return storeOp('kv', 'readonly', (store) => store.get('pack'));
}

export function searchPack(pack, query, limit = 24) {
  const needle = foldOffline(query);
  if (!pack?.beneficiaries || needle.length < 2) return [];
  return pack.beneficiaries
    .map((row) => {
      const hay = foldOffline(row.searchText || `${row.studentIndex} ${row.fullName} ${Object.values(row.sheetRow || {}).join(' ')}`);
      const index = foldOffline(row.studentIndex);
      let rank = 0;
      if (index === needle) rank = 3;
      else if (index.startsWith(needle)) rank = 2;
      else if (hay.includes(needle)) rank = 1;
      return { ...row, rank, offline: true };
    })
    .filter((row) => row.rank > 0)
    .sort((a, b) => b.rank - a.rank || String(a.fullName).localeCompare(String(b.fullName)))
    .slice(0, limit);
}

export async function enqueueMark(row) {
  const id = String(row.id || row.beneficiaryId);
  const item = {
    id,
    beneficiaryId: id,
    queuedAt: new Date().toISOString(),
    row,
  };
  await storeOp('marks', 'readwrite', (store) => store.put(item));
  return item;
}

export async function listQueuedMarks() {
  return storeOp('marks', 'readonly', (store) => store.getAll()) || [];
}

export async function removeQueuedMark(id) {
  await storeOp('marks', 'readwrite', (store) => store.delete(String(id)));
}

export async function enqueueException(payload) {
  const id = payload.id || `local-${Date.now()}`;
  const item = { id, queuedAt: new Date().toISOString(), ...payload };
  await storeOp('exceptions', 'readwrite', (store) => store.put(item));
  return item;
}

export async function listQueuedExceptions() {
  return storeOp('exceptions', 'readonly', (store) => store.getAll()) || [];
}

export async function removeQueuedException(id) {
  await storeOp('exceptions', 'readwrite', (store) => store.delete(String(id)));
}

export async function applyMarkToPack(beneficiaryId, extra = {}) {
  const pack = await getPack();
  if (!pack?.beneficiaries) return pack;
  pack.beneficiaries = pack.beneficiaries.map((row) => (
    String(row.id) === String(beneficiaryId)
      ? { ...row, collected: extra.collected !== false, ...extra, queued: Boolean(extra.queued) }
      : row
  ));
  await savePack(pack);
  return pack;
}

export async function queueCounts() {
  const [marks, exceptions] = await Promise.all([listQueuedMarks(), listQueuedExceptions()]);
  return {
    marks: (marks || []).length,
    exceptions: (exceptions || []).length,
  };
}
