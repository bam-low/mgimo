import {auth} from '@/server/auth';
import {readJSON,sameOrigin,limited,failure,Denied} from '@/server/security';
export async function GET(request:Request){const r=await auth.handler(request);r.headers.set('Cache-Control','no-store');return r;}
export async function POST(request:Request){try{
 sameOrigin(request);
 const path=new URL(request.url).pathname;
 if(!['/api/auth/sign-in/email','/api/auth/sign-out','/api/auth/get-session'].includes(path))throw new Denied();
 await limited('auth-global',120,60000);
 if(path.endsWith('/sign-in/email')){const data=await readJSON(request.clone());await limited('login:'+String(data.email).toLowerCase(),10,15*60000);}
 const r=await auth.handler(request);r.headers.set('Cache-Control','no-store');return r;
}catch(e){return failure(e);}}
