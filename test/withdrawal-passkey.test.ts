import { describe, expect, it, vi } from "vitest";
import { testDatabase } from "./helpers/sqlite-d1";
import { authenticationOptions, authenticatePasskey } from "../functions/_lib/passkeys";
import { createUserSession } from "../functions/_lib/auth";
import { authenticatedLogin } from "../functions/_lib/account-restoration";
import { onRequestPost as restoreAccount } from "../functions/auth/restore";
import { withdrawAccount } from "../shared/account-lifecycle";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { PagesEnv } from "../functions/_lib/env";
vi.mock("@simplewebauthn/server",async original=>({
  ...await original<typeof import("@simplewebauthn/server")>(),
  verifyAuthenticationResponse:vi.fn(),
}));
describe('withdrawn passkey accounts',()=>{
 it('requires cryptographic verification and explicit consent before restoration and rejects expired credentials',async()=>{
  const {db,sqlite}=testDatabase();
  try{
   sqlite.exec(`INSERT INTO users(id,email,created_at,updated_at) VALUES('passkey-member','key@example.org','now','now');
    INSERT INTO webauthn_credentials(id,user_id,public_key,counter,device_type,backed_up,transports,aaguid,name,created_at)
    VALUES('key','passkey-member','AQID',0,'multiDevice',1,'[]','test','test','now');`);
   await withdrawAccount(db,'passkey-member');
   const request=new Request('https://example.org/auth/passkeys/verify');
   const response={id:'key'} as AuthenticationResponseJSON;
   vi.mocked(verifyAuthenticationResponse).mockResolvedValueOnce({verified:false} as Awaited<ReturnType<typeof verifyAuthenticationResponse>>);
   const invalid=await authenticationOptions(db,request);
   await expect(authenticatePasskey(db,request,invalid.challengeId,response)).rejects.toThrow('passkey_verification_failed');
   expect(sqlite.prepare("SELECT status FROM users WHERE id='passkey-member'").get()?.status).toBe('disabled');
   vi.mocked(verifyAuthenticationResponse).mockResolvedValueOnce({verified:true,authenticationInfo:{newCounter:1,credentialDeviceType:'multiDevice',credentialBackedUp:true}} as Awaited<ReturnType<typeof verifyAuthenticationResponse>>);
   const valid=await authenticationOptions(db,request);
   const id=await authenticatePasskey(db,request,valid.challengeId,response);
   const env={DB:db,SESSION_SECRET:'test-passkey-restoration-secret'} as PagesEnv;
   await expect(createUserSession(env,id)).rejects.toThrow('user_disabled');
   const login=await authenticatedLogin(env,id);
   expect(sqlite.prepare("SELECT status FROM users WHERE id='passkey-member'").get()?.status).toBe('disabled');
   const restored=await restoreAccount({env,request:new Request('https://example.org/auth/restore',{
    method:'POST',headers:{origin:'https://example.org',cookie:login.restoreCookie!.split(';')[0]},
    body:new URLSearchParams({action:'restore'}),
   })} as Parameters<typeof restoreAccount>[0]);
   expect(restored.headers.get('set-cookie')).toContain('yc_session=v2.');
   expect(sqlite.prepare("SELECT withdrawn_at FROM users WHERE id='passkey-member'").get()?.withdrawn_at).toBeNull();
   await withdrawAccount(db,id,new Date('2020-01-01T00:00:00Z'));
   const expired=await authenticationOptions(db,request);
   await expect(authenticatePasskey(db,request,expired.challengeId,response)).rejects.toThrow('passkey_not_found');
  } finally {sqlite.close();}
 });
});
