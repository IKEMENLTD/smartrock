"use client";

// LIFF SDK は layout.tsx で CDN から読み込む (window.liff)。
// このヘルパは Client Component からのみ呼び出すこと。

declare global {
  interface Window {
    liff: any;
  }
}

export interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

let initialized = false;
let initPromise: Promise<void> | null = null;

async function fetchLiffId(): Promise<string> {
  const res = await fetch("/api/liff/config");
  if (!res.ok) {
    throw new Error("LIFF設定の取得に失敗しました");
  }
  const data = (await res.json()) as { liffId?: string };
  if (!data.liffId) {
    throw new Error("LIFF IDが設定されていません");
  }
  return data.liffId;
}

function waitForSdk(timeoutMs = 10000): Promise<void> {
  if (typeof window !== "undefined" && window.liff) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      if (typeof window !== "undefined" && window.liff) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(t);
        reject(new Error("LIFF SDKの読み込みに失敗しました"));
      }
    }, 50);
  });
}

export async function initLiff(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await waitForSdk();
    const liffId = await fetchLiffId();
    await window.liff.init({ liffId });
    if (!window.liff.isLoggedIn()) {
      // ログインへリダイレクト (戻り先は現在URL)
      window.liff.login({ redirectUri: window.location.href });
      // login() はリダイレクトを伴うため以降は実行されない
      return;
    }
    initialized = true;
  })();

  return initPromise;
}

export async function getIdToken(): Promise<string> {
  await initLiff();
  const token = window.liff.getIDToken();
  if (!token) {
    throw new Error("ログイン情報を取得できませんでした");
  }
  return token;
}

export async function getProfile(): Promise<LiffProfile> {
  await initLiff();
  return (await window.liff.getProfile()) as LiffProfile;
}

export function closeLiff(): void {
  if (typeof window !== "undefined" && window.liff?.closeWindow) {
    try {
      window.liff.closeWindow();
    } catch {
      // ブラウザ等で closeWindow 不可の場合は無視
    }
  }
}

export function isInClient(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.liff &&
    typeof window.liff.isInClient === "function" &&
    window.liff.isInClient()
  );
}
