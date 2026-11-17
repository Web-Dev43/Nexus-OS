(() => {
"use strict";
const KEY = "nexus-notes-vault-v1";
const enc = new TextEncoder();
const dec = new TextDecoder();
const $ = (root, id) => root.querySelector("#" + id);
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const un64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
async function derive(pass, salt) {
  const material = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:310000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function seal(data, pass, saltBytes) {
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(pass,salt);
  const cipher = await crypto.subtle.encrypt({name:"AES-GCM",iv},key,enc.encode(JSON.stringify(data)));
  return {v:1,salt:b64(salt),iv:b64(iv),data:b64(cipher)};
}
async function open(envelope, pass) {
  const key = await derive(pass,un64(envelope.salt));
  const plain = await crypto.subtle.decrypt({name:"AES-GCM",iv:un64(envelope.iv)},key,un64(envelope.data));
  return JSON.parse(dec.decode(plain));
}
function readVault(){try{return JSON.parse(localStorage.getItem(KEY)||"null")}catch(_){return null}}
function writeVault(value){try{localStorage.setItem(KEY,JSON.stringify(value));return true}catch(_){return false}}
function id(){return "note-"+crypto.randomUUID()}
function esc(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function render(){return `
<div class="notes-app">
 <div class="notes-top"><div><h2>Notes</h2><p class="muted" id="notes-status">Your private notes are encrypted on this device</p></div><span class="notes-lock-mark">🔒</span></div>
 <div id="notes-gate" class="notes-gate">
  <h3 id="notes-gate-title">Private Notes</h3><p class="muted" id="notes-gate-copy">Create a passcode to encrypt your notes. This passcode cannot be recovered if forgotten.</p>
  <label class="notes-label" for="notes-pass">Passcode</label><input id="notes-pass" class="auth-input" type="password" autocomplete="current-password" inputmode="numeric" minlength="6" placeholder="At least 6 characters">
  <div id="notes-confirm-wrap" hidden><label class="notes-label" for="notes-confirm">Confirm passcode</label><input id="notes-confirm" class="auth-input" type="password" autocomplete="new-password" placeholder="Enter it again"></div>
  <p id="notes-error" class="notes-error" role="alert"></p><button class="primary" id="notes-unlock">Unlock Notes</button>
 </div>
 <div id="notes-workspace" class="notes-workspace" hidden>
  <aside class="notes-sidebar"><button class="primary notes-new" id="notes-new">＋ New Note</button><input id="notes-search" class="notes-search" type="search" placeholder="Search notes"><div id="notes-list" class="notes-list"></div><button class="pill notes-lock" id="notes-lock">🔒 Lock Notes</button></aside>
  <section class="notes-editor" id="notes-editor"><div class="notes-empty">Select a note or create a new one</div></section>
 </div>
</div>`}
function mount(windowEl, api){
 const root=windowEl.querySelector(".win-body"); let vault=readVault();
 const gate=$(root,"notes-gate"), workspace=$(root,"notes-workspace"), pass=$(root,"notes-pass"), confirm=$(root,"notes-confirm");
 const err=$(root,"notes-error"), status=$(root,"notes-status"), list=$(root,"notes-list"), editor=$(root,"notes-editor");
 let notes=[], active=null, secret="", saveTimer=null, locked=true;
 const setError=m=>{err.textContent=m||""};
 function showGate(first){gate.hidden=false;workspace.hidden=true;$(root,"notes-gate-title").textContent=first?"Create your passcode":"Unlock your notes";$(root,"notes-gate-copy").textContent=first?"Choose a passcode with at least 6 characters. Your notes will be encrypted on this device. If you forget it, the notes cannot be recovered.":"Enter your passcode to decrypt your notes on this device.";$(root,"notes-unlock").textContent=first?"Create encrypted vault":"Unlock Notes";$(root,"notes-confirm-wrap").hidden=!first;pass.value="";confirm.value="";pass.focus()}
 function renderList(){
  const q=$(root,"notes-search").value.trim().toLowerCase();
  const visible=notes.filter(n=>(n.title+" "+n.body).toLowerCase().includes(q)).sort((a,b)=>(b.updated||0)-(a.updated||0));
  list.innerHTML=visible.map(n=>'<button class="notes-item '+(n.id===active?"selected":"")+'" data-note-id="'+esc(n.id)+'"><strong>'+esc(n.title||"Untitled")+'</strong><small>'+esc((n.body||"").replace(/\s+/g," ").slice(0,65)||"No additional text")+'</small></button>').join("")||'<p class="muted notes-no-results">No notes yet</p>';
 }
 function renderEditor(){
  const n=notes.find(x=>x.id===active);
  if(!n){editor.innerHTML='<div class="notes-empty">Select a note or create a new one</div>';return}
  editor.innerHTML='<div class="notes-editor-actions"><span class="muted" id="notes-save-state">Saved on this device</span><button class="pill" id="notes-delete">Delete note</button></div><input class="notes-title" id="notes-title" maxlength="160" placeholder="Title" value="'+esc(n.title||"")+'"><textarea class="notes-body" id="notes-body" placeholder="Start writing...">'+esc(n.body||"")+'</textarea>';
  const title=$(root,"notes-title"), body=$(root,"notes-body");
  const changed=()=>{n.title=title.value;n.body=body.value;n.updated=Date.now();$(root,"notes-save-state").textContent="Saving…";renderList();clearTimeout(saveTimer);saveTimer=setTimeout(save,450)};
  title.addEventListener("input",changed);body.addEventListener("input",changed);
  $(root,"notes-delete").addEventListener("click",async()=>{if(!window.confirm("Delete this note permanently?"))return;notes=notes.filter(x=>x.id!==active);active=null;await save();renderList();renderEditor()});
 }
 async function save(){if(locked)return;try{const encrypted=await seal({notes},secret,un64(vault.salt));if(!writeVault(encrypted)){status.textContent="Storage is full. Export or remove some browser data.";return}status.textContent="Encrypted and saved on this device";const state=$(root,"notes-save-state");if(state)state.textContent="Saved"}catch(e){api.notify("Could not encrypt and save notes")}}
 async function unlock(){
  setError("");const value=pass.value;
  if(value.length<6){setError("Use at least 6 characters for your passcode.");return}
  const first=!readVault();
  if(first&&value!==confirm.value){setError("The passcodes do not match.");return}
  try{
   if(first){secret=value;notes=[];const initial=await seal({notes},secret);if(!writeVault(initial))throw Error("Browser storage is unavailable");vault=initial}
   else{const envelope=readVault();const data=await open(envelope,value);if(!data||!Array.isArray(data.notes))throw Error("Invalid vault");notes=data.notes;secret=value;vault=envelope}
   locked=false;gate.hidden=true;workspace.hidden=false;status.textContent="Unlocked · encrypted local storage";renderList();renderEditor();
  }catch(e){setError(first?"Could not create the encrypted vault. Check browser storage.":"Incorrect passcode or damaged encrypted notes.")}
 }
 $(root,"notes-unlock").addEventListener("click",unlock);
 pass.addEventListener("keydown",e=>{if(e.key==="Enter")unlock()});confirm.addEventListener("keydown",e=>{if(e.key==="Enter")unlock()});
 $(root,"notes-new").addEventListener("click",()=>{const n={id:id(),title:"",body:"",updated:Date.now()};notes.unshift(n);active=n.id;renderList();renderEditor();$(root,"notes-title").focus();save()});
 $(root,"notes-search").addEventListener("input",renderList);
 list.addEventListener("click",e=>{const b=e.target.closest("[data-note-id]");if(!b)return;const n=notes.find(x=>x.id===b.dataset.noteId);if(n){active=n.id;renderList();renderEditor()}});
 $(root,"notes-lock").addEventListener("click",()=>lock());
 function lock(){clearTimeout(saveTimer);if(!locked){save().finally(()=>{notes=[];active=null;secret="";locked=true;showGate(false)})}else showGate(Boolean(!readVault()))}
 windowEl._cleanup=()=>{clearTimeout(saveTimer);if(!locked){save().finally(()=>{notes=[];secret="";locked=true})}};
 showGate(!vault);
}
window.NexusAppModules=window.NexusAppModules||{};
window.NexusAppModules.notes={render,mount};
})();