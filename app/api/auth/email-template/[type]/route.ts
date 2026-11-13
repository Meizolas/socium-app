const templates = {
	confirmation: {
		preheader: "Confirme seu e-mail para concluir o cadastro na Helians.",
		title: "Confirme seu e-mail",
		message: "Recebemos seu cadastro. Confirme este endereço de e-mail para ativar sua conta e acessar a plataforma Helians.",
		button: "Confirmar meu e-mail",
		footer: "Se você não criou esta conta, ignore esta mensagem.",
	},
	recovery: {
		preheader: "Use este link para criar uma nova senha na Helians.",
		title: "Redefina sua senha",
		message: "Recebemos uma solicitação para alterar a senha da sua conta Helians. Use o botão abaixo para criar uma nova senha.",
		button: "Criar nova senha",
		footer: "Se você não solicitou esta alteração, ignore esta mensagem. Sua senha atual continuará válida.",
	},
} as const;  

export async function GET(_request: Request, context: { params: Promise<{ type: string }> }) {
	const { type } = await context.params;
	const content = templates[type as keyof typeof templates];
	if (!content) return new Response("Template não encontrado.", { status: 404 });
	const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${content.title}</title></head>
<body style="margin:0;padding:0;background:#f3f7fd;font-family:Arial,Helvetica,sans-serif;color:#071b45">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${content.preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f7fd">
<tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #dce6f5;border-radius:14px">
<tr><td align="center" style="padding:34px 32px 18px"><img src="https://helians.com.br/api/logo?brand=helians-v1" width="190" alt="Helians" style="display:block;width:190px;max-width:100%;height:auto;border:0"></td></tr>
<tr><td style="padding:8px 40px 36px;text-align:center">
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:#071b45">${content.title}</h1>
<p style="margin:0 0 26px;font-size:16px;line-height:1.6;color:#526685">${content.message}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td bgcolor="#0865f5" style="border-radius:8px"><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 26px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700">${content.button}</a></td></tr></table>
<p style="margin:28px 0 8px;font-size:13px;line-height:1.5;color:#71809b">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
<p style="margin:0;word-break:break-all;font-size:12px;line-height:1.5"><a href="{{ .ConfirmationURL }}" style="color:#0865f5">{{ .ConfirmationURL }}</a></p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e6edf7;text-align:center;font-size:12px;line-height:1.5;color:#71809b">${content.footer}<br>Esta é uma mensagem automática da Helians.</td></tr>
</table>
</td></tr></table>
</body></html>`;
	return new Response(html, {
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "public, max-age=300",
		},
	});
}
