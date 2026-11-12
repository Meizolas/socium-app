"use client";
import { useState } from "react";

type Mode = "login" | "recover";

function formatCnpj(value: string) {
	const digits = value.replace(/\D/g, "").slice(0, 14);
	return digits
		.replace(/^(\d{2})(\d)/, "$1.$2")
		.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
		.replace(/\.(\d{3})(\d)/, ".$1/$2")
		.replace(/(\d{4})(\d)/, "$1-$2");
}

export function AuthScreen() {
	const [mode, setMode] = useState<Mode>("login");
	const [cnpj, setCnpj] = useState("");
	const [message, setMessage] = useState("");
	async function submit(form: FormData) {
		setMessage("Aguarde…");
		const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
		const data = await response.json();
		if (response.ok && mode === "login") { location.reload(); return; }
		setMessage(data.error || data.message || "Não foi possível concluir.");
	}
	const switchMode = (next: Mode) => { setMode(next); setMessage(""); };
	return <main className="auth-shell"><form action={submit}>
		<img src="/api/logo?brand=helians-v1" alt="Helians" />
		<h1>{mode === "login" ? "Entrar" : "Recuperar senha"}</h1>
		{mode === "login" ? <>
			<input name="identifier" value={cnpj} onChange={(event) => setCnpj(formatCnpj(event.target.value))} inputMode="numeric" autoComplete="username" required minLength={18} maxLength={18} placeholder="00.000.000/0000-00" aria-label="CNPJ" />
			<input name="password" type="password" minLength={8} autoComplete="current-password" required placeholder="Senha" />
		</> : <input name="email" type="email" autoComplete="email" required placeholder="E-mail de recuperação" />}
		<button type="submit">{mode === "login" ? "Entrar" : "Enviar instruções"}</button>
		{mode === "login"
			? <button type="button" onClick={() => switchMode("recover")}>Esqueci minha senha</button>
			: <button type="button" onClick={() => switchMode("login")}>Voltar para o login</button>}
		<p>{message}</p>
	</form></main>;
}
