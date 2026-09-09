/* Local-first community adapter. A Supabase-backed adapter can replace this without changing Studio UI. */
(function(root){
  'use strict';
  const KEY='jsscc-studio-v1';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const now=()=>new Date().toISOString();
  const id=()=>crypto.randomUUID?.()||('local-'+Date.now()+'-'+Math.random().toString(16).slice(2));
  const blankStore=()=>({profile:{username:'LocalComposer',displayName:'Local Composer'},projects:[],songs:[],likes:[],favorites:[]});
  function load(){try{return {...blankStore(),...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch{return blankStore();}}
  function save(store){localStorage.setItem(KEY,JSON.stringify(store));}
  function demoProject(title,bpm=120){
    const tracks=[
      {id:'pulse1',name:'Pulse 1',instrument:'square',volume:85},
      {id:'pulse2',name:'Pulse 2',instrument:'square',volume:72},
      {id:'triangle',name:'Triangle',instrument:'triangle',volume:82},
      {id:'noise',name:'Noise',instrument:'noise',volume:68}
    ];
    const pattern={id:'A',name:'A',notes:{pulse1:[],pulse2:[],triangle:[],noise:[]}};
    [0,4,8,12,16,20,24,28,32,36,40,44,48,52,56,60].forEach((step,i)=>pattern.notes.pulse1.push({step,pitch:[60,64,67,72][i%4],length:2,velocity:96}));
    [0,8,16,24,32,40,48,56].forEach((step,i)=>pattern.notes.triangle.push({step,pitch:[36,36,41,43][i%4],length:6,velocity:88}));
    for(let step=0;step<64;step+=4)pattern.notes.noise.push({step,pitch:36+(step/4)%4,length:1,velocity:75});
    return {version:1,id:id(),title,bpm,bars:4,scale:'C Minor',tracks,patterns:{A:pattern},currentPattern:'A',structure:['A'],createdAt:now(),updatedAt:now()};
  }
  const demos=[
    {id:'demo-neon-boss',title:'Neon Boss Battle',authorUsername:'ChipFox',authorDisplayName:'ChipFox',description:'Boss theme rápido hecho con pulse, triangle y noise.',bpm:168,scaleName:'C Minor',durationSeconds:91,tags:['boss','retro','chiptune'],plays:8420,likesCount:324,remixesCount:47,createdAt:'2026-09-08T20:00:00Z',visibility:'public',project:demoProject('Neon Boss Battle',168)},
    {id:'demo-forest',title:'Forest Save Point',authorUsername:'PixelFern',authorDisplayName:'Pixel Fern',description:'Tema corto y tranquilo para una zona de descanso.',bpm:104,scaleName:'C Major',durationSeconds:68,tags:['chill','forest','game'],plays:2160,likesCount:91,remixesCount:12,createdAt:'2026-09-09T02:30:00Z',visibility:'public',project:demoProject('Forest Save Point',104)},
    {id:'demo-stage',title:'Stage 1 — Boot Sequence',authorUsername:'ByteCat',authorDisplayName:'ByteCat',description:'Loop arcade para una primera fase.',bpm:132,scaleName:'A Minor',durationSeconds:54,tags:['arcade','loop'],plays:835,likesCount:44,remixesCount:8,createdAt:'2026-09-09T07:10:00Z',visibility:'public',project:demoProject('Stage 1 — Boot Sequence',132)}
  ];
  function normalizeProject(p){const q=clone(p);q.id=q.id||id();q.updatedAt=now();q.createdAt=q.createdAt||q.updatedAt;return q;}
  function duration(project){const patterns=Math.max(1,project.structure?.length||1),bars=Math.max(1,+project.bars||4),bpm=Math.max(20,+project.bpm||120);return patterns*bars*4*60/bpm;}
  class LocalCommunity {
    constructor(){this.mode='local';this.remote=false;}
    profile(){return load().profile;}
    async listSongs({sort='trending',q=''}={}){
      const store=load(),mine=store.songs.filter(s=>s.visibility==='public');
      let songs=[...demos.map(clone),...mine].map(s=>({...s,liked:store.likes.includes(s.id),favorited:store.favorites.includes(s.id)}));
      const needle=q.trim().toLowerCase();if(needle)songs=songs.filter(s=>[s.title,s.authorUsername,...(s.tags||[])].join(' ').toLowerCase().includes(needle));
      if(sort==='new')songs.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
      else songs.sort((a,b)=>((b.likesCount||0)*5+(b.remixesCount||0)*8+Math.log((b.plays||0)+1))-((a.likesCount||0)*5+(a.remixesCount||0)*8+Math.log((a.plays||0)+1)));
      return songs;
    }
    async getSong(songId){
      const store=load(),song=demos.find(s=>s.id===songId)||store.songs.find(s=>s.id===songId);
      if(!song)throw Error('Canción no encontrada');
      return {...clone(song),liked:store.likes.includes(songId),favorited:store.favorites.includes(songId)};
    }
    async saveProject(project){
      const store=load(),p=normalizeProject(project),i=store.projects.findIndex(x=>x.id===p.id);
      if(i>=0)store.projects[i]=p;else store.projects.unshift(p);save(store);return clone(p);
    }
    async listProjects(){return clone(load().projects);}
    async deleteProject(projectId){const s=load();s.projects=s.projects.filter(x=>x.id!==projectId);save(s);}
    async publish(project,{title,description='',visibility='private',tags=[]}={}){
      const store=load(),p=await this.saveProject(project),song={id:id(),title:(title||p.title||'Sin título').trim().slice(0,100),authorUsername:store.profile.username,authorDisplayName:store.profile.displayName,description:String(description).slice(0,1000),bpm:p.bpm,scaleName:p.scale||'Chromatic',durationSeconds:duration(p),visibility:['private','unlisted','public'].includes(visibility)?visibility:'private',tags:[...new Set(tags.map(x=>String(x).trim().toLowerCase()).filter(Boolean))].slice(0,8),plays:0,likesCount:0,remixesCount:0,createdAt:now(),project:clone(p),remixOf:p.remixOf||null};
      store.songs.unshift(song);save(store);return clone(song);
    }
    async recordPlay(songId){const s=load(),song=s.songs.find(x=>x.id===songId);if(song){song.plays=(song.plays||0)+1;save(s);return song.plays;}return null;}
    async toggleLike(songId){const s=load(),i=s.likes.indexOf(songId),active=i<0;if(active)s.likes.push(songId);else s.likes.splice(i,1);const song=s.songs.find(x=>x.id===songId);if(song)song.likesCount=Math.max(0,(song.likesCount||0)+(active?1:-1));save(s);return active;}
    async toggleFavorite(songId){const s=load(),i=s.favorites.indexOf(songId),active=i<0;if(active)s.favorites.push(songId);else s.favorites.splice(i,1);save(s);return active;}
    async listFavorites(){const s=load(),all=[...demos,...s.songs];return clone(all.filter(x=>s.favorites.includes(x.id)));}
    async remix(songId){
      const src=await this.getSong(songId),store=load(),project=normalizeProject(src.project||demoProject(src.title,src.bpm));
      project.id=id();project.title=(src.title+' (Remix)').slice(0,100);project.remixOf=songId;project.remixCredit={songId,title:src.title,author:src.authorUsername};project.createdAt=now();project.updatedAt=project.createdAt;
      store.projects.unshift(project);const localSong=store.songs.find(x=>x.id===songId);if(localSong)localSong.remixesCount=(localSong.remixesCount||0)+1;save(store);return clone(project);
    }
  }
  // Future remote adapter: configure window.JSSCC_COMMUNITY_CONFIG={supabaseUrl,anonKey} and
  // replace the LocalCommunity methods with Supabase RPC/table calls. The Studio code depends only on this interface.
  root.JSSCCCommunity=new LocalCommunity();
})(globalThis);
