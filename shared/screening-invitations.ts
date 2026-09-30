export interface ScreeningInvitation {
  id: string;
  senderId: string;
  recipientId: string;
  showingId: string;
  title: string;
  cinemaName: string;
  format?: string | null;
  startsAt: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
}
