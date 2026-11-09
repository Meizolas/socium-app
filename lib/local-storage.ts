import {mkdir,readFile,writeFile} from 'node:fs/promises';import {resolve,sep} from 'node:path';
function root(){return resolve(process.cwd(),'.local-data')}
function safe(relative:string){const target=resolve(root(),relative);if(!target.startsWith(root()+sep))throw new Error('Caminho de armazenamento inválido.');return target}
export async function localWrite(relative:string,data:Buffer){const target=safe(relative);await mkdir(resolve(target,'..'),{recursive:true});await writeFile(target,data,{flag:'wx'});return target}
export async function localRead(relative:string){return readFile(safe(relative))}
