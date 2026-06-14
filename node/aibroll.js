/*
 * Shomurodov motion - AI B-Roll generatsiyasi yadrosi.
 * Rasm: Nano Banana Pro (Gemini 3 Pro Image).
 * Video: Seedance / Kling (fal.ai orqali).
 * Bu yerda so'rov quruvchilar va javob tahlilchilari (toza, sinashga oson).
 */
"use strict";

// Mavjud modellar registri (provayder-asosli, kengaytiriladigan)
var MODELS = {
  image: {
    "nano-banana-pro": "gemini-3-pro-image-preview", // Nano Banana Pro (Gemini)
    "nano-banana": "gemini-2.5-flash-image",          // oddiy Nano Banana
    "reve": "reve-image",                              // Reve AI (rasm)
  },
  video: {
    "seedance": "fal-ai/bytedance/seedance/v1/pro/text-to-video",
    "seedance-i2v": "fal-ai/bytedance/seedance/v1/pro/image-to-video",
    "kling": "fal-ai/kling-video/v2/standard/text-to-video",
    "kling-i2v": "fal-ai/kling-video/v2/standard/image-to-video",
    "veo": "fal-ai/veo3",                              // Google Veo (fal orqali)
    "veo-i2v": "fal-ai/veo3/image-to-video",
  },
};

/**
 * Transkript bo'lagidan B-Roll rasm uchun prompt quradi (o'zbek tilida).
 * Eslatma: sifatga ta'sir qilmasligi uchun mavzuga aniq, vizual ko'rsatmalar beriladi.
 */
function buildBrollImagePrompt(text, style) {
  style = style || "kinematografik, professional b-roll, vertikal 9:16, yuqori sifat, yumshoq yorug'lik";
  var clean = String(text).replace(/\s+/g, " ").trim();
  return "Quyidagi g'oyani aks ettiruvchi vertikal 9:16 formatdagi b-roll tasvir yarat: \"" +
    clean + "\". Uslub: " + style + ". Matn yozuvlari va watermark bo'lmasin.";
}


/** Nano Banana Pro (Gemini) rasm generatsiyasi so'rovi */
function buildGeminiImageRequest(prompt, opts) {
  opts = opts || {};
  var model = MODELS.image[opts.model || "nano-banana-pro"] || opts.model;
  var base = opts.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  return {
    url: base + "/models/" + model + ":generateContent?key=" + (opts.apiKey || ""),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  };
}

/** Gemini javobidan birinchi rasmni (base64) ajratadi */
function parseGeminiImage(responseText) {
  var obj = typeof responseText === "string" ? JSON.parse(responseText) : responseText;
  var cands = obj.candidates || [];
  for (var i = 0; i < cands.length; i++) {
    var parts = (cands[i].content && cands[i].content.parts) || [];
    for (var j = 0; j < parts.length; j++) {
      if (parts[j].inlineData && parts[j].inlineData.data) {
        return { base64: parts[j].inlineData.data, mime: parts[j].inlineData.mimeType || "image/png" };
      }
    }
  }
  return null;
}

/** fal.ai video generatsiyasi so'rovi (Seedance/Kling) */
function buildFalVideoRequest(prompt, opts) {
  opts = opts || {};
  var endpoint = MODELS.video[opts.model || "seedance"] || opts.model;
  var body = { prompt: prompt };
  if (opts.imageUrl) body.image_url = opts.imageUrl; // image-to-video uchun
  if (opts.duration) body.duration = opts.duration;
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  return {
    url: "https://fal.run/" + endpoint,
    headers: { "Content-Type": "application/json", "Authorization": "Key " + (opts.apiKey || "") },
    body: JSON.stringify(body),
  };
}

/** fal.ai javobidan video URL'ini ajratadi */
function parseFalVideo(responseText) {
  var obj = typeof responseText === "string" ? JSON.parse(responseText) : responseText;
  if (obj.video && obj.video.url) return obj.video.url;
  if (obj.videos && obj.videos[0] && obj.videos[0].url) return obj.videos[0].url;
  return null;
}

module.exports = {
  MODELS: MODELS,
  buildBrollImagePrompt: buildBrollImagePrompt,
  buildGeminiImageRequest: buildGeminiImageRequest,
  parseGeminiImage: parseGeminiImage,
  buildFalVideoRequest: buildFalVideoRequest,
  parseFalVideo: parseFalVideo,
};
