import { Project } from "../types";

const DB_NAME = 'LuxeLensDB';
const STORE_NAME = 'projects';
const SETTINGS_STORE = 'settings';
const DB_VERSION = 2;

// Initialize the database
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create projects store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }

      // Create settings store if it doesn't exist
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
    };
  });
};

export const saveProjectToHistory = async (project: Project): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(project);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

export const getProjectHistory = async (): Promise<Project[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      // Sort by newest first
      const projects = request.result as Project[];
      projects.sort((a, b) => b.timestamp - a.timestamp);
      resolve(projects);
    };
  });
};

export const deleteProjectFromHistory = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

// --- Settings / Logo Persistence ---

export const savePreferredLogo = async (base64: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = transaction.objectStore(SETTINGS_STORE);
    const request = store.put(base64, 'user_logo');

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

export const getPreferredLogo = async (): Promise<string | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SETTINGS_STORE, 'readonly');
    const store = transaction.objectStore(SETTINGS_STORE);
    const request = store.get('user_logo');

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(request.result || null);
    };
  });
};