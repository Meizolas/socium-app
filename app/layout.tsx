import type { Metadata } from 'next';
import './globals.css';
import './interactions.css';
import './development.css';
import './real.css';
import './integrations.css';
import './delete.css';
import './auth-nfse.css';
export const metadata: Metadata={title:'Helians | Plataforma contábil',description:'Plataforma contábil para emissão de NFS-e e gestão de documentos',icons:{icon:'/api/logo?variant=icon&brand=helians-v1'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
