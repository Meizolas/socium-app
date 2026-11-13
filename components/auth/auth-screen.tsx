"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { formatTaxId } from "@/lib/br-tax-id";

type Mode = "login" | "signup" | "recover";

export function AuthScreen() {
	const [mode, setMode] = useState<Mode>("login");
	const [identifier, setIdentifier] = useState("");
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		const params = new URLSearchParams(location.hash.replace(/^#/, ""));
		const accessToken = params.get("access_token");
		const refreshToken = params.get("refresh_token");
		const confirmationError = params.get("error_description");
		if (confirmationError) {
			queueMicrotask(() => setMessage(decodeURIComponent(confirmationError.replace(/\+/g, " "))));
			history.replaceState(null, "", location.pathname + location.search);
			return;
		}
		if (!accessToken || !refreshToken) return;
		void Promise.resolve().then(() => {
			setBusy(true);
			setMessage("Confirmando seu cadastro…");
			return fetch("/api/auth/session", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ accessToken, refreshToken }),
			});
		}).then(async (response) => {
			const body = await response.json();
			history.replaceState(null, "", location.pathname + location.search);
			if (response.ok) location.reload();
			else setMessage(body.error || "Não foi possível confirmar o cadastro.");
		}).catch(() => setMessage("Não foi possível confirmar o cadastro."))
			.finally(() => setBusy(false));
	}, []);

	async function submit(form: FormData) {
		if (mode === "signup" && form.get("password") !== form.get("passwordConfirmation")) {
			setMessage("As senhas não coincidem.");
			return;
		}
		setBusy(true);
		setMessage("Aguarde…");
		const payload = Object.fromEntries(form);
		delete payload.passwordConfirmation;
		try {
			const response = await fetch(`/api/auth/${mode}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			const data = await response.json();
			if (response.ok && (mode === "login" || data.authenticated)) {
				location.reload();
				return;
			}
			setMessage(data.error || data.message || "Não foi possível concluir.");
		} catch {
			setMessage("Não foi possível conectar ao serviço de autenticação.");
		} finally {
			setBusy(false);
		}
	}

	const switchMode = (next: Mode) => {
		setMode(next);
		setMessage("");
	};
	const loginIdentifierChanged = (value: string) => {
		setIdentifier(/[a-z@]/i.test(value) ? value : formatTaxId(value));
	};
	return <main className="auth-shell"><form action={submit} className="auth-access-card">
		<Image src="/api/logo?brand=helians-v1" alt="Helians" width={220} height={74} priority />
		<h1>{mode === "login" ? "Entrar" : mode === "signup" ? "Criar sua conta" : "Recuperar senha"}</h1>
		{mode === "login" && <>
			<p className="auth-intro">Acesse com seu CPF ou CNPJ e a senha cadastrada.</p>
			<input name="identifier" value={identifier} onChange={(event) => loginIdentifierChanged(event.target.value)} autoComplete="username" required placeholder="CPF ou CNPJ" aria-label="CPF ou CNPJ" />
			<input name="password" type="password" minLength={8} autoComplete="current-password" required placeholder="Senha" />
		</>}
		{mode === "signup" && <>
			<p className="auth-intro">Use CPF para acesso pessoal ou CNPJ para acesso empresarial. O e-mail será usado para confirmação e recuperação.</p>
			<input name="name" autoComplete="name" required minLength={2} maxLength={120} placeholder="Seu nome" />
			<input name="taxId" value={identifier} onChange={(event) => setIdentifier(formatTaxId(event.target.value))} required minLength={14} maxLength={18} inputMode="numeric" placeholder="CPF ou CNPJ" />
			<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="E-mail de recuperação" />
			<input name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" required placeholder="Crie uma senha" />
			<input name="passwordConfirmation" type="password" minLength={8} maxLength={128} autoComplete="new-password" required placeholder="Confirme a senha" />
		</>}
		{mode === "recover" && <input name="identifier" value={identifier} onChange={(event) => loginIdentifierChanged(event.target.value)} autoComplete="username" required placeholder="CPF, CNPJ ou e-mail de recuperação" />}
		<button type="submit" disabled={busy}>{busy ? "Processando…" : mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar instruções"}</button>
		<div className="auth-secondary-actions">
			{mode === "login" && <>
				<button type="button" onClick={() => switchMode("signup")}>Primeiro acesso</button>
				<button type="button" onClick={() => switchMode("recover")}>Esqueci minha senha</button>
			</>}
			{mode !== "login" && <button type="button" onClick={() => switchMode("login")}>Voltar para o login</button>}
		</div>
		{message && <p className="auth-feedback" aria-live="polite">{message}</p>}
	</form></main>;
}
