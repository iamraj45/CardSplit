// Single swap point for the active storage adapter (IndexedDB now, Supabase later).
import { assertStorageAdapter } from './storageInterface';
import { indexedDbStorage } from './indexedDbStorage';

export const storage = assertStorageAdapter(indexedDbStorage);
