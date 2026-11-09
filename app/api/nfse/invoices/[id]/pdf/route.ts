import { authError, requireAppContext, requireIssuer } from "@/lib/auth-context";
import { localMode, localQuery } from "@/lib/local-db";
import { localRead } from "@/lib/local-storage";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const context = await requireAppContext(request, "nfse"), { id } = await params;
		if (localMode()) {
			const found = await localQuery<{ storage_path: string; issuer_id: string; kind: string }>(
				"select f.storage_path,i.issuer_id,f.kind from nfse_files f join nfse_invoices i on i.id=f.invoice_id where i.id=$1 and i.office_id=$2 and f.kind in ('official_pdf','simulated_pdf') order by case when f.kind='official_pdf' then 0 else 1 end,f.created_at desc limit 1",
				[id, context.officeId],
			);
			if (!found.rows[0]) return Response.json({ error: "PDF ainda não disponível." }, { status: 404 });
			requireIssuer(context, found.rows[0].issuer_id);
			return pdf(await localRead(found.rows[0].storage_path), id, found.rows[0].kind === "simulated_pdf");
		}
		const db = supabaseAdmin(), file = await db.from("nfse_files")
			.select("storage_path,kind,nfse_invoices!inner(issuer_id,office_id)")
			.eq("invoice_id", id).in("kind", ["official_pdf", "simulated_pdf"])
			.eq("nfse_invoices.office_id", context.officeId).order("created_at", { ascending: false }).limit(1).maybeSingle();
		if (file.error) throw new Error(file.error.message);
		if (!file.data) return Response.json({ error: "PDF ainda não disponível." }, { status: 404 });
		const invoice = Array.isArray(file.data.nfse_invoices) ? file.data.nfse_invoices[0] : file.data.nfse_invoices;
		requireIssuer(context, String(invoice.issuer_id));
		const downloaded = await db.storage.from("nfse-documents").download(file.data.storage_path);
		if (downloaded.error) throw new Error(downloaded.error.message);
		return pdf(await downloaded.data.arrayBuffer(), id, file.data.kind === "simulated_pdf");
	} catch (error) {
		return authError(error);
	}
}

function pdf(bytes: BodyInit, id: string, simulated = false) {
	return new Response(bytes, { headers: {
		"Content-Type": "application/pdf",
		"Content-Disposition": `attachment; filename="${simulated ? "danfse-simulado" : "danfse"}-${id}.pdf"`,
		"X-NFSe-Artifact": simulated ? "SIMULATED_LOCAL" : "OFFICIAL",
		"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
	} });
}
