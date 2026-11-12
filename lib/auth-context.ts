import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase-server";
import { localMode } from "./local-db";
import { localContext } from "./local-session";

export type AppModule = "documentos" | "nfse";
export type AppRole = "admin" | "operator" | "client";
export type AppContext = {
	userId: string;
	officeId: string;
	role: AppRole;
	onboardingStep: string;
	effectiveModules: AppModule[];
	issuerScope: string[] | null;
};

export class AuthError extends Error {
	constructor(
		message: string,
		public status: 401 | 403,
	) {
		super(message);
	}
}

export function sessionToken(request: Request) {
	const value = request.headers.get("authorization") || "",
		cookie = request.headers.get("cookie") || "";
	const stored = cookie
		.split(";")
		.map((x) => x.trim())
		.find((x) => x.startsWith("socium_session="))
		?.slice(15);
	return value.startsWith("Bearer ")
		? value.slice(7)
		: decodeURIComponent(stored || "");
}

export async function requireAppContext(
	request: Request,
	module?: AppModule,
	roles?: AppRole[],
): Promise<AppContext> {
	if (localMode()) {
		const context = await localContext(request);
		if (module && !context.effectiveModules.includes(module))
			throw new AuthError("Módulo não habilitado para esta conta.", 403);
		if (roles && !roles.includes(context.role))
			throw new AuthError("Papel sem permissão para esta operação.", 403);
		return context;
	}
	const token = sessionToken(request);
	if (!token) throw new AuthError("Autenticação necessária.", 401);
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
		anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !anon) throw new Error("Serviço de autenticação indisponível.");
	const auth = createClient(url, anon, {
		global: { headers: { Authorization: `Bearer ${token}` } },
		auth: { persistSession: false, autoRefreshToken: false },
	});
	const {
		data: { user },
		error,
	} = await auth.auth.getUser(token);
	if (error || !user || !user.email_confirmed_at)
		throw new AuthError("Sessão inválida ou e-mail não confirmado.", 401);
	const db = supabaseAdmin();
	const profile = await db
		.from("profiles")
		.select("office_id,role,onboarding_step")
		.eq("id", user.id)
		.maybeSingle();
	if (profile.error) throw new Error(profile.error.message);
	if (!profile.data)
		throw new AuthError("Cadastro do escritório ainda não concluído.", 403);
	const profileData = profile.data;
	const modules = await db
		.from("office_modules")
		.select("module,status")
		.eq("office_id", profileData.office_id);
	const restrictions = await db
		.from("profile_module_access")
		.select("module,allowed")
		.eq("profile_id", user.id);
	if (modules.error || restrictions.error)
		throw new Error(modules.error?.message || restrictions.error?.message);
	const denied = new Set(
		(restrictions.data || []).filter((x) => !x.allowed).map((x) => x.module),
	);
	const effectiveModules = (modules.data || [])
		.filter((x) => x.status === "active" && !denied.has(x.module))
		.filter((x) => profileData.role !== "client" || x.module === "nfse")
		.map((x) => x.module) as AppModule[];
	const scope = await db
		.from("nfse_profile_issuer_access")
		.select("issuer_id,allowed")
		.eq("profile_id", user.id);
	if (scope.error) throw new Error(scope.error.message);
	const issuerRules = scope.data || [];
	let clientIssuerId: string | null = null;
	if (profileData.role === "client") {
		const account = await db
			.from("helians_accounts")
			.select("issuer_id,status")
			.eq("auth_user_id", user.id)
			.eq("account_type", "client")
			.maybeSingle();
		if (account.error) throw new Error(account.error.message);
		if (!account.data || account.data.status !== "active" || !account.data.issuer_id)
			throw new AuthError("Conta do cliente sem emitente ativo.", 403);
		clientIssuerId = account.data.issuer_id;
	}
	const context: AppContext = {
		userId: user.id,
		officeId: profileData.office_id,
		role: profileData.role as AppRole,
		onboardingStep: profileData.onboarding_step,
		effectiveModules,
		issuerScope: clientIssuerId ? [clientIssuerId] : issuerRules.length
			? issuerRules.filter((x) => x.allowed).map((x) => x.issuer_id)
			: null,
	};
	if (module && !effectiveModules.includes(module))
		throw new AuthError("Módulo não habilitado para esta conta.", 403);
	if (roles && !roles.includes(context.role))
		throw new AuthError("Papel sem permissão para esta operação.", 403);
	return context;
}

export function issuerAllowed(context: AppContext, issuerId: string) {
	return context.issuerScope === null || context.issuerScope.includes(issuerId);
}

export function requireIssuer(context: AppContext, issuerId: string) {
	if (!issuerAllowed(context, issuerId))
		throw new AuthError("Emitente fora do escopo.", 403);
}

export function authError(error: unknown) {
	if (error instanceof AuthError)
		return Response.json({ error: error.message }, { status: error.status });
	if (
		error instanceof Error &&
		"status" in error &&
		(error.status === 401 || error.status === 403)
	)
		return Response.json({ error: error.message }, { status: error.status });
	console.error("Erro interno de autenticação", error);
	return Response.json({ error: "Não foi possível concluir a solicitação." }, { status: 500 });
}

export function supabaseForSession(request: Request) {
	const token = sessionToken(request),
		url = process.env.NEXT_PUBLIC_SUPABASE_URL,
		anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!token) throw new AuthError("Autenticação necessária.", 401);
	if (!url || !anon) throw new Error("Serviço de autenticação indisponível.");
	return createClient(url, anon, {
		global: { headers: { Authorization: `Bearer ${token}` } },
		auth: { persistSession: false, autoRefreshToken: false },
	});
}
