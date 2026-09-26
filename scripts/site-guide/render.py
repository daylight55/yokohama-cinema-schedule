#!/usr/bin/env python3
"""Render the comic-style guide with original music. Requires Pillow, NumPy and ffmpeg.
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
from music import compose

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
    box(d,(x,y,x+w,y+68),GREEN if active else 'white',INK,16,3)
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
    box(d,(58,295,842,914),'#fffefa',INK,26,4)
    text(d,(90,324),'はまむび！' if lang=='ja' else 'Hama Movie!',31,CORAL,True)
    text(d,(655,331),'JP / EN',24,MUTED)
    d.line((82,376,818,376),fill=LINE,width=2)

@lru_cache(maxsize=1)
def brand_icon():
    logo=Image.open(ROOT/'public/brand/hamamubi-icon-v2-512.png').convert('RGBA')
    logo.thumbnail((245,245))
    return logo

def diagram(lang,index,t):
    jp=lang=='ja'; tr=lambda a,b:a if jp else b
    im=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(im)
    target=None
    panel(d,lang)
    film=tr('サンプル作品','Sample film')
    if index==1:
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
        text(d,(90,474),tr('週間スケジュール','Showtimes for the coming week'),27,GREEN)
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
    if target: tap(im,target,t)
    return im.crop((54,295,848,916)).convert('RGBA')

PALETTES = ['#ffdf62','#c8f1df','#ffd5d9','#f9e6a0','#e3dbff','#c9eafa','#ffe1c4','#c8f1df']

def burst(d,x,y,r,fill,rotation=0):
    points=[]
    for i in range(24):
        angle=rotation+i*math.pi/12
        radius=r if i%2==0 else r*.79
        points.append((x+math.cos(angle)*radius,y+math.sin(angle)*radius))
    d.polygon(points,fill=fill,outline=INK,width=4)

def paste_mascot(im,x,y,size,t,lean=0):
    # Squash and stretch on the beat, with a damped entrance bounce.
    beat=max(0,math.sin(t*math.pi*2))
    w=int(size*(1+.025*beat)); h=int(size*(1-.035*beat))
    logo=brand_icon().resize((w,h),Image.Resampling.LANCZOS)
    logo=logo.rotate(lean+5*math.sin(t*math.pi),resample=Image.Resampling.BICUBIC,expand=True)
    y-=int(17*beat)
    d=ImageDraw.Draw(im)
    d.ellipse((x-size*.32,y+size*.9,x+size*.32,y+size*1.02),fill='#25322d')
    im.paste(logo,(int(x-logo.width/2),int(y)),logo)

def sticker(im,x,y,label,t,fill='#fffefa',size=32,angle=-3):
    tw=int(ImageDraw.Draw(im).textlength(label,font=font(size,True)))
    layer=Image.new('RGBA',(tw+68,size+64))
    d=ImageDraw.Draw(layer)
    box(d,(8,8,tw+57,size+53),INK,INK,18,3)
    box(d,(1,1,tw+49,size+45),fill,INK,18,3)
    text(d,(24,21),label,size,INK,True)
    layer=layer.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
    im.paste(layer,(int(x),int(y)),layer)

def scene(lang,index,t):
    jp=lang=='ja'; tr=lambda a,b:a if jp else b
    s=COPY[lang]['scenes'][index]
    bg=PALETTES[index]
    im=Image.new('RGB',(W,H),bg); d=ImageDraw.Draw(im)
    # Halftone corners and a few moving confetti marks give the composition
    # comic energy without flashing or moving the explanatory text.
    for x in range(14,180,20):
        for y in range(12,220,20):
            if x+y<220: d.ellipse((x,y,x+4,y+4),fill=INK)
    for i in range(9):
        x=35 if i%2 else 865; y=440+i*70+int(8*math.sin(t+i))
        d.line((x-9,y-9,x+9,y+9),fill=[GREEN,CORAL,INK][i%3],width=5)
    text(d,(55,32),'HAMA MOVIE!',27,INK,True)
    text(d,(548,35),tr('はまむびくんと映画へ！','LET’S GO TO THE MOVIES!'),21,INK,True)
    # The headline lands with a quick spring and then stays readable.
    title=s['title']
    size=73 if jp else 67
    lines=wrap(d,title,756,size)
    while len(lines)>2 or any(d.textlength(line,font=font(size,True))>756 for line in lines):
        size-=1; lines=wrap(d,title,756,size)
    top=95+int(-20*math.exp(-t*7)*math.sin(t*19))
    for row,line in enumerate(lines):
        # Small offset shadow, then the bold title itself.
        text(d,(57,top+row*(size+9)+4),line,size,'#fffefa',True)
        text(d,(52,top+row*(size+9)),line,size,INK,True)
    box(d,(54,248,854,434),INK,INK,24,3)
    box(d,(46,240,846,426),'#fffefa',INK,24,3)
    end=paragraph(d,(67,260),s['caption'],756,32,INK,False,10)
    if end>428: raise ValueError(f'Caption overflow {lang} {index}')
    if index in (0,7):
        burst(d,450,713,242,'#fffefa',.04*math.sin(t))
        paste_mascot(im,450,520,340,t)
        # Characters' celebratory arms and little sparkle strokes.
        d.line((243,722,205,677,173,688),fill=INK,width=10)
        d.line((657,722,694,677,727,688),fill=INK,width=10)
        for x,y in [(157,542),(745,555),(157,880),(755,884)]:
            star(d,x,y,18+5*math.sin(t*2),CORAL if x<450 else GREEN)
        if index==0:
            sticker(im,77,471,tr('さがす！','FIND IT!'),t,'#fffefa',32,-6)
            sticker(im,570,471,tr('観に行く！','LET’S GO!'),t,'#ffadba',32,5)
            sticker(im,68,897,tr('気になる！','LOVE IT!'),t,'#ffdf62',32,4)
            sticker(im,602,897,tr('みんなで！','TOGETHER!'),t,'#c8f1df',29,-5)
        else:
            sticker(im,90,474,'JP',t,'#fffefa',42,-7)
            sticker(im,668,474,'EN',t,'#ffdf62',42,7)
            sticker(im,170,922,tr('次の映画、見つけよう！','FIND YOUR NEXT FILM!'),t,'#ffdf62',34,-2)
    else:
        # Keep the real button labels recognizable inside the comic frame.
        inner=diagram(lang,index,t)
        # Quick slide-in only at the scene cut; no perpetual movement of controls.
        entrance=int(55*math.exp(-t*12))
        shadow=Image.new('RGBA',inner.size,(0,0,0,0)); sd=ImageDraw.Draw(shadow)
        box(sd,(4,4,inner.width-4,inner.height-4),INK,INK,30,4)
        im.paste(shadow,(66,463+entrance),shadow)
        im.paste(inner,(54,451+entrance),inner)
        # The buddy cheers from the margin, away from buttons and captions.
        paste_mascot(im,795,1080,82,t,8)
    tag=[tr('映画、行こっ！','MOVIE TIME!'),tr('見つけたっ！','FOUND IT!'),tr('ずら〜り！','TA-DA!'),tr('チケットへGO！','TICKET TIME!'),tr('ポチッ！','SAVED!'),tr('予定にIN！','IT’S A PLAN!'),tr('いっしょに観よう！','LET’S WATCH!'),tr('はまむび！','HAMA MOVIE!')][index]
    sticker(im,62,1091,tag,t,'#fffefa',31,-2)
    return im


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--stills',action='store_true'); args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    staging=ROOT/'.wrangler/site-guide-render'
    staging.mkdir(parents=True,exist_ok=True)
    music=staging/'original-pop.wav'
    if not args.stills: compose(music, len(COPY['ja']['scenes'])*SECONDS)
    for lang,copy in COPY.items():
        scene(lang,0,2).save(OUT/f'how-to-{lang}.webp',quality=88)
        if args.stills:
            for i in range(8): scene(lang,i,3.5).save(Path('/tmp')/f'hama-guide-{lang}-{i}.png')
            continue
        staging=ROOT/'.wrangler/site-guide-render'
        staging.mkdir(parents=True,exist_ok=True)
        rendered=staging/f'how-to-{lang}.mp4'
        command=['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-s',f'{W}x{H}','-pix_fmt','rgb24','-r',str(FPS),'-i','-','-i',str(music),'-map','0:v:0','-map','1:a:0','-c:a','aac','-b:a','160k','-ar','48000','-af','loudnorm=I=-18:TP=-1.5:LRA=7','-shortest','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',str(rendered)]
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
            cues.extend([f'{timestamp(i*SECONDS)} --> {timestamp((i+1)*SECONDS)}',('[軽快なBGM]\n' if lang=='ja' else '[Upbeat music]\n')+s['caption'] if i==0 else s['caption'],''])
        (OUT/f'how-to-{lang}.vtt').write_text('\n'.join(cues))

if __name__=='__main__': main()
