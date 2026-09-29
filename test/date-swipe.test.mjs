// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { useDateSwipe } from '../src/useDateSwipe';
let root, host, navigate, clicked, renders;
function Page({route='schedule',enabled=true}) {
 renders++;
 const ref=useDateSwipe(enabled,route,navigate);
 return h('main',{ref},
  h('div',{'data-horizontal-scroll':'cinema'},h('div',{'data-date-swipe-card':true,id:'screening'},h('a',{id:'booking',href:'#booking',onClick:clicked},'Book'))),
  h('article',{'data-date-swipe-card':true,id:'movie'},h('a',{id:'poster',href:'#movie',onClick:clicked},h('img',{id:'image'})),h('button',{id:'star',onClick:clicked},'Star'),
    h('div',{'data-horizontal-scroll':'times'},h('a',{id:'time',href:'#time',onClick:clicked},'19:00'))),
  h('div',{'data-horizontal-scroll':'dates'},h('button',{id:'date'},'Tomorrow')),
  h('textarea',{id:'input'}));
}
async function render(props={}){await act(async()=>root.render(h(Page,props)));}
function touch(target,type,x,y,{id=1,multiple=false,cancelable=true}={}) {
 const point={identifier:id,clientX:x,clientY:y};
 const event=new Event(type,{bubbles:true,cancelable});
 Object.defineProperties(event,{touches:{value:type==='touchend'?[]:multiple?[point,{...point,identifier:2}]:[point]},changedTouches:{value:[point]}});
 document.querySelector(target).dispatchEvent(event);return event;
}
const click=(target,detail=1)=>{const event=new MouseEvent('click',{bubbles:true,cancelable:true,detail});document.querySelector(target).dispatchEvent(event);return event;};
beforeEach(async()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);navigate=vi.fn();clicked=vi.fn(e=>e.preventDefault());renders=0;await render();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it.each(['#screening','#booking','#movie','#image','#star'])('recognizes horizontal card swipes from %s and suppresses accidental activation',target=>{
 touch(target,'touchstart',200,100);expect(touch(target,'touchmove',170,103).defaultPrevented).toBe(true);touch(target,'touchend',90,106);
 expect(navigate).toHaveBeenCalledWith('next');click(target);expect(clicked).not.toHaveBeenCalled();expect(renders).toBe(1);
});
it('recognizes previous-day swipes but ignores short gestures',()=>{
 touch('#movie','touchstart',30,100);touch('#movie','touchmove',50,100);touch('#movie','touchend',120,105);expect(navigate).toHaveBeenCalledWith('previous');
 navigate.mockClear();touch('#star','touchstart',100,100);touch('#star','touchmove',115,100);touch('#star','touchend',125,100);expect(navigate).not.toHaveBeenCalled();click('#star');expect(clicked).not.toHaveBeenCalled();
});
it('preserves vertical and diagonal scrolling without later converting it to a day swipe',()=>{
 touch('#movie','touchstart',200,100);expect(touch('#movie','touchmove',198,125).defaultPrevented).toBe(false);touch('#movie','touchmove',60,135);touch('#movie','touchend',30,140);expect(navigate).not.toHaveBeenCalled();
 touch('#movie','touchstart',200,100);expect(touch('#movie','touchmove',180,120).defaultPrevented).toBe(false);touch('#movie','touchend',80,180);expect(navigate).not.toHaveBeenCalled();
});
it.each(['#time','#date','#input'])('leaves nested strips and form fields alone: %s',target=>{
 touch(target,'touchstart',200,100);expect(touch(target,'touchmove',100,102).defaultPrevented).toBe(false);touch(target,'touchend',80,102);expect(navigate).not.toHaveBeenCalled();
});
it('keeps link/button taps and keyboard activation working, including a new tap immediately after a swipe',()=>{
 touch('#star','touchstart',100,100);touch('#star','touchend',101,101);click('#star');expect(clicked).toHaveBeenCalledTimes(1);
 touch('#star','touchstart',200,100);touch('#star','touchmove',100,100);touch('#star','touchend',90,100);
 click('#star',0);expect(clicked).toHaveBeenCalledTimes(2);
 touch('#star','touchstart',100,100);touch('#star','touchend',100,100);click('#star');expect(clicked).toHaveBeenCalledTimes(3);
});
it('suppresses the synthetic click even after navigation changes the route and starts loading',async()=>{
 touch('#star','touchstart',200,100);touch('#star','touchmove',100,100);touch('#star','touchend',90,100);
 await render({route:'tomorrow',enabled:false});click('#star');expect(clicked).not.toHaveBeenCalled();
});
it('cancels multi-touch, browser cancellation and route changes during a gesture',async()=>{
 touch('#movie','touchstart',200,100);touch('#movie','touchmove',150,100,{multiple:true});touch('#movie','touchend',80,100);expect(navigate).not.toHaveBeenCalled();
 touch('#movie','touchstart',200,100);touch('#movie','touchmove',150,100);touch('#movie','touchcancel',150,100);touch('#movie','touchend',80,100);expect(navigate).not.toHaveBeenCalled();
 touch('#movie','touchstart',200,100);touch('#movie','touchmove',150,100,{cancelable:false});touch('#movie','touchend',80,100);expect(navigate).not.toHaveBeenCalled();
 touch('#movie','touchstart',200,100);touch('#movie','touchmove',150,100);await render({route:'movies'});touch('#movie','touchend',80,100);expect(navigate).not.toHaveBeenCalled();
});
it('does not render or read layout while processing many move events',()=>{
 const spy=vi.spyOn(Element.prototype,'getBoundingClientRect');touch('#screening','touchstart',100,100);
 for(let i=0;i<200;i++)touch('#screening','touchmove',80-i,101);
 touch('#screening','touchend',-120,101);expect(renders).toBe(1);expect(spy).not.toHaveBeenCalled();expect(navigate).toHaveBeenCalledTimes(1);spy.mockRestore();
});
