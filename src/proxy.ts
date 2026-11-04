import {NextResponse,type NextRequest} from 'next/server';
export function proxy(request:NextRequest){
 const nonce=Buffer.from(crypto.randomUUID()).toString('base64');
 const csp=`default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV==='development'?" 'unsafe-eval'":''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
 const h=new Headers(request.headers);h.set('x-nonce',nonce);h.set('Content-Security-Policy',csp);
 const response=NextResponse.next({request:{headers:h}});response.headers.set('Content-Security-Policy',csp);
 if(request.nextUrl.pathname.startsWith('/api/')||['/cabinet','/staff'].includes(request.nextUrl.pathname))response.headers.set('Cache-Control','private, no-store');
 return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
