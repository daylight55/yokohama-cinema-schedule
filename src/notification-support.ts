export function supportsBrowserNotifications(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}
