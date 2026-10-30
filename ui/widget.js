const orb=document.getElementById('orb');let start=null,moved=false;
orb.addEventListener('pointerdown',event=>{if(event.button!==0)return;start={x:event.screenX,y:event.screenY};moved=false;orb.setPointerCapture(event.pointerId);window.lukeDesktop?.dragStart();});
orb.addEventListener('pointermove',event=>{if(!start)return;const delta={x:event.screenX-start.x,y:event.screenY-start.y};if(Math.abs(delta.x)+Math.abs(delta.y)>5)moved=true;if(moved)window.lukeDesktop?.drag(delta);});
orb.addEventListener('pointerup',()=>{if(!start)return;start=null;window.lukeDesktop?.dragEnd();if(!moved)window.lukeDesktop?.toggle();});
orb.addEventListener('pointercancel',()=>{start=null;window.lukeDesktop?.dragEnd();});
orb.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();window.lukeDesktop?.toggle();}});
async function status(){try{const data=await window.lukeDesktop?.status();document.getElementById('dot').classList.toggle('ready',Boolean(data));}catch{document.getElementById('dot').classList.remove('ready');}}status();setInterval(status,15000);
