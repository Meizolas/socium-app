import os,psycopg
url=os.getenv('LOCAL_DATABASE_URL') if os.getenv('NFSE_PROVIDER')=='simulated' else os.getenv('NFSE_DATABASE_URL')
if not url:raise SystemExit(1)
with psycopg.connect(url,connect_timeout=3) as connection:connection.execute('select 1').fetchone()
