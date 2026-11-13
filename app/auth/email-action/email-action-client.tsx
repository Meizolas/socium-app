"use client";

import { useState } from "react";
import Image from "next/image";

export function EmailActionClient({ tokenHash, type }: { tokenHash: string; type: "signup" | "recovery" }) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const confirmation = type === "signup";
	async function confirm() {
		setBusy(true);
		setError("");
		try {
			const response = await fetch("/api/auth/email-action", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tokenHash, type }),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "Não foi possível validar o link.");
			if (type === "recovery") {
				const hash = new URLSearchParams({ access_token: data.accessToken, refresh_token: data.refreshToken, type: "recovery" });
				location.replace(`/#${hash.toString()}`);
			} else location.replace("/");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Não foi possível validar o link.");
			setBusy(false);
		}
	}
	return <main className="auth-shell"><section className="auth-access-card auth-status-card">
		<Image src="/api/logo?brand=helians-v1" alt="Helians" width={220} height={74} priority />
		<h1>{confirmation ? "Confirme seu e-mail" : "Redefina sua senha"}</h1>
		<p className="auth-intro">{confirmation
			? "Clique abaixo para concluir a confirmação e ativar sua conta Helians."
			: "Clique abaixo para validar a solicitação e criar uma nova senha."}</p>
		<button type="button" onClick={confirm} disabled={busy}>{busy ? "Validando…" : confirmation ? "Confirmar e-mail" : "Continuar"}</button>
		{error && <p className="auth-feedback error" aria-live="polite">{error}</p>}
	</section></main>;
}
