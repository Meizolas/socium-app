import {Pool,PoolClient,QueryResultRow} from 'pg';
let pool:Pool|undefined;
export function localMode(){return process.env.SOCIUM_LOCAL_E2E==='true'&&process.env.NODE_ENV!=='production'}
export function localDb(){if(!localMode())throw new Error('Modo local integrado desativado.');if(!pool)pool=new Pool({connectionString:process.env.LOCAL_DATABASE_URL});return pool}
export async function localQuery<T extends QueryResultRow=QueryResultRow>(text:string,values:unknown[]=[]){return localDb().query<T>(text,values)}
export async function localTransaction<T>(run:(client:PoolClient)=>Promise<T>){const client=await localDb().connect();try{await client.query('begin');const result=await run(client);await client.query('commit');return result}catch(error){await client.query('rollback');throw error}finally{client.release()}}
