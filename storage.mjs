const DATABASE = 'bppicture-editor';
let connection;

function database() {
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('app');
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          connection = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Storage is blocked by another tab.'));
    }).catch(error => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}

async function transact(mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('app', mode);
    const request = operation(tx.objectStore('app'));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? new Error('Storage write was aborted.'));
  });
}

export const loadSession = () => transact('readonly', store => store.get('session'));

export function saveSession(photos, active) {
  const data = photos.map(({ id, name, source, width, height, blob, thumbnail, edit, past, future }) =>
    ({ id, name, source, width, height, blob, thumbnail, edit, past, future }));
  return transact('readwrite', store => store.put({ version: 1, photos: data, active }, 'session'));
}

export function loadPresets() {
  try {
    const data = JSON.parse(localStorage.getItem('bppicture-presets-v1') ?? localStorage.getItem('bppicture-ui-presets') ?? '[]');
    return Array.isArray(data) ? data.filter(preset => typeof preset?.name === 'string' && preset.values) : [];
  } catch {
    return [];
  }
}

export function savePresets(presets) {
  localStorage.setItem('bppicture-presets-v1', JSON.stringify(presets));
}
