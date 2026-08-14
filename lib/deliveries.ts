import { getCredential } from "./credentials";
import { supabaseAdmin } from "./supabase-server";

type Channel = "email" | "whatsapp";
type ChannelResult = {
  channel: Channel;
  status: "sent" | "already_sent" | "error";
  error?: string;
};
const DEFAULT_SUBJECT = "Guia {{tipo}} — {{competencia}} — {{cliente}}";
const DEFAULT_MESSAGE = `Prezados,

Segue(m) anexo guia(s) de imposto(s) ref. a empresa **{{cliente}}**.

📅 **Data de vencimento:**
{{vencimento}}

💰 **Valor:**
{{valor}}

Pedimos, por gentileza, que o pagamento seja realizado até a data informada para evitar encargos.

Em caso de dúvidas, estamos à disposição.

Atenciosamente,

***Anselmo Júnior***
***(77) 9 9174-0886 (zap)***
***(77) 9 9995-4833***`;
const DEFAULT_GROUP_SUBJECT =
  "Guias {{tipos}} — {{competencias}} — {{cliente}}";
const DEFAULT_GROUP_MESSAGE = DEFAULT_MESSAGE;

async function documentData(documentId: string) {
  const db = supabaseAdmin(),
    doc = await db
      .from("documents")
      .select("*,clients(*)")
      .eq("id", documentId)
      .single();
  if (doc.error) throw new Error(doc.error.message);
  const file = await db.storage
    .from("das-documents")
    .download(doc.data.storage_path);
  if (file.error) throw new Error(file.error.message);
  return {
    doc: doc.data,
    client: Array.isArray(doc.data.clients)
      ? doc.data.clients[0]
      : doc.data.clients,
    bytes: Buffer.from(await file.data.arrayBuffer()),
  };
}
async function record(
  documentId: string,
  officeId: string,
  channel: Channel,
  status: "Enviado" | "Erro",
  error?: string,
) {
  const result = await supabaseAdmin()
    .from("deliveries")
    .insert({
      office_id: officeId,
      document_id: documentId,
      channel,
      status,
      sent_at: status === "Enviado" ? new Date().toISOString() : null,
      error_message: error?.slice(0, 500) || null,
    });
  if (result.error) throw new Error(result.error.message);
}
function replaceVariables(template: string, values: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => values[key] ?? "");
}
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function templateToHtml(value: string) {
  return escapeHtml(value)
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}
function formatDate(value: string | null | undefined) {
  if (!value) return "Não informado";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
}
function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "")
    return "Não informado";
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "Não informado";
}
function friendlyGoogleError(body: {
  error?: string;
  error_description?: string;
}) {
  if (
    body.error === "invalid_client" ||
    /client secret is invalid/i.test(body.error_description || "")
  )
    return "Credenciais OAuth do Google inválidas no servidor. Confira se GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET pertencem à mesma credencial e reconecte a conta.";
  if (body.error === "invalid_grant")
    return "A autorização do Gmail expirou ou foi revogada. Reconecte a conta em Configurações.";
  return (
    body.error_description || body.error || "Falha de autenticação no Google."
  );
}

export async function sendWhatsApp(documentId: string) {
  const credential = await getCredential("evolution");
  if (!credential)
    throw new Error(
      "WhatsApp não configurado. Altere o cliente para Somente e-mail ou configure a integração no servidor.",
    );
  const { doc, client, bytes } = await documentData(documentId),
    number = String(client?.whatsapp || "").replace(/\D/g, "");
  if (!number) throw new Error("Cliente sem número de WhatsApp cadastrado.");
  const fileName = doc.final_name?.endsWith(".pdf")
    ? doc.final_name
    : `${doc.final_name || doc.original_name.replace(/\.pdf$/i, "")}.pdf`;
  const response = await fetch(
      `${credential.config.baseUrl}/message/sendMedia/${encodeURIComponent(credential.config.instance)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: credential.secrets.apiKey,
        },
        body: JSON.stringify({
          number,
          mediatype: "document",
          mimetype: "application/pdf",
          caption: `Olá! Segue ${fileName}.`,
          media: bytes.toString("base64"),
          fileName,
        }),
      },
    ),
    text = await response.text();
  if (!response.ok)
    throw new Error(`Evolution API: ${response.status} ${text.slice(0, 200)}`);
  await record(documentId, doc.office_id, "whatsapp", "Enviado");
  return true;
}

export async function sendGmailDocuments(documentIds: string[]) {
  const ids = [...new Set(documentIds)];
  if (!ids.length) throw new Error("Nenhum documento informado para envio.");
  const credential = await getCredential("gmail");
  if (!credential) throw new Error("Conta Google ainda não conectada.");
  const clientId = process.env.GOOGLE_CLIENT_ID,
    clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !credential.secrets.refreshToken)
    throw new Error(
      "OAuth do Google incompleto. Reconecte a conta em Configurações.",
    );
  const db = supabaseAdmin(),
    query = await db.from("documents").select("*,clients(*)").in("id", ids);
  if (query.error) throw new Error(query.error.message);
  const docs = query.data || [];
  if (docs.length !== ids.length)
    throw new Error("Um ou mais documentos não foram encontrados.");
  const client = Array.isArray(docs[0].clients)
    ? docs[0].clients[0]
    : docs[0].clients;
  if (docs.some((doc) => doc.client_id !== docs[0].client_id))
    throw new Error("O lote contém documentos de clientes diferentes.");
  const recipients = [
    ...new Set(
      [client?.email, ...(client?.additional_emails || [])]
        .map((value) =>
          String(value || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
  if (!recipients.length) throw new Error("Cliente sem e-mail cadastrado.");
  const token = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: credential.secrets.refreshToken,
        grant_type: "refresh_token",
      }),
    }),
    tokenBody = await token.json();
  if (!token.ok) throw new Error(friendlyGoogleError(tokenBody));
  const attachments = await Promise.all(
      docs.map(async (doc) => {
        const file = await db.storage
          .from("das-documents")
          .download(doc.storage_path);
        if (file.error) throw new Error(file.error.message);
        return {
          doc,
          fileName: doc.final_name?.endsWith(".pdf")
            ? doc.final_name
            : `${doc.final_name || doc.original_name.replace(/\.pdf$/i, "")}.pdf`,
          bytes: Buffer.from(await file.data.arrayBuffer()),
        };
      }),
    ),
    types = [...new Set(docs.map((doc) => doc.document_type || "GUIA"))],
    competences = [
      ...new Set(docs.map((doc) => doc.competence).filter(Boolean)),
    ],
    dueDates = [...new Set(docs.map((doc) => formatDate(doc.due_date)))],
    amounts = docs.map((doc) => formatMoney(doc.amount)),
    plural = docs.length > 1,
    values = {
      cliente: client.legal_name || "",
      tipo: types[0] || "GUIA",
      tipos: types.join(", "),
      competencia: competences[0] || "",
      competencias: competences.join(", "),
      quantidade: String(docs.length),
      vencimento: dueDates.join("\n"),
      vencimentos: dueDates.join("\n"),
      valor: amounts.join("\n"),
      valores: amounts.join("\n"),
      arquivo: attachments.map((item) => item.fileName).join(", "),
    },
    subject = replaceVariables(
      plural
        ? credential.config.groupSubjectTemplate || DEFAULT_GROUP_SUBJECT
        : credential.config.subjectTemplate || DEFAULT_SUBJECT,
      values,
    ),
    message = replaceVariables(
      plural
        ? credential.config.groupMessageTemplate || DEFAULT_GROUP_MESSAGE
        : credential.config.messageTemplate || DEFAULT_MESSAGE,
      values,
    ),
    boundary = `socium_${Date.now()}`,
    mime = [
      `From: ${credential.config.fromEmail}`,
      `To: ${recipients.join(", ")}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(templateToHtml(message)).toString("base64"),
      "",
    ];
  for (const attachment of attachments)
    mime.push(
      `--${boundary}`,
      `Content-Type: application/pdf; name="${attachment.fileName}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachment.fileName}"`,
      "",
      attachment.bytes.toString("base64"),
    );
  mime.push(`--${boundary}--`);
  const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenBody.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: Buffer.from(mime.join("\r\n")).toString("base64url"),
        }),
      },
    ),
    text = await response.text();
  if (!response.ok)
    throw new Error(`Gmail API: ${response.status} ${text.slice(0, 200)}`);
  await Promise.all(
    docs.map((doc) => record(doc.id, doc.office_id, "email", "Enviado")),
  );
  return true;
}
export async function sendGmail(documentId: string) {
  return sendGmailDocuments([documentId]);
}

export async function attemptBatchDelivery(batchId: string) {
  const db = supabaseAdmin(),
    docs = await db
      .from("documents")
      .select("id,office_id,client_id,status,batch_size")
      .eq("batch_id", batchId);
  if (docs.error) throw new Error(docs.error.message);
  const rows = docs.data || [];
  if (!rows.length) return { waiting: false, groups: 0 };
  const expected=Math.max(...rows.map(row=>Number(row.batch_size)||1));
  if(rows.length<expected)return {waiting:true,groups:0};
  const processings = await db
    .from("processings")
    .select("document_id,status")
    .in(
      "document_id",
      rows.map((row) => row.id),
    );
  if (processings.error) throw new Error(processings.error.message);
  const pending = (processings.data || []).some((item) =>
    /fila|aguardando|processando/i.test(item.status),
  );
  if (pending) return { waiting: true, groups: 0 };
  const ready = rows.filter(
      (row) =>
        row.client_id &&
        !["Erro", "Cancelado", "Revisão necessária"].includes(row.status),
    ),
    groups = new Map<string, string[]>();
  for (const row of ready)
    groups.set(row.client_id, [...(groups.get(row.client_id) || []), row.id]);
  for (const ids of groups.values()) {
    const already = await db
      .from("deliveries")
      .select("document_id")
      .eq("channel", "email")
      .eq("status", "Enviado")
      .in("document_id", ids);
    if (already.error) throw new Error(already.error.message);
    const pendingIds = ids.filter(
      (id) => !(already.data || []).some((item) => item.document_id === id),
    );
    if (!pendingIds.length) continue;
    await db
      .from("processings")
      .update({ status: "Processado — enviando por e-mail", progress: 90 })
      .in("document_id", pendingIds);
    await db
      .from("documents")
      .update({ status: "Enviando" })
      .in("id", pendingIds);
    try {
      await sendGmailDocuments(pendingIds);
      await db
        .from("documents")
        .update({ status: "Enviado" })
        .in("id", pendingIds);
      await db
        .from("processings")
        .update({ status: "Concluído — enviado por e-mail", progress: 100, finished_at: new Date().toISOString(), error_message: null })
        .in("document_id", pendingIds);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha no envio do lote.";
      for (const id of pendingIds)
        await record(
          id,
          rows.find((row) => row.id === id)?.office_id || "",
          "email",
          "Erro",
          message,
        ).catch(() => {});
      await db
        .from("documents")
        .update({ status: "Erro" })
        .in("id", pendingIds);
      await db
        .from("processings")
        .update({ status: "Processado — erro no envio do e-mail", progress: 100, finished_at: new Date().toISOString(), error_message: message.slice(0, 500) })
        .in("document_id", pendingIds);
      const first = await db
        .from("documents")
        .select("office_id")
        .eq("id", pendingIds[0])
        .single();
      if (!first.error)
        await db
          .from("alerts")
          .insert({
            office_id: first.data.office_id,
            document_id: pendingIds[0],
            type: "Falha de envio em lote",
            severity: "Crítico",
            title: message.slice(0, 300),
          });
    }
  }
  return { waiting: false, groups: groups.size };
}

export async function attemptDocumentDelivery(documentId: string) {
  const db = supabaseAdmin(),
    document = await db
      .from("documents")
      .select(
        "id,office_id,status,clients(preference,auto_created,email,additional_emails,whatsapp)",
      )
      .eq("id", documentId)
      .single();
  if (document.error) throw new Error(document.error.message);
  const client = Array.isArray(document.data.clients)
    ? document.data.clients[0]
    : document.data.clients;
  if (!client)
    return {
      status: "blocked",
      message: "Cliente não cadastrado. Complete o cadastro antes de enviar.",
      results: [] as ChannelResult[],
    };
  const hasEmail = Boolean(
    client.email || (client.additional_emails || []).length,
  );
  if (client.auto_created || (!hasEmail && !client.whatsapp))
    return {
      status: "blocked",
      message:
        "Cadastro incompleto. Informe pelo menos um e-mail para liberar o envio.",
      results: [] as ChannelResult[],
    };
  const preference = String(client.preference || "Somente e-mail"),
    channels: Channel[] = [];
  if (/e-mail|email/i.test(preference)) channels.push("email");
  if (/whatsapp/i.test(preference)) channels.push("whatsapp");
  if (!channels.length) channels.push("email");
  await db
    .from("processings")
    .update({ status: "Processado — enviando por e-mail", progress: 90, error_message: null })
    .eq("document_id", documentId);
  await db
    .from("documents")
    .update({ status: "Enviando" })
    .eq("id", documentId);
  const previous = await db
    .from("deliveries")
    .select("channel")
    .eq("document_id", documentId)
    .eq("status", "Enviado")
    .in("channel", channels);
  if (previous.error) throw new Error(previous.error.message);
  const sentBefore = new Set((previous.data || []).map((row) => row.channel)),
    results: ChannelResult[] = [];
  for (const channel of channels) {
    if (sentBefore.has(channel)) {
      results.push({ channel, status: "already_sent" });
      continue;
    }
    try {
      if (channel === "email") await sendGmail(documentId);
      else await sendWhatsApp(documentId);
      results.push({ channel, status: "sent" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha desconhecida no envio.";
      await record(
        documentId,
        document.data.office_id,
        channel,
        "Erro",
        message,
      );
      results.push({ channel, status: "error", error: message });
    }
  }
  const successful = results.filter(
      (result) => result.status !== "error",
    ).length,
    status =
      successful === channels.length
        ? "Enviado"
        : successful > 0
          ? "Parcial"
          : "Erro";
  await db.from("documents").update({ status }).eq("id", documentId);
  const errors = results
    .filter((result) => result.error)
    .map(
      (result) =>
        `${result.channel === "email" ? "E-mail" : "WhatsApp"}: ${result.error}`,
    );
  if (errors.length) {
    await db
      .from("alerts")
      .update({ resolved_at: new Date().toISOString() })
      .eq("document_id", documentId)
      .eq("type", "Falha de envio")
      .is("resolved_at", null);
    await db
      .from("alerts")
      .insert({
        office_id: document.data.office_id,
        document_id: documentId,
        type: "Falha de envio",
        severity: "Crítico",
        title: errors.join(" | ").slice(0, 300),
      });
  }
  const sentChannels = results
    .filter((result) => result.status !== "error")
    .map((result) => (result.channel === "email" ? "e-mail" : "WhatsApp"));
  await db
    .from("processings")
    .update({
      status: errors.length
        ? successful
          ? "Concluído parcialmente — um canal falhou"
          : "Processado — erro no envio"
        : `Concluído — enviado por ${sentChannels.join(" + ")}`,
      progress: 100,
      error_message: errors.length ? errors.join(" | ").slice(0, 500) : null,
      finished_at: new Date().toISOString(),
    })
    .eq("document_id", documentId);
  return {
    status: status.toLowerCase(),
    message: errors.length
      ? errors.join(" | ")
      : "Envio concluído com sucesso.",
    results,
  };
}
