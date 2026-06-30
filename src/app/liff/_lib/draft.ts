"use client";

// 予約ドラフトの画面間受け渡し (sessionStorage)。
// SC-001 → SC-002 → SC-003 の流れで storeId/menuId/boothId/startAt を保持する。

export interface ReservationDraft {
  storeId: number;
  storeName?: string;
  menuId: number;
  menuName?: string;
  menuPrice?: number;
  menuDurationMin?: number;
  boothId?: number;
  startAt?: string;
  endAt?: string;
}

const KEY = "sds.reservationDraft";

export function saveDraft(draft: ReservationDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // sessionStorage 不可環境は無視
  }
}

export function loadDraft(): ReservationDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ReservationDraft) : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 無視
  }
}
