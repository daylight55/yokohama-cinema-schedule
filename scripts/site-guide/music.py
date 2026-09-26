"""Original bouncy pop cue: deterministic synthesis, no samples or existing songs.
Composed here for the Hama Movie! guide. Requires NumPy; writes stereo PCM WAV.
"""
from pathlib import Path
import wave
import numpy as np

RATE = 44100
BEAT = 0.5

def compose(path: Path, duration=48):
    rng = np.random.default_rng(5481)
    mix = np.zeros((int(RATE * duration), 2), dtype=np.float64)

    def add(signal, start, level=1.0, pan=0.0):
        offset = int(start * RATE)
        length = min(len(signal), len(mix) - offset)
        if length <= 0 or offset < 0:
            return
        mix[offset:offset+length, 0] += signal[:length] * level * np.sqrt((1-pan)/2)
        mix[offset:offset+length, 1] += signal[:length] * level * np.sqrt((1+pan)/2)

    def note(midi, length=.24, kind='bell'):
        t = np.arange(int(RATE*length)) / RATE
        frequency = 440 * 2 ** ((midi - 69)/12)
        if kind == 'bass':
            sound = np.sin(2*np.pi*frequency*t) + .22*np.sin(4*np.pi*frequency*t)
            envelope = (1-np.exp(-t*180))*np.exp(-t*8)
        elif kind == 'chord':
            sound = np.sin(2*np.pi*frequency*t) + .2*np.sin(4*np.pi*frequency*t)
            envelope = (1-np.exp(-t*220))*np.exp(-t*13)
        else:
            # A woody, cheerful mallet, with soft high harmonics.
            sound = (np.sin(2*np.pi*frequency*t) + .3*np.sin(4*np.pi*frequency*t)*np.exp(-t*15)
                     + .12*np.sin(2*np.pi*frequency*3*t)*np.exp(-t*24))
            envelope = (1-np.exp(-t*350))*np.exp(-t*9)
        # Smooth the tail so even short notes never click.
        envelope *= np.minimum(1, (length-t)/.025)
        return sound * envelope

    # C6 / Am7 / Fmaj7 / G6; the melody is newly composed, not a quote.
    harmony = [[60,64,67,69],[57,60,64,67],[53,57,60,64],[55,59,62,64]]
    melody = [
        [76,79,None,81,79,None,76,74],
        [72,None,76,79,None,76,72,69],
        [69,72,None,76,77,76,None,72],
        [71,None,74,79,76,None,74,71],
        [79,81,None,84,81,79,None,76],
        [76,None,79,76,72,71,69,None],
        [72,76,None,77,76,72,69,None],
        [74,76,79,None,74,71,72,None],
    ]
    for bar in range(int(duration / (4*BEAT))):
        start = bar * 4 * BEAT
        chord = harmony[bar % 4]
        for beat in range(4):
            instant = start + beat*BEAT
            root = chord[0]-12 if beat % 2 == 0 else chord[2]-12
            add(note(root,.36,'bass'),instant,.23)
            if beat % 2:
                for n in chord:
                    add(note(n,.19,'chord'),instant+.028,.085,-.28)
            # Soft kick on the downbeat, hand-clap on the backbeat.
            t=np.arange(int(RATE*.16))/RATE
            if beat % 2 == 0:
                phase = 2*np.pi*(48*t + 48*.025*(1-np.exp(-t/.025)))
                add(np.sin(phase)*np.exp(-t*26),instant,.27)
            else:
                noise=rng.normal(0,1,len(t))
                noise=np.concatenate(([0],np.diff(noise)))
                add(noise*np.exp(-t*42)*(1-np.exp(-t*500)),instant,.035,.12)
            for off in [0,.28]:
                t=np.arange(int(RATE*.055))/RATE
                noise=rng.normal(0,1,len(t))
                add(noise*np.exp(-t*100),instant+off,.014,.4)
        for eighth, midi in enumerate(melody[bar % 8]):
            if midi is None: continue
            at = start + (eighth//2)*BEAT + (0 if eighth%2 == 0 else .28)
            signal=note(midi,.3)
            add(signal,at,.17,.16)
            add(signal,at+.15,.025,-.3)
    # A clear final tonic and a gently decaying finish.
    mix[int((duration-1.0)*RATE):] *= np.linspace(1,0,int(RATE))[:,None]
    for midi in [60,64,67,72]:
        add(note(midi,.8),duration-.85,.105)
    fadein=np.minimum(1,np.arange(len(mix))/(RATE*.06))
    fadeout=np.minimum(1,(len(mix)-1-np.arange(len(mix)))/(RATE*.15))
    mix *= (fadein*fadeout)[:,None]
    peak=np.max(np.abs(mix))
    mix *= .78/max(peak,1e-6)
    with wave.open(str(path),'wb') as out:
        out.setnchannels(2); out.setsampwidth(2); out.setframerate(RATE)
        out.writeframes((mix*32767).astype('<i2').tobytes())
    print(f'Original music: {duration}s, peak {20*np.log10(np.max(np.abs(mix))):.1f} dBFS', flush=True)
