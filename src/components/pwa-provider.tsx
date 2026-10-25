"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { nativeBuild } from "@/lib/native/runtime";

type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
type PwaState = {
  ready: boolean;
  offline: boolean;
  installed: boolean;
  updateReady: boolean;
  error: string;
  platform: "apple" | "huawei" | "other";
  canInstall: boolean;
  refresh(): Promise<void>;
  install(): Promise<void>;
  applyUpdate(): void;
};
const Context = createContext<PwaState | null>(null);
export const usePwa = () => useContext(Context);

export function PwaProvider({ children }: { children: React.ReactNode }) {
  return nativeBuild ? <BundledProvider>{children}</BundledProvider> : <BrowserPwaProvider>{children}</BrowserPwaProvider>;
}

function BundledProvider({ children }: { children: React.ReactNode }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const connection = () => setOffline(!navigator.onLine);
    // Local hosts serve complete HTML documents. Do not request server RSC routes.
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download") || anchor.target === "_blank") return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.hash)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign(url.href);
    };
    connection();
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      document.removeEventListener("click", navigate, true);
    };
  }, []);
  return <Context.Provider value={{ ready: true, installed: true, offline, updateReady: false, error: "", platform: "other", canInstall: false, refresh: async () => {}, install: async () => {}, applyUpdate: () => {} }}>{children}</Context.Provider>;
}

function BrowserPwaProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false),
    [offline, setOffline] = useState(false),
    [installed, setInstalled] = useState(false),
    [updateReady, setUpdateReady] = useState(false),
    [error, setError] = useState(""),
    [canInstall, setCanInstall] = useState(false),
    [platform, setPlatform] = useState<PwaState["platform"]>("other");
  const registration = useRef<ServiceWorkerRegistration | null>(null),
    prompt = useRef<InstallEvent | null>(null),
    apply = useRef(false),
    alive = useRef(false);
  const refresh = useCallback(async () => {
    if (process.env.NODE_ENV !== "production") {
      setError("开发模式未启用离线缓存，请使用生产构建验证。");
      return;
    }
    if (!window.isSecureContext || !("serviceWorker" in navigator)) {
      setError(
        "当前浏览器无法安装离线应用，请使用 HTTPS 地址和受支持的浏览器。",
      );
      return;
    }
    try {
      setError("");
      const response = await fetch("/offline-assets.json", {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error("离线资源清单不可用，请检查部署是否完整。");
      const info = await response.json();
      if (
        typeof info.version !== "string" ||
        !/^[\w-]{1,200}$/.test(info.version)
      )
        throw new Error("离线资源版本无效。");
      const reg = await navigator.serviceWorker.register(
        `/sw.js?v=${encodeURIComponent(info.version)}`,
        { scope: "/", updateViaCache: "none" },
      );
      if (!alive.current) return;
      registration.current = reg;
      const inspect = () => {
        if (!alive.current) return;
        setReady(!!reg.active && !!navigator.serviceWorker.controller);
        setUpdateReady(!!reg.waiting);
        if (!reg.active && reg.installing?.state === "redundant")
          setError("离线资源未完整保存，请联网后重试。已有学习记录不受影响。");
      };
      const watch = () => {
        reg.installing?.addEventListener("statechange", inspect);
        inspect();
      };
      reg.addEventListener("updatefound", watch);
      watch();
      void navigator.serviceWorker.ready
        .then(() => {
          if (alive.current) {
            setReady(!!navigator.serviceWorker.controller);
            setUpdateReady(!!reg.waiting);
            // Activation can overlap a navigation and miss its new document.
            // Ask the active worker to claim again; do not reload saved work.
            if (!navigator.serviceWorker.controller)
              reg.active?.postMessage({ type: "CLAIM_CLIENTS" });
          }
        })
        .catch(() => {
          if (alive.current)
            setError("离线准备暂不可用，请联网后检查离线资源或刷新页面重试。");
        });
    } catch (e) {
      const reg = await navigator.serviceWorker
        .getRegistration()
        .catch(() => undefined);
      if (alive.current) {
        registration.current = reg ?? null;
        setReady(!!reg?.active && !!navigator.serviceWorker.controller);
        if (!reg?.active)
          setError(
            e instanceof Error ? e.message : "离线准备失败，请联网重试。",
          );
      }
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    const ua = navigator.userAgent;
    setPlatform(
      /iPad|iPhone|iPod/.test(ua) ||
        (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
        ? "apple"
        : /HarmonyOS|OpenHarmony|HUAWEI/i.test(ua)
          ? "huawei"
          : "other",
    );
    const connection = () => setOffline(!navigator.onLine);
    const standalone = () =>
      setInstalled(
        matchMedia("(display-mode: standalone)").matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone ===
            true,
      );
    const beforeInstall = (e: Event) => {
      e.preventDefault();
      prompt.current = e as InstallEvent;
      setCanInstall(true);
    };
    const didInstall = () => {
      setInstalled(true);
      setCanInstall(false);
      prompt.current = null;
    };
    const control = () => {
      const controlled = !!navigator.serviceWorker.controller;
      setReady(controlled);
      if (apply.current && controlled) window.location.reload();
    };
    const offlineNavigation = (e: MouseEvent) => {
      if (
        navigator.onLine ||
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const anchor = (e.target as Element)?.closest?.("a[href]");
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const url = new URL(anchor.href);
      if (
        url.origin !== location.origin ||
        url.pathname.startsWith("/api/") ||
        (url.pathname === location.pathname &&
          url.search === location.search &&
          url.hash)
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      window.location.assign(url.href);
    };
    connection();
    standalone();
    void refresh();
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", didInstall);
    navigator.serviceWorker?.addEventListener("controllerchange", control);
    document.addEventListener("click", offlineNavigation, true);
    return () => {
      alive.current = false;
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", didInstall);
      navigator.serviceWorker?.removeEventListener("controllerchange", control);
      document.removeEventListener("click", offlineNavigation, true);
    };
  }, [refresh]);
  async function install() {
    if (!prompt.current) return;
    const event = prompt.current;
    prompt.current = null;
    setCanInstall(false);
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      setError("安装未完成，可从浏览器菜单添加至主屏幕。");
    }
  }
  return (
    <Context.Provider
      value={{
        ready,
        offline,
        installed,
        updateReady,
        error,
        platform,
        canInstall,
        refresh,
        install,
        applyUpdate: () => {
          apply.current = true;
          registration.current?.waiting?.postMessage({
            type: "ACTIVATE_UPDATE",
          });
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
