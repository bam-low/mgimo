import {createHash} from 'node:crypto';
import {db} from './db';
import {auth} from './auth';
export class Denied extends Error { constructor(public status=403){super('Действие недоступно. Обновите страницу и попробуйте ещё раз.');} }
export function sameOrigin(request:Request){
 const origin=request.headers.get('origin');
 if(!process.env.BETTER_AUTH_URL||origin!==new URL(process.env.BETTER_AUTH_URL).origin)throw new Denied();
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Denied(415);
 if(Number(request.headers.get('content-length')??0)>16384)throw new Denied(413);
}
export async function limited(key:string,max:number,windowMs:number){
 const id=createHash('sha256').update(key).digest('hex')+':'+Math.floor(Date.now()/windowMs);
 const row=await db.rateBucket.upsert({where:{key:id},create:{key:id},update:{count:{increment:1}}});
 if(row.count>max)throw new Denied(429);
}
export async function actor(headers:Headers){
 const session=await auth.api.getSession({headers,query:{disableCookieCache:true}});
 if(!session)throw new Denied(401);
 const user=await db.user.findUnique({where:{id:session.user.id},include:{memberships:{include:{university:true,profile:true,enrollments:{where:{endedAt:null,revokedAt:null},include:{group:{include:{program:{include:{faculty:true}}}}}},requests:{orderBy:{createdAt:'desc'}}}}}});
 if(!user?.active||user.memberships.length!==1)throw new Denied();
 const membership=user.memberships[0];if(!membership.university.active)throw new Denied();
 return {user,membership};
}
export function staff(a:Awaited<ReturnType<typeof actor>>){if(a.membership.role!=='STAFF'||a.membership.status!=='APPROVED')throw new Denied();}
export function studentAccess(a:Awaited<ReturnType<typeof actor>>){
 if(a.membership.role!=='STUDENT'||a.membership.status!=='APPROVED'||a.membership.enrollments.length!==1||!a.membership.enrollments[0].group.active||a.membership.enrollments[0].group.program.faculty.universityId!==a.membership.universityId)throw new Denied();
 return a.membership.enrollments[0];
}
export function failure(e:unknown){return Response.json({error:e instanceof Denied?e.message:'Не удалось выполнить действие. Попробуйте позже.'},{status:e instanceof Denied?e.status:400,headers:{'Cache-Control':'no-store'}});}

export async function readJSON(request:Request){
 const reader=request.body?.getReader();if(!reader)throw new Denied(400);
 const parts:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();throw new Denied(413);}parts.push(value);}
 const data=new Uint8Array(size);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}
 return JSON.parse(new TextDecoder().decode(data));
}
