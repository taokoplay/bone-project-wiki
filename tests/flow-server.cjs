'use strict';
// Test-only HTTP boundary for exercising the real panel and service together.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {WikiService} = require('../service.cjs');
async function main() {
  const root = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(),'bone-wiki-flow-'));
  let settings = {};
  let failMemory = false;
  const hostActions = [];
  const service = new WikiService({
    workspace:{get:async()=>({path:root,name:'BoneProjectWiki acceptance'})},
    plugin:{getSettings:async()=>settings,setSettings:async patch=>{settings={...settings,...patch};}},
    fs:{
      openDefault: async p => { hostActions.push({ action: 'openDefault', path: p }); return { opened: true }; },
      readText:p=>fs.readFile(path.join(root,p),'utf8'),
      writeText:async(p,data)=>{if(failMemory && p.startsWith('.bone-project-wiki/memory/') && p.endsWith('.md'))throw new Error('Test memory write failure');const target=path.join(root,p);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,data);},
      remove:p=>fs.unlink(path.join(root,p)),
      stat:async p=>{const info=await fs.stat(path.join(root,p));return {size:info.size,mtimeMs:info.mtimeMs};},
      readPreview: async p => ({dataUrl:`data:image/png;base64,${(await fs.readFile(path.join(root,p))).toString('base64')}`}),
      list:async dir=>{
        let entries;
        try{entries=await fs.readdir(path.join(root,dir),{withFileTypes:true});}
        catch(error){if(error.code==='ENOENT'){const missing=new Error(`cannot list ${dir}`);missing.code='NOT_FOUND';throw missing;}throw error;}
        const result=[];
        for(const entry of entries){
          const relative=`${dir}/${entry.name}`;
          if(entry.isDirectory()){result.push({name:entry.name,path:relative,isDirectory:true});continue;}
          const info=await fs.stat(path.join(root,dir,entry.name));
          result.push({name:entry.name,path:relative,isDirectory:false,size:info.size,mtimeMs:info.mtimeMs});
        }
        return result;
      }
    }
  });
  const server=http.createServer(async(req,res)=>{
    try {
      const route=new URL(req.url,'http://localhost').pathname;
      if(route==='/test/fail-memory' && req.method==='POST'){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        failMemory=JSON.parse(Buffer.concat(chunks).toString()).enabled===true;
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({enabled:failMemory}));return;
      }
      if(route==='/test/markdown-fixture' && req.method==='POST'){
        const directory=path.join(root,'.bone-project-wiki/knowledge/产品说明');
        const content='# Raw handbook\n\nA **formatted** ordinary Markdown file.\n\n| Item | Result |\n| --- | --- |\n| Read | Ready |\n';
        await fs.mkdir(directory,{recursive:true});
        await fs.writeFile(path.join(directory,'raw-handbook.md'),content);
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({content}));return;
      }
      if(route==='/test/html-fixture' && req.method==='POST'){
        const directory=path.join(root,'.bone-project-wiki/knowledge/产品设计');
        await fs.mkdir(path.join(directory,'assets'),{recursive:true});
        const source='<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="assets/style.css"></head><body><main><h1>完整产品与交互文档</h1><p>Full document surface with local styles and interactions.</p><button id="switch" onclick="this.textContent=\'已切换\'">切换页面</button><img alt="本地图片" src="assets/pixel.png"><div style="height:1600px"></div><button onclick="this.textContent=\'End reached\'">Page end</button></main><script src="assets/app.js"></script><script>try{parent.document.body.dataset.previewEscaped="yes"}catch{};fetch("https://example.invalid/preview-network").catch(()=>{document.body.dataset.networkBlocked="yes"})</script></body></html>';
        await fs.writeFile(path.join(directory,'完整产品与交互文档.html'),source);
        await fs.writeFile(path.join(directory,'assets/style.css'),'body{margin:0;background:#172128;color:#e5edf1;font:16px/1.7 system-ui}main{padding:40px}h1{color:rgb(12, 80, 120);margin:0 0 16px}p{color:#b3c2cb}button{padding:10px 18px;border:1px solid #617986;background:#26353f;color:inherit;border-radius:6px}');
        await fs.writeFile(path.join(directory,'assets/app.js'),'document.body.dataset.localScript="loaded"');
        await fs.writeFile(path.join(directory,'assets/pixel.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=','base64'));
        await fs.writeFile(path.join(directory,'missing-assets.html'),'<h1>Readable partial page</h1><script src="missing.js"></script>');
        await service.request({action:'import',workspacePath:root,kind:'attachment',category:'产品设计',title:'Imported HTML attachment',files:[{path:'index.html',content:'<h1>Imported attachment preview</h1><button onclick="this.textContent=\'Worked\'">Try attachment</button>'}]});
        await service.request({action:'import',workspacePath:root,kind:'prototype',category:'产品设计',title:'Full pane prototype',entryPath:'index.html',files:[{path:'index.html',content:'<h1>Full pane prototype page</h1>'}]});
        await service.request({action:'save',workspacePath:root,kind:'document',category:'产品设计',title:'Layout check note',content:'# Markdown still has document spacing\n\nFormatted reading remains available.'});
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({created:true}));return;
      }
      if(route==='/call' && req.method==='POST'){
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>20*1024*1024)throw new Error('REQUEST_LIMIT');chunks.push(chunk);}
        const {channel,input}=JSON.parse(Buffer.concat(chunks).toString());
        let result;
        if(channel==='app.getLocale')result='en';
        else if(channel==='app.getAppearance')result={base:'light',locale:'en'};
        else if(channel==='wiki')result=await service.request(input);
        else if(channel==='fs.reveal'){hostActions.push({action:'reveal',path:input.path});result={revealed:true};}
        else throw new Error('UNSUPPORTED_CHANNEL');
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result}));return;
      }
      if(route==='/test-bridge.js'){
        res.setHeader('Content-Type','text/javascript');
        res.end(`window.pluginBridge={on(){return ()=>{};},async invoke(channel,input){const response=await fetch('/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,input})});const body=await response.json();if(body.error)throw new Error(body.error);return body.result;}};`);return;
      }
      if(route==='/state'){
        const snapshot=await service.request({action:'snapshot'});
        const entries=[];
        const scanned=await service.scanAll(root);
        for(const section of ['knowledge','memory','development']) for(const meta of scanned[section].entries) entries.push(await service.loadRecord(meta,root));
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({snapshot,entries,hostActions}));return;
      }
      const name=path.basename(route)===''?'index.html':path.basename(route);
      if(!/\.(html|css|mjs)$/.test(name)) {res.writeHead(404);res.end();return;}
      let body=await fs.readFile(path.join(__dirname,'../renderer',name),'utf8');
      if(name==='index.html')body=body.replace('<head>','<head><script src="/test-bridge.js"></script>');
      res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript');res.end(body);
    }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
  });
  server.listen(Number(process.env.BONE_WIKI_TEST_PORT || 18766),'127.0.0.1');
  async function stop(){service.dispose();server.close();await fs.rm(root,{recursive:true,force:true});process.exit(0);}
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
