export interface GroupActivity {
  id: number;
  groupId: string;
  groupName: string;
  actorId: string;
  name: string;
  avatarUrl: string | null;
  movieKey: string;
  title: string;
  kind: "starred" | "watched" | "comment";
  comment: string;
  createdAt: string;
}
export interface NotificationsResponse {
  userId: string;
  items: GroupActivity[];
  unread: number;
  lastReadId: number;
  latestId: number;
  nextBefore: number | null;
  titles: { japaneseTitle: string; englishTitle: string | null }[];
}

/** Stop after five failures; suspend hidden tabs unless browser notifications are opted in. */
export function notificationPollDelay(
  failures: number,
  hidden: boolean,
  enabled: boolean,
): number | null {
  if (failures >= 5 || (hidden && !enabled)) return null;
  return Math.max(hidden ? 120000 : 60000, 60000 * 2 ** failures);
}
