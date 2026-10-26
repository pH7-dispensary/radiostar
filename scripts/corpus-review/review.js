const $=id=>document.getElementById(id);
let corpus,episode,selected=[],csrf,busy=false,previewEnd=null,windowIndex=-1,contextGeneration=0,editingId=null;
const time=ms=>{const s=ms/1000;return `${Math.floor(s/60)}:${(s%60).toFixed(3).padStart(6,'0')}`;};
const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json','x-corpus-csrf':csrf}:{},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data;}
function message(value){$('status').textContent=value;}
function invalidate(){ $('listened').checked=false; }
async function load(){
 corpus=await api('/manifest');csrf=corpus.csrf;$('episodes').replaceChildren();
 for(const row of corpus.episodes){const b=text('button',`${row.review.complete?'✓ ':''}${row.title}`);b.onclick=()=>choose(row.id);b.dataset.id=row.id;$('episodes').append(b);}
 const m=corpus.metrics;$('summary').textContent=`${m.episodes} pinned episodes · ${m.completeEpisodes} fully reviewed · ${m.reviewedLabels} range labels. Recall: ${m.recall===null?'not yet measurable':(100*m.recall).toFixed(1)+'%'}. Complete breaks: ${m.completeBreakCoverage===null?'not yet measurable':(100*m.completeBreakCoverage).toFixed(1)+'%'}. No production settings are changed.`;
 $('priority').replaceChildren();for(const clip of corpus.priorityClips||[]){const e=corpus.episodes.find(e=>e.id===clip.id);if(!e)continue;const b=text('button',`${e.title} · ${time(clip.startMs)}–${time(clip.endMs)}`);b.onclick=()=>{choose(e.id);openWindow({...clip,candidateIds:e.candidates.filter(c=>c.startMs<clip.endMs&&c.endMs>clip.startMs).map(c=>c.id),reason:clip.question});};$('priority').append(b);}
}
async function openWindow(w){
 const generation=++contextGeneration,id=episode.id;editingId=null;previewEnd=null;selected=w.candidateIds||[];invalidate();
 const candidates=episode.candidates.filter(c=>selected.includes(c.id));
 $('start').value=(candidates.length?Math.min(...candidates.map(c=>c.startMs)):w.startMs)/1000;
 $('end').value=(candidates.length?Math.max(...candidates.map(c=>c.endMs)):w.endMs)/1000;
 $('candidate-evidence').textContent=candidates.length?`${candidates.length} provisional candidates · detector scores ${Math.round(100*Math.min(...candidates.map(c=>c.confidence)))}–${Math.round(100*Math.max(...candidates.map(c=>c.confidence)))}% (not measured accuracy). ${[...new Set(candidates.map(c=>c.decisionReason))].join(' ')}`:'No detected candidate. This does not establish that the audio is ad-free.';
 $('audio').currentTime=w.startMs/1000;$('audio').play().catch(e=>{if(e.name!=='AbortError')message(e.message);});
 $('context-state').textContent='Preparing bounded audio context…';$('transcript').replaceChildren();$('waveform').getContext('2d').clearRect(0,0,800,110);
 try{
  const c=await api('/context/'+encodeURIComponent(id)+'?'+new URLSearchParams({startMs:w.startMs,endMs:Math.min(w.endMs,w.startMs+300000)}));
  if(generation!==contextGeneration||episode.id!==id)return;
  const ctx=$('waveform').getContext('2d');ctx.fillStyle='#7653a4';c.peaks.forEach((p,i)=>ctx.fillRect(i*2,55-p*50,1,Math.max(1,p*100)));
  $('context-state').textContent=`Audio amplitude ${time(c.startMs)}–${time(c.endMs)}; not boundary verification. Transcript alignment: ${c.transcriptAlignment||'UNVERIFIED'}.${c.truncated?' Showing the first 100 segments.':''}`;
  for(const s of c.transcript){const line=text('p',`${time(s.startMs)} ${s.text}`);$('transcript').append(line);}
  if(!c.transcript.length)$('transcript').append(text('p','No acquired transcript in this window. Review the audio; no transcription was purchased.'));
 }catch(e){if(generation===contextGeneration)$('context-state').textContent=e.message;}
}
function choose(id){
 episode=corpus.episodes.find(e=>e.id===id);selected=[];editingId=null;windowIndex=-1;contextGeneration++;previewEnd=null;history.replaceState(null,'','#'+id);
 $('title').textContent=episode.title;$('source').replaceChildren(text('span',episode.publisher+' · '));const link=text('a','Original episode');link.href=episode.sourcePage;link.target='_blank';link.rel='noopener';$('source').append(link,text('span',' · '+episode.licence+' · Audio unchanged; review context is cropped.'));
 $('hash').textContent='SHA-256 '+episode.audioContentHash;$('audio').src='/audio/'+encodeURIComponent(id);$('audio').playbackRate=Number($('speed').value);
 invalidate();$('whole').checked=false;$('notes').value='';$('start').value='0';$('end').value='1';$('kind').value='advert';
 $('context-state').textContent='Choose a clip for waveform and transcript context.';$('candidate-evidence').textContent='';$('transcript').replaceChildren();$('waveform').getContext('2d').clearRect(0,0,800,110);
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('selected',b.dataset.id===id));$('windows').replaceChildren();
 episode.reviewWindows.forEach((w,i)=>{const d=text('div','');d.className='window';const b=text('button',`Review ${time(w.startMs)}–${time(w.endMs)}`);b.onclick=()=>{windowIndex=i;openWindow(w);};d.append(b,text('p',w.reason));$('windows').append(d);});
 $('labels').replaceChildren();for(const label of episode.review.labels){const div=text('div',`${label.kind} · ${time(label.startMs)}–${time(label.endMs)} · ${label.reviewer} · ${label.notes}`);div.className='annotation';const edit=text('button','Correct boundaries / label');edit.onclick=()=>{editingId=label.id;selected=label.candidateIds||[];$('start').value=label.startMs/1000;$('end').value=label.endMs/1000;$('kind').value=label.kind;$('format').value=label.format||'unknown';$('notes').value=label.notes;invalidate();$('start').focus();message('Editing the existing label; independently recheck before saving.');};const remove=text('button','Remove incorrect label');remove.onclick=()=>mutate({action:'remove',annotationId:label.id});div.append(edit,remove);$('labels').append(div);}
 message(episode.review.complete?'Full review complete. New annotations reopen the review.':'Pending human audio review.');
}
async function mutate(extra){if(busy)return;if(!$('reviewer').value.trim()){message('Enter your name to record independent human review.');return;}busy=true;try{await api('/review',{episodeId:episode.id,audioContentHash:episode.audioContentHash,expectedVersion:episode.review.version,reviewer:$('reviewer').value,...extra});const id=episode.id,pos=$('audio').currentTime;await load();choose(id);$('audio').currentTime=pos;message('Saved in the hash-bound review audit history.');}catch(e){message(e.message);}finally{busy=false;}}
function save(){return mutate({action:'annotation',...(editingId?{id:editingId}:{}),startMs:Math.round(Number($('start').value)*1000),endMs:Math.round(Number($('end').value)*1000),kind:$('kind').value,format:$('format').value,notes:$('notes').value,candidateIds:selected,listened:$('listened').checked,independent:true,fullEpisodeReviewed:$('whole').checked});}
$('save').onclick=save;
$('reject').onclick=()=>{if(!selected.length){message('Select a candidate first.');return;}if(!$('notes').value.trim()){message('Explain why the heard range is not an advert; use Uncertain if unresolved.');return;}$('kind').value='product_discussion';save();};
$('uncertain').onclick=()=>{$('kind').value='uncertain';save();};
$('complete').onclick=()=>{if(!$('whole').checked){message('A full listen is required to measure missed advertisements.');return;}if(confirm('Confirm you listened to the entire pinned episode, labelled every complete advert break, and resolved uncertain ranges. This does not enable skipping.'))mutate({action:'complete',fullEpisodeReviewed:true});};
$('kind').onchange=()=>{invalidate();if($('kind').value==='no_advert'){$('start').value=0;$('end').value=episode.durationMs/1000;}};
for(const id of ['start','end'])$(id).oninput=invalidate;
$('mark-start').onclick=()=>{$('start').value=$('audio').currentTime.toFixed(3);invalidate();};$('mark-end').onclick=()=>{$('end').value=$('audio').currentTime.toFixed(3);invalidate();};
$('back').onclick=()=>{$('audio').currentTime=Math.max(0,$('audio').currentTime-5);};$('forward').onclick=()=>{$('audio').currentTime=Math.min(episode.durationMs/1000,$('audio').currentTime+5);};
$('speed').onchange=()=>{$('audio').playbackRate=Number($('speed').value);};$('start-fine').onclick=()=>{$('start').value=Math.max(0,Number($('start').value)-.25).toFixed(3);invalidate();};$('end-fine').onclick=()=>{$('end').value=Math.min(episode.durationMs/1000,Number($('end').value)+.25).toFixed(3);invalidate();};
function nextWindow(delta){if(!episode?.reviewWindows.length)return;windowIndex=(windowIndex+delta+episode.reviewWindows.length)%episode.reviewWindows.length;openWindow(episode.reviewWindows[windowIndex]);}
$('next-window').onclick=()=>nextWindow(1);$('previous-window').onclick=()=>nextWindow(-1);
$('preview').onclick=()=>{previewEnd=Math.min(episode.durationMs/1000,Number($('end').value)+2);$('audio').currentTime=Math.max(0,Number($('start').value)-2);$('audio').play().catch(e=>{if(e.name!=='AbortError')message(e.message);});};$('audio').ontimeupdate=()=>{$('clock').textContent=time($('audio').currentTime*1000);if(previewEnd!==null&&$('audio').currentTime>=previewEnd){$('audio').pause();previewEnd=null;}};
document.addEventListener('keydown',e=>{if(!episode||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT|BUTTON|AUDIO/.test(e.target.tagName)||e.target.isContentEditable)return;const controls={ArrowLeft:'back',ArrowRight:'forward',i:'mark-start',o:'mark-end',n:'next-window'};if(controls[e.key]){e.preventDefault();$(controls[e.key]).click();}else if(e.code==='Space'){e.preventDefault();if($('audio').paused)$('audio').play().catch(e=>message(e.message));else $('audio').pause();}});
load().then(()=>choose(corpus.episodes.some(e=>e.id===location.hash.slice(1))?location.hash.slice(1):corpus.episodes[0].id)).catch(e=>{$('title').textContent='Review unavailable';message(e.message);});
