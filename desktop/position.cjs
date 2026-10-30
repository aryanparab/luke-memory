function clampPosition(box,area){return[
  Math.round(Math.min(Math.max(box.x,area.x),Math.max(area.x,area.x+area.width-box.width))),
  Math.round(Math.min(Math.max(box.y,area.y),Math.max(area.y,area.y+area.height-box.height)))];}
function panelPosition(widget,panel,area){const left=widget.x-panel.width-12;return clampPosition({
  x:left>=area.x?left:widget.x+widget.width+12,y:widget.y+widget.height-panel.height,width:panel.width,height:panel.height},area);}
module.exports={clampPosition,panelPosition};
