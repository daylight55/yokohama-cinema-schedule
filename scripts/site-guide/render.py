#!/usr/bin/env python3
"""Render the illustrated, silent product guide. Requires Pillow and ffmpeg.
No account data, film artwork, network calls or screen recordings are used.
"""
import argparse
import json
import math
import os
from pathlib import Path
import subprocess
import unicodedata
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/guide'
COPY = json.loads((ROOT / 'shared/site-guide.json').read_text())
W, H, FPS, SECONDS = 900, 1200, 24, 6
BG, INK, MUTED = '#fff8ee', '#25322d', '#60736a'
GREEN, PALE, LINE, CORAL, GOLD = '#159a6b', '#dff6e9', '#b9d8ca', '#e34f5f', '#a56a00'
FONT_DIR = Path('/System/Library/Fonts')
def font_path(weight):
    override = os.environ.get('GUIDE_FONT_BOLD' if weight else 'GUIDE_FONT')
    if override:
        return override
    for p in FONT_DIR.glob('*.ttc'):
        if unicodedata.normalize('NFC', p.name) == f'ヒラギノ角ゴシック W{6 if weight else 3}.ttc':
            return str(p)
    raise RuntimeError('Set GUIDE_FONT and GUIDE_FONT_BOLD to Japanese-capable font files.')

@lru_cache(maxsize=100)
def font(size, bold=False):
    return ImageFont.truetype(font_path(bold), size)

def text(d, xy, value, size=32, color=INK, bold=False):
    d.text(xy, value, font=font(size, bold), fill=color, anchor='lt', spacing=12)

def wrap(d, value, width, size):
    lines=[]
    for paragraph in value.split('\n'):
        words = paragraph.split(' ') if ' ' in paragraph else list(paragraph)
        sep = ' ' if ' ' in paragraph else ''
        line=''
        for word in words:
            candidate = (line+sep+word) if line else word
            if d.textlength(candidate, font=font(size)) > width and line:
                lines.append(line); line=word
            else:
                line=candidate
        lines.append(line)
    return lines

def paragraph(d, xy, value, width, size=31, color=INK, bold=False, gap=12):
    x,y=xy
    lines=wrap(d,value,width,size)
    for line in lines:
        text(d,(x,y),line,size,color,bold); y+=size+gap
    return y

def box(d, bounds, fill='white', outline=None, radius=20, width=2):
    d.rounded_rectangle(bounds, radius=radius, fill=fill, outline=outline, width=width)

def button(d, x,y,label,w=270,active=False,size=29):
    box(d,(x,y,x+w,y+68),GREEN if active else 'white',GREEN if active else LINE,16)
    tw=d.textlength(label,font=font(size,True))
    text(d,(x+(w-tw)/2,y+20),label,size,'white' if active else INK,True)

def star(d,x,y,r=20,fill=GOLD):
    pts=[]
    for i in range(10):
        a=-math.pi/2+i*math.pi/5; s=r if i%2==0 else r*.44
        pts.append((x+math.cos(a)*s,y+math.sin(a)*s))
    d.polygon(pts,fill=fill)

def arrow(d,x,y):
    d.line((x,y,x+50,y),fill=GREEN,width=6)
    d.line((x+35,y-14,x+50,y,x+35,y+14),fill=GREEN,width=6)

def tap(im, xy, t):
    if not 1.3<t<4.5: return
    d=ImageDraw.Draw(im); x,y=xy
    pulse=(t-1.3)%1.6; radius=22+int(pulse*20)
    d.ellipse((x-radius,y-radius,x+radius,y+radius),outline=CORAL,width=4)
    d.ellipse((x-8,y-8,x+8,y+8),fill=CORAL)

def panel(d,lang):
    box(d,(58,295,842,914),'#fffefa',LINE,26)
    text(d,(90,324),'はまむび！' if lang=='ja' else 'Hama Movie!',31,CORAL,True)
    text(d,(655,331),'JP / EN',24,MUTED)
    d.line((82,376,818,376),fill=LINE,width=2)

@lru_cache(maxsize=1)
def brand_icon():
    logo=Image.open(ROOT/'public/brand/hamamubi-icon-v2-512.png').convert('RGBA')
    logo.thumbnail((245,245))
    return logo

def scene(lang,index,t):
    jp=lang=='ja'; tr=lambda a,b:a if jp else b
    s=COPY[lang]['scenes'][index]
    im=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(im)
    text(d,(60,45),'HAMA MOVIE!   /   QUICK GUIDE',23,GREEN,True)
    text(d,(752,45),f'{index+1:02d} / 08',23,MUTED)
    title_size=52 if jp else 48
    paragraph(d,(60,108),s['title'],780,title_size,INK,True,10)
    target=None
    panel(d,lang)
    film=tr('サンプル作品','Sample film')
    if index==0:
        logo=brand_icon()
        lift=int(7*math.sin(t*1.4)); im.paste(logo,((W-logo.width)//2,410+lift),logo)
        text(d,(168 if jp else 180,691),tr('映画を探す。観に行く。','Find a film. Make a plan.'),43,INK,True)
        text(d,(240 if jp else 255,768),tr('48秒で、ひと通り。','48 seconds to get started.'),30,MUTED)
        box(d,(332,834,568,886),PALE,None,26)
        text(d,(368,849),tr('音声なしでOK','No sound needed'),22,GREEN,True)
    elif index==1:
        for i,label in enumerate([tr('今日','Today'),tr('明日','Tomorrow'),'…']):
            button(d,90+i*244,406,label,226,i==0,27)
        box(d,(90,501,628,574),'white',LINE,14)
        text(d,(112,522),film if t>2 else tr('作品名・映画館名','Film or cinema'),28,MUTED)
        button(d,646,501,tr('検索','Search'),164,True,26)
        button(d,90,602,tr('これから','Upcoming'),244,t>3,27)
        button(d,354,602,tr('横浜駅','Yokohama Stn.'),310,False,26)
        d.line((90,711,810,711),fill=LINE,width=2)
        text(d,(90,750),'14:00',43,GREEN,True)
        text(d,(284,750),film,34,INK,True)
        text(d,(284,811),'T・ジョイ横浜' if jp else 'T-Joy Yokohama',27,MUTED)
        target=(714,534)
    elif index==2:
        text(d,(90,410),film,41,INK,True)
        text(d,(90,474),tr('今後7日間の上映','Showtimes for the next 7 days'),27,GREEN)
        d.line((122,555,122,854),fill=LINE,width=4)
        for i,(time,cinema) in enumerate([('14:00',tr('T・ジョイ横浜','T-Joy Yokohama')),('16:30',tr('横浜ブルク13','Yokohama Burg 13')),('19:10',tr('イオンシネマ','AEON Cinema'))]):
            y=553+i*109
            d.ellipse((110,y+8,134,y+32),fill=GREEN)
            text(d,(163,y),time,36,INK,True)
            text(d,(328,y+4),cinema,30,INK)
            if i<2: d.line((163,y+75,783,y+75),fill=LINE,width=1)
        target=(725,493)
    elif index==3:
        text(d,(90,410),film,38,INK,True)
        text(d,(90,478),'14:00',46,GREEN,True)
        text(d,(290,490),tr('T・ジョイ横浜','T-Joy Yokohama'),31,INK)
        button(d,90,559,tr('予約 ↗','Book ↗'),320,True)
        button(d,440,559,tr('観に行く','Add to plans'),370)
        d.line((450,669,450,719),fill=GREEN,width=5)
        d.polygon([(438,706),(462,706),(450,724)],fill=GREEN)
        box(d,(90,752,810,867),PALE)
        text(d,(126,780),tr('映画館の公式予約サイトへ','Continue to the cinema website'),30,GREEN,True)
        target=(324,592)
    elif index==4:
        text(d,(90,410),film,38,INK,True)
        star(d,751,430,24, GOLD if t>1.3 else MUTED)
        text(d,(660,407),'…',42,INK,True)
        box(d,(126,504,774,871),'white',LINE)
        for i,label in enumerate([tr('作品の上映スケジュール','View film showtimes'),tr('★  気になる','★  Watchlist'),tr('鑑賞済み','Watched'),tr('興味なし','Not interested')]):
            button(d,150,524+i*82,label,600,i==1,27)
        target=(676,439) if t<2.6 else (639,642)
    elif index==5:
        text(d,(90,410),film,38,INK,True)
        text(d,(90,478),'14:00   T-Joy Yokohama',34,INK)
        button(d,90,552,tr('予約 ↗','Book ↗'),280)
        button(d,402,552,tr('観に行く','Add to plans'),408,True)
        arrow(d,430,680)
        box(d,(90,736,810,868),PALE)
        text(d,(118,758),tr('鑑賞予定','My screenings'),30,GREEN,True)
        text(d,(118,812),'14:00  /  '+film,28,INK)
        target=(709,586)
    elif index==6:
        text(d,(90,410),tr('共有','Shared'),41,INK,True)
        button(d,90,489,tr('みんなの予定','Everyone’s plans'),356,t<3,26)
        button(d,466,489,tr('気になる','Watchlist'),344,t>=3,26)
        text(d,(90,602),film,34,INK,True)
        text(d,(90,662),tr('14:00  T・ジョイ横浜','14:00  T-Joy Yokohama') if t<3 else tr('この映画が気になるメンバー','Members interested in this film'),27,MUTED)
        for i,label in enumerate(['A','B','C']):
            x=122+i*224
            d.ellipse((x,728,x+64,792),fill=[GREEN,CORAL,GOLD][i]); text(d,(x+20,746),label,28,'white',True)
            text(d,(x-4,812),tr('メンバー','Member')+' '+label,21,MUTED)
        target=(669,524)
    else:
        text(d,(90,410),tr('タップで言語を切り替え','Switch with one tap'),34,INK,True)
        box(d,(238,497,662,597),PALE,None,50)
        on_en=t>2.5
        box(d,(450 if on_en else 250,509,650 if on_en else 450,585),GREEN,None,38)
        text(d,(310,532),'JP',36,'white' if not on_en else MUTED,True)
        text(d,(515,532),'EN',36,'white' if on_en else MUTED,True)
        text(d,(185 if on_en else 275,666),'Hama Movie!' if on_en else 'はまむび！',55,CORAL,True)
        text(d,(240 if jp else 230,772),tr('次の1本を、見つけよう。','Find your next film.'),34,INK,True)
        target=(596,549)
    if target: tap(im,target,t)
    # Put the explanation above the illustration so native video controls
    # never cover it when paused or on touch devices.
    illustration=im.crop((0,295,W,916))
    d.rectangle((0,295,W,H),fill=BG)
    im.paste(illustration,(0,435))
    end=paragraph(d,(60,238),s['caption'],780,34,INK,False,10)
    if end>430: raise ValueError(f'Caption overflows: {lang} scene {index}')
    text(d,(60,1101),s['short'],27,MUTED)
    # A subtle linear progress bar, not a flashing animation.
    for n in range(8):
        x=60+n*99
        box(d,(x,1174,x+86,1180),LINE,None,3)
        fill=1 if n<index else min(t/SECONDS,1) if n==index else 0
        if fill: box(d,(x,1174,x+max(6,int(86*fill)),1180),GREEN,None,3)
    # Soft fades at scene boundaries keep the film legible and calm.
    fade=min(1,t/.28,(SECONDS-t)/.28)
    if fade<1: im=Image.blend(Image.new('RGB',(W,H),BG),im,max(0,fade))
    return im

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--stills',action='store_true'); args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    for lang,copy in COPY.items():
        scene(lang,0,2).save(OUT/f'how-to-{lang}.webp',quality=88)
        if args.stills:
            for i in range(8): scene(lang,i,3.5).save(Path('/tmp')/f'hama-guide-{lang}-{i}.png')
            continue
        staging=ROOT/'.wrangler/site-guide-render'
        staging.mkdir(parents=True,exist_ok=True)
        rendered=staging/f'how-to-{lang}.mp4'
        command=['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-s',f'{W}x{H}','-pix_fmt','rgb24','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',str(rendered)]
        proc=subprocess.Popen(command,stdin=subprocess.PIPE)
        try:
            for i in range(8):
                for f in range(FPS*SECONDS):
                    proc.stdin.write(scene(lang,i,f/FPS).tobytes())
                print(f'{lang}: scene {i+1}/8',flush=True)
        finally:
            proc.stdin.close()
        if proc.wait(): raise RuntimeError('ffmpeg failed')
        # Publish only finalized MP4s, never a partially written encoding.
        rendered.replace(OUT/f'how-to-{lang}.mp4')
        def timestamp(seconds): return f'00:{seconds//60:02d}:{seconds%60:02d}.000'
        cues=['WEBVTT','']
        for i,s in enumerate(copy['scenes']):
            cues.extend([f'{timestamp(i*SECONDS)} --> {timestamp((i+1)*SECONDS)}',s['caption'],''])
        (OUT/f'how-to-{lang}.vtt').write_text('\n'.join(cues))

if __name__=='__main__': main()
