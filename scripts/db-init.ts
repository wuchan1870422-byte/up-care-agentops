import {db} from '../src/lib/db';
import {createSession} from '../src/lib/session';
const migrations=db().prepare('SELECT version FROM migrations ORDER BY version').all();
const seeded=createSession();
console.log(JSON.stringify({migrations,seedWorkspace:seeded.workspace,note:'演示种子已写入；浏览器首次访问会创建自己的独立空间。'}));
