import {z} from 'zod';
export const uuid=z.string().uuid(),taxId=z.string().regex(/^[0-9A-Z]{11,14}$/,'Identificador fiscal inválido.');
export const issuerInput=z.object({taxId,legalName:z.string().trim().min(2).max(200),municipalRegistration:z.string().trim().max(40).nullable().optional(),municipalityIbge:z.string().regex(/^\d{7}$/),taxRegime:z.string().trim().min(1).max(80),dpsSeries:z.string().regex(/^[A-Za-z0-9]{1,5}$/)}).strict();
export const invoiceInput=z.object({issuerId:uuid,takerId:uuid,serviceProfileId:uuid,competence:z.string().date(),amount:z.string().regex(/^\d{1,12}\.\d{2}$/),description:z.string().trim().min(3).max(2000),idempotencyKey:z.string().min(16).max(100),environment:z.literal(2).default(2)}).strict();
