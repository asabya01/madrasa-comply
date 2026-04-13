import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

type QueueOperation = 'insert' | 'update' | 'upsert' | 'delete';

interface QueueItem {
  id: string;
  table: string;
  operation: QueueOperation;
  payload: Record<string, unknown>;
  timestamp: number;
}

const STORAGE_KEY = 'offline_queue';

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(items: QueueItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queue, setQueue]       = useState<QueueItem[]>(loadQueue);

  // Sync queue state to localStorage whenever it changes
  useEffect(() => {
    saveQueue(queue);
  }, [queue]);

  // Track online / offline events
  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Flush queue when coming back online
  const flushQueue = useCallback(async () => {
    const pending = loadQueue();
    if (!pending.length) return;

    const failed: QueueItem[] = [];

    for (const item of pending) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ref = supabase.from(item.table) as any;
        const { error } = await ref[item.operation](item.payload);
        if (error) {
          console.warn(`[offline-queue] Failed to flush ${item.operation} on ${item.table}:`, error.message);
          failed.push(item);
        }
      } catch (err) {
        console.warn(`[offline-queue] Exception flushing item ${item.id}:`, err);
        failed.push(item);
      }
    }

    setQueue(failed);
  }, []);

  // Auto-flush when coming back online
  useEffect(() => {
    if (isOnline && queue.length > 0) {
      flushQueue();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const queueWrite = useCallback(
    (table: string, operation: QueueOperation, payload: Record<string, unknown>) => {
      const item: QueueItem = {
        id: generateId(),
        table,
        operation,
        payload,
        timestamp: Date.now(),
      };
      setQueue(prev => [...prev, item]);
    },
    []
  );

  return {
    isOnline,
    queueWrite,
    flushQueue,
    pendingCount: queue.length,
  };
}
