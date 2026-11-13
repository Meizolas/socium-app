import { EmailActionClient } from "./email-action-client";

export default async function EmailActionPage({ searchParams }: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const params = await searchParams;
	const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
	const type = params.type === "recovery" ? "recovery" : "signup";
	if (!/^[0-9a-f]{64}$/i.test(tokenHash)) return <main className="auth-shell"><section className="auth-access-card auth-status-card">
		<h1>Link inválido</h1><p className="auth-feedback error">Solicite um novo e-mail e tente novamente.</p>
	</section></main>;
	return <EmailActionClient tokenHash={tokenHash.toLowerCase()} type={type} />;
}
