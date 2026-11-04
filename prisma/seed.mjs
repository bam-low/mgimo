import process from 'node:process';
import console from 'node:console';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '../src/generated/prisma/client.ts';
import {PrismaPg} from '@prisma/adapter-pg';
import {hashPassword} from 'better-auth/crypto';
if(process.env.ALLOW_DEMO_SEED!=='yes')throw Error('Set ALLOW_DEMO_SEED=yes explicitly on a dedicated demo/test DB');
for(const key of ['DEMO_STAFF_PASSWORD','DEMO_STUDENT_PASSWORD'])if(!process.env[key]||process.env[key].length<12)throw Error('Provide strong demo passwords through environment');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
try {
 await db.university.upsert({where:{id:'demo-university'},create:{id:'demo-university',name:'Вымышленный демонстрационный университет',timezone:'Europe/Moscow'},update:{}});
 for(let n=1;n<=2;n++){
  await db.faculty.upsert({where:{id:'faculty-'+n},create:{id:'faculty-'+n,name:'Демо-факультет '+n,universityId:'demo-university'},update:{}});
  await db.program.upsert({where:{id:'program-'+n},create:{id:'program-'+n,name:'Демо-направление '+n,facultyId:'faculty-'+n},update:{}});
  await db.studentGroup.upsert({where:{id:'group-'+n},create:{id:'group-'+n,name:'Демо-группа '+n,programId:'program-'+n},update:{}});
 }
 for(const [email,name,role,n] of [['staff@example.test','Демо Сотрудник','STAFF',0],['student1@example.test','Демо Студент Один','STUDENT',1],['student2@example.test','Демо Студент Два','STUDENT',2]]){
  // Never reset passwords or reopen revoked memberships on a repeated seed.
  if(await db.user.findUnique({where:{email}}))continue;
  const hash=await hashPassword(role==='STAFF'?process.env.DEMO_STAFF_PASSWORD:process.env.DEMO_STUDENT_PASSWORD);
  await db.$transaction(async tx=>{
   const u=await tx.user.create({data:{id:randomUUID(),name,email,emailVerified:true}});
   await tx.account.create({data:{id:randomUUID(),userId:u.id,accountId:u.id,providerId:'credential',password:hash}});
   const m=await tx.universityMembership.create({data:{userId:u.id,universityId:'demo-university',role,status:'APPROVED',...(role==='STUDENT'?{profile:{create:{firstName:'Демо',lastName:'Студент '+n}}}:{})}});
   if(n){const r=await tx.enrollmentRequest.create({data:{membershipId:m.id,targetGroupId:'group-'+n,status:'APPROVED',decidedBy:'demo-seed',decidedAt:new Date()}});await tx.groupMembership.create({data:{membershipId:m.id,groupId:'group-'+n,sourceId:r.id}});}
   await tx.auditLog.create({data:{actorId:'demo-seed',universityId:'demo-university',targetId:m.id,action:'DEMO_PREPARED'}});
  });
 }
 console.log('Fictional demo structure prepared; credentials were not printed.');
} finally {await db.$disconnect();}
