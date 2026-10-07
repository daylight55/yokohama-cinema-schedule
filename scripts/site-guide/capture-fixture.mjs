// Deterministic demonstration data only. The rendered UI is the unmodified app.
export const DATE = '2026-09-28';
export const TITLE = '君の名は。';
export const TITLE_EN = 'Your Name.';
export const key = TITLE;
export async function installFixture(page, language = 'ja', options = {}) {
  let lang = language;
  let preferences = [];
  let plans = [];
  let cinemaPreferences = options.cinemaPreferences ?? [];
  let userProfile = {departureRegistered:false,departureUpdatedAt:null,scheduleCollapseMinutes:0,...options.userProfile};
  let screeningInvitations = [];
  const cinemas = [
    {id:'burg',name:'横浜ブルク13',shortName:'ブルク13',area:'minatomirai',areaLabel:'桜木町・みなとみらい',sourceUrl:'https://tjoy.jp/yokohama_burg13'},
    {id:'toho',name:'TOHOシネマズ 上大岡',shortName:'TOHO上大岡',area:'kamiooka',areaLabel:'上大岡',sourceUrl:'https://hlo.tohotheater.jp/net/schedule/066/TNPI2000J01.do'},
    {id:'aeon',name:'イオンシネマみなとみらい',shortName:'イオンシネマ',area:'minatomirai',areaLabel:'桜木町・みなとみらい',sourceUrl:'https://www.aeoncinema.com/cinema/minatomirai/'},
  ].map(c=>({...c,address:'横浜市',latitude:35.45,longitude:139.63,activeUntil:null,approval:'private_only'}));
  const titles = [{titleKey:key,japaneseTitle:TITLE,englishTitle:TITLE_EN,originalTitle:TITLE,sourceKind:'reference',sourceUrl:null},
    {titleKey:'サマーウォーズ',japaneseTitle:'サマーウォーズ',englishTitle:'Summer Wars',originalTitle:'サマーウォーズ',sourceKind:'reference',sourceUrl:null}];
  const showings = [];
  for(let day=0;day<3;day++) for(let i=0;i<6;i++){
    const cinema=cinemas[i%3]; const date=`2026-09-${28+day}`; const title=i>=3?'サマーウォーズ':TITLE;
    showings.push({id:`guide-${day}-${i}`,sourceId:'guide',cinemaId:cinema.id,cinemaName:cinema.name,cinemaShortName:cinema.shortName,area:cinema.area,movieKey:title,title,imageUrl:options.posterUrl??null,
      startsAt:`${date}T${12+Math.floor(i/3)*3}:00:00+09:00`,endsAt:`${date}T${13+Math.floor(i/3)*3}:50:00+09:00`,screen:`シアター${i+1}`,format:options.formats ? options.formats[i%options.formats.length] : '2D',bookingUrl:cinema.sourceUrl,purchasable:true,fetchedAt:`${DATE}T08:00:00+09:00`});
  }
  for(let index=0;index<(options.extraMovieCount??0);index++) {
    const title=`Reload test film ${index+1}`;
    showings.push({...showings[0],id:`reload-${index}`,title,movieKey:title});
  }
  const fixedTime=Date.parse(options.now ?? `${DATE}T10:00:00+09:00`);
  if(options.nativeNavigationTiming) {
    // Playwright Clock replaces navigation performance entries. Reload tests
    // need the real navigation type, so only freeze Date for these fixtures.
    await page.addInitScript(fixedTime=>{
      const OriginalDate=Date;
      window.Date=class extends OriginalDate {
        constructor(...args) { if(args.length) super(...args); else super(fixedTime); }
        static now() { return fixedTime; }
      };
    },fixedTime);
  } else await page.clock.setFixedTime(new Date(fixedTime));
  await page.addInitScript(lang=>{document.cookie=`hamamubi_language=${lang}; Path=/`; localStorage.setItem('hamamubi-color-theme','light');},lang);
  await page.route('**/api/**', async route => {
    const request=route.request(); const url=new URL(request.url()); const path=url.pathname;
    const body=request.postDataJSON(); let result;
    if(path==='/api/account/language') {if(body?.language)lang=body.language; result={language:lang,userRole:'member'};}
    else if(path==='/api/profile'){
      if(request.method()==='DELETE')userProfile={...userProfile,departureRegistered:false,departureUpdatedAt:null};
      else if(request.method()==='PATCH')userProfile={...userProfile,...body};
      result=userProfile;
    }
    else if(path==='/api/account')result={user:{id:'guide',email:null,displayEmail:'demo@example.com',role:'member',legacy:false},methods:{google:true,password:false,passkeySupported:false},passkeys:[],users:[],pendingInvites:[],googleConfigured:true};
    else if(path==='/api/account/profile')result={userId:'guide',displayName:lang==='ja'?'はまむび':'Hama',avatarUrl:null,bio:''};
    else if(path==='/api/member-page')result={profile:{userId:'guide',displayName:lang==='ja'?'はまむび':'Hama',avatarUrl:null,bio:''},isSelf:true,movies:preferences,plans:plans.map(p=>({...p,userId:'guide',reserved:!!p.reservedAt})),titles};
    else if(path==='/api/notifications')result={userId:'guide',items:[],unread:0,lastReadId:0,latestId:0,nextBefore:null,titles};
    else if(path==='/api/showings'){
      const date=url.searchParams.get('date')||DATE, through=url.searchParams.get('through')||date;
      const availableCinemas=cinemas.filter(cinema=>!options.unavailableCinemaIdsByDate?.[date]?.includes(cinema.id));
      const availableIds=new Set(availableCinemas.map(cinema=>cinema.id));
      result={date,generatedAt:`${DATE}T10:00:00+09:00`,lastUpdatedAt:`${DATE}T08:00:00+09:00`,cinemas:availableCinemas,showings:showings.filter(s=>availableIds.has(s.cinemaId)&&s.startsAt.slice(0,10)>=date&&s.startsAt.slice(0,10)<=through),movieTitles:titles,preferences,preferencesEnabled:true,cinemaTravelPreferences:cinemaPreferences,cinemaTravelPreferencesEnabled:options.preferencesEnabled!==false,userProfile,userProfileEnabled:true,sourceHealth:{healthy:2,total:2}};
    }else if(path==='/api/collection-status'){
      const dates=Array.from({length:7},(_,i)=>new Date(Date.parse(`${DATE}T12:00:00Z`)+i*86400000).toISOString().slice(0,10));
      result={generatedAt:`${DATE}T10:00:00+09:00`,dates,cinemas:cinemas.map(cinema=>({...cinema,days:dates.map(date=>({date,status:'published',stale:false,fetchedCount:2,storedCount:2,lastAttemptAt:`${DATE}T08:00:00+09:00`,lastSuccessAt:`${DATE}T08:00:00+09:00`,storedUpdatedAt:`${DATE}T08:00:00+09:00`,issue:null}))}))};
    }else if(path==='/api/cinema-preferences'){
      if(request.method()==='POST'){
        if(options.saveDelay)await new Promise(resolve=>setTimeout(resolve,options.saveDelay));
        if(options.failSave){await route.fulfill({status:500,json:{error:'demo_failure'}});return;}
        result={cinemaId:body.cinemaId,travelMode:'transit',customDurationMinutes:null,note:'',...cinemaPreferences.find(p=>p.cinemaId===body.cinemaId),...body};
        cinemaPreferences=[...cinemaPreferences.filter(p=>p.cinemaId!==body.cinemaId),result];
      }else result={preferences:cinemaPreferences};
    }else if(path==='/api/preferences'){
      const previous=preferences.find(p=>p.movieKey===body.title);
      const pref={movieKey:body.title,title:body.title,imageUrl:null,starred:false,status:null,comment:'',...previous,...body,updatedAt:`${DATE}T10:00:00+09:00`};
      preferences=[...preferences.filter(p=>p.movieKey!==pref.movieKey),pref]; result=pref;
    }else if(path==='/api/viewing-plans'){
      if(request.method()==='POST'){
        const showing=showings.find(s=>s.id===body.showingId);
        result={...showing,showingId:showing.id,reservedAt:null,createdAt:`${DATE}T10:00:00+09:00`,updatedAt:`${DATE}T10:00:00+09:00`}; plans=[result];
      }else result={plans};
    }else if(path==='/api/screening-invitations'){
      if(request.method()==='POST'){
        for(const recipientId of body.recipientIds){
          const plan=plans.find(p=>p.showingId===body.showingId);
          if(!screeningInvitations.some(i=>i.recipientId===recipientId && i.showingId===body.showingId))screeningInvitations.push({...plan,id:`invite-${recipientId}`,senderId:'guide',recipientId,status:'pending'});
        }
        result={ok:true};
      }else if(request.method()==='PATCH'){
        screeningInvitations=screeningInvitations.map(i=>i.id===body.id?{...i,status:body.action==='accept'?'accepted':body.action==='decline'?'declined':'cancelled'}:i);result={ok:true};
      }else result={invitations:screeningInvitations};
    }else if(path==='/api/sharing'){
      result={userId:'guide',groups:[{id:'friends',name:lang==='ja'?'映画ともだち':'Movie friends'}],groupId:'friends',members:[{userId:'guide',name:lang==='ja'?'はまむび':'Hama'},{userId:'friend',name:lang==='ja'?'そら':'Sora'}],plans:plans.map(p=>({...p,userId:'guide',reserved:false})),movies:[...(options.extraSharedMovies??[]),{userId:'guide',movieKey:key,title:TITLE,imageUrl:null,comment:lang==='ja'?'週末に観たい！':'Let’s go this weekend!',nextShowingAt:showings[0].startsAt},{userId:'friend',movieKey:key,title:TITLE,imageUrl:null,comment:lang==='ja'?'私も気になる！':'I want to see it too!',nextShowingAt:showings[0].startsAt}],titles};
    }else throw new Error(`Unimplemented fixture: ${path}`);
    await route.fulfill({json:result});
  });
}
