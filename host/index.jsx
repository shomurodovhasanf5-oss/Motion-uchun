/*
 * Reels Montaj AI - ExtendScript kirish nuqtasi (host tomon).
 * Premiere Pro va After Effects'da yuklanadi.
 * Panel JS bu yerdagi RM.* funksiyalarini evalScript orqali chaqiradi.
 */

// Host'ga qarab to'g'ri faylni yuklaymiz.
// app.name: "Adobe Premiere Pro" yoki "Adobe After Effects"
#include "lib/json2.jsx"
#include "common.jsx"

(function () {
  var appName = "";
  try { appName = app.name; } catch (e) { appName = ""; }

  if (appName.indexOf("Premiere") !== -1) {
    $.evalFile(RM_resolvePath("premiere.jsx"));
    RM.hostType = "PPRO";
  } else if (appName.indexOf("After Effects") !== -1) {
    $.evalFile(RM_resolvePath("aftereffects.jsx"));
    RM.hostType = "AEFT";
  } else {
    RM.hostType = "UNKNOWN";
  }
})();
