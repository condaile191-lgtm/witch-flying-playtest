import * as THREE from 'three';

export class ChapterVisuals {
  constructor(chapter) {
    this.c = chapter;
    this.effects = [];
    this.gates = [];
    this.structures = [];
    this.rotors = [];
    this.clock = 0;
    this.surfaceMeshes = [];
    fetch('./assets/chapter/gate-dressing.json').then(r=>{if(!r.ok)throw Error('Gate asset failed');return r.json();}).then(data=>{
      this.dressing=new THREE.BufferGeometry();
      for(const [name,size] of Object.entries({position:3,normal:3,aUv:2,aCol:4,aMw:1,aAo:1})) this.dressing.setAttribute(name,new THREE.Float32BufferAttribute(data[name],size));
      this.dressing.computeBoundingSphere();
    }).catch(console.error);
    const loader = new THREE.TextureLoader();
    const texture = loader.load('./assets/textures/flagstone_c.webp');
    texture.colorSpace = THREE.SRGBColorSpace;
    const normal = loader.load('./assets/textures/flagstone_n.webp');
    this.stone = new THREE.MeshStandardMaterial({map:texture, normalMap:normal, roughness:.92, color:0xc5b99c});
    this.wood = new THREE.MeshStandardMaterial({color:0x765039,roughness:.9});
    this.metal = new THREE.MeshStandardMaterial({color:0x3d5061,metalness:.65,roughness:.3});
    this.magic = new THREE.MeshBasicMaterial({color:0x9af9ff});
    const scene=chapter.game.pipeline.overlay;
    scene.add(new THREE.HemisphereLight(0xe1f5ff,0x554b37,2));
    const sun=new THREE.DirectionalLight(0xffecc5,3);sun.position.set(-100,160,-80);scene.add(sun);
    this.lock=document.createElement('div');this.lock.className='enemy-lock';this.lock.hidden=true;this.lock.innerHTML='<i></i><span>锁定 · J 爆破</span>';document.body.append(this.lock);
  }
  box(group,x,y,w,h,d,material) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,0);group.add(mesh);
    if(material===this.stone||material===this.wood) this.surfaceMeshes.push({mesh,materialId:material===this.wood?4:0});
    return mesh;
  }
  obstacle(s,kind,opening=0) {
    const c=this.c,group=new THREE.Group(),parts=[];
    group.position.copy(c.point(s));
    const t=c.curve.getTangentAt(s/c.length);group.rotation.y=Math.atan2(-t.x,-t.z);
    const add=(x,y,w,h)=>{
      const mesh=this.box(group,x,y,w,h,2.4,s<600?this.wood:this.stone);
      parts.push({s,x,h:y,w,ht:h,mesh,gone:false});

    };
    if(kind==='rotor') {
      for(let i=0;i<4;i++) {
        add(0,5,2.3,8);
        const blade=parts[parts.length-1];
        this.surfaceMeshes[this.surfaceMeshes.length-1].materialId=4;
        const cloth=new THREE.Mesh(new THREE.PlaneGeometry(1.7,6.4,3,8),new THREE.MeshStandardMaterial({color:0xf0dfb5,roughness:1,side:THREE.DoubleSide}));
        cloth.position.z=1.3;blade.mesh.add(cloth);
        this.rotors.push({blade,phase:i*Math.PI/2});
      }
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(1.25,1.25,3.3,16),this.wood);hub.rotation.x=Math.PI/2;group.add(hub);parts.push({s,x:0,h:0,w:2.5,ht:2.5,mesh:hub,gone:false});
    } else if(kind==='ring') {
      const count=20,r=7.2;
      for(let i=0;i<count;i++) {const a=i/count*Math.PI*2;add(Math.cos(a)*r,Math.sin(a)*r,2.3,2.3);}
      for(let x=-18;x<18;x+=3)for(let y=-9;y<11;y+=2){const cx=x+1.5,cy=y+1;if(Math.hypot(cx,cy)>9)add(cx,cy,2.92,1.92);}
    } else {
      const holes=kind==='windows'?[[-7,1],[7,1]]:[[opening,kind==='high'?3:0]];
      // Tiled masonry shares the exact visible and collidable opening layout.
      for(let x=-18;x<18;x+=3)for(let y=-9;y<11;y+=2) {
        const cx=x+1.5,cy=y+1;
        if(holes.some(([hx,hy])=>Math.abs(cx-hx)<4.8&&Math.abs(cy-hy)<4.5))continue;
        add(cx,cy,2.92,1.92);
      }
      for(const [hx,hy] of holes) {
        this.gates.push({group,hx,hy,decorated:false});
        this.box(group,hx-4.7,hy, .35,9.4,2.8,this.wood);
        this.box(group,hx+4.7,hy, .35,9.4,2.8,this.wood);
        this.box(group,hx,hy+4.6,9.7,.45,2.8,this.wood);
        const lintel=this.box(group,hx,hy+5.2,10.4,.65,3,this.stone);
        const rune=new THREE.Mesh(new THREE.TorusGeometry(.45,.07,8,20),this.magic);rune.position.set(hx,hy+5.2,-1.6);group.add(rune);
      }
    }
    if(kind!=='rotor') {
      for(let x=-16;x<=16;x+=4) {
        this.box(group,x,11.2,2.2,1.8,2.8,s<600?this.wood:this.stone);
      }
    }
    c.group.add(group);this.structures.push({s,group,kind,parts});
    for(const o of parts)o.baseX=o.x;return parts;
  }
  enemy() {
    // Reuse the actual authored rider asset, including cloth/hat/lantern materials and mesh detail.
    const g=new THREE.Group();
    const rider=this.c.game.rider.model.clone(true);
    rider.scale.multiplyScalar(1.35);
    g.add(rider);
    const aura=new THREE.Mesh(new THREE.TorusGeometry(2.1,.045,8,64),new THREE.MeshBasicMaterial({color:0xb6ecff,transparent:true,opacity:.55}));
    aura.position.y=.3;g.add(aura);
    return g;
  }
  burst(position,color=0xffd28a) {
    this.c.game.sound.blast(true);
    const mat=new THREE.MeshBasicMaterial({color,transparent:true});
    for(let i=0;i<22;i++) {
      const m=new THREE.Mesh(new THREE.TetrahedronGeometry(.15+Math.random()*.45),mat.clone());m.position.copy(position);this.c.group.add(m);
      this.effects.push({mesh:m,life:.7+Math.random()*.5,total:1.2,v:new THREE.Vector3(Math.random()-.5,Math.random()-.2,Math.random()-.5).multiplyScalar(19)});
    }
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.08,8,40),mat.clone());ring.position.copy(position);ring.quaternion.copy(this.c.game.camera.quaternion);this.c.group.add(ring);this.effects.push({mesh:ring,life:.4,total:.4,ring:true});
  }
  bolt(from,to,onHit,targetRef=null) {
    const g=new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(.35,12,8),new THREE.MeshBasicMaterial({color:0xfff5c7})));
    const tail=new THREE.Mesh(new THREE.ConeGeometry(.28,4,12),new THREE.MeshBasicMaterial({color:0xffa64b,transparent:true,opacity:.65}));tail.rotation.x=Math.PI/2;tail.position.z=1.5;g.add(tail);
    g.position.copy(from);g.lookAt(to);this.c.group.add(g);this.effects.push({mesh:g,life:.23,total:.23,from:from.clone(),to:to.clone(),onHit,targetRef});
  }
  clearEffects() {
    for(const e of this.effects){this.c.group.remove(e.mesh);e.mesh.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});}
    this.effects.length=0;
  }
  update(dt) {
    this.clock+=dt*(this.c.slowTime>0?.42:1);
    for(const rotor of this.rotors) {
      const a=this.clock*.48+rotor.phase,o=rotor.blade;
      o.x=Math.sin(a)*5;o.h=Math.cos(a)*5;o.angle=-a;
      o.mesh.position.set(o.x,o.h,0);o.mesh.rotation.z=o.angle;
    }
    for(const structure of this.structures) {
      structure.group.visible=structure.s>this.c.s-35&&structure.s<this.c.s+420;
      if(structure.kind==='slider') {
        const shift=Math.sin(this.clock*.55)*3;
        structure.group.position.copy(this.c.point(structure.s,shift));
        for(const o of structure.parts)o.x=o.baseX+shift;
      }
    }
    if(this.c.game.town.material) for(const item of this.surfaceMeshes) {
      if(item.ready)continue;
      const g=item.mesh.geometry,p=g.attributes.position,n=g.attributes.normal;
      const uv=[],col=[],mw=[],ao=[];
      for(let i=0;i<p.count;i++) {
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
        uv.push((Math.abs(n.getX(i))>.5?z:x)*256,y*256);
        col.push(1,.96,.86,0);mw.push(item.materialId);ao.push(.88);
      }
      g.setAttribute('aUv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('aCol',new THREE.Float32BufferAttribute(col,4));g.setAttribute('aMw',new THREE.Float32BufferAttribute(mw,1));g.setAttribute('aAo',new THREE.Float32BufferAttribute(ao,1));
      item.mesh.material=this.c.game.town.material;item.mesh.renderOrder=290;item.ready=true;
    }
    if(this.dressing && this.c.game.town.material) for(const gate of this.gates) {
      if(gate.decorated)continue;
      const mesh=new THREE.Mesh(this.dressing,this.c.game.town.material);
      mesh.position.set(gate.hx,gate.hy,0);mesh.renderOrder=290;gate.group.add(mesh);gate.decorated=true;
    }
    for(let i=this.effects.length-1;i>=0;i--) {
      const e=this.effects[i];e.life-=dt;
      if(e.targetRef)e.to.copy(e.targetRef.position);
      if(e.from)e.mesh.position.lerpVectors(e.from,e.to,Math.min(1,1-e.life/e.total));
      else if(e.ring)e.mesh.scale.setScalar(1+(1-e.life/e.total)*9);
      else {e.mesh.position.addScaledVector(e.v,dt);e.v.y-=dt*12;e.mesh.rotation.x+=dt*4;}
      if(e.mesh.material)e.mesh.material.opacity=Math.max(0,e.life/e.total);
      if(e.life<=0){e.onHit?.();this.c.group.remove(e.mesh);e.mesh.traverse(m=>{m.geometry?.dispose();if(m.material&&!Object.values(this).includes(m.material))m.material.dispose();});this.effects.splice(i,1);}
    }
    const target=this.c.active?this.c.target():null;
    this.lock.hidden=!target;
    if(target){this.c.game.camera.updateMatrixWorld(true);const p=target.mesh.position.clone().project(this.c.game.camera);this.lock.hidden=p.z>1;this.lock.style.left=`${(p.x*.5+.5)*innerWidth}px`;this.lock.style.top=`${(-p.y*.5+.5)*innerHeight}px`;}
  }
}
