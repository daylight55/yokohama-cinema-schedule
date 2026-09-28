import { createContext, useContext } from "react";
import type { NotificationsResponse } from "../shared/notifications";

export const NotificationContext = createContext<{
  data: NotificationsResponse | null;
  error: boolean;
  refresh: () => void;
}>({ data: null, error: false, refresh: () => {} });

export function useUnreadNotifications() {
  return useContext(NotificationContext).data?.unread ?? 0;
}
