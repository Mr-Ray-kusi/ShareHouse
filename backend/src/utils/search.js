export function foldSearch(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchRegex(value) {
  const folded = foldSearch(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!folded) return null;
  const spaced = folded.replace(/ /g, '\\s+');
  return new RegExp(spaced, 'i');
}

export function namesMatch(entered, stored) {
  const a = foldSearch(entered);
  const b = foldSearch(stored);
  if (!a || !b) return false;
  if (a === b) return true;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  return longer.endsWith(` ${shorter}`);
}
