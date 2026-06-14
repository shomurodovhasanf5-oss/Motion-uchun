#!/usr/bin/env bash
# ============================================================
#  Shomurodov motion - .zxp yasash skripti (Linux / macOS)
#  Talab: ZXPSignCmd shu papkada bo'lsin (bajariladigan).
#  Ishlatish:  bash build/sign.sh
# ============================================================
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/.."
OUT="$HERE/ShomurodovMotion.zxp"
CERT="$HERE/cert.p12"
PASS="parol123"
SIGN="$HERE/ZXPSignCmd"

if [ ! -f "$CERT" ]; then
  echo "[1/2] Sertifikat yaratilmoqda..."
  "$SIGN" -selfSignedCert UZ Tashkent ShomurodovBro Hasan "$PASS" "$CERT"
fi

echo "[2/2] .zxp yasalmoqda..."
"$SIGN" -sign "$ROOT" "$OUT" "$CERT" "$PASS" -tsa http://timestamp.digicert.com

echo ""
echo "Tayyor: $OUT"
