/*
 * Reels Montaj AI - panel asosiy mantiqi (client tomon).
 * Host (Premiere/AE) bilan CSInterface orqali bog'lanadi.
 * Og'ir ishlar (ffmpeg, transkripsiya) node/ ostidagi backend'ga yuboriladi.
 */

(function () {
  "use strict";

  var cs = new CSInterface();
  var state = {
    mode: "offline", // 'offline' | 'online'
    host: null, // 'PPRO' | 'AEFT'
    busy: false,
  };

  // Auto-Cut sozlamalari (keyinroq Sozlamalar oynasiga chiqariladi)
  var settings = {
    noiseDb: -30, // shovqin chegarasi (dB) — pastroq = qattiqroq
    minSilence: 0.4, // shu davomiylikdan uzun jimliklar kesiladi (soniya)
    padding: 0.08, // nutq atrofidagi zaxira (nafasni kesmaslik uchun)
    minKeep: 0.25, // bundan qisqa bo'laklar tashlanadi
    // Transkripsiya / tarjima
    sourceLang: "auto", // auto | uz | ru | en
    translate: false, // tarjima qilinsinmi
    targetLang: "ru", // tarjima tili
    apiKey: "", // online rejim uchun
    baseUrl: "", // ixtiyoriy maxsus API manzili
    whisperModel: "", // models/ ichidagi model nomi (bo'sh = birinchisi)
    // AI B-Roll generatsiya
    geminiKey: "", // Nano Banana Pro (rasm) uchun Google Gemini kaliti
    falKey: "", // Seedance / Kling / Veo (video) uchun fal.ai kaliti
    brollKind: "image", // 'image' (Nano Banana) | 'video' (Seedance/Kling/Veo)
    brollVideoModel: "seedance", // video rejimi uchun model
  };

  // Sozlamalarni saqlash/yuklash (localStorage)
  function loadSettings() {
    try {
      var raw = window.localStorage.getItem("rm_settings");
      if (raw) { var o = JSON.parse(raw); for (var k in o) settings[k] = o[k]; }
    } catch (e) {}
  }
  function saveSettings() {
    try { window.localStorage.setItem("rm_settings", JSON.stringify(settings)); } catch (e) {}
  }

  // Node backend (faqat CEP ichida mavjud)
  var backend = null;
  function getBackend() {
    if (backend) return backend;
    try {
      var root = cs.getSystemPath(SystemPath.EXTENSION);
      backend = require(root + "/node/processor.js");
      backend.__root = root;
      return backend;
    } catch (e) {
      log("Node backend yuklanmadi: " + e.message, "err");
      return null;
    }
  }

  // --- DOM yordamchilari ---
  var $ = function (sel) { return document.querySelector(sel); };
  var logBox = $("#logBox");

  function log(msg, level) {
    level = level || "info";
    var time = new Date().toLocaleTimeString();
    var line = document.createElement("div");
    line.className = "log-" + level;
    line.textContent = "[" + time + "] " + msg;
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
  }

  function setStatus(text, kind) {
    $("#statusText").textContent = text;
    var dot = $("#statusDot");
    dot.className = "dot" + (kind ? " " + kind : "");
  }

  // Jarayon bosqichini ko'rsatadi (katta holat matni + sariq nuqta)
  function setStage(text) {
    setStatus(text, "busy");
  }

  function setProgress(pct) {
    $("#progressBar").style.width = Math.max(0, Math.min(100, pct)) + "%";
  }

  function setBusy(isBusy) {
    state.busy = isBusy;
    document.querySelectorAll(".step-card").forEach(function (b) { b.disabled = isBusy; });
    setStatus(isBusy ? "Ishlanmoqda…" : "Tayyor.", isBusy ? "busy" : "");
  }

  // --- Host aniqlash ---
  function detectHost() {
    try {
      var env = cs.getHostEnvironment();
      state.host = env.appId; // 'PPRO' yoki 'AEFT'
      var name = state.host === "PPRO" ? "Premiere Pro" : state.host === "AEFT" ? "After Effects" : env.appId;
      $("#hostBadge").textContent = "— " + name + " " + env.appVersion;
      log("Host aniqlandi: " + name + " (" + env.appId + " " + env.appVersion + ")", "ok");
      return true;
    } catch (e) {
      $("#hostBadge").textContent = "— brauzer test rejimi";
      log("Host topilmadi. Brauzer test rejimida ishlayapsiz.", "warn");
      return false;
    }
  }

  // --- ExtendScript chaqiruvchi (Promise) ---
  function evalES(script) {
    return new Promise(function (resolve, reject) {
      if (!window.__adobe_cep__) {
        reject(new Error("CEP muhiti yo'q (brauzer test rejimi)"));
        return;
      }
      cs.evalScript(script, function (res) {
        if (res === "EvalScript error.") {
          reject(new Error("ExtendScript xatosi: " + script.slice(0, 60)));
        } else {
          resolve(res);
        }
      });
    });
  }

  // --- Amallar (hozircha skelet — keyingi bosqichlarda to'ldiriladi) ---
  var actions = {
    autocut: function () {
      return runAutoCut();
    },
    transcribe: function () {
      return runTranscribe();
    },
    audio: function () {
      return runNormalizeAudio();
    },
    abroll: function () {
      return runABRoll();
    },
    motion: function () {
      return openMotion();
    },
  };

  function callHostFn(fnCall, label) {
    setBusy(true);
    setProgress(20);
    return evalES(fnCall + "()")
      .then(function (res) {
        setProgress(100);
        log((label || "Host") + " → " + res, "ok");
        setStatus("Bajarildi.", "ok");
      })
      .catch(function (err) {
        log((label || "Host") + " xato: " + err.message, "err");
        setStatus("Xato.", "err");
      })
      .then(function () {
        setBusy(false);
        setTimeout(function () { setProgress(0); }, 800);
      });
  }

  // --- Auto-Cut to'liq oqimi (2-bosqich) ---
  function runAutoCut() {
    if (state.host !== "PPRO") {
      log("Auto-Cut hozircha Premiere Pro uchun. After Effects'da emas.", "warn");
      return Promise.resolve();
    }
    var be = getBackend();
    if (!be) return Promise.resolve();

    setBusy(true);
    setProgress(10);
    setStage("Klip aniqlanmoqda…");
    log("Tanlangan klip aniqlanmoqda…", "info");

    var clip = null;
    return evalES("RM.ppro.getSelectedClip()")
      .then(function (res) {
        clip = JSON.parse(res);
        if (!clip.ok) throw new Error(clip.error);
        log("Klip: " + clip.name, "ok");
        log("Tahlil (ffmpeg)… jim qismlar qidirilmoqda.", "info");
        setProgress(35);
        setStage("Jim qismlar tahlil qilinmoqda…");
        return be.detectSilence(be.__root, clip.path, {
          noiseDb: settings.noiseDb,
          minSilence: settings.minSilence,
          padding: settings.padding,
          minKeep: settings.minKeep,
        });
      })
      .then(function (det) {
        if (!det.ok) throw new Error(det.error || "Tahlil muvaffaqiyatsiz");
        log("Topildi: " + det.silences.length + " ta jimlik, " +
            det.keep.length + " ta saqlanadigan bo'lak.", "ok");
        if (!det.keep.length) throw new Error("Saqlanadigan bo'lak topilmadi");
        setProgress(65);
        log("Premiere'da yangi 'AutoCut' sequence yasalmoqda…", "info");
        setStage("Kesilmoqda va yangi sequence yasalmoqda…");
        var plan = { sourceName: clip.name, keep: det.keep };
        var arg = JSON.stringify(plan).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return evalES('RM.ppro.applyAutoCut("' + arg + '")');
      })
      .then(function (res) {
        var out = JSON.parse(res);
        if (!out.ok) throw new Error(out.error);
        setProgress(100);
        log("Tayyor! '" + out.sequence + "' (" + out.clips + " bo'lak). Asl montaj tegilmadi.", "ok");
        setStatus("Auto-Cut bajarildi.", "ok");
      })
      .catch(function (err) {
        log("Auto-Cut xato: " + err.message, "err");
        setStatus("Xato.", "err");
      })
      .then(function () {
        setBusy(false);
        setTimeout(function () { setProgress(0); }, 1000);
      });
  }

  // --- Transkripsiya + tarjima oqimi (3-bosqich) ---
  function getSourcePath() {
    if (state.host === "PPRO") {
      return evalES("RM.ppro.getSelectedClip()").then(function (r) {
        var o = JSON.parse(r);
        if (!o.ok) throw new Error(o.error);
        return { path: o.path, name: o.name };
      });
    }
    return evalES("RM.aeft.getActiveSourcePath()").then(function (r) {
      var o = JSON.parse(r);
      if (!o.ok) throw new Error(o.error);
      return { path: o.path, name: o.name };
    });
  }

  function runTranscribe() {
    var be = getBackend();
    if (!be) return Promise.resolve();
    if (state.mode === "online" && !settings.apiKey) {
      log("Online rejim uchun API kalit kerak. ⚙ Sozlamalardan kiriting.", "err");
      return Promise.resolve();
    }
    setBusy(true);
    setProgress(8);
    var srcName = "";
    return getSourcePath()
      .then(function (src) {
        srcName = src.name || "manba";
        log("Manba: " + srcName + ". Nutq matnga o'girilmoqda…", "info");
        setProgress(30);
        setStage("Nutq matnga o'girilmoqda (transkripsiya)…");
        return be.transcribe(be.__root, src.path, {
          mode: state.mode,
          language: settings.sourceLang,
          model: settings.whisperModel,
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl || undefined,
        });
      })
      .then(function (tr) {
        if (!tr.ok) throw new Error(tr.error);
        log("Transkripsiya tayyor: " + tr.segments.length + " qator (" + tr.engine + ").", "ok");
        setProgress(60);
        if (settings.translate) {
          log("Tarjima qilinmoqda → " + settings.targetLang + "…", "info");
          setStage("Tarjima qilinmoqda → " + settings.targetLang + "…");
          return be.translateSegments(tr.segments, {
            targetLang: settings.targetLang,
            apiKey: settings.apiKey,
            baseUrl: settings.baseUrl || undefined,
          });
        }
        return { ok: true, segments: tr.segments };
      })
      .then(function (res) {
        if (!res.ok) throw new Error(res.error);
        setProgress(80);
        setStage("Subtitr qo'shilmoqda…");
        return applySubtitles(be, res.segments, srcName);
      })
      .then(function (msg) {
        setProgress(100);
        log(msg, "ok");
        setStatus("Subtitr tayyor.", "ok");
      })
      .catch(function (err) {
        log("Subtitr xato: " + err.message, "err");
        setStatus("Xato.", "err");
      })
      .then(function () {
        setBusy(false);
        setTimeout(function () { setProgress(0); }, 1000);
      });
  }

  // Subtitrlarni host'ga qo'llaydi (AE: matn layerlar, Premiere: SRT import)
  function applySubtitles(be, segments, srcName) {
    var segJson = JSON.stringify(segments);
    if (state.host === "AEFT") {
      var arg = encodeArg(segJson);
      return evalES('RM.aeft.createSubtitles("' + arg + '","{}")').then(function (r) {
        var o = JSON.parse(r);
        if (!o.ok) throw new Error(o.error);
        return o.layers + " ta subtitr layeri '" + o.comp + "' comp'ga qo'shildi.";
      });
    }
    // Premiere: SRT yozib, loyihaga import qilamiz
    var tmp = require("os").tmpdir() + "/" + srcName.replace(/[^\w]+/g, "_") + ".srt";
    var srtPath = be.writeSrt(segments, tmp);
    var pathArg = encodeArg(srtPath);
    return evalES('RM.ppro.importSrt("' + pathArg + '")').then(function (r) {
      var o = JSON.parse(r);
      if (!o.ok) throw new Error(o.error);
      return o.note;
    });
  }

  // ExtendScript string argumenti uchun xavfsiz kodlash
  function encodeArg(str) {
    return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  }

  // --- Eventlarni ulash ---
  function wireEvents() {
    document.querySelectorAll(".step-card").forEach(function (card) {
      card.addEventListener("click", function () {
        if (state.busy) return;
        var action = card.getAttribute("data-action");
        if (actions[action]) actions[action]();
      });
    });

    document.querySelectorAll(".toggle-opt").forEach(function (opt) {
      opt.addEventListener("click", function () {
        document.querySelectorAll(".toggle-opt").forEach(function (o) { o.classList.remove("active"); });
        opt.classList.add("active");
        state.mode = opt.getAttribute("data-mode");
        log("Rejim: " + (state.mode === "online" ? "Online (AI)" : "Offline"), "info");
      });
    });

    $("#clearLog").addEventListener("click", function () { logBox.innerHTML = ""; });

    $("#settingsBtn").addEventListener("click", openSettings);
    $("#closeSettings").addEventListener("click", closeSettings);
    $("#closeMotion").addEventListener("click", function () {
      $("#motionModal").classList.add("hidden");
    });
    $("#saveSettings").addEventListener("click", function () {
      settings.sourceLang = $("#setSourceLang").value;
      settings.translate = $("#setTranslate").checked;
      settings.targetLang = $("#setTargetLang").value;
      settings.apiKey = $("#setApiKey").value.trim();
      settings.baseUrl = $("#setBaseUrl").value.trim();
      settings.whisperModel = $("#setWhisperModel").value.trim();
      settings.brollKind = $("#setBrollKind").value;
      settings.brollVideoModel = $("#setBrollVideoModel").value;
      settings.geminiKey = $("#setGeminiKey").value.trim();
      settings.falKey = $("#setFalKey").value.trim();
      settings.noiseDb = parseFloat($("#setNoiseDb").value) || settings.noiseDb;
      settings.minSilence = parseFloat($("#setMinSilence").value) || settings.minSilence;
      saveSettings();
      closeSettings();
      log("Sozlamalar saqlandi.", "ok");
    });

    $("#pingHostBtn").addEventListener("click", function () {
      callHostFn("RM.ping", "Aloqa tekshiruvi");
    });
  }

  // --- Ovozni tekislash oqimi (4-bosqich) ---
  function runNormalizeAudio() {
    if (state.host !== "PPRO") {
      log("Ovozni tekislash hozircha Premiere Pro uchun.", "warn");
      return Promise.resolve();
    }
    var be = getBackend();
    if (!be) return Promise.resolve();
    setBusy(true);
    setProgress(10);
    var clip = null;
    return evalES("RM.ppro.getSelectedClip()")
      .then(function (r) {
        clip = JSON.parse(r);
        if (!clip.ok) throw new Error(clip.error);
        log("Klip: " + clip.name + ". Loudness o'lchanmoqda…", "info");
        setProgress(35);
        setStage("Ovoz tahlil qilinmoqda (loudness)…");
        var out = require("os").tmpdir() + "/rm_norm_" + Date.now() + ".aac";
        return be.normalizeLoudness(be.__root, clip.path, out);
      })
      .then(function (res) {
        if (!res.ok) throw new Error(res.error);
        var s = res.summary;
        log("Asl: " + s.before_LUFS + " LUFS → maqsad: " + s.target_LUFS + " LUFS.", "ok");
        log("Voice trekiga joylanmoqda…", "info");
        setProgress(75);
        setStage("Ovoz tozalanmoqda va Voice trekiga joylanmoqda…");
        var pathArg = encodeArg(res.outPath);
        var at = clip.timelineStart || 0;
        return evalES('RM.ppro.placeNormalizedAudio("' + pathArg + '","Voice",' + at + ')');
      })
      .then(function (r) {
        var o = JSON.parse(r);
        if (!o.ok) throw new Error(o.error);
        setProgress(100);
        log("Tayyor! Normallashtirilgan ovoz '" + o.track + "' trekida. Asl ovoz tegilmadi.", "ok");
        setStatus("Ovoz tekislandi.", "ok");
      })
      .catch(function (err) {
        log("Ovoz xato: " + err.message, "err");
        setStatus("Xato.", "err");
      })
      .then(function () {
        setBusy(false);
        setTimeout(function () { setProgress(0); }, 1000);
      });
  }

  // --- A-Roll / B-Roll oqimi (5-bosqich) ---
  function runABRoll() {
    if (state.host !== "PPRO") {
      log("A/B-Roll hozircha Premiere Pro uchun.", "warn");
      return Promise.resolve();
    }
    var be = getBackend();
    if (!be) return Promise.resolve();
    setBusy(true);
    setProgress(10);
    var thePlan = null;
    return evalES("RM.ppro.getSelectedClips()")
      .then(function (r) {
        var o = JSON.parse(r);
        if (!o.ok) throw new Error(o.error);
        log(o.clips.length + " ta klip tanlandi. Nutq ulushi tahlil qilinmoqda…", "info");
        setProgress(35);
        setStage("Kadrlar tahlil qilinmoqda (A-Roll / B-Roll)…");
        return be.planAB(be.__root, o.clips, {});
      })
      .then(function (plan) {
        if (!plan.ok) throw new Error(plan.error || "Reja tuzilmadi");
        thePlan = plan;
        log("A-Roll: " + plan.aroll.length + " ta, B-Roll: " + plan.broll.length + " ta.", "ok");
        if (!plan.aroll.length) throw new Error("A-Roll topilmadi (gapiruvchi kadr kerak)");
        setProgress(55);
        setStage("A/B-Roll sequence yasalmoqda…");
        var arg = encodeArg(JSON.stringify(plan));
        return evalES('RM.ppro.buildABSequence("' + arg + '")');
      })
      .then(function (r) {
        var o = JSON.parse(r);
        if (!o.ok) throw new Error(o.error);
        log("Sequence '" + o.sequence + "' — A-Roll V1 (" + o.aroll + "), B-Roll V2 (" + o.broll + ").", "ok");
        // AI B-Roll: agar B-Roll yo'q bo'lsa va online + kalit bo'lsa, AI yaratadi
        var needsAI = thePlan.broll.length === 0 && state.mode === "online" &&
          (settings.geminiKey || settings.falKey);
        if (needsAI) return generateAIBroll(be, thePlan);
        return null;
      })
      .then(function () {
        setProgress(100);
        setStatus("A/B-Roll tayyor.", "ok");
      })
      .catch(function (err) {
        log("A/B-Roll xato: " + err.message, "err");
        setStatus("Xato.", "err");
      })
      .then(function () {
        setBusy(false);
        setTimeout(function () { setProgress(0); }, 1000);
      });
  }

  // B-Roll topilmaganda AI bilan yaratadi (transkriptdan)
  function generateAIBroll(be, plan) {
    var srcPath = plan.aroll[0].path;
    log("B-Roll topilmadi — AI bilan yaratilmoqda…", "info");
    setStage("A-Roll matni o'qilmoqda (AI B-Roll uchun)…");
    return be.transcribe(be.__root, srcPath, {
      mode: "online", language: settings.sourceLang, apiKey: settings.apiKey, baseUrl: settings.baseUrl || undefined,
    }).then(function (tr) {
      if (!tr.ok || !tr.segments.length) throw new Error("Transkripsiya bo'lmadi: " + (tr.error || ""));
      setStage("AI B-Roll kadrlar yaratilmoqda (" + settings.brollKind + ")…");
      log(settings.brollKind + " B-Roll generatsiya qilinmoqda…", "info");
      return be.generateBrollSet(be.__root, tr.segments, {
        kind: settings.brollKind,
        model: settings.brollKind === "video" ? settings.brollVideoModel : "nano-banana-pro",
        apiKey: settings.geminiKey,
        falKey: settings.falKey,
        max: 4,
      });
    }).then(function (gen) {
      if (!gen.ok || !gen.items.length) throw new Error("AI B-Roll yaratilmadi");
      log(gen.items.length + " ta AI B-Roll tayyor. Joylanmoqda…", "ok");
      setStage("AI B-Roll V2 ga joylanmoqda…");
      var arg = encodeArg(JSON.stringify(gen.items));
      return evalES('RM.ppro.importAndPlaceBroll("' + arg + '")');
    }).then(function (r) {
      var o = JSON.parse(r);
      if (!o.ok) throw new Error(o.error);
      log(o.placed + " ta AI B-Roll " + o.track + " trekiga joylandi.", "ok");
    });
  }

  // --- Motion presetlar oynasi (6-bosqich, AE) ---
  function openMotion() {
    if (state.host !== "AEFT") {
      log("Motion presetlar faqat After Effects'da ishlaydi.", "warn");
      return Promise.resolve();
    }
    return evalES("RM.aeft.listMotionPresets()").then(function (r) {
      var o = JSON.parse(r);
      if (!o.ok) throw new Error(o.error || "Presetlar yuklanmadi");
      var list = $("#motionList");
      list.innerHTML = "";
      o.presets.forEach(function (p) {
        var btn = document.createElement("button");
        btn.className = "motion-item";
        btn.innerHTML = "<strong>" + p.name + "</strong><small>" + p.desc + "</small>";
        btn.addEventListener("click", function () { applyMotion(p.id, p.name); });
        list.appendChild(btn);
      });
      $("#motionModal").classList.remove("hidden");
    }).catch(function (err) {
      log("Motion xato: " + err.message, "err");
    });
  }

  function applyMotion(presetId, presetName) {
    var dur = parseFloat($("#motionDur").value) || 0.7;
    var opts = encodeArg(JSON.stringify({ dur: dur }));
    evalES('RM.aeft.applyMotion("' + presetId + '","' + opts + '")').then(function (r) {
      var o = JSON.parse(r);
      if (!o.ok) throw new Error(o.error);
      log("'" + presetName + "' " + o.applied + " ta layerga qo'llandi (keyframelar tahrirlanadi).", "ok");
      $("#motionModal").classList.add("hidden");
    }).catch(function (err) {
      log("Motion xato: " + err.message, "err");
    });
  }

  // --- Sozlamalar oynasi ---
  function openSettings() {
    $("#setSourceLang").value = settings.sourceLang;
    $("#setTranslate").checked = settings.translate;
    $("#setTargetLang").value = settings.targetLang;
    $("#setApiKey").value = settings.apiKey;
    $("#setBaseUrl").value = settings.baseUrl;
    $("#setWhisperModel").value = settings.whisperModel;
    $("#setBrollKind").value = settings.brollKind;
    $("#setBrollVideoModel").value = settings.brollVideoModel;
    $("#setGeminiKey").value = settings.geminiKey;
    $("#setFalKey").value = settings.falKey;
    $("#setNoiseDb").value = settings.noiseDb;
    $("#setMinSilence").value = settings.minSilence;
    $("#settingsModal").classList.remove("hidden");
  }
  function closeSettings() {
    $("#settingsModal").classList.add("hidden");
  }

  // --- Boshlanish ---
  function init() {
    loadSettings();
    log("Reels Montaj AI ishga tushdi.", "info");
    detectHost();
    wireEvents();
    setStatus("Tayyor.", "");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
