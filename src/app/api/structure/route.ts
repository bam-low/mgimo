import {db} from '@/server/db';
export async function GET(){return Response.json(await db.university.findMany({where:{active:true},select:{id:true,name:true,faculties:{select:{id:true,name:true,programs:{select:{id:true,name:true,groups:{where:{active:true},select:{id:true,name:true}}}}}}}}),{headers:{'Cache-Control':'no-store'}});}
