#!/usr/bin/env python3
"""Render mascot bookends and real app captures with captions and narration."""
import argparse
from functools import lru_cache
import json
import math
import os
from pathlib import Path
import subprocess
import unicodedata
from PIL import Image, ImageDraw, ImageFont
from music import compose
from narration import wav_duration

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/guide'
COPY = json.loads((ROOT / 'shared/site-guide.json').read_text())
CAPTURES = Path(__file__).parent / 'captures'
W, H, FPS = 900, 1200, 24
BG, INK, GREEN, MUTED = '#fff8ee', '#25322d', '#159a6b', '#60736a'
# This viewport contains the real screenshot. It is never redrawn as a mock UI.
SCREEN = (34, 127, 866, 987)


def font_path(bold):
    override = os.environ.get('GUIDE_FONT_BOLD' if bold else 'GUIDE_FONT')
    if override:
        return override
    for p in Path('/System/Library/Fonts').glob('*.ttc'):
        if unicodedata.normalize('NFC', p.name) == f'ヒラギノ角ゴシック W{6 if bold else 3}.ttc':
            return str(p)
    raise RuntimeError('Set GUIDE_FONT and GUIDE_FONT_BOLD to Japanese-capable font files.')


@lru_cache(maxsize=64)
def font(size, bold=False):
    return ImageFont.truetype(font_path(bold), size)


def text(draw, xy, value, size=32, fill=INK, bold=False):
    draw.text(xy, value, font=font(size, bold), fill=fill, anchor='lt', spacing=10)


def lines(value, size, width):
    draw = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    result = []
    for paragraph in value.split('\n'):
        words = paragraph.split(' ') if ' ' in paragraph else list(paragraph)
        sep = ' ' if ' ' in paragraph else ''
        line = ''
        for word in words:
            candidate = line + (sep if line else '') + word
            if line and draw.textlength(candidate, font=font(size)) > width:
                result.append(line)
                line = word
            else:
                line = candidate
        result.append(line)
    return result


@lru_cache(maxsize=80)
def screenshot(name):
    return Image.open(CAPTURES / name).convert('RGB')


@lru_cache(maxsize=1)
def mascot():
    result = Image.open(ROOT / 'public/brand/hamamubi-icon-v2-512.png').convert('RGBA')
    result.thumbnail((68, 68))
    return result


@lru_cache(maxsize=2)
def mascot_actor(wink=False):
    name = 'wink' if wink else 'normal'
    return Image.open(Path(__file__).parent / f'mascot/{name}.png').convert('RGBA')


def guide_duration(scenes):
    return sum(spec['duration'] for spec in scenes)


def progress_line(draw, index, t, scenes):
    elapsed = guide_duration(scenes[:index]) + t
    draw.rectangle((0, H-4, int(W*elapsed/guide_duration(scenes)), H), fill=GREEN)


def hop(t, closing):
    """Anticipation, a clear airborne arc, then a short soft landing."""
    jumps = [(0.25, .9, 110, -7), (1.6, .9, 135, 8), (3.05, .9, 95, -6), (4.4, .75, 55, 5)]
    if closing:
        jumps = [(0.25, .9, 110, 8), (1.6, .85, 80, -6)]
    for start, duration, height, lean in jumps:
        p = (t-start)/duration
        if -.16/duration <= p < 0:
            squeeze = math.sin(math.pi*(t-start+.16)/.16)
            return 0, 1+.045*squeeze, 1-.065*squeeze, 0
        if 0 <= p <= 1:
            stretch = math.sin(math.pi*p)
            return 4*height*p*(1-p), 1-.025*stretch, 1+.04*stretch, lean*math.sin(2*math.pi*p)
        if 0 < t-start-duration < .24:
            squeeze = math.sin(math.pi*(t-start-duration)/.24)
            return 0, 1+.075*squeeze, 1-.065*squeeze, 0
    return 0, 1, 1, 0


def sparkle(draw, x, y, radius, color):
    draw.polygon([(x,y-radius),(x+radius*.25,y-radius*.25),(x+radius,y),
                  (x+radius*.25,y+radius*.25),(x,y+radius),(x-radius*.25,y+radius*.25),
                  (x-radius,y),(x-radius*.25,y-radius*.25)], fill=color)


def mascot_scene(lang, index, t, manifest):
    specs = manifest['languages'][lang]
    closing = specs[index]['name'] == 'outro'
    copy = COPY[lang]['scenes'][index]
    im = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(im)
    brand = 'はまむび！' if lang == 'ja' else 'HAMA MOVIE!'
    width = draw.textlength(brand, font=font(27, True))
    text(draw, ((W-width)/2, 61), brand, 27, GREEN, True)
    title = copy['title'].replace('\n', ' ')
    size = 78
    while draw.textlength(title, font=font(size, True)) > 820:
        size -= 1
    width = draw.textlength(title, font=font(size, True))
    text(draw, ((W-width)/2, 158), title, size, INK, True)
    # The original icon stays intact; movement gives it personality without new limbs.
    draw.ellipse((142, 269, 758, 885), fill='#e5f1de')
    height, sx, sy, angle = hop(t, closing)
    wink = closing and t >= 3.05
    if wink:
        angle = -5*ease((t-2.9)/.3)
    shadow_width = 310-height*.7
    shadow_height = 24-height*.08
    shade = round(190+height*.18)
    draw.ellipse((450-shadow_width/2, 868-shadow_height/2,
                  450+shadow_width/2, 868+shadow_height/2), fill=(shade, 215, 192))
    sprite = mascot_actor(wink).resize((round(462*sx), round(462*sy)), Image.Resampling.LANCZOS)
    sprite = sprite.rotate(angle, Image.Resampling.BICUBIC, expand=True)
    # Pivot around the icon's centre so tilting does not shift its baseline.
    center_y = 850-462*sy/2-height
    im.paste(sprite, (round((W-sprite.width)/2), round(center_y-sprite.height/2)), sprite)
    sparkle(draw, 157, 480, 13+4*math.sin(t*3), '#f3b68e')
    sparkle(draw, 750, 372, 18+4*math.sin(t*3+1), '#92c5a6')
    if wink:
        sparkle(draw, 703, 566, 29*ease((t-3.05)/.3), '#e78d62')
    size = 42
    wrapped = lines(copy['caption'], size, 810)
    while len(wrapped) > 3:
        size -= 1
        wrapped = lines(copy['caption'], size, 810)
    for i, line in enumerate(wrapped):
        width = draw.textlength(line, font=font(size))
        text(draw, ((W-width)/2, 970+i*(size+17)), line, size, INK)
    progress_line(draw, index, t, specs)
    return im


def ease(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)


def clipped_focus(frame):
    focus = frame['focus']
    if not focus:
        return None
    x0 = max(0, focus['x'])
    y0 = max(0, focus['y'])
    x1 = min(390, focus['x'] + focus['width'])
    y1 = min(700, focus['y'] + focus['height'])
    return (x0, y0, x1, y1) if x1 > x0 and y1 > y0 else None


def camera(frame, progress, previous=None):
    focus = clipped_focus(frame)
    amount = ease(progress / 0.85)
    from_zoom = previous['zoom'] if previous else 1
    previous_focus = clipped_focus(previous) if previous else None
    from_y = (previous_focus[1] + previous_focus[3]) / 2 if previous_focus else 350
    to_y = (focus[1] + focus[3]) / 2 if focus else 350
    zoom = from_zoom + (frame['zoom'] - from_zoom) * amount
    center_y = from_y + (to_y - from_y) * amount
    scale = (SCREEN[3] - SCREEN[1]) / 700 * zoom
    visible_h = (SCREEN[3] - SCREEN[1]) / scale
    center_y = max(visible_h / 2, min(700 - visible_h / 2, center_y))
    return scale, center_y, focus


def scene(lang, index, t, manifest):
    spec = manifest['languages'][lang][index]
    if spec['kind'] == 'mascot':
        return mascot_scene(lang, index, t, manifest)
    frames = spec['frames']
    active = max(i for i, frame in enumerate(frames) if frame['at'] <= t)
    frame = frames[active]
    elapsed = t - frame['at']
    im = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(im)
    title = COPY[lang]['scenes'][index]['title'].replace('\n', ' ')
    title_size = 39
    while draw.textlength(title, font=font(title_size, True)) > 720:
        title_size -= 1
    icon = mascot()
    im.paste(icon, (34, 25), icon)
    text(draw, (124, 26), 'はまむび！使い方ガイド' if lang == 'ja' else 'HAMA MOVIE! / HOW TO', 18, MUTED, True)
    text(draw, (123, 58), title, title_size, INK, True)
    draw.rounded_rectangle((29, 122, 871, 994), 26, fill='#c4dacf')
    x0, y0, x1, y1 = SCREEN
    sw, sh = x1-x0, y1-y0
    scale, cy, focus = camera(frame, elapsed, frames[active-1] if active else None)
    image = screenshot(frame['image'])
    # Sample the source directly for a crisp animated camera, at capture pixel ratio 2.
    view_w, view_h = sw / scale, sh / scale
    crop = ((195-view_w/2)*2, (cy-view_h/2)*2, (195+view_w/2)*2, (cy+view_h/2)*2)
    panel = image.transform((sw,sh), Image.Transform.EXTENT, crop, Image.Resampling.BICUBIC, fillcolor=BG)
    mask = Image.new('L', (sw,sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0,0,sw,sh),22,fill=255)
    # Draw callouts in video coordinates, preserving the screenshot underneath.
    overlay=Image.new('RGBA',(sw,sh),(0,0,0,0)); od=ImageDraw.Draw(overlay)
    if focus and elapsed > 0.6:
        fx0, fy0, fx1, fy1 = focus
        rect=((fx0-195)*scale+sw/2, (fy0-cy)*scale+sh/2,
              (fx1-195)*scale+sw/2, (fy1-cy)*scale+sh/2)
        # Large areas get a quiet outline; controls receive a tap pulse.
        pad=7
        od.rounded_rectangle((rect[0]-pad,rect[1]-pad,rect[2]+pad,rect[3]+pad),14,
                             outline=(21,154,107,235),width=5)
        if fx1-fx0 < 370 and fy1-fy0 < 140:
            px, py=(rect[0]+rect[2])/2,(rect[1]+rect[3])/2
            pulse=(elapsed-0.6)%1.8
            if pulse < 0.7:
                radius=12+28*pulse
                od.ellipse((px-radius,py-radius,px+radius,py+radius),outline=(237,109,68,int(230*(1-pulse/0.7))),width=5)
    panel=Image.alpha_composite(panel.convert('RGBA'),overlay).convert('RGB')
    im.paste(panel,(x0,y0),mask)
    # Two clear lines of supplementary copy below the screen.
    caption=COPY[lang]['scenes'][index]['caption']
    size=33
    wrapped=lines(caption,size,810)
    while len(wrapped)>3:
        size-=1; wrapped=lines(caption,size,810)
    for i,line in enumerate(wrapped):
        width=draw.textlength(line,font=font(size))
        text(draw,((W-width)/2,1021+i*(size+10)),line,size,INK)
    text(draw,(38,1172),'実画面 / 上映・名前は説明用データ' if lang=='ja' else 'REAL APP / DEMONSTRATION DATA',16,MUTED)
    # Subtle progress line; no scene numbers or duration labels in the UI.
    progress_line(draw, index, t, manifest['languages'][lang])
    return im


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stills',action='store_true')
    parser.add_argument('--narration-dir',type=Path)
    parser.add_argument('--output-dir',type=Path,default=OUT)
    args=parser.parse_args()
    manifest=json.loads((CAPTURES/'manifest.json').read_text())
    for lang,copy in COPY.items():
        if len(copy['scenes']) != len(manifest['languages'][lang]):
            raise ValueError(f'Copy/capture scene count mismatch: {lang}')
        for i,spec in enumerate(manifest['languages'][lang]):
            for frame in spec.get('frames', []):
                if not (CAPTURES/frame['image']).is_file(): raise FileNotFoundError(frame['image'])
            if args.narration_dir and not args.stills:
                clip=args.narration_dir/f'{lang}-{i:02d}.wav'
                if wav_duration(clip.read_bytes())>spec['duration']-0.8:
                    raise ValueError(f'{clip.name} is too long; regenerate at a brisker pace.')
    args.output_dir.mkdir(parents=True,exist_ok=True)
    staging=ROOT/'.wrangler/site-guide-render'; staging.mkdir(parents=True,exist_ok=True)
    duration=guide_duration(manifest['languages']['ja'])
    if any(guide_duration(specs) != duration for specs in manifest['languages'].values()):
        raise ValueError('Language timelines must have the same duration.')
    music=staging/'original-pop.wav'
    if not args.stills: compose(music,duration)
    for lang,copy in COPY.items():
        scene(lang,0,2.05,manifest).save(args.output_dir/f'how-to-{lang}.webp',quality=88)
        if args.stills:
            for i in range(len(copy['scenes'])):
                scene(lang,i,3.2,manifest).save(staging/f'real-{lang}-{i}.png')
            continue
        audio=music
        if args.narration_dir:
            audio=staging/f'narrated-{lang}.wav'; inputs=['-i',str(music)]; filters=[]
            for i, spec in enumerate(manifest['languages'][lang]):
                inputs.extend(['-i',str(args.narration_dir/f'{lang}-{i:02d}.wav')])
                start=guide_duration(manifest['languages'][lang][:i])
                filters.append(f'[{i+1}:a]adelay={int((start+0.4)*1000)}:all=1[voice{i}]')
            filters.append('[0:a]volume=0.18[bgm]')
            voices=''.join(f'[voice{i}]' for i in range(len(copy['scenes'])))
            filters.append(f'[bgm]{voices}amix=inputs={len(copy["scenes"])+1}:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=7[out]')
            subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error',*inputs,'-filter_complex',';'.join(filters),'-map','[out]','-ar','48000','-ac','2',str(audio)],check=True)
        rendered=staging/f'how-to-{lang}.mp4'
        command=['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-s',f'{W}x{H}','-pix_fmt','rgb24','-r',str(FPS),'-i','-','-i',str(audio),'-map','0:v:0','-map','1:a:0','-c:a','aac','-b:a','160k','-ar','48000','-shortest','-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',str(rendered)]
        if not args.narration_dir: command[-1:-1]=['-af','loudnorm=I=-18:TP=-1.5:LRA=7']
        proc=subprocess.Popen(command,stdin=subprocess.PIPE)
        try:
            for i, spec in enumerate(manifest['languages'][lang]):
                for f in range(round(FPS*spec['duration'])):proc.stdin.write(scene(lang,i,f/FPS,manifest).tobytes())
                print(f'{lang}: scene {i+1}/{len(copy["scenes"])}',flush=True)
        finally:proc.stdin.close()
        if proc.wait():raise RuntimeError('ffmpeg failed')
        if rendered.stat().st_size>=25*1024*1024:raise ValueError('Video exceeds Cloudflare Pages limit')
        rendered.replace(args.output_dir/f'how-to-{lang}.mp4')
        def timestamp(seconds):return f'00:{seconds//60:02d}:{seconds%60:02d}.000'
        cues=['WEBVTT','']
        start=0
        for i,s in enumerate(copy['scenes']):
            end=start+manifest['languages'][lang][i]['duration']
            cues.extend([f'{timestamp(start)} --> {timestamp(end)}',s['caption'],''])
            start=end
        (args.output_dir/f'how-to-{lang}.vtt').write_text('\n'.join(cues))

if __name__=='__main__':main()
