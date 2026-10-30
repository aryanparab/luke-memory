const test=require('node:test'),assert=require('node:assert/strict');
const {panelPosition,clampPosition}=require('../desktop/position.cjs');
test('panel opens beside widget without leaving primary work area',()=>{
 const [x,y]=panelPosition({x:1340,y:745,width:74,height:74},{width:390,height:590},{x:0,y:0,width:1440,height:845});
 assert.equal(x,938);assert.equal(y,229);
});
test('left-edge widget opens panel on its right',()=>{
 const[x,y]=panelPosition({x:0,y:20,width:74,height:74},{width:390,height:590},{x:0,y:0,width:1440,height:845});
 assert.equal(x,86);assert.equal(y,0);
});
test('negative-coordinate secondary monitor is supported',()=>{
 const[x,y]=clampPosition({x:-2400,y:1000,width:74,height:74},{x:-1920,y:0,width:1920,height:1080});
 assert.equal(x,-1920);assert.equal(y,1000);
});
test('offscreen saved widget is clamped back into view',()=>{
 assert.deepEqual(clampPosition({x:9000,y:9000,width:74,height:74},{x:0,y:0,width:1440,height:845}),[1366,771]);
});
