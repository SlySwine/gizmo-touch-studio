"""Build Gizmo's tactile dream-world geometry with stock Blender only.

Run: Blender --background --factory-startup --threads 2 --python this_file.
This generator opens no existing scenes. Source Blender Z maps to glTF Y.
"""
import bpy, math, os, json, time, random, bmesh
from mathutils import Vector, Matrix

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'dist','assets');WORK=os.path.join(os.path.dirname(ROOT),'assets-work')
os.makedirs(OUT,exist_ok=True);os.makedirs(WORK,exist_ok=True)
START=time.time();TAU=math.tau;RNG=random.Random(60104)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
GROUPS=[]

def lin(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def mat(name,color,rough=.25,metal=0,trans=0,alpha=1,emission=0):
    rgb=[lin(int(color[i:i+2],16)/255) for i in (0,2,4)]
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,alpha);m.use_nodes=True;m.use_backface_culling=False
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,alpha)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;p.inputs['Transmission Weight'].default_value=trans
    p.inputs['IOR'].default_value=1.38 if 'membrane' in name else 1.46
    p.inputs['Alpha'].default_value=alpha
    if emission:p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=emission
    if alpha<1:m.surface_render_method='DITHERED'
    return m

M={
 'membrane':mat('membrane_opaline','B5E8F1',.15,0,.68,.70),
 'petal':mat('membrane_petal','E3B8EE',.23,0,.24,.94),
 'center':mat('membrane_landing_center','D2F1EC',.31,0,.08,1),
 'glass':mat('glass_clear_cyan','99DDF0',.055,0,.82,.93),
 'violet':mat('glass_amethyst','BFA8EF',.075,0,.80,.94),
 'rose':mat('glass_rose','F3B6D7',.11,0,.63,.95),
 'gold':mat('gold_brushed_champagne','D8BC78',.25,.82),
 'palegold':mat('gold_pale_edges','EEDBA6',.18,.70),
 'canal':mat('canal_cyan_luminous','6AECE5',.28,.05,0,1,.42),
 'organ':mat('canal_rose_organs','EDA5DD',.26,0,.12,1,.22),
 'pearl':mat('glass_moon_pearl','E4DFFA',.19,.14,.26),
}

def group(name):
    ob=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(ob);ob['asset_name']=name;GROUPS.append(ob);return ob

def mesh(name,verts,faces,parent,material,uv=None,smooth=True):
    me=bpy.data.meshes.new(name+'Geometry');me.from_pydata(verts,[],faces);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);ob.parent=parent;me.materials.append(material)
    for p in me.polygons:p.use_smooth=smooth
    layer=me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        for li in p.loop_indices:
            vi=me.loops[li].vertex_index;layer.data[li].uv=uv[vi] if uv else (verts[vi][0],verts[vi][2])
    return ob

def modifier(ob,kind,name,**props):
    bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
    m=ob.modifiers.new(name,kind)
    for key,value in props.items():setattr(m,key,value)
    bpy.ops.object.modifier_apply(modifier=m.name)

def tube(name,path,radii,parent,material,sides=8):
    verts=[];faces=[];uv=[];last=None
    for j,p in enumerate(path):
        p=Vector(p);tan=Vector(path[min(j+1,len(path)-1)])-Vector(path[max(0,j-1)])
        if tan.length<1e-8:tan=Vector((0,0,1))
        tan.normalize();axis=Vector((0,0,1))
        if abs(tan.dot(axis))>.90:axis=Vector((1,0,0))
        side=tan.cross(axis).normalized();up=side.cross(tan).normalized()
        radius=radii[j] if isinstance(radii,list) else radii
        for k in range(sides+1):
            a=TAU*k/sides;verts.append(tuple(p+radius*(side*math.cos(a)+up*math.sin(a))));uv.append((k/sides,j/(len(path)-1)))
        if j:
            for k in range(sides):
                a=(j-1)*(sides+1)+k;b=j*(sides+1)+k;faces.append((a,a+1,b+1,b))
    faces.append(tuple(range(sides-1,-1,-1)));base=(len(path)-1)*(sides+1);faces.append(tuple(base+i for i in range(sides)))
    return mesh(name,verts,faces,parent,material,uv)

def sphere(name,center,radii,parent,material,seg=48,rings=24,organic=0):
    verts=[];faces=[];uv=[]
    for j in range(rings+1):
        t=math.pi*j/rings
        for i in range(seg+1):
            a=TAU*i/seg;d=1+organic*math.sin(a*3+math.sin(t*2))*math.sin(t)**2
            verts.append((center[0]+radii[0]*math.sin(t)*math.cos(a)*d,center[1]+radii[1]*math.sin(t)*math.sin(a)*d,center[2]+radii[2]*math.cos(t)))
            uv.append((i/seg,j/rings))
    for j in range(rings):
        for i in range(seg):
            a=j*(seg+1)+i;faces.append((a,a+1,a+seg+2,a+seg+1))
    return mesh(name,verts,faces,parent,material,uv)

def ring(name,radius,thickness,center,parent,material,rotation=None,start=0,end=TAU,steps=128):
    center=Vector(center);rot=rotation or Matrix.Identity(3)
    path=[center+rot@Vector((radius*math.cos(start+(end-start)*j/steps),radius*math.sin(start+(end-start)*j/steps),0)) for j in range(steps+1)]
    return tube(name,path,thickness,parent,material,8)

def join_material_parts(parent,keep=()):
    buckets={}
    for o in list(parent.children):
        if o.type=='MESH' and o.name not in keep:buckets.setdefault(o.data.materials[0].name,[]).append(o)
    for material,obs in buckets.items():
        if len(obs)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in obs:o.select_set(True)
        bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();obs[0].name=parent.name+'_'+material

def jelly():
    g=group('JellyBell');verts=[];faces=[];uv=[];segments=80;rows=25
    def point(t,a):
        theta=t*math.pi*.5;radius=.82*math.sin(theta)*(1+.052*math.cos(a*8)*t**6)
        z=.085+.635*math.cos(theta)**1.12+.050*math.cos(a*8)*t**8
        return Vector((radius*math.cos(a),radius*math.sin(a),z))
    for j in range(rows+1):
        t=j/rows
        for i in range(segments+1):
            a=TAU*i/segments;verts.append(tuple(point(t,a)));uv.append((i/segments,t))
    for j in range(rows):
        for i in range(segments):
            q=j*(segments+1)+i;faces.append((q,q+1,q+segments+2,q+segments+1))
    bell=mesh('JellyMembrane',verts,faces,g,M['membrane'],uv)
    modifier(bell,'SOLIDIFY','Real umbrella thickness',thickness=.011,offset=-1)
    tube('JellyScallopedRim',[point(1,TAU*j/160) for j in range(161)],.012,g,M['membrane'],6)
    for k in range(8):
        angle=TAU*k/8;path=[]
        for j in range(31):
            t=.13+.865*j/30;p=point(t,angle);p.z-=.020;path.append(p)
        tube('JellyRadialCanal%02d'%k,path,[.008+.008*j/30 for j in range(31)],g,M['canal'],6)
        # A genuine medusa carries branched canals near its scalloped margin.
        for side in (-1,1):
            pp=[]
            for j in range(15):
                t=.67+.33*j/14;a=angle+side*.23*(j/14)**1.1;p=point(t,a);p.z-=.019;pp.append(p)
            tube('JellyCanalBranch',pp,.005,g,M['canal'],5)
    for k in range(4):
        a=TAU*k/4;cx=.155*math.cos(a);cy=.155*math.sin(a);path=[]
        for j in range(49):
            b=a+.39+(TAU-.78)*j/48;path.append((cx+.105*math.cos(b),cy+.105*math.sin(b),.525+.014*math.sin(b*2)))
        tube('JellyGonad%02d'%k,path,.022,g,M['organ'],8)
    sphere('JellyInnerStomach',(0,0,.468),(.12,.12,.065),g,M['organ'],32,14)
    join_material_parts(g,('JellyMembrane','JellyScallopedRim','JellyInnerStomach'))
    g['top_anchor']=.72;g['placement']='Umbrella top Y .72; scalloped rim near Y .085. Attach animated tentacles under the rim.'
jelly()

def petal(name,angle,start,length,width,drop,parent,material,rows=20,cols=8,twist=0):
    verts=[];faces=[];uv=[]
    for j in range(rows+1):
        t=j/rows;r=start+length*t;a=angle+twist*math.sin(t*math.pi)
        side=Vector((-math.sin(a),math.cos(a),0));mid=Vector((r*math.cos(a),r*math.sin(a),-.012-drop*t**1.8))
        w=width*math.sin(math.pi*t)**.64
        for k in range(cols+1):
            s=k/cols*2-1;p=mid+side*w*s
            p.z+=.045*s*s*math.sin(math.pi*t)-.035*math.sin(math.pi*t)
            verts.append(tuple(p));uv.append((k/cols,t))
    for j in range(rows):
        for k in range(cols):
            q=j*(cols+1)+k;faces.append((q,q+cols+1,q+cols+2,q+1))
    ob=mesh(name,verts,faces,parent,material,uv);modifier(ob,'SOLIDIFY','Petal shell thickness',thickness=.012,offset=-1)
    return ob

def lotus():
    g=group('LotusPlatform')
    for k in range(12):petal('LotusOuterPetal',k/12*TAU,.20,.80,.225,.21,g,M['petal'],18,6,.09)
    for k in range(8):petal('LotusInnerPetal',(k+.5)/8*TAU,.12,.70,.24,.095,g,M['membrane'],18,6,-.06)
    # Flat opaque landing center with an organically rounded underside.
    verts=[];uv=[];faces=[];seg=80
    profile=[(0,0),(.18,0),(.34,0),(.425,-.002),(.455,-.019),(.442,-.067),(.36,-.13),(.19,-.19),(0,-.20)]
    for j,(r,z) in enumerate(profile):
        for i in range(seg+1):
            a=TAU*i/seg;verts.append((r*math.cos(a),r*math.sin(a),z));uv.append((.5+r*math.cos(a),.5+r*math.sin(a)))
    for j in range(len(profile)-1):
        for i in range(seg):
            q=j*(seg+1)+i;faces.append((q,q+1,q+seg+2,q+seg+1))
    mesh('LotusLandingCenter',verts,faces,g,M['center'],uv)
    # Fine stamen-like luminous ribs make the form read as living glass.
    for k in range(16):
        a=(k+.25)/16*TAU;path=[]
        for j in range(16):
            t=j/15;r=.46+.35*t;path.append((r*math.cos(a),r*math.sin(a),-.021-.077*t*t))
        tube('LotusPetalVein',path,.005,g,M['canal'],5)
    join_material_parts(g,('LotusLandingCenter',))
    g['placement']='Diameter 2.0 across petal tips. Flat landing center Y=0; all petal edges droop below the landing plane.'
lotus()

def crystal(name,base,radius,height,parent,material,lean=(0,0),sides=6):
    verts=[];faces=[];uv=[]
    for j,(r,z) in enumerate([(radius*.82,0),(radius,.035*height),(radius,.71*height),(radius*.93,.77*height)]):
        for i in range(sides):
            a=TAU*i/sides+.16;verts.append((base[0]+r*math.cos(a)+lean[0]*z,base[1]+r*math.sin(a)+lean[1]*z,base[2]+z));uv.append((i/sides,z/height))
    tip=len(verts);verts.append((base[0]+lean[0]*height+radius*.12,base[1]+lean[1]*height-radius*.09,base[2]+height));uv.append((.5,1))
    for j in range(3):
        for i in range(sides):q=j*sides+i;faces.append((q,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,q+sides))
    for i in range(sides):faces.append((3*sides+i,3*sides+(i+1)%sides,tip))
    faces.append(tuple(range(sides-1,-1,-1)))
    ob=mesh(name,verts,faces,parent,material,uv,False)
    modifier(ob,'BEVEL','Polished facet arris',width=.006,segments=2)
    modifier(ob,'WEIGHTED_NORMAL','Crystal facet normals',keep_sharp=True)
    return ob

def crystals():
    g=group('CrystalCluster')
    settings=[(0,0,.24,1.50,0,.02),(-.34,.07,.18,.98,-.16,.05),(.29,.19,.17,1.18,.13,.13),(.20,-.29,.17,.72,.22,-.18),(-.21,-.27,.13,.58,-.22,-.15),(-.17,.33,.15,.79,-.1,.20),(.52,.00,.10,.47,.25,.03)]
    for k,(x,y,r,h,lx,ly) in enumerate(settings):crystal('Crystal%02d'%k,(x,y,0),r,h,g,M['violet'] if k%3==0 else M['glass'],(lx,ly))
    join_material_parts(g)
crystals()

def prism():
    g=group('PrismRelay');center=Vector((0,0,.78));verts=[tuple(center+Vector(p)) for p in [(0,0,.78),(0,0,-.78),(.45,0,0),(0,.45,0),(-.45,0,0),(0,-.45,0)]]
    faces=[(0,2,3),(0,3,4),(0,4,5),(0,5,2),(1,3,2),(1,4,3),(1,5,4),(1,2,5)]
    ob=mesh('RelayPrism',verts,faces,g,M['glass'],smooth=False);modifier(ob,'BEVEL','Diamond polished edges',width=.007,segments=2)
    modifier(ob,'WEIGHTED_NORMAL','Diamond face normals',keep_sharp=True)
    for axis in range(2):
        rot=Matrix.Rotation(math.radians(66 if axis==0 else -53),3,'X')@Matrix.Rotation(math.radians(20 if axis==0 else 52),3,'Z')
        for k in range(12):ring('RelayGoldSegment',.69 if axis==0 else .60,.015,center,g,M['gold'],rot,start=k*TAU/12+.035,end=(k+1)*TAU/12-.035,steps=10)
        ring('RelayCanalRing',.655 if axis==0 else .57,.006,center,g,M['canal'],rot,steps=96)
    for k in range(6):
        a=k/6*TAU;sphere('RelayGoldBead',(.69*math.cos(a),.22*math.sin(a),.78+.48*math.sin(a)),(.026,)*3,g,M['palegold'],16,8)
    join_material_parts(g,('RelayPrism',))
prism()

def orrery():
    g=group('Orrery');center=Vector((0,0,1.13))
    sphere('OrreryCentralPearl',center,(.22,)*3,g,M['pearl'],48,24)
    settings=[(1.08,19,0),(.87,76,32),(.64,-54,71)]
    for k,(radius,tilt,yaw) in enumerate(settings):
        rot=Matrix.Rotation(math.radians(yaw),3,'Z')@Matrix.Rotation(math.radians(tilt),3,'X')
        ring('OrreryOrbit%02d'%k,radius,.013 if k else .019,center,g,M['gold'],rot)
        for j in range(2 if k else 3):
            a=.5+j*TAU/(2 if k else 3)+k*.43;p=center+rot@Vector((radius*math.cos(a),radius*math.sin(a),0))
            sphere('OrreryPlanet%d_%d'%(k,j),p,(.066+.018*j,)*3,g,M['violet'] if (j+k)%2 else M['glass'],24,12)
        # Precision orbital tick marks add close-range craft detail.
        for j in range(24):
            a=j/24*TAU;p=center+rot@Vector((radius*math.cos(a),radius*math.sin(a),0));d=rot@Vector((0,0,.025 if j%3==0 else .013))
            tube('OrreryTick',[p-d,p+d],.004,g,M['palegold'],5)
    for k in range(3):
        a=k/3*TAU;path=[]
        for j in range(31):
            t=j/30;r=.52*(1-t)+.12*t;aa=a+.5*math.sin(t*math.pi);path.append((r*math.cos(aa),r*math.sin(aa),.025+1.0*t))
        tube('OrrerySupport',path,[.027-.015*j/30 for j in range(31)],g,M['gold'],8)
    keep=tuple(o.name for o in g.children if o.name.startswith(('OrreryOrbit','OrreryPlanet','OrreryCentral')))
    join_material_parts(g,keep)
orrery()

def gate():
    g=group('GateFrame')
    def arch(t,scale=1):
        a=math.pi*t;return Vector((1.02*math.cos(a)*scale,.026*math.sin(a*4),.03+2.62*math.sin(a)**.73*scale))
    for k in (-1,1):
        path=[]
        for j in range(121):
            t=j/120;p=arch(t);p.y+=k*.065;p.x+=k*.015*math.sin(t*math.pi*6);path.append(p)
        tube('GateGoldArch',path,.024,g,M['gold'],8)
    tube('GateInnerCanal',[arch(j/120,.928)+Vector((0,0,.016)) for j in range(121)],.017,g,M['canal'],8)
    for side in (-1,1):
        # Mirrored whiplash curves and open leaf tracery are architectural,
        # luminous Art Nouveau ornament rather than an earthly stone arch.
        for k in range(5):
            z=.28+k*.39;cx=side*(1.08-.045*k);path=[]
            for j in range(65):
                a=TAU*j/64;x=cx+side*.145*math.sin(a)*math.sin(a*.5)**2
                path.append((x,.005+ .025*math.sin(a),z+.265*math.cos(a)))
            tube('GateLeafTracery',path,.013,g,M['palegold'],6)
        for k in range(2):
            path=[]
            for j in range(61):
                t=j/60;path.append((side*(1.04+.16*math.sin(t*TAU)*(1-t)),.04*math.cos(t*math.pi+k),.01+1.35*t))
            tube('GateRootFlourish',path,.018,g,M['gold'],7)
    sphere('GateCrownPearl',(0,0,2.77),(.085,.055,.135),g,M['pearl'],32,16)
    for side in (-1,1):crystal('GateRootGem',(side*1.02,0,0),.07,.23,g,M['rose'],(0,0))
    join_material_parts(g,('GateCrownPearl',))
gate()

def engine():
    g=group('DreamEngine');center=Vector((0,0,1.03))
    sphere('EngineOrb',center,(.64,.64,.69),g,M['glass'],64,32,.025)
    sphere('EngineCore',center,(.205,.205,.25),g,M['organ'],40,20,.025)
    for k in range(2):ring('EngineInnerCanal',.345,.009,center,g,M['canal'],Matrix.Rotation(math.radians(45+k*90),3,'X'),steps=96)
    for k in range(5):
        a=k/5*TAU;verts=[];faces=[];uv=[];rows=36;cols=6;edges=[[],[]]
        for j in range(rows+1):
            t=j/rows;r=.22+.66*math.sin(math.pi*t)**.8;angle=a+.40*t
            z=.025+1.96*t;mid=Vector((r*math.cos(angle),r*math.sin(angle),z));side=Vector((-math.sin(angle),math.cos(angle),0))
            width=.105*math.sin(math.pi*t)**.62
            for m in range(cols+1):
                s=m/cols*2-1;p=mid+side*width*s
                p+=Vector((math.cos(angle),math.sin(angle),0))*.023*(1-s*s)*math.sin(math.pi*t)
                verts.append(tuple(p));uv.append((m/cols,t))
                if m==0:edges[0].append(p)
                if m==cols:edges[1].append(p)
        for j in range(rows):
            for m in range(cols):q=j*(cols+1)+m;faces.append((q,q+1,q+cols+2,q+cols+1))
        ob=mesh('EnginePetalArm',verts,faces,g,M['petal'],uv);modifier(ob,'SOLIDIFY','Arm shell thickness',thickness=.021,offset=0)
        for edge in edges:tube('EngineGoldArmEdge',edge,.011,g,M['palegold'],6)
    ring('EngineBaseHalo',.245,.021,(0,0,.05),g,M['gold'],steps=80)
    join_material_parts(g,('EngineOrb','EngineCore'))
engine()

# Clean repeated seam/pole vertices without losing UV loop data.
for ob in bpy.context.scene.objects:
    if ob.type!='MESH':continue
    bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0000005)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()
    ob['asset_group']=ob.parent.name if ob.parent else '';ob['generator']='tools/build_dream_assets.py'

report={'generator':'tools/build_dream_assets.py','seed':60104,'blender':bpy.app.version_string,'coordinates':'glTF +Y up/+Z forward; source Blender x,z,-y; top-level group origins remain at zero.','groups':[]}
for parent in GROUPS:
    obs=[o for o in parent.children_recursive if o.type=='MESH'];pts=[];vertices=triangles=0
    for ob in obs:
        ob.data.calc_loop_triangles();vertices+=len(ob.data.vertices);triangles+=len(ob.data.loop_triangles)
        pts.extend((v.co.x,v.co.z,-v.co.y) for v in ob.data.vertices)
    report['groups'].append({'name':parent.name,'vertices':vertices,'triangles':triangles,'bounds':{'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)]},'meshes':[o.name for o in obs],'materials':sorted(set(m.name for o in obs for m in o.data.materials)),'placement':parent.get('placement','Base near Y=0; exact bounds supplied for placement.')})
report['vertices']=sum(g['vertices'] for g in report['groups']);report['triangles']=sum(g['triangles'] for g in report['groups'])
report['source_blend']='assets-work/dream-kit.blend (outside repository)';report['material_note']='Glass and membrane are separate transmissive PBR materials; canals have restrained emission; gold parts are metallic. All meshes have UVs. Renderer can replace materials independently by name.'
bpy.context.scene['kit_note']='Tangible magical objects: jelly anatomy, living petals, optical prisms, celestial mechanisms. No geology assets or original scenes read.'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK,'dream-kit.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'dream-kit.glb'),export_format='GLB',export_yup=True,export_animations=False,export_extras=True,export_apply=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
report['glb_bytes']=os.path.getsize(os.path.join(OUT,'dream-kit.glb'));report['elapsed_seconds']=time.time()-START
with open(os.path.join(OUT,'dream-kit-report.json'),'w') as f:json.dump(report,f,indent=2)
print('DREAM_KIT_REPORT '+json.dumps(report))
