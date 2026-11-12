import { normalizeLibrary, type LegacySnapshot, type LegacyTeam } from '../core/persist';
import type { LibraryData } from '../core/types';

export type RepoKind = 'http' | 'indexeddb' | 'localstorage';
export type SideKey = 'home' | 'away';

export interface LibraryRepository {
  kind: RepoKind;
  loadLibrary(): Promise<LibraryData | null>;
  saveLibrary(data: LibraryData): Promise<void>;
  savePhoto(teamId: number, playerId: number, dataUrl: string): Promise<string | null>;
  deletePhoto(teamId: number, playerId: number): Promise<void>;
  saveVideo(teamId: number, playerId: number, blob: Blob): Promise<boolean>;
  getVideoUrl(teamId: number, playerId: number): Promise<string | null>;
  deleteVideo(teamId: number, playerId: number): Promise<void>;
  loadLegacySnapshot(): Promise<LegacySnapshot | null>;
  loadLegacyVideo(side: SideKey, playerId: number): Promise<Blob | null>;
}

const DB_NAME = 'soccerboard';
const STORE = 'kv';
const LIB_KEY = 'library';
const LEGACY_KEYS = ['state', 'soccerboard', 'snapshot'];
const LS_LEGACY_KEY = 'soccerboard';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(key: string): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve((req.result ?? null) as T | null);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbPut(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function idbDel(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

/* ---------- HTTP 仓库 ---------- */

class HttpRepository implements LibraryRepository {
  kind: RepoKind = 'http';

  async loadLibrary(): Promise<LibraryData | null> {
    const res = await fetch('/api/library', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data ? normalizeLibrary(data) : null;
  }

  async saveLibrary(data: LibraryData): Promise<void> {
    const res = await fetch('/api/library', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async savePhoto(teamId: number, playerId: number, dataUrl: string): Promise<string | null> {
    const res = await fetch(`/api/photos/${teamId}/${playerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: dataUrl }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { url?: string };
    return json.url || null;
  }

  async deletePhoto(teamId: number, playerId: number): Promise<void> {
    await fetch(`/api/photos/${teamId}/${playerId}`, { method: 'DELETE' });
  }

  async saveVideo(teamId: number, playerId: number, blob: Blob): Promise<boolean> {
    const res = await fetch(`/api/videos/${teamId}/${playerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': blob.type || 'video/mp4' },
      body: blob,
    });
    return res.ok;
  }

  async getVideoUrl(teamId: number, playerId: number): Promise<string | null> {
    const head = await fetch(`/api/videos/${teamId}/${playerId}`, { method: 'HEAD' }).catch(() => null);
    if (!head || !head.ok) return null;
    return `/api/videos/${teamId}/${playerId}?v=${Date.now()}`;
  }

  async deleteVideo(teamId: number, playerId: number): Promise<void> {
    await fetch(`/api/videos/${teamId}/${playerId}`, { method: 'DELETE' });
  }

  async loadLegacySnapshot(): Promise<LegacySnapshot | null> {
    return null;
  }

  async loadLegacyVideo(): Promise<Blob | null> {
    return null;
  }
}

/* ---------- IndexedDB 离线仓库 ---------- */

class IndexedDbRepository implements LibraryRepository {
  kind: RepoKind = 'indexeddb';
  private videoUrls = new Map<string, string>();

  async loadLibrary(): Promise<LibraryData | null> {
    const raw = await idbGet<unknown>(LIB_KEY);
    return raw ? normalizeLibrary(raw) : null;
  }

  async saveLibrary(data: LibraryData): Promise<void> {
    await idbPut(LIB_KEY, JSON.parse(JSON.stringify(data)));
  }

  async savePhoto(teamId: number, playerId: number, dataUrl: string): Promise<string | null> {
    await idbPut(`photo:${teamId}:${playerId}`, dataUrl);
    return dataUrl;
  }

  async deletePhoto(teamId: number, playerId: number): Promise<void> {
    await idbDel(`photo:${teamId}:${playerId}`);
  }

  async saveVideo(teamId: number, playerId: number, blob: Blob): Promise<boolean> {
    await idbPut(`video:${teamId}:${playerId}`, blob);
    return true;
  }

  async getVideoUrl(teamId: number, playerId: number): Promise<string | null> {
    const key = `${teamId}:${playerId}`;
    const cached = this.videoUrls.get(key);
    if (cached) return cached;
    const blob = await idbGet<Blob>(`video:${teamId}:${playerId}`);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this.videoUrls.set(key, url);
    return url;
  }

  async deleteVideo(teamId: number, playerId: number): Promise<void> {
    const key = `${teamId}:${playerId}`;
    const url = this.videoUrls.get(key);
    if (url) URL.revokeObjectURL(url);
    this.videoUrls.delete(key);
    await idbDel(`video:${teamId}:${playerId}`);
  }

  async loadLegacySnapshot(): Promise<LegacySnapshot | null> {
    for (const key of LEGACY_KEYS) {
      const raw = await idbGet<LegacySnapshot>(key);
      if (raw && raw.teams) return raw;
    }
    return null;
  }

  async loadLegacyVideo(side: SideKey, playerId: number): Promise<Blob | null> {
    return (
      (await idbGet<Blob>(`v:${side}:${playerId}`)) ||
      (await idbGet<Blob>(`video:${side}:${playerId}`)) ||
      null
    );
  }
}

/* ---------- localStorage 兜底仓库 ---------- */

class LocalStorageRepository implements LibraryRepository {
  kind: RepoKind = 'localstorage';

  async loadLibrary(): Promise<LibraryData | null> {
    const raw = localStorage.getItem(LIB_KEY);
    if (!raw) return null;
    try {
      return normalizeLibrary(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async saveLibrary(data: LibraryData): Promise<void> {
    localStorage.setItem(LIB_KEY, JSON.stringify(data));
  }

  async savePhoto(teamId: number, playerId: number, dataUrl: string): Promise<string | null> {
    localStorage.setItem(`photo:${teamId}:${playerId}`, dataUrl);
    return dataUrl;
  }

  async deletePhoto(teamId: number, playerId: number): Promise<void> {
    localStorage.removeItem(`photo:${teamId}:${playerId}`);
  }

  async saveVideo(): Promise<boolean> {
    return false;
  }

  async getVideoUrl(): Promise<string | null> {
    return null;
  }

  async deleteVideo(): Promise<void> {
    /* 离线兜底不支持视频 */
  }

  async loadLegacySnapshot(): Promise<LegacySnapshot | null> {
    const raw = localStorage.getItem(LS_LEGACY_KEY) || localStorage.getItem('state');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as LegacySnapshot;
      return parsed && parsed.teams ? parsed : null;
    } catch {
      return null;
    }
  }

  async loadLegacyVideo(): Promise<Blob | null> {
    return null;
  }
}

/* ---------- 选择仓库 ---------- */

async function probeHttp(): Promise<boolean> {
  if (typeof fetch !== 'function') return false;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 1500);
  try {
    const res = await fetch('/api/health', { cache: 'no-store', signal: ctl.signal });
    if (!res.ok) return false;
    const json = (await res.json()) as { ok?: boolean };
    return !!json.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function createRepository(): Promise<LibraryRepository> {
  const hasIdb = typeof indexedDB !== 'undefined';
  if (hasIdb) {
    return probeHttp().then((http) =>
      http ? new HttpRepository() : new IndexedDbRepository(),
    );
  }
  return probeHttp().then((http) =>
    http ? new HttpRepository() : new LocalStorageRepository(),
  );
}

/** 兼容旧字段：旧仓库读取过 {teams:{home,away}}，迁移时复用 */
export type { LegacyTeam };
