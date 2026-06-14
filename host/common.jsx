/*
 * RM - Reels Montaj AI uchun umumiy ExtendScript namespace.
 * Premiere va After Effects o'rtasida umumiy yordamchilar.
 */

// Global RM obyektini yaratamiz
if (typeof RM === "undefined") {
  RM = {};
}

RM.version = "0.1.0";
RM.hostType = "UNKNOWN"; // index.jsx tomonidan o'rnatiladi

/**
 * Hozirgi skript faylining papkasiga nisbatan yo'lni hal qiladi.
 * $.fileName joriy bajarilayotgan jsx faylining yo'lini beradi.
 */
function RM_resolvePath(relative) {
  var thisFile = new File($.fileName);
  var dir = thisFile.parent;
  return dir.fsName + "/" + relative;
}

/**
 * Aloqa tekshiruvi. Panel buni birinchi bo'lib chaqiradi.
 * Host nomi va versiyasini qaytaradi.
 */
RM.ping = function () {
  var info = {
    ok: true,
    host: RM.hostType,
    appName: (function () { try { return app.name; } catch (e) { return "?"; } })(),
    appVersion: (function () { try { return app.version; } catch (e) { return "?"; } })(),
    rmVersion: RM.version,
  };
  return JSON.stringify(info);
};

/**
 * Xatoni xavfsiz JSON ko'rinishida qaytarish uchun o'ram.
 */
RM.safe = function (fn) {
  try {
    return fn();
  } catch (e) {
    return JSON.stringify({ ok: false, error: e.toString(), line: e.line || null });
  }
};

/** Vaqtinchalik papka yo'li (oraliq fayllar uchun) */
RM.tempFolder = function () {
  var f = new Folder(Folder.temp.fsName + "/ReelsMontajAI");
  if (!f.exists) f.create();
  return f.fsName;
};
