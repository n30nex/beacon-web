import os, math, random, json, shutil, zipfile, textwrap, hashlib
from pathlib import Path
from typing import Tuple, List, Dict

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops

SEED = 872133  # Beacon NetGraph seed family
random.seed(SEED)
np.random.seed(SEED)

ROOT = Path('/mnt/data/beacon_netgraph_asset_pack')
ZIP_PATH = Path('/mnt/data/beacon_netgraph_asset_pack.zip')
if ROOT.exists():
    shutil.rmtree(ROOT)
ROOT.mkdir(parents=True, exist_ok=True)

# ---------- Palette ----------
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

def rgba(rgb, a=255):
    return (int(rgb[0]), int(rgb[1]), int(rgb[2]), int(a))

def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(v)))

def mix(c1, c2, t):
    return tuple(clamp(c1[i]*(1-t)+c2[i]*t) for i in range(3))

def ensure_dir(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)

ASSET_INDEX = []

def save_image(img: Image.Image, path: Path, category: str, name: str, variant: str=None, resolution: str=None, alpha: bool=True):
    ensure_dir(path)
    if alpha:
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
    else:
        if img.mode != 'RGB':
            img = img.convert('RGB')
    # PNG optimize can be slow on huge noisy backgrounds; use sane compression.
    img.save(path, 'PNG', compress_level=6)
    ASSET_INDEX.append({
        'name': name,
        'category': category,
        'variant': variant,
        'resolution': resolution or f'{img.size[0]}x{img.size[1]}',
        'alpha': bool(alpha),
        'path': str(path.relative_to(ROOT)).replace('\\', '/'),
    })

# ---------- Drawing primitives ----------

def alpha_composite(dst, src):
    dst.alpha_composite(src)


def glow_ellipse(img: Image.Image, box, color, alpha=170, blur=32, fill=False, outline_width=0, crisp_alpha=None):
    overlay = Image.new('RGBA', img.size, (0,0,0,0))
    d = ImageDraw.Draw(overlay)
    if fill:
        d.ellipse(box, fill=rgba(color, alpha))
    elif outline_width > 0:
        d.ellipse(box, outline=rgba(color, alpha), width=outline_width)
    else:
        d.ellipse(box, fill=rgba(color, alpha))
    if blur > 0:
        img.alpha_composite(overlay.filter(ImageFilter.GaussianBlur(blur)))
    else:
        img.alpha_composite(overlay)
    if crisp_alpha is not None:
        crisp = Image.new('RGBA', img.size, (0,0,0,0))
        cd = ImageDraw.Draw(crisp)
        if fill:
            cd.ellipse(box, fill=rgba(color, crisp_alpha))
        elif outline_width > 0:
            cd.ellipse(box, outline=rgba(color, crisp_alpha), width=max(1, outline_width//2))
        img.alpha_composite(crisp)


def glow_line(img: Image.Image, pts: List[Tuple[float,float]], color, width=6, alpha=180, blur=16, joint='curve', crisp=True):
    if len(pts) < 2:
        return
    overlay = Image.new('RGBA', img.size, (0,0,0,0))
    d = ImageDraw.Draw(overlay)
    d.line(pts, fill=rgba(color, alpha), width=width, joint=joint)
    if blur > 0:
        img.alpha_composite(overlay.filter(ImageFilter.GaussianBlur(blur)))
    if crisp:
        crisp_img = Image.new('RGBA', img.size, (0,0,0,0))
        cd = ImageDraw.Draw(crisp_img)
        cd.line(pts, fill=rgba(color, min(255, int(alpha*0.75))), width=max(1, width//3), joint=joint)
        img.alpha_composite(crisp_img)


def glow_arc(img: Image.Image, box, start, end, color, width=6, alpha=170, blur=14, crisp=True):
    overlay = Image.new('RGBA', img.size, (0,0,0,0))
    d = ImageDraw.Draw(overlay)
    d.arc(box, start=start, end=end, fill=rgba(color, alpha), width=width)
    if blur > 0:
        img.alpha_composite(overlay.filter(ImageFilter.GaussianBlur(blur)))
    if crisp:
        crisp_img = Image.new('RGBA', img.size, (0,0,0,0))
        cd = ImageDraw.Draw(crisp_img)
        cd.arc(box, start=start, end=end, fill=rgba(color, min(255, int(alpha*0.65))), width=max(1, width//3))
        img.alpha_composite(crisp_img)


def regular_polygon(cx, cy, r, n, rot=0):
    return [(cx + r*math.cos(rot + 2*math.pi*i/n), cy + r*math.sin(rot + 2*math.pi*i/n)) for i in range(n)]


def draw_glow_polygon(img, pts, color, alpha=170, blur=18, width=6, fill_alpha=0):
    overlay = Image.new('RGBA', img.size, (0,0,0,0))
    d = ImageDraw.Draw(overlay)
    if fill_alpha:
        d.polygon(pts, fill=rgba(color, fill_alpha))
    d.line(pts + [pts[0]], fill=rgba(color, alpha), width=width, joint='curve')
    img.alpha_composite(overlay.filter(ImageFilter.GaussianBlur(blur)))
    crisp = Image.new('RGBA', img.size, (0,0,0,0))
    cd = ImageDraw.Draw(crisp)
    if fill_alpha:
        cd.polygon(pts, fill=rgba(color, max(1, int(fill_alpha*0.3))))
    cd.line(pts + [pts[0]], fill=rgba(color, min(255, int(alpha*0.7))), width=max(1, width//3), joint='curve')
    img.alpha_composite(crisp)


def draw_radial_orb(img: Image.Image, center=(512,512), radius=140, core=None, rim=None, accent=None, intensity=1.0, shell=True, label_seed=0):
    cx, cy = center
    if core is None: core = PAL['blue_core']
    if rim is None: rim = PAL['cyan']
    if accent is None: accent = PAL['lilac']
    # outer soft halo
    glow_ellipse(img, (cx-radius*2.45, cy-radius*2.45, cx+radius*2.45, cy+radius*2.45), rim, alpha=int(70*intensity), blur=int(radius*0.55), fill=True)
    glow_ellipse(img, (cx-radius*1.65, cy-radius*1.65, cx+radius*1.65, cy+radius*1.65), accent, alpha=int(50*intensity), blur=int(radius*0.40), fill=True)
    # anisotropic streaks
    glow_line(img, [(cx-radius*2.3, cy+radius*0.02), (cx+radius*2.3, cy-radius*0.02)], rim, width=int(5*intensity)+2, alpha=int(70*intensity), blur=int(radius*0.20), crisp=False)
    glow_line(img, [(cx-radius*1.4, cy-radius*0.55), (cx+radius*1.4, cy+radius*0.55)], accent, width=max(2,int(3*intensity)), alpha=int(38*intensity), blur=int(radius*0.18), crisp=False)
    # shell rings
    if shell:
        for k, off in enumerate([1.55, 1.28, 1.02]):
            col = rim if k != 1 else accent
            glow_ellipse(img, (cx-radius*off, cy-radius*off, cx+radius*off, cy+radius*off), col, alpha=int((90-k*22)*intensity), blur=10+k*4, outline_width=max(2, int(radius*0.035)), crisp_alpha=int((90-k*18)*intensity))
    # core fill gradient via layered ellipses
    layers = 18
    for i in range(layers, 0, -1):
        t = i/layers
        rr = radius * (0.12 + 0.90*t)
        col = mix(core, rim, (1-t)*0.35)
        a = int((18 + 18*(1-t)) * intensity)
        if i < 6:
            a = int((42 + 24*(1-t))*intensity)
        overlay = Image.new('RGBA', img.size, (0,0,0,0))
        d = ImageDraw.Draw(overlay)
        d.ellipse((cx-rr, cy-rr, cx+rr, cy+rr), fill=rgba(col, a))
        img.alpha_composite(overlay)
    # bright inner core
    glow_ellipse(img, (cx-radius*0.42, cy-radius*0.42, cx+radius*0.42, cy+radius*0.42), PAL['white_blue'], alpha=int(105*intensity), blur=int(radius*0.18), fill=True, crisp_alpha=int(50*intensity))
    glow_ellipse(img, (cx-radius*0.27, cy-radius*0.27, cx+radius*0.27, cy+radius*0.27), core, alpha=int(180*intensity), blur=int(radius*0.08), fill=True, crisp_alpha=int(70*intensity))
    # highlight
    hx, hy = cx-radius*0.28, cy-radius*0.35
    glow_ellipse(img, (hx-radius*0.13, hy-radius*0.08, hx+radius*0.18, hy+radius*0.12), PAL['white_blue'], alpha=int(120*intensity), blur=int(radius*0.07), fill=True)
    # depth shadow crescent
    overlay = Image.new('RGBA', img.size, (0,0,0,0))
    d = ImageDraw.Draw(overlay)
    d.arc((cx-radius*0.86, cy-radius*0.78, cx+radius*0.90, cy+radius*0.92), 30, 190, fill=rgba(PAL['cyan'], int(44*intensity)), width=max(2, int(radius*0.035)))
    img.alpha_composite(overlay.filter(ImageFilter.GaussianBlur(max(1,int(radius*0.03)))))


def draw_small_dot(img, x, y, r, color, alpha=190, blur=12, core=True):
    glow_ellipse(img, (x-r*2.0, y-r*2.0, x+r*2.0, y+r*2.0), color, alpha=int(alpha*0.45), blur=blur, fill=True)
    glow_ellipse(img, (x-r, y-r, x+r, y+r), color, alpha=alpha, blur=max(1, blur//3), fill=True, crisp_alpha=alpha if core else None)

# ---------- Variants ----------
NODE_VARIANTS = {
    'default': {'core': PAL['blue_core'], 'rim': PAL['cyan'], 'accent': PAL['lilac'], 'intensity': 0.90},
    'selected': {'core': PAL['blue_core'], 'rim': PAL['lilac'], 'accent': PAL['cyan'], 'intensity': 1.05},
    'active': {'core': PAL['teal'], 'rim': PAL['cyan'], 'accent': PAL['blue_core'], 'intensity': 1.18},
    'warning': {'core': PAL['blue_core'], 'rim': PAL['hot_magenta'], 'accent': PAL['amber'], 'intensity': 1.12},
}
GEN_VARIANTS = {
    'default': {'core': PAL['blue_core'], 'rim': PAL['cyan'], 'accent': PAL['lilac'], 'intensity': 0.92},
    'soft': {'core': mix(PAL['blue_core'], PAL['lilac'], .25), 'rim': mix(PAL['cyan'], PAL['lilac'], .35), 'accent': PAL['lilac'], 'intensity': 0.58},
    'active': {'core': PAL['teal'], 'rim': PAL['cyan'], 'accent': PAL['blue_core'], 'intensity': 1.20},
    'alert': {'core': PAL['hot_magenta'], 'rim': PAL['magenta'], 'accent': PAL['amber'], 'intensity': 1.12},
}

# ---------- Nodes ----------
NODE_TYPES = [
    'node_core', 'node_gateway', 'node_relay', 'node_edge', 'node_storage', 'node_service', 'node_sensor',
    'node_user', 'node_ai', 'node_external', 'node_hub', 'node_data_cluster', 'node_unknown'
]


def orbit_point(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r*math.cos(a), cy + r*math.sin(a)


def draw_node_type_details(img, node_type, spec):
    cx=cy=512
    core, rim, accent, intensity = spec['core'], spec['rim'], spec['accent'], spec['intensity']
    # shared internal rings
    for rad, a in [(112, 82), (78, 70), (44, 65)]:
        glow_ellipse(img, (cx-rad, cy-rad, cx+rad, cy+rad), rim, alpha=int(a*intensity), blur=6, outline_width=3, crisp_alpha=int(a*0.55*intensity))
    # type-specific layer
    if node_type == 'node_core':
        for deg in range(0, 360, 45):
            p1 = orbit_point(cx, cy, 128, deg)
            p2 = orbit_point(cx, cy, 220, deg)
            glow_line(img, [p1, p2], accent if deg % 90 else rim, width=5, alpha=int(95*intensity), blur=10)
        for rad, col in [(235, rim), (280, accent)]:
            glow_arc(img, (cx-rad, cy-rad, cx+rad, cy+rad), 18, 342, col, width=6, alpha=int(90*intensity), blur=18)

    elif node_type == 'node_gateway':
        draw_glow_polygon(img, regular_polygon(cx, cy, 248, 6, math.radians(30)), rim, alpha=int(130*intensity), blur=18, width=9, fill_alpha=int(14*intensity))
        draw_glow_polygon(img, regular_polygon(cx, cy, 165, 6, math.radians(30)), accent, alpha=int(95*intensity), blur=12, width=6, fill_alpha=0)
        for deg in [0, 60, 120, 180, 240, 300]:
            p = orbit_point(cx, cy, 248, deg)
            draw_small_dot(img, p[0], p[1], 16, accent, alpha=int(170*intensity), blur=12)

    elif node_type == 'node_relay':
        for deg in [25, 205]:
            p = orbit_point(cx, cy, 252, deg)
            draw_small_dot(img, p[0], p[1], 34, rim, alpha=int(180*intensity), blur=18)
            glow_line(img, [orbit_point(cx,cy,140,deg), p], rim, width=7, alpha=int(100*intensity), blur=14)
        glow_arc(img, (cx-295, cy-190, cx+295, cy+190), -20, 198, accent, width=8, alpha=int(105*intensity), blur=20)
        glow_arc(img, (cx-285, cy-230, cx+285, cy+230), 170, 350, rim, width=6, alpha=int(85*intensity), blur=15)

    elif node_type == 'node_edge':
        # compact edge node with directional crescent and three terminal pips
        for deg in [-35, 0, 35]:
            p1 = orbit_point(cx, cy, 120, deg)
            p2 = orbit_point(cx, cy, 260, deg)
            glow_line(img, [p1, p2], rim, width=5, alpha=int(95*intensity), blur=12)
            draw_small_dot(img, p2[0], p2[1], 12, accent, alpha=int(170*intensity), blur=10)
        glow_arc(img, (cx-245, cy-210, cx+245, cy+210), 295, 66, accent, width=12, alpha=int(125*intensity), blur=18)

    elif node_type == 'node_storage':
        # crystalline database-like stacked ellipses, abstract no text
        for off, w, h, al in [(-96, 260, 70, 95), (-30, 280, 76, 110), (42, 260, 70, 100), (108, 220, 58, 80)]:
            box=(cx-w/2, cy+off-h/2, cx+w/2, cy+off+h/2)
            glow_ellipse(img, box, rim if off%2==0 else accent, alpha=int(al*intensity), blur=12, outline_width=7, crisp_alpha=int(al*0.55*intensity))
        glow_line(img, [(cx-140, cy-96), (cx-140, cy+108)], rim, width=6, alpha=int(60*intensity), blur=12)
        glow_line(img, [(cx+140, cy-96), (cx+140, cy+108)], rim, width=6, alpha=int(60*intensity), blur=12)

    elif node_type == 'node_service':
        # soft gear/spoke shell
        for i in range(12):
            deg = i*30
            p1 = orbit_point(cx, cy, 175, deg)
            p2 = orbit_point(cx, cy, 250 if i%2==0 else 225, deg)
            glow_line(img, [p1, p2], rim if i%2==0 else accent, width=8, alpha=int(105*intensity), blur=13)
        draw_glow_polygon(img, regular_polygon(cx, cy, 238, 12, math.radians(15)), accent, alpha=int(75*intensity), blur=15, width=5)

    elif node_type == 'node_sensor':
        # antenna/wave arcs and sensor pips
        for rad, a in [(190, 80), (245, 58), (300, 44)]:
            glow_arc(img, (cx-rad, cy-rad, cx+rad, cy+rad), 220, 320, rim, width=6, alpha=int(a*intensity), blur=16)
            glow_arc(img, (cx-rad, cy-rad, cx+rad, cy+rad), 40, 140, accent, width=4, alpha=int(a*.7*intensity), blur=14)
        for deg in [225, 270, 315]:
            p = orbit_point(cx, cy, 240, deg)
            draw_small_dot(img, p[0], p[1], 13, rim, alpha=int(155*intensity), blur=10)

    elif node_type == 'node_user':
        # human-adjacent abstract: halo head + lower shield crescent, no literal face/text
        draw_small_dot(img, cx, cy-132, 50, accent, alpha=int(135*intensity), blur=22)
        glow_arc(img, (cx-175, cy-80, cx+175, cy+250), 205, 335, rim, width=14, alpha=int(100*intensity), blur=20)
        glow_arc(img, (cx-118, cy-25, cx+118, cy+190), 210, 330, accent, width=8, alpha=int(95*intensity), blur=12)

    elif node_type == 'node_ai':
        # neural constellation inside/around core
        neural = [(cx-90,cy-60),(cx-25,cy-118),(cx+70,cy-70),(cx+105,cy+35),(cx+12,cy+92),(cx-95,cy+55),(cx,cy)]
        for i in range(len(neural)):
            for j in range(i+1, len(neural)):
                if (i*j + j) % 3 != 0:
                    glow_line(img, [neural[i], neural[j]], accent if (i+j)%2 else rim, width=3, alpha=int(38*intensity), blur=8, crisp=False)
        for p in neural:
            draw_small_dot(img, p[0], p[1], 13 if p!=(cx,cy) else 17, rim if p!=(cx,cy) else accent, alpha=int(170*intensity), blur=8)
        for deg in [25, 145, 265]:
            p1 = orbit_point(cx,cy,170,deg)
            p2 = orbit_point(cx,cy,260,deg+14)
            glow_line(img, [p1,p2], accent, width=5, alpha=int(75*intensity), blur=12)

    elif node_type == 'node_external':
        # offset portal, broken outer ring and outward connection pips
        for start,end in [(12,72),(105,168),(205,258),(292,350)]:
            glow_arc(img, (cx-270,cy-270,cx+270,cy+270), start,end, rim, width=12, alpha=int(105*intensity), blur=18)
        for deg in [25, 155, 295]:
            p = orbit_point(cx,cy,305,deg)
            draw_small_dot(img, p[0], p[1], 16, accent, alpha=int(160*intensity), blur=11)
            glow_line(img, [orbit_point(cx,cy,220,deg-5), p], accent, width=5, alpha=int(70*intensity), blur=12)

    elif node_type == 'node_hub':
        # many spokes and satellites, readable hub silhouette
        for deg in range(0,360,30):
            p1 = orbit_point(cx,cy,115,deg)
            p2 = orbit_point(cx,cy,282,deg)
            glow_line(img, [p1,p2], rim if deg%60 else accent, width=5 if deg%60 else 7, alpha=int(86*intensity), blur=13)
            if deg % 60 == 0:
                draw_small_dot(img, p2[0], p2[1], 15, accent, alpha=int(165*intensity), blur=10)
        glow_ellipse(img, (cx-290,cy-290,cx+290,cy+290), rim, alpha=int(58*intensity), blur=16, outline_width=5, crisp_alpha=int(35*intensity))

    elif node_type == 'node_data_cluster':
        cluster = [(cx,cy),(cx-105,cy-80),(cx+102,cy-72),(cx-120,cy+72),(cx+90,cy+98),(cx-5,cy-150),(cx+15,cy+155)]
        for i in range(len(cluster)):
            for j in range(i+1,len(cluster)):
                if abs(i-j) in [1,2,4]:
                    glow_line(img, [cluster[i], cluster[j]], rim if (i+j)%2 else accent, width=4, alpha=int(52*intensity), blur=9, crisp=False)
        for i,p in enumerate(cluster):
            draw_small_dot(img, p[0], p[1], 31 if i else 44, rim if i%2 else accent, alpha=int(170*intensity), blur=15)
        glow_arc(img, (cx-276,cy-246,cx+276,cy+246), 20, 320, rim, width=5, alpha=int(55*intensity), blur=14)

    elif node_type == 'node_unknown':
        # irregular fragments around a simple core
        for i,deg in enumerate([8,45,93,130,177,225,265,318]):
            rr = 190 + (i%3)*26
            p1 = orbit_point(cx,cy,rr,deg)
            p2 = orbit_point(cx,cy,rr+55,deg+random.uniform(-10,10))
            glow_line(img, [p1,p2], accent if i%2 else rim, width=7 if i%3==0 else 4, alpha=int((72+i*4)*intensity), blur=15)
        for start in [25, 115, 205, 295]:
            glow_arc(img, (cx-235,cy-235,cx+235,cy+235), start, start+35, accent, width=8, alpha=int(80*intensity), blur=13)


def make_node(node_type: str, variant: str) -> Image.Image:
    spec = NODE_VARIANTS[variant]
    img = Image.new('RGBA', (1024,1024), (0,0,0,0))
    # Universal shadow/depth/halo footprint, transparent.
    cx=cy=512
    # blue core orb slightly varied by type size
    size_adjust = {
        'node_edge': .78, 'node_user': .86, 'node_data_cluster': .70, 'node_external': .88, 'node_hub': .82,
        'node_sensor': .83, 'node_relay': .86
    }.get(node_type, .92)
    draw_radial_orb(img, center=(cx,cy), radius=int(148*size_adjust), core=spec['core'], rim=spec['rim'], accent=spec['accent'], intensity=spec['intensity'], shell=True)
    draw_node_type_details(img, node_type, spec)
    # readable silhouette guard: central crisp rim
    glow_ellipse(img, (cx-100, cy-100, cx+100, cy+100), spec['rim'], alpha=int(110*spec['intensity']), blur=4, outline_width=5, crisp_alpha=int(95*spec['intensity']))
    # variant-specific focus pulses
    if variant == 'selected':
        glow_ellipse(img, (cx-338, cy-338, cx+338, cy+338), PAL['lilac'], alpha=100, blur=22, outline_width=10, crisp_alpha=60)
    elif variant == 'active':
        for deg in [0,90,180,270]:
            glow_line(img, [orbit_point(cx,cy,208,deg), orbit_point(cx,cy,335,deg)], PAL['cyan'], width=6, alpha=98, blur=15)
    elif variant == 'warning':
        for deg in [45,135,225,315]:
            glow_arc(img, (cx-312,cy-312,cx+312,cy+312), deg-18, deg+18, PAL['hot_magenta'], width=10, alpha=130, blur=18)
    return img

# ---------- Packets, trails, comets ----------

def make_packet(asset: str, variant: str, size_px: int=1024) -> Image.Image:
    spec = GEN_VARIANTS[variant]
    core, rim, accent, intensity = spec['core'], spec['rim'], spec['accent'], spec['intensity']
    img = Image.new('RGBA', (size_px,size_px), (0,0,0,0))
    s = size_px/1024
    cx, cy = int(560*s), int(512*s)
    # size keyword
    if asset.endswith('_small'):
        r = 28*s
        tail = 170*s
    elif asset.endswith('_medium'):
        r = 48*s
        tail = 250*s
    elif asset.endswith('_large'):
        r = 74*s
        tail = 340*s
    else:
        r = 60*s
        tail = 295*s
    # tail behind core
    tail_col = accent if 'priority' in asset or 'corrupted' in asset else rim
    for k in range(5):
        yoff = (k-2)*r*0.20
        width = max(2, int((r*0.33 + k)*intensity))
        alpha = int((95 - k*10)*intensity)
        glow_line(img, [(cx-tail, cy+yoff), (cx-r*0.45, cy-yoff*0.15)], tail_col, width=width, alpha=alpha, blur=int((26+k*4)*s), crisp=False)
    # direction streak
    glow_line(img, [(cx-tail*0.7, cy), (cx+r*2.1, cy)], rim, width=max(2,int(r*0.10)), alpha=int(105*intensity), blur=int(12*s), crisp=True)
    # packet body
    draw_radial_orb(img, center=(cx,cy), radius=int(r), core=core, rim=rim, accent=accent, intensity=intensity, shell=('priority' in asset or 'encrypted' in asset or 'corrupted' in asset))
    if 'priority' in asset:
        # chevron aura, no UI chrome text
        pts = [(cx-r*1.4,cy-r*0.75),(cx-r*0.45,cy),(cx-r*1.4,cy+r*0.75)]
        draw_glow_polygon(img, pts, accent, alpha=int(110*intensity), blur=int(12*s), width=max(2,int(5*s)))
    if 'encrypted' in asset:
        draw_glow_polygon(img, regular_polygon(cx,cy,r*1.65,6,math.radians(30)), rim, alpha=int(130*intensity), blur=int(13*s), width=max(2,int(7*s)))
        for deg in range(0,360,60):
            p1=orbit_point(cx,cy,r*0.65,deg+20)
            p2=orbit_point(cx,cy,r*1.22,deg+40)
            glow_line(img,[p1,p2],accent,width=max(1,int(3*s)),alpha=int(75*intensity),blur=int(5*s),crisp=True)
    if 'corrupted' in asset:
        rng = random.Random(SEED + size_px + hash(asset+variant)%10000)
        for _ in range(26):
            x1 = cx + rng.uniform(-r*3,r*1.5)
            y1 = cy + rng.uniform(-r*1.6,r*1.6)
            x2 = x1 + rng.uniform(12*s,60*s)
            y2 = y1 + rng.uniform(-30*s,30*s)
            glow_line(img,[(x1,y1),(x2,y2)], PAL['hot_magenta'] if rng.random()<.7 else PAL['amber'], width=max(1,int(rng.uniform(1,4)*s)), alpha=int(rng.uniform(45,105)*intensity), blur=int(rng.uniform(4,12)*s), crisp=False)
    return img


def curve_points(points, steps=80):
    # cubic Bezier through first four points, fallback polyline
    if len(points) < 4:
        return points
    p0,p1,p2,p3 = [np.array(p,dtype=float) for p in points[:4]]
    out=[]
    for i in range(steps):
        t=i/(steps-1)
        p=(1-t)**3*p0 + 3*(1-t)**2*t*p1 + 3*(1-t)*t**2*p2 + t**3*p3
        out.append((float(p[0]),float(p[1])))
    return out


def make_trail(asset: str, variant: str, size_px: int=1024) -> Image.Image:
    spec = GEN_VARIANTS[variant]
    rim, accent, intensity = spec['rim'], spec['accent'], spec['intensity']
    img = Image.new('RGBA', (size_px,size_px),(0,0,0,0))
    s=size_px/1024
    if asset == 'trail_short':
        pts=[(315*s,512*s),(705*s,512*s)]
    elif asset == 'trail_medium':
        pts=[(205*s,512*s),(820*s,512*s)]
    elif asset == 'trail_long':
        pts=[(80*s,512*s),(940*s,512*s)]
    elif asset == 'trail_curved':
        pts=curve_points([(120*s,620*s),(325*s,340*s),(670*s,685*s),(925*s,450*s)],100)
    elif asset == 'trail_spiral':
        pts=[]
        cx,cy=520*s,525*s
        for i in range(170):
            t=i/169
            a=0.4 + t*math.pi*4.35
            r=(45+380*t)*s
            pts.append((cx+r*math.cos(a),cy+r*math.sin(a)*0.55))
    else:
        pts=[(120*s,512*s),(905*s,512*s)]
    # broad glow and alpha-soft tail
    for width,alpha,blur in [(34,50,38),(18,85,22),(8,130,10),(3,210,4)]:
        glow_line(img, pts, rim, width=max(1,int(width*s)), alpha=int(alpha*intensity), blur=int(blur*s), crisp=(width<10))
    # accent core forward highlight
    if len(pts) > 5:
        sub=pts[int(len(pts)*0.55):]
        glow_line(img, sub, accent, width=max(1,int(5*s)), alpha=int(120*intensity), blur=int(12*s), crisp=True)
        # endpoint spark
        ex,ey=pts[-1]
        draw_small_dot(img, ex, ey, 12*s, accent, alpha=int(180*intensity), blur=int(14*s))
    return img


def make_comet(asset: str, variant: str, size_px: int=1024) -> Image.Image:
    spec = GEN_VARIANTS[variant]
    core,rim,accent,intensity=spec['core'],spec['rim'],spec['accent'],spec['intensity']
    img=Image.new('RGBA',(size_px,size_px),(0,0,0,0))
    s=size_px/1024
    if asset=='comet_fast':
        cx,cy=705*s,500*s; tail=650*s; r=38*s
        angle=-5
    elif asset=='comet_data':
        cx,cy=690*s,525*s; tail=575*s; r=46*s
        angle=0
    else: # beacon
        cx,cy=600*s,505*s; tail=430*s; r=58*s
        angle=8
    # comet tail tapered via multiple lines offset
    for i in range(9):
        t=i/8
        yoff=(i-4)*r*0.15
        alpha=int((110*(1-t)+20)*intensity)
        width=max(1,int((r*(0.38-0.025*i))*s))
        color=rim if i%2==0 else accent
        glow_line(img, [(cx-tail*(1-0.08*t), cy+yoff), (cx-r*0.35, cy-yoff*0.08)], color, width=width, alpha=alpha, blur=int((24-1.3*i)*s), crisp=False)
    if asset=='comet_data':
        for k in range(6):
            x = cx-tail*(0.22+0.11*k)
            y = cy + math.sin(k*1.2)*18*s
            draw_small_dot(img,x,y,8*s, accent if k%2 else rim, alpha=int(125*intensity), blur=int(8*s), core=False)
    if asset=='comet_beacon':
        for rad,a in [(125,80),(205,50),(285,33)]:
            glow_ellipse(img,(cx-rad*s,cy-rad*s,cx+rad*s,cy+rad*s),accent,alpha=int(a*intensity),blur=int(15*s),outline_width=max(1,int(5*s)),crisp_alpha=int(a*.45*intensity))
    draw_radial_orb(img,center=(int(cx),int(cy)),radius=int(r),core=core,rim=rim,accent=accent,intensity=intensity*1.1,shell=True)
    return img

# ---------- Ambient ----------
AMBIENT_ASSETS = ['edge_beam_solid','edge_beam_fuzzy','halo_focus','focus_pulse','scan_grid_overlay','star_drift_layer','dust_sheet_soft']

def make_ambient(asset: str, variant: str) -> Image.Image:
    spec=GEN_VARIANTS[variant]
    rim,accent,intensity=spec['rim'],spec['accent'],spec['intensity']
    img=Image.new('RGBA',(1024,1024),(0,0,0,0))
    cx=cy=512
    if asset=='edge_beam_solid':
        for width,alpha,blur in [(24,50,30),(12,90,14),(4,180,3)]:
            glow_line(img,[(80,512),(944,512)],rim,width=width,alpha=int(alpha*intensity),blur=blur,crisp=(width<6))
        draw_small_dot(img,512,512,18,accent,alpha=int(160*intensity),blur=14)
    elif asset=='edge_beam_fuzzy':
        rng=random.Random(SEED+55)
        for _ in range(18):
            y=512+rng.uniform(-34,34)
            glow_line(img,[(70,y),(950,y+rng.uniform(-14,14))], rim if rng.random()<.7 else accent, width=rng.randint(2,8), alpha=int(rng.uniform(26,70)*intensity), blur=rng.randint(12,42), crisp=False)
        glow_line(img,[(120,512),(905,512)],rim,width=3,alpha=int(105*intensity),blur=8)
    elif asset=='halo_focus':
        for rad,a,w in [(260,95,10),(185,65,5),(330,40,6)]:
            glow_ellipse(img,(cx-rad,cy-rad,cx+rad,cy+rad),rim,alpha=int(a*intensity),blur=18,outline_width=w,crisp_alpha=int(a*.48*intensity))
        for deg in [0,90,180,270]:
            glow_line(img,[orbit_point(cx,cy,228,deg),orbit_point(cx,cy,330,deg)],accent,width=5,alpha=int(95*intensity),blur=12)
    elif asset=='focus_pulse':
        for rad,a in [(100,95),(200,70),(310,44),(420,25)]:
            glow_ellipse(img,(cx-rad,cy-rad,cx+rad,cy+rad),accent if rad==200 else rim,alpha=int(a*intensity),blur=22,outline_width=8,crisp_alpha=int(a*.35*intensity))
        draw_small_dot(img,cx,cy,24,rim,alpha=int(135*intensity),blur=18)
    elif asset=='scan_grid_overlay':
        d=ImageDraw.Draw(img)
        # Tile-safe grid: lines align at power-of-two intervals
        for i in range(0,1025,64):
            a=34 if i%256 else 58
            d.line([(i,0),(i,1024)],fill=rgba(rim,int(a*intensity)),width=1 if i%256 else 2)
            d.line([(0,i),(1024,i)],fill=rgba(rim,int(a*intensity)),width=1 if i%256 else 2)
        for i in range(0,1024,256):
            glow_line(img,[(i,0),(i,1024)],accent,width=2,alpha=int(35*intensity),blur=8,crisp=False)
    elif asset=='star_drift_layer':
        rng=random.Random(SEED+variant.__hash__()%1000+999)
        d=ImageDraw.Draw(img)
        for _ in range(300):
            x=rng.randrange(0,1024); y=rng.randrange(0,1024)
            a=int(rng.uniform(20,105)*intensity)
            r=1 if rng.random()<.86 else rng.choice([2,3])
            col=PAL['white_blue'] if rng.random()<.55 else (rim if rng.random()<.8 else accent)
            d.ellipse((x-r,y-r,x+r,y+r),fill=rgba(col,a))
        for _ in range(20):
            x=rng.randrange(80,950); y=rng.randrange(80,950)
            glow_line(img,[(x-24,y),(x+24,y+rng.uniform(-3,3))],rim,width=1,alpha=int(28*intensity),blur=5,crisp=False)
    elif asset=='dust_sheet_soft':
        low=Image.new('RGBA',(256,256),(0,0,0,0))
        rng=random.Random(SEED+128)
        ld=ImageDraw.Draw(low)
        for _ in range(55):
            x=rng.uniform(-40,296); y=rng.uniform(60,210)
            rx=rng.uniform(30,90); ry=rng.uniform(8,32)
            col=rim if rng.random()<.6 else accent
            ld.ellipse((x-rx,y-ry,x+rx,y+ry),fill=rgba(col,int(rng.uniform(5,18)*intensity)))
        low=low.filter(ImageFilter.GaussianBlur(14)).resize((1024,1024),Image.Resampling.BICUBIC)
        img.alpha_composite(low)
        glow_line(img,[(60,620),(960,410)],accent,width=4,alpha=int(24*intensity),blur=55,crisp=False)
    return img

# ---------- UI assets ----------
UI_ASSETS = [
    'panel_glass_floating','button_primary_glow','button_secondary_soft',
    'badge_status_ok','badge_status_warn','badge_status_error',
    'divider_fiber_glow','corner_rim_frame','microgrid_tiling_texture'
]

def rounded_rect_glow(img, box, radius, color, fill, alpha=110, blur=20, width=4):
    overlay=Image.new('RGBA',img.size,(0,0,0,0))
    d=ImageDraw.Draw(overlay)
    d.rounded_rectangle(box,radius=radius,fill=fill,outline=rgba(color,alpha),width=width)
    img.alpha_composite(overlay.filter(ImageFilter.GaussianBlur(blur)))
    crisp=Image.new('RGBA',img.size,(0,0,0,0))
    cd=ImageDraw.Draw(crisp)
    cd.rounded_rectangle(box,radius=radius,fill=fill,outline=rgba(color,min(255,int(alpha*.85))),width=max(1,width//2))
    img.alpha_composite(crisp)


def make_ui(asset: str, variant: str) -> Image.Image:
    spec=GEN_VARIANTS[variant]
    core,rim,accent,intensity=spec['core'],spec['rim'],spec['accent'],spec['intensity']
    img=Image.new('RGBA',(1024,1024),(0,0,0,0))
    if asset=='panel_glass_floating':
        box=(120,185,904,838)
        rounded_rect_glow(img,box,46,rim,rgba(PAL['deep_indigo'],54),alpha=int(80*intensity),blur=24,width=4)
        d=ImageDraw.Draw(img)
        # inner glass radial highlights
        glow_line(img,[(180,240),(824,235)],PAL['white_blue'],width=3,alpha=int(42*intensity),blur=18,crisp=False)
        glow_line(img,[(170,780),(855,760)],accent,width=4,alpha=int(34*intensity),blur=28,crisp=False)
        # subtle dust inside panel
        rng=random.Random(SEED+3)
        for _ in range(85):
            x=rng.randint(155,870); y=rng.randint(220,800)
            a=int(rng.uniform(8,30)*intensity)
            d.point((x,y),fill=rgba(rim,a))
    elif asset=='button_primary_glow':
        rounded_rect_glow(img,(195,400,829,624),76,rim,rgba(mix(PAL['deep_indigo'],core,.25),85),alpha=int(115*intensity),blur=30,width=6)
        glow_line(img,[(258,512),(760,512)],accent,width=10,alpha=int(60*intensity),blur=35,crisp=False)
        glow_line(img,[(260,446),(762,446)],PAL['white_blue'],width=2,alpha=int(54*intensity),blur=12,crisp=False)
    elif asset=='button_secondary_soft':
        rounded_rect_glow(img,(222,420,802,604),64,mix(rim,PAL['lilac'],.35),rgba(PAL['deep_indigo'],42),alpha=int(72*intensity),blur=22,width=4)
        glow_line(img,[(275,512),(750,512)],rim,width=5,alpha=int(35*intensity),blur=26,crisp=False)
    elif asset.startswith('badge_status'):
        if asset.endswith('ok'):
            c=PAL['teal']; a2=PAL['cyan']
        elif asset.endswith('warn'):
            c=PAL['amber']; a2=PAL['magenta']
        else:
            c=PAL['hot_magenta']; a2=PAL['amber']
        glow_ellipse(img,(312,312,712,712),c,alpha=int(115*intensity),blur=36,fill=True)
        glow_ellipse(img,(348,348,676,676),a2,alpha=int(75*intensity),blur=18,outline_width=12,crisp_alpha=int(75*intensity))
        glow_ellipse(img,(405,405,619,619),PAL['white_blue'],alpha=int(75*intensity),blur=20,fill=True)
        # abstract status core: check/chevron-like for ok, rays for warn, shard for error; no text
        if asset.endswith('ok'):
            glow_line(img,[(415,520),(485,585),(630,430)],PAL['white_blue'],width=22,alpha=int(150*intensity),blur=10)
        elif asset.endswith('warn'):
            pts=regular_polygon(512,512,150,3,-math.pi/2)
            draw_glow_polygon(img,pts,c,alpha=int(135*intensity),blur=14,width=12,fill_alpha=18)
            glow_line(img,[(512,430),(512,550)],PAL['white_blue'],width=14,alpha=int(120*intensity),blur=8)
            draw_small_dot(img,512,604,10,PAL['white_blue'],alpha=int(145*intensity),blur=7)
        else:
            glow_line(img,[(430,430),(596,596)],PAL['white_blue'],width=22,alpha=int(150*intensity),blur=10)
            glow_line(img,[(596,430),(430,596)],PAL['white_blue'],width=22,alpha=int(150*intensity),blur=10)
    elif asset=='divider_fiber_glow':
        for yoff,alpha,width,blur in [(0,115,4,12),(-14,42,2,18),(17,36,2,24)]:
            glow_line(img,[(80,512+yoff),(944,512+yoff)],rim,width=width,alpha=int(alpha*intensity),blur=blur,crisp=True)
        for x in [185,512,840]:
            draw_small_dot(img,x,512,9,accent,alpha=int(130*intensity),blur=10)
    elif asset=='corner_rim_frame':
        l=245; pad=145
        pts=[((pad,pad),(pad+l,pad)),((pad,pad),(pad,pad+l)),((1024-pad,pad),(1024-pad-l,pad)),((1024-pad,pad),(1024-pad,pad+l)),((pad,1024-pad),(pad+l,1024-pad)),((pad,1024-pad),(pad,1024-pad-l)),((1024-pad,1024-pad),(1024-pad-l,1024-pad)),((1024-pad,1024-pad),(1024-pad,1024-pad-l))]
        for a,b in pts:
            glow_line(img,[a,b],rim,width=8,alpha=int(110*intensity),blur=18)
            glow_line(img,[a,b],accent,width=2,alpha=int(95*intensity),blur=4)
        for p in [(pad,pad),(1024-pad,pad),(pad,1024-pad),(1024-pad,1024-pad)]:
            draw_small_dot(img,p[0],p[1],12,accent,alpha=int(140*intensity),blur=12)
    elif asset=='microgrid_tiling_texture':
        d=ImageDraw.Draw(img)
        # Exact 1024 tile-safe grid with fading not touching edges too strongly.
        for i in range(0,1024,32):
            a=int((24 if i%128 else 44)*intensity)
            d.line([(i,0),(i,1024)],fill=rgba(rim,a),width=1)
            d.line([(0,i),(1024,i)],fill=rgba(rim,a),width=1)
        # micro cross points
        for x in range(0,1024,128):
            for y in range(0,1024,128):
                d.ellipse((x-2,y-2,x+2,y+2),fill=rgba(accent,int(50*intensity)))
    return img

# ---------- Backgrounds ----------
BACKGROUND_ASSETS = ['bg_nebula_drift_core','bg_nebula_spiral_field','bg_dark_matter_grid','bg_deep_space_particles']


def add_stars(img: Image.Image, count: int, seed_offset=0):
    rng=random.Random(SEED+seed_offset)
    d=ImageDraw.Draw(img, 'RGBA')
    w,h=img.size
    for _ in range(count):
        x=rng.randrange(w); y=rng.randrange(h)
        p=rng.random()
        if p<0.87:
            r=1; a=rng.randint(60,170)
        elif p<0.98:
            r=2; a=rng.randint(90,215)
        else:
            r=3; a=rng.randint(145,245)
        col = PAL['white_blue'] if rng.random()<.68 else (PAL['cyan'] if rng.random()<.65 else PAL['lilac'])
        d.ellipse((x-r,y-r,x+r,y+r), fill=rgba(col,a))
        if r>=2 and rng.random()<.35:
            d.line((x-r*6,y,x+r*6,y), fill=rgba(col,a//3), width=1)
            d.line((x,y-r*4,x,y+r*4), fill=rgba(col,a//4), width=1)


def make_base_nebula(w,h,kind):
    # Low-res gradient + gaussian blobs, upscaled to target. Keeps PNG size sane but cinematic.
    lw, lh = max(640, w//4), max(360, h//4)
    yy,xx=np.mgrid[0:lh,0:lw]
    x=xx/lw; y=yy/lh
    arr=np.zeros((lh,lw,3),dtype=np.float32)
    base=np.array(PAL['void'],dtype=np.float32)
    ind=np.array(PAL['deep_indigo'],dtype=np.float32)
    cobalt=np.array(PAL['cobalt'],dtype=np.float32)
    cyan=np.array(PAL['cyan'],dtype=np.float32)
    lilac=np.array(PAL['lilac'],dtype=np.float32)
    mag=np.array(PAL['magenta'],dtype=np.float32)
    arr[:]=base
    arr += ind*(0.35+0.35*(1-y))[:,:,None]
    arr += cobalt*(0.10*np.exp(-((x-.55)**2+(y-.45)**2)/0.22))[:,:,None]
    rng=random.Random(SEED+hash(kind)%1000)
    blobs=[]
    if kind=='bg_nebula_drift_core':
        blobs=[(.34,.50,.20,.12,cyan,.65),(.42,.45,.18,.09,lilac,.46),(.30,.55,.10,.08,mag,.35),(.64,.28,.25,.18,cobalt,.32)]
    elif kind=='bg_nebula_spiral_field':
        blobs=[(.52,.50,.22,.16,lilac,.45),(.50,.50,.12,.09,mag,.45),(.42,.48,.16,.06,cyan,.38),(.62,.55,.18,.07,cobalt,.40)]
    elif kind=='bg_dark_matter_grid':
        blobs=[(.48,.47,.28,.20,cobalt,.26),(.72,.30,.22,.16,cyan,.16),(.30,.62,.25,.12,lilac,.16)]
    else:
        blobs=[(.35,.63,.24,.14,cobalt,.30),(.70,.35,.22,.14,lilac,.22),(.52,.49,.35,.30,cyan,.10)]
    for bx,by,sx,sy,col,amp in blobs:
        g=np.exp(-(((x-bx)/sx)**2+((y-by)/sy)**2))
        arr += col*(amp*g)[:,:,None]
    # low-frequency dust noise
    noise=np.random.default_rng(SEED+len(kind)).normal(0,1,(lh,lw,1)).astype(np.float32)
    # cheap blur by repeated rolling average
    for _ in range(4):
        noise=(noise+np.roll(noise,1,0)+np.roll(noise,-1,0)+np.roll(noise,1,1)+np.roll(noise,-1,1))/5
    arr += noise*9
    arr=np.clip(arr,0,255).astype(np.uint8)
    img=Image.fromarray(arr,'RGB').resize((w,h),Image.Resampling.BICUBIC)
    return img


def make_background(name: str, size: Tuple[int,int]) -> Image.Image:
    w,h=size
    img=make_base_nebula(w,h,name).convert('RGBA')
    overlay=Image.new('RGBA',(w,h),(0,0,0,0))
    d=ImageDraw.Draw(overlay,'RGBA')
    rng=random.Random(SEED+hash(name)%10000+w)
    if name=='bg_nebula_spiral_field':
        cx,cy=w*0.50,h*0.50
        for arm in range(4):
            pts=[]
            for i in range(260):
                t=i/259
                a=t*math.pi*4.6 + arm*math.pi/2 + 0.35
                r=(0.035+0.48*t)*min(w,h)
                x=cx+r*math.cos(a)
                y=cy+r*math.sin(a)*0.62
                pts.append((x,y))
            color=PAL['cyan'] if arm%2==0 else PAL['magenta']
            d.line(pts,fill=rgba(color,48),width=max(2,int(min(w,h)*0.011)),joint='curve')
        overlay=overlay.filter(ImageFilter.GaussianBlur(max(2,int(min(w,h)*0.012))))
        img.alpha_composite(overlay)
        # brilliant core
        core=Image.new('RGBA',(w,h),(0,0,0,0))
        cd=ImageDraw.Draw(core)
        r=min(w,h)*0.055
        cd.ellipse((cx-r,cy-r,cx+r,cy+r),fill=rgba(PAL['white_blue'],190))
        img.alpha_composite(core.filter(ImageFilter.GaussianBlur(int(r*1.2))))
    elif name=='bg_dark_matter_grid':
        # perspective grid and network lines baked into background
        horizon=int(h*0.43)
        for i in range(-10,24):
            x1=w*(0.5+i*0.055)
            d.line((x1,h,x1*0.62+w*0.19,horizon),fill=rgba(PAL['cyan'],34),width=1)
        for j in range(14):
            t=j/13
            y=int(horizon+(h-horizon)*(t**1.8))
            d.line((0,y,w,y),fill=rgba(PAL['cyan'],24 if j%2 else 42),width=1 if j%2 else 2)
        # graph nodes/edges
        pts=[]
        for _ in range(26):
            pts.append((rng.randint(int(w*.14),int(w*.86)), rng.randint(int(h*.20),int(h*.78))))
        for i in range(len(pts)):
            for j in range(i+1,len(pts)):
                if rng.random()<0.055:
                    d.line((pts[i],pts[j]),fill=rgba(PAL['cyan'] if rng.random()<.8 else PAL['lilac'],34),width=1)
        overlay=overlay.filter(ImageFilter.GaussianBlur(1))
        img.alpha_composite(overlay)
        for x,y in pts:
            node=Image.new('RGBA',(w,h),(0,0,0,0))
            nd=ImageDraw.Draw(node)
            rr=rng.randint(3,6)
            nd.ellipse((x-rr,y-rr,x+rr,y+rr),fill=rgba(PAL['cyan'],145))
            img.alpha_composite(node.filter(ImageFilter.GaussianBlur(3)))
            img.alpha_composite(node)
    elif name=='bg_nebula_drift_core':
        # large left-weighted glowing core and dust sheets
        cx,cy=int(w*.34),int(h*.52)
        for rad,alpha,col in [(min(w,h)*.32,55,PAL['cyan']),(min(w,h)*.20,82,PAL['lilac']),(min(w,h)*.10,118,PAL['magenta']),(min(w,h)*.045,220,PAL['white_blue'])]:
            tmp=Image.new('RGBA',(w,h),(0,0,0,0)); td=ImageDraw.Draw(tmp)
            td.ellipse((cx-rad,cy-rad,cx+rad,cy+rad),fill=rgba(col,alpha))
            img.alpha_composite(tmp.filter(ImageFilter.GaussianBlur(int(rad*.38))))
        for _ in range(10):
            y=rng.randint(int(h*.25),int(h*.75)); x0=rng.randint(-int(w*.1),int(w*.25)); x1=rng.randint(int(w*.55),int(w*1.1))
            d.line((x0,y,x1,y+rng.randint(-80,80)),fill=rgba(PAL['lilac'] if rng.random()<.5 else PAL['cyan'],rng.randint(16,34)),width=rng.randint(2,5))
        img.alpha_composite(overlay.filter(ImageFilter.GaussianBlur(22)))
    elif name=='bg_deep_space_particles':
        # darker, more negative space, particles only
        vignette=Image.new('RGBA',(w,h),(0,0,0,0))
        vd=ImageDraw.Draw(vignette)
        vd.rectangle((0,0,w,h),fill=rgba(PAL['void'],40))
        img.alpha_composite(vignette)
        for _ in range(35):
            x=rng.randrange(w); y=rng.randrange(h)
            l=rng.randint(16,90)
            d.line((x,y,x+l,y+rng.randint(-4,4)),fill=rgba(PAL['cyan'] if rng.random()<.7 else PAL['lilac'],rng.randint(14,40)),width=1)
        img.alpha_composite(overlay.filter(ImageFilter.GaussianBlur(1)))
    # Add starfield and vignette / film grain light.
    add_stars(img, int((w*h)/3200), seed_offset=hash(name)%5000)
    # vignette
    yy,xx=np.mgrid[0:h,0:w]
    dx=(xx-w/2)/(w/2); dy=(yy-h/2)/(h/2)
    v=np.clip((dx*dx+dy*dy-0.25)/0.9,0,1)
    alpha=(v*170).astype(np.uint8)
    vig=np.zeros((h,w,4),dtype=np.uint8); vig[...,3]=alpha; vig[...,0:3]=np.array(PAL['void'],dtype=np.uint8)
    img.alpha_composite(Image.fromarray(vig,'RGBA'))
    # subtle film grain as low-alpha monochrome (limited entropy)
    small=np.random.default_rng(SEED+w+h+len(name)).integers(0,32,(max(90,h//16),max(160,w//16)),dtype=np.uint8)
    grain=Image.fromarray(small,'L').resize((w,h),Image.Resampling.BILINEAR)
    grain_rgba=Image.new('RGBA',(w,h),rgba(PAL['white_blue'],0))
    grain_rgba.putalpha(grain.point(lambda p: int(p*0.28)))
    img.alpha_composite(grain_rgba)
    return img.convert('RGB')

# ---------- Generate assets ----------
print('Generating Beacon NetGraph asset pack...')
# Backgrounds
for size_name, size in [('2560x1440',(2560,1440)), ('1920x1080',(1920,1080))]:
    for bg in BACKGROUND_ASSETS:
        img=make_background(bg,size)
        save_image(img, ROOT/'backgrounds'/size_name/f'{bg}.png', 'backgrounds', bg, variant=None, resolution=size_name, alpha=False)

# Nodes
for node in NODE_TYPES:
    for variant in NODE_VARIANTS:
        img=make_node(node, variant)
        save_image(img, ROOT/'nodes'/variant/f'{node}.png', 'nodes', node, variant=variant, resolution='1024x1024', alpha=True)

# Packets/trails/comets, 1024 variants
packet_assets=[]
for base in ['packet_standard','packet_priority']:
    for sz in ['small','medium','large']:
        packet_assets.append(f'{base}_{sz}')
packet_assets += ['packet_encrypted','packet_corrupted_glow']
trail_assets=['trail_short','trail_medium','trail_long','trail_curved','trail_spiral']
comet_assets=['comet_fast','comet_data','comet_beacon']
for variant in GEN_VARIANTS:
    for asset in packet_assets:
        img=make_packet(asset,variant,1024)
        save_image(img, ROOT/'packets_trails_comets'/'1024'/variant/f'{asset}.png', 'packets_trails_comets', asset, variant=variant, resolution='1024x1024', alpha=True)
    for asset in trail_assets:
        img=make_trail(asset,variant,1024)
        save_image(img, ROOT/'packets_trails_comets'/'1024'/variant/f'{asset}.png', 'packets_trails_comets', asset, variant=variant, resolution='1024x1024', alpha=True)
    for asset in comet_assets:
        img=make_comet(asset,variant,1024)
        save_image(img, ROOT/'packets_trails_comets'/'1024'/variant/f'{asset}.png', 'packets_trails_comets', asset, variant=variant, resolution='1024x1024', alpha=True)

# Optional 2048 default versions only, as desktop variants.
for asset in packet_assets:
    img=make_packet(asset,'default',2048)
    save_image(img, ROOT/'packets_trails_comets'/'2048'/'default'/f'{asset}.png', 'packets_trails_comets', asset, variant='default_desktop_2048', resolution='2048x2048', alpha=True)
for asset in trail_assets:
    img=make_trail(asset,'default',2048)
    save_image(img, ROOT/'packets_trails_comets'/'2048'/'default'/f'{asset}.png', 'packets_trails_comets', asset, variant='default_desktop_2048', resolution='2048x2048', alpha=True)
for asset in comet_assets:
    img=make_comet(asset,'default',2048)
    save_image(img, ROOT/'packets_trails_comets'/'2048'/'default'/f'{asset}.png', 'packets_trails_comets', asset, variant='default_desktop_2048', resolution='2048x2048', alpha=True)

# Ambient and UI variants
for variant in GEN_VARIANTS:
    for asset in AMBIENT_ASSETS:
        img=make_ambient(asset,variant)
        save_image(img, ROOT/'ambient'/variant/f'{asset}.png', 'ambient', asset, variant=variant, resolution='1024x1024', alpha=True)
    for asset in UI_ASSETS:
        img=make_ui(asset,variant)
        save_image(img, ROOT/'ui'/variant/f'{asset}.png', 'ui', asset, variant=variant, resolution='1024x1024', alpha=True)

# Preview sheets: no runtime assets, but useful for handoff.
PREVIEW_DIR=ROOT/'previews'
PREVIEW_DIR.mkdir(parents=True,exist_ok=True)

def make_preview_sheet():
    thumb=160
    pad=18
    cols=8
    # include backgrounds + one row nodes + sprites + ui, no labels/text inside
    selected=[]
    for bg in BACKGROUND_ASSETS:
        selected.append(ROOT/'backgrounds'/'1920x1080'/f'{bg}.png')
    for node in NODE_TYPES[:12]:
        selected.append(ROOT/'nodes'/'default'/f'{node}.png')
    for asset in packet_assets[:8]+trail_assets+comet_assets+AMBIENT_ASSETS[:4]+UI_ASSETS:
        # find category path
        p=ROOT/'packets_trails_comets'/'1024'/'default'/f'{asset}.png'
        if not p.exists(): p=ROOT/'ambient'/'default'/f'{asset}.png'
        if not p.exists(): p=ROOT/'ui'/'default'/f'{asset}.png'
        selected.append(p)
    rows=math.ceil(len(selected)/cols)
    sheet=Image.new('RGB',(cols*(thumb+pad)+pad, rows*(thumb+pad)+pad), PAL['void'])
    # background overlay star drift
    d=ImageDraw.Draw(sheet,'RGBA')
    rng=random.Random(SEED+888)
    for _ in range(300):
        x=rng.randrange(sheet.size[0]); y=rng.randrange(sheet.size[1])
        d.point((x,y),fill=rgba(PAL['cyan'] if rng.random()<.55 else PAL['lilac'],rng.randint(20,80)))
    for idx,p in enumerate(selected):
        im=Image.open(p).convert('RGBA')
        # thumbnails: backgrounds fill, sprites preserve alpha over dark tile
        im.thumbnail((thumb,thumb),Image.Resampling.LANCZOS)
        x=pad+(idx%cols)*(thumb+pad)
        y=pad+(idx//cols)*(thumb+pad)
        tile=Image.new('RGBA',(thumb,thumb),rgba(PAL['deep_indigo'],65))
        td=ImageDraw.Draw(tile,'RGBA')
        td.rounded_rectangle((0,0,thumb-1,thumb-1),radius=12,outline=rgba(PAL['cyan'],55),width=1)
        tile.alpha_composite(im,((thumb-im.size[0])//2,(thumb-im.size[1])//2))
        sheet.paste(tile.convert('RGB'),(x,y))
    return sheet

preview=make_preview_sheet()
save_image(preview, PREVIEW_DIR/'beacon_netgraph_preview_sheet.png', 'previews', 'beacon_netgraph_preview_sheet', variant=None, resolution=f'{preview.size[0]}x{preview.size[1]}', alpha=False)

# Copy original image-gen sheet if present as non-runtime reference only.
orig=Path('/mnt/data/a_collection_of_sci_fi_user_interface_assets_title.png')
if orig.exists():
    shutil.copy2(orig, PREVIEW_DIR/'image_gen_reference_sheet_not_runtime_asset.png')
    ASSET_INDEX.append({'name':'image_gen_reference_sheet_not_runtime_asset','category':'previews','variant':None,'resolution':'1024x1536','alpha':False,'path':'previews/image_gen_reference_sheet_not_runtime_asset.png','note':'Original image-generation preview sheet; contains text and is not intended as a runtime asset.'})

# Stylesheet and docs
palette_lines='\n'.join([f'| `{k}` | `#{v[0]:02X}{v[1]:02X}{v[2]:02X}` |' for k,v in PAL.items()])
style_md=f'''# Beacon NetGraph Asset Pack — Style Sheet

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

Node silhouettes are intentionally built around a strong central luminous core and a distinct outer geometry so identity remains visible at 64px and survives at 32px. Suggested implementation:

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
(ROOT/'STYLE_SHEET.md').write_text(style_md, encoding='utf-8')

readme=f'''# Beacon NetGraph Asset Pack

This is a generated production handoff bundle for **Beacon NetGraph** with a unified cosmic sci-fi / neural-network visual language.

## Contents

- 4 backgrounds in 2560x1440 and 1920x1080
- 13 NetGraph node types × 4 variants = 52 transparent node sprites
- Packet, trail, and comet sprites in 1024x1024 with default/soft/active/alert variants
- Optional 2048x2048 default desktop versions for packet/trail/comet sprites
- Ambient cinematic extras for beams, halos, focus pulses, scan grids, star drift, and dust sheets
- Generic reusable Beacon UI assets for panels, buttons, status badges, dividers, corner frames, and microgrid overlays
- `STYLE_SHEET.md` for palette, glow, blend, and lighting assumptions
- `ASSET_INDEX.json` for loader integration

## Runtime status

The PNG assets inside `backgrounds`, `nodes`, `packets_trails_comets`, `ambient`, and `ui` contain no text, logos, or watermarks. Files in `previews` are for human review only and should not be used as runtime UI sprites.
'''
(ROOT/'README.md').write_text(readme, encoding='utf-8')

# Write manifest with checksums
for rec in ASSET_INDEX:
    p=ROOT/rec['path']
    if p.exists():
        h=hashlib.sha256(p.read_bytes()).hexdigest()
        rec['sha256']=h
(ROOT/'ASSET_INDEX.json').write_text(json.dumps({
    'pack':'Beacon NetGraph Asset Pack',
    'seed_family':SEED,
    'asset_count':len([r for r in ASSET_INDEX if r['category']!='previews']),
    'total_file_count_indexed':len(ASSET_INDEX),
    'assets':ASSET_INDEX,
}, indent=2), encoding='utf-8')

# Also include generation script for reproducibility.
script_src=Path(__file__)
if script_src.exists():
    shutil.copy2(script_src, ROOT/'generate_beacon_netgraph_pack.py')

# Zip it
if ZIP_PATH.exists():
    ZIP_PATH.unlink()
with zipfile.ZipFile(ZIP_PATH,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for path in ROOT.rglob('*'):
        if path.is_file():
            z.write(path,path.relative_to(ROOT.parent))

# Report summary
runtime_count=len([r for r in ASSET_INDEX if r['category']!='previews'])
preview_count=len([r for r in ASSET_INDEX if r['category']=='previews'])
print(f'Done. Runtime assets indexed: {runtime_count}. Preview/reference files: {preview_count}.')
print(f'Folder: {ROOT}')
print(f'ZIP: {ZIP_PATH} ({ZIP_PATH.stat().st_size/1024/1024:.2f} MB)')
