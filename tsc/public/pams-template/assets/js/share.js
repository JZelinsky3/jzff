// TSC Share dialog — reusable across almanac pages.
//
// Wiring (two parts injected by the server's leagues route):
//
//   1) Above </body>:
//        <script>window.__TSCShareConfig = {ogPath, shareUrl, title, sub, downloadName};</script>
//        <script src="/pams-template/assets/js/share.js" defer></script>
//
//   2) The config-set runs immediately when parsed. The script tag loads
//      deferred and reads __TSCShareConfig on DOMContentLoaded. This
//      ordering avoids the "TSCShare is undefined" race that an explicit
//      init() call would hit (defer scripts run AFTER inline scripts).
//
// `TSCShare.init({...})` is also exposed for pages that prefer a manual
// hook (e.g. SPAs that change the share target after navigation). init()
// can be called multiple times — each call idempotently rewires the
// SAME dialog/button with new metadata.

(function () {
  'use strict';

  var pendingInit = null;

  function safeName(s) {
    return String(s || 'share').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'share';
  }

  function wire(opts) {
    var btn = document.getElementById('tsc-share-btn');
    var dialog = document.getElementById('tsc-share-dialog');
    if (!btn || !dialog) {
      // Markup not present yet — queue and try again at DOMContentLoaded.
      pendingInit = opts;
      return;
    }

    var closeBtn = document.getElementById('tsc-share-close');
    var copyBtn = document.getElementById('tsc-share-copy');
    var copyLabel = document.getElementById('tsc-share-copy-label');
    var downloadBtn = document.getElementById('tsc-share-download');
    var preview = document.getElementById('tsc-share-preview');
    var titleEl = document.getElementById('tsc-share-title');
    var subEl = document.getElementById('tsc-share-sub');

    var ogUrl = new URL(opts.ogPath, window.location.origin).toString();
    var shareUrl = opts.shareUrl || window.location.href;
    var downloadName = safeName(opts.downloadName || opts.title || 'tsc-card') + '.png';

    if (titleEl) titleEl.textContent = opts.title || '';
    if (subEl && opts.sub) subEl.textContent = opts.sub;
    if (preview) preview.src = ogUrl;
    btn.hidden = false;

    // Replace listeners idempotently by cloning each element.
    function rebind(el) {
      if (!el) return null;
      var fresh = el.cloneNode(true);
      el.parentNode.replaceChild(fresh, el);
      return fresh;
    }
    btn = rebind(btn);
    closeBtn = rebind(closeBtn);
    copyBtn = rebind(copyBtn);
    downloadBtn = rebind(downloadBtn);
    // Re-resolve the inner label since copyBtn was cloned.
    copyLabel = document.getElementById('tsc-share-copy-label');

    btn.addEventListener('click', function () {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    });
    if (closeBtn) closeBtn.addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) dialog.close();
    });

    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(shareUrl).then(function () {
            if (copyLabel) copyLabel.textContent = 'Copied!';
            copyBtn.classList.add('is-success');
            setTimeout(function () {
              if (copyLabel) copyLabel.textContent = 'Copy link';
              copyBtn.classList.remove('is-success');
            }, 1800);
          }).catch(fallbackCopy);
        } else {
          fallbackCopy();
        }
      });
    }

    function fallbackCopy() {
      // Older browsers / non-secure contexts: select a hidden textarea.
      var ta = document.createElement('textarea');
      ta.value = shareUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        if (copyLabel) copyLabel.textContent = 'Copied!';
      } catch (_) { /* swallow — best-effort */ }
      document.body.removeChild(ta);
    }

    if (downloadBtn) {
      downloadBtn.addEventListener('click', function () {
        fetch(ogUrl).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.blob();
        }).then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = downloadName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }).catch(function () {
          // Last resort: open the image so the user can save it manually.
          window.open(ogUrl, '_blank', 'noopener');
        });
      });
    }
  }

  function init(opts) {
    if (document.readyState === 'loading') {
      pendingInit = opts;
    } else {
      wire(opts);
    }
  }

  function bootFromConfig() {
    if (pendingInit) {
      wire(pendingInit);
      pendingInit = null;
      return;
    }
    if (window.__TSCShareConfig) {
      wire(window.__TSCShareConfig);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootFromConfig);
  } else {
    bootFromConfig();
  }

  window.TSCShare = { init: init };
})();
