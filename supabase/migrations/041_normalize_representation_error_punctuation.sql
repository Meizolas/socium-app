-- Keeps representation errors consistent with the product's plain-text punctuation.
update nfse_representations
set last_verification_error=replace(last_verification_error,'—','-'),updated_at=now()
where last_verification_error like '%—%';
