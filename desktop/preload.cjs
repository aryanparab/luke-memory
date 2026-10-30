const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('lukeDesktop',Object.freeze({
  toggle:()=>ipcRenderer.send('luke:toggle'),hide:()=>ipcRenderer.send('luke:hide'),library:()=>ipcRenderer.send('luke:library'),
  status:()=>ipcRenderer.invoke('luke:status'),dragStart:()=>ipcRenderer.send('luke:drag-start'),
  drag:delta=>ipcRenderer.send('luke:drag',delta),dragEnd:()=>ipcRenderer.send('luke:drag-end'),
  onOpened:callback=>{ipcRenderer.on('luke:opened',()=>callback());}
}));
