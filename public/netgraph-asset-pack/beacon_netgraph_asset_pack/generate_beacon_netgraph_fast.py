import os, math, random, json, shutil, zipfile, hashlib
from pathlib import Path
from typing import Tuple, List

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SEED = 872133
random.seed(SEED)
ROOT = Path('/mnt/data/beacon_netgraph_asset_pack')
ZIP_PATH = Path('/mnt/data/beacon_netgraph_asset_pack.zip')
ROOT.mkdir(parents=True, exist_ok=True)

PAL = {
    'void': (3, 6, 18),
    'deep_indigo': (12, 18, 48),
    'indigo': (28, 35, 98),
    'cobalt': (25, 78, 180),
    'blue_core': (38, 126, 255),
    'cyan': (0, 218, 255),
    'teal': (0, 255, 205),
    'lilac': (170, 142, 255),
    'magenta': (255, 48, 170),
    'hot_magenta': (255, 31, 112),
    'amber': (255, 176, 80),
    'white_blue': (224, 245, 255),
    'glass': (28, 52, 82),
}

def rgba(c,a=255): return (int(c[0]), int(c[1]), int(c[2]), max(0,min(255,int(a))))
def mix(a,b,t): return tuple(max(0,min(255,int(a[i]*(1-t)+b[i]*t))) for i in range(3))

def ensure(p: Path): p.parent.mkdir(parents=True, exist_ok=True)
ASSETS=[]

def save(img: Image.Image, path: Path, category: str, name: str, variant=None, res=None, alpha=True):
    ensure(path)
    if alpha:
        img = img.convert('RGBA')
    else:
        img = img.convert('RGB')
    img.save(path, 'PNG', compress_level=4)
    ASSETS.append({'name':name,'category':category,'variant':variant,'resolution':res or f'{img.size[0]}x{img.size[1]}','alpha':bool(alpha),'path':str(path.relative_to(ROOT)).replace('\\','/')})

# Work at 512 and upscale to 1024 for performance. Visuals are designed for 64px/32px readability.
BASE = 512
SCALE_OUT = 1024

def sprite_canvas(size=BASE): return Image.new('RGBA',(size,size),(0,0,0,0))
def up1024(img): return img.resize((SCALE_OUT,SCALE_OUT), Image.Resampling.LANCZOS)

def layer_blur(img, draw_fn, blur=8):
    lay=Image.new('RGBA',img.size,(0,0,0,0))
    d=ImageDraw.Draw(lay,'RGBA')
    draw_fn(d)
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(blur)))

def ellipse_glow(img, box, color, a=120, blur=10, fill=True, outline=0, crisp_a=None):
    def fn(d):
        if fill: d.ellipse(box, fill=rgba(color,a))
        else: d.ellipse(box, outline=rgba(color,a), width=max(1,int(outline)))
    layer_blur(img, fn, blur)
    if crisp_a:
        d=ImageDraw.Draw(img,'RGBA')
        if fill: d.ellipse(box, fill=rgba(color,crisp_a))
        else: d.ellipse(box, outline=rgba(color,crisp_a), width=max(1,int(outline//2 or 1)))

def line_glow(img, pts, color, width=3, a=120, blur=8, crisp=True):
    def fn(d): d.line(pts, fill=rgba(color,a), width=max(1,int(width)), joint='curve')
    layer_blur(img, fn, blur)
    if crisp:
        d=ImageDraw.Draw(img,'RGBA')
        d.line(pts, fill=rgba(color,int(a*.70)), width=max(1,int(width*.35)), joint='curve')

def arc_glow(img, box, start, end, color, width=4, a=120, blur=8, crisp=True):
    def fn(d): d.arc(box,start,end,fill=rgba(color,a),width=max(1,int(width)))
    layer_blur(img, fn, blur)
    if crisp:
        d=ImageDraw.Draw(img,'RGBA')
        d.arc(box,start,end,fill=rgba(color,int(a*.65)),width=max(1,int(width*.45)))

def poly_glow(img, pts, color, width=3, a=120, blur=8, fill_a=0):
    def fn(d):
        if fill_a: d.polygon(pts, fill=rgba(color,fill_a))
        d.line(pts+[pts[0]], fill=rgba(color,a), width=max(1,int(width)), joint='curve')
    layer_blur(img, fn, blur)
    d=ImageDraw.Draw(img,'RGBA')
    if fill_a: d.polygon(pts, fill=rgba(color,int(fill_a*.25)))
    d.line(pts+[pts[0]], fill=rgba(color,int(a*.70)), width=max(1,int(width*.38)), joint='curve')

def dot(img,x,y,r,color,a=170,blur=8):
    ellipse_glow(img,(x-r*2,y-r*2,x+r*2,y+r*2),color,a=int(a*.5),blur=blur,fill=True)
    ellipse_glow(img,(x-r,y-r,x+r,y+r),color,a=a,blur=max(1,blur//3),fill=True,crisp_a=int(a*.75))

def orbit(cx,cy,r,deg):
    t=math.radians(deg); return (cx+r*math.cos(t), cy+r*math.sin(t))

def polygon(cx,cy,r,n,rot=0):
    return [(cx+r*math.cos(rot+2*math.pi*i/n),cy+r*math.sin(rot+2*math.pi*i/n)) for i in range(n)]

def draw_orb(img,cx=256,cy=256,r=64,core=PAL['blue_core'],rim=PAL['cyan'],accent=PAL['lilac'],intensity=1.0,shell=True):
    ellipse_glow(img,(cx-r*2.2,cy-r*2.2,cx+r*2.2,cy+r*2.2),rim,a=70*intensity,blur=int(r*.55),fill=True)
    ellipse_glow(img,(cx-r*1.55,cy-r*1.55,cx+r*1.55,cy+r*1.55),accent,a=42*intensity,blur=int(r*.34),fill=True)
    line_glow(img,[(cx-r*2.2,cy),(cx+r*2.2,cy)],rim,width=max(1,r*.05),a=60*intensity,blur=int(r*.18),crisp=False)
    if shell:
        for rad,col,al,w in [(r*1.45,rim,90,3),(r*1.12,accent,60,2),(r*.82,rim,50,2)]:
            ellipse_glow(img,(cx-rad,cy-rad,cx+rad,cy+rad),col,a=al*intensity,blur=5,fill=False,outline=w,crisp_a=al*.45*intensity)
    # luminous core layers
    d=ImageDraw.Draw(img,'RGBA')
    for k in range(6,0,-1):
        t=k/6; rr=r*(.18+.82*t)
        col=mix(core,rim,(1-t)*.4)
        d.ellipse((cx-rr,cy-rr,cx+rr,cy+rr),fill=rgba(col,(18+12*(1-t))*intensity))
    ellipse_glow(img,(cx-r*.38,cy-r*.38,cx+r*.38,cy+r*.38),PAL['white_blue'],a=85*intensity,blur=max(1,int(r*.12)),fill=True)
    ellipse_glow(img,(cx-r*.22,cy-r*.22,cx+r*.22,cy+r*.22),core,a=150*intensity,blur=max(1,int(r*.05)),fill=True,crisp_a=70*intensity)
    ellipse_glow(img,(cx-r*.42,cy-r*.45,cx-r*.12,cy-r*.18),PAL['white_blue'],a=90*intensity,blur=max(1,int(r*.06)),fill=True)

NODE_VARIANTS={
 'default': {'core':PAL['blue_core'],'rim':PAL['cyan'],'accent':PAL['lilac'],'intensity':.90},
 'selected': {'core':PAL['blue_core'],'rim':PAL['lilac'],'accent':PAL['cyan'],'intensity':1.05},
 'active': {'core':PAL['teal'],'rim':PAL['cyan'],'accent':PAL['blue_core'],'intensity':1.18},
 'warning': {'core':PAL['blue_core'],'rim':PAL['hot_magenta'],'accent':PAL['amber'],'intensity':1.12},
}
GEN_VARIANTS={
 'default': {'core':PAL['blue_core'],'rim':PAL['cyan'],'accent':PAL['lilac'],'intensity':.92},
 'soft': {'core':mix(PAL['blue_core'],PAL['lilac'],.25),'rim':mix(PAL['cyan'],PAL['lilac'],.35),'accent':PAL['lilac'],'intensity':.58},
 'active': {'core':PAL['teal'],'rim':PAL['cyan'],'accent':PAL['blue_core'],'intensity':1.20},
 'alert': {'core':PAL['hot_magenta'],'rim':PAL['magenta'],'accent':PAL['amber'],'intensity':1.12},
}
NODE_TYPES=['node_core','node_gateway','node_relay','node_edge','node_storage','node_service','node_sensor','node_user','node_ai','node_external','node_hub','node_data_cluster','node_unknown']

def draw_node_details(img, typ, spec):
    cx=cy=256; rim=spec['rim']; acc=spec['accent']; inten=spec['intensity']
    # universal internal rings
    for rr,a in [(56,72),(38,55),(22,45)]:
        ellipse_glow(img,(cx-rr,cy-rr,cx+rr,cy+rr),rim,a=a*inten,blur=3,fill=False,outline=2,crisp_a=a*.45*inten)
    if typ=='node_core':
        for deg in range(0,360,45): line_glow(img,[orbit(cx,cy,67,deg),orbit(cx,cy,132,deg)],acc if deg%90 else rim,width=3,a=95*inten,blur=6)
        arc_glow(img,(cx-150,cy-150,cx+150,cy+150),16,344,rim,width=4,a=80*inten,blur=9)
    elif typ=='node_gateway':
        poly_glow(img,polygon(cx,cy,125,6,math.radians(30)),rim,width=5,a=120*inten,blur=9,fill_a=10*inten)
        poly_glow(img,polygon(cx,cy,82,6,math.radians(30)),acc,width=3,a=90*inten,blur=6)
        for deg in range(0,360,60): dot(img,*orbit(cx,cy,125,deg),7,acc,a=145*inten,blur=5)
    elif typ=='node_relay':
        for deg in [25,205]:
            p=orbit(cx,cy,128,deg); line_glow(img,[orbit(cx,cy,67,deg),p],rim,width=4,a=95*inten,blur=7); dot(img,*p,14,rim,a=160*inten,blur=8)
        arc_glow(img,(cx-148,cy-93,cx+148,cy+93),-20,198,acc,width=4,a=90*inten,blur=8)
    elif typ=='node_edge':
        for deg in [-35,0,35]:
            p=orbit(cx,cy,132,deg); line_glow(img,[orbit(cx,cy,58,deg),p],rim,width=3,a=86*inten,blur=6); dot(img,*p,5,acc,a=145*inten,blur=5)
        arc_glow(img,(cx-120,cy-104,cx+120,cy+104),295,66,acc,width=6,a=110*inten,blur=8)
    elif typ=='node_storage':
        for off,w,h,al in [(-47,130,34,95),(-14,140,38,105),(22,130,34,100),(55,110,28,72)]:
            ellipse_glow(img,(cx-w/2,cy+off-h/2,cx+w/2,cy+off+h/2),rim if off%2 else acc,a=al*inten,blur=5,fill=False,outline=4,crisp_a=al*.45*inten)
        line_glow(img,[(cx-68,cy-47),(cx-68,cy+55)],rim,width=3,a=46*inten,blur=5)
        line_glow(img,[(cx+68,cy-47),(cx+68,cy+55)],rim,width=3,a=46*inten,blur=5)
    elif typ=='node_service':
        for i in range(12):
            deg=i*30; line_glow(img,[orbit(cx,cy,85,deg),orbit(cx,cy,125 if i%2==0 else 113,deg)],rim if i%2==0 else acc,width=4,a=92*inten,blur=6)
        poly_glow(img,polygon(cx,cy,119,12,math.radians(15)),acc,width=3,a=65*inten,blur=7)
    elif typ=='node_sensor':
        for rad,a in [(92,70),(124,50),(154,34)]:
            arc_glow(img,(cx-rad,cy-rad,cx+rad,cy+rad),220,320,rim,width=3,a=a*inten,blur=7)
            arc_glow(img,(cx-rad,cy-rad,cx+rad,cy+rad),40,140,acc,width=2,a=a*.7*inten,blur=6)
        for deg in [225,270,315]: dot(img,*orbit(cx,cy,120,deg),6,rim,a=140*inten,blur=5)
    elif typ=='node_user':
        dot(img,cx,cy-68,21,acc,a=125*inten,blur=9)
        arc_glow(img,(cx-84,cy-42,cx+84,cy+118),205,335,rim,width=7,a=95*inten,blur=9)
        arc_glow(img,(cx-56,cy-15,cx+56,cy+92),210,330,acc,width=4,a=78*inten,blur=5)
    elif typ=='node_ai':
        pts=[(cx-45,cy-30),(cx-12,cy-58),(cx+38,cy-36),(cx+54,cy+18),(cx+7,cy+47),(cx-48,cy+27),(cx,cy)]
        for i in range(len(pts)):
            for j in range(i+1,len(pts)):
                if (i+j)%3!=0: line_glow(img,[pts[i],pts[j]],acc if (i+j)%2 else rim,width=1.5,a=38*inten,blur=4,crisp=False)
        for i,p in enumerate(pts): dot(img,*p,6 if i<6 else 8,rim if i<6 else acc,a=155*inten,blur=4)
        for deg in [25,145,265]: line_glow(img,[orbit(cx,cy,82,deg),orbit(cx,cy,132,deg+14)],acc,width=3,a=70*inten,blur=6)
    elif typ=='node_external':
        for st,en in [(12,72),(105,168),(205,258),(292,350)]: arc_glow(img,(cx-137,cy-137,cx+137,cy+137),st,en,rim,width=6,a=100*inten,blur=8)
        for deg in [25,155,295]:
            p=orbit(cx,cy,154,deg); dot(img,*p,7,acc,a=145*inten,blur=5); line_glow(img,[orbit(cx,cy,112,deg-5),p],acc,width=3,a=64*inten,blur=5)
    elif typ=='node_hub':
        for deg in range(0,360,30):
            line_glow(img,[orbit(cx,cy,58,deg),orbit(cx,cy,142,deg)],rim if deg%60 else acc,width=3 if deg%60 else 4,a=78*inten,blur=6)
            if deg%60==0: dot(img,*orbit(cx,cy,142,deg),6,acc,a=140*inten,blur=5)
        ellipse_glow(img,(cx-146,cy-146,cx+146,cy+146),rim,a=52*inten,blur=6,fill=False,outline=3,crisp_a=24*inten)
    elif typ=='node_data_cluster':
        pts=[(cx,cy),(cx-54,cy-42),(cx+52,cy-38),(cx-60,cy+35),(cx+45,cy+50),(cx-2,cy-76),(cx+10,cy+78)]
        for i in range(len(pts)):
            for j in range(i+1,len(pts)):
                if abs(i-j) in [1,2,4]: line_glow(img,[pts[i],pts[j]],rim if (i+j)%2 else acc,width=2,a=46*inten,blur=4,crisp=False)
        for i,p in enumerate(pts): dot(img,*p,15 if i else 22,rim if i%2 else acc,a=155*inten,blur=7)
    elif typ=='node_unknown':
        rng=random.Random(SEED+42)
        for i,deg in enumerate([8,45,93,130,177,225,265,318]):
            rr=94+(i%3)*13; p1=orbit(cx,cy,rr,deg); p2=orbit(cx,cy,rr+28,deg+rng.uniform(-10,10))
            line_glow(img,[p1,p2],acc if i%2 else rim,width=4 if i%3==0 else 2,a=(65+i*3)*inten,blur=7)
        for st in [25,115,205,295]: arc_glow(img,(cx-118,cy-118,cx+118,cy+118),st,st+35,acc,width=4,a=74*inten,blur=6)

def make_node(typ, variant):
    img=sprite_canvas(); spec=NODE_VARIANTS[variant]
    size_adj={'node_edge':.78,'node_user':.84,'node_data_cluster':.70,'node_hub':.82,'node_sensor':.83,'node_relay':.86}.get(typ,.92)
    draw_orb(img,256,256,int(74*size_adj),spec['core'],spec['rim'],spec['accent'],spec['intensity'])
    draw_node_details(img,typ,spec)
    ellipse_glow(img,(206,206,306,306),spec['rim'],a=95*spec['intensity'],blur=2,fill=False,outline=3,crisp_a=85*spec['intensity'])
    if variant=='selected': ellipse_glow(img,(86,86,426,426),PAL['lilac'],a=86,blur=11,fill=False,outline=5,crisp_a=40)
    if variant=='active':
        for deg in [0,90,180,270]: line_glow(img,[orbit(256,256,104,deg),orbit(256,256,168,deg)],PAL['cyan'],width=3,a=92,blur=7)
    if variant=='warning':
        for deg in [45,135,225,315]: arc_glow(img,(96,96,416,416),deg-18,deg+18,PAL['hot_magenta'],width=5,a=115,blur=8)
    return up1024(img)

# Packets/trails/comets
packet_assets=[]
for base in ['packet_standard','packet_priority']:
    for sz in ['small','medium','large']: packet_assets.append(f'{base}_{sz}')
packet_assets += ['packet_encrypted','packet_corrupted_glow']
trail_assets=['trail_short','trail_medium','trail_long','trail_curved','trail_spiral']
comet_assets=['comet_fast','comet_data','comet_beacon']

def make_packet(asset, variant):
    spec=GEN_VARIANTS[variant]; img=sprite_canvas(); rim=spec['rim']; acc=spec['accent']; core=spec['core']; inten=spec['intensity']
    cx,cy=284,256
    if asset.endswith('_small'): r,tail=13,82
    elif asset.endswith('_medium'): r,tail=24,128
    elif asset.endswith('_large'): r,tail=36,170
    else: r,tail=29,145
    tail_col=acc if ('priority' in asset or 'corrupted' in asset) else rim
    for k in range(5): line_glow(img,[(cx-tail,cy+(k-2)*r*.22),(cx-r*.35,cy-(k-2)*r*.05)],tail_col,width=max(1,r*.22+k*.2),a=(78-k*8)*inten,blur=12+k*2,crisp=False)
    line_glow(img,[(cx-tail*.7,cy),(cx+r*2.1,cy)],rim,width=max(1,r*.10),a=95*inten,blur=6,crisp=True)
    draw_orb(img,cx,cy,r,core,rim,acc,inten*1.05,shell=('priority' in asset or 'encrypted' in asset or 'corrupted' in asset))
    if 'priority' in asset: poly_glow(img,[(cx-r*1.55,cy-r*.75),(cx-r*.45,cy),(cx-r*1.55,cy+r*.75)],acc,width=3,a=105*inten,blur=6)
    if 'encrypted' in asset:
        poly_glow(img,polygon(cx,cy,r*1.65,6,math.radians(30)),rim,width=4,a=125*inten,blur=6)
        for deg in range(0,360,60): line_glow(img,[orbit(cx,cy,r*.65,deg+20),orbit(cx,cy,r*1.22,deg+40)],acc,width=2,a=70*inten,blur=3)
    if 'corrupted' in asset:
        rng=random.Random(SEED+len(asset)+len(variant))
        for _ in range(18):
            x1=cx+rng.uniform(-r*3,r*1.5); y1=cy+rng.uniform(-r*1.6,r*1.6); x2=x1+rng.uniform(8,32); y2=y1+rng.uniform(-16,16)
            line_glow(img,[(x1,y1),(x2,y2)],PAL['hot_magenta'] if rng.random()<.7 else PAL['amber'],width=rng.uniform(1,2.5),a=rng.uniform(38,92)*inten,blur=rng.uniform(2,7),crisp=False)
    return up1024(img)

def bezier(points, steps=70):
    p=[np.array(x,dtype=float) for x in points]
    out=[]
    for i in range(steps):
        t=i/(steps-1); q=(1-t)**3*p[0]+3*(1-t)**2*t*p[1]+3*(1-t)*t*t*p[2]+t**3*p[3]
        out.append(tuple(q))
    return out

def make_trail(asset, variant):
    spec=GEN_VARIANTS[variant]; img=sprite_canvas(); rim=spec['rim']; acc=spec['accent']; inten=spec['intensity']
    if asset=='trail_short': pts=[(160,256),(352,256)]
    elif asset=='trail_medium': pts=[(100,256),(410,256)]
    elif asset=='trail_long': pts=[(40,256),(472,256)]
    elif asset=='trail_curved': pts=bezier([(60,310),(160,165),(340,345),(462,225)],90)
    else:
        pts=[]; cx,cy=260,262
        for i in range(125):
            t=i/124; a=.4+t*math.pi*4.2; r=(22+190*t)
            pts.append((cx+r*math.cos(a),cy+r*math.sin(a)*.55))
    for width,a,blur in [(18,45,18),(9,80,10),(4,120,5),(1.6,200,2)]: line_glow(img,pts,rim,width=width,a=a*inten,blur=blur,crisp=width<5)
    sub=pts[int(len(pts)*.55):] if len(pts)>5 else pts
    line_glow(img,sub,acc,width=2.5,a=110*inten,blur=5,crisp=True)
    dot(img,*pts[-1],6,acc,a=160*inten,blur=6)
    return up1024(img)

def make_comet(asset, variant):
    spec=GEN_VARIANTS[variant]; img=sprite_canvas(); core=spec['core']; rim=spec['rim']; acc=spec['accent']; inten=spec['intensity']
    if asset=='comet_fast': cx,cy,tail,r=352,250,320,18
    elif asset=='comet_data': cx,cy,tail,r=346,262,285,22
    else: cx,cy,tail,r=305,252,215,28
    for i in range(9):
        t=i/8; yoff=(i-4)*r*.16
        line_glow(img,[(cx-tail*(1-.08*t),cy+yoff),(cx-r*.35,cy-yoff*.08)], rim if i%2==0 else acc, width=max(1,r*(.30-.018*i)), a=(100*(1-t)+18)*inten, blur=max(2,12-i), crisp=False)
    if asset=='comet_data':
        for k in range(6): dot(img,cx-tail*(.22+.11*k),cy+math.sin(k*1.2)*9,4,acc if k%2 else rim,a=110*inten,blur=4)
    if asset=='comet_beacon':
        for rad,a in [(62,76),(102,45),(140,28)]: ellipse_glow(img,(cx-rad,cy-rad,cx+rad,cy+rad),acc,a=a*inten,blur=7,fill=False,outline=3,crisp_a=a*.35*inten)
    draw_orb(img,cx,cy,r,core,rim,acc,inten*1.1,shell=True)
    return up1024(img)

AMBIENT_ASSETS=['edge_beam_solid','edge_beam_fuzzy','halo_focus','focus_pulse','scan_grid_overlay','star_drift_layer','dust_sheet_soft']

def make_ambient(asset, variant):
    spec=GEN_VARIANTS[variant]; img=sprite_canvas(); rim=spec['rim']; acc=spec['accent']; inten=spec['intensity']; cx=cy=256
    if asset=='edge_beam_solid':
        for w,a,b in [(13,50,16),(6,90,7),(2,180,2)]: line_glow(img,[(40,256),(472,256)],rim,width=w,a=a*inten,blur=b,crisp=w<4)
        dot(img,256,256,8,acc,a=150*inten,blur=6)
    elif asset=='edge_beam_fuzzy':
        rng=random.Random(SEED+55+len(variant))
        for _ in range(12):
            y=256+rng.uniform(-20,20); line_glow(img,[(35,y),(475,y+rng.uniform(-8,8))], rim if rng.random()<.7 else acc, width=rng.uniform(1,4), a=rng.uniform(24,62)*inten, blur=rng.uniform(6,22), crisp=False)
    elif asset=='halo_focus':
        for rad,a,w in [(130,85,5),(92,60,3),(165,35,3)]: ellipse_glow(img,(cx-rad,cy-rad,cx+rad,cy+rad),rim,a=a*inten,blur=8,fill=False,outline=w,crisp_a=a*.4*inten)
        for deg in [0,90,180,270]: line_glow(img,[orbit(cx,cy,112,deg),orbit(cx,cy,165,deg)],acc,width=3,a=85*inten,blur=5)
    elif asset=='focus_pulse':
        for rad,a in [(50,88),(100,62),(155,40),(210,22)]: ellipse_glow(img,(cx-rad,cy-rad,cx+rad,cy+rad),acc if rad==100 else rim,a=a*inten,blur=9,fill=False,outline=4,crisp_a=a*.32*inten)
        dot(img,cx,cy,10,rim,a=125*inten,blur=7)
    elif asset=='scan_grid_overlay':
        d=ImageDraw.Draw(img,'RGBA')
        for i in range(0,513,32):
            a=(32 if i%128 else 55)*inten
            d.line([(i,0),(i,512)],fill=rgba(rim,a),width=1 if i%128 else 2)
            d.line([(0,i),(512,i)],fill=rgba(rim,a),width=1 if i%128 else 2)
    elif asset=='star_drift_layer':
        rng=random.Random(SEED+777+len(variant)); d=ImageDraw.Draw(img,'RGBA')
        for _ in range(190):
            x=rng.randrange(512); y=rng.randrange(512); r=1 if rng.random()<.9 else 2; col=PAL['white_blue'] if rng.random()<.55 else (rim if rng.random()<.8 else acc)
            d.ellipse((x-r,y-r,x+r,y+r),fill=rgba(col,rng.uniform(18,95)*inten))
    elif asset=='dust_sheet_soft':
        small=Image.new('RGBA',(128,128),(0,0,0,0)); sd=ImageDraw.Draw(small,'RGBA'); rng=random.Random(SEED+129)
        for _ in range(34):
            x=rng.uniform(-20,148); y=rng.uniform(30,100); rx=rng.uniform(18,52); ry=rng.uniform(4,18); col=rim if rng.random()<.6 else acc
            sd.ellipse((x-rx,y-ry,x+rx,y+ry),fill=rgba(col,rng.uniform(4,16)*inten))
        small=small.filter(ImageFilter.GaussianBlur(8)).resize((512,512),Image.Resampling.BICUBIC)
        img.alpha_composite(small)
        line_glow(img,[(30,310),(480,205)],acc,width=2,a=22*inten,blur=24,crisp=False)
    return up1024(img)

UI_ASSETS=['panel_glass_floating','button_primary_glow','button_secondary_soft','badge_status_ok','badge_status_warn','badge_status_error','divider_fiber_glow','corner_rim_frame','microgrid_tiling_texture']

def rr_glow(img, box, radius, color, fill, a=85, blur=10, width=2):
    def fn(d): d.rounded_rectangle(box,radius=radius,fill=fill,outline=rgba(color,a),width=width)
    layer_blur(img,fn,blur)
    d=ImageDraw.Draw(img,'RGBA'); d.rounded_rectangle(box,radius=radius,fill=fill,outline=rgba(color,a*.75),width=max(1,width//2))

def make_ui(asset, variant):
    spec=GEN_VARIANTS[variant]; img=sprite_canvas(); rim=spec['rim']; acc=spec['accent']; core=spec['core']; inten=spec['intensity']
    if asset=='panel_glass_floating':
        rr_glow(img,(60,92,452,420),24,rim,rgba(PAL['deep_indigo'],54),a=75*inten,blur=11,width=3)
        line_glow(img,[(90,120),(412,118)],PAL['white_blue'],width=1.5,a=40*inten,blur=8,crisp=False)
        line_glow(img,[(84,390),(430,380)],acc,width=2,a=34*inten,blur=14,crisp=False)
        rng=random.Random(SEED+3); d=ImageDraw.Draw(img,'RGBA')
        for _ in range(55): d.point((rng.randint(78,435),rng.randint(110,400)),fill=rgba(rim,rng.uniform(8,28)*inten))
    elif asset=='button_primary_glow':
        rr_glow(img,(98,200,414,312),38,rim,rgba(mix(PAL['deep_indigo'],core,.25),86),a=110*inten,blur=14,width=4)
        line_glow(img,[(130,256),(380,256)],acc,width=5,a=55*inten,blur=16,crisp=False)
    elif asset=='button_secondary_soft':
        rr_glow(img,(112,210,400,302),32,mix(rim,PAL['lilac'],.35),rgba(PAL['deep_indigo'],42),a=70*inten,blur=10,width=3)
        line_glow(img,[(136,256),(376,256)],rim,width=2.5,a=35*inten,blur=12,crisp=False)
    elif asset.startswith('badge_status'):
        if asset.endswith('ok'): c,a2=PAL['teal'],PAL['cyan']
        elif asset.endswith('warn'): c,a2=PAL['amber'],PAL['magenta']
        else: c,a2=PAL['hot_magenta'],PAL['amber']
        ellipse_glow(img,(156,156,356,356),c,a=105*inten,blur=16,fill=True)
        ellipse_glow(img,(174,174,338,338),a2,a=72*inten,blur=8,fill=False,outline=7,crisp_a=55*inten)
        ellipse_glow(img,(202,202,310,310),PAL['white_blue'],a=65*inten,blur=9,fill=True)
        if asset.endswith('ok'): line_glow(img,[(207,260),(242,292),(315,215)],PAL['white_blue'],width=10,a=140*inten,blur=5)
        elif asset.endswith('warn'):
            poly_glow(img,polygon(256,256,76,3,-math.pi/2),c,width=6,a=125*inten,blur=7,fill_a=14)
            line_glow(img,[(256,215),(256,274)],PAL['white_blue'],width=7,a=110*inten,blur=4); dot(img,256,301,5,PAL['white_blue'],a=135*inten,blur=3)
        else:
            line_glow(img,[(215,215),(298,298)],PAL['white_blue'],width=11,a=140*inten,blur=5)
            line_glow(img,[(298,215),(215,298)],PAL['white_blue'],width=11,a=140*inten,blur=5)
    elif asset=='divider_fiber_glow':
        for y,a,w,b in [(256,110,2,6),(249,38,1,10),(264,34,1,12)]: line_glow(img,[(40,y),(472,y)],rim,width=w,a=a*inten,blur=b)
        for x in [92,256,420]: dot(img,x,256,4,acc,a=120*inten,blur=4)
    elif asset=='corner_rim_frame':
        L=122; pad=72
        seg=[((pad,pad),(pad+L,pad)),((pad,pad),(pad,pad+L)),((512-pad,pad),(512-pad-L,pad)),((512-pad,pad),(512-pad,pad+L)),((pad,512-pad),(pad+L,512-pad)),((pad,512-pad),(pad,512-pad-L)),((512-pad,512-pad),(512-pad-L,512-pad)),((512-pad,512-pad),(512-pad,512-pad-L))]
        for a,b in seg: line_glow(img,[a,b],rim,width=4,a=100*inten,blur=8); line_glow(img,[a,b],acc,width=1,a=85*inten,blur=2)
        for p in [(pad,pad),(512-pad,pad),(pad,512-pad),(512-pad,512-pad)]: dot(img,*p,5,acc,a=130*inten,blur=5)
    elif asset=='microgrid_tiling_texture':
        d=ImageDraw.Draw(img,'RGBA')
        for i in range(0,512,16):
            a=(20 if i%64 else 38)*inten
            d.line([(i,0),(i,512)],fill=rgba(rim,a),width=1); d.line([(0,i),(512,i)],fill=rgba(rim,a),width=1)
        for x in range(0,512,64):
            for y in range(0,512,64): d.ellipse((x-1,y-1,x+1,y+1),fill=rgba(acc,42*inten))
    return up1024(img)

# Background generation fallback if first script timed out before backgrounds exist.
BACKGROUND_ASSETS=['bg_nebula_drift_core','bg_nebula_spiral_field','bg_dark_matter_grid','bg_deep_space_particles']

def simple_background(name, size):
    w,h=size; rng=np.random.default_rng(SEED+len(name)+w)
    yy,xx=np.mgrid[0:h,0:w]; x=xx/w; y=yy/h
    arr=np.zeros((h,w,3),dtype=np.float32); arr[:]=np.array(PAL['void'])
    arr+=np.array(PAL['deep_indigo'])*(0.4+0.4*(1-y))[:,:,None]
    def blob(bx,by,sx,sy,col,amp):
        g=np.exp(-(((x-bx)/sx)**2+((y-by)/sy)**2)); return np.array(col)*(amp*g)[:,:,None]
    if name=='bg_nebula_spiral_field':
        arr+=blob(.50,.50,.22,.16,PAL['lilac'],.5)+blob(.50,.50,.10,.08,PAL['magenta'],.45)+blob(.42,.48,.15,.06,PAL['cyan'],.38)
    elif name=='bg_dark_matter_grid':
        arr+=blob(.48,.47,.30,.22,PAL['cobalt'],.28)+blob(.72,.30,.22,.16,PAL['cyan'],.16)
    elif name=='bg_deep_space_particles':
        arr+=blob(.35,.63,.24,.14,PAL['cobalt'],.24)+blob(.70,.35,.22,.14,PAL['lilac'],.18)
    else:
        arr+=blob(.34,.50,.20,.12,PAL['cyan'],.65)+blob(.42,.45,.18,.09,PAL['lilac'],.42)+blob(.30,.55,.10,.08,PAL['magenta'],.32)
    noise=rng.normal(0,3,(h,w,1)); arr+=noise
    arr=np.clip(arr,0,255).astype(np.uint8)
    img=Image.fromarray(arr,'RGB').convert('RGBA')
    d=ImageDraw.Draw(img,'RGBA'); rr=random.Random(SEED+hash(name)%1000+w)
    if name=='bg_dark_matter_grid':
        for i in range(0,w,96): d.line([(i,0),(i,h)],fill=rgba(PAL['cyan'],20),width=1)
        for j in range(0,h,96): d.line([(0,j),(w,j)],fill=rgba(PAL['cyan'],20),width=1)
        pts=[(rr.randint(w//8,w*7//8),rr.randint(h//5,h*4//5)) for _ in range(28)]
        for i in range(len(pts)):
            for j in range(i+1,len(pts)):
                if rr.random()<.05: d.line([pts[i],pts[j]],fill=rgba(PAL['cyan'],36),width=1)
        for p in pts: d.ellipse((p[0]-3,p[1]-3,p[0]+3,p[1]+3),fill=rgba(PAL['cyan'],120))
    if name=='bg_nebula_spiral_field':
        cx,cy=w*.5,h*.5
        for arm in range(4):
            pts=[]
            for i in range(180):
                t=i/179; a=t*math.pi*4.4+arm*math.pi/2; r=(.035+.48*t)*min(w,h)
                pts.append((cx+r*math.cos(a),cy+r*math.sin(a)*.62))
            d.line(pts,fill=rgba(PAL['cyan'] if arm%2==0 else PAL['magenta'],42),width=max(2,int(min(w,h)*.008)),joint='curve')
    # stars
    for _ in range(int(w*h/3400)):
        x0=rr.randrange(w); y0=rr.randrange(h); r=1 if rr.random()<.92 else 2
        col=PAL['white_blue'] if rr.random()<.68 else (PAL['cyan'] if rr.random()<.7 else PAL['lilac'])
        d.ellipse((x0-r,y0-r,x0+r,y0+r),fill=rgba(col,rr.randint(55,185)))
    # vignette
    vig=Image.new('RGBA',(w,h),(0,0,0,0)); vd=ImageDraw.Draw(vig,'RGBA')
    maxr=math.sqrt((w/2)**2+(h/2)**2)
    # draw coarse concentric rectangles? skip expensive; use numpy alpha
    yy,xx=np.mgrid[0:h,0:w]; dist=np.sqrt((xx-w/2)**2+(yy-h/2)**2)/maxr; a=np.clip((dist-.35)/.65,0,1)*145
    v=np.zeros((h,w,4),dtype=np.uint8); v[...,0:3]=np.array(PAL['void']); v[...,3]=a.astype(np.uint8)
    img.alpha_composite(Image.fromarray(v,'RGBA'))
    return img.convert('RGB')

print('Completing Beacon NetGraph pack with fast renderer...')
# background index/recreate only if missing
for size_name,size in [('2560x1440',(2560,1440)),('1920x1080',(1920,1080))]:
    for bg in BACKGROUND_ASSETS:
        path=ROOT/'backgrounds'/size_name/f'{bg}.png'
        if not path.exists(): save(simple_background(bg,size),path,'backgrounds',bg,res=size_name,alpha=False)
        else: ASSETS.append({'name':bg,'category':'backgrounds','variant':None,'resolution':size_name,'alpha':False,'path':str(path.relative_to(ROOT)).replace('\\','/')})

# overwrite nodes with fast consistent versions
for node in NODE_TYPES:
    for variant in NODE_VARIANTS:
        save(make_node(node,variant), ROOT/'nodes'/variant/f'{node}.png','nodes',node,variant=variant,res='1024x1024',alpha=True)

for variant in GEN_VARIANTS:
    for asset in packet_assets:
        save(make_packet(asset,variant), ROOT/'packets_trails_comets'/'1024'/variant/f'{asset}.png','packets_trails_comets',asset,variant=variant,res='1024x1024',alpha=True)
    for asset in trail_assets:
        save(make_trail(asset,variant), ROOT/'packets_trails_comets'/'1024'/variant/f'{asset}.png','packets_trails_comets',asset,variant=variant,res='1024x1024',alpha=True)
    for asset in comet_assets:
        save(make_comet(asset,variant), ROOT/'packets_trails_comets'/'1024'/variant/f'{asset}.png','packets_trails_comets',asset,variant=variant,res='1024x1024',alpha=True)

# 2048 defaults by upscaling 1024 defaults
for asset in packet_assets+trail_assets+comet_assets:
    src=ROOT/'packets_trails_comets'/'1024'/'default'/f'{asset}.png'
    img=Image.open(src).convert('RGBA').resize((2048,2048),Image.Resampling.LANCZOS)
    save(img, ROOT/'packets_trails_comets'/'2048'/'default'/f'{asset}.png','packets_trails_comets',asset,variant='default_desktop_2048',res='2048x2048',alpha=True)

for variant in GEN_VARIANTS:
    for asset in AMBIENT_ASSETS:
        save(make_ambient(asset,variant), ROOT/'ambient'/variant/f'{asset}.png','ambient',asset,variant=variant,res='1024x1024',alpha=True)
    for asset in UI_ASSETS:
        save(make_ui(asset,variant), ROOT/'ui'/variant/f'{asset}.png','ui',asset,variant=variant,res='1024x1024',alpha=True)

# preview sheet with no labels/text
pre=Image.new('RGB',(8*174+18,7*174+18),PAL['void']); pd=ImageDraw.Draw(pre,'RGBA'); rr=random.Random(SEED+888)
for _ in range(250): pd.point((rr.randrange(pre.size[0]),rr.randrange(pre.size[1])),fill=rgba(PAL['cyan'] if rr.random()<.6 else PAL['lilac'],rr.randint(20,75)))
sel=[]
for bg in BACKGROUND_ASSETS: sel.append(ROOT/'backgrounds'/'1920x1080'/f'{bg}.png')
for n in NODE_TYPES[:13]: sel.append(ROOT/'nodes'/'default'/f'{n}.png')
for a in packet_assets[:8]+trail_assets+comet_assets+AMBIENT_ASSETS[:4]+UI_ASSETS: 
    p=ROOT/'packets_trails_comets'/'1024'/'default'/f'{a}.png'
    if not p.exists(): p=ROOT/'ambient'/'default'/f'{a}.png'
    if not p.exists(): p=ROOT/'ui'/'default'/f'{a}.png'
    sel.append(p)
for idx,p in enumerate(sel[:56]):
    im=Image.open(p).convert('RGBA'); im.thumbnail((150,150),Image.Resampling.LANCZOS)
    x=18+(idx%8)*174; y=18+(idx//8)*174
    tile=Image.new('RGBA',(150,150),rgba(PAL['deep_indigo'],65)); td=ImageDraw.Draw(tile,'RGBA'); td.rounded_rectangle((0,0,149,149),radius=12,outline=rgba(PAL['cyan'],50),width=1)
    tile.alpha_composite(im,((150-im.size[0])//2,(150-im.size[1])//2))
    pre.paste(tile.convert('RGB'),(x,y))
save(pre, ROOT/'previews'/'beacon_netgraph_preview_sheet.png','previews','beacon_netgraph_preview_sheet',res=f'{pre.size[0]}x{pre.size[1]}',alpha=False)
orig=Path('/mnt/data/a_collection_of_sci_fi_user_interface_assets_title.png')
if orig.exists():
    shutil.copy2(orig, ROOT/'previews'/'image_gen_reference_sheet_not_runtime_asset.png')
    ASSETS.append({'name':'image_gen_reference_sheet_not_runtime_asset','category':'previews','variant':None,'resolution':'1024x1536','alpha':False,'path':'previews/image_gen_reference_sheet_not_runtime_asset.png','note':'Original image-generation preview sheet; contains text and is not a runtime asset.'})

palette_lines='\n'.join([f'| `{k}` | `#{v[0]:02X}{v[1]:02X}{v[2]:02X}` |' for k,v in PAL.items()])
style=f'''# Beacon NetGraph Asset Pack — Style Sheet

Generated pack seed family: `{SEED}`  
Runtime target: Web/WebGL/Canvas, desktop overlays, dashboards, maps, control panels, alerts, onboarding, and general sci-fi UI scenes.

## Visual language

- Hyper-detailed cosmic sci-fi and neural-network atmosphere.
- Lighting is consistent across the pack: cyan rim from upper-left/front, blue core emission from center, controlled magenta/lilac reactive light from rear/right.
- Assets are designed as emissive sprites with soft procedural glow rather than harsh outlines.
- Transparent runtime sprites use straight RGBA alpha. For WebGL pipelines, convert to premultiplied alpha or enable premultiplied blending at upload time.
- Opaque backgrounds are RGB PNGs.
- No runtime image contains text, logos, or watermarks. The `previews/` folder is non-runtime only.

## Palette

| Token | Hex |
|---|---:|
{palette_lines}

Recommended CSS variables:

```css
:root {{
  --beacon-void: #030612;
  --beacon-deep-indigo: #0C1230;
  --beacon-indigo: #1C2362;
  --beacon-cobalt: #194EB4;
  --beacon-blue-core: #267EFF;
  --beacon-cyan: #00DAFF;
  --beacon-teal: #00FFCD;
  --beacon-lilac: #AA8EFF;
  --beacon-magenta: #FF30AA;
  --beacon-alert: #FF1F70;
  --beacon-amber: #FFB050;
}}
```

## Glow / bloom ranges

Use additive or screen-like blend for packets, trails, edge beams, halos, focus pulses, star drift, and dust sheets.

| Variant | Suggested opacity | Suggested blend | Usage |
|---|---:|---|---|
| `default` | 0.72–0.92 | `screen` / additive | normal graph state |
| `soft` | 0.28–0.60 | `screen` | background ambience, low-priority overlays |
| `active` | 0.90–1.00 | additive | active packet motion, hover, live updates |
| `alert` | 0.82–1.00 | additive with clamp | warning/error/attention states |
| node `selected` | 0.95–1.00 | source-over + mild bloom | selected/focused node |
| node `warning` | 0.85–1.00 | additive magenta/amber accents | degraded/unknown/error states |

Bloom pass recommendations:

- Threshold: `0.55–0.72`
- Radius: `6–18 px` at 1080p
- Intensity: `0.18–0.42` for dashboards, `0.35–0.65` for cinematic scenes
- Clamp highlights before UI text is composited so overlays remain readable.

## Normal / light assumptions

These assets do not ship normal maps. They are painted as emissive, glassy, volumetric sprites.

- Key/rim light: cyan, upper-left/front, approximately 30° elevation.
- Fill: deep indigo/blue from lower center.
- Reactive/back light: lilac/magenta from upper-right/rear.
- Core emission: blue/cyan, centered, with soft radial falloff.
- Dust/lens streaks: horizontal or slightly diagonal, alpha-soft.

## Small-display readability

Node silhouettes use a strong central luminous core and distinct outer geometry so identity remains visible at 64px and survives at 32px. Suggested implementation:

- Use mipmaps for all node and packet sprites.
- Prefer nearest higher-resolution source when scaling below 64px.
- Draw selected/active halos outside the sprite bounds when possible, or use the supplied `halo_focus` / `focus_pulse` extras.
- Keep labels/text composited separately above node sprites; do not bake labels into the assets.

## Folder conventions

- `backgrounds/2560x1440/` and `backgrounds/1920x1080/`: opaque scene backdrops.
- `nodes/<variant>/`: 1024x1024 transparent node sprites. Variants are `default`, `selected`, `active`, `warning`.
- `packets_trails_comets/1024/<variant>/`: 1024x1024 transparent motion sprites. Variants are `default`, `soft`, `active`, `alert`.
- `packets_trails_comets/2048/default/`: optional 2048x2048 default desktop sprites.
- `ambient/<variant>/`: edge beams, overlays, grid, halo, pulse, star and dust layers.
- `ui/<variant>/`: reusable glass panel, buttons, badges, dividers, rim frame, microgrid texture.
- `previews/`: non-runtime visual contact/reference sheets.

## Consumption notes

- Use `source-over` for glass panels/buttons/badges.
- Use additive/screen blending for trails, packets, comets, beams, halos, dust, and star drift.
- Backgrounds are safe as full-screen covers. They are not seamless.
- `microgrid_tiling_texture` and `scan_grid_overlay` are power-of-two and tile-friendly.
- `ASSET_INDEX.json` is the canonical manifest for automated loading.
'''
(ROOT/'STYLE_SHEET.md').write_text(style,encoding='utf-8')
readme=f'''# Beacon NetGraph Asset Pack

Generated production handoff bundle for **Beacon NetGraph** with a unified cosmic sci-fi / neural-network visual language.

## Contents

- 4 backgrounds in 2560x1440 and 1920x1080
- 13 NetGraph node types × 4 variants = 52 transparent node sprites
- Packet, trail, and comet sprites in 1024x1024 with default/soft/active/alert variants
- Optional 2048x2048 default desktop versions for packet/trail/comet sprites
- Ambient cinematic extras for beams, halos, focus pulses, scan grids, star drift, and dust sheets
- Generic reusable Beacon UI assets for panels, buttons, status badges, dividers, corner frames, and microgrid overlays
- `STYLE_SHEET.md` for palette, glow, blend, and lighting assumptions
- `ASSET_INDEX.json` for loader integration

Runtime folders contain no text, logos, or watermarks. `previews/` is for human review only.
'''
(ROOT/'README.md').write_text(readme,encoding='utf-8')

# hashes and manifest
for rec in ASSETS:
    p=ROOT/rec['path']
    if p.exists(): rec['sha256']=hashlib.sha256(p.read_bytes()).hexdigest()
manifest={'pack':'Beacon NetGraph Asset Pack','seed_family':SEED,'asset_count':len([r for r in ASSETS if r['category']!='previews']),'total_file_count_indexed':len(ASSETS),'assets':ASSETS}
(ROOT/'ASSET_INDEX.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
# include script
shutil.copy2(Path(__file__),ROOT/'generate_beacon_netgraph_fast.py')

# zip
if ZIP_PATH.exists(): ZIP_PATH.unlink()
with zipfile.ZipFile(ZIP_PATH,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in ROOT.rglob('*'):
        if p.is_file(): z.write(p,p.relative_to(ROOT.parent))
print(json.dumps({'zip':str(ZIP_PATH),'zip_mb':round(ZIP_PATH.stat().st_size/1024/1024,2),'runtime_assets':manifest['asset_count'],'indexed_files':manifest['total_file_count_indexed'],'folder':str(ROOT)},indent=2))
