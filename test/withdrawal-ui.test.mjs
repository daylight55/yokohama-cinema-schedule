// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { WithdrawAccount } from '../src/WithdrawAccount';
vi.mock('../src/i18n', () => ({localize: value => value}));
let root;
const button = text => [...document.querySelectorAll('button')].find(e => e.textContent === text);
const click = async text => act(async () => button(text).click());
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:false}));
  document.body.innerHTML='<div id="root"></div>';
  root=createRoot(document.getElementById('root'));
  await act(async () => root.render(createElement(WithdrawAccount)));
  const dialog=document.querySelector('dialog');
  dialog.showModal=()=>{dialog.open=true;};
  dialog.close=()=>{dialog.open=false;};
});
afterEach(async () => {await act(async()=>root.unmount());vi.unstubAllGlobals();});
it('requires both confirmations, supports cancellation, and restarts at the warning', async () => {
  await click('退会する');
  expect(document.querySelector('dialog').open).toBe(true);
  expect(button('退会してログアウト')).toBeUndefined();
  await click('確認して次へ');
  expect(fetch).not.toHaveBeenCalled();
  await click('キャンセル');
  expect(document.querySelector('dialog').open).toBe(false);
  await click('退会する');
  expect(document.querySelector('h2').textContent).toBe('退会前の確認');
  await click('確認して次へ');
  await click('退会してログアウト');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[role=alert]').textContent).toContain('退会できませんでした');
  expect(button('退会してログアウト').disabled).toBe(false);
});
it('prevents duplicate submissions and closing while the request is pending', async () => {
  let finish;
  fetch.mockReturnValue(new Promise(resolve => {finish=resolve;}));
  await click('退会する');await click('確認して次へ');await click('退会してログアウト');
  expect(button('処理中…').disabled).toBe(true);
  expect(button('キャンセル').disabled).toBe(true);
  const event=new Event('cancel',{cancelable:true});
  document.querySelector('dialog').dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async()=>finish({ok:false}));
});
