import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createUiAppFixture } from './helpers/ui-app-fixture.mjs';

await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/screen-help-'));
const fixture = process.env.OPENHIATUS_TEST_APP ? undefined : await createUiAppFixture('screen-help-build');
const supporter = process.argv.includes('--supporter');
const color = process.argv.find(arg=>arg.startsWith('--color='))?.slice(8) || 'red'; assert.ok(['red','black','white'].includes(color));
if(supporter){await mkdir(path.join(profile,'pi/skills/bildschirmhilfe'),{recursive:true});await writeFile(path.join(profile,'pi/skills/bildschirmhilfe/SKILL.md'),await readFile('tests/fixtures/bildschirmhilfe-0.0.16.md','utf8'));}
const nativeSource=path.join(profile,'own-fixture-input.cs'),nativeExe=path.join(profile,'own-fixture-input.exe');
await writeFile(nativeSource,`using System;using System.Runtime.InteropServices;class OwnFixtureInput {
[StructLayout(LayoutKind.Sequential)]struct P{public int X,Y;}[StructLayout(LayoutKind.Sequential)]struct R{public int L,T,Rt,B;}
[DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);[DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
[DllImport("user32.dll")]static extern bool AttachThreadInput(uint a,uint b,bool attach);[DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr h,out R r);
[DllImport("user32.dll")]static extern bool IsWindow(IntPtr h);[DllImport("user32.dll")]static extern IntPtr GetAncestor(IntPtr h,uint flag);
[DllImport("user32.dll")]static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);[DllImport("user32.dll")]static extern IntPtr WindowFromPoint(P p);
[DllImport("user32.dll")]static extern bool GetCursorPos(out P p);[DllImport("user32.dll")]static extern bool SetCursorPos(int x,int y);
[DllImport("user32.dll")]static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
static int Main(string[]a){var h=new IntPtr(long.Parse(a[1]));if(a[0]=="focus"){uint p;uint thread=GetWindowThreadProcessId(GetForegroundWindow(),out p);uint current=GetCurrentThreadId();bool attached=AttachThreadInput(current,thread,true);SetWindowPos(h,new IntPtr(-1),0,0,0,0,0x13);bool set=SetForegroundWindow(h);AttachThreadInput(current,thread,false);System.Threading.Thread.Sleep(100);if(GetForegroundWindow()!=h){R own;if(!GetWindowRect(h,out own))return 5;P spot=new P{X=own.L+30,Y=own.T+12};if(GetAncestor(WindowFromPoint(spot),2)!=h)return 6;P previous;GetCursorPos(out previous);SetCursorPos(spot.X,spot.Y);mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);SetCursorPos(previous.X,previous.Y);System.Threading.Thread.Sleep(100);}if(GetForegroundWindow()!=h){System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"foreground-fixture-probe.txt"),"isWindow="+IsWindow(h)+" rootMatches="+(GetAncestor(h,2)==h)+" attached="+attached+" set="+set+" foregroundZero="+(GetForegroundWindow()==IntPtr.Zero));return 4;}return 0;}
int x=int.Parse(a[2]),y=int.Parse(a[3]);R r;if(GetForegroundWindow()!=h||!GetWindowRect(h,out r)||x<r.L||x>=r.Rt||y<r.T||y>=r.B)return 3;P cursor;GetCursorPos(out cursor);SetCursorPos(x,y);mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);SetCursorPos(cursor.X,cursor.Y);return 0;}}`);
execFileSync(path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:winexe',`/out:${nativeExe}`,nativeSource],{windowsHide:true});
let instance, target, targetRect, displayBounds, metadata, requests = 0;
const errors = [];
function findMetadata(value) {
  if (typeof value === 'string') {
    for (const line of value.split('\n')) if (line.startsWith('OPENHIATUS_COMPUTER_METADATA_V2 ')) return JSON.parse(line.slice(32));
    if (value.length < 50000 && /^[\[{]/.test(value)) { try { return findMetadata(JSON.parse(value)); } catch {} }
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) { const found = findMetadata(v); if (found) return found; }
  }
}
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, '/v1/chat/completions'); let body=''; for await(const chunk of request) body+=chunk;
    const input=JSON.parse(body), names=input.tools.map(t=>t.function.name); assert.ok(names.includes('screen_help')); assert.ok(!names.includes('computer'));
    const instructions=input.messages.filter(m=>['system','developer'].includes(m.role)).map(m=>JSON.stringify(m.content)).join('\n');
    assert.equal(instructions.includes('Aktiver Betriebsmodus: IT-Supporter.'),supporter);
    requests++; let args;
    if(requests===1) args={action:'observe'};
    else if(requests===2) {
      metadata=findMetadata(input.messages); assert.ok(metadata,'actual screen metadata'); assert.ok(JSON.stringify(input.messages).includes('Hilfe-Skill aus dem lokalen Profil'));
      const view=metadata.views[0], sx=view.imageWidth/displayBounds.width, sy=view.imageHeight/displayBounds.height;
      args={action:'mark',color,frameId:metadata.frameId,viewId:view.viewId,x:Math.floor((targetRect.x-displayBounds.x)*sx),y:Math.floor((targetRect.y-displayBounds.y)*sy),width:Math.ceil(targetRect.width*sx),height:Math.ceil(targetRect.height*sy),label:supporter?'Notizen':'Fett'};
    } else { assert.equal(requests,3); assert.ok(JSON.stringify(input.messages).includes('marked')); }
    response.writeHead(200,{'Content-Type':'text/event-stream'});
    const chunk=(delta,finish_reason=null)=>response.write(`data: ${JSON.stringify({id:'help-ui',object:'chat.completion.chunk',model:'help-ui',choices:[{index:0,delta,finish_reason}]})}\n\n`);
    chunk({role:'assistant'});
    if(args){chunk({tool_calls:[{index:0,id:`help-${requests}`,type:'function',function:{name:'screen_help',arguments:JSON.stringify(args)}}]});chunk({},'tool_calls');}
    else {chunk({content:'```openhiatus-reply\n'+JSON.stringify({spoken:'Hier ist das Symbol für Fettdruck. Klicke selbst darauf.',text:'Hier ist das Symbol für Fettdruck. Klicke selbst darauf.'})+'\n```'});chunk({},'stop');}
    response.end('data: [DONE]\n\n');
  } catch(error){errors.push(String(error));response.writeHead(500);response.end('{}');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const launchOptions={executablePath:process.env.OPENHIATUS_TEST_APP||path.resolve('node_modules/electron/dist/electron.exe'),args:[...(fixture?[fixture.appDirectory]:[]),`--data-dir=${profile}`],env};
try {
  instance=await electron.launch(launchOptions);
  const page=await instance.firstWindow(), main=await instance.browserWindow(page); page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:'Verstanden, Vollzugriff bestätigen',exact:true}).click();
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Gespräch', exact: true }).click();
  await page.evaluate(async base=>{await window.openhiatus.saveProvider({id:'local',baseUrl:base,models:['help-ui']});await window.openhiatus.savePreferences({model:'local/help-ui',dialogModel:'local/help-ui',memoryModel:'local/help-ui',memoryAutoSummarize:false,speakReplies:false,earcons:false});},`http://127.0.0.1:${server.address().port}/v1`);
  const toggleSupport=async enabled=>{await page.getByRole('button',{name:'Einstellungen',exact:true}).click();await page.getByRole('tab',{name:'Bedienung',exact:true}).click();const checkbox=page.getByRole('checkbox',{name:/^IT-Supporter/});if(await checkbox.isChecked()!==enabled)await checkbox.click();await expect.poll(()=>page.evaluate(async()=>(await window.openhiatus.snapshot()).preferences.itSupporter)).toBe(enabled);await page.getByRole('button',{name:enabled?'Protokoll':'Gespräch',exact:true}).click();};
  if(supporter){await page.getByRole('textbox',{name:'Dein Auftrag',exact:true}).fill('Diesen Entwurf behalten.');await toggleSupport(true);await expect(page.getByRole('log',{name:'Support-Protokoll'})).toBeVisible();await expect(page.getByRole('textbox',{name:'Dein Auftrag',exact:true})).toHaveCount(0);await page.keyboard.press('Control+Enter');await new Promise(resolve=>setTimeout(resolve,150));assert.equal(requests,0);assert.equal((await page.evaluate(()=>window.openhiatus.snapshot())).messages.length,0);}
  const skillFile=path.join(profile,'pi/skills/bildschirmhilfe/SKILL.md'); assert.match(await readFile(skillFile,'utf8'),/name: bildschirmhilfe/);
  if(supporter){assert.match(await readFile(skillFile,'utf8'),/`color`/);assert.ok((await readFile(path.join(profile,'pi/skills/bildschirmhilfe/SKILL.factory-0.0.16.md'),'utf8')).includes('name: bildschirmhilfe'));}
  const targetId=await instance.evaluate(async({BrowserWindow,screen})=>{
    const area=screen.getPrimaryDisplay().workArea;const w=new BrowserWindow({...area,frame:false,alwaysOnTop:true,title:'Synthetic screen help editor',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    await w.loadURL('data:text/html;charset=UTF-8,'+encodeURIComponent('<html lang="de"><head><meta charset="UTF-8"><style>body{margin:0;background:#f5f7f1;font:20px Segoe UI;color:#182015}header{padding:20px;background:#204934;color:white}nav{padding:26px;background:#e4e9de}button{width:46px;height:40px;margin-left:120px;font:bold 24px Georgia}p{padding:30px}</style></head><body><header>openHiatus · Synthetischer Hilfe-Test</header><nav>Start <button id="bold" aria-label="Fett" onclick="document.getElementById(\'state\').textContent=\'Selbst geklickt\'">B</button></nav><p id="state">Der Mensch klickt selbst.</p></body></html>'));
    w.show();w.focus();return w.id;
  });
  await expect.poll(()=>instance.evaluate(({BrowserWindow},id)=>BrowserWindow.fromId(id)?.isFocused(),targetId)).toBe(true);
  target=instance.windows().find(p=>p!==page); assert.ok(target);
  if(supporter)await target.evaluate(()=>{const button=document.getElementById('bold');button.textContent='Notizen.txt';button.style.width='180px';button.style.font='20px Segoe UI';button.setAttribute('aria-label','Datei Notizen.txt');});
  if(color==='white')await target.evaluate(()=>{document.querySelector('nav').style.background='#202828';const button=document.getElementById('bold');button.style.background='#303838';button.style.color='white';});
  const targetWindow=await instance.browserWindow(target), bounds=await targetWindow.evaluate(w=>w.getBounds()), button=await target.locator('#bold').boundingBox();assert.ok(button);
  targetRect={x:bounds.x+button.x,y:bounds.y+button.y,width:button.width,height:button.height};displayBounds=await instance.evaluate(({screen})=>screen.getPrimaryDisplay().bounds);
  await main.evaluate(w=>w.hide());
  const handle=await targetWindow.evaluate(w=>w.getNativeWindowHandle().readBigUInt64LE().toString());
  execFileSync(nativeExe,['focus',handle],{windowsHide:true});
  // The same send boundary used after F8 transcription, with the editor remaining foreground.
  const question=supporter?(color==='white'?'Ich kenne mich hier nicht aus. Wie komme ich jetzt weiter?':'Ich hatte eine Datei namens Notizen auf dem Desktop. Kannst du die für mich finden?'):'Ich will den Text fett machen. Wo ist das Symbol?';
  await page.evaluate(text=>window.openhiatus.send(text,'synthetic-help'),question);
  await expect.poll(()=>page.evaluate(async()=>(await window.openhiatus.snapshot()).task.status),{timeout:45000}).toBe('completed');
  assert.equal(requests,3);assert.deepEqual(errors,[]);
  const state=await page.evaluate(()=>window.openhiatus.snapshot());assert.equal(state.jobs?.length??0,0);assert.ok(!JSON.stringify(state.messages).includes('data:image/'));
  const overlay=instance.windows().find(p=>p!==page&&p!==target);assert.ok(overlay);const overlayWindow=await instance.browserWindow(overlay);
  assert.equal(await overlayWindow.evaluate(w=>w.isVisible()),true);assert.equal(await targetWindow.evaluate(w=>w.isFocused()),true);
  assert.equal(await overlayWindow.evaluate(w=>w.isFocusable()),false);assert.equal(await overlayWindow.evaluate(w=>w.isAlwaysOnTop()),true);
  assert.deepEqual(await overlay.evaluate(()=>[typeof window.openhiatus,typeof require]),['undefined','undefined']);
  assert.equal(await overlay.locator('#label').textContent(),supporter?'Notizen':'Fett');
  assert.equal(await overlay.locator('#target').evaluate(e=>getComputedStyle(e).stroke),{red:'rgb(239, 37, 37)',black:'rgb(17, 17, 17)',white:'rgb(255, 255, 255)'}[color]);
  assert.equal(await overlay.locator('#target').evaluate(e=>getComputedStyle(e).strokeWidth),'7px');assert.equal(await overlay.locator('#target-outline').evaluate(e=>getComputedStyle(e).strokeWidth),'12px');
  const circle=await overlay.locator('#target').evaluate(e=>({cx:+e.getAttribute('cx'),cy:+e.getAttribute('cy'),r:+e.getAttribute('r')}));
  assert.ok(Math.abs(circle.cx-(targetRect.x-displayBounds.x+targetRect.width/2))<3);assert.ok(Math.abs(circle.cy-(targetRect.y-displayBounds.y+targetRect.height/2))<3);assert.ok(circle.r>targetRect.width/2);
  // Export only the synthetic editor's upper-left area, never the surrounding private desktop.
  const crop=await instance.evaluate(async({desktopCapturer,screen},b)=>{const d=screen.getPrimaryDisplay();const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(d.size.width*d.scaleFactor),height:Math.round(d.size.height*d.scaleFactor)}});const image=sources.find(s=>s.display_id===String(d.id)).thumbnail;const size=image.getSize(1),sx=size.width/d.bounds.width,sy=size.height/d.bounds.height;const pixels=image.toBitmap({scaleFactor:1}),i=(Math.round((b.y-d.bounds.y+8)*sy)*size.width+Math.round((b.x-d.bounds.x+8)*sx))*4;if(Math.abs(pixels[i]-52)>10||Math.abs(pixels[i+1]-73)>10||Math.abs(pixels[i+2]-32)>10)throw Error('Synthetic editor must cover the exported region');return image.crop({x:Math.round((b.x-d.bounds.x)*sx),y:Math.round((b.y-d.bounds.y)*sy),width:Math.round(650*sx),height:Math.round(320*sy)}).toPNG().toString('base64');},bounds);
  await writeFile('artifacts/openhiatus-bildschirmhilfe.png',Buffer.from(crop,'base64'));
  await writeFile(`artifacts/openhiatus-bildschirmhilfe-${color}.png`,Buffer.from(crop,'base64'));
  const scale=(await instance.evaluate(({screen})=>screen.getPrimaryDisplay().scaleFactor));
  execFileSync(nativeExe,['click',handle,String(Math.round((targetRect.x+targetRect.width/2)*scale)),String(Math.round((targetRect.y+targetRect.height/2)*scale))],{windowsHide:true});
  await expect(target.locator('#state')).toHaveText('Selbst geklickt');
  await expect.poll(()=>overlayWindow.evaluate(w=>w.isVisible())).toBe(false);
  assert.equal(await targetWindow.evaluate(w=>w.isFocused()),true);assert.equal(requests,3);
  if(supporter){await targetWindow.evaluate(w=>w.close());await main.evaluate(w=>{w.show();w.focus();});await page.getByRole('log',{name:'Support-Protokoll'}).scrollIntoViewIfNeeded();await expect(page.getByRole('log')).toContainText(question);await expect(page.getByRole('textbox',{name:'Dein Auftrag',exact:true})).toHaveCount(0);
    await toggleSupport(false);await expect(page.getByRole('textbox',{name:'Dein Auftrag',exact:true})).toHaveValue('Diesen Entwurf behalten.');await toggleSupport(true);
    const normal=await main.evaluate(w=>w.getSize());await main.evaluate(w=>w.setSize(560,440));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.getByRole('log',{name:'Support-Protokoll'}).scrollIntoViewIfNeeded();await expect(page.getByRole('log',{name:'Support-Protokoll'})).toBeInViewport();await page.screenshot({path:'artifacts/openhiatus-it-supporter-protokoll.png'});await main.evaluate((w,size)=>w.setSize(...size),normal);
    await instance.close();instance=undefined;instance=await electron.launch(launchOptions);const restarted=await instance.firstWindow();await expect(restarted.getByRole('button',{name:'Protokoll',exact:true})).toBeVisible();await expect(restarted.getByRole('log')).toContainText(question);await expect(restarted.getByRole('textbox',{name:'Dein Auftrag',exact:true})).toHaveCount(0);assert.equal(requests,3);}
  const proof={status:'passed',color,supporter,checks:['real foreground screenshot in dialog','editable local help skill','thick circle and arrow with selected color and contrast halo','no focus switch or input by agent','real native user click passes through overlay','input invalidates marker','no worker task or chat images',...(supporter?['supporter setting and actual model instructions','general help questions without keyword dispatch','read-only log, retained draft and restart','known factory skill upgrade with backup','compact supporter layout']:[]),'isolated synthetic model and editor; no cloud calls'],requests};
  await writeFile('artifacts/openhiatus-bildschirmhilfe-pruefung.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
} finally {if(instance)await instance.close();await new Promise(resolve=>server.close(resolve));}
