'use client';
import {useEffect,useState} from 'react';
import {RealApp} from '@/components/real-app';
import {NfseWorkspace} from '@/components/nfse/nfse-workspace';

type Context={role:'admin'|'operator';effectiveModules:('documentos'|'nfse')[]};
type State={kind:'loading'}|{kind:'onboarding'}|{kind:'ready';context:Context}|{kind:'error';message:string};

export function WorkspaceGate(){
  const[state,setState]=useState<State>({kind:'loading'});
  useEffect(()=>{void fetchContext().then(async response=>{
    const body=await response.json();
    if(response.ok)setState({kind:'ready',context:body});
    else if(response.status===403&&String(body.error||'').includes('ainda não concluído'))setState({kind:'onboarding'});
    else setState({kind:'error',message:body.error||'Não foi possível carregar sua conta.'});
  }).catch(()=>setState({kind:'error',message:'Não foi possível carregar sua conta.'}))},[]);
  if(state.kind==='loading')return <main className="auth-shell"><p>Carregando sua conta…</p></main>;
  if(state.kind==='onboarding')return <Onboarding onDone={()=>location.reload()}/>;
  if(state.kind==='error')return <main className="auth-shell"><p>{state.message}</p><Logout/></main>;
  const modules=state.context.effectiveModules;
  if(modules.includes('nfse'))return <NfseWorkspace/>;
  if(modules.includes('documentos'))return <RealApp/>;
  return <ModuleStatus title="Ativação pendente" message="Seu cadastro foi concluído, mas nenhum módulo comercial está ativo. A escolha da oferta não concede acesso automaticamente."/>;
}
async function fetchContext(){let response=await fetch('/api/auth/context',{cache:'no-store'});if(response.status===401){const refreshed=await fetch('/api/auth/refresh',{method:'POST'});if(refreshed.ok)response=await fetch('/api/auth/context',{cache:'no-store'})}return response}

function Onboarding({onDone}:{onDone:()=>void}){
  const[message,setMessage]=useState('');
  async function submit(form:FormData){
    setMessage('Salvando…');
    const payload={name:form.get('name'),officeName:form.get('officeName'),taxId:form.get('taxId'),offer:form.get('offer'),idempotencyKey:crypto.randomUUID()};
    const response=await fetch('/api/auth/onboarding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),body=await response.json();
    if(response.ok){onDone();return}setMessage(body.error||'Não foi possível concluir o cadastro.');
  }
  return <main className="auth-shell"><form action={submit}><h1>Configure seu escritório</h1><input name="name" required minLength={2} placeholder="Seu nome"/><input name="officeName" required minLength={2} placeholder="Nome do escritório"/><input name="taxId" placeholder="CNPJ (opcional)"/><label>Oferta de interesse<select name="offer" defaultValue="documentos"><option value="documentos">Socium Documentos</option><option value="nfse">Emissor NFS-e</option><option value="completo">Completo</option></select></label><button type="submit">Concluir cadastro</button><p>{message}</p></form></main>;
}
function ModuleStatus({title,message}:{title:string;message:string}){return <main className="auth-shell"><section><h1>{title}</h1><p>{message}</p><Logout/></section></main>}
function Logout(){return <button type="button" onClick={async()=>{await fetch('/api/auth/logout',{method:'POST'});location.reload()}}>Sair</button>}
