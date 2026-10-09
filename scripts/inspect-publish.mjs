import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
// Only metadata leaves this process. Never print credential responses.
const result=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'},timeout:10000,windowsHide:true});
const token=result.status===0?result.stdout.match(/^password=(.+)$/m)?.[1]:undefined;
console.log(JSON.stringify({githubCredentialAvailable:Boolean(token)}));
for(const base of [process.env.APPDATA,process.env.LOCALAPPDATA]){
 const path=join(base||'','com.vercel.cli','Data','auth.json');
 if(existsSync(path)){try{const auth=JSON.parse(readFileSync(path,'utf8'));console.log(JSON.stringify({vercelAuthPath:path,tokenPresent:Boolean(auth.token)}));}catch{console.log('Vercel auth file unreadable');}}
}
