"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { formatTaxId } from "@/lib/br-tax-id";

type Mode = "login" | "signup" | "recover" | "reset";

export function AuthScreen() {
	const [mode, setMode] = useState<Mode>("login");
	const [identifier, setIdentifier] = useState("");
	const [message, setMessage] = useState("");
	const [feedbackTone, setFeedbackTone] = useState<"default" | "warning" | "error">("default");
	const [recoveryTokens, setRecoveryTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		const params = new URLSearchParams(location.hash.replace(/^#/, ""));
		const accessToken = params.get("access_token");
		const refreshToken = params.get("refresh_token");
		const callbackType = params.get("type");
		const confirmationError = params.get("error_description");
		if (confirmationError) {
			queueMicrotask(() => { setFeedbackTone("error"); setMessage(decodeURIComponent(confirmationError.replace(/\+/g, " "))); });
			history.replaceState(null, "", location.pathname + location.search);
			return;
		}
		if (!accessToken || !refreshToken) return;
		if (callbackType === "recovery") {
			queueMicrotask(() => {
				setRecoveryTokens({ accessToken, refreshToken });
				setMode("reset");
				setMessage("Crie uma nova senha para sua conta.");
			});
			history.replaceState(null, "", location.pathname + location.search);
			return;
		}
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
		if ((mode === "signup" || mode === "reset") && form.get("password") !== form.get("passwordConfirmation")) {
			setFeedbackTone("error");
			setMessage("As senhas não coincidem.");
			return;
		}
		setBusy(true);
		setFeedbackTone("default");
		setMessage("Aguarde…");
		const payload: Record<string, unknown> = Object.fromEntries(form);
		delete payload.passwordConfirmation;
		if (mode === "reset" && recoveryTokens) Object.assign(payload, recoveryTokens);
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
			if (response.ok && mode === "signup") {
				setMode("login");
				setFeedbackTone("warning");
				setMessage(data.message || "Cadastro criado. Verifique seu e-mail para confirmar a conta antes de entrar.");
				return;
			}
			if (response.ok && mode === "reset") {
				setRecoveryTokens(null);
				setMode("login");
				setFeedbackTone("warning");
				setMessage(data.message || "Senha alterada. Entre com sua nova senha.");
				return;
			}
			setFeedbackTone("error");
			setMessage(data.error || data.message || "Não foi possível concluir.");
		} catch {
			setFeedbackTone("error");
			setMessage("Não foi possível conectar ao serviço de autenticação.");
		} finally {
			setBusy(false);
		}
	}

	const switchMode = (next: Mode) => {
		setMode(next);
		setMessage("");
		setFeedbackTone("default");
	};
	const loginIdentifierChanged = (value: string) => {
		setIdentifier(/[a-z@]/i.test(value) ? value : formatTaxId(value));
	};
	return <main className="auth-shell"><form action={submit} className="auth-access-card">
		<Image src="/api/logo?brand=helians-v1" alt="Helians" width={220} height={74} priority />
		<h1>{mode === "login" ? "Entrar" : mode === "signup" ? "Criar sua conta" : mode === "recover" ? "Recuperar senha" : "Criar nova senha"}</h1>
		{mode === "login" && <>
			<p className="auth-intro">Acesse com seu CPF ou CNPJ e a senha cadastrada.</p>
			<input name="identifier" value={identifier} onChange={(event) => loginIdentifierChanged(event.target.value)} autoComplete="username" required placeholder="CPF ou CNPJ" aria-label="CPF ou CNPJ" />
			<input name="password" type="password" minLength={8} autoComplete="current-password" required placeholder="Senha" />
		</>}
		{mode === "signup" && <>
			<p className="auth-intro">Cadastre-se com CPF ou CNPJ. Ambos podem acessar em nome próprio ou atuar como representante quando houver autorização. O e-mail será usado para confirmação e recuperação.</p>
			<input name="name" autoComplete="name" required minLength={2} maxLength={120} placeholder="Seu nome" />
			<input name="taxId" value={identifier} onChange={(event) => setIdentifier(formatTaxId(event.target.value))} required minLength={14} maxLength={18} inputMode="numeric" placeholder="CPF ou CNPJ" />
			<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="E-mail de recuperação" />
			<input name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" required placeholder="Crie uma senha" />
			<input name="passwordConfirmation" type="password" minLength={8} maxLength={128} autoComplete="new-password" required placeholder="Confirme a senha" />
		</>}
		{mode === "recover" && <input name="identifier" value={identifier} onChange={(event) => loginIdentifierChanged(event.target.value)} autoComplete="username" required placeholder="CPF, CNPJ ou e-mail de recuperação" />}
		{mode === "reset" && <>
			<input name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" required placeholder="Nova senha" />
			<input name="passwordConfirmation" type="password" minLength={8} maxLength={128} autoComplete="new-password" required placeholder="Confirme a nova senha" />
		</>}
		<button type="submit" disabled={busy}>{busy ? "Processando…" : mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : mode === "recover" ? "Enviar instruções" : "Salvar nova senha"}</button>
		<div className="auth-secondary-actions">
			{mode === "login" && <>
				<button type="button" onClick={() => switchMode("signup")}>Primeiro acesso</button>
				<button type="button" onClick={() => switchMode("recover")}>Esqueci minha senha</button>
			</>}
			{mode !== "login" && mode !== "reset" && <button type="button" onClick={() => switchMode("login")}>Voltar para o login</button>}
		</div>
		{message && <p className={`auth-feedback ${feedbackTone}`} aria-live="polite">{message}</p>}
	</form></main>;
}
