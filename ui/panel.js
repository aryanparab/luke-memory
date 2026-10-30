const $=id=>document.getElementById(id);let active='chat';
const node=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};
async function api(url,body){const response=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed');return data;}
function error(exc){$('error').hidden=false;$('error').textContent=exc.message;}
function clearError(){$('error').hidden=true;}
function date(value){return new Date(value).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
async function refresh(){try{
  const state=await api('/api/status');$('connection').textContent=state.provider==='ollama'?'Your memory · local Ollama':'Your memory · Groq text';
  $('disclosure').textContent=state.provider==='ollama'?'Answers use local Ollama. Nothing is sent to a cloud model.':'Questions and retrieved memory excerpts are sent to Groq.';
  $('memory-count').textContent=state.memory_count;
  $('capture-toggle').textContent=state.capture_running?'Pause memory':'Start memory';
  $('capture-toggle').disabled=!state.capture_allowed;
  $('capture').textContent=state.capture_error?'Extraction error':state.capture_running?`OCR on · ${state.duplicate_skips} duplicates skipped`:'Screen memory paused';
  $('capture').title=state.capture_error||`${state.memory_count} memories · ${state.compacted_records} compacted · ${state.pending_compaction} pending. ${state.compaction_error||''}`;
  if(state.capture_error)error(new Error(state.capture_error));
  const data=await api('/api/tasks');$('task-count').textContent=data.tasks.filter(task=>!task.done).length;
  if(active==='tasks')renderTasks(data.tasks);
}catch(exc){$('connection').textContent='Local backend unavailable';error(exc);}}
function select(tab){active=tab;document.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab));['chat','memories','tasks'].forEach(id=>$(id).hidden=id!==tab);if(tab==='chat')$('question').focus();if(tab==='memories')loadMemories().catch(error);if(tab==='tasks')refresh();}
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>select(button.dataset.tab));
$('hide').onclick=()=>window.lukeDesktop?.hide();$('library').onclick=()=>window.lukeDesktop?window.lukeDesktop.library():location.assign('/');
document.addEventListener('keydown',event=>{if(event.key==='Escape')window.lukeDesktop?.hide();});
window.lukeDesktop?.onOpened(()=>{refresh();$('question').focus();});
$('starter').onclick=()=>{$('question').value='What have I been working on recently?';$('question').focus();};
$('question').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();if(!$('send').disabled&&$('question').value.trim())$('chat-form').requestSubmit();}});
$('chat-form').onsubmit=async event=>{event.preventDefault();if($('send').disabled)return;const question=$('question').value.trim();if(!question)return;clearError();$('messages').querySelector('.welcome')?.remove();$('messages').append(node('div',question,'message user'));$('question').value='';$('send').disabled=true;const pending=node('div','Finding the thread…','message thinking');$('messages').append(pending);$('messages').scrollTop=$('messages').scrollHeight;
try{const data=await api('/api/chat',{message:question});const answer=node('div',data.answer,'message');data.sources.forEach((source,index)=>answer.append(node('small',`[${source.number||index+1}] ${source.title} · ${date(source.created_at)}`)));$('messages').append(answer);}catch(exc){$('messages').append(node('div',exc.message,'message'));}finally{pending.remove();$('send').disabled=false;$('messages').scrollTop=$('messages').scrollHeight;}};
async function loadMemories(){const data=await api('/api/memories?q='+encodeURIComponent($('query').value));$('records').replaceChildren();if(!data.memories.length)$('records').append(node('p','No memories here yet. Save a quick note to start.','empty'));data.memories.forEach(memory=>{const record=node('article','','record');record.append(node('small',`${memory.source.toUpperCase()} · ${date(memory.created_at)}`),node('p',memory.title));const detail=document.createElement('details');detail.append(node('summary','Read memory'),node('p',memory.content));record.append(detail);$('records').append(record);});}
$('search-form').onsubmit=event=>{event.preventDefault();loadMemories().catch(error);};
$('note-form').onsubmit=async event=>{event.preventDefault();clearError();const button=event.target.querySelector('button');button.disabled=true;const text=$('note').value.trim();try{await api('/api/memories',{title:text.split('\n')[0].slice(0,100),content:text});event.target.reset();await loadMemories();}catch(exc){error(exc);}finally{button.disabled=false;}};
function renderTasks(tasks){$('task-list').replaceChildren();if(!tasks.length)$('task-list').append(node('p','A clear list. Add something to follow up.','empty'));tasks.forEach(task=>{const row=node('div','','task'+(task.done?' done':''));const button=node('button',task.done?'✓':'○');button.disabled=Boolean(task.done);button.setAttribute('aria-label','Complete '+task.title);button.onclick=async()=>{button.disabled=true;try{await api('/api/tasks/complete',{id:task.id});refresh();}catch(exc){error(exc);button.disabled=false;}};row.append(button,node('span',task.title));$('task-list').append(row);});}
$('task-form').onsubmit=async event=>{event.preventDefault();clearError();const button=event.target.querySelector('button');button.disabled=true;try{await api('/api/tasks',{title:$('task-title').value});event.target.reset();await refresh();}catch(exc){error(exc);}finally{button.disabled=false;}};
$('capture-toggle').onclick=async()=>{try{const state=await api('/api/status');await api('/api/capture',{action:state.capture_running?'stop':'start'});await refresh();}catch(exc){error(exc);}};
async function restoreHistory(){
  $('send').disabled=true;
  try{const data=await api('/api/chat/history');if(data.messages.length){$('messages').replaceChildren();for(const entry of data.messages){const message=node('div',entry.content,'message'+(entry.role==='user'?' user':''));for(const source of entry.sources)message.append(node('small',`[${source.number}] ${source.title} · ${date(source.created_at)}`));$('messages').append(message);}$('messages').scrollTop=$('messages').scrollHeight;}}
  catch(exc){error(exc);}finally{$('send').disabled=false;}
}
restoreHistory();refresh();setInterval(refresh,15000);
