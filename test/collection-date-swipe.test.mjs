// @vitest-environment happy-dom
import {act, createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach, afterEach, it, expect, vi} from 'vitest';
import {CollectionStatusPage} from '../src/CollectionStatusPage';
let root, host;
const dates=['2026-09-28','2026-09-29','2026-09-30'];
const render=async date=>{await act(async()=>root.render(createElement(CollectionStatusPage,{date,language:'ja'})));};
function swipe(selector,dx,dy=0) {
  const target=document.querySelector(selector);
  for(const [type,fraction] of [['touchstart',0],['touchmove',.4],['touchend',1]]) {
    const point={identifier:1,clientX:200+dx*fraction,clientY:150+dy*fraction};
    const event=new Event(type,{bubbles:true,cancelable:true});
    Object.defineProperties(event,{touches:{value:type==='touchend'?[]:[point]},changedTouches:{value:[point]}});
    target.dispatchEvent(event);
  }
}
beforeEach(async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({dates,cinemas:[]})})));
  vi.spyOn(Element.prototype,'scrollIntoView').mockImplementation(()=>{});
  history.replaceState(null,'',`#collection-status?date=${dates[1]}`);
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await render(dates[1]);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('swipes within the fetched date range and updates its callback without refetching',async()=>{
  swipe('.collection-overview',-100);expect(location.hash).toBe(`#collection-status?date=${dates[2]}`);
  await render(dates[2]);swipe('.collection-overview',100);expect(location.hash).toBe(`#collection-status?date=${dates[1]}`);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([[dates[0],100],[dates[2],-100]])('does not wrap past the boundary %s',async(date,dx)=>{
  history.replaceState(null,'',`#collection-status?date=${date}`);await render(date);
  swipe('.collection-overview',dx);expect(location.hash).toBe(`#collection-status?date=${date}`);
});
it('preserves local date scrolling and vertical gestures',()=>{
  swipe('.collection-dates a',-100);swipe('.collection-overview',10,120);
  expect(location.hash).toBe(`#collection-status?date=${dates[1]}`);
});
it('ignores a date outside the loaded range',async()=>{
  await render('2026-10-01');swipe('.collection-overview',-100);
  expect(location.hash).toBe(`#collection-status?date=${dates[1]}`);
});
