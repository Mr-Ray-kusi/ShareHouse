import api from '../api/client';
import {
  applyMarkToPack,
  getPack,
  isNetworkError,
  listQueuedExceptions,
  listQueuedMarks,
  queueCounts,
  removeQueuedException,
  removeQueuedMark,
  savePack,
} from './deskStore';

export async function refreshOfflinePack() {
  const { data } = await api.get('/api/collections/offline-pack', { timeout: 60000 });
  await savePack(data);
  return data;
}

export async function flushDeskQueue() {
  const marks = (await listQueuedMarks()) || [];
  if (marks.length) {
    const { data } = await api.post('/api/collections/mark-batch', {
      items: marks.map((item) => ({
        beneficiaryId: item.beneficiaryId,
        queuedAt: item.queuedAt,
      })),
    });
    for (const result of data.results || []) {
      if (result.status === 'accepted' || result.status === 'duplicate') {
        await removeQueuedMark(result.beneficiaryId);
        await applyMarkToPack(result.beneficiaryId, {
          collected: true,
          queued: false,
          markedBy: result.collection?.assistantName || 'Already collected',
          collectedAt: result.collection?.collectedAt || null,
        });
      }
    }
  }

  const exceptions = (await listQueuedExceptions()) || [];
  for (const item of exceptions) {
    const form = new FormData();
    form.append('fullName', item.fullName || '');
    form.append('studentIndex', item.studentIndex || '');
    form.append('level', item.level || '');
    form.append('phone', item.phone || '');
    form.append('reason', item.reason || '');
    if (item.photoBlob) form.append('photo', item.photoBlob, item.photoName || 'walk-in.jpg');
    try {
      await api.post('/api/exceptions', form);
      await removeQueuedException(item.id);
    } catch (err) {
      if (err.response?.status === 409) await removeQueuedException(item.id);
      else if (!isNetworkError(err)) await removeQueuedException(item.id);
    }
  }

  return queueCounts();
}

export async function hydratePackIfNeeded() {
  try {
    return await refreshOfflinePack();
  } catch (err) {
    if (isNetworkError(err)) return getPack();
    throw err;
  }
}
