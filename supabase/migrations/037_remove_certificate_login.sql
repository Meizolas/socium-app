-- Removes browser login through the dedicated ICP-Brasil mTLS gateway.
-- Fiscal A1 certificate custody and NFS-e signing remain unchanged.

drop function if exists consume_certificate_auth_exchange(text);
drop function if exists activate_certificate_identity(
 uuid,uuid,text,text,text,text,text,timestamptz,timestamptz,text
);
drop function if exists consume_certificate_auth_challenge(text);

drop table if exists certificate_auth_exchanges;
drop table if exists certificate_auth_bindings;
drop table if exists certificate_auth_challenges;
