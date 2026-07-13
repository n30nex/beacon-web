type StorageName = "localStorage" | "sessionStorage";

function getStorage(name: StorageName): Storage | null {
  try {
    return globalThis[name] ?? null;
  } catch {
    // Access itself can throw in sandboxed frames and strict privacy modes.
    return null;
  }
}

export function safeStorageGet(name: StorageName, key: string): string | null {
  try {
    return getStorage(name)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeStorageSet(name: StorageName, key: string, value: string): boolean {
  try {
    const storage = getStorage(name);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeStorageRemove(name: StorageName, key: string): boolean {
  try {
    const storage = getStorage(name);
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const safeLocalStorageGet = (key: string) => safeStorageGet("localStorage", key);
export const safeLocalStorageSet = (key: string, value: string) => safeStorageSet("localStorage", key, value);
export const safeLocalStorageRemove = (key: string) => safeStorageRemove("localStorage", key);
export const safeSessionStorageGet = (key: string) => safeStorageGet("sessionStorage", key);
export const safeSessionStorageSet = (key: string, value: string) => safeStorageSet("sessionStorage", key, value);
