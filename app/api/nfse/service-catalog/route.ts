import { authError, requireAppContext } from "@/lib/auth-context";
import catalog from "@/data/nfse-service-catalog.json";

type CatalogNbs = { code: string; description: string };
type CatalogService = { code: string; formatted: string; item: string; description: string; nbs: CatalogNbs[] };

function normalize(value: string) {
	return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export async function GET(request: Request) {
	try {
		await requireAppContext(request, "nfse");
		const query = normalize(new URL(request.url).searchParams.get("q") || "");
		const rows = (catalog.services as CatalogService[])
			.filter((service) => !query || normalize(`${service.formatted} ${service.code} ${service.description}`).includes(query))
			.slice(0, 12);
		return Response.json({ services: rows, source: catalog.source });
	} catch (error) {
		return authError(error);
	}
}
