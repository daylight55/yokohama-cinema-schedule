// Exercise the actual auth handlers against an isolated SQLite database and browser.
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {build} from 'esbuild';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const directory=await mkdtemp(join(tmpdir(),'hama-restoration-'));
let browser,server,data;
try {
  const bundle=join(directory,'handlers.cjs');
  await build({stdin:{contents:`
    export {testDatabase} from './test/helpers/sqlite-d1';
    export {withdrawAccount} from './shared/account-lifecycle';
    export {loginPage,saveUserPassword,resolveSession} from './functions/_lib/auth';
    export {onRequestPost as passwordLogin} from './functions/auth/password/login';
    export {onRequestGet as restorePage,onRequestPost as restoreAccount} from './functions/auth/restore';
  `,resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',outfile:bundle,logLevel:'error'});
  const handlers=(await import(pathToFileURL(bundle).href)).default;
  data=handlers.testDatabase();
  const env={DB:data.db,SESSION_SECRET:'isolated-browser-restoration-secret'};
  data.sqlite.exec("INSERT INTO users(id,email,created_at,updated_at) VALUES('member','member@example.com','now','now')");
  await handlers.saveUserPassword(data.db,'member','isolated-restoration-password');
  server=createServer(async(req,res)=>{
    try {
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,
        ...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
      const url=new URL(request.url);
      let response;
      if(url.pathname==='/auth/login') response=handlers.loginPage(false,'',false,'','',url.searchParams.get('lang')==='en'?'en':'ja');
      else if(url.pathname==='/auth/password/login')response=await handlers.passwordLogin({request,env});
      else if(url.pathname==='/auth/restore')response=await (req.method==='POST'?handlers.restoreAccount:handlers.restorePage)({request,env});
      else if(url.pathname==='/')response=new Response(await handlers.resolveSession(request,env)?'<h1>Signed in</h1>':'Unauthenticated',{
        status:await handlers.resolveSession(request,env)?200:401,headers:{'content-type':'text/html'}});
      else {
        const files={'/base-theme.css':'text/css','/page-layout.css':'text/css','/login-route.js':'text/javascript','/passkey-login.js':'text/javascript','/account-restore.js':'text/javascript','/brand/hamamubi-icon-v2.svg':'image/svg+xml'};
        response=files[url.pathname]?new Response(await readFile(resolve('public',url.pathname.slice(1))),{headers:{'content-type':files[url.pathname]}}):new Response('Not found',{status:404});
      }
      res.statusCode=response.status;
      for(const [name,value]of response.headers)if(name!=='set-cookie')res.setHeader(name,value);
      if(response.headers.getSetCookie().length)res.setHeader('set-cookie',response.headers.getSetCookie());
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch(error){res.statusCode=500;res.end(String(error));}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  await mkdir('output/playwright/restoration',{recursive:true});
  browser=await chromium.launch({headless:true});
  for(const lang of ['ja','en'])for(const [width,height]of [[320,700],[390,844]]){
    const context=await browser.newContext({viewport:{width,height}});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const deadline=await handlers.withdrawAccount(data.db,'member');
    const signIn=async()=>{
      await page.goto(`${base}/auth/login?lang=${lang}#account`);
      await page.locator('#email').fill('member@example.com');
      await page.locator('#current-password').fill('isolated-restoration-password');
      await page.locator('form[action="/auth/password/login"] button').click();
      await page.waitForURL('**/auth/restore');
      await page.locator('dialog:modal').waitFor();
    };
    await signIn();
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.getByRole('dialog',{name:lang==='ja'?'アカウントを復旧しますか？':'Restore your account?'}).count(),1);
    assert.equal(await page.locator('[value="cancel"]').evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    for(const button of await page.locator('dialog button').all())assert.ok((await button.boundingBox()).height>=44);
    await page.screenshot({path:`output/playwright/restoration/${lang}-${width}.png`});
    assert.equal(data.sqlite.prepare("SELECT status FROM users WHERE id='member'").get().status,'disabled');
    assert.equal((await context.request.get(base+'/')).status(),401);
    await page.reload();await page.locator('dialog:modal').waitFor();
    await page.goBack();await page.goForward();await page.locator('dialog:modal').waitFor();
    await page.keyboard.press('Escape');
    try { await page.waitForURL('**/auth/login',{timeout:5000}); }
    catch(error){console.error('Cancel result:',await page.locator('body').innerText());throw error;}
    assert.deepEqual({...data.sqlite.prepare("SELECT status,delete_after FROM users WHERE id='member'").get()},{status:'disabled',delete_after:deadline});
    assert.equal((await context.cookies()).some(c=>c.name==='yc_restore'),false);
    await signIn();await page.locator('[value="cancel"]').click();await page.waitForURL('**/auth/login');
    assert.equal(data.sqlite.prepare("SELECT status FROM users WHERE id='member'").get().status,'disabled');
    await signIn();await page.keyboard.press('Tab');
    assert.equal(await page.locator('[value="restore"]').evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Enter');await page.waitForURL('**/#account');
    assert.equal(data.sqlite.prepare("SELECT status FROM users WHERE id='member'").get().status,'active');
    // Chromium treats loopback as secure; APIRequestContext does not send a
    // Secure cookie over HTTP. Verify the authenticated browser navigation.
    assert.equal(await page.getByRole('heading',{name:'Signed in'}).count(),1);
    await page.goto(base+'/auth/restore');await page.waitForURL('**/auth/login');
    assert.deepEqual(errors,[]);
    console.log(`${lang} ${width}x${height}: confirmation, no access before consent, cancel/Escape, restore, focus, reload/history, no overflow passed`);
    await context.close();
  }
  await handlers.withdrawAccount(data.db,'member');
  const context=await browser.newContext({viewport:{width:320,height:700},javaScriptEnabled:false});
  const page=await context.newPage();await page.goto(base+'/auth/login');
  await page.locator('#email').fill('member@example.com');await page.locator('#current-password').fill('isolated-restoration-password');
  await page.locator('form[action="/auth/password/login"] button').click();await page.waitForURL('**/auth/restore');
  await page.locator('[value="restore"]').click();await page.waitForURL(base+'/');
  assert.equal(data.sqlite.prepare("SELECT status FROM users WHERE id='member'").get().status,'active');
  console.log('Confirmation and explicit restoration without JavaScript passed');
  await context.close();
}finally{
  await browser?.close();await new Promise(r=>server?server.close(r):r());data?.sqlite.close();await rm(directory,{recursive:true,force:true});
}
