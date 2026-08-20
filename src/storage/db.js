/**
 * IndexedDB abstraction for binary file storage.
 * Stores: "files" (receipt images / invoice PDFs) and "statement_files" (CC statement PDFs)
 */

const DB_NAME = "placebo_finance_hub";
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("statement_files")) {
        db.createObjectStore("statement_files", { keyPath: "id" });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

async function putFile(storeName, id, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put({ id, blob });
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getFile(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = (e) => resolve(e.target.result?.blob ?? null);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function deleteFile(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

export const fileDB = {
  /** Save a document file (image/PDF) by document ID */
  saveDocumentFile: (id, blob) => putFile("files", id, blob),
  /** Retrieve a document file blob by document ID */
  getDocumentFile: (id) => getFile("files", id),
  /** Delete a document file by document ID */
  deleteDocumentFile: (id) => deleteFile("files", id),

  /** Save a CC statement PDF by statement ID */
  saveStatementFile: (id, blob) => putFile("statement_files", id, blob),
  /** Retrieve a statement PDF blob by statement ID */
  getStatementFile: (id) => getFile("statement_files", id),
  /** Delete a statement file by statement ID */
  deleteStatementFile: (id) => deleteFile("statement_files", id),
};
