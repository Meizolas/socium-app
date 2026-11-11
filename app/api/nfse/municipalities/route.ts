import { requireAppContext, authError } from "@/lib/auth-context";

type IbgeMunicipality = {
	id: number;
	nome: string;
	microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } };
	"regiao-imediata"?: { "regiao-intermediaria"?: { UF?: { sigla?: string } } };
};

type SearchableMunicipality = { ibgeCode: string; name: string; uf: string; search: string };
let municipalityCache: { expires: number; rows: SearchableMunicipality[] } | null = null;
let municipalityLoading: Promise<SearchableMunicipality[]> | null = null;

function normalize(value: string) {
	return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

async function loadMunicipalities() {
	if (municipalityCache && municipalityCache.expires >= Date.now()) return municipalityCache.rows;
	if (municipalityLoading) return municipalityLoading;
	municipalityLoading = (async () => {
		const response = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios", {
			next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000),
		});
		if (!response.ok) throw new Error("Não foi possível consultar os municípios do IBGE.");
		const source = await response.json() as IbgeMunicipality[];
		const rows = source.map((row) => ({
			ibgeCode: String(row.id), name: row.nome,
			uf: row.microrregiao?.mesorregiao?.UF?.sigla || row["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla || "",
			search: `${normalize(row.nome)} ${row.id}`,
		}));
		municipalityCache = { expires: Date.now() + 86400000, rows };
		return rows;
	})().finally(() => { municipalityLoading = null; });
	return municipalityLoading;
}

export async function GET(request: Request) {
	try {
		await requireAppContext(request, "nfse");
		const query = normalize(new URL(request.url).searchParams.get("q") || "");
		if (query.length < 2) return Response.json({ municipalities: [] });
		const rows = await loadMunicipalities();
		const municipalities = rows
			.filter((row) => row.search.includes(query))
			.slice(0, 12)
			.map(({ ibgeCode, name, uf }) => ({ ibgeCode, name, uf }));
		return Response.json({ municipalities });
	} catch (error) {
		return authError(error);
	}
}
