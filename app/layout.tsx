import type { Metadata } from 'next';
import './globals.css';
import './interactions.css';
import './development.css';
import './real.css';
import './integrations.css';
import './delete.css';
import './auth-nfse.css';
export const metadata: Metadata={title:'Socium Contábil | Automação',description:'Automação contábil de documentos DAS'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
