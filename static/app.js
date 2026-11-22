const COLORS=["#ffd166","#9be7a5","#8ecae6","#f4a6c0","#c7b8ff","#ffb48a","#b5e48c"];
let S={items:[],labels:{},annotations:{}},tab="text",cur=null,pick={text:0,entity:0,image:0};
const $=s=>document.querySelector(s);
const esc=t=>(t||"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const items=()=>S.items.filter(i=>i.kind===tab);
const A=id=>S.annotations[id]||(S.annotations[id]={});

async function refresh(keep){
  S=await (await fetch("/api/state")).json();
  const l=items(); if(!keep||!l.find(i=>i.id===cur)) cur=l.length?l[0].id:null;
  render();
}
async function save(id){
  await fetch("/api/annotate/"+id,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(A(id))});
  renderList();
}
function go(d){const l=items();const i=l.findIndex(x=>x.id===cur);const n=l[Math.min(l.length-1,Math.max(0,i+d))];if(n){cur=n.id;render();}}

function renderList(){
  const l=items(),done=l.filter(i=>A(i.id).done).length;
  $("#progress").textContent=`${done} / ${l.length} done`;
  $("#list").innerHTML=l.map(i=>`<li data-id="${i.id}" class="${i.id===cur?"sel":""} ${A(i.id).done?"done":""}">
    <span class="t">${esc(i.kind==="text"?i.text:i.name)}</span></li>`).join("");
  document.querySelectorAll("#list li").forEach(li=>li.onclick=()=>{cur=li.dataset.id;render();});
}
function render(){
  renderList();
  const it=S.items.find(i=>i.id===cur);
  if(!it){$("#panel").innerHTML=`<div class="empty">No ${tab} items yet. Use <b>Upload</b> (.txt/.jsonl/.csv or images).</div>`;return;}
  it.kind==="text"?renderText(it):renderImage(it);
}
function labelRow(kind,key,cls){
  const sel=cls!==undefined?cls:null;
  return `<div class="row">`+S.labels[kind].map((l,i)=>`<button class="lbl ${(sel!==null?sel===l:pick[key]===i)?"active":""}" data-k="${key}" data-i="${i}">${i+1}. ${esc(l)}</button>`).join("")+
  `<button class="btn" data-edit="${kind}">✎ edit labels</button></div>`;
}
function bindLabels(){
  document.querySelectorAll(".lbl").forEach(b=>b.onclick=()=>choose(b.dataset.k,+b.dataset.i));
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=async()=>{
    const k=b.dataset.edit,v=prompt("Comma-separated labels:",S.labels[k].join(", "));
    if(v===null)return;
    await fetch("/api/labels",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:k,labels:v.split(",")})});
    refresh(true);
  });
  const d=$("#done");if(d)d.onclick=toggleDone;
}
function choose(key,i){
  if(i>=S.labels[key].length)return;
  pick[key]=i;
  if(key==="text"){A(cur).cls=S.labels.text[i];save(cur);}
  render();
}
function toggleDone(){A(cur).done=!A(cur).done;save(cur);if(A(cur).done)go(1);else render();}

/* ---------- text ---------- */
function renderText(it){
  const a=A(it.id),spans=(a.spans||[]).slice().sort((x,y)=>x.start-y.start);
  let html="",p=0;
  spans.forEach((s,i)=>{
    html+=esc(it.text.slice(p,s.start));
    const c=COLORS[Math.max(0,S.labels.entity.indexOf(s.label))%COLORS.length];
    html+=`<mark data-s="${i}" style="background:${c}" title="click to remove">${esc(it.text.slice(s.start,s.end))}<small>${esc(s.label)}</small></mark>`;
    p=s.end;
  });
  html+=esc(it.text.slice(p));
  $("#panel").innerHTML=`<h3>Classification (keys 1-9 pick the entity label below)</h3>${labelRow("text","text",a.cls||"")}
    <h3>Entities — select a label, then highlight text</h3>${labelRow("entity","entity")}
    <div id="txt">${html}</div>
    <div class="row" style="margin-top:16px"><button class="done-btn" id="done">${a.done?"✓ Done (undo)":"Mark done"}</button>
    <button class="btn" id="del">Delete item</button></div>`;
  bindLabels();
  $("#del").onclick=async()=>{if(confirm("Delete?")){await fetch("/api/item/"+it.id,{method:"DELETE"});refresh();}};
  document.querySelectorAll("mark").forEach(m=>m.onclick=()=>{spans.splice(+m.dataset.s,1);a.spans=spans;save(it.id);renderText(it);});
  $("#txt").onmouseup=()=>{
    const sel=getSelection();if(sel.isCollapsed||!sel.rangeCount)return;
    const r=sel.getRangeAt(0),box=$("#txt");if(!box.contains(r.commonAncestorContainer))return;
    let start=cleanOffset(box,r.startContainer,r.startOffset),end=cleanOffset(box,r.endContainer,r.endOffset);
    while(start<end&&/\s/.test(it.text[start]))start++;
    while(end>start&&/\s/.test(it.text[end-1]))end--;
    if(end<=start)return;
    if((a.spans||[]).some(s=>start<s.end&&end>s.start)){sel.removeAllRanges();return;}
    (a.spans=a.spans||[]).push({start,end,label:S.labels.entity[pick.entity],text:it.text.slice(start,end)});
    sel.removeAllRanges();save(it.id);renderText(it);
  };
}
// character offset in the original text, ignoring the <small> label text inside marks
function cleanOffset(root,node,off){
  let n=0,done=false;
  (function walk(x){
    if(done)return;
    if(x.nodeType===3){
      const skip=x.parentNode.closest&&x.parentNode.closest("small");
      if(x===node){if(!skip)n+=off;done=true;return;}
      if(!skip)n+=x.length;return;
    }
    if(x===node){ // element container: offset counts child nodes
      for(let i=0;i<off;i++)n+=textLen(x.childNodes[i]);
      done=true;return;
    }
    for(const c of x.childNodes){walk(c);if(done)return;}
  })(root);
  return n;
}
function textLen(x){
  if(x.nodeType===3)return x.parentNode.closest("small")?0:x.length;
  if(x.nodeName==="SMALL")return 0;
  let n=0;for(const c of x.childNodes)n+=textLen(c);return n;
}

/* ---------- image ---------- */
function renderImage(it){
  const a=A(it.id);a.boxes=a.boxes||[];
  $("#panel").innerHTML=`<h3>Draw boxes — choose label, then drag on the image</h3>${labelRow("image","image")}
    <div class="wrap"><img id="img" src="/images/${it.file}"><canvas id="cv"></canvas></div>
    <div id="boxes" style="margin-top:12px"></div>
    <div class="row"><button class="done-btn" id="done">${a.done?"✓ Done (undo)":"Mark done"}</button>
    <button class="btn" id="del">Delete item</button></div>`;
  bindLabels();
  $("#del").onclick=async()=>{if(confirm("Delete?")){await fetch("/api/item/"+it.id,{method:"DELETE"});refresh();}};
  const img=$("#img"),cv=$("#cv"),ctx=cv.getContext("2d");let drag=null,sc=1;
  const draw=()=>{
    ctx.clearRect(0,0,cv.width,cv.height);ctx.lineWidth=2;ctx.font="13px sans-serif";
    a.boxes.forEach(b=>{const c=COLORS[Math.max(0,S.labels.image.indexOf(b.label))%COLORS.length];
      ctx.strokeStyle=c;ctx.fillStyle=c+"33";
      ctx.fillRect(b.x/sc,b.y/sc,b.w/sc,b.h/sc);ctx.strokeRect(b.x/sc,b.y/sc,b.w/sc,b.h/sc);
      ctx.fillStyle=c;ctx.fillText(b.label,b.x/sc+3,b.y/sc+14);});
    if(drag){ctx.strokeStyle="#fff";ctx.strokeRect(drag.x,drag.y,drag.w,drag.h);}
    $("#boxes").innerHTML=a.boxes.map((b,i)=>`<span class="chip">${esc(b.label)} <b data-i="${i}">×</b></span>`).join("");
    document.querySelectorAll("#boxes b").forEach(x=>x.onclick=()=>{a.boxes.splice(+x.dataset.i,1);save(it.id);draw();});
  };
  const setup=()=>{cv.width=img.clientWidth;cv.height=img.clientHeight;sc=img.naturalWidth/img.clientWidth;a.w=img.naturalWidth;a.h=img.naturalHeight;draw();};
  img.complete?setup():img.onload=setup;
  const pos=e=>{const r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];};
  cv.onmousedown=e=>{const[x,y]=pos(e);drag={sx:x,sy:y,x,y,w:0,h:0};};
  cv.onmousemove=e=>{if(!drag)return;const[x,y]=pos(e);drag.x=Math.min(x,drag.sx);drag.y=Math.min(y,drag.sy);drag.w=Math.abs(x-drag.sx);drag.h=Math.abs(y-drag.sy);draw();};
  window.onmouseup=()=>{if(!drag)return;
    if(drag.w>4&&drag.h>4){a.boxes.push({label:S.labels.image[pick.image],x:Math.round(drag.x*sc),y:Math.round(drag.y*sc),w:Math.round(drag.w*sc),h:Math.round(drag.h*sc)});save(it.id);}
    drag=null;draw();};
}

/* ---------- global ---------- */
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{
  tab=t.id.slice(4);document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===t));
  const l=items();cur=l.length?l[0].id:null;render();});
$("#file").onchange=async e=>{
  const fd=new FormData();[...e.target.files].forEach(f=>fd.append("files",f));
  const r=await (await fetch("/api/upload",{method:"POST",body:fd})).json();
  alert(`Added ${r.added} item(s)`);e.target.value="";refresh(true);};
document.addEventListener("keydown",e=>{
  if(["INPUT","TEXTAREA"].includes(e.target.tagName))return;
  const it=S.items.find(i=>i.id===cur);if(!it)return;
  if(/^[1-9]$/.test(e.key)){choose(it.kind==="text"?"entity":"image",+e.key-1);}
  else if(e.key==="n")go(1);else if(e.key==="p")go(-1);
  else if(e.key==="Enter")toggleDone();
  else if(e.key==="Delete"){const a=A(cur);const arr=it.kind==="text"?a.spans:a.boxes;if(arr&&arr.length){arr.pop();save(cur);render();}}
});
refresh();
