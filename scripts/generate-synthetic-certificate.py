from datetime import datetime,timedelta,timezone
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
root=Path(__file__).resolve().parents[1]/'.local-data'/'fixtures';root.mkdir(parents=True,exist_ok=True)
key=rsa.generate_private_key(public_exponent=65537,key_size=2048);name=x509.Name([x509.NameAttribute(NameOID.COUNTRY_NAME,'BR'),x509.NameAttribute(NameOID.ORGANIZATION_NAME,'SOCIUM TESTE LOCAL'),x509.NameAttribute(NameOID.COMMON_NAME,'Empresa Sintética 11222333000181')]);now=datetime.now(timezone.utc)
cert=x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(days=1)).not_valid_after(now+timedelta(days=365)).sign(key,hashes.SHA256())
(root/'synthetic.pfx').write_bytes(pkcs12.serialize_key_and_certificates(b'synthetic-local',key,cert,None,serialization.BestAvailableEncryption(b'Synthetic-2026!')))
