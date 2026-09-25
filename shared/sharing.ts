export interface SharedMember {
  userId: string;
  name: string;
}
export interface SharedPlan {
  userId: string;
  showingId: string;
  title: string;
  cinemaName: string;
  startsAt: string;
  endsAt: string | null;
  reserved: boolean;
}
export interface SharedMovie {
  userId: string;
  movieKey: string;
  title: string;
  imageUrl: string | null;
}
export interface SharingResponse {
  userId: string;
  members: SharedMember[];
  plans: SharedPlan[];
  movies: SharedMovie[];
  titles: { japaneseTitle: string; englishTitle: string | null }[];
}
