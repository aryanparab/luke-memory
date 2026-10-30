// Luke's primary UI is a small persistent widget with an anchored chat popover.
const {app,BrowserWindow,dialog,ipcMain,Menu,Tray,nativeImage,globalShortcut,screen}=require('electron');
const {spawn}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const {panelPosition,clampPosition}=require('./position.cjs');
const root=path.join(__dirname,'..'),port=process.env.LUKE_PORT||'5051',origin=`http://127.0.0.1:${port}`;
const positionFile=path.join(root,'.data','widget-position.json');
const prefs={nodeIntegration:false,contextIsolation:true,sandbox:true,preload:path.join(__dirname,'preload.cjs')};
let backend,widget,panel,library,tray,quitting=false,dragOrigin,saveTimer;
if(!app.requestSingleInstanceLock())app.quit();else{
  app.on('second-instance',()=>togglePanel(true));
  app.whenReady().then(start).catch(error=>{dialog.showErrorBox('Luke Memory',error.message);app.quit();});
}
function backendStatus(){return new Promise(resolve=>{
  const req=http.get(origin+'/api/status',res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>{try{const data=JSON.parse(text);resolve(data.app==='luke-memory'?data:null);}catch{resolve(null);}});});
  req.on('error',()=>resolve(null));req.setTimeout(1500,()=>{req.destroy();resolve(null);});
});}
function guardNavigation(win,localFile=false){
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(localFile||new URL(url).origin!==origin)event.preventDefault();});
}
function placePanel(){if(!widget||!panel)return;const bounds=widget.getBounds();panel.setPosition(...panelPosition(bounds,panel.getBounds(),screen.getDisplayMatching(bounds).workArea));}
function togglePanel(force){if(!panel||!widget)return;if(panel.isVisible()&&force!==true){panel.hide();return;}placePanel();panel.show();panel.focus();panel.webContents.send('luke:opened');}
function openLibrary(){
  if(library&&!library.isDestroyed()){library.show();library.focus();return;}
  library=new BrowserWindow({width:1180,height:800,minWidth:760,minHeight:600,title:'Luke Memory · Library',backgroundColor:'#f7f7f2',webPreferences:prefs});
  guardNavigation(library);library.loadURL(origin);library.on('closed',()=>{library=null;});
}
function ownSender(event){return[widget,panel,library].some(win=>win&&!win.isDestroyed()&&win.webContents===event.sender);}
ipcMain.on('luke:toggle',event=>{if(ownSender(event))togglePanel();});
ipcMain.on('luke:hide',event=>{if(ownSender(event))panel?.hide();});
ipcMain.on('luke:library',event=>{if(ownSender(event))openLibrary();});
ipcMain.handle('luke:status',event=>ownSender(event)?backendStatus():null);
ipcMain.on('luke:drag-start',event=>{if(widget?.webContents===event.sender)dragOrigin=widget.getBounds();});
ipcMain.on('luke:drag',(event,delta)=>{
  if(widget?.webContents!==event.sender||!dragOrigin||!Number.isFinite(delta?.x)||!Number.isFinite(delta?.y))return;
  const x=dragOrigin.x+Math.round(delta.x),y=dragOrigin.y+Math.round(delta.y);
  const area=screen.getDisplayNearestPoint({x:x+36,y:y+36}).workArea;
  widget.setPosition(...clampPosition({x,y,width:74,height:74},area));if(panel?.isVisible())placePanel();
});
ipcMain.on('luke:drag-end',event=>{if(widget?.webContents===event.sender)dragOrigin=null;});
async function start(){
  if(!(await backendStatus())){
    const candidates=[process.env.LUKE_PYTHON,path.join(root,'.venv','bin','python'),path.join(root,'.venv','Scripts','python.exe')].filter(Boolean);
    const python=candidates.find(p=>fs.existsSync(p))||'python3';
    backend=spawn(python,[path.join(root,'backend','app.py')],{cwd:root,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:'inherit'});
    backend.on('error',()=>dialog.showErrorBox('Python could not start','Follow the Python setup in README.md.'));
    for(let i=0;i<40&&!(await backendStatus());i++)await new Promise(resolve=>setTimeout(resolve,250));
    if(!(await backendStatus()))throw new Error('The local memory backend did not become ready. Check the terminal and Python setup.');
  }
  const area=screen.getPrimaryDisplay().workArea;
  let saved;try{saved=JSON.parse(fs.readFileSync(positionFile,'utf8'));}catch{/* First launch. */}
  const initial=saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)?saved:{x:area.x+area.width-100,y:area.y+area.height-100};
  const targetArea=screen.getDisplayNearestPoint({x:initial.x,y:initial.y}).workArea;
  const[x,y]=clampPosition({...initial,width:74,height:74},targetArea);
  widget=new BrowserWindow({x,y,width:74,height:74,frame:false,transparent:true,alwaysOnTop:true,focusable:false,resizable:false,skipTaskbar:true,hasShadow:false,show:false,webPreferences:prefs});
  widget.setAlwaysOnTop(true,'floating');widget.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});guardNavigation(widget,true);
  await widget.loadFile(path.join(root,'ui','widget.html'));widget.showInactive();
  panel=new BrowserWindow({width:390,height:590,frame:false,alwaysOnTop:true,skipTaskbar:true,resizable:false,show:false,backgroundColor:'#f5f5ef',webPreferences:prefs});
  panel.setAlwaysOnTop(true,'floating');panel.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  guardNavigation(panel);await panel.loadURL(origin+'/assets/panel.html');
  panel.on('close',event=>{if(!quitting){event.preventDefault();panel.hide();}});
  panel.on('blur',()=>{if(!dragOrigin)panel.hide();});
  widget.on('move',()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{fs.mkdirSync(path.dirname(positionFile),{recursive:true});const{x,y}=widget.getBounds();fs.writeFileSync(positionFile,JSON.stringify({x,y}));}catch{/* Position persistence is optional. */}},300);});
  const pixels=Buffer.alloc(16*16*4);
  for(let y=2;y<14;y++)for(let x=3;x<13;x++)if(x<6||y>10){const i=(y*16+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=40;pixels[i+3]=255;}
  const icon=nativeImage.createFromBitmap(pixels,{width:16,height:16});
  if(process.platform==='darwin')icon.setTemplateImage(true);
  tray=new Tray(icon);tray.setToolTip('Luke Memory');tray.setContextMenu(Menu.buildFromTemplate([
    {label:'Chat with Luke',click:()=>togglePanel(true)},{label:'Open memory library',click:openLibrary},{type:'separator'},{label:'Quit Luke',click:()=>app.quit()}]));
  tray.on('click',()=>togglePanel());
  const shortcut=globalShortcut.register('CommandOrControl+Shift+Space',()=>togglePanel());
  if(process.platform==='darwin')app.dock.hide();
  console.log(`[Luke] Desktop widget ready. Chat starts hidden. Shortcut: ${shortcut?'Cmd/Ctrl+Shift+Space':'unavailable; use the widget'}.`);
}
app.on('activate',()=>{if(widget){widget.showInactive();togglePanel(true);}});
app.on('before-quit',()=>{quitting=true;clearTimeout(saveTimer);globalShortcut.unregisterAll();backend?.kill();});
app.on('window-all-closed',()=>{if(quitting)app.quit();});
