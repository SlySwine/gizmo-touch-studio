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
ink=material('Midnight titanium',(.024,.033,.065),.44,.39)
slate=material('Blue-black ceramic',(.043,.066,.092),.22,.53)
tile=material('Wet obsidian pavers',(.027,.043,.062),.24,.57)
tile2=material('Wet indigo pavers',(.037,.047,.069),.23,.55)
path=material('Pearlescent route alloy',(.075,.13,.16),.35,.45)
chrome=material('Brushed pale titanium',(.28,.34,.44),.7,.32)
purple=material('Amethyst architectural enamel',(.135,.035,.215),.66,.23)
rose=material('Plum conservatory enamel',(.22,.035,.13),.52,.29)
crystal=material('Optical blue crystal',(.07,.20,.35),.66,.12)
cyan=material('Cyan photon strips',(.02,.64,.78),.2,.3,.65)
pink=material('Rose photon strips',(.72,.035,.24),.2,.3,.6)
violet=material('Violet photon strips',(.26,.075,.62),.2,.34,.55)
gold=material('Amber reactor light',(.78,.30,.04),.35,.3,.7)
white=material('Cool white light',(.38,.57,.7),.2,.35,.4)
leaf=material('Holographic fern blades',(.025,.16,.155),.2,.36,.06)
leaf2=material('Iridescent fern reverse',(.12,.035,.115),.24,.4,.04)
glass=material('Lucent membrane',(.10,.22,.33),.23,.18,.05,.32)
moss=material('Moss velvet',(.024,.051,.06),.02,.91)
water=material('Still cyan water',(.012,.073,.088),.61,.17,.06)
brass=material('Terrace garden brass',(.22,.16,.10),.65,.42)
petal=material('Nocturnal iris petals',(.18,.045,.22),.24,.4,.08)

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
    vs=[]; previous_axis=None
    for i,p in enumerate(points):
        p=Vector(p); tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        tangent.normalize()
        # Parallel transport avoids visible profile flips when a rib becomes nearly vertical.
        if previous_axis is None:
            guide=Vector((0,1,0)) if abs(tangent.y)<.92 else Vector((1,0,0));a=tangent.cross(guide).normalized()
        else:
            a=previous_axis-tangent*previous_axis.dot(tangent)
            if a.length_squared<.00001:a=tangent.cross(Vector((1,0,0))if abs(tangent.x)<.9 else Vector((0,1,0)))
            a.normalize()
        previous_axis=a.copy(); b=tangent.cross(a).normalized()
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
    for frond in range(5):
        theta=angle+frond*math.tau/5; length=scale*random.uniform(1.2,2); high=scale*random.uniform(.65,1.5)
        pts=[]
        for j in range(9):
            t=j/8; rr=length*t;pts.append((x+rr*math.cos(theta),base+.05+high*math.sin(t*math.pi*.69),z+rr*math.sin(theta)))
        tube(brass if frond%3==0 else leaf,pts,.016*scale,3)
        for j in range(2,8):
            t=j/8; v=Vector(pts[j]); size=scale*.40*math.sin(t*math.pi); side=Vector((-math.sin(theta),0,math.cos(theta)))
            forward=Vector((math.cos(theta),.22,math.sin(theta)))
            for sign in [-1,1]:
                tip=v+sign*side*size-forward*size*.3;mid=(v+tip)*.5+Vector((0,.075*scale,0))
                add(leaf if (j+frond)%2 else leaf2,[tuple(v),tuple(mid+forward*size*.18),tuple(tip),tuple(mid-forward*size*.18)],[(0,1,2),(0,2,3)],True)

def ribbon(mat, points, widths, axis=(1,0,0)):
    """A sculpted, convex leaf or canopy panel, not a billboard."""
    axis=Vector(axis); verts=[]
    for i,(point,width) in enumerate(zip(points,widths)):
        p=Vector(point);verts.extend([tuple(p-axis*width),tuple(p+Vector((0,.07*width,0))),tuple(p+axis*width)])
    faces=[]
    for j in range(len(points)-1):
        faces.extend([(j*3,j*3+1,(j+1)*3+1,(j+1)*3),(j*3+1,j*3+2,(j+1)*3+2,(j+1)*3+1)])
    add(mat,verts,faces,True)

def iris(x,z,base=0,scale=1):
    """Tangible folded leaves and a small porcelain-luminous seed."""
    h=scale*random.uniform(.9,1.65)
    tube(brass,[(x,base,z),(x-.08*scale,base+h*.5,z),(x,base+h,z)],.025*scale,5)
    for k in range(6):
        angle=k*math.tau/6+random.uniform(-.1,.1)
        direction=Vector((math.cos(angle),0,math.sin(angle)))
        sideways=(-math.sin(angle),0,math.cos(angle));pts=[]
        for j in range(6):
            t=j/5;rr=scale*.70*math.sin(t*math.pi*.60)
            v=Vector((x,base+h*.55+scale*.52*math.sin(t*math.pi*.7),z))+direction*rr;pts.append(tuple(v))
        ribbon(petal if k%2 else leaf2,pts,[.015,.13,.19,.18,.10,.0],sideways)
    prism(pink,(x,base+h,z),.06*scale,.23*scale,5)

def grove(x,z,base=0,scale=1):
    """Soft planting goes inside a solid planter or outside the playable boundary."""
    fern(x,z,scale,base=base)
    for i in range(3):
        a=i*2.4+random.random();rr=scale*.7
        iris(x+math.cos(a)*rr,z+math.sin(a)*rr,base,scale*.65)

def court(x,z,w,d,mat,accent):
    # Courts are deliberately flush; the contrasting infill implies a room at ground level.
    box('District court',(x,-.005,z),(w,.027,d),mat,.18)
    for side in [-1,1]:
        box('Court inset border',(x+side*(w/2-.20),.011,z),(.10,.027,d-.35),brass,.009)
        box('Court inset border',(x,.011,z+side*(d/2-.20)),(w-.35,.027,.10),brass,.009)
        box('Recessed district drain',(x+side*(w/2-.43),.020,z),(.28,.020,d-.55),ink,.006)
        box('Recessed district drain',(x,.020,z+side*(d/2-.43)),(w-.55,.020,.28),ink,.006)
    for side in [-1,1]:
        box('Threshold light',(x+side*(w/2-.50),.025,z),(.035,.026,d*.55),accent,.005)

def planted_bed(c):
    x,z,w,d,h=c['x'],c['z'],c['width'],c['depth'],c['height']
    box(c['id'],(x,h/2,z),(w,h,d),slate,.19)
    box('Garden brass coping',(x,h-.08,z),(w-.04,.16,d-.04),brass,.08)
    box('Velvet planted bed',(x,h+.012,z),(w-.32,.06,d-.32),moss,.06)
    for j in range(max(2,int(d/1.7))):
        zz=z-d/2+.7+j*(d-1.4)/max(1,int(d/1.7)-1)
        for xx in [x-w*.25,x+w*.25]:grove(xx,zz,h+.04,.70+random.random()*.28)
    # Only two short low-output inserts, not a bright outline around every solid object.
    for zz in [z-d*.25,z+d*.25]:box('Garden marker',(x+w/2+.005,h*.55,zz),(.025,.14,.45),violet,.004)

def support(c,accent):
    x,z,w,d,h=c['x'],c['z'],c['width'],c['depth'],c['height']
    box(c['id'],(x,h/2,z),(w,h,d),ink,.1)
    box('Pedestal sole',(x,.12,z),(w,.24,d),brass,.045)
    box('Pedestal collar',(x,h-.17,z),(w,.28,d),chrome,.04)
    for xx in [x-w*.31,x+w*.31]:box('Structural flute',(xx,h*.5,z+d/2+.001),(.045,h*.76,.04),chrome,.009)
    box('Pillar light',(x,h*.6,z-d/2-.01),(.08,.45,.025),accent,.007)

def arch_between(start,end,apex,mat=chrome,r=.16):
    pts=[]
    for j in range(41):
        t=j/40; p=Vector(start)*(1-t)**2+Vector(apex)*2*t*(1-t)+Vector(end)*t*t;pts.append(tuple(p))
    tube(mat,pts,r,8)
    tube(brass,[(x,y-.10,z)for x,y,z in pts],r*.2,5)

def conservatory_rib(start,end):
    a,b=Vector(start),Vector(end);outward=Vector((a.x-b.x,0,a.z-b.z)).normalized()
    first=a+Vector((0,4.5,0));second=b+outward*2.8
    pts=[]
    for j in range(41):
        t=j/40;v=a*(1-t)**3+first*3*t*(1-t)**2+second*3*t*t*(1-t)+b*t**3;pts.append(tuple(v))
    tube(chrome,pts,.18,10)
    tube(brass,[tuple(b+outward*.25),tuple(b-outward*.12)],.25,12)

# The sanctuary is a connected inhabited basin, not a board suspended in empty space.
# A continuous architectural landmass seats every perimeter garden and skyline tower.
box('Outer city foundation',(0,-8.1,-3),(192,6.1,182),ink,.35)
box('Raised sanctuary plinth',(0,-3.5,-4),(102,6.1,98),slate,.25)
box('Sanctuary foundation',(0,-.52,-4),(88,1.0,84),ink,.16)
# Quiet small slabs have a staggered bond, rather than an infinite luminous grid.
for ix in range(22):
    for iz in range(21):
        xx=-42+ix*4; zz=-44+iz*4
        box('Sanctuary paver',(xx,-.033,zz),(3.984,.06,3.984),tile2 if (ix+iz)%5==0 else tile,.025)
# One strong promenade leads from arrival through Luma to the Spire.
for j in range(27):
    z=27-j*2
    plane(path,(0,.014,z),9,1.974)
    for side in [-1,1]:
        box('Promenade brass edge',(side*4.62,.019,z),(.085,.028,1.93),brass,.008)
        if j%3==0:box('Promenade recessed light',(side*4.42,.023,z),(.035,.025,.75),cyan,.004)
# Branches are broad, physically paved routes, with a restrained destination-colored seam.
for x in range(-39,40,2):
    if abs(x)>5:
        plane(path,(x,.014,-2),1.974,6)
        for z in [-5.05,1.05]:
            box('Crosswalk brass',(x,.020,z),(1.93,.025,.075),brass,.005)
            if (x+39)%6==0:box('Crosswalk glint',(x,.026,z-.11),(.8,.022,.03),pink if x<0 else cyan,.003)
# Southeast diagonal access reads as a route, rather than an isolated dotted line.
start=Vector((4.4,.018,16));end=Vector((26,.018,22.2));direction=(end-start).normalized();across=Vector((-direction.z,0,direction.x))*2.4
add(path,[tuple(start-across),tuple(start+across),tuple(end+across),tuple(end-across)],[(0,1,2,3)])
for sign in [-1,1]:
    tube(brass,[tuple(start+across*sign+Vector((0,.025,0))),tuple(end+across*sign+Vector((0,.025,0)))],.027,5)
for x,z in [(0,16),(0,-16),(-13,-2),(12,-2),(16,18)]:
    for off in [-.23,.23]:tube(brass,[(x-.12,.03,z+.15+off),(x,.03,z+off),(x+.12,.03,z+.15+off)],.02,4)
# The Atrium's medallion is a quiet material change; Luma alone supplies the moving focal cue.
cylinder(path,(0,.010,5),6.7,.017,80)
ring(brass,0,.024,5,6.5,.035,steps=80)
ring(slate,0,.026,5,5.7,.055,steps=72)
for i in range(16):
    a=i*math.tau/16
    box('Atrium radial engraving',(6.15*math.cos(a),.023,5+6.15*math.sin(a)),(.045,.028,.22),chrome,.004)
# District rooms have their own paving laid into the same ground plane.
court(-28,-1,25,30,slate,pink)
court(23,-19,28,25,tile2,cyan)
court(25,18,24,23,slate,gold)
# Fine entrance joints and dark drainage establish a tactile scale at the Arcade threshold.
for xx in [11.7,13.4,15.1,16.8,18.5,20.2,21.9,23.6,25.3,27.0,28.7,30.4,32.1]:
    box('Arcade entrance paving',(xx,.032,-7.35),(1.65,.019,1.20),path,.014)
    box('Arcade entrance joint',(xx,.047,-7.97),(1.5,.012,.035),brass,.002)
# Foliage and low masses frame the first view and conceal distant mechanisms until approached.
for c in SPEC['colliders']:
    if c['id'].startswith(('garden-threshold-','arrival-bed-')):planted_bed(c)

# Conservatory: scalloped flush pool pattern and tall sculptural jellyfish canopy.
for r in [5.0,8.8]:ring(brass,-26,.029,-1,r,.027,steps=72)
for i in range(18):
    a=i*math.tau/18; rr=11.8
    ring(slate,-26+rr*math.cos(a),.022,-1+rr*math.sin(a),.7,.025,steps=20)
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
    tube(brass if k%2 else chrome,[(cx+bellr*math.sin(j/30*math.pi/2)*math.cos(a),belly+4.8*math.cos(j/30*math.pi/2),cz+bellr*math.sin(j/30*math.pi/2)*math.sin(a))for j in range(31)],.055,6)
ring(chrome,cx,belly,cz,bellr,.16,steps=96)
ring(pink,cx,belly-.10,cz,bellr,.035,steps=96)
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
# Four real footings carry the conservatory bell. Their solid extents are shared with physics.
for c in SPEC['colliders']:
    if c['id'].startswith('conservatory-post'):
        support(c,pink)
        a=math.atan2(c['z']-cz,c['x']-cx)
        end=(cx+bellr*math.cos(a),belly,cz+bellr*math.sin(a))
        conservatory_rib((c['x'],c['height'],c['z']),end)
# A flush pearlescent inlay under the nursery suggests a sheltered sanctuary pool without a pit.
cylinder(water,(-26,.033,-1),3.2,.016,72)
for r in [1.8,2.6,3.14]:ring(brass,-26,.046,-1,r,.018,steps=60)

# Prism Arcade: diamond plaza, floating swept vaults, collision-matched divider.
for i in range(7):
    x=11+i*4
    for j in range(5):
        z=-9-j*4
        add(crystal,[(x,.014,z-1.35),(x+1.35,.014,z),(x,.014,z+1.35),(x-1.35,.014,z)],[(3,2,1,0)])
        tube(brass,[(x,.032,z-1.35),(x+1.35,.032,z),(x,.032,z+1.35)],.014,4)
for z in [-9,-20,-27]:
    pts=[(22+12*math.cos(t),5.2+8.0*math.sin(t),z)for t in [i*math.pi/48 for i in range(49)]]
    tube(chrome,pts,.26,8);tube(cyan,[(x,y-.22,zz)for x,y,zz in pts],.03,6)
    # Three supported vault bays have a broad translucent roof, not merely floating wires.
    for off in [-.95,.95]:tube(brass,[(x,y,zz+off)for x,y,zz in pts],.07,6)
    ribbon(glass,[(x,y-.035,zz)for x,y,zz in pts],[.96]*len(pts),(0,0,1))
for c in SPEC['colliders']:
    if c['id'].startswith('arcade-post'):support(c,cyan)
box('Arcade divider base',(22,.4,-18),(2.5,.8,8),ink,.15)
# Continuous glazed volume makes the full 3m collision height legible when jumping.
box('Arcade divider glass',(22,1.9,-18),(2.5,2.2,8),glass,.025)
for xedge in [20.75,23.25]:
    tube(cyan,[(xedge,.81,-22),(xedge,2.99,-22),(xedge,2.99,-14),(xedge,.81,-14)],.025,5)
for zedge in [-22,-14]:tube(cyan,[(20.75,2.99,zedge),(23.25,2.99,zedge)],.025,5)
for z in [-21,-18.5,-16]:
    prism(crystal,(22,1.85,z),1.12,2.3,5)
    tube(cyan,[(21.1,.82,z),(22,3,z),(22.9,.82,z)],.025,4)
# The view between vaults stays clear: freestanding plants no longer masquerade as obstacles.
# Refractive sculpture suspended over center aisle, no action-target duplication.
for angle in [0,math.pi/3,math.pi*2/3]:
    pts=[]
    for j in range(65):
        t=j*math.tau/64;pts.append((27+3*math.cos(t)*math.cos(angle),9+4.6*math.sin(t),-25+3*math.cos(t)*math.sin(angle)))
    tube(chrome,pts,.075,6)
prism(violet,(27,9,-25),.55,3,6)
tube(brass,[(27,12.5,-27),(27,12.5,-25),(27,9,-25)],.045,5)

# Foundry: inset octagon reactor floor and a collision-matched machine.
ring(brass,25,.03,18,10,.04,steps=80)
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
for c in SPEC['colliders']:
    if c['id'].startswith('foundry-post'):
        support(c,gold)
        a=math.atan2(c['z']-18,c['x']-25)
        end=(25+6.8*math.cos(a),11,18+6.8*math.sin(a))
        arch_between((c['x'],c['height'],c['z']),end,((c['x']+end[0])*.5,13,(c['z']+end[2])*.5),chrome,.24)
        # Vented buttress cap reads as machinery attached to a working power hall.
        for j in range(3):box('Foundry vertical inset',(c['x'],2+j*1.35,c['z']+.626),(.45,.16,.025),brass,.01)


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


# Authored vertical geography comes directly from the same manifest as the simulation.
# Powered bridge and moving ferry/lift are deliberately rendered by the scene module.
# Every static ramp has a solid grounded side and a physically continuous top surface.
for q in SPEC['surfaces']:
    if q['id'].startswith('spire-') or q.get('requires'):continue
    x,z,w,d=q['x'],q['z'],q['width'],q['depth']
    accent=gold if q['id'].startswith(('maintenance','east-terrace')) else (cyan if q['id'].startswith('prism-') else pink)
    if q['type']=='ramp':
        lo,hi=q['low'],q['high']; axis=q['axis']
        corners=[(-w/2,d/2),(w/2,d/2),(w/2,-d/2),(-w/2,-d/2)]
        def surface_height(dx,dz):
            t=(dx/w+.5) if axis=='+x' else (.5-dx/w) if axis=='-x' else (dz/d+.5) if axis=='+z' else (.5-dz/d)
            return lo+(hi-lo)*t
        vs=[(x+dx,surface_height(dx,dz),z+dz)for dx,dz in corners]+[(x+dx,-.025,z+dz)for dx,dz in corners]
        add(path,vs,[(0,1,2,3),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0),(4,7,6,5)])
        if axis.endswith('z'):
            for dx in [-w/2+.12,w/2-.12]:tube(brass,[(x+dx,surface_height(dx,d/2)+.028,z+d/2),(x+dx,surface_height(dx,-d/2)+.028,z-d/2)],.035,5)
            for j in range(1,7):
                dz=d/2-d*j/7;yy=surface_height(0,dz)+.018;tube(chrome,[(x-w/2+.25,yy,z+dz),(x+w/2-.25,yy,z+dz)],.014,4)
        else:
            for dz in [-d/2+.12,d/2-.12]:tube(brass,[(x-w/2,surface_height(-w/2,dz)+.028,z+dz),(x+w/2,surface_height(w/2,dz)+.028,z+dz)],.035,5)
            for j in range(1,7):
                dx=-w/2+w*j/7;yy=surface_height(dx,0)+.018;tube(chrome,[(x+dx,yy,z-d/2+.25),(x+dx,yy,z+d/2-.25)],.014,4)
    else:
        h=q['height'];box(q['id'],(x,h/2,z),(w,h,d),ink,.07)
        plane(path,(x,h+.011,z),w-.12,d-.12)
        # Layered vertical fascia makes the elevated promenade visibly part of this place.
        for yy in [.2,h*.55,h-.18]:
            for zz in [z-d/2-.009,z+d/2+.009]:box('Terrace fascia',(x,yy,zz),(w-.1,.07,.04),brass,.008)
            for xx in [x-w/2-.009,x+w/2+.009]:box('Terrace fascia',(xx,yy,z),(.04,.07,d-.1),brass,.008)
        tube(accent,[(x-w/2+.06,h+.023,z+d/2-.06),(x-w/2+.06,h+.023,z-d/2+.06),(x+w/2-.06,h+.023,z-d/2+.06)],.02,5)
        ring(brass,x,h+.027,z,min(w,d)*.31,.025,steps=36)
        # Soft perimeter planting does not add raised invisible fences to the navigation surface.
        for xx,zz in [(x-w/2+.45,z-d/2+.5),(x-w/2+.45,z+d/2-.5)]:grove(xx,zz,h+.02,.65)
        if q['id']=='west-overlook':
            for zz in [z-2,z,z+2]:fern(x-w/2+.45,zz,1.05,base=h+.02)
        if q['id']=='east-terrace':
            for zz in [z-3,z,z+3]:iris(x+w/2-.4,zz,h+.02,1.0)

# The dormant prism crossing spans a visibly inset, safe shallow lightwater channel.
box('Light canal basin',(25,.006,-35),(16,.018,7.3),ink,.08)
box('Prism canal water',(25,.020,-35),(15.65,.015,6.95),water,.06)
for zz in [-38.52,-31.48]:
    box('Canal edge coping',(25,.026,zz),(16.1,.06,.20),brass,.025)
    for xx in [18.5,22.8,27.2,31.5]:box('Canal inlaid glimmer',(xx,.047,zz),(.6,.018,.03),cyan,.003)
# Keep the water ungridded so it cannot be mistaken for ordinary tiled paving.
# A restrained animated caustic layer in scene.js gives this static basin gentle motion.
# Ferry and lift docks use sober brass sockets. Animated active cues belong to scene.js.
for t in SPEC.get('transports',[]):
    for endpoint in ['from','to']:
        p=t[endpoint];accent=pink if t['kind']=='jelly' else gold
        cylinder(path,(p['x'],p['y']+.012,p['z']),1.45,.022,40)
        ring(brass,p['x'],p['y']+.029,p['z'],1.39,.045,steps=40)
        for j in range(4):
            a=j*math.pi/2
            box('Dock engraved quadrant',(p['x']+1.14*math.cos(a),p['y']+.035,p['z']+1.14*math.sin(a)),(.08,.027,.24),accent,.008)

# Two recorded screens hide secrets while remaining visually honest about solid extents.
for cid in ['secret-garden-screen','secret-west-screen']:
    c=next(c for c in SPEC['colliders'] if c['id']==cid)
    x,z,w,d,h=c['x'],c['z'],c['width'],c['depth'],c['height']
    box(cid,(x,h/2,z),(w,h,d),ink,.12)
    for zz in [z-d*.36,z-d*.12,z+d*.12,z+d*.36]:
        box('Secret screen louver',(x,h*.6,zz),(w+.01,h*.7,.13),purple,.03)
    for xx in [x-w/2+.10,x+w/2-.10]:box('Secret screen filament',(xx,h*.75,z),(.06,.055,d-.3),pink,.01)
    fern(x,z,.65,base=h)
# Terraced perimeter: a continuous close garden wall, mid-distance architecture, then skyline.
# All opaque masses below lie outside the playable boundary; the matching camera shell is in scene.js.
for side in [-1,1]:
    x=side*45.1
    box('Enclosing sanctuary wall',(x,1.55,-4),(1.2,3.1,86),slate,.14)
    box('Wall brass cap',(x,3.11,-4),(1.2,.13,86),brass,.045)
    box('Outer planted retaining bed',(side*49.0,1.0,-4),(6.4,2,94),ink,.18)
    box('Outer soil',(side*49.0,2.005,-4),(5.9,.035,93.6),moss,.03)
    for z in range(-44,39,7):
        box('Wall panel footing',(x-side*.63,.62,z),(.07,.9,4.8),ink,.035)
        box('Wall recessed light',(x-side*.66,1.92,z),(.025,.16,1.0),pink if side<0 else cyan,.01)
        if side<0:
            # Conservatory bays alternate dark plum and planting; clustered taller blooms soften the wall.
            if -30<z<20:box('Conservatory wall inset',(x-side*.655,1.45,z),(.028,1.9,5.4),rose if z%2 else ink,.008)
            cluster=math.exp(-((z+16)/7)**2)+math.exp(-((z-7)/7)**2)
            for shift in [-1.1,1.5]:grove(side*(47.5+random.random()*1.2),z+shift,2.04,.8+cluster*.65+random.random()*.2)
        elif z<0:
            # Cool optical insets continue the Arcade's material language into its backdrop.
            box('Arcade outer glazing',(x-side*.655,1.6,z),(.035,1.9,5.25),crystal,.008)
            for zz in [z-1.6,z,z+1.6]:box('Glazed bay mullion',(x-side*.684,1.6,zz),(.024,1.95,.04),chrome,.007)
            grove(side*48.8,z,2.04,1.05+random.random()*.2)
        else:
            # The Foundry rests against a darker mechanical retaining wall, with quiet recessed louvers.
            box('Foundry dark bay',(x-side*.655,1.45,z),(.035,2.1,5.35),ink,.008)
            for yy in [1.0,1.42,1.84]:box('Foundry retaining louver',(x-side*.687,yy,z),(.025,.07,4.1),brass,.006)
            grove(side*49.1,z+1.0,2.04,.95+random.random()*.2)
    # Lower belt below the wall prevents the near ground ever appearing unsupported.
    for y,xx in [(-.8,52),(-2.8,56),(-4.4,60)]:
        box('Tiered city belt',(side*xx,y,-4),(6,1.6,104),ink,.16)
        box('Tiered belt trim',(side*(xx-2.7),y+.8,-4),(.06,.025,102),violet,.007)
for z in [-47.1,39.1]:
    box('Enclosing sanctuary wall',(0,1.55,z),(89,3.1,1.2),slate,.14)
    box('Wall brass cap',(0,3.11,z),(89,.13,1.2),brass,.045)
    sign=-1 if z<0 else 1
    box('End garden terrace',(0,1.0,z+sign*4),(94,2,6.4),ink,.18)
    box('End garden soil',(0,2.005,z+sign*4),(93.6,.035,5.9),moss,.03)
    for x in range(-42,43,7):
        box('End panel footing',(x,.62,z-sign*.63),(4.8,.9,.07),ink,.035)
        box('End recessed light',(x,1.92,z-sign*.66),(1.0,.16,.025),violet,.01)
        grove(x,z+sign*3.2,2.04,1.2+random.random()*.5)
    for y,zz in [(-.8,z+sign*7),(-2.8,z+sign*11),(-4.4,z+sign*15)]:
        box('Tiered end city belt',(0,y,zz),(110,1.6,6),ink,.16)
# A folded botanical arcade grows from outer beds and frames a real skyline beyond.
for i,(x,z) in enumerate([(-49,-32),(-49,-13),(-49,9),(-49,30),(49,-30),(49,-10),(49,10),(49,30),(-30,44),(-10,44),(12,44),(32,44),(-30,-52),(28,-52)]):
    h=12+(i%4)*1.7
    tube(brass,[(x,2,z),(x+.7,5,z-.3),(x-.3,h*.75,z+.2),(x,h,z)],.22,8)
    for k in range(5):
        a=k*math.tau/5+i*.37;rr=3.7+(k%2)*1.1
        end=(x+math.cos(a)*rr,h-1.5,z+math.sin(a)*rr)
        pts=[]
        for j in range(9):
            t=j/8;pts.append((x+math.cos(a)*rr*t,h-3+3.2*math.sin(t*math.pi*.6),z+math.sin(a)*rr*t))
        tube(leaf,pts,.075,6)
        ribbon(leaf if k%2 else leaf2,pts,[0,.2,.45,.7,.8,.72,.55,.28,0],(-math.sin(a),0,math.cos(a)))
        iris(end[0],end[2],end[1],.45)
# Architectural skyline has shared podiums. No tower bottom floats in the sky color.
for side in [-1,1]:
    box('City district podium',(side*70,-2.0,-4),(20,6,116),slate,.3)
for z in [-69,62]:box('City end podium',(0,-2.0,z),(160,6,18),slate,.3)
for i in range(32):
    side=i%4
    if side==0:x,z=-68+(i//4)*19,random.uniform(-75,-64)
    elif side==1:x,z=random.uniform(67,75),-54+(i//4)*15
    elif side==2:x,z=random.uniform(-75,-67),-54+(i//4)*15
    else:x,z=-68+(i//4)*19,random.uniform(59,66)
    w,d,h=random.uniform(4,8),random.uniform(4,7),random.uniform(13,29)
    box('Distant sanctuary architecture',(x,1+h/2,z),(w,h,d),ink,.20)
    # Grounded stepped crowns and restrained window rhythm, not neon monolith billboards.
    box('Skyline crown',(x,h+1.2,z),(w*.72,.4,d*.72),slate,.10)
    for yy in range(5,int(h)+1,3):
        for face in [-1,1]:
            if random.random()<.65:
                zz=z+face*(d/2+.013)
                add(violet if i%3 else pink,[(x-w*.3,yy-.05,zz),(x+w*.3,yy-.05,zz),(x+w*.3,yy+.05,zz),(x-w*.3,yy+.05,zz)],[(0,1,2,3)])
    if i%4==0:prism(crystal,(x,h+2.2,z),w*.25,2.4,6)

# Bake into one mesh per material. Coordinates map x,y,z -> Blender x,-z,y for glTF.
asset_objs=[]
for name,(verts,faces,smooth) in GEO.items():
    if not verts:continue
    mesh=bpy.data.meshes.new(name+' baked geometry')
    mesh.from_pydata([(x,-z,y)for x,y,z in verts],[],faces);mesh.update()
    obj=bpy.data.objects.new('NEON / '+name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(MATS[name])
    for p,s in zip(mesh.polygons,smooth):p.use_smooth=s
    # World-scaled UVs support subtle browser material grain on the actual exported mesh.
    if name in [path,tile,tile2]:
        uv=mesh.uv_layers.new(name='PhysicalScale')
        for poly in mesh.polygons:
            normal=poly.normal; axis=max(range(3),key=lambda k:abs(normal[k]))
            axes=[k for k in range(3)if k!=axis]
            for loop_idx in poly.loop_indices:
                v=mesh.vertices[mesh.loops[loop_idx].vertex_index].co
                uv.data[loop_idx].uv=(v[axes[0]]*.25,v[axes[1]]*.25)
    obj['asset']='Neon Wilds — original Blender sanctuary';asset_objs.append(obj)
# Export assets before adding render-only light/camera stage.
bpy.ops.object.select_all(action='DESELECT')
for o in asset_objs:o.select_set(True)
bpy.context.view_layer.objects.active=asset_objs[0]
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False)
triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in asset_objs)
report={'asset':'Neon Wilds garden sanctuary','generator':'tools/build_neon_world.py','blender_version':bpy.app.version_string,'coordinates':'Three.js x/y/z; y-up GLB','source':'source/neon-world.blend','glb_bytes':OUT.stat().st_size,'triangle_count':triangles,'meshes':len(asset_objs),'draw_calls':len(asset_objs),'materials':[{'name':m.name,'roughness':m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value,'emission':m.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value}for m in MATS.values()], 'collision_contract':'Opaque geometry inside the playable boundary matches world.json colliders and surfaces. Canopy ribs begin above shared solid support posts. Soft foliage is pass-through. Enclosing walls lie outside world bounds, with camera shells supplied in scene.js. Dynamic powered bridge, ferry and lift are authored by scene.js from the same manifest.','features':['Quiet connected avenue and broad district approaches, physically scaled UVs and restrained recessed lighting','Five collision-matched planted threshold beds, folded irises and sculpted soft ferns','Rose conservatory with four grounded structural supports and translucent curved botanical canopy','Blue prism court with six solid pillars supporting three glazed vault bays','Amber foundry with four grounded pylons carrying the detailed overhead turbine','Aurora crown, exact continuous ramp and elevated deck','Manifest-authored west overlook, east terrace, prism access ramps and two secret gardens','Inset shallow lightwater canal plus static brass ferry and lift docks','Continuous enclosing garden wall with tiered foundation, planted outer arcades and skyline podiums'],'spec_id':SPEC['id'],'world_spec_sha256':hashlib.sha256((ROOT/'dist/neon/world.json').read_bytes()).hexdigest()}
REPORT.write_text(json.dumps(report,indent=2)+'\n')
# Renderable editable source scene; no older source files are read or overwritten.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
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
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(PREVIEW)
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
arcade_camera=proof_camera('Prism court at eye level',(18,4,-2),(23,4,-23),25)
foundry_camera=proof_camera('Foundry at eye level',(24,5,33),(25,4,12),27)
overlook_camera=proof_camera('West overlook at eye level',(-37,6,-33),(-24,5,-9),28)
foundry_approach_camera=proof_camera('Foundry from hub',(10,4.5,18),(26,4,19),28)
# Keep source revisions in Git; this only disables a redundant backup within this Blender process.
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
print('NEON_ASSET_READY '+json.dumps({'bytes':OUT.stat().st_size,'triangles':triangles,'meshes':len(asset_objs),'blend':str(BLEND)}),flush=True)
if '--skip-render' not in sys.argv:
    bpy.ops.render.render(write_still=True)
    for rendercam,suffix in [(arrival_camera,'arrival'),(conservatory_camera,'conservatory'),(arcade_camera,'arcade'),(foundry_camera,'foundry'),(overlook_camera,'overlook'),(foundry_approach_camera,'foundry-approach')]:
        scene.camera=rendercam;scene.render.filepath=str(WORK/('neon-world-'+suffix+'.png'))
        scene.render.resolution_x=1200;scene.render.resolution_y=800
        bpy.ops.render.render(write_still=True)
print('NEON_BUILD_COMPLETE',flush=True)
