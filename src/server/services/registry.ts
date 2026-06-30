// Service レジストリ (NFR-006)
// UseCase / Worker / API はこの getServices() 経由で外部連携にアクセスする。
// テストでは setServicesForTest() で任意の Service をモックに差し替える。

import type { Services } from "./types";
import { switchbotService } from "./switchbot";
import { lineService } from "./line";
import { calendarService } from "./calendar";
import { stripeService } from "./stripe";
import { frigateService } from "./frigate";

const realServices: Services = {
  switchbot: switchbotService,
  line: lineService,
  calendar: calendarService,
  stripe: stripeService,
  frigate: frigateService,
};

let override: Partial<Services> | null = null;

export function getServices(): Services {
  if (override) return { ...realServices, ...override };
  return realServices;
}

/** テスト専用: 一部 Service をモックに差し替える */
export function setServicesForTest(partial: Partial<Services>): void {
  override = { ...(override ?? {}), ...partial };
}

/** テスト専用: 差し替えを解除する */
export function resetServices(): void {
  override = null;
}
