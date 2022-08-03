access_key := env_var_or_default('MINIO_ACCESS_KEY', '')
secret_key := env_var_or_default('MINIO_SECRET_KEY', '')

setup-minio-alias:
  mc alias set stickertrade-prod https://files.stickertrade.ca "{{access_key}}" "{{secret_key}}"

copy-stickers-from-prod:
  rm -rf ./tmp/stickers-from-prod
  mc cp stickertrade-prod/stickers/ ./tmp/stickers-from-prod -r

open-gthumb-in-stickers-from-prod:
  gthumb ./tmp/stickers-from-prod

copy-stickers-to-prod:
  for file in `ls ./tmp/stickers-from-prod/*`; do \
    mc cp $file stickertrade-prod/stickers; \
  done
