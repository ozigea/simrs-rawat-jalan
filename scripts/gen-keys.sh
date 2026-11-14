#!/bin/sh
# Generates the RS256 key pair used for JWT (Yii signs, Node verifies). Idempotent.
# Runs inside the `keygen` compose service. Private and public keys go to separate volumes
# so the Node container only ever sees the public key. Nothing is written into the repo.
set -e
PRIVATE_DIR="${PRIVATE_KEY_DIR:-/keys/private}"
PUBLIC_DIR="${PUBLIC_KEY_DIR:-/keys/public}"
if [ -f "$PRIVATE_DIR/jwt_private.pem" ] && [ -f "$PUBLIC_DIR/jwt_public.pem" ]; then
  echo "JWT keys already present"
  exit 0
fi
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$PRIVATE_DIR/jwt_private.pem"
openssl rsa -in "$PRIVATE_DIR/jwt_private.pem" -pubout -out "$PUBLIC_DIR/jwt_public.pem"
# 82 = www-data in the php-fpm alpine image; only the signer may read the private key.
chown 82:82 "$PRIVATE_DIR/jwt_private.pem"
chmod 600 "$PRIVATE_DIR/jwt_private.pem"
chmod 644 "$PUBLIC_DIR/jwt_public.pem"
echo "JWT keys generated"
