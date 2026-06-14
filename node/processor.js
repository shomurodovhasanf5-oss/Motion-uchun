/*
 * Reels Montaj AI - Node backend (CEP ichida ishlaydi).
 * Og'ir ishlar shu yerda: ffmpeg, transkripsiya, audio tahlil.
 * Panel JS bu modulni require qiladi (CEP Node integratsiyasi yoqilgan).
 */
"use strict";

var cp = require("child_process");
var fs = require("fs");
var path = require("path");
var os = require("os");

var RMNode = {};

/**
 * ffmpeg ijro etuvchi faylini topadi.
 * Tartib: 1) plagin ichidagi bin/ffmpeg.exe  2) tizim PATH'idagi ffmpeg
 */
RMNode.findFfmpeg = function (extensionRoot) {
  var candidates = [];
  if (extensionRoot) {
    candidates.push(path.join(extensionRoot, "bin", "win", "ffmpeg.exe"));
    candidates.push(path.join(extensionRoot, "bin", "ffmpeg.exe"));
    candidates.push(path.join(extensionRoot, "bin", "ffmpeg"));
  }
  for (var i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  // PATH'dan qidiramiz (system o'rnatilgan bo'lsa)
  return process.platform === "win32" ? "ffmpeg" : "ffmpeg";
};


/**
 * ffmpeg mavjudligini va versiyasini tekshiradi.
 * Promise<{ok, version, path}> qaytaradi.
 */
RMNode.checkFfmpeg = function (extensionRoot) {
  return new Promise(function (resolve) {
    var bin = RMNode.findFfmpeg(extensionRoot);
    cp.execFile(bin, ["-version"], function (err, stdout) {
      if (err) {
        resolve({ ok: false, path: bin, error: err.message });
        return;
      }
      var firstLine = String(stdout).split("\n")[0] || "";
      resolve({ ok: true, path: bin, version: firstLine.trim() });
    });
  });
};

/**
 * (2-bosqich uchun joy) Jim qismlarni aniqlash — silencedetect.
 * Hozircha faqat buyruqni tayyorlaydi, keyingi bosqichda to'liq ulanadi.
 */
RMNode.buildSilenceCommand = function (bin, input, noiseDb, minDur) {
  noiseDb = noiseDb || -30; // dB
  minDur = minDur || 0.4; // soniya
  return {
    bin: bin,
    args: [
      "-i", input,
      "-af", "silencedetect=noise=" + noiseDb + "dB:d=" + minDur,
      "-f", "null", "-",
    ],
  };
};


var silenceLib = require(path.join(__dirname, "silence.js"));

/**
 * Auto-Cut yadrosi: video/audiodagi jim qismlarni aniqlaydi.
 * extensionRoot - plagin papkasi (ffmpeg topish uchun)
 * input - manba fayl yo'li
 * opts  - { noiseDb, minSilence, padding, minKeep }
 * Promise<{ok, duration, silences, keep}> qaytaradi.
 */
RMNode.detectSilence = function (extensionRoot, input, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    if (!fs.existsSync(input)) {
      resolve({ ok: false, error: "Fayl topilmadi: " + input });
      return;
    }
    var bin = RMNode.findFfmpeg(extensionRoot);
    var cmd = RMNode.buildSilenceCommand(bin, input, opts.noiseDb, opts.minSilence);
    // silencedetect natijasi stderr'ga chiqadi
    var child = cp.execFile(cmd.bin, cmd.args, { maxBuffer: 1024 * 1024 * 64 },
      function (err, stdout, stderr) {
        var text = (stderr || "") + "\n" + (stdout || "");
        var duration = silenceLib.parseDuration(text);
        var silences = silenceLib.parseSilences(text);
        if (!duration && err) {
          resolve({ ok: false, error: err.message, raw: text.slice(0, 500) });
          return;
        }
        var keep = silenceLib.computeKeep(silences, duration, {
          padding: opts.padding,
          minKeep: opts.minKeep,
          minSilence: opts.minSilence,
        });
        resolve({ ok: true, duration: duration, silences: silences, keep: keep });
      });
    child.on("error", function (e) { resolve({ ok: false, error: e.message }); });
  });
};

// Modul sifatida eksport (CEP panel require qiladi)
if (typeof module !== "undefined" && module.exports) {
  module.exports = RMNode;
}

// --- O'z-o'zini tekshirish (CLI): node node/processor.js --selftest ---
if (require.main === module && process.argv.indexOf("--selftest") !== -1) {
  console.log("[selftest] RMNode yuklandi.");
  var fakeRoot = path.join(__dirname, "..");
  console.log("[selftest] ffmpeg nomzodi:", RMNode.findFfmpeg(fakeRoot));
  var cmd = RMNode.buildSilenceCommand("ffmpeg", "test.mp4");
  console.log("[selftest] silence buyrug'i:", cmd.bin, cmd.args.join(" "));
  RMNode.checkFfmpeg(fakeRoot).then(function (r) {
    console.log("[selftest] ffmpeg tekshiruvi:", JSON.stringify(r));
    console.log("[selftest] OK");
  });
}


// ===== 3-bosqich: Transkripsiya + tarjima =====
var srtLib = require(path.join(__dirname, "srt.js"));
var trLib = require(path.join(__dirname, "transcribe.js"));
var translateLib = require(path.join(__dirname, "translate.js"));

/** ffmpeg'ni ishga tushirib, fayl chiqishini kutadi */
function runFfmpeg(bin, args) {
  return new Promise(function (resolve, reject) {
    cp.execFile(bin, args, { maxBuffer: 1024 * 1024 * 64 }, function (err) {
      if (err) reject(err); else resolve(true);
    });
  });
}

/** Offline transkripsiya: ffmpeg WAV → whisper.cpp → segmentlar */
function transcribeOffline(root, input, opts) {
  return new Promise(function (resolve) {
    var whisper = trLib.findWhisper(root);
    var model = trLib.findModel(root, opts.model);
    if (!whisper) return resolve({ ok: false, error: "whisper.cpp topilmadi (bin/win/)" });
    if (!model) return resolve({ ok: false, error: "Model topilmadi (models/ggml-*.bin)" });

    var ff = RMNode.findFfmpeg(root);
    var tmp = path.join(os.tmpdir(), "rm_" + Date.now());
    var wav = tmp + ".wav";
    runFfmpeg(ff, trLib.buildWavExtractArgs(input, wav))
      .then(function () {
        return new Promise(function (res, rej) {
          cp.execFile(whisper, trLib.buildWhisperArgs(model, wav, opts.language, tmp),
            { maxBuffer: 1024 * 1024 * 128 }, function (e) { e ? rej(e) : res(); });
        });
      })
      .then(function () {
        var jsonPath = tmp + ".json";
        var data = fs.readFileSync(jsonPath, "utf8");
        var segs = srtLib.fromWhisperCppJson(data);
        try { fs.unlinkSync(wav); fs.unlinkSync(jsonPath); } catch (e) {}
        resolve({ ok: true, segments: segs, engine: "whisper.cpp" });
      })
      .catch(function (e) { resolve({ ok: false, error: e.message }); });
  });
}


/** Umumiy HTTPS so'rov: Promise<{status, text}> */
function httpRequest(method, urlStr, headers, body) {
  return new Promise(function (resolve, reject) {
    var https = require("https");
    var u = require("url").parse(urlStr);
    var opt = {
      method: method, hostname: u.hostname, path: u.path,
      port: u.port || 443, headers: headers || {},
    };
    var req = https.request(opt, function (res) {
      var chunks = [];
      res.on("data", function (d) { chunks.push(d); });
      res.on("end", function () {
        resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Audio faylni multipart/form-data sifatida o'rab beradi */
function buildMultipart(filePath, fields) {
  var boundary = "----RMBoundary" + Date.now();
  var parts = [];
  for (var k in fields) {
    if (fields[k] == null) continue;
    parts.push(Buffer.from(
      "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + k + "\"\r\n\r\n" +
      fields[k] + "\r\n"));
  }
  var fileBuf = fs.readFileSync(filePath);
  parts.push(Buffer.from(
    "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" +
    path.basename(filePath) + "\"\r\nContent-Type: application/octet-stream\r\n\r\n"));
  parts.push(fileBuf);
  parts.push(Buffer.from("\r\n--" + boundary + "--\r\n"));
  return { body: Buffer.concat(parts), boundary: boundary };
}


/** Online transkripsiya: ffmpeg WAV → API (multipart) → segmentlar */
function transcribeOnline(root, input, opts) {
  var info = trLib.buildApiRequestInfo(opts);
  var ff = RMNode.findFfmpeg(root);
  var wav = path.join(os.tmpdir(), "rm_" + Date.now() + ".wav");
  return runFfmpeg(ff, trLib.buildWavExtractArgs(input, wav)).then(function () {
    var mp = buildMultipart(wav, {
      model: info.model,
      language: info.language,
      response_format: info.responseFormat,
    });
    var headers = {
      "Authorization": info.headers.Authorization,
      "Content-Type": "multipart/form-data; boundary=" + mp.boundary,
      "Content-Length": mp.body.length,
    };
    return httpRequest("POST", info.url, headers, mp.body);
  }).then(function (res) {
    try { fs.unlinkSync(wav); } catch (e) {}
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: "API " + res.status + ": " + res.text.slice(0, 200) };
    }
    return { ok: true, segments: srtLib.fromApiSegments(res.text), engine: "api" };
  }).catch(function (e) { return { ok: false, error: e.message }; });
}

/**
 * Transkripsiya (asosiy kirish nuqtasi).
 * opts: { mode:'offline'|'online', language, model, apiKey, baseUrl }
 */
RMNode.transcribe = function (root, input, opts) {
  opts = opts || {};
  if (!fs.existsSync(input)) return Promise.resolve({ ok: false, error: "Fayl yo'q: " + input });
  return opts.mode === "online"
    ? transcribeOnline(root, input, opts)
    : transcribeOffline(root, input, opts);
};


/**
 * Segmentlarni tarjima qiladi (online LLM).
 * opts: { targetLang, apiKey, baseUrl, model }
 */
RMNode.translateSegments = function (segments, opts) {
  opts = opts || {};
  if (!segments || !segments.length) return Promise.resolve({ ok: false, error: "Segment yo'q" });
  var info = translateLib.buildChatRequestInfo(opts);
  var prompt = translateLib.buildTranslatePrompt(segments, opts.targetLang);
  var payload = JSON.stringify({
    model: info.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });
  var headers = info.headers;
  headers["Content-Length"] = Buffer.byteLength(payload);
  return httpRequest("POST", info.url, headers, payload).then(function (res) {
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: "API " + res.status + ": " + res.text.slice(0, 200) };
    }
    var obj = JSON.parse(res.text);
    var content = obj.choices && obj.choices[0] && obj.choices[0].message.content || "";
    var texts = translateLib.parseNumbered(content, segments.length);
    return { ok: true, segments: translateLib.mergeTranslations(segments, texts) };
  }).catch(function (e) { return { ok: false, error: e.message }; });
};

/** Segmentlardan SRT fayl yozadi, yo'lini qaytaradi */
RMNode.writeSrt = function (segments, outPath) {
  fs.writeFileSync(outPath, srtLib.buildSrt(segments), "utf8");
  return outPath;
};


// ===== 4-bosqich: Ovozni tekislash (loudness -14 LUFS) =====
var audioLib = require(path.join(__dirname, "audio.js"));

/** ffmpeg'ni ishga tushirib, stderr matnini qaytaradi (loudnorm o'lchovi uchun) */
function runFfmpegCapture(bin, args) {
  return new Promise(function (resolve, reject) {
    cp.execFile(bin, args, { maxBuffer: 1024 * 1024 * 64 }, function (err, stdout, stderr) {
      // loudnorm null-muxer bilan tugaydi; xato bo'lsa ham stderr'da JSON bo'lishi mumkin
      resolve((stderr || "") + "\n" + (stdout || ""));
    });
  });
}

/**
 * Ovozni -14 LUFS ga keltiradi (ikki bosqichli loudnorm) va yangi faylga yozadi.
 * Promise<{ok, outPath, summary}> qaytaradi.
 */
RMNode.normalizeLoudness = function (root, input, outPath, target) {
  if (!fs.existsSync(input)) return Promise.resolve({ ok: false, error: "Fayl yo'q: " + input });
  var ff = RMNode.findFfmpeg(root);
  return runFfmpegCapture(ff, audioLib.buildMeasureArgs(input, target))
    .then(function (text) {
      var measured = audioLib.parseLoudnormJson(text);
      if (!measured) throw new Error("Loudness o'lchanmadi (ffmpeg loudnorm JSON yo'q)");
      var args = audioLib.buildNormalizeArgs(input, measured, outPath, target);
      return runFfmpeg(ff, args).then(function () {
        return { ok: true, outPath: outPath, summary: audioLib.summarize(measured, target) };
      });
    })
    .catch(function (e) { return { ok: false, error: e.message }; });
};


// ===== 5-bosqich: A-Roll / B-Roll =====
var abLib = require(path.join(__dirname, "abroll.js"));

/** Bitta klipning nutq ulushini hisoblaydi (silence tahlilidan) */
function analyzeOneClip(root, clip) {
  return RMNode.detectSilence(root, clip.path, {}).then(function (det) {
    if (!det.ok || !det.duration) {
      return { name: clip.name, path: clip.path, duration: clip.duration || 0, speechRatio: 0 };
    }
    var speech = (det.keep || []).reduce(function (s, k) { return s + (k.end - k.start); }, 0);
    return {
      name: clip.name, path: clip.path,
      duration: det.duration,
      speechRatio: Math.min(1, speech / det.duration),
    };
  });
}

/** Kliplarni ketma-ket tahlil qiladi (nutq ulushi) */
function analyzeClips(root, clips) {
  var out = [];
  return clips.reduce(function (p, c) {
    return p.then(function () {
      return analyzeOneClip(root, c).then(function (r) { out.push(r); });
    });
  }, Promise.resolve()).then(function () { return out; });
}

/**
 * A/B-Roll rejasini tuzadi: tahlil → ajratish → B-Roll joylashuvi.
 * clips: [{name, path, duration}]
 * opts: { speechThreshold, segments (online uchun) }
 * Eslatma: online aqlli joylash UI'da translateSegments kabi alohida chaqiriladi.
 */
RMNode.planAB = function (root, clips, opts) {
  opts = opts || {};
  return analyzeClips(root, clips).then(function (analyzed) {
    var pathByName = {};
    analyzed.forEach(function (a) { pathByName[a.name] = a.path; });
    var classed = abLib.classifyClips(analyzed, opts);
    var aroll = classed.filter(function (c) { return c.role === "A"; });
    var broll = classed.filter(function (c) { return c.role === "B"; });
    aroll.forEach(function (c) { c.path = pathByName[c.name]; });
    broll.forEach(function (c) { c.path = pathByName[c.name]; });
    var arollDur = aroll.reduce(function (s, c) { return s + (c.duration || 0); }, 0);
    var placements = abLib.distributeBroll(arollDur, broll, opts);
    placements.forEach(function (p) { p.path = pathByName[p.name]; });
    return { ok: true, aroll: aroll, broll: broll, arollDuration: arollDur, placements: placements };
  });
};


// ===== AI B-Roll generatsiyasi (Nano Banana Pro / Seedance / Kling / Veo) =====
var aiLib = require(path.join(__dirname, "aibroll.js"));

/** URL'dan faylga yuklab oladi (redirect'larni kuzatadi) */
function downloadFile(url, outPath, redirects) {
  redirects = redirects || 0;
  return new Promise(function (resolve, reject) {
    if (redirects > 5) return reject(new Error("Juda ko'p redirect"));
    var https = require("https");
    https.get(url, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadFile(res.headers.location, outPath, redirects + 1));
      }
      if (res.statusCode !== 200) return reject(new Error("Yuklab olishda xato: " + res.statusCode));
      var file = fs.createWriteStream(outPath);
      res.pipe(file);
      file.on("finish", function () { file.close(function () { resolve(outPath); }); });
      file.on("error", reject);
    }).on("error", reject);
  });
}

/** Nano Banana Pro (Gemini) bilan B-Roll rasm yaratadi → fayl yo'li */
RMNode.generateBrollImage = function (prompt, outPath, opts) {
  opts = opts || {};
  var req = aiLib.buildGeminiImageRequest(prompt, opts);
  var headers = req.headers;
  headers["Content-Length"] = Buffer.byteLength(req.body);
  return httpRequest("POST", req.url, headers, req.body).then(function (res) {
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: "Gemini " + res.status + ": " + res.text.slice(0, 200) };
    }
    var img = aiLib.parseGeminiImage(res.text);
    if (!img) return { ok: false, error: "Rasm qaytmadi" };
    fs.writeFileSync(outPath, Buffer.from(img.base64, "base64"));
    return { ok: true, path: outPath };
  }).catch(function (e) { return { ok: false, error: e.message }; });
};


/** Seedance/Kling/Veo (fal.ai) bilan B-Roll video yaratadi → fayl yo'li */
RMNode.generateBrollVideo = function (prompt, outPath, opts) {
  opts = opts || {};
  var req = aiLib.buildFalVideoRequest(prompt, opts);
  var headers = req.headers;
  headers["Content-Length"] = Buffer.byteLength(req.body);
  return httpRequest("POST", req.url, headers, req.body).then(function (res) {
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: "fal " + res.status + ": " + res.text.slice(0, 200) };
    }
    var videoUrl = aiLib.parseFalVideo(res.text);
    if (!videoUrl) return { ok: false, error: "Video URL qaytmadi" };
    return downloadFile(videoUrl, outPath).then(function () {
      return { ok: true, path: outPath };
    });
  }).catch(function (e) { return { ok: false, error: e.message }; });
};

/**
 * Bir nechta segment uchun B-Roll yaratadi (rasm yoki video).
 * segments: [{start, text}]  opts: { kind:'image'|'video', model, apiKey, falKey, style, max }
 * Qaytadi: { ok, items: [{ at, path, prompt }] }
 */
RMNode.generateBrollSet = function (root, segments, opts) {
  opts = opts || {};
  var kind = opts.kind || "image";
  var max = opts.max || 4;
  var folder = path.join(os.tmpdir(), "rm_broll_" + Date.now());
  try { fs.mkdirSync(folder); } catch (e) {}
  // Segmentlardan teng tanlab olamiz
  var picked = pickEvenly(segments, max);
  var items = [];
  return picked.reduce(function (p, seg, i) {
    return p.then(function () {
      var prompt = aiLib.buildBrollImagePrompt(seg.text, opts.style);
      if (kind === "video") {
        var vp = path.join(folder, "broll_" + (i + 1) + ".mp4");
        return RMNode.generateBrollVideo(prompt, vp, { model: opts.model, apiKey: opts.falKey, aspectRatio: "9:16", duration: opts.duration || 5 })
          .then(function (r) { if (r.ok) items.push({ at: seg.start, path: r.path, prompt: prompt }); });
      }
      var ip = path.join(folder, "broll_" + (i + 1) + ".png");
      return RMNode.generateBrollImage(prompt, ip, { model: opts.model || "nano-banana-pro", apiKey: opts.apiKey })
        .then(function (r) { if (r.ok) items.push({ at: seg.start, path: r.path, prompt: prompt }); });
    });
  }, Promise.resolve()).then(function () { return { ok: true, items: items, folder: folder }; });
};

/** Massivdan teng oraliqda n ta element tanlaydi */
function pickEvenly(arr, n) {
  if (arr.length <= n) return arr.slice();
  var out = [], step = arr.length / n;
  for (var i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}
