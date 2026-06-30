// SwitchBot Service (design-docs/16 外部連携仕様, FR / NFR-006)
// SwitchBot API v1.1 を fetch + withRetry で呼び出す。
// モジュール import 時に例外を投げない (env 未設定でもクライアントを遅延構築)。

import crypto from "node:crypto";
import { config } from "@/server/lib/config";
import { switchbotSign } from "@/server/lib/hmac";
import { logger } from "@/server/lib/logger";
import { withRetry } from "@/server/lib/retry";
import type {
  SwitchbotCreateKeyParams,
  SwitchbotDevice,
  SwitchbotResult,
  SwitchbotService,
} from "./types";

// design-docs/16: SwitchBot API v1.1 base
const BASE = "https://api.switch-bot.com/v1.1";

// design-docs/16: 認証ヘッダ生成。t=ms, nonce=uuid, sign=Base64(HMAC-SHA256(secret, token+t+nonce))
function authHeaders(): Record<string, string> {
  const token = config.switchbot.token;
  const secret = config.switchbot.secret;
  const t = Date.now();
  const nonce = crypto.randomUUID();
  const sign = switchbotSign(token, secret, t, nonce);
  return {
    Authorization: token,
    sign,
    t: String(t),
    nonce,
    "Content-Type": "application/json",
  };
}

// SwitchBot 標準応答エンベロープ ({ statusCode, message, body })
interface SwitchbotEnvelope {
  statusCode?: number;
  message?: string;
  body?: unknown;
}

// commands エンドポイントへ POST する共通処理。
async function postCommand(
  deviceId: string,
  command: Record<string, unknown>,
  opName: string,
): Promise<SwitchbotResult> {
  const url = `${BASE}/devices/${deviceId}/commands`;
  logger.info("switchbot request", { op: opName, deviceId, command });
  const json = await withRetry(
    async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(command),
      });
      const data = (await res.json().catch(() => ({}))) as SwitchbotEnvelope;
      // SwitchBot は HTTP 200 でも statusCode で異常を返すことがある。
      // ネットワーク/HTTP エラーのみ再試行対象とし、業務エラーはそのまま返す。
      if (!res.ok) {
        throw new Error(`switchbot http ${res.status}`);
      }
      return data;
    },
    {
      onRetry: (attempt, err) =>
        logger.warn("switchbot retry", { op: opName, deviceId, attempt, err: String(err) }),
    },
  );
  const result: SwitchbotResult = {
    statusCode: json.statusCode ?? 0,
    message: json.message ?? "",
    body: json.body,
  };
  logger.info("switchbot response", { op: opName, deviceId, statusCode: result.statusCode, message: result.message });
  return result;
}

export const switchbotService: SwitchbotService = {
  // design-docs/16: timeLimit パスコード作成。
  // 落とし穴①: createKey は非同期。成功応答に passcode id を含まない。
  //   id は別途 createKey 結果の webhook (changeReport) でのみ返るため、
  //   ここでは id を返さず、呼び出し側が webhook で passcodes.switchbot_key_id を後埋めする。
  // startTime/endTime は設計書通り epoch秒 (startEpoch/endEpoch をそのまま渡す)。
  async createKey(params: SwitchbotCreateKeyParams): Promise<SwitchbotResult> {
    return postCommand(
      params.deviceId,
      {
        commandType: "command",
        command: "createKey",
        parameter: {
          name: params.name,
          type: "timeLimit",
          password: params.password,
          startTime: params.startEpoch,
          endTime: params.endEpoch,
        },
      },
      "createKey",
    );
  },

  // design-docs/16: パスコード削除。switchbot_key_id (webhook 受領済) が必須。
  async deleteKey(deviceId: string, keyId: number): Promise<SwitchbotResult> {
    return postCommand(
      deviceId,
      {
        commandType: "command",
        command: "deleteKey",
        parameter: { id: keyId },
      },
      "deleteKey",
    );
  },

  // design-docs/16: 遠隔施解錠 (管理用)。
  async controlLock(deviceId: string, action: "lock" | "unlock"): Promise<SwitchbotResult> {
    return postCommand(
      deviceId,
      {
        commandType: "command",
        command: action,
      },
      "controlLock",
    );
  },

  // design-docs/16: device 一覧 + 各 status から battery を取得。
  // 取得失敗時は空配列 + warn ログ (起動・運用を止めない)。
  async getDevices(): Promise<SwitchbotDevice[]> {
    try {
      const listJson = await withRetry(async () => {
        const res = await fetch(`${BASE}/devices`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`switchbot http ${res.status}`);
        return (await res.json()) as SwitchbotEnvelope;
      });

      const body = (listJson.body ?? {}) as { deviceList?: unknown };
      const rawList = Array.isArray(body.deviceList) ? body.deviceList : [];

      const devices: SwitchbotDevice[] = [];
      for (const raw of rawList) {
        const d = raw as { deviceId?: string; deviceName?: string; deviceType?: string };
        if (!d.deviceId) continue;
        const device: SwitchbotDevice = {
          deviceId: d.deviceId,
          deviceName: d.deviceName ?? "",
          deviceType: d.deviceType ?? "",
        };
        // 各デバイスの status から battery / online を補完 (失敗しても継続)。
        try {
          const statusRes = await fetch(`${BASE}/devices/${d.deviceId}/status`, {
            headers: authHeaders(),
          });
          if (statusRes.ok) {
            const statusJson = (await statusRes.json()) as SwitchbotEnvelope;
            const sb = (statusJson.body ?? {}) as { battery?: number; online?: boolean };
            if (typeof sb.battery === "number") device.battery = sb.battery;
            if (typeof sb.online === "boolean") device.online = sb.online;
          }
        } catch (err) {
          logger.warn("switchbot status fetch failed", { deviceId: d.deviceId, err: String(err) });
        }
        devices.push(device);
      }
      logger.info("switchbot devices", { count: devices.length });
      return devices;
    } catch (err) {
      logger.warn("switchbot getDevices failed", { err: String(err) });
      return [];
    }
  },
};
