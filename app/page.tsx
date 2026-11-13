import { cookies } from "next/headers";
import { AuthScreen } from "@/components/auth/auth-screen";
import { WorkspaceGate } from "@/components/workspace-gate";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const query = await searchParams;
	if (query.certificate_code || query.certificate_error) return <AuthScreen />;
	const jar = await cookies();
	const token = jar.get("socium_session")?.value || jar.get("socium_local_session")?.value;
	return token ? <WorkspaceGate /> : <AuthScreen />;
}
