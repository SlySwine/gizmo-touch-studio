"""Original Blender-built sanctuary for Neon Wilds.
Run: Blender -b --python tools/build_neon_world.py
All world coordinates in this generator are Three.js x/y/z; transform happens at bake.
The sole blocking geometry is world.json colliders, ramp/deck and outer boundary.
"""
import bpy, math, json, random, os, sys, hashlib
from pathlib import Path
from mathutils import Vector
random.seed(71319)
ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT.parent / 'assets-work'
WORK.mkdir(exist_ok=True)
SPEC = json.loads((ROOT/'dist/neon/world.json').read_text())
OUT = ROOT/'dist/assets/neon-world.glb'
REPORT = ROOT/'dist/assets/neon-world-report.json'
(ROOT/'source').mkdir(exist_ok=True)
BLEND = ROOT/'source/neon-world.blend'
PREVIEW = WORK/'neon-world-preview.png'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for d in list(bpy.data.materials): bpy.data.materials.remove(d)
MATS={}; GEO={}
def material(name, color, metal=0, rough=.4, emit=0, alpha=1):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,alpha)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emit
    p.inputs['Alpha'].default_value=alpha
    if alpha<1: m.surface_render_method='DITHERED'
    m.diffuse_color=(*color,alpha); MATS[name]=m; GEO[name]=[[],[],[]]
    return name
ink=material('Midnight titanium',(.026,.038,.075),.72,.28)
slate=material('Blue-black ceramic',(.046,.061,.105),.36,.31)
tile=material('Wet obsidian pavers',(.056,.071,.115),.58,.23)
tile2=material('Wet indigo pavers',(.075,.082,.145),.56,.27)
path=material('Pearlescent route alloy',(.115,.16,.215),.73,.25)
chrome=material('Brushed pale titanium',(.37,.43,.58),.83,.24)
purple=material('Amethyst architectural enamel',(.135,.035,.215),.66,.23)
rose=material('Plum conservatory enamel',(.22,.035,.13),.52,.29)
crystal=material('Optical blue crystal',(.07,.20,.35),.66,.12)
cyan=material('Cyan photon strips',(.02,.8,.92),.3,.25,2.8)
pink=material('Rose photon strips',(.95,.045,.35),.3,.25,2.3)
violet=material('Violet photon strips',(.34,.1,.95),.3,.3,2.5)
gold=material('Amber reactor light',(.98,.34,.045),.5,.24,2.5)
white=material('Cool white light',(.48,.7,.95),.3,.3,1.5)
leaf=material('Holographic fern blades',(.035,.24,.26),.4,.24,.4)
leaf2=material('Iridescent fern reverse',(.23,.06,.24),.44,.25,.4)
glass=material('Lucent membrane',(.16,.24,.55),.34,.18,.18,.26)

def add(mat, verts, faces, smooth=False):
    g=GEO[mat]; n=len(g[0]); g[0].extend(verts); g[1].extend(tuple(n+i for i in f) for f in faces); g[2].extend([smooth]*len(faces))
def box(name,c,size,mat,bevel=.04):
    x,y,z=c; w,h,d=size; b=min(bevel,w*.2,h*.3,d*.2)
    contour=[(-w/2+b,-d/2), (w/2-b,-d/2),(w/2,-d/2+b),(w/2,d/2-b),(w/2-b,d/2),(-w/2+b,d/2),(-w/2,d/2-b),(-w/2,-d/2+b)]
    vs=[]
    for yy,shrink in [(y-h/2,b),(y-h/2+b,0),(y+h/2-b,0),(y+h/2,b)]:
        for xx,zz in contour:
            sx=xx*(1-shrink/max(.001,w/2)); sz=zz*(1-shrink/max(.001,d/2));vs.append((x+sx,yy,z+sz))
    fs=[tuple(range(7,-1,-1)),tuple(range(24,32))]
    for j in range(3):
        for i in range(8):fs.append((j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i))
    add(mat,vs,[tuple(reversed(f)) for f in fs])
def plane(mat,c,w,d):
    x,y,z=c;add(mat,[(x-w/2,y,z-d/2),(x-w/2,y,z+d/2),(x+w/2,y,z+d/2),(x+w/2,y,z-d/2)],[(0,1,2,3)])
def tube(mat,points,r=.05,sides=6):
    vs=[]
    for i,p in enumerate(points):
        p=Vector(p); tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        tangent.normalize(); guide=Vector((0,1,0)) if abs(tangent.y)<.92 else Vector((1,0,0))
        a=tangent.cross(guide).normalized(); b=tangent.cross(a).normalized()
        for k in range(sides):
            v=p+r*(a*math.cos(k*math.tau/sides)+b*math.sin(k*math.tau/sides));vs.append(tuple(v))
    fs=[]
    for i in range(len(points)-1):
        for j in range(sides):fs.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    add(mat,vs,fs,True)
def ring(mat,x,y,z,r,t=.04,start=0,end=math.tau,steps=64):
    tube(mat,[(x+r*math.cos(start+(end-start)*i/steps),y,z+r*math.sin(start+(end-start)*i/steps)) for i in range(steps+1)],t,6)
def cylinder(mat,c,r,h,n=32):
    x,y,z=c;vs=[]
    for yy in [y-h/2,y+h/2]:
        for i in range(n):vs.append((x+r*math.cos(i*math.tau/n),yy,z+r*math.sin(i*math.tau/n)))
    fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
    add(mat,vs,[tuple(reversed(f)) for f in fs])
def prism(mat,c,r,h,n=6):
    x,y,z=c; vs=[(x,y+h/2,z)]+[(x+r*math.cos(i*math.tau/n),y-h*.05,z+r*math.sin(i*math.tau/n))for i in range(n)]+[(x,y-h/2,z)]
    add(mat,vs,[(0,1+(i+1)%n,1+i)for i in range(n)]+[(n+1,1+i,1+(i+1)%n)for i in range(n)])
def fern(x,z,scale=1,angle=0,base=0):
    for frond in range(7):
        theta=angle+frond*math.tau/7; length=scale*random.uniform(1.2,2); high=scale*random.uniform(.65,1.5)
        pts=[]
        for j in range(12):
            t=j/11; rr=length*t;pts.append((x+rr*math.cos(theta),base+.05+high*math.sin(t*math.pi*.69),z+rr*math.sin(theta)))
        tube(cyan if frond%3==0 else leaf,pts,.015*scale,4)
        for j in range(2,11):
            t=j/11; v=Vector(pts[j]); size=scale*.35*math.sin(t*math.pi); side=Vector((-math.sin(theta),0,math.cos(theta)))
            forward=Vector((math.cos(theta),.22,math.sin(theta)))
            for sign in [-1,1]:
                tip=v+sign*side*size-forward*size*.3;mid=(v+tip)*.5+Vector((0,.075*scale,0))
                add(leaf if (j+frond)%2 else leaf2,[tuple(v),tuple(mid+forward*size*.18),tuple(tip),tuple(mid-forward*size*.18)],[(0,1,2),(0,2,3)],True)
    ring(violet,x,base+.035,z,.34*scale,.022,steps=24)

# Connected ground: tiled, recessed channels, safe flush route guides.
box('Sanctuary foundation',(0,-.48,-4),(88,.9,84),ink,.14)
for ix in range(22):
    for iz in range(21):
        xx=-42+ix*4; zz=-44+iz*4
        # Narrow genuine seams catch glancing highlights instead of painted flat grid.
        box('Paver',(xx,-.045,zz),(3.965,.08,3.965),random.choice([tile,tile,tile2]),.045)
# Long central boulevard with cross routes; all are flush inlays.
for z in range(-22,29,4):
    plane(path,(0,.007,z),8,3.65)
    for x in [-4.15,4.15]:box('Promenade light',(x,.013,z),(.06,.025,3.2),cyan,.006)
for x in range(-38,39,4):
    if abs(x)>5:
        plane(path,(x,.009,-2),3.66,6)
        for z in [-5.1,1.1]:box('Cross street light',(x,.015,z),(3.2,.025,.065),pink if x<0 else cyan,.008)
# Sweeping circuit lines leading into secondary districts; no lifted path obstacles.
for sign in [-1,1]:
    pts=[(sign*(5+18*t),.025,2+18*t)for t in [i/40 for i in range(41)]]
    tube(gold if sign>0 else violet,pts,.035,6)
    pts=[(sign*(5+15*t),.025,-8-16*t)for t in [i/40 for i in range(41)]]
    tube(cyan if sign>0 else pink,pts,.035,6)
for radius in [5.3,7.3,9.0]:
    ring(cyan if radius<7 else violet,0,.025,5,radius,.035,start=.15,end=math.tau-.15,steps=80)
# Hub flush triangulated medallion, white direction bars.
for i in range(24):
    a=i*math.tau/24
    box('Atrium radial marker',(8*math.cos(a),.025,5+8*math.sin(a)),(.12,.035,.40),white,.008)
# Suspended spiral architectural halo: readable silhouette, clear walking space below.
for rr,h in [(9.5,9),(10.2,10.5),(8.8,12)]:
    pts=[(rr*math.cos(t),h+.55*math.sin(t*3),5+rr*math.sin(t))for t in [i*math.tau/128 for i in range(129)]]
    tube(purple,pts,.16,8)
    tube(cyan if h==9 else violet,[(x,y-.13,z)for x,y,z in pts],.045,6)
# Route studs in noninteractive floor: restrained repeated physical navigation vocabulary.
for x,z in [(0,14),(0,-15),(-13,-2),(12,-2),(17,15),(22,-7)]:
    for off in [-.32,0,.32]:
        tube(white,[(x-.18,.032,z+.2+off),(x,.032,z+off),(x+.18,.032,z+.2+off)],.027,4)

# Conservatory: scalloped flush pool pattern and tall sculptural jellyfish canopy.
for r in [5.0,8.8,12.6]:ring(pink,-26,.025,-1,r,.04,steps=80)
for i in range(18):
    a=i*math.tau/18; rr=11.8
    ring(leaf,-26+rr*math.cos(a),.02,-1+rr*math.sin(a),.7,.025,steps=20)
# One monumental bell, intentionally not one of the small rescue targets.
cx,cz=-27,-4; bellr=7.3; belly=12.0
vs=[]; sectors=64; rows=16
for j in range(rows+1):
    t=j/rows*math.pi/2; rr=bellr*math.sin(t); y=belly+4.8*math.cos(t)
    for k in range(sectors):
        a=k*math.tau/sectors; r=rr*(1+.035*math.cos(a*12)*math.sin(t)**3);vs.append((cx+r*math.cos(a),y,cz+r*math.sin(a)))
fs=[]
for j in range(rows):
    for k in range(sectors):fs.append((j*sectors+k,j*sectors+(k+1)%sectors,(j+1)*sectors+(k+1)%sectors,(j+1)*sectors+k))
add(glass,vs,fs,True)
for k in range(12):
    a=k*math.tau/12
    tube(pink if k%2 else violet,[(cx+bellr*math.sin(j/30*math.pi/2)*math.cos(a),belly+4.8*math.cos(j/30*math.pi/2),cz+bellr*math.sin(j/30*math.pi/2)*math.sin(a))for j in range(31)],.055,6)
ring(pink,cx,belly,cz,bellr,.105,steps=96)
for k in range(14):
    a=k*math.tau/14;rr=random.uniform(2.0,6.5);ln=random.uniform(4.2,7.5)
    pts=[]
    for j in range(36):
        t=j/35;pts.append((cx+rr*math.cos(a)+.55*math.sin(t*8+k)*t,belly-ln*t,cz+rr*math.sin(a)+.55*math.cos(t*7+k)*t))
    tube(pink if k%3 else cyan,pts,.034,5)
# Collidable botanical bed only in its recorded rectangle.
box('Conservatory bed',(-25,1,-9),(6,2,3),rose,.20)
box('Planter inset soil',(-25,2.01,-9),(5.5,.045,2.5),ink,.08)
for x in [-27,-25,-23]:fern(x,-9,1.2,base=2.03)
for z in [-10.5,-7.5]:box('Planter edge',(-25,1.8,z),(5.65,.06,.06),pink,.008)
# Pass-through projected ferns have no opaque stems or physical pots.
for x,z,sc in [(-40,-7,1.3),(-40,13,1.1),(-17,7,1.0),(-16,-20,1.2),(-31,17,1.1),(-41,-25,.8)]:fern(x,z,sc)

# Prism Arcade: diamond plaza, floating swept vaults, collision-matched divider.
for i in range(7):
    x=11+i*4
    for j in range(5):
        z=-9-j*4
        add(crystal,[(x,.014,z-1.35),(x+1.35,.014,z),(x,.014,z+1.35),(x-1.35,.014,z)],[(3,2,1,0)])
        tube(cyan,[(x,.032,z-1.35),(x+1.35,.032,z),(x,.032,z+1.35)],.018,4)
for z in [-9,-20,-31]:
    pts=[(22+12*math.cos(t),5.2+8.0*math.sin(t),z)for t in [i*math.pi/48 for i in range(49)]]
    tube(chrome,pts,.22,8);tube(cyan,[(x,y-.19,zz)for x,y,zz in pts],.055,6)
box('Arcade divider base',(22,.4,-18),(2.5,.8,8),ink,.15)
# Continuous glazed volume makes the full 3m collision height legible when jumping.
box('Arcade divider glass',(22,1.9,-18),(2.5,2.2,8),glass,.025)
for xedge in [20.75,23.25]:
    tube(cyan,[(xedge,.81,-22),(xedge,2.99,-22),(xedge,2.99,-14),(xedge,.81,-14)],.025,5)
for zedge in [-22,-14]:tube(cyan,[(20.75,2.99,zedge),(23.25,2.99,zedge)],.025,5)
for z in [-21,-18.5,-16]:
    prism(crystal,(22,1.85,z),1.12,2.3,5)
    tube(cyan,[(21.1,.82,z),(22,3,z),(22.9,.82,z)],.025,4)
for x,z in [(35,-17),(37,-27),(12,-31),(31,-35)]:fern(x,z,.75)
# Refractive sculpture suspended over center aisle, no action-target duplication.
for angle in [0,math.pi/3,math.pi*2/3]:
    pts=[]
    for j in range(65):
        t=j*math.tau/64;pts.append((27+3*math.cos(t)*math.cos(angle),9+4.6*math.sin(t),-25+3*math.cos(t)*math.sin(angle)))
    tube(chrome,pts,.075,6)
prism(violet,(27,9,-25),.55,3,6)

# Foundry: inset octagon reactor floor and a collision-matched machine.
ring(gold,25,.03,18,10,.052,steps=80)
ring(ink,25,.035,18,8.7,.12,steps=64)
for a in range(12):
    t=a*math.tau/12;x=25+9.3*math.cos(t);z=18+9.3*math.sin(t)
    plane(chrome,(x,.025,z),.6,.13)
box('Foundry machine core',(25,1.5,12),(5,3,4),ink,.22)
box('Amber radiator',(25,1.6,9.94),(4.5,2.25,.08),purple,.04)
for x in [23,23.5,24,24.5,25,25.5,26,26.5,27]:
    box('Cooling fins',(x,1.55,9.87),(.15,2.5,.15),chrome,.025)
    box('Reactor filament',(x,1.6,9.77),(.045,1.8,.03),gold,.009)
for z in [10.6,12,13.4]:
    cylinder(ink,(25,3.02,z),.65,.08,24)
    ring(gold,25,3.085,z,.50,.06,steps=32)
for x in [22.56,27.44]:
    box('Reactor flank',(x,1.8,12),(.045,1.9,3.2),rose,.01)
    for zz in [10.7,11.5,12.3,13.1]:box('Amber vents',(x,2,zz),(.065,.35,.14),gold,.009)
# Industrial overhead ring turbine with physical alloy outer casing.
for r,yy in [(6.8,11),(7.3,11.5),(6.8,12)]:ring(chrome if yy!=11.5 else ink,25,yy,18,r,.23,steps=96)
ring(gold,25,10.8,18,6.7,.07,steps=96)
for i in range(32):
    a=i*math.tau/32;b=a+.10
    add(purple,[(25+5.5*math.cos(a),11,18+5.5*math.sin(a)),(25+7*math.cos(a),11.5,18+7*math.sin(a)),(25+7*math.cos(b),11.5,18+7*math.sin(b)),(25+5.5*math.cos(b),11,18+5.5*math.sin(b))],[(0,1,2,3)])
for x,z in [(35,9),(37,19),(17,29),(40,31)]:fern(x,z,.75)

# Exact spire ramp: the slope is continuous, visual ribs never impede wheels/feet.
add(path,[(-4.5,0,-25),(4.5,0,-25),(4.5,4,-35),(-4.5,4,-35),(-4.5,-.05,-25),(4.5,-.05,-25),(4.5,-.05,-35),(-4.5,-.05,-35)],[(0,1,2,3),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0),(4,7,6,5)])
for x in [-4.25,4.25]:tube(violet,[(x,.03,-25),(x,4.03,-35)],.045,6)
for j in range(1,10):
    z=-25-j;y=j*.4+.018
    tube(chrome,[(-3.8,y,z),(3.8,y,z)],.018,4)
box('Aurora deck',(0,2,-39),(18,4,8),ink,.12)
for x in range(-8,9,2):
    for z in [-36,-38,-40,-42]:box('Deck paving',(x,4.013,z),(1.95,.025,1.95),path,.006)
for x in [-8.7,8.7]:box('Deck edge light',(x,4.04,-39),(.065,.05,7.7),violet,.008)
for x in [-7,7]:
    box('Spire buttress',(x,3,-30),(4,6,10),purple,.28)
    for z in [-34,-32,-30,-28,-26]:box('Buttress ribs',(x,3.1,z),(3.96,5.4,.16),ink,.04)
    for off in [-1.5,1.5]:tube(violet,[(x+off,.5,-34.9),(x+off,5.8,-34.9),(x+off,5.8,-25.1),(x+off,.5,-25.1)],.06,6)
    box('Buttress cap',(x,6.02,-30),(3.5,.08,9.4),chrome,.02)
# Ribbed crown rises from ABOVE the recorded buttresses, no hidden collision pillars.
for side in [-1,1]:
    for zoff in [-2,0,2]:
        pts=[]
        for j in range(65):
            t=j/64;pts.append((side*(7*(1-t)+.35*math.sin(t*math.pi)),6+19*math.sin(t*math.pi/2),-30+zoff-8*t))
        tube(chrome,pts,.20,8)
        tube(violet if zoff else cyan,[(x-side*.16,y,z)for x,y,z in pts],.07,6)
for yy,r in [(14,5.2),(18,3.8),(22,2.3)]:
    ring(purple,0,yy,-37,r,.11,steps=64);ring(violet,0,yy-.09,-37,r,.035,steps=64)
prism(white,(0,25,-38),.38,3.6,6)
# A small uninterrupted route beside the ramp leads around the architecture/secrets.
for x in [-13,13]:
    for z in [-26,-30,-34,-38]:plane(path,(x,.02,z),4,3.6)


# Optional vertical gardens are generated from the same surfaces the game simulates.
# No rail/roof blocks entry, and every medallion is a flush noninteractive inlay.
optional_surface_ids={'maintenance-ramp','maintenance-deck','echo-garden-ramp','echo-garden-deck'}
optional_surfaces=[q for q in SPEC['surfaces'] if q['id'] in optional_surface_ids]
for q in optional_surfaces:
    x,z,w,d=q['x'],q['z'],q['width'],q['depth']
    accent=gold if q['id'].startswith('maintenance') else pink
    if q['type']=='ramp':
        lo,hi=q['low'],q['high'];north=z-d/2;south=z+d/2
        assert q['axis']=='-z', 'Optional ramp generator expects authored -z slopes'
        add(path,[(x-w/2,lo,south),(x+w/2,lo,south),(x+w/2,hi,north),(x-w/2,hi,north),(x-w/2,-.025,south),(x+w/2,-.025,south),(x+w/2,-.025,north),(x-w/2,-.025,north)],[(0,1,2,3),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0),(4,7,6,5)])
        for xx in [x-w/2+.15,x+w/2-.15]:tube(accent,[(xx,lo+.025,south),(xx,hi+.025,north)],.028,5)
        for j in range(1,6):
            zz=south-d*j/6;yy=lo+(hi-lo)*j/6+.015
            tube(chrome,[(x-w/2+.35,yy,zz),(x+w/2-.35,yy,zz)],.015,4)
    else:
        h=q['height'];box(q['id'],(x,h/2,z),(w,h,d),purple if accent==pink else ink,.065)
        plane(path,(x,h+.006,z),w-.18,d-.18)
        # The rim follows the exact physical deck boundary without a raised barrier.
        tube(accent,[(x-w/2+.06,h+.035,z+d/2-.06),(x-w/2+.06,h+.035,z-d/2+.06),(x+w/2-.06,h+.035,z-d/2+.06),(x+w/2-.06,h+.035,z+d/2-.06)],.032,5)
        ring(accent,x,h+.023,z,min(w,d)*.29,.025,steps=36)
        ring(chrome,x,h+.024,z,min(w,d)*.36,.022,steps=36)
        # Two peripheral ferns leave both approach and secret pickup area open.
        for xx,zz in [(x-w/2+.6,z-d/2+.6),(x-w/2+.6,z+d/2-.7)]:fern(xx,zz,.60,base=h+.012)
        # Clearly suspended light mobiles give each optional balcony its own silhouette.
        for j in range(3):
            yy=h+4.0+j*.45;rr=.65-j*.12
            ring(accent,x,yy,z,rr,.025,steps=24)
        prism(white,(x,h+4.7,z),.16,.7,5)

# Two recorded screens hide secrets while remaining visually honest about solid extents.
for cid in ['secret-garden-screen','secret-west-screen']:
    c=next(c for c in SPEC['colliders'] if c['id']==cid)
    x,z,w,d,h=c['x'],c['z'],c['width'],c['depth'],c['height']
    box(cid,(x,h/2,z),(w,h,d),ink,.12)
    for zz in [z-d*.36,z-d*.12,z+d*.12,z+d*.36]:
        box('Secret screen louver',(x,h*.6,zz),(w+.01,h*.7,.13),purple,.03)
    for xx in [x-w/2+.10,x+w/2-.10]:box('Secret screen filament',(xx,h*.75,z),(.06,.055,d-.3),pink,.01)
    fern(x,z,.65,base=h)
# Holographic gardens at the arrival and hidden routes; tall enough to give parallax.
for x,z in [(-14,30),(-5,31),(8,32),(12,-42)]:fern(x,z,random.uniform(.8,1.25))

# Boundary is real in physics, visibly demarcated and never a cliff surprise.
for x in [-44.25,44.25]:
    box('Perimeter parapet',(x,.4,-4),(.45,.8,84.5),ink,.08)
    box('Perimeter light',(x,.84,-4),(.06,.04,84.4),violet,.01)
for z in [-46.25,38.25]:
    box('Perimeter parapet',(0,.4,z),(88.5,.8,.45),ink,.08)
    box('Perimeter light',(0,.84,z),(88.4,.04,.06),violet,.01)
# Layered skyline lies entirely beyond traversable bounds; no scenery collision surprises.
for i in range(36):
    side=i%4
    if side==0:x,z=random.uniform(-85,85),random.uniform(-74,-56)
    elif side==1:x,z=random.uniform(57,85),random.uniform(-56,65)
    elif side==2:x,z=random.uniform(-85,-57),random.uniform(-56,65)
    else:x,z=random.uniform(-85,85),random.uniform(50,73)
    w,d,h=random.uniform(3,8),random.uniform(3,7),random.uniform(9,34)
    box('Far city tower',(x,h/2-5,z),(w,h,d),ink,.18)
    # Facade windows use true two-triangle inlays on every visible side, not tiny boxes.
    # Broken rhythms avoid a repeated empty-box skyline when the camera turns.
    for yy in range(0,int(h)-4,3):
        for face in [-1,1]:
            if random.random()<.8:
                zz=z+face*(d/2+.015);hh=.09 if i%3 else .22
                add(violet if i%3 else pink,[(x-w*.36,yy-hh,zz),(x+w*.36,yy-hh,zz),(x+w*.36,yy+hh,zz),(x-w*.36,yy+hh,zz)],[(0,1,2,3)])
            if random.random()<.6:
                xx=x+face*(w/2+.015)
                add(cyan if i%5==0 else violet,[(xx,yy-.06,z-d*.32),(xx,yy+.06,z-d*.32),(xx,yy+.06,z+d*.32),(xx,yy-.06,z+d*.32)],[(0,1,2,3)])
    if i%4==0:
        tube(cyan,[(x+w*.42,-3,z-d*.5),(x+w*.42,h-5,z-d*.5)],.04,4)
        box('Tower crown',(x,h-4.5,z),(w*.7,1,d*.7),purple,.1)
    if i%5==0:
        tube(violet,[(x,h-5,z),(x,h+2,z)],.05,5)

# Bake into one mesh per material. Coordinates map x,y,z -> Blender x,-z,y for glTF.
asset_objs=[]
for name,(verts,faces,smooth) in GEO.items():
    if not verts:continue
    mesh=bpy.data.meshes.new(name+' baked geometry')
    mesh.from_pydata([(x,-z,y)for x,y,z in verts],[],faces);mesh.update()
    obj=bpy.data.objects.new('NEON / '+name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(MATS[name])
    for p,s in zip(mesh.polygons,smooth):p.use_smooth=s
    obj['asset']='Neon Wilds — original Blender sanctuary';asset_objs.append(obj)
# Export assets before adding render-only light/camera stage.
bpy.ops.object.select_all(action='DESELECT')
for o in asset_objs:o.select_set(True)
bpy.context.view_layer.objects.active=asset_objs[0]
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False)
triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in asset_objs)
report={'asset':'Neon Wilds sanctuary','generator':'tools/build_neon_world.py','blender_version':bpy.app.version_string,'coordinates':'Three.js x/y/z; y-up GLB','source':'source/neon-world.blend','glb_bytes':OUT.stat().st_size,'triangle_count':triangles,'meshes':len(asset_objs),'draw_calls':len(asset_objs),'materials':[{'name':m.name,'roughness':m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value,'emission':m.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value}for m in MATS.values()], 'collision_contract':'Blocking floor scenery exactly matches world.json colliders and surfaces. Decorative vaults/canopies start above 4.5m. Holographic ferns are pass-through. Perimeter lies just outside world bounds.','features':['Connected individually beveled paver ground and flush navigation inlays','Suspended rose/cyan jellyfish conservatory with curved translucent bell and 14 sculpted tentacles','Blue diamond arcade with three swept titanium vaults and faceted divider','Amber foundry with detailed finned machine, turbine canopy and socket routes','Aurora crown with six curved structural ribs, exact continuous ramp and elevated deck','Seven collision-matched obstacles, holographic fern gardens, occluding secret screens','Layered cyberwave skyline beyond the traversable boundary','Two optional elevated secret gardens with exact JSON-authored ramps and decks'],'spec_id':SPEC['id'],'world_spec_sha256':hashlib.sha256((ROOT/'dist/neon/world.json').read_bytes()).hexdigest()}
REPORT.write_text(json.dumps(report,indent=2)+'\n')
# Renderable editable source scene; no older source files are read or overwritten.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.world.color=(.025,.025,.025);scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.026,.016,.068,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
scene.view_settings.view_transform='AgX'
def light(name,pos,power,color,size=15):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=(pos[0],-pos[2],pos[1])
    target=Vector((pos[0],-pos[2],0));obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
for name,pos,power,col in [('Moon',(0,45,4),90000,(.35,.46,1)),('Warm rim',(-34,25,-15),32000,(1,.10,.43)),('Arcade',(24,24,-20),22000,(.10,.72,1)),('Foundry',(25,20,18),18000,(1,.38,.08))]:light(name,pos,power,col,35)
camd=bpy.data.cameras.new('Sanctuary overview');cam=bpy.data.objects.new('Sanctuary overview',camd);scene.collection.objects.link(cam)
cam.location=(77,-86,85);target=Vector((0,6,3));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camd.type='PERSP';camd.lens=46;camd.clip_end=500;scene.camera=cam
scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(PREVIEW)
# Browser renderer owns bloom; this proof preserves raw physically lit materials.
def proof_camera(name, pos, target, lens=30):
    data=bpy.data.cameras.new(name);data.lens=lens;data.clip_end=500
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj)
    obj.location=(pos[0],-pos[2],pos[1]);aim=Vector((target[0],-target[2],target[1]))
    obj.rotation_euler=(aim-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj
arrival_camera=proof_camera('Arrival eye level',(0,7.5,27),(0,5,-12),24)
conservatory_camera=proof_camera('Conservatory eye level',(-11,6,14),(-27,8,-5),30)
secret_garden_camera=proof_camera('Secret garden ramps',(45,7,39),(35,1.6,27),36)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
print('NEON_ASSET_READY '+json.dumps({'bytes':OUT.stat().st_size,'triangles':triangles,'meshes':len(asset_objs),'blend':str(BLEND)}),flush=True)
if '--skip-render' not in sys.argv:
    bpy.ops.render.render(write_still=True)
    for rendercam,suffix in [(arrival_camera,'arrival'),(conservatory_camera,'conservatory'),(secret_garden_camera,'secret-garden')]:
        scene.camera=rendercam;scene.render.filepath=str(WORK/('neon-world-'+suffix+'.png'))
        scene.render.resolution_x=1400;scene.render.resolution_y=900
        bpy.ops.render.render(write_still=True)
print('NEON_BUILD_COMPLETE',flush=True)
