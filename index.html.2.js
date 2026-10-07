const NAV=[['home','⌂','Home'],['setlists','☷','Setlists'],['songs','♫','Songs'],['pads','▦','Cue Pads'],['lyrics','▤','Lyrics'],['media','▣','Media'],['tv','▱','TV Display'],['settings','⚙','Settings'],['backup','☁','Backup'],['help','?','Help']];
const DB_NAME='ShowCueMediaDB',DB_VER=1,STORE='files';
let dbPromise=null,displayWindow=null,autoTimer=null,displayChannel=null;
try{displayChannel=new BroadcastChannel('showcue-tv-display-v42')}catch(e){displayChannel=null}
let state={padCount:Number(localStorage.getItem('showcue-pad-count')||12),setlists:[],songs:['Daar Sal Jy My Kry','Hey Karolien','Luister Na Jou Hart'],media:[],pads:{},current:null,playing:false,muted:false,displayEnabled:false,levelMatchSync:false,cutTrack:false,leadInBars:4};
try{Object.assign(state,JSON.parse(localStorage.getItem('showcue-v5-state')||localStorage.getItem('showcue-v4-state')||'{}'))}catch(e){}
if(!Array.isArray(state.setlists))state.setlists=[];
state.setlists=(state.setlists||[]).map((x,i)=>typeof x==='string'?{id:'setlist-'+i,name:x,pads:{},padCount:state.padCount}:Object.assign({padCount:state.padCount,pads:{}},x));
state.lyricsText=state.lyricsText||'';state.lyricsSync=state.lyricsSync||null;state.lyricsSpeed=Number(state.lyricsSpeed||5);
state.songs=(state.songs||[]).map((s,i)=>typeof s==='string'?{id:'song-'+i+'-'+btoa(unescape(encodeURIComponent(s))).replace(/[^a-z0-9]/gi,'').slice(0,12),name:s,audioKey:null,bpm:120}:Object.assign({bpm:120},s));
state.media=state.media||[];
state.pads=state.pads||{};state.leadInBars=Number(state.leadInBars)===2?2:4;
const $=s=>document.querySelector(s);let pdfLoadPromise=null;async function ensurePdfLib(){if(window.pdfjsLib)return window.pdfjsLib;if(pdfLoadPromise)return pdfLoadPromise;pdfLoadPromise=new Promise((resolve,reject)=>{const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.js';sc.onload=()=>resolve(window.pdfjsLib);sc.onerror=reject;document.head.appendChild(sc)});return pdfLoadPromise}const save=()=>{localStorage.setItem('showcue-v5-state',JSON.stringify(state));localStorage.setItem('showcue-pad-count',state.padCount)};
function openDB(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VER);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return dbPromise}
async function putFile(key,file){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(file,key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
async function getFile(key){if(!key)return null;const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const q=tx.objectStore(STORE).get(key);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error)})}
async function deleteFile(key){if(!key)return;const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function showView(id){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));window.scrollTo(0,0);if(id==='pads')renderPads();if(id==='lyrics')renderLyrics();if(id==='setlists')renderSetlists();if(id==='songs')renderSongs();if(id==='media')renderMedia();if(id==='tv')renderDisplayButton()}
function buildNav(){const make=a=>a.map(([id,ic,n])=>`<button data-view="${id}">${ic} <span>${n}</span></button>`).join('');$('#sideNav').innerHTML=make(NAV);$('#mobileNav').innerHTML=make(NAV.slice(0,5));document.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b){e.preventDefault();showView(b.dataset.view)}})}
function snapshotPads(){return JSON.parse(JSON.stringify(state.pads||{}))}
function renderSetlists(){$('#setlistRows').innerHTML=state.setlists.length?state.setlists.map((s,i)=>{const count=Object.keys(s.pads||{}).filter(k=>{const p=s.pads[k];return p&&(p.songId||p.videoId||p.name&&p.name!=='Empty Pad')}).length;return `<div class="setlist-card"><div class="row"><div class="grow"><b>${escapeHtml(s.name)}</b><div class="muted">Saved Cue Pad show · ${count} configured pads</div></div></div><div class="setlist-actions"><button class="btn primary" onclick="loadSetlist(${i})">LOAD INTO CUE PADS</button><button class="btn" onclick="renameSetlist(${i})">RENAME</button><button class="btn" onclick="updateSetlist(${i})">UPDATE FROM CURRENT PADS</button><button class="btn danger" onclick="deleteSetlist(${i})">DELETE</button></div></div>`}).join(''):'<div class="muted">No saved setlists yet. Configure your Cue Pads, then use “SAVE CURRENT PADS AS SETLIST”.</div>'}
function escapeHtml(v){return String(v == null ? '' : v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
function saveCurrentAsSetlist(){const n=prompt('Setlist name');if(!n)return;state.setlists.push({id:'setlist-'+Date.now(),name:n,pads:snapshotPads(),padCount:state.padCount,createdAt:Date.now()});save();renderSetlists()}
function loadSetlist(i){const s=state.setlists[i];if(!s)return;state.pads=JSON.parse(JSON.stringify(s.pads||{}));state.padCount=Number(s.padCount||state.padCount||12);save();renderPads();showView('pads')}
function updateSetlist(i){const s=state.setlists[i];if(!s)return;s.pads=snapshotPads();s.padCount=state.padCount;s.updatedAt=Date.now();save();renderSetlists()}
function renameSetlist(i){const s=state.setlists[i];if(!s)return;const n=prompt('Setlist name',s.name);if(n){s.name=n;save();renderSetlists()}}
function deleteSetlist(i){if(confirm('Delete this saved setlist?')){state.setlists.splice(i,1);save();renderSetlists()}}
$('#addSetlist').onclick=()=>{const n=prompt('Empty setlist name');if(n){state.setlists.push({id:'setlist-'+Date.now(),name:n,pads:{},padCount:state.padCount});save();renderSetlists()}};$('#saveCurrentSetlist').onclick=saveCurrentAsSetlist;

function renderSongs(){$('#songRows').innerHTML=state.songs.map((s,i)=>`<div class="row"><div class="grow"><b>${s.name}</b><div class="muted">${s.audioKey?'Audio track loaded':'No audio file loaded'} · Ready for Cue Pad assignment</div></div><div class="song-controls"><label class="muted">BPM <input class="bpm-input" data-bpm="${i}" type="number" min="30" max="300" step="1" value="${s.bpm||120}"></label>${s.audioKey?'<span class="muted">🎵</span>':''}<button class="btn" onclick="deleteSong(${i})">DELETE</button></div></div>`).join('');document.querySelectorAll('[data-bpm]').forEach(x=>x.addEventListener('change',()=>{state.songs[Number(x.dataset.bpm)].bpm=Math.max(30,Math.min(300,Number(x.value)||120));save()}))}
function deleteSong(i){const s=state.songs[i];if((s && s.audioKey))deleteFile(s.audioKey);state.songs.splice(i,1);Object.values(state.pads).forEach(p=>{if(p.songId===(s && s.id))p.songId=''});save();renderSongs();renderPads()}
$('#addSong').onclick=()=>{const n=prompt('Song name');if(n){state.songs.push({id:'song-'+Date.now(),name:n,audioKey:null,bpm:120});save();renderSongs();renderPads()}};
const AUDIO_EXTS=['mp3','aiff','flac','m4a','wav','wma'];
const VIDEO_EXTS=['mp4','m4v','mov','avi'];
function extOf(name){const m=/\.([^.]+)$/.exec(name||'');return m?m[1].toLowerCase():''}
function fileTypeOk(file,exts){return exts.includes(extOf(file.name))}
$('#audioUpload').onchange=async e=>{const files=[...e.target.files];const good=files.filter(f=>fileTypeOk(f,AUDIO_EXTS));const bad=files.filter(f=>!fileTypeOk(f,AUDIO_EXTS));let added=0;for(const f of good){const id='song-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),key='audio-'+id;try{await putFile(key,f);state.songs.push({id,name:f.name.replace(/\.[^.]+$/,''),audioKey:key,fileName:f.name,bpm:120,loudnessDb:null,leadInSec:null});added++}catch(err){console.error(err)}}save();renderSongs();renderPads();$('#audioImportStatus').textContent=`Imported ${added} audio file${added===1?'':'s'}${bad.length?` · Skipped ${bad.length} unsupported extension(s)`:''}. Set BPM per song if Cut Track is used.`;e.target.value=''};
function renderMedia(){$('#mediaRows').innerHTML=state.media.length?state.media.map((m,i)=>`<div class="row"><div class="grow"><b>${m.name}</b><div class="muted">Video · ${m.fileName||''}</div></div><button class="btn" onclick="deleteMedia(${i})">DELETE</button></div>`).join(''):'<div class="muted">No videos added yet.</div>'}
async function deleteMedia(i){const m=state.media[i];if((m && m.fileKey))await deleteFile(m.fileKey);state.media.splice(i,1);Object.values(state.pads).forEach(p=>{if(p.videoId===(m && m.id))p.videoId=''});save();renderMedia();renderPads()}
$('#clearAllVideos').onclick=async()=>{if(!state.media.length){renderMedia();return}if(!confirm('Clear all imported videos? This will also remove video assignments from Cue Pads.'))return;for(const m of state.media){if((m && m.fileKey))await deleteFile(m.fileKey)}state.media=[];Object.values(state.pads).forEach(p=>{p.videoId=''});save();renderMedia();renderPads();$('#videoImportStatus').textContent='All imported videos cleared.'};
$('#videoUpload').onchange=async e=>{const files=[...e.target.files];const good=files.filter(f=>fileTypeOk(f,VIDEO_EXTS));const bad=files.filter(f=>!fileTypeOk(f,VIDEO_EXTS));let added=0;for(const f of good){const id='video-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),key='video-'+id;try{await putFile(key,f);state.media.push({id,name:f.name.replace(/\.[^.]+$/,''),fileKey:key,fileName:f.name,type:'video'});added++}catch(err){console.error(err)}}save();renderMedia();renderPads();$('#videoImportStatus').textContent=`Imported ${added} video file${added===1?'':'s'}${bad.length?` · Skipped ${bad.length} unsupported extension(s)`:''}.`;e.target.value=''};
function padBackground(p){return p.color||'#17232e'}
function renderPads(){$('#padGrid').innerHTML=Array.from({length:state.padCount},(_,i)=>{const p=state.pads[i]||{name:'Empty Pad',songId:'',videoId:'',color:'#17232e'};const s=state.songs.find(x=>x.id===p.songId),v=state.media.find(x=>x.id===p.videoId);return `<div class="pad" data-pad="${i}" style="background:linear-gradient(145deg,${padBackground(p)},#0d151e)"><span class="pad-num">${i+1}</span><button type="button" class="pad-edit" data-edit="${i}" aria-label="Edit pad" onclick="event.preventDefault();event.stopPropagation();openPadEdit(${i});return false;">✎</button><div class="pad-name">${escapeHtml(p.name)}</div><div class="pad-type">${v?'<span class="tv-loaded-icon" aria-label="Video loaded" title="Video loaded">▣</span>':''}</div></div>`}).join('');updateCountButtons()}
function updateCountButtons(){document.querySelectorAll('[data-count]').forEach(b=>b.classList.toggle('active',Number(b.dataset.count)===state.padCount))}
$('#clearPads').onclick=()=>{if(!confirm('Clear all Cue Pads, including assigned songs and videos?'))return;state.pads={};state.current=null;save();renderPads();$('#nowTitle').textContent='Nothing cued';$('#nowSub').textContent='Choose a pad';audio.pause();video.pause();}
document.addEventListener('click',e=>{const edit=e.target.closest('[data-edit]');if(edit){e.preventDefault();e.stopPropagation();openPadEdit(Number(edit.dataset.edit));return}const pad=e.target.closest('[data-pad]');if(pad){e.preventDefault();cuePad(Number(pad.dataset.pad))}});
document.querySelectorAll('[data-count]').forEach(b=>b.addEventListener('click',()=>{state.padCount=Number(b.dataset.count);save();renderPads();updateCountButtons()}));
function openPadEdit(i){const p=state.pads[i]||{name:'Pad '+(i+1),songId:'',videoId:'',color:'#17232e'};$('#padName').value=p.name;$('#padColor').value=p.color||'#17232e';$('#padAssign').innerHTML='<option value="">— No audio track —</option>'+state.songs.map(s=>`<option value="${s.id}">${s.name}${s.audioKey?'':' (no audio file)'}</option>`).join('');$('#padAssign').value=p.songId||'';$('#padVideo').innerHTML='<option value="">— No video —</option>'+state.media.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');$('#padVideo').value=p.videoId||'';$('#padModal').dataset.index=i;$('#padModal').classList.add('open')}
$('#resetPadColor').onclick=()=>$('#padColor').value='#17232e';$('#padCancel').onclick=()=>$('#padModal').classList.remove('open');
$('#padSave').onclick=()=>{const i=Number($('#padModal').dataset.index);state.pads[i]={name:$('#padName').value||'Pad '+(i+1),songId:$('#padAssign').value,videoId:$('#padVideo').value,color:$('#padColor').value};save();$('#padModal').classList.remove('open');renderPads()};
const audio=$('#cueAudio'),video=$('#cueVideo');
let activeVideoUrl=null,activeAudioUrl=null;
let audioGainNode=null,audioCtx=null,mediaSourceNode=null;
const mediaCache=new Map();
let playbackUnlocked=false;
// A tiny silent media source preserves the browser's user-activation while the
// selected file is fetched from IndexedDB. It is replaced by the real cue.
const SILENT_WAV='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAAA';
function unlockPlayback(){
  try{resumeAudioContext()}catch(e){}
  if(playbackUnlocked)return;
  try{
    const wasMuted=audio.muted;
    audio.muted=true;audio.loop=true;audio.src=SILENT_WAV;
    const p=audio.play();
    if(p&&p.then)p.then(()=>{playbackUnlocked=true}).catch(()=>{});
    audio.muted=wasMuted;
  }catch(e){}
}

function ensureAudioGraph(){
  try{
    if(audioCtx)return true;
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return false;
    audioCtx=new AC();
    mediaSourceNode=audioCtx.createMediaElementSource(audio);
    audioGainNode=audioCtx.createGain();
    mediaSourceNode.connect(audioGainNode);
    audioGainNode.connect(audioCtx.destination);
    return true;
  }catch(e){console.warn('Web Audio unavailable',e);return false}
}
function resumeAudioContext(){try{if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume()}catch(e){}}
function setPlaybackGain(db){if(!ensureAudioGraph()||!audioGainNode)return;const g=Math.pow(10,(db||0)/20);audioGainNode.gain.setValueAtTime(g,audioCtx.currentTime)}
function releaseCache(key){const x=mediaCache.get(key);if(x){URL.revokeObjectURL(x.url);mediaCache.delete(key)}}
async function preloadFile(key){
  if(!key||mediaCache.has(key))return mediaCache.get(key);
  const f=await getFile(key);
  if(!f)return null;
  const url=URL.createObjectURL(f);
  const item={blob:f,url};
  mediaCache.set(key,item);
  return item;
}
async function preloadPadFiles(){
  const jobs=[];
  Object.values(state.pads||{}).forEach(p=>{
    const s=state.songs.find(x=>x.id===p.songId),m=state.media.find(x=>x.id===p.videoId);
    if((s && s.audioKey))jobs.push(preloadFile(s.audioKey));
    if((m && m.fileKey))jobs.push(preloadFile(m.fileKey));
  });
  try{await Promise.all(jobs)}catch(e){}
}
// Level matching is gain-only: the source audio is never compressed, limited, EQ'd or rewritten.
// The analysis uses an active-program RMS measurement plus the track's peak level.  The final
// reference level is chosen so every track can be brought to the same measured level without
// pushing any track above a conservative -1 dBFS peak ceiling.
const LEVEL_MATCH_VERSION=2;
function levelStatsFromBuffer(buffer){
  const maxFrames=Math.min(buffer.length,Math.floor(buffer.sampleRate*180));
  const step=Math.max(1,Math.floor(buffer.sampleRate/100));
  let peak=0, activeSum=0, activeCount=0, globalSum=0, globalCount=0;
  for(let i=0;i<maxFrames;i+=step){
    let framePeak=0, frameSum=0;
    const end=Math.min(step,maxFrames-i);
    for(let c=0;c<buffer.numberOfChannels;c++){
      const data=buffer.getChannelData(c);
      for(let j=0;j<end;j++){
        const v=data[i+j]||0, a=Math.abs(v);
        if(a>peak)peak=a;
        if(a>framePeak)framePeak=a;
        frameSum+=v*v;
        globalSum+=v*v;globalCount++;
      }
    }
    // Ignore near-silence so an intro/silence does not make the whole song appear quieter.
    const frameRms=Math.sqrt(frameSum/Math.max(1,end*buffer.numberOfChannels));
    if(framePeak>0.001 && frameRms>1e-4){activeSum+=frameSum;activeCount+=end*buffer.numberOfChannels}
  }
  const rms=Math.sqrt((activeCount?activeSum:globalSum)/Math.max(1,activeCount||globalCount));
  return {
    loudnessDb:20*Math.log10(Math.max(rms,1e-7)),
    peakDb:20*Math.log10(Math.max(peak,1e-7))
  };
}
async function analyzeSong(song){
  if(!(song && song.audioKey))return null;
  if(song.levelMatchVersion===LEVEL_MATCH_VERSION&&typeof song.loudnessDb==='number'&&typeof song.peakDb==='number'&&typeof song.leadInSec==='number')return song;
  const item=mediaCache.get(song.audioKey)||await preloadFile(song.audioKey);
  if(!item)return song;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return song;
    const buf=await item.blob.arrayBuffer();
    const ctx=new AC();
    const decoded=await ctx.decodeAudioData(buf.slice(0));
    const stats=levelStatsFromBuffer(decoded);
    song.loudnessDb=stats.loudnessDb;
    song.peakDb=stats.peakDb;
    const threshold=0.012;
    const maxLeadFrames=Math.min(decoded.length,Math.floor(decoded.sampleRate*120));
    const leadStep=Math.max(1,Math.floor(decoded.sampleRate/80));
    let first=0;
    for(let i=0;i<maxLeadFrames;i+=leadStep){
      let framePeak=0;
      for(let c=0;c<decoded.numberOfChannels;c++){
        const data=decoded.getChannelData(c);
        for(let j=0;j<Math.min(leadStep,decoded.length-i);j++)framePeak=Math.max(framePeak,Math.abs(data[i+j]||0));
      }
      if(framePeak>threshold){first=i/decoded.sampleRate;break}
    }
    song.leadInSec=first;
    song.levelMatchVersion=LEVEL_MATCH_VERSION;
    try{ctx.close()}catch(e){}
    save();
  }catch(e){song.loudnessDb=null;song.peakDb=null;song.leadInSec=null;song.levelMatchVersion=null}
  return song;
}
async function analyzeAllSongs(){
  for(const s of state.songs||[])if(s.audioKey&&(s.levelMatchVersion!==LEVEL_MATCH_VERSION||s.loudnessDb==null||s.peakDb==null||s.leadInSec==null))await analyzeSong(s);
}
function matchingGainDb(song){
  if(!state.levelMatchSync||typeof (song && song.loudnessDb)!=='number')return 0;
  const tracks=(state.songs||[]).filter(s=>s.audioKey&&typeof s.loudnessDb==='number'&&typeof s.peakDb==='number');
  if(!tracks.length)return 0;
  // A gain-only system cannot safely make a clipped/hot track louder. Choose one common
  // target that every analysed track can reach while keeping at least 1 dB peak headroom.
  const requestedTarget=-16;
  const safeTarget=tracks.reduce((m,s)=>Math.min(m,s.loudnessDb+(-1-s.peakDb)),requestedTarget);
  return safeTarget-song.loudnessDb;
}
function getStartOffset(song){
  if(!state.cutTrack||!song)return 0;
  const bpm=Math.max(30,Math.min(300,Number(song.bpm)||120));
  const bars=state.leadInBars===2?2:4;
  const leadIn=(60/bpm)*4*bars;
  const lead=Math.max(0,Number(song.leadInSec)||0);
  return Math.max(0,lead-leadIn);
}
async function prepareCue(p){
  // AUDIO is the only media decoded/loaded in the controller window.
  // Video is owned by display.html and is fetched there by fileKey. This avoids
  // decoding the same large video twice and keeps the performance UI responsive.
  audio.pause();
  activeAudioUrl=null;activeVideoUrl=null;
  audio.removeAttribute('src');
  try{video.pause();video.removeAttribute('src');video.load()}catch(e){}
  video.style.display='none';
  const s=state.songs.find(x=>x.id===p.songId),m=state.media.find(x=>x.id===p.videoId);
  const aItem=s&&s.audioKey ? (mediaCache.get(s.audioKey)||await preloadFile(s.audioKey)) : null;
  if(aItem){activeAudioUrl=aItem.url;audio.src=aItem.url;audio.loop=false;audio.preload='auto';audio.load()}
  // Never run decodeAudioData analysis while a live cue is starting/playing.
  // Saved analysis is used immediately; missing analysis can be prepared from Settings.
  setPlaybackGain(matchingGainDb(s));
  return {s,m};
}
function startPreparedCue(s,m){
  resumeAudioContext();
  const offset=getStartOffset(s);
  try{audio.currentTime=offset}catch(e){}
  const pa=audio.play();
  if(pa&&pa.catch)pa.catch(err=>console.warn('Audio play blocked',err));
}
async function cuePad(i){
  unlockPlayback();
  const p=state.pads[i]||{name:'Empty Pad',songId:'',videoId:'',color:'#17232e'};
  document.querySelectorAll('.pad').forEach(x=>x.classList.remove('flash'));
  const flashPad=document.querySelector(`[data-pad="${i}"]`);if(flashPad)flashPad.classList.add('flash');
  state.current=p;state.lyricsSync=null;
  const {s,m}=await prepareCue(p);
  $('#nowTitle').textContent=p.name;
  $('#nowSub').textContent=(s?s.name:'No audio track')+(m?' · '+m.name:'');
  if((s && s.audioKey)){
    startPreparedCue(s,m);
    $('#play').textContent='▶';
  }else{
    state.playing=false;$('#play').textContent='▶';
  }
  if(state.displayEnabled)syncDisplay('cue');
}
audio.addEventListener('play',()=>{state.playing=true;resumeAudioContext();$('#play').textContent='❚❚';syncDisplay('play')});
audio.addEventListener('pause',()=>{state.playing=false;$('#play').textContent='▶';syncDisplay('pause')});
audio.addEventListener('ended',()=>{state.playing=false;$('#play').textContent='▶';syncDisplay('stop')});
$('#play').onclick=()=>{resumeAudioContext();if(!audio.src)return;if(audio.paused)audio.play().catch(()=>{});else audio.pause()};
$('#stop').onclick=()=>{audio.pause();try{audio.currentTime=getStartOffset(state.songs.find(x=>x.id===(state.current && state.current.songId)))}catch(e){}state.playing=false;$('#play').textContent='▶';syncDisplay('stop')};
$('#prev').onclick=()=>$('#nowSub').textContent='Previous cue';
$('#next').onclick=()=>$('#nowSub').textContent='Next cue';
$('#mute').onclick=()=>{state.muted=!state.muted;audio.muted=state.muted;$('#mute').textContent=state.muted?'🔇':'🔊'};

function renderLyrics(){const text=state.lyricsText||'';$('#lyricsEditor').value=text;const lines=(text||'Ready for lyrics').split(/\n/);$('#lyricsScroll').innerHTML=lines.map((x,i)=>`<p class="${i===0?'current':''}">${escapeHtml(x||' ')}</p>`).join('');$('#lyricsPads').innerHTML=Array.from({length:state.padCount},(_,i)=>{const p=state.pads[i]||{name:'Empty Pad',songId:'',videoId:'',color:'#17232e'};const s=state.songs.find(x=>x.id===p.songId),v=state.media.find(x=>x.id===p.videoId);return `<button class="lyrics-pad" data-lyrics-pad="${i}" style="border-left:5px solid ${padBackground(p)}"><b>PAD ${i+1}</b><div>${escapeHtml(p.name||'Empty Pad')}</div><div class="muted">${escapeHtml((s && s.name)||'No audio')}${v?' · 📺 '+escapeHtml(v.name):''}</div></button>`}).join('');$('#lyricsSpeed').value=state.lyricsSpeed||5;$('#lyricsSpeedValue').textContent=state.lyricsSpeed||5}
$('#lyricsEditor').addEventListener('input',()=>{state.lyricsText=$('#lyricsEditor').value;save();const y=$('#lyricsScroll').scrollTop;renderLyrics();$('#lyricsScroll').scrollTop=y});$('#lyricsSpeed').addEventListener('input',()=>{state.lyricsSpeed=Number($('#lyricsSpeed').value);$('#lyricsSpeedValue').textContent=state.lyricsSpeed;save()});$('#importLyrics').onclick=()=>$('#lyricsFileUpload').click();$('#lyricsFileUpload').onchange=async e=>{const f=e.target.files && e.target.files[0];if(!f)return;const ext=extOf(f.name);try{let text='';if(ext==='doc'||ext==='docx'){if(!window.mammoth)throw new Error('Word parser not loaded');text=await window.mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()}).then(r=>r.value)}else if(ext==='pdf'){if(!window.pdfjsLib)try{await ensurePdfLib()}catch(_){ }if(window.pdfjsLib){window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js';const pdf=await window.pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;const pages=[];for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const c=await pg.getTextContent();pages.push(c.items.map(x=>x.str).join(' '))}text=pages.join('\n')}else throw new Error('PDF parser not available')}else{text=await f.text()}state.lyricsText=text||'';save();renderLyrics();alert('Lyrics imported.');}catch(err){console.error(err);alert('Could not read this lyrics file on this device. You can still type or paste the lyrics manually.')}e.target.value=''};
$('#syncLyrics').onclick=()=>{if(!state.current){alert('Cue a pad with a song first.');return}const song=state.songs.find(x=>x.id===state.current.songId);if(!(song && song.audioKey)){alert('The current pad has no audio track.');return}const lineEls=[...$('#lyricsScroll').querySelectorAll('p')];const total=Math.max(1,lineEls.length);const duration=audio.duration||0;state.lyricsSync={songId:song.id,startedAt:audio.currentTime||0,speed:state.lyricsSpeed||5,lineCount:total,duration};save();if(!autoTimer){$('#lyricsAuto').textContent='STOP SCROLL';autoTimer=setInterval(syncLyricsScroll,80)}alert('Lyrics synced to the current track. Use the speed slider to make the scroll slower or faster.');};
function syncLyricsScroll(){if(!state.lyricsSync||!audio.src||!audio.duration)return;const base=Number(state.lyricsSync.startedAt)||0;const elapsed=Math.max(0,audio.currentTime-base);const remaining=Math.max(0,(audio.duration-base));const progress=remaining?Math.min(1,elapsed/remaining):0;const max=$('#lyricsScroll').scrollHeight-$('#lyricsScroll').clientHeight;let speed=Number(state.lyricsSpeed||5);let target=max*progress*(0.65+speed/10*0.35);$('#lyricsScroll').scrollTop=Math.max(0,Math.min(max,target));}

$('#lyricsAuto').onclick=()=>{if(autoTimer){clearInterval(autoTimer);autoTimer=null;$('#lyricsAuto').textContent='AUTO SCROLL'}else{$('#lyricsAuto').textContent='STOP SCROLL';autoTimer=setInterval(()=>state.lyricsSync?syncLyricsScroll():$('#lyricsScroll').scrollBy({top:state.lyricsSpeed||5,left:0}),80)}};$('#lyricsUp').onclick=()=>$('#lyricsScroll').scrollBy({top:-300,behavior:'smooth'});$('#lyricsDown').onclick=()=>$('#lyricsScroll').scrollBy({top:300,behavior:'smooth'});$('#lyricsReset').onclick=()=>$('#lyricsScroll').scrollTo({top:0,behavior:'smooth'});
document.addEventListener('click',e=>{const b=e.target.closest('[data-lyrics-pad]');if(b){e.preventDefault();cuePad(Number(b.dataset.lyricsPad))}});

function renderDisplayButton(){$('#displayToggle').textContent=state.displayEnabled?'ON':'OFF';$('#displayToggle').classList.toggle('primary',state.displayEnabled)}
$('#displayToggle').onclick=()=>{state.displayEnabled=!state.displayEnabled;save();renderDisplayButton();if(state.displayEnabled){if(!displayWindow||displayWindow.closed)openDisplayWindow();setTimeout(()=>syncDisplay('toggle',true),700)}};
const DISPLAY_FALLBACK_B64='PCFkb2N0eXBlIGh0bWw+PGh0bWw+PGhlYWQ+PG1ldGEgY2hhcnNldD0idXRmLTgiPjxtZXRhIG5hbWU9InZpZXdwb3J0IiBjb250ZW50PSJ3aWR0aD1kZXZpY2Utd2lkdGgsaW5pdGlhbC1zY2FsZT0xIj48dGl0bGU+U2hvd0N1ZSBUViBEaXNwbGF5PC90aXRsZT48c3R5bGU+aHRtbCxib2R5e21hcmdpbjowO3dpZHRoOjEwMCU7aGVpZ2h0OjEwMCU7YmFja2dyb3VuZDojMDAwO2NvbG9yOiNmZmY7Zm9udC1mYW1pbHk6LWFwcGxlLXN5c3RlbSxCbGlua01hY1N5c3RlbUZvbnQsIlNlZ29lIFVJIixBcmlhbDtvdmVyZmxvdzpoaWRkZW59Ym9keXtkaXNwbGF5OmdyaWQ7cGxhY2UtaXRlbXM6Y2VudGVyfS53cmFwe3dpZHRoOjEwMCU7aGVpZ2h0OjEwMCU7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0udmlkZW97bWF4LXdpZHRoOjEwMCU7bWF4LWhlaWdodDoxMDAlO3dpZHRoOjEwMCU7aGVpZ2h0OjEwMCU7b2JqZWN0LWZpdDpjb250YWluO2Rpc3BsYXk6bm9uZX0udGV4dHt0ZXh0LWFsaWduOmNlbnRlcjtwYWRkaW5nOjV2d30udGl0bGV7Zm9udC1zaXplOmNsYW1wKDM2cHgsN3Z3LDk2cHgpO2ZvbnQtd2VpZ2h0OjgwMH0uc3Vie2ZvbnQtc2l6ZTpjbGFtcCgxOHB4LDN2dyw0MnB4KTttYXJnaW4tdG9wOjE2cHg7Y29sb3I6I2Q1ZGNlMn0uYmFkZ2V7cG9zaXRpb246Zml4ZWQ7dG9wOjE0cHg7bGVmdDoxNHB4O2NvbG9yOiM4ZDlhYTU7Zm9udC1zaXplOjEycHg7b3BhY2l0eTouNjV9LmJhY2t7cG9zaXRpb246Zml4ZWQ7ei1pbmRleDo5OTk5OTtkaXNwbGF5Om5vbmU7dGV4dC1kZWNvcmF0aW9uOm5vbmU7dGV4dC1hbGlnbjpjZW50ZXI7Ym94LXNpemluZzpib3JkZXItYm94O2JhY2tncm91bmQ6cmdiYSgzNSwzNSwzNSwuOTYpO2NvbG9yOiNmZmY7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LC4yNSk7Zm9udC13ZWlnaHQ6ODAwO2N1cnNvcjpwb2ludGVyO3VzZXItc2VsZWN0Om5vbmU7LXdlYmtpdC10YXAtaGlnaGxpZ2h0LWNvbG9yOnRyYW5zcGFyZW50fS5iYWNrOmhvdmVye2JhY2tncm91bmQ6cmdiYSgyOCwzOCw0OCwuOTUpfQpAbWVkaWEgKHBvaW50ZXI6Y29hcnNlKXsuYmFja3tkaXNwbGF5OmJsb2NrO2xlZnQ6NTAlO2JvdHRvbTpjYWxjKDIycHggKyBlbnYoc2FmZS1hcmVhLWluc2V0LWJvdHRvbSkpO3RyYW5zZm9ybTp0cmFuc2xhdGVYKC01MCUpO3BhZGRpbmc6MTRweCAzNHB4O2JvcmRlci1yYWRpdXM6OTk5cHg7Zm9udC1zaXplOjE4cHg7bWluLXdpZHRoOjEyMHB4O2JveC1zaGFkb3c6MCA0cHggMThweCByZ2JhKDAsMCwwLC41NSl9fQo8L3N0eWxlPjwvaGVhZD48Ym9keT48ZGl2IGNsYXNzPSJiYWRnZSI+U0hPV0NVRSBUViBESVNQTEFZPC9kaXY+PGEgaWQ9ImJhY2siIGNsYXNzPSJiYWNrIiBocmVmPSIuL2luZGV4Lmh0bWwiIGFyaWEtbGFiZWw9IkJhY2sgdG8gU2hvd0N1ZSBUViBEaXNwbGF5Ij5CYWNrPC9hPjxkaXYgY2xhc3M9IndyYXAiPjx2aWRlbyBpZD0idiIgY2xhc3M9InZpZGVvIiBwbGF5c2lubGluZSBtdXRlZCBhdXRvcGxheT48L3ZpZGVvPjxkaXYgY2xhc3M9InRleHQiIGlkPSJ0ZXh0Ij48ZGl2IGNsYXNzPSJ0aXRsZSI+U2hvd0N1ZTwvZGl2PjxkaXYgY2xhc3M9InN1YiI+UmVhZHkgZm9yIHBlcmZvcm1hbmNlPC9kaXY+PC9kaXY+PC9kaXY+PHNjcmlwdD4KY29uc3QgREI9J1Nob3dDdWVNZWRpYURCJyxTVE9SRT0nZmlsZXMnOwpsZXQgZGI9bnVsbCx1cmw9bnVsbDsKY29uc3Qgdj1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndicpLHRleHQ9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RleHQnKSxiYWNrPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdiYWNrJyk7CmZ1bmN0aW9uIG9wZW5EQigpe3JldHVybiBuZXcgUHJvbWlzZSgocmVzLHJlaik9Pntjb25zdCByPWluZGV4ZWREQi5vcGVuKERCLDEpO3Iub251cGdyYWRlbmVlZGVkPSgpPT57aWYoIXIucmVzdWx0Lm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoU1RPUkUpKXIucmVzdWx0LmNyZWF0ZU9iamVjdFN0b3JlKFNUT1JFKX07ci5vbnN1Y2Nlc3M9KCk9PnJlcyhyLnJlc3VsdCk7ci5vbmVycm9yPSgpPT5yZWooci5lcnJvcil9KX0KYXN5bmMgZnVuY3Rpb24gZ2V0RmlsZShrKXtpZighaylyZXR1cm4gbnVsbDtpZighZGIpZGI9YXdhaXQgb3BlbkRCKCk7cmV0dXJuIG5ldyBQcm9taXNlKChyZXMscmVqKT0+e2NvbnN0IHE9ZGIudHJhbnNhY3Rpb24oU1RPUkUpLm9iamVjdFN0b3JlKFNUT1JFKS5nZXQoayk7cS5vbnN1Y2Nlc3M9KCk9PnJlcyhxLnJlc3VsdHx8bnVsbCk7cS5vbmVycm9yPSgpPT5yZWoocS5lcnJvcil9KX0KY29uc3QgaXNNb2JpbGVEZXZpY2U9L0FuZHJvaWR8aVBob25lfGlQYWR8aVBvZHxNb2JpbGUvaS50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpfHwoKG5hdmlnYXRvci5tYXhUb3VjaFBvaW50c3x8MCk+MSYmL01hY2ludG9zaC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCkmJk1hdGgubWluKHNjcmVlbi53aWR0aCxzY3JlZW4uaGVpZ2h0KTw9MTM2Nik7CmlmKGlzTW9iaWxlRGV2aWNlKWJhY2suc3R5bGUuZGlzcGxheT0nYmxvY2snOwpmdW5jdGlvbiBnb0JhY2soKXtpZih3aW5kb3cub3BlbmVyJiYhd2luZG93Lm9wZW5lci5jbG9zZWQpe3RyeXt3aW5kb3cub3BlbmVyLmZvY3VzKCl9Y2F0Y2goZSl7fXRyeXt3aW5kb3cuY2xvc2UoKX1jYXRjaChlKXt9fWlmKGhpc3RvcnkubGVuZ3RoPjEpe2hpc3RvcnkuYmFjaygpO3JldHVybiBmYWxzZX1pZihkb2N1bWVudC5yZWZlcnJlcil7bG9jYXRpb24ucmVwbGFjZShkb2N1bWVudC5yZWZlcnJlcik7cmV0dXJuIGZhbHNlfWxvY2F0aW9uLmhyZWY9Jy4vaW5kZXguaHRtbCc7cmV0dXJuIGZhbHNlfQpiYWNrLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJyxlPT57ZS5wcmV2ZW50RGVmYXVsdCgpO2dvQmFjaygpfSk7CmZ1bmN0aW9uIHNldE1lc3NhZ2UodGl0bGUsc3ViKXt0ZXh0LnN0eWxlLmRpc3BsYXk9J2Jsb2NrJzt2LnN0eWxlLmRpc3BsYXk9J25vbmUnO3RleHQuaW5uZXJIVE1MPSc8ZGl2IGNsYXNzPSJ0aXRsZSI+JysodGl0bGV8fCdTaG93Q3VlJykrJzwvZGl2PjxkaXYgY2xhc3M9InN1YiI+Jysoc3VifHwnUmVhZHkgZm9yIHBlcmZvcm1hbmNlJykrJzwvZGl2Pid9CmFzeW5jIGZ1bmN0aW9uIHNob3dWaWRlbyhkKXsKICBjb25zdCBpbmZvPWQudmlkZW98fHt9OwogIGlmKCFpbmZvLmZpbGVLZXkpe3NldE1lc3NhZ2UoZC5zb25nPy5uYW1lfHxkLnBhZD8ubmFtZXx8J1Nob3dDdWUnLCdSZWFkeSBmb3IgcGVyZm9ybWFuY2UnKTtyZXR1cm59CiAgdHJ5ewogICAgY29uc3QgZj1pbmZvLmJsb2IgaW5zdGFuY2VvZiBCbG9iID8gaW5mby5ibG9iIDogYXdhaXQgZ2V0RmlsZShpbmZvLmZpbGVLZXkpOwogICAgaWYoIWYpe3NldE1lc3NhZ2UoaW5mby5uYW1lfHxkLnNvbmc/Lm5hbWV8fGQucGFkPy5uYW1lfHwnU2hvd0N1ZScsJ1ZpZGVvIGZpbGUgdW5hdmFpbGFibGUgb24gdGhpcyBkZXZpY2UnKTtyZXR1cm59CiAgICBpZih1cmwpVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpOwogICAgdXJsPVVSTC5jcmVhdGVPYmplY3RVUkwoZik7CiAgICB2LnBhdXNlKCk7di5yZW1vdmVBdHRyaWJ1dGUoJ3NyYycpO3YubG9hZCgpO3Yuc3JjPXVybDt2Lm11dGVkPXRydWU7di5hdXRvcGxheT10cnVlO3YucGxheXNJbmxpbmU9dHJ1ZTt2LnN0eWxlLmRpc3BsYXk9J2Jsb2NrJzt0ZXh0LnN0eWxlLmRpc3BsYXk9J25vbmUnOwogICAgY29uc3QgdGFyZ2V0PU51bWJlcihkLnRpbWUpfHwwOwogICAgY29uc3QgcGxheU5vdz0oKT0+ewogICAgICB0cnl7aWYoTnVtYmVyLmlzRmluaXRlKHRhcmdldCkmJnRhcmdldD49MCYmdi5kdXJhdGlvbiYmdGFyZ2V0PHYuZHVyYXRpb24pdi5jdXJyZW50VGltZT10YXJnZXR9Y2F0Y2goZSl7fQogICAgICBpZihkLmFjdGlvbiE9PSdwYXVzZScmJmQuYWN0aW9uIT09J3N0b3AnKXYucGxheSgpLmNhdGNoKCgpPT57fSk7CiAgICB9OwogICAgaWYodi5yZWFkeVN0YXRlPj0xKXBsYXlOb3coKTtlbHNlIHYuYWRkRXZlbnRMaXN0ZW5lcignbG9hZGVkbWV0YWRhdGEnLHBsYXlOb3cse29uY2U6dHJ1ZX0pOwogIH1jYXRjaChlcnIpe2NvbnNvbGUuZXJyb3IoZXJyKTtzZXRNZXNzYWdlKGluZm8ubmFtZXx8ZC5zb25nPy5uYW1lfHxkLnBhZD8ubmFtZXx8J1Nob3dDdWUnLCdVbmFibGUgdG8gbG9hZCB2aWRlbycpfQp9CmFzeW5jIGZ1bmN0aW9uIGhhbmRsZShkKXsKICBpZighZHx8ZC5zb3VyY2UhPT0nc2hvd2N1ZScpcmV0dXJuOwogIGlmKGQudmlkZW8mJmQudmlkZW8uZmlsZUtleSlhd2FpdCBzaG93VmlkZW8oZCk7ZWxzZSBpZihkLmFjdGlvbiE9PSdwYXVzZScmJmQuYWN0aW9uIT09J3N0b3AnKXNldE1lc3NhZ2UoZC5zb25nPy5uYW1lfHxkLnBhZD8ubmFtZXx8J1Nob3dDdWUnLCdSZWFkeSBmb3IgcGVyZm9ybWFuY2UnKTsKICBpZihkLmFjdGlvbj09PSdwYXVzZScpdi5wYXVzZSgpOwogIGlmKGQuYWN0aW9uPT09J3N0b3AnKXt2LnBhdXNlKCk7dHJ5e3YuY3VycmVudFRpbWU9MH1jYXRjaChlKXt9fQogIGlmKHR5cGVvZiBkLnRpbWU9PT0nbnVtYmVyJyYmdi5yZWFkeVN0YXRlPj0xJiZNYXRoLmFicyh2LmN1cnJlbnRUaW1lLWQudGltZSk+LjE1KXt0cnl7di5jdXJyZW50VGltZT1kLnRpbWV9Y2F0Y2goZSl7fX0KfQp3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsZT0+aGFuZGxlKGUuZGF0YSkpOwp3aW5kb3cub3BlbmVyPy5wb3N0TWVzc2FnZSh7c291cmNlOidzaG93Y3VlLWRpc3BsYXknLHJlYWR5OnRydWV9LCcqJyk7Ci8vIEluaXRpYWwgb3BlbiBpcyBjYXJyaWVkIGluIHRoZSBVUkwgYXMgd2VsbCBhcyBwb3N0TWVzc2FnZS4gVGhpcyBtYWtlcyBpUGFkL2lQaG9uZSBwb3B1cC9uZXctdGFiIGJlaGF2aW91ciByZWxpYWJsZS4KY29uc3QgcT1uZXcgVVJMU2VhcmNoUGFyYW1zKGxvY2F0aW9uLnNlYXJjaCk7CmNvbnN0IGluaXRpYWxGaWxlS2V5PXEuZ2V0KCdmaWxlS2V5Jyk7CmlmKGluaXRpYWxGaWxlS2V5KXtoYW5kbGUoe3NvdXJjZTonc2hvd2N1ZScsYWN0aW9uOnEuZ2V0KCdhY3Rpb24nKXx8J29wZW4nLHZpZGVvOntmaWxlS2V5OmluaXRpYWxGaWxlS2V5LG5hbWU6cS5nZXQoJ3ZpZGVvTmFtZScpfHwnJ30sc29uZzp7bmFtZTpxLmdldCgnc29uZ05hbWUnKXx8Jyd9LHBhZDp7bmFtZTpxLmdldCgncGFkTmFtZScpfHwnJ30sdGltZTpOdW1iZXIocS5nZXQoJ3RpbWUnKXx8MCl9KX0Kc2V0SW50ZXJ2YWwoKCk9PntpZighdi5wYXVzZWQpd2luZG93Lm9wZW5lcj8ucG9zdE1lc3NhZ2Uoe3NvdXJjZTonc2hvd2N1ZS1kaXNwbGF5Jyx0aW1lOnYuY3VycmVudFRpbWV9LCcqJyl9LDUwMCk7Cjwvc2NyaXB0PjwvYm9keT48L2h0bWw+';
let displayBlobUrls=new Set();
function escAttr(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
async function buildDisplayPage(){
  // A display opened from the TV Display page must start in standby unless a cue
  // is actually playing. state.current can remain populated after Stop/Pause,
  // so it is not sufficient by itself to decide whether a video should load.
  // Always create the display in standby. Never preload the last selected/current
  // video's Blob during window creation. The active cue is sent only after the
  // display reports ready. This prevents startup playback and visible flashing.
  const title='ShowCue', videoName='';
  const time=0;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>ShowCue TV Display</title><style>html,body{margin:0;width:100%;height:100%;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial;overflow:hidden}body{display:grid;place-items:center}.wrap{width:100%;height:100%;display:grid;place-items:center}.video{width:100%;height:100%;object-fit:contain;display:none;background:#000}.text{text-align:center;padding:5vw}.title{font-size:clamp(36px,7vw,96px);font-weight:800}.sub{font-size:clamp(18px,3vw,42px);margin-top:16px;color:#d5dce2}.badge{position:fixed;top:14px;left:14px;color:#8d9aa5;font-size:12px;opacity:.65;z-index:20}.back{position:fixed;z-index:99999;display:none;left:50%;bottom:calc(22px + env(safe-area-inset-bottom));transform:translateX(-50%);padding:14px 34px;border-radius:999px;min-width:120px;background:rgba(35,35,35,.96);color:#fff;border:1px solid rgba(255,255,255,.25);font-weight:800;text-align:center;text-decoration:none;box-shadow:0 4px 18px rgba(0,0,0,.55)}@media(pointer:coarse){.back{display:block}}@media(pointer:fine){.back{display:none}}</style></head><body><div class="badge">SHOWCUE TV DISPLAY</div><a id="back" class="back" href="#">Back</a><div class="wrap"><video id="v" class="video" playsinline muted autoplay></video><div class="text" id="text"><div class="title">${escAttr(title)}</div><div class="sub">Ready for performance</div></div></div><script>
let currentUrl='', video=document.getElementById('v'), text=document.getElementById('text');
function setMsg(t,sub){text.style.display='block';video.style.display='none';text.innerHTML='<div class="title">'+(t||'ShowCue')+'</div><div class="sub">'+(sub||'Ready for performance')+'</div>'}
function playCurrent(time){try{if(Number.isFinite(time)&&time>=0&&video.duration&&time<video.duration)video.currentTime=time}catch(e){};video.muted=true;video.autoplay=true;video.playsInline=true;video.play().catch(()=>{})}
function loadUrl(u,time,shouldPlay=true){if(!u){setMsg(${JSON.stringify(title)},'Ready for performance');return}currentUrl=u;video.pause();video.src=u;video.muted=true;video.autoplay=true;video.playsInline=true;video.style.display='block';text.style.display='none';const fn=()=>{video.removeEventListener('loadedmetadata',fn);if(shouldPlay)playCurrent(time)};if(video.readyState>=1)fn();else video.addEventListener('loadedmetadata',fn)}
async function handle(d){
  if(!d||d.source!=='showcue')return;
  const info=d.video||{};
  const incomingBlob=info.blob instanceof Blob ? info.blob : null;
  const incomingUrl=info.blobUrl||info.fileUrl||'';
  const shouldPlay=d.action!=='pause'&&d.action!=='stop'&&d.playing===true;
  if(d.action==='pause'||d.action==='stop'||(!incomingBlob&&!incomingUrl&&!info.fileKey)){
    video.pause();
    if(d.action==='stop'){try{video.currentTime=0}catch(e){}}
    if(!incomingBlob&&!incomingUrl&&!info.fileKey){
      currentUrl='';
      video.removeAttribute('src');
      video.load();
      setMsg(d.pad?.name||d.song?.name||'ShowCue','Ready for performance');
    }
  }else if(incomingBlob){
    const u=URL.createObjectURL(incomingBlob);
    if(u!==currentUrl) loadUrl(u,Number(d.time)||0,shouldPlay);
  }else if(incomingUrl){
    if(incomingUrl!==currentUrl) loadUrl(incomingUrl,Number(d.time)||0,shouldPlay);
    else if(shouldPlay) playCurrent(Number(d.time)||0);
  }else if(info.fileKey){
    try{
      const f=await getFile(info.fileKey);
      if(f instanceof Blob){
        const u=URL.createObjectURL(f);
        if(u!==currentUrl) loadUrl(u,Number(d.time)||0,shouldPlay);
      }else setMsg(info.name||d.pad?.name||'ShowCue','Video file unavailable on this device');
    }catch(e){setMsg(info.name||d.pad?.name||'ShowCue','Unable to load video')}
  }
  if(typeof d.time==='number'&&video.readyState>=1&&Math.abs(video.currentTime-d.time)>.2){
    try{video.currentTime=d.time}catch(e){}
  }
}
window.addEventListener('message',e=>handle(e.data));
document.getElementById('back').onclick=e=>{e.preventDefault();try{if(window.opener&&!window.opener.closed){window.opener.focus();window.close();return}}catch(_){}if(history.length>1)history.back();else if(document.referrer)location.replace(document.referrer);else location.href='./index.html'};
window.opener?.postMessage({source:'showcue-display',ready:true},'*');
setInterval(()=>{if(!video.paused)window.opener?.postMessage({source:'showcue-display',time:video.currentTime},'*')},500);
<\/script></body></html>`
}
function displayUrlForState(){
  const activeCue=!!(state.current&&state.playing&&audio.src);
  const p=activeCue?(state.current||{}):{};
  const s=state.songs.find(x=>x.id===p.songId),m=state.media.find(x=>x.id===p.videoId);
  const q=new URLSearchParams();
  if(activeCue&&m&&m.fileKey){
    q.set('fileKey',m.fileKey);
    q.set('videoName',m.name||'');
    q.set('songName',s?s.name:'');
    q.set('padName',p.name||'');
    q.set('time',String(audio.currentTime||0));
    q.set('action',audio.paused?'pause':'play');
    q.set('playing',(!audio.paused&&state.playing)?'1':'0');
  }
  return './display.html'+(q.toString()?'?'+q.toString():'');
}
async function openDisplayWindow(){
  displayWindowReady=false;
  // Open the real same-origin display page with the current active cue in its URL.
  // The URL is the authoritative initial state on both PC and iPad; messaging is
  // used only for subsequent play/pause/stop/time updates.
  const base=displayUrlForState();
  const sep=base.includes('?')?'&':'?';
  const url=base+sep+'session='+encodeURIComponent(Date.now()+'-'+Math.random().toString(36).slice(2));
  displayWindow=window.open(url,'ShowCueDisplay','popup,width=1280,height=720');
  if(!displayWindow){alert('Please allow pop-ups for ShowCue to open the TV Display window.');return false}
  return true;
}
async function syncDisplay(action,force=false){
  if((!state.displayEnabled&&!force)||!displayWindow||displayWindow.closed)return;
  const activeCue=!!(state.current&&state.playing&&audio.src&&!audio.paused);
  const p=activeCue?(state.current||{}):{},s=state.songs.find(x=>x.id===p.songId),m=state.media.find(x=>x.id===p.videoId);
  const message={source:'showcue',action,pad:p,song:s?{name:s.name}:null,video:null,time:activeCue?(audio.currentTime||0):0,playing:activeCue&&!audio.paused,muted:state.muted};
  if(activeCue&&m&&m.fileKey){
    message.video={name:m.name,fileKey:m.fileKey};
  }
  // BroadcastChannel works across normal PC windows and iPad/iPhone tabs even when
  // window.opener is unavailable. Keep postMessage as a secondary path for older browsers.
  try{if(displayChannel)displayChannel.postMessage(message)}catch(e){}
  try{displayWindow.postMessage(message,'*')}catch(e){}
  // Never navigate an already-open display during live playback. Navigation was
  // the source of the PC flash/reload behaviour. The initial URL handles the first
  // video; postMessage/BroadcastChannel handles all later state changes.
  return;
}
window.addEventListener('message',e=>{
  if(e.source===displayWindow&&e.data&&e.data.source==='showcue-display'&&e.data.ready){
    displayWindowReady=true;
    syncDisplay('open',true);
  }
});
if(displayChannel)displayChannel.onmessage=e=>{if(e.data&&e.data.source==='showcue-display'&&e.data.ready)syncDisplay('open',true)};

$('#openTv').onclick=async()=>{
  const wasOpen=!!(displayWindow&&!displayWindow.closed);
  if(!wasOpen){await openDisplayWindow();}
  else{try{displayWindow.focus()}catch(e){} await syncDisplay('open',true)}
};
$('#openTvFromPad').onclick=async()=>{
  const wasOpen=!!(displayWindow&&!displayWindow.closed);
  if(!wasOpen) await openDisplayWindow();
  else try{displayWindow.focus()}catch(e){}
  if(wasOpen) await syncDisplay('open',true);
};
$('#tvClose').onclick=()=>$('#tvScreen').classList.remove('open');
$('#backToPads').onclick=()=>{$('#tvScreen').classList.remove('open');showView('pads')};
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='showcue-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)};$('#importFile').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{state=JSON.parse(r.result);save();renderAll()}catch(_){alert('Invalid ShowCue backup')}};r.readAsText(f)};


function renderProcessingSettings(){
  $('#levelMatchToggle').textContent=state.levelMatchSync?'ON':'OFF';
  $('#levelMatchToggle').classList.toggle('on',state.levelMatchSync);
  $('#cutTrackToggle').textContent=state.cutTrack?'ON':'OFF';
  $('#cutTrackToggle').classList.toggle('on',state.cutTrack);
  updateCountButtons();
}
function renderLeadInOptions(){document.querySelectorAll('[data-lead-bars]').forEach(b=>b.classList.toggle('active',Number(b.dataset.leadBars)===state.leadInBars));}
document.querySelectorAll('[data-lead-bars]').forEach(b=>b.addEventListener('click',()=>{state.leadInBars=Number(b.dataset.leadBars)===2?2:4;save();renderLeadInOptions()}));
$('#levelMatchToggle').onclick=async()=>{state.levelMatchSync=!state.levelMatchSync;save();renderProcessingSettings();if(state.levelMatchSync){$('#levelMatchToggle').textContent='ANALYSING…';await analyzeAllSongs();setPlaybackGain(matchingGainDb(state.songs.find(x=>x.id===(state.current&&state.current.songId))));renderProcessingSettings()}else{setPlaybackGain(0)}};
$('#cutTrackToggle').onclick=async()=>{state.cutTrack=!state.cutTrack;save();renderProcessingSettings();if(state.cutTrack){await analyzeAllSongs()}};
function exitShowCue(e){
  if(e){e.preventDefault();e.stopPropagation()}
  try{audio.pause()}catch(_){ }
  try{if(displayWindow&&!displayWindow.closed)displayWindow.close()}catch(_){ }
  try{if(displayChannel)displayChannel.close()}catch(_){ }
  try{if(audioCtx&&audioCtx.state!=='closed')audioCtx.close()}catch(_){ }
  // Browsers do not permit a normal website/PWA to terminate the browser process.
  // Try a real close first (works for script-opened windows). If blocked, shut the
  // ShowCue document down completely so no audio, timers, or app UI remains active.
  try{window.close()}catch(_){ }
  setTimeout(()=>{
    try{
      document.documentElement.innerHTML='<head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ShowCue Closed</title><style>html,body{margin:0;height:100%;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial}body{display:grid;place-items:center}.x{text-align:center}.x h1{font-size:34px;margin:0 0 10px}.x p{color:#9aa4ad;margin:0}</style></head><body><div class="x"><h1>ShowCue Closed</h1><p>You can now close this window.</p></div></body>';
      try{history.replaceState(null,'','./')}catch(_){ }
    }catch(_){ }
  },80);
}
$('#homeExit').addEventListener('click',exitShowCue);
function renderAll(){renderSetlists();renderSongs();renderMedia();renderPads();renderLyrics();renderDisplayButton();renderProcessingSettings();renderLeadInOptions()}buildNav();renderAll();save();