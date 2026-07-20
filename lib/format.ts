export function normalizeCnpj(value:unknown){return String(value??'').replace(/\D/g,'').slice(0,14)}
