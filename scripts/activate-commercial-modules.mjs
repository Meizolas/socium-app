import { createClient } from "@supabase/supabase-js";

const values = Object.fromEntries(process.argv.slice(2).map((argument) => {
	const [key, ...rest] = argument.replace(/^--/, "").split("=");
	return [key, rest.join("=")];
}));
const officeId = values.office, modules = String(values.modules || "").split(",").filter(Boolean);
const reason = values.reason, actor = values.actor || null;
if (!/^[0-9a-f-]{36}$/i.test(officeId || "") || !modules.length
	|| modules.some((module) => !["nfse", "documentos"].includes(module))
	|| !reason || reason.trim().length < 5 || (actor && !/^[0-9a-f-]{36}$/i.test(actor))) {
	console.error("Uso: node scripts/activate-commercial-modules.mjs --office=UUID --modules=nfse[,documentos] --reason=CONTRATO --actor=UUID_OPCIONAL");
	process.exit(2);
}
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
	console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY somente no ambiente administrativo.");
	process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const result = await db.rpc("activate_commercial_modules", {
	p_office: officeId, p_modules: modules, p_activated_by: actor, p_reason: reason.trim(),
});
if (result.error) {
	console.error(`Ativação recusada: ${result.error.message}`);
	process.exit(1);
}
console.log(JSON.stringify(result.data, null, 2));
