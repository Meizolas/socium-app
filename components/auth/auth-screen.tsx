"use client";
import { useState } from "react";

type Mode = "login" | "signup" | "recover";
export function AuthScreen() {
	const [mode, setMode] = useState<Mode>("login");
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
		<h1>{mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Recuperar senha"}</h1>
		{mode === "signup" && <input name="name" required placeholder="Seu nome" />}
		{mode === "login"
			? <input name="identifier" autoComplete="username" required placeholder="CPF, CNPJ ou e-mail" />
			: <input name="email" type="email" autoComplete="email" required placeholder="E-mail" />}
		{mode !== "recover" && <input name="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required placeholder="Senha" />}
		<button type="submit">{mode === "login" ? "Entrar" : mode === "signup" ? "Cadastrar" : "Enviar instruções"}</button>
		{mode === "login" && <button type="button" onClick={() => switchMode("recover")}>Esqueci minha senha</button>}
		<button type="button" onClick={() => switchMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Criar uma conta" : "Voltar para o login"}</button>
		<p>{message}</p>
	</form></main>;
}
