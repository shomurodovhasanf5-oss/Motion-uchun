# Shomurodov motion — tayyor fayl yasash (.zxp)

CEP plaginlar `.aex` emas, **`.zxp`** sifatida tarqatiladi (imzolangan, bir marta o'rnatiladigan fayl).
`.aex` = After Effects C++ SDK native plagini — bu butunlay boshqa texnologiya va bizning funksiyalar (panel, Node, ffmpeg, AI) unda ishlamaydi.

## 1. Kerakli vosita: ZXPSignCmd

Adobe'ning rasmiy imzolash vositasi (bepul):
- Yuklab oling: https://github.com/Adobe-CEP/CEP-Resources (`ZXPSignCmd`)
- Windows uchun `ZXPSignCmd.exe` ni `build/` papkasiga qo'ying.

## 2. Sertifikat yasash (bir marta)

```bat
ZXPSignCmd -selfSignedCert UZ Tashkent ShomurodovBro Hasan parol123 build\cert.p12
```

## 3. Plaginni `.zxp` ga imzolash

`build\sign.bat` ni ishga tushiring (pastda tayyor skript bor) yoki qo'lda:

```bat
ZXPSignCmd -sign . build\ShomurodovMotion.zxp build\cert.p12 parol123 -tsa http://timestamp.digicert.com
```

> `.` — plagin ildizi (manifest CSXS/ ichida bo'lishi kerak). Natija: `build\ShomurodovMotion.zxp`.

## 4. Foydalanuvchi qanday o'rnatadi

`.zxp` ni o'rnatish uchun bepul vosita:
- **Anastasiy's Extension Manager** yoki **ZXP/UXP Installer** (aescripts) — `.zxp` ni ikki marta bosib o'rnatadi.
- Yoki qo'lda: ichini ochib `AppData\Roaming\Adobe\CEP\extensions\` ga ko'chirish (README'dagi usul).

## (Ixtiyoriy) `.jsxbin` — host kodini himoyalash

`host/*.jsx` larni shifrlash (manbani yashirish) uchun:
1. Adobe **ExtendScript Toolkit (ESTK)** ni oching (Windows).
2. Har bir `.jsx` ni oching → **File → Export as Binary** → `.jsxbin` saqlang.
3. `host/index.jsx` ichidagi `$.evalFile("premiere.jsx")` ni `.jsxbin` ga moslang.

> Eslatma: `.jsxbin` faqat kodni yashiradi, ishlashni o'zgartirmaydi. ESTK Adobe muhitida ishlaydi (bu sandboxда yo'q).
