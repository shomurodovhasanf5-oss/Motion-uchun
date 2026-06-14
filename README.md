# Shomurodov motion

> **shomurodov_bro** · Premiere Pro va After Effects (2020+, Windows) uchun reels montajini yarim-avtomatlashtiruvchi CEP plagini.

Maqsad: montajni "qora quti" qilmaslik. Plagin ishni tayyorlaydi, natija **alohida, nomli layer/track** bo'lib chiqadi — siz hammasini o'zgartira olasiz. Har bir jarayonda panelда holat yozuvi ko'rinadi (masalan "ovoz tozalanmoqda…").

## Bosqichlar (roadmap)

1. **Auto-Cut** — jim/keraksiz qismlarni kesish (ffmpeg silencedetect)
2. **Subtitr + Tarjima** — UZ/RU/EN → matn → istalgan tilga (Whisper offline / API online)
3. **Ovozni tekislash** — loudness -14 LUFS, kanallarni sozlash
4. **A-Roll / B-Roll** — ajratish va joylash (+ AI generatsiya)
5. **Motion presetlar** — silliq, mavzuga mos (After Effects)

## AI B-Roll generatsiyasi (yangi)

Transkript mazmuniga qarab B-Roll kadrlarni AI bilan yaratish (`node/aibroll.js`, provayder-asosli):
- **Rasm:** Nano Banana Pro (`gemini-3-pro-image-preview`, Google Gemini API)
- **Video:** Seedance / Kling (fal.ai orqali, `FAL_KEY`)
- Prompt transkript bo'lagidan avtomatik tuziladi → 9:16 vertikal.

> So'rov quruvchilar/tahlilchilar unit-test bilan tekshirilgan. To'liq ulash uchun API kalitlar kerak (pastga qarang).

> Hozir **1-bosqich (poydevor)** tayyor: panel ikkala dasturda ochiladi, host bilan aloqa qiladi.

## Tuzilma

```
reels-montaj-ai/
├─ CSXS/manifest.xml      # Plagin manifesti (PPRO + AEFT, 2020+)
├─ .debug                 # Debug portlari
├─ client/                # Panel UI (HTML/CSS/JS)
│  ├─ index.html
│  ├─ css/styles.css
│  ├─ js/main.js          # Panel mantiqi
│  └─ js/lib/CSInterface.js
├─ host/                  # ExtendScript (host tomon)
│  ├─ index.jsx           # Kirish: host turini aniqlaydi
│  ├─ common.jsx          # RM namespace, ping()
│  ├─ premiere.jsx
│  ├─ aftereffects.jsx
│  └─ lib/json2.jsx
├─ node/processor.js      # ffmpeg/AI backend (CEP Node)
└─ bin/win/ffmpeg.exe     # (siz qo'shasiz — pastga qarang)
```


## O'rnatish (Windows) — ishlab chiqish rejimi

### 1. Debug rejimini yoqish (bir marta)

`Win + R` → `regedit` → quyidagi kalitga `PlayerDebugMode` (String) = `1` qo'shing.
CEP versiyasi Adobe ilovasiga bog'liq — har biriga alohida:

```
HKEY_CURRENT_USER\Software\Adobe\CSXS.9   →  PlayerDebugMode = 1
HKEY_CURRENT_USER\Software\Adobe\CSXS.10  →  PlayerDebugMode = 1
HKEY_CURRENT_USER\Software\Adobe\CSXS.11  →  PlayerDebugMode = 1
HKEY_CURRENT_USER\Software\Adobe\CSXS.12  →  PlayerDebugMode = 1
```

> 2020 = CSXS.9, 2021 = CSXS.10, 2022 = CSXS.11, 2023+ = CSXS.11/12. Hammasini qo' shsangiz bemalol.

### 2. Plaginni joylashtirish

Butun `reels-montaj-ai` papkasini quyidagiga ko'chiring:

```
C:\Users\<siz>\AppData\Roaming\Adobe\CEP\extensions\reels-montaj-ai
```

(`extensions` papkasi bo'lmasa — yarating.)

### 3. ffmpeg qo'shish

[ffmpeg.org](https://ffmpeg.org/download.html) dan Windows build oling va `ffmpeg.exe` ni:

```
reels-montaj-ai\bin\win\ffmpeg.exe
```

ichiga joylashtiring. (Yoki tizim PATH'iga qo'shsangiz ham topadi.)

### 4. Ishga tushirish

Premiere/AE ni qayta oching → menyu: **Window → Extensions → Reels Montaj AI**.

Panel ochilgach **"Host bilan aloqani tekshirish"** tugmasini bosing — jurналда host nomi va versiyasi chiqishi kerak.

## Foydalanish — Auto-Cut (2-bosqich)

1. Premiere'da klipingizni timeline'ga qo'ying va **klipni belgilang (tanlang)**.
2. Panelda **1-qadam: Auto-Cut** tugmasini bosing.
3. Plagin: tanlangan klip faylini ffmpeg bilan tahlil qiladi (jim qismlar) → saqlanadigan (nutq) bo'laklarni hisoblaydi → **yangi `... - AutoCut` sequence** yasab, bo'laklarni ketma-ket joylaydi.
4. **Asl montajingiz tegilmaydi.** Har bo'lak alohida klip — erkin tahrirlaysiz. `Ctrl+Z` bilan qaytarish mumkin.

### Sozlash (hozircha `client/js/main.js` ichidagi `settings`)

| Parametr | Ma'nosi | Default |
|---|---|---|
| `noiseDb` | shovqin chegarasi (dB), pastroq = qattiqroq kesadi | -30 |
| `minSilence` | shundan uzun jimliklar kesiladi (soniya) | 0.4 |
| `padding` | nutq atrofidagi zaxira (nafasni saqlash) | 0.08 |
| `minKeep` | shundan qisqa bo'laklar tashlanadi | 0.25 |

> **Sinov kerak:** Auto-Cut'ning Premiere DOM qismi (`createSubClip`, `createNewSequenceFromClips`) haqiqiy Premiere'da sinalishi kerak — sandboxda Adobe yo'q. ffmpeg tahlil mantiqi unit-test bilan tekshirilgan.

## Foydalanish — Subtitr + Tarjima (3-bosqich)

1. ⚙ **Sozlamalar**dan manba tilni (auto/uz/ru/en), tarjima kerak bo'lsa tilini va (online uchun) **API kalit**ni kiriting.
2. Premiere'da klipni belgilang **yoki** AE'da comp'ni oching (matnli/footage layeri bo'lsin).
3. **2-qadam: Subtitr + Tarjima** tugmasini bosing.
4. Natija:
   - **After Effects:** har bir subtitr — alohida, tahrirlanadigan matn layeri (`Sub 1`, `Sub 2`…), pastki markazda, oq matn + qora kontur.
   - **Premiere:** `.srt` fayl yasaladi va `RM-Subtitles` binga import qilinadi — caption trekiga tortib qo'yasiz.

### Offline (Whisper) o'rnatish

1. [whisper.cpp](https://github.com/ggml-org/whisper.cpp) ning Windows build'ini oling → `bin/win/whisper-cli.exe` ga qo'ying.
2. Model yuklang (masalan `ggml-medium.bin` — ko'p tilli, yaxshi sifat) → `models/ggml-medium.bin`.
   - Kichik/tez: `ggml-base.bin`. Aniqroq: `ggml-large-v3.bin` (kattaroq, sekinroq).
3. Sozlamalarda model nomini ko'rsating (bo'sh qoldirsangiz `models/` ichidagi birinchisi olinadi).

> **Offline tarjima cheklovi:** whisper.cpp faqat **inglizchaga** tarjima qiladi. UZ→RU kabi boshqa yo'nalishlar uchun **Online (AI)** rejim kerak.

### Online (AI) rejim

- ⚙ Sozlamalarda API kalitni kiriting (OpenAI-mos `whisper-1` + tarjima uchun `gpt-4o-mini`).
- Maxsus provayder ishlatsangiz "Maxsus API manzili"ni to'ldiring.

> **Sinov kerak:** transkripsiya/tarjima mantiqi (SRT yasash, parse, segment formatlari) unit-test bilan tekshirilgan. Lekin ffmpeg/whisper/tarmoq sandboxda yo'q, host (AE/Premiere) qismi haqiqiy Adobe'da sinalishi kerak.

## Foydalanish — Ovozni tekislash (4-bosqich)

1. Premiere'da ovozli klipni belgilang.
2. **3-qadam: Ovozni tekislash** tugmasini bosing.
3. Plagin ovozni ikki bosqichli `loudnorm` bilan **-14 LUFS** (reels/ijtimoiy tarmoq standarti, TP -1.5 dB) ga keltiradi, yangi fayl yasaydi va uni **`Voice` audio trekiga** joylaydi.
4. **Asl ovoz tegilmaydi** — yangi trekni o'chirib/yoqib solishtirishingiz mumkin. Jurnalда "asl → maqsad" LUFS ko'rsatiladi.

> Trek nomlari `Voice` / `Music` / `SFX` — keyingi bosqichlarda music va SFX ham shu tizimga ulanadi. Kanal: stereo 48kHz, AAC 256k.

## Foydalanish — A-Roll / B-Roll (5-bosqich)

1. Premiere timeline'da barcha kerakli kliplarni belgilang (A-Roll va B-Roll aralash).
2. **4-qadam: A-Roll / B-Roll** tugmasini bosing.
3. Plagin har klipning **nutq ulushini** o'lchaydi va ajratadi:
   - Nutq ko'p + uzun → **A-Roll** (gapiruvchi kadr).
   - Nutq kam / qisqa → **B-Roll** (qoplama).
   - Fayl nomida `broll`, `cam1`, `talk`, `overlay` kabi belgilar bo'lsa, ular ustun turadi.
4. Yangi sequence yasaydi: **A-Roll → V1** ketma-ket, **B-Roll → V2** ustki qatlamga teng taqsimlangan holda.
5. **Asl montaj tegilmaydi.** Har klip alohida — B-Roll joyini, uzunligini erkin o'zgartirasiz.

> **Hozircha:** B-Roll teng taqsimlanadi (offline). Keyinroq online rejimda transkript mazmuni bo'yicha **aqlli joylash** (`buildBrollPrompt`/`parseBrollPlan` tayyor) ulanadi.

## Foydalanish — Motion presetlar (6-bosqich, After Effects)

1. AE'da comp oching va animatsiya qilmoqchi bo'lgan **layer(lar)ni belgilang**.
2. **5-qadam: Motion presetlar** tugmasini bosing — preset ro'yxati ochiladi.
3. Animatsiya uzunligini tanlang va presetni bosing:
   - **Fade In** — silliq paydo bo'lish
   - **Pop In** — kichikdan kattaga (scale)
   - **Slide ← / → / ↑** — yo'nalishdan kirish
   - **Smooth Zoom** — sekin yaqinlashish (Ken Burns)
   - **Fade Out** — oxirida yo'qolish
4. Hamma animatsiya **silliq bezier easing** bilan qo'llanadi. Natija — oddiy keyframelar: AE'da grafik egri (graph editor) orqali erkin tahrirlaysiz.

> Yangi preset qo'shish oson: `host/aftereffects.jsx` ichida `listMotionPresets`ga qator qo'shing va `RM_applyOne`ga mantiqini yozing.

## Foydalanish — AI B-Roll generatsiya

Agar A/B-Roll bosqichida **B-Roll klip topilmasa** va rejim **Online** bo'lsa hamda kalit kiritilgan bo'lsa, plagin B-Roll'ni AI bilan **o'zi yaratadi**:

1. ⚙ Sozlamalar → **Gemini kalit** (rasm) va/yoki **fal.ai kalit** (video), B-Roll turini tanlang.
2. Online rejimni yoqing, A-Roll klipni belgilang, **A-Roll / B-Roll** tugmasini bosing.
3. Plagin A-Roll matnini o'qiydi → mavzuga mos promptlar (o'zbekcha) tuzadi → Nano Banana Pro (rasm) yoki Seedance/Kling/Veo (video) bilan kadrlar yaratadi → **V2 trekiga** joylaydi.

> Promptlar o'zbek tilida, lekin aniq vizual ko'rsatmalar bilan — sifat pasaymaydi. Har bir B-Roll alohida klip: joyini, uzunligini erkin o'zgartirasiz.

> **Eslatma:** bu modellarning rasmiy bepul API'si yo'q — kalit (fal.ai / Gemini) kerak. Generatsiya internet va kalit talab qiladi.

## Loyiha holati

Barcha 6 bosqich kodlandi. ffmpeg tahlil, SRT, audio, A/B-Roll mantiqi **unit-test** bilan tekshirilgan. Host (Premiere/AE) qismlari haqiqiy Adobe'da sinashni talab qiladi (sandboxda Adobe yo'q).

**Tavsiya etilgan ish tartibi (reels):**
1. Auto-Cut → 2. Subtitr+Tarjima → 3. Ovoz → 4. A/B-Roll (Premiere) → 5. Motion (AE).
