#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const live=read('live.html'),style=read('stage-ui.css'),
      script=read('dialog-close.js'),match=read('match.html'),
      matchConfirm=read('match-confirm.js');
let n=0;const ok=(v,msg)=>{assert.ok(v,msg);n++;};
class Button{
 constructor(text){this.textContent=text;this.type='button';this.disabled=false;
  this.isConnected=true;this.handlers={};this.attrs={};
  this.classList={values:new Set(),add:v=>this.classList.values.add(v)};}
 addEventListener(k,fn){this.handlers[k]=fn;}
 setAttribute(k,v){this.attrs[k]=v;}
 click(){this.clicked=(this.clicked||0)+1;this.handlers.click?.();}
}
class Div{
 constructor(){this.children=[];this.className='';}
 append(b){this.children.push(b);}
}
class Dialog{
 constructor(id,buttons){this.id=id;this.buttons=buttons;this.open=true;this.inert=false;this.children=[];
 this.classes=new Set();this.classList={add:x=>this.classes.add(x)};}
 querySelectorAll(q){assert.equal(q,'button');return this.buttons;}
 insertBefore(child,first){this.children.unshift(child);}
}
const existing=new Button('閉じる'),cancel=new Button('キャンセル');
const headerClose=new Button('✕ 閉じる'),errorClose=new Button('閉じる');
const dialogs=[
 new Dialog('cashDialog',[existing]),new Dialog('participantEditDialog',[cancel]),
 new Dialog('participantDialog',[headerClose]),new Dialog('stageErrorDialog',[errorClose]),
 new Dialog('stageBusyDialog',[])
];
const document={
 querySelectorAll(sel){assert.equal(sel,'dialog');return dialogs;},
 createElement(tag){if(tag==='div')return new Div();if(tag==='button')return new Button('');throw Error('unexpected '+tag);}
};
vm.runInNewContext(script,{document});
ok(dialogs[0].children.length===1&&dialogs[0].children[0].children[0]===existing,
 'existing close button is moved to the upper-right without replacing handlers');
ok(dialogs[1].children.length===1&&dialogs[1].children[0].children[0].textContent==='✕ 閉じる',
 'edit dialog gets a top-right close control');
dialogs[1].children[0].children[0].click();
ok(cancel.clicked===1,'new Close delegates to existing cancel handler');
ok(dialogs[2].children.length===0&&headerClose.classList.values.has('stage-header-close'),
 'participant heading preserves existing top-right Close without duplication');
ok(dialogs[3].children[0].children[0]===errorClose,
 'error acknowledgement moves to upper right');
ok(dialogs[4].children.length===0,'busy modal cannot be closed while modifying data');
ok(style.includes('position:sticky;top:0')&&
 style.includes('.stage-dialog-top-close')&&
 style.includes('.stage-close-row'),
 'close remains in the top-right even while scrolling');
ok(live.includes('dialog-close.js?v=1644')&&live.includes('stage-ui.css?v=1644'),
 'staging dialogs load shared Close control and refreshed CSS');
ok(match.includes('id="matchConfirmClose"')&&
 matchConfirm.includes("byId('matchConfirmClose').addEventListener('click'"),
 'match confirmation has right-side Close with original cancel/acknowledge semantics');
ok(style.includes('#accessShareClose')&&style.includes('right:10px;top:8px'),
 'match visitor QR screen Close lives in its upper right');
ok(!script.includes("dialog.close()"),
 'shared Close never bypasses existing confirmation state cleanup');
console.log('PASS '+n+'/'+n+' v0.16.44 modal Close position and safety');
