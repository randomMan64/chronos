import crypto from "crypto";
import { db } from "@/db/connections/control-plane";
import { devices } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { shouldUseSecureCookie } from "./session";

export const DEVICE_COOKIE_NAME = "chronos_device_id";
export const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

export type DeviceCategory = "desktop" | "laptop" | "mobile" | "tablet" | "unknown";

export interface ParsedDeviceInfo {
  browser: string;
  browserVersion: string | null;
  operatingSystem: string;
  operatingSystemVersion: string | null;
  deviceType: DeviceCategory;
  manufacturer: string | null;
  model: string | null;
  deviceName: string;
  userAgent: string;
  ipAddress: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
}

export function getDeviceCookieOptions() {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE,
  };
}

export function parseUserAgent(uaString: string | null, headers?: Headers | Record<string, string | string[] | undefined>): ParsedDeviceInfo {
  const ua = uaString || "";

  // Helper to get header case-insensitively
  const getHeader = (name: string): string | null => {
    if (!headers) return null;
    if (typeof (headers as Headers).get === "function") {
      return (headers as Headers).get(name);
    }
    const rec = headers as Record<string, string | string[] | undefined>;
    const val = rec[name.toLowerCase()] ?? rec[name];
    if (Array.isArray(val)) return val[0] || null;
    return typeof val === "string" ? val : null;
  };

  // Client Hints
  const chPlatform = getHeader("sec-ch-ua-platform")?.replace(/^["']|["']$/g, "").trim() || null;
  const chPlatformVersion = getHeader("sec-ch-ua-platform-version")?.replace(/^["']|["']$/g, "").trim() || null;
  const chModel = getHeader("sec-ch-ua-model")?.replace(/^["']|["']$/g, "").trim() || null;
  const chMobile = getHeader("sec-ch-ua-mobile");
  const chBrands = getHeader("sec-ch-ua");

  // --- 1. Browser Detection ---
  let browser = "Unknown";
  let browserVersion: string | null = null;

  if (chBrands) {
    if (chBrands.includes("Microsoft Edge") || chBrands.includes("Edge")) {
      browser = "Microsoft Edge";
    } else if (chBrands.includes("Opera") || chBrands.includes("OPR")) {
      browser = "Opera";
    } else if (chBrands.includes("Brave")) {
      browser = "Brave";
    } else if (chBrands.includes("Google Chrome") || chBrands.includes("Chrome")) {
      browser = "Google Chrome";
    } else if (chBrands.includes("Chromium")) {
      browser = "Chromium";
    }
  }

  if (browser === "Unknown" && ua) {
    if (/Edg\/(\d+[\.\d]*)/i.test(ua)) {
      browser = "Microsoft Edge";
      browserVersion = RegExp.$1;
    } else if (/OPR\/(\d+[\.\d]*)|Opera\/(\d+[\.\d]*)/i.test(ua)) {
      browser = "Opera";
      browserVersion = RegExp.$1 || RegExp.$2;
    } else if (/Brave/i.test(ua)) {
      browser = "Brave";
      const m = ua.match(/Chrome\/(\d+[\.\d]*)/i);
      if (m) browserVersion = m[1];
    } else if (/SamsungBrowser\/(\d+[\.\d]*)/i.test(ua)) {
      browser = "Samsung Internet";
      browserVersion = RegExp.$1;
    } else if (/(Chrome|CriOS)\/(\d+[\.\d]*)/i.test(ua) && !/Edge|Edg/i.test(ua)) {
      browser = "Google Chrome";
      browserVersion = RegExp.$2;
    } else if (/(Firefox|FxiOS)\/(\d+[\.\d]*)/i.test(ua)) {
      browser = "Mozilla Firefox";
      browserVersion = RegExp.$2;
    } else if (/Version\/(\d+[\.\d]*).*Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) {
      browser = "Apple Safari";
      browserVersion = RegExp.$1;
    }
  }

  // --- 2. Operating System Detection ---
  let operatingSystem = chPlatform || "Unknown";
  let operatingSystemVersion = chPlatformVersion || null;

  if (operatingSystem === "Unknown" && ua) {
    if (/Windows NT 10\.0/i.test(ua)) {
      operatingSystem = "Windows";
      operatingSystemVersion = "10/11";
    } else if (/Windows NT 6\.3/i.test(ua)) {
      operatingSystem = "Windows";
      operatingSystemVersion = "8.1";
    } else if (/Windows NT 6\.1/i.test(ua)) {
      operatingSystem = "Windows";
      operatingSystemVersion = "7";
    } else if (/Windows NT/i.test(ua)) {
      operatingSystem = "Windows";
    } else if (/iPhone OS (\d+[_\.\d]*)/i.test(ua)) {
      operatingSystem = "iOS";
      operatingSystemVersion = RegExp.$1.replace(/_/g, ".");
    } else if (/iPad.*OS (\d+[_\.\d]*)/i.test(ua)) {
      operatingSystem = "iPadOS";
      operatingSystemVersion = RegExp.$1.replace(/_/g, ".");
    } else if (/Mac OS X (\d+[_\.\d]*)/i.test(ua)) {
      operatingSystem = "macOS";
      operatingSystemVersion = RegExp.$1.replace(/_/g, ".");
    } else if (/Android (\d+[\.\d]*)/i.test(ua)) {
      operatingSystem = "Android";
      operatingSystemVersion = RegExp.$1;
    } else if (/CrOS/i.test(ua)) {
      operatingSystem = "Chrome OS";
    } else if (/Linux/i.test(ua)) {
      operatingSystem = "Linux";
    }
  }

  // --- 3. Device Category / Type ---
  let deviceType: DeviceCategory = "desktop";

  const isTablet = /iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua));

  const isMobile = chMobile === "?1" ||
    /iPhone|iPod|Mobile.*Safari|Android.*Mobile|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  if (isTablet) {
    deviceType = "tablet";
  } else if (isMobile) {
    deviceType = "mobile";
  } else if (operatingSystem === "Unknown" && !ua) {
    deviceType = "unknown";
  } else {
    deviceType = "desktop";
  }

  // --- 4. Manufacturer & Model ---
  // IMPORTANT: Browsers do not reliably expose exact laptop/desktop hardware models.
  // Never invent manufacturer or model info. Use null / "Unknown" when unavailable.
  let manufacturer: string | null = null;
  let model: string | null = null;

  if (chModel && chModel !== '""') {
    model = chModel;
  }

  if (operatingSystem === "iOS" || operatingSystem === "iPadOS") {
    manufacturer = "Apple";
    if (!model) {
      if (/iPad/i.test(ua)) model = "iPad";
      else if (/iPhone/i.test(ua)) model = "iPhone";
    }
  } else if (operatingSystem === "macOS") {
    manufacturer = "Apple";
    // Hardware model (MacBook Pro vs iMac) is never exposed by macOS browsers; leave model as null
    model = null;
  } else if (operatingSystem === "Android") {
    if (!model) {
      const androidModelMatch = ua.match(/;\s*([A-Za-z0-9\s_-]+)\s+Build\//i);
      if (androidModelMatch && androidModelMatch[1]) {
        model = androidModelMatch[1].trim();
      }
    }
    if (model) {
      if (/^SM-|^GT-|^SCH-/i.test(model)) manufacturer = "Samsung";
      else if (/^Pixel/i.test(model)) manufacturer = "Google";
      else if (/^Xiaomi|^Redmi|^POCO/i.test(model)) manufacturer = "Xiaomi";
      else if (/^OnePlus/i.test(model)) manufacturer = "OnePlus";
    }
  }

  // --- 5. Human-friendly Device Name ---
  let deviceName = `${browser} on ${operatingSystem}`;
  if (model) {
    deviceName = `${model} (${browser})`;
  } else if (manufacturer && deviceType !== "desktop") {
    deviceName = `${manufacturer} ${operatingSystem} (${browser})`;
  }

  // --- 6. Approximate Location & Protected IP ---
  const rawIp = getHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
    getHeader("x-real-ip") ||
    getHeader("cf-connecting-ip") ||
    null;

  const country = getHeader("cf-ipcountry") || getHeader("x-vercel-ip-country") || null;
  const region = getHeader("x-vercel-ip-country-region") || null;
  let city = getHeader("x-vercel-ip-city") || null;
  if (city) {
    try {
      city = decodeURIComponent(city);
    } catch {
      // ignore
    }
  }

  return {
    browser,
    browserVersion,
    operatingSystem,
    operatingSystemVersion,
    deviceType,
    manufacturer,
    model,
    deviceName,
    userAgent: ua,
    ipAddress: rawIp ? rawIp.slice(0, 45) : null,
    country,
    region,
    city,
  };
}

export function hashDeviceKey(deviceKey: string): string {
  return crypto.createHash("sha256").update(deviceKey).digest("hex");
}

export async function resolveOrCreateDevice(params: {
  userId: string;
  rawDeviceKey?: string | null;
  deviceInfo: ParsedDeviceInfo;
}) {
  const { userId, rawDeviceKey, deviceInfo } = params;

  let deviceKey = rawDeviceKey;
  let isNewGeneratedKey = false;

  if (!deviceKey || deviceKey.length < 16) {
    deviceKey = crypto.randomBytes(32).toString("hex");
    isNewGeneratedKey = true;
  }

  const deviceKeyHash = hashDeviceKey(deviceKey);

  // Look up existing device for this user
  const [existingDevice] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.userId, userId), eq(devices.deviceKeyHash, deviceKeyHash)))
    .limit(1);

  if (existingDevice) {
    // Update lastSeenAt and any updated browser/OS versions
    const [updatedDevice] = await db
      .update(devices)
      .set({
        lastSeenAt: new Date(),
        browser: deviceInfo.browser,
        browserVersion: deviceInfo.browserVersion || existingDevice.browserVersion,
        operatingSystem: deviceInfo.operatingSystem,
        operatingSystemVersion: deviceInfo.operatingSystemVersion || existingDevice.operatingSystemVersion,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, existingDevice.id))
      .returning();

    return {
      device: updatedDevice,
      deviceKey,
      isNewDevice: false,
      setCookieRequired: isNewGeneratedKey,
    };
  }

  // Create new device record
  const [newDevice] = await db
    .insert(devices)
    .values({
      userId,
      deviceKeyHash,
      deviceName: deviceInfo.deviceName,
      deviceType: deviceInfo.deviceType,
      manufacturer: deviceInfo.manufacturer,
      model: deviceInfo.model,
      operatingSystem: deviceInfo.operatingSystem,
      operatingSystemVersion: deviceInfo.operatingSystemVersion,
      browser: deviceInfo.browser,
      browserVersion: deviceInfo.browserVersion,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    })
    .returning();

  return {
    device: newDevice,
    deviceKey,
    isNewDevice: true,
    setCookieRequired: true,
  };
}
