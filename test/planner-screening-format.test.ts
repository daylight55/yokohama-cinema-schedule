import {expect,it} from 'vitest';
import {testDatabase} from './helpers/sqlite-d1';
import {sharedShowing} from './helpers/shared-showings';
import {listMovieMarathonPlans,saveMovieMarathonPlan} from '../functions/_lib/movie-marathon';
import {optimizeMovieMarathon} from '../shared/planner';
import type {Showing} from '../shared/types';

it('keeps explicit format in proposals and reloads known format without losing saved plans when a showing disappears',async()=>{
  const {db,sqlite}=testDatabase();
  try {
    const showingId=sharedShowing(sqlite,'作品','2099-01-01T03:00:00Z');
    sqlite.prepare("UPDATE showings SET format='吹替 / IMAX' WHERE id=?").run(showingId);
    const showing={id:showingId,sourceId:'test',cinemaId:'sharing-test',cinemaName:'Test',cinemaShortName:'Test',area:'yokohama',movieKey:'作品',title:'作品',imageUrl:null,startsAt:'2099-01-01T03:00:00Z',endsAt:'2099-01-01T05:00:00Z',screen:null,format:'吹替 / IMAX',bookingUrl:'https://example.com',purchasable:true,fetchedAt:''} as Showing;
    const proposal=optimizeMovieMarathon({planDate:'2099-01-01',availableStart:'2099-01-01T02:45:00Z',availableEnd:'2099-01-01T10:00:00Z',showings:[showing],starredMovieKeys:new Set(),homeTravelMinutesByCinema:new Map(),transferMinutesByPair:new Map(),defaultHomeTravelMinutes:0});
    expect(proposal.items[0].format).toBe('吹替 / IMAX');
    await saveMovieMarathonPlan(db,proposal);
    const saved=await listMovieMarathonPlans(db);
    expect(saved[0].items[0]).toMatchObject({showingId,format:'吹替 / IMAX',bookingUrl:'https://example.com'});
    sqlite.prepare('DELETE FROM showings WHERE id=?').run(showingId);
    const unavailable=await listMovieMarathonPlans(db);
    expect(unavailable[0].items[0]).toMatchObject({showingId,format:null,bookingUrl:'https://example.com'});
  } finally {sqlite.close();}
});
