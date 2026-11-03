import assert from 'node:assert/strict';

// Verifies native Low Power lifecycle against the isolated production playback fixture.
const c=async(cmd,...args)=>{const r=await fetch('http://127.0.0.1:9230',{method:'POST',body:JSON.stringify({cmd,args}),signal:AbortSignal.timeout(60000)}).then(r=>r.json());assert.ok(r.ok,r.error);return r.output};
const e=async(fn,...args)=>JSON.parse(await c('eval',`(${fn})(...${JSON.stringify(args)})`));
const main=async expr=>JSON.parse(await c('main-eval',expr));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const windowAction=action=>main(`electron.BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().startsWith('file:')).map(w=>{${action}; return {visible:w.isVisible(),focused:w.isFocused(),minimized:w.isMinimized()};})`);
const status=JSON.parse(await c('status'));
assert.ok(status.profile.endsWith('/test-results/run-desktop/userdata'));
assert.ok(status.page.startsWith('file:'), 'Use serve --production after localPlaybackSmoke.mjs');
await windowAction('w.restore();w.show()');
await c('palette','Visualizer: MineRadio');await c('palette','Background: MineRadio');
await c('click','.mineradio-dock #control-title');
if(!(await e(async()=> (await window.electron.getSettings()).LOW_POWER_MODE)))await c('palette','Low Power mode');
const invalid=await e(async()=>{await window.electron.saveSettings('LOW_POWER_MODE','false');return (await window.electron.getSettings()).LOW_POWER_MODE});assert.equal(invalid,true);
const focus=await windowAction('w.blur()');await wait(300);
const policy=await e(()=>window.electron.getBackgroundThrottlingState());assert.deepEqual(policy,{active:true,hidden:false});
const frame=()=>e(()=>document.querySelector('iframe[title="MineRadio visual stage"]').contentWindow.renderer.info.render.frame);
const first=await frame();await wait(250);assert.ok(await frame()>first,'Unfocused visible scene keeps drawing');
const beforeExport=await e(()=>window.electron.prepareVideoExportWindow({width:1440,height:900,dpr:devicePixelRatio}));assert.equal(beforeExport.success,true);
assert.equal((await e(()=>window.electron.getBackgroundThrottlingState())).active,false);
await e(async()=>{await window.electron.restoreVideoExportWindow();return true});assert.equal((await e(()=>window.electron.getBackgroundThrottlingState())).active,true);
try {
 const obs=await e(async()=>{
  await window.electron.setObsBrowserSourceEnabled(true);
  const status=await window.electron.getObsBrowserSourceStatus();
  window.lowPowerObsAbort=new AbortController();
  window.lowPowerObsResponse=await fetch(`http://127.0.0.1:${status.port}/obs/events?token=${encodeURIComponent(status.token)}`,{signal:window.lowPowerObsAbort.signal});
  return window.lowPowerObsResponse.ok;
 });assert.equal(obs,true);await wait(250);
 assert.equal((await e(()=>window.electron.getBackgroundThrottlingState())).active,false);
} finally {
 await e(async()=>{window.lowPowerObsAbort?.abort();await window.electron.setObsBrowserSourceEnabled(false);delete window.lowPowerObsResponse;return true});
}
await wait(250);assert.equal((await e(()=>window.electron.getBackgroundThrottlingState())).active,true);
await windowAction('w.setSize(1440,900);w.show()');
await c('palette','Graphics settings');await c('ss','low-power-settings');await c('press','Escape');
const lyricsVisible=()=>e(()=>document.querySelector('iframe[title="MineRadio visual stage"]').contentWindow.stageSnapshot.showLyrics);
for(let attempt=0;attempt<50 && !(await lyricsVisible());attempt++)await wait(100);
assert.equal(await lyricsVisible(),true,'The player view must expose lyrics before testing restoration');
await e(()=>{const audio=[...document.querySelectorAll('audio')].find(a=>a.duration===45);audio.currentTime=18;return true;});
if(await e(()=>[...document.querySelectorAll('audio')].find(a=>a.duration===45).paused))await c('press','Space');
await windowAction('w.minimize()');await wait(4200);await windowAction('w.restore();w.show()');await wait(350);
const resumed=await e(()=>{const w=document.querySelector('iframe[title="MineRadio visual stage"]').contentWindow;const a=[...document.querySelectorAll('audio')].find(a=>a.duration===45);return {audio:a.currentTime,scene:w.audio.currentTime,lyric:w.stageSnapshot.lyricTime,index:w.stageLyrics.currentIdx,paused:a.paused,low:w.stageSnapshot.lowPowerMode};});
assert.equal(resumed.paused,false);assert.ok(resumed.audio>21);assert.ok(Math.abs(resumed.audio-resumed.scene)<.7);assert.ok(Math.abs(resumed.audio-resumed.lyric)<.7);assert.equal(resumed.index,2);assert.equal(resumed.low,true);
await c('press','Space');await c('ss','low-power-restored-lyrics');
console.log(JSON.stringify({focus,policy,exportStandDown:true,obsStandDown:true,invalidPreferenceIgnored:invalid,resumed},null,2));
