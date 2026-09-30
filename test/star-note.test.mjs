// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { todayInJst, addDays } from '../shared/date';

let root;
let writes;
let failSave;
const click = async selector => {
  const element = document.querySelector(selector);
  expect(element).not.toBeNull();
  await act(async () => element.click());
};
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  writes = [];
  failSave = false;
  const date = addDays(todayInJst(), 1);
  document.cookie = 'hamamubi_language=ja';
  history.replaceState(null, '', `#schedule?date=${date}`);
  vi.stubGlobal('fetch', vi.fn(async (input, options) => {
    const path = String(input);
    if (path.startsWith('/api/account/language')) return Response.json({language:'ja'});
    if (path.startsWith('/api/viewing-plans')) return Response.json({plans:[],enabled:true});
    if (path.startsWith('/api/notifications')) return Response.json({items:[],unread:0,lastReadId:0,latestId:0});
    if (path.startsWith('/api/preferences')) {
      const body = JSON.parse(options.body);
      writes.push(body);
      return Response.json({comment:'',...body}, {status:failSave ? 500 : 200});
    }
    if (path.startsWith('/api/showings')) return Response.json({date,generatedAt:new Date().toISOString(),lastUpdatedAt:null,
      cinemas:[],preferences:[],preferencesEnabled:true,cinemaTravelPreferences:[],cinemaTravelPreferencesEnabled:false,
      userProfile:{departureRegistered:false,departureUpdatedAt:null,scheduleCollapseMinutes:0},userProfileEnabled:true,sourceHealth:{healthy:1,total:1},
      showings:[{id:'show1',sourceId:'movil',cinemaId:'movil',cinemaName:'ムービル',cinemaShortName:'ムービル',area:'yokohama',movieKey:'作品',title:'作品',imageUrl:null,startsAt:date+'T15:00:00+09:00',endsAt:date+'T17:00:00+09:00',screen:null,format:null,bookingUrl:'https://example.com',purchasable:true,fetchedAt:new Date().toISOString()}]});
    return Response.json({});
  }));
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(createElement(App)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('saves interest first, shows only an optional note, and keeps interest after dismissing', async () => {
  await click('.favorite-button');
  expect(writes).toEqual([{title:'作品',imageUrl:null,starred:true}]);
  expect(document.querySelector('.favorite-button').getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector('.movie-preference-dialog textarea')).not.toBeNull();
  expect(document.querySelector('.movie-preference-actions')).toBeNull();
  expect(document.querySelector('.movie-schedule-link')).toBeNull();
  await click('.movie-preference-sheet > .secondary-button');
  expect(document.querySelector('.favorite-button').getAttribute('aria-pressed')).toBe('true');
  expect(writes).toHaveLength(1);
});
it('keeps the schedule focused on its star and opens advanced actions from the film detail', async () => {
  expect(document.querySelector('.program-title .favorite-button')).not.toBeNull();
  expect(document.querySelector('.program-block .movie-options-button')).toBeNull();
  expect(document.querySelector('.program-block .movie-actions')).toBeNull();
  await click('.program-title h2 a');
  // happy-dom does not deliver native hash navigation within React's act.
  await act(async () => window.dispatchEvent(new HashChangeEvent('hashchange')));
  await click('.movie-options-button');
  expect(document.querySelector('.movie-preference-actions')?.textContent).toContain('鑑賞済み');
  expect(document.querySelector('.movie-preference-actions')?.textContent).toContain('非表示');
  expect(writes).toHaveLength(0);
});
it('rolls back a failed star without showing a success note', async () => {
  failSave = true;
  await click('.favorite-button');
  expect(document.querySelector('.favorite-button').getAttribute('aria-pressed')).toBe('false');
  expect(document.querySelector('.movie-preference-dialog textarea')).toBeNull();
  expect(document.body.textContent).toContain('スターを保存できませんでした');
});
