import { useCallback, useEffect, useState } from "react";

export const ADMIN_MODE_STORAGE_KEY = "hamamubi-admin-mode";

function storedAdminMode(): boolean {
  try {
    return window.localStorage.getItem(ADMIN_MODE_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

// This is a display preference. API authorization still uses the server's role.
export function useAdminMode(isAdministrator: boolean) {
  const [requested, setRequested] = useState(storedAdminMode);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === ADMIN_MODE_STORAGE_KEY || event.key === null)
        setRequested(storedAdminMode());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    if (!isAdministrator) return;
    setRequested(enabled);
    try {
      window.localStorage.setItem(ADMIN_MODE_STORAGE_KEY, enabled ? "on" : "off");
    } catch {
      // The current tab can still switch when browser storage is unavailable.
    }
  }, [isAdministrator]);

  return { enabled: isAdministrator && requested, setEnabled };
}
