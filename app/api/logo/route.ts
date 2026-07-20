import {readFile} from 'fs/promises';import {join} from 'path';
export async function GET(){const data=await readFile(join(process.cwd(),'assets','logo-socium.jpg'));return new Response(data,{headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=86400'}})}
