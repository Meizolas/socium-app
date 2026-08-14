-- Atualiza contas Gmail já conectadas para o novo modelo de mensagem.
update public.integration_credentials
set config = config || jsonb_build_object(
  'messageTemplate', E'Prezados,\n\nSegue(m) anexo guia(s) de imposto(s) ref. a empresa **{{cliente}}**.\n\n📅 **Data de vencimento:**\n{{vencimento}}\n\n💰 **Valor:**\n{{valor}}\n\nPedimos, por gentileza, que o pagamento seja realizado até a data informada para evitar encargos.\n\nEm caso de dúvidas, estamos à disposição.\n\nAtenciosamente,\n\n***Anselmo Júnior***\n***(77) 9 9174-0886 (zap)***\n***(77) 9 9995-4833***',
  'groupMessageTemplate', E'Prezados,\n\nSegue(m) anexo guia(s) de imposto(s) ref. a empresa **{{cliente}}**.\n\n📅 **Data de vencimento:**\n{{vencimento}}\n\n💰 **Valor:**\n{{valor}}\n\nPedimos, por gentileza, que o pagamento seja realizado até a data informada para evitar encargos.\n\nEm caso de dúvidas, estamos à disposição.\n\nAtenciosamente,\n\n***Anselmo Júnior***\n***(77) 9 9174-0886 (zap)***\n***(77) 9 9995-4833***'
)
where provider = 'gmail';
