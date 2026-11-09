import {z} from 'zod';
export const uuid=z.string().uuid(),taxId=z.string().regex(/^[0-9A-Z]{11,14}$/,'Identificador fiscal inválido.');
export const issuerInput=z.object({taxId,legalName:z.string().trim().min(2).max(200),municipalRegistration:z.string().trim().max(40).nullable().optional(),municipalityIbge:z.string().regex(/^\d{7}$/),taxRegime:z.string().trim().min(1).max(80),dpsSeries:z.string().regex(/^[A-Za-z0-9]{1,5}$/),simpleNationalOption:z.enum(['1','2','3']),simpleNationalTaxationRegime:z.enum(['1','2','3']),specialTaxRegime:z.string().regex(/^\d$/)}).strict();
export const invoiceInput=z.object({issuerId:uuid,takerId:uuid,serviceProfileId:uuid,competence:z.string().date(),amount:z.string().regex(/^\d{1,12}\.\d{2}$/),description:z.string().trim().min(3).max(2000),idempotencyKey:z.string().min(16).max(100),environment:z.literal(2).default(2)}).strict();

const decimal=z.string().regex(/^\d{1,12}\.\d{2}$/);
export const nationalDpsDraft=z.object({
 issuerId:uuid,takerId:uuid,serviceProfileId:uuid,competence:z.string().date(),
 description:z.string().trim().min(3).max(2000),amount:decimal,
 unconditionalDiscount:decimal.default('0.00'),conditionalDiscount:decimal.default('0.00'),
 serviceCountry:z.literal('BR').default('BR'),serviceMunicipalityIbge:z.string().regex(/^\d{7}$/),
 operationIndicator:z.string().trim().max(10).nullable().default(null),
 issTaxation:z.enum(['taxable','immune','export','not_incident']),
 issWithholding:z.enum(['not_withheld','withheld']),
 issRate:z.string().regex(/^\d{1,2}\.\d{2}$/).nullable().default(null),
 pisCofins:z.object({cst:z.string().max(2).nullable(),pisRate:z.string().nullable(),cofinsRate:z.string().nullable()}).nullable().default(null),
 ibsCbs:z.object({cst:z.string().min(3).max(3),classification:z.string().min(6).max(6)}).nullable().default(null),
 additionalInformation:z.string().max(2000).nullable().default(null),
 idempotencyKey:z.string().uuid(),environment:z.literal(2).default(2),
}).strict().superRefine((value,ctx)=>{if(value.issTaxation==='taxable'&&!value.issRate)ctx.addIssue({code:'custom',path:['issRate'],message:'Alíquota do ISS obrigatória para este enquadramento.'});});
