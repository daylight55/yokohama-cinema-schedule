import type { MemberProfile } from "./member-profile";
import type { SharedPlan } from "./sharing";

export interface MemberMovie {
  movieKey: string;
  title: string;
  imageUrl: string | null;
  status: "watched" | null;
  starred: boolean;
}
export interface MemberPageResponse {
  profile: MemberProfile;
  isSelf: boolean;
  movies: MemberMovie[];
  plans: SharedPlan[];
  titles: { japaneseTitle: string; englishTitle: string | null }[];
}
