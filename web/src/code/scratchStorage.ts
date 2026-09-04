const DB_NAME = 'qima-scratch-projects-v2'
const STORE_NAME = 'projects'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function readScratchProject(id: string): Promise<ArrayBuffer | null> {
  const database = await openDatabase()
  return new Promise<ArrayBuffer | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id)
    request.onsuccess = () => resolve((request.result?.project as ArrayBuffer | undefined) || null)
    request.onerror = () => reject(request.error)
  }).finally(() => database.close())
}

export async function saveScratchProject(id: string, project: ArrayBuffer): Promise<void> {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put({ id, project, updatedAt: Date.now() })
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  }).finally(() => database.close())
}
