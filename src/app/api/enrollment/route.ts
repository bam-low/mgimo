import {z} from 'zod';
import {db} from '@/server/db';
import {validGroup} from '@/server/enrollment';
import {actor,readJSON,sameOrigin,failure,Denied,limited} from '@/server/security';
export async function POST(request:Request){try{
 sameOrigin(request);const a=await actor(request.headers);if(a.membership.role!=='STUDENT')throw new Denied();await limited('retry:'+a.user.id,5,60000);
 const data=z.object({groupId:z.string().max(100)}).strict().parse(await readJSON(request));
 await db.$transaction(async tx=>{
  const m=await tx.universityMembership.findUniqueOrThrow({where:{id:a.membership.id},include:{enrollments:{where:{endedAt:null,revokedAt:null}}}});
  if(m.enrollments.length||!(m.status==='REJECTED'||m.resubmissionAllowed))throw new Denied();
  await validGroup(tx,data.groupId,m.universityId);
  const changed=await tx.universityMembership.updateMany({where:{id:m.id,status:m.status,resubmissionAllowed:m.resubmissionAllowed},data:{status:'PENDING',resubmissionAllowed:false}});if(changed.count!==1)throw new Denied(409);
  const r=await tx.enrollmentRequest.create({data:{membershipId:m.id,targetGroupId:data.groupId}});
  await tx.auditLog.create({data:{actorId:a.user.id,universityId:m.universityId,targetId:r.id,action:'RESUBMITTED',newGroupId:data.groupId}});
 });return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}catch(e){return failure(e);}}
