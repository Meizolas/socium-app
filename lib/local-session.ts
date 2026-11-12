import { createHmac, timingSafeEqual } from "node:crypto";
import type { AppContext } from "./auth-context";
import { localMode, localQuery } from "./local-db";
const cookieName = "socium_local_session";
function secret() {
	const value = process.env.LOCAL_SESSION_SECRET;
	if (!value || value.length < 32)
		throw new Error("LOCAL_SESSION_SECRET deve ter 32 caracteres ou mais.");
	return value;
}
export function createLocalSession(userId: string) {
	if (!localMode()) throw new Error("Modo local desativado.");
	const payload = Buffer.from(
		JSON.stringify({ userId, expires: Date.now() + 8 * 60 * 60_000 }),
	).toString("base64url");
	return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}
function token(request: Request) {
	const cookie = request.headers.get("cookie") || "";
	return (
		cookie
			.split(";")
			.map((x) => x.trim())
			.find((x) => x.startsWith(cookieName + "="))
			?.slice(cookieName.length + 1) || ""
	);
}
export async function localContext(request: Request): Promise<AppContext> {
	const raw = token(request),
		[payload, signature] = raw.split("."),
		expected = createHmac("sha256", secret())
			.update(payload || "")
			.digest("base64url");
	if (
		!payload ||
		!signature ||
		signature.length !== expected.length ||
		!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
	)
		throw Object.assign(new Error("Autenticação necessária."), { status: 401 });
	const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
		userId: string;
		expires: number;
	};
	if (parsed.expires < Date.now())
		throw Object.assign(new Error("Sessão expirada."), { status: 401 });
	const result = await localQuery<{
		user_id: string;
		office_id: string;
		role: "admin" | "operator" | "client";
		onboarding_step: string;
		modules: string[];
	}>(
		`select u.id user_id,p.office_id,p.role,p.onboarding_step,
		 coalesce(array_agg(om.module::text order by om.module::text)
		 filter(where om.status='active' and coalesce(pma.allowed,true)),array[]::text[]) modules
		 from auth.users u join profiles p on p.id=u.id
		 left join office_modules om on om.office_id=p.office_id
		 left join profile_module_access pma on pma.profile_id=p.id and pma.module=om.module
		 where u.id=$1 group by u.id,p.office_id,p.role,p.onboarding_step`,
		[parsed.userId],
	);
	if (!result.rows[0])
		throw Object.assign(new Error("Conta local inválida."), { status: 401 });
	const row = result.rows[0],
		scope = await localQuery<{ issuer_id: string; allowed: boolean }>(
			"select issuer_id,allowed from nfse_profile_issuer_access where profile_id=$1",
			[parsed.userId],
		),
		rules = scope.rows;
	let clientIssuerId: string | null = null;
	if (row.role === "client") {
		const account = await localQuery<{ issuer_id: string }>(
			"select issuer_id from helians_accounts where auth_user_id=$1 and account_type='client' and status='active'",
			[parsed.userId],
		);
		if (!account.rows[0]?.issuer_id)
			throw Object.assign(new Error("Conta do cliente sem emitente ativo."), { status: 403 });
		clientIssuerId = account.rows[0].issuer_id;
	}
	return {
		userId: row.user_id,
		officeId: row.office_id,
		role: row.role,
		onboardingStep: row.onboarding_step,
		effectiveModules: (row.role === "client" ? row.modules.filter((module) => module === "nfse") : row.modules) as AppContext["effectiveModules"],
		issuerScope: clientIssuerId ? [clientIssuerId] : rules.length
			? rules.filter((x) => x.allowed).map((x) => x.issuer_id)
			: null,
	};
}
export const localCookie = {
	name: cookieName,
	options: {
		httpOnly: true,
		secure: false,
		sameSite: "lax" as const,
		path: "/",
		maxAge: 8 * 60 * 60,
	},
};
