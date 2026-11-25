(function () {
  'use strict';
  try {
    var t = localStorage.getItem('omni-medikit-theme');
    if (t) document.documentElement.dataset.theme = t;
    var z = localStorage.getItem('omni-medikit-taille');
    if (z) document.documentElement.dataset.taille = z;
  } catch (e) {}
})();
