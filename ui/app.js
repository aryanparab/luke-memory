const $ = id => document.getElementById(id);
let status = {};
let sourceFilter = "all";
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}
function error(exc) { $('alert').textContent = exc.message; $('alert').hidden = false; }
function clearError() { $('alert').hidden = true; }
function element(tag, text, className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
function time(value) { return new Date(value).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
async function loadMemories() {
  const query = $('search').value.trim();
  const data = await api('/api/memories?q=' + encodeURIComponent(query));
  const memories = data.memories.filter(memory => sourceFilter === 'all' || memory.source === sourceFilter);
  $('memories').replaceChildren();
  $('timeline-heading').textContent = query ? 'SEARCH RESULTS' : 'RECENT MEMORIES';
  $('memory-count').textContent = `${memories.length} ${memories.length === 1 ? "memory" : "memories"}`;
  if (!memories.length) {
    const empty = element('div', '', 'empty');
    const titles = {all:'A little space to think.',note:'A place for your first note.',screen:'No screen memories yet.',summary:'The bigger picture starts here.'};
    const hints = {all:'Add your first note. Screen recording stays off until you explicitly enable it.',note:'Save a thought, link, or decision with New memory.',screen:'Observations appear here after you explicitly enable screen capture.',summary:'Add a few memories, then choose Summarize memories.'};
    empty.append(element('strong', query ? 'No matching memories.' : titles[sourceFilter]), element('p', query ? 'Try a different name or keyword.' : hints[sourceFilter])); $('memories').append(empty);
  }
  for (const memory of memories) {
    const article = element('article', '', 'memory source-' + memory.source); article.id = 'memory-' + memory.id; const meta = element('div', '', 'record-meta');
    meta.append(element('span', ({note:'↗ NOTE', screen:'▣ SCREEN', summary:'✧ SUMMARY'})[memory.source] || memory.source.toUpperCase()), element('time', time(memory.created_at)));
    article.append(meta, element('h3', memory.title));
    if (memory.content.length > 400) { const detail = element('details', '', 'memory-detail'); detail.append(element('summary', 'Read full memory'), element('p', memory.content)); article.append(element('p', memory.content.slice(0, 220) + '…'), detail); } else article.append(element('p', memory.content)); $('memories').append(article);
  }
}
async function loadTasks() {
  const data = await api('/api/tasks'); $('task-count').textContent = data.tasks.filter(task => !task.done).length; $('tasks').replaceChildren();
  if (!data.tasks.length) $('tasks').append(element('div', 'Nothing pending. Add a task when something needs a follow-up.', 'empty'));
  for (const task of data.tasks) {
    const row = element('div', '', 'task' + (task.done ? ' done' : ''));
    const button = element('button', task.done ? '✓' : '○'); button.disabled = Boolean(task.done); button.setAttribute('aria-label', 'Complete ' + task.title);
    button.onclick = async () => { button.disabled = true; try { await api('/api/tasks/complete', {id:task.id}); await loadTasks(); } catch(exc) { error(exc); button.disabled = false; } };
    row.append(button, element('span', task.title)); $('tasks').append(row);
  }
}
async function loadStatus() {
  status = await api('/api/status');
  $('provider').textContent = status.provider === 'ollama' ? 'LOCAL OLLAMA' : 'GROQ · CLOUD TEXT';
  $('chat-disclosure').textContent = status.provider === 'ollama' ? 'Answers use your local Ollama model. No cloud text fallback.' : 'Questions and retrieved memory excerpts are sent to Groq.';
  $('capture-status').textContent = status.capture_running ? '● Recording' : '○ Capture paused';
  $('capture-toggle').textContent = status.capture_running ? 'Pause recording' : 'Start recording';
  $('capture-once').disabled = !status.capture_allowed;
  $('capture-toggle').disabled = !status.capture_allowed;
  $('capture-once').title = $('capture-toggle').title = status.capture_allowed ? '' : 'To enable screen capture controls, relaunch with npm run capture.';
  $('capture-hint').textContent = status.capture_error || (status.capture_allowed ? 'Screen text is extracted locally; only text is saved.' : 'Capture is paused. Your notes and memories are always available.');
}
for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => {
  document.querySelectorAll('[data-view]').forEach(node=>node.classList.toggle('active',node===button));
  $('memory-view').hidden=button.dataset.view!=='memory'; $('tasks-view').hidden=button.dataset.view!=='tasks';
  if (button.dataset.view==='tasks') loadTasks().catch(error);
};
function openNote() { $('note-dialog').showModal(); $('note-title').focus(); }
$('add-note').onclick=openNote; $('close-note').onclick=()=>$('note-dialog').close();
$('note-form').onsubmit=async event=>{event.preventDefault();clearError();const submit=event.target.querySelector('button.primary');submit.disabled=true;try {await api('/api/memories',{title:$('note-title').value,content:$('note-content').value});$('note-dialog').close();event.target.reset();sourceFilter='all';document.querySelectorAll('[data-source]').forEach(node=>{node.classList.toggle('selected',node.dataset.source==='all');node.setAttribute('aria-pressed',String(node.dataset.source==='all'));});await loadMemories();}catch(exc){error(exc);}finally{submit.disabled=false;}};
$('task-form').onsubmit=async event=>{event.preventDefault();clearError();try {await api('/api/tasks',{title:$('task-title').value});event.target.reset();await loadTasks();}catch(exc){error(exc);}};
$('search-form').onsubmit=event=>{event.preventDefault();clearError();loadMemories().catch(error);};
$('chat-form').onsubmit=async event=>{event.preventDefault();clearError();const question=$('question').value.trim();if(!question||$('send-chat').disabled)return;$('messages').append(element('div',question,'message user'));$('question').value='';$('send-chat').disabled=true;const pending=element('div','Finding the thread…','message assistant is-thinking');$('messages').append(pending);try{const data=await api('/api/chat',{message:question});const answer=element('div',data.answer,'message assistant');data.sources.forEach((source,i)=>answer.append(element('small',`[${source.number||i+1}] ${source.title} · ${time(source.created_at)}`)));$('messages').append(answer);}catch(exc){error(exc);$('messages').append(element('div',exc.message,'message assistant'));}finally{pending.remove();$('send-chat').disabled=false;$('messages').scrollTop=$('messages').scrollHeight;}};
async function captureAction(action) {clearError();try{await api('/api/capture',{action});await loadStatus();await loadMemories();}catch(exc){error(exc);}}
$('capture-toggle').onclick=()=>{if(status.capture_running)captureAction('stop');else if(confirm('Start capturing your primary screen every 30 seconds? Text is extracted with local OCR and saved locally. Pause any time.'))captureAction('start');};
$('capture-once').onclick=async()=>{if(!confirm('Read your primary screen once with local OCR? Extracted text will be saved locally.'))return;$('capture-once').disabled=true;await captureAction('once');$('capture-once').disabled=!status.capture_allowed;};
$('summarize').onclick=async()=>{clearError();$('summarize').disabled=true;try{await api('/api/summarize',{});await loadMemories();}catch(exc){error(exc);}finally{$('summarize').disabled=false;}};
document.querySelectorAll('[data-source]').forEach(button=>button.onclick=()=>{ sourceFilter=button.dataset.source; document.querySelectorAll('[data-source]').forEach(node=>(node.classList.toggle('selected',node===button),node.setAttribute('aria-pressed',String(node===button)))); loadMemories().catch(error); });
document.querySelectorAll('[data-prompt]').forEach(button=>button.onclick=()=>{ $('question').value=button.dataset.prompt; $('question').focus(); });
document.addEventListener('keydown',event=>{if(!(event.metaKey||event.ctrlKey))return;if(event.key.toLowerCase()==='k'){event.preventDefault();document.querySelector('[data-view=memory]').click();$('search').focus();}if(event.key.toLowerCase()==='n'){event.preventDefault();openNote();}});
Promise.all([loadStatus(),loadMemories(),loadTasks()]).catch(error);
setInterval(()=>{loadStatus().catch(error);if(status.capture_running)loadMemories().catch(error);},10000);

async function restoreChat(){
  $('send-chat').disabled=true;
  try{const data=await api('/api/chat/history');if(data.messages.length){$('messages').replaceChildren();for(const row of data.messages){const message=element('div',row.content,'message '+(row.role==='user'?'user':'assistant'));for(const source of row.sources)message.append(element('small',`[${source.number}] ${source.title} · ${time(source.created_at)}`));$('messages').append(message);}$('messages').scrollTop=$('messages').scrollHeight;}}
  catch(exc){error(exc);}finally{$('send-chat').disabled=false;}
}
restoreChat();
