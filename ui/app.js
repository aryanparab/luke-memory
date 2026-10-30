const $ = id => document.getElementById(id);
let status = {};
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
  $('memories').replaceChildren();
  $('timeline-heading').textContent = query ? 'SEARCH RESULTS' : 'RECENT MEMORIES';
  $('memory-count').textContent = `${data.memories.length} records`;
  if (!data.memories.length) {
    const empty = element('div', '', 'empty'); empty.append(element('strong', query ? 'No matching memories.' : 'A little space to think.'), element('p', query ? 'Try a different name or keyword.' : 'Add your first note. Screen recording stays off until you explicitly enable it.')); $('memories').append(empty);
  }
  for (const memory of data.memories) {
    const article = element('article', '', 'memory'); const meta = element('div', '', 'record-meta');
    meta.append(element('span', memory.source.toUpperCase()), element('time', time(memory.created_at)));
    article.append(meta, element('h3', memory.title), element('p', memory.content)); $('memories').append(article);
  }
}
async function loadTasks() {
  const data = await api('/api/tasks'); $('tasks').replaceChildren();
  if (!data.tasks.length) $('tasks').append(element('div', 'Nothing pending. Add a task when something needs a follow-up.', 'empty'));
  for (const task of data.tasks) {
    const row = element('div', '', 'task' + (task.done ? ' done' : ''));
    const button = element('button', task.done ? '✓' : '○'); button.disabled = Boolean(task.done); button.setAttribute('aria-label', 'Complete ' + task.title);
    button.onclick = async () => { try { await api('/api/tasks/complete', {id:task.id}); await loadTasks(); } catch(exc) { error(exc); } };
    row.append(button, element('span', task.title)); $('tasks').append(row);
  }
}
async function loadStatus() {
  status = await api('/api/status');
  $('provider').textContent = status.provider === 'ollama' ? 'LOCAL OLLAMA' : 'GROQ · CLOUD TEXT';
  $('chat-disclosure').textContent = status.provider === 'ollama' ? 'Answers use your local Ollama model. No cloud text fallback.' : 'Questions and retrieved memory excerpts are sent to Groq.';
  $('capture-status').textContent = status.capture_running ? '● Recording screen memory' : 'Capture is off';
  $('capture-toggle').textContent = status.capture_running ? 'Pause recording' : 'Start recording';
  $('capture-once').disabled = !status.capture_allowed;
  $('capture-toggle').disabled = !status.capture_allowed;
  $('capture-hint').textContent = status.capture_error || (status.capture_allowed ? 'Images are processed by local Ollama; only extracted text is saved.' : 'Disabled in this launch. Run npm run capture to enable the controls.');
}
for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => {
  document.querySelectorAll('[data-view]').forEach(node=>node.classList.toggle('active',node===button));
  $('memory-view').hidden=button.dataset.view!=='memory'; $('tasks-view').hidden=button.dataset.view!=='tasks';
  if (button.dataset.view==='tasks') loadTasks().catch(error);
};
$('add-note').onclick=()=>$('note-dialog').showModal(); $('close-note').onclick=()=>$('note-dialog').close();
$('note-form').onsubmit=async event=>{event.preventDefault();clearError();try {await api('/api/memories',{title:$('note-title').value,content:$('note-content').value});$('note-dialog').close();event.target.reset();await loadMemories();}catch(exc){error(exc);}};
$('task-form').onsubmit=async event=>{event.preventDefault();clearError();try {await api('/api/tasks',{title:$('task-title').value});event.target.reset();await loadTasks();}catch(exc){error(exc);}};
$('search-form').onsubmit=event=>{event.preventDefault();clearError();loadMemories().catch(error);};
$('chat-form').onsubmit=async event=>{event.preventDefault();clearError();const question=$('question').value.trim();if(!question)return;$('messages').append(element('div',question,'message user'));$('question').value='';$('send-chat').disabled=true;try{const data=await api('/api/chat',{message:question});const answer=element('div',data.answer,'message assistant');data.sources.forEach((source,i)=>answer.append(element('small',`[${i+1}] ${source.title} · ${time(source.created_at)}`)));$('messages').append(answer);}catch(exc){error(exc);$('messages').append(element('div',exc.message,'message assistant'));}finally{$('send-chat').disabled=false;$('messages').scrollTop=$('messages').scrollHeight;}};
async function captureAction(action) {clearError();try{await api('/api/capture',{action});await loadStatus();await loadMemories();}catch(exc){error(exc);}}
$('capture-toggle').onclick=()=>{if(status.capture_running)captureAction('stop');else if(confirm('Start capturing your primary screen every 30 seconds? Images go to local Ollama and extracted text is saved locally. Pause any time.'))captureAction('start');};
$('capture-once').onclick=async()=>{if(!confirm('Capture your primary screen once and send the image to local Ollama? Extracted text will be saved.'))return;$('capture-once').disabled=true;await captureAction('once');$('capture-once').disabled=!status.capture_allowed;};
$('summarize').onclick=async()=>{clearError();$('summarize').disabled=true;try{await api('/api/summarize',{});await loadMemories();}catch(exc){error(exc);}finally{$('summarize').disabled=false;}};
Promise.all([loadStatus(),loadMemories(),loadTasks()]).catch(error);
setInterval(()=>{loadStatus().catch(error);if(status.capture_running)loadMemories().catch(error);},10000);
