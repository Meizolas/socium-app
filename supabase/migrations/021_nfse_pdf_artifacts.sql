alter table nfse_files drop constraint nfse_files_kind_check;
alter table nfse_files add constraint nfse_files_kind_check
check(kind in ('signed_dps','official_xml','simulated_xml','official_pdf','simulated_pdf','raw_response'));
