import type { DesignBackend, DesignMeta, DesignData } from '../store/types';

const STORAGE_KEY = 'orbit-designs-data';
const STORAGE_META_KEY = 'orbit-designs-meta';

function getStoredMeta(): DesignMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_META_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStoredMeta(meta: DesignMeta[]) {
  localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
}

function getStoredDesign(id: string): DesignData | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredDesign(data: DesignData) {
  localStorage.setItem(`${STORAGE_KEY}:${data.id}`, JSON.stringify(data));
}

function removeStoredDesign(id: string) {
  localStorage.removeItem(`${STORAGE_KEY}:${id}`);
}

export const localStorageDesignBackend: DesignBackend = {
  async list(search, sort) {
    let designs = getStoredMeta();

    if (search) {
      const q = search.toLowerCase();
      designs = designs.filter((d) => d.name.toLowerCase().includes(q));
    }

    if (sort) {
      designs.sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name);
        if (sort === 'date') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    }

    return designs;
  },

  async get(id) {
    return getStoredDesign(id);
  },

  async save(data) {
    const meta: DesignMeta = {
      id: data.id,
      name: data.name,
      thumbnail: data.thumbnail,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      layerCount: data.scene.root.length,
    };

    const existing = getStoredMeta();
    const idx = existing.findIndex((d) => d.id === data.id);
    const next = [...existing];
    if (idx >= 0) next[idx] = meta;
    else next.unshift(meta);

    setStoredMeta(next);
    setStoredDesign(data);

    return meta;
  },

  async delete(id) {
    const existing = getStoredMeta();
    setStoredMeta(existing.filter((d) => d.id !== id));
    removeStoredDesign(id);
  },
};
