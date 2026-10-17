let connection: Promise<IDBDatabase> | undefined

function openComposerDb(): Promise<IDBDatabase> {
  if (connection) return connection
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('jablu-composer', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('files', { keyPath: 'key' })
      const outbox = request.result.createObjectStore('outbox', { keyPath: 'id' })
      outbox.createIndex('userId', 'userId')
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close()
        connection = undefined
      }
      resolve(request.result)
    }
    request.onerror = () => {
      connection = undefined
      reject(request.error)
    }
    request.onblocked = () => {
      connection = undefined
      reject(new Error('Device storage is blocked by another tab'))
    }
  })
  return connection
}

export async function composerTransaction<T>(
  storeName: 'files' | 'outbox',
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, done: (value: T) => void) => void
): Promise<T> {
  const db = await openComposerDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    let result: T
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('Device storage transaction was aborted'))
    operation(transaction.objectStore(storeName), (value) => {
      result = value
    })
  })
}
