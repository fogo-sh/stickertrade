access_key := env_var('MINIO_ACCESS_KEY')
secret_key := env_var('MINIO_SECRET_KEY')

setup-minio-alias:
  mc alias set stickertrade-prod https://files.stickertrade.ca "{{access_key}}" "{{secret_key}}"
