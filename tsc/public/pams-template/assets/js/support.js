/* TSC Support widget — floating cream Support pill that expands into a small
   help-desk form and posts to /api/support. Fully self-contained: builds its
   own DOM and appends to <body> (never inside a .section stacking context).

   Config comes from window.__TSCSupport, set by whichever surface loads the
   script:  { slug, league, email }  — all optional.
     slug   → sent as league_slug so triage knows which league
     email  → prefills the address field for signed-in users

   Auto-mounts on load; window.TSCSupport = { mount, unmount } lets React
   surfaces re-mount/tear down across client-side navigation. */

(function () {
  'use strict'

  // Trailing slash matters: next.config has trailingSlash:true and a bare
  // /api/support POST would eat a 308 hop first.
  var API = '/api/support/'
  var LS_EMAIL = 'tsc-support-email'
  var TOPICS = [
    ['bug', 'Bug report'],
    ['suggestion', 'Suggestion'],
    ['feedback', 'Feedback'],
    ['question', 'Question'],
    ['billing', 'Billing'],
    ['other', 'Other'],
  ]

  var root = null
  var btn = null
  var panel = null
  var outsideHandler = null
  var keyHandler = null

  function el(tag, cls, html) {
    var node = document.createElement(tag)
    if (cls) node.className = cls
    if (html !== undefined) node.innerHTML = html
    return node
  }

  function cfg() {
    var c = window.__TSCSupport || {}
    // Fall back to the almanac's page config when present.
    var dc = window.__DC || {}
    return {
      slug: c.slug || dc.slug || null,
      league: c.league || dc.name || null,
      email: c.email || null,
    }
  }

  var LIFEBUOY =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>' +
    '<line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/>' +
    '<line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/></svg>'

  var PLANE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'

  function buildForm() {
    var c = cfg()
    var form = el('form', 'tscs-form')
    form.noValidate = true

    var savedEmail = ''
    try { savedEmail = localStorage.getItem(LS_EMAIL) || '' } catch (e) { /* private mode */ }

    form.innerHTML =
      '<div class="tscs-field">' +
        '<label class="tscs-label" for="tscs-email">Your email</label>' +
        '<input class="tscs-input" id="tscs-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required>' +
      '</div>' +
      '<div class="tscs-field">' +
        '<label class="tscs-label" for="tscs-topic">Topic</label>' +
        '<div class="tscs-select-wrap"><select class="tscs-select" id="tscs-topic" name="topic" required>' +
          '<option value="" disabled selected>Choose a topic</option>' +
          TOPICS.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>' }).join('') +
        '</select></div>' +
      '</div>' +
      '<div class="tscs-field">' +
        '<label class="tscs-label" for="tscs-subject">Subject</label>' +
        '<input class="tscs-input" id="tscs-subject" name="subject" type="text" maxlength="150" placeholder="What is this regarding?" required>' +
      '</div>' +
      '<div class="tscs-field">' +
        '<label class="tscs-label" for="tscs-message">Message</label>' +
        '<textarea class="tscs-textarea" id="tscs-message" name="message" maxlength="5000" placeholder="What happened, what you expected, or what you would like to see." required></textarea>' +
      '</div>' +
      '<div class="tscs-hp" aria-hidden="true"><label>Leave this empty<input type="text" name="hp" tabindex="-1" autocomplete="off"></label></div>' +
      '<button type="submit" class="tscs-send">' + PLANE + '<span>Send note</span></button>' +
      '<p class="tscs-error" hidden></p>' +
      '<p class="tscs-foot">Goes straight to the Chronicle desk</p>'

    var emailInput = form.querySelector('#tscs-email')
    emailInput.value = c.email || savedEmail

    form.addEventListener('submit', function (ev) {
      ev.preventDefault()
      submit(form)
    })
    return form
  }

  function showError(form, msg) {
    var err = form.querySelector('.tscs-error')
    err.innerHTML = msg
    err.hidden = false
  }

  function submit(form) {
    var email = form.querySelector('#tscs-email').value.trim()
    var topic = form.querySelector('#tscs-topic').value
    var subject = form.querySelector('#tscs-subject').value.trim()
    var message = form.querySelector('#tscs-message').value.trim()
    var hp = form.querySelector('input[name="hp"]').value

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError(form, 'Enter a valid email so a reply can reach you.')
    if (!topic) return showError(form, 'Pick a topic.')
    if (!subject) return showError(form, 'Give the note a subject.')
    if (!message) return showError(form, 'Write a message first.')

    form.querySelector('.tscs-error').hidden = true
    var send = form.querySelector('.tscs-send')
    send.disabled = true
    send.querySelector('span').textContent = 'Sending...'

    var c = cfg()
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        topic: topic,
        subject: subject,
        message: message,
        league_slug: c.slug,
        page_url: window.location.href.slice(0, 600),
        hp: hp,
      }),
    })
      .then(function (res) { return res.json().catch(function () { return {} }).then(function (j) { return { ok: res.ok && j.ok, error: j.error } }) })
      .then(function (out) {
        if (out.ok) {
          try { localStorage.setItem(LS_EMAIL, email) } catch (e) { /* private mode */ }
          showDone()
        } else {
          send.disabled = false
          send.querySelector('span').textContent = 'Send note'
          showError(form, (out.error || 'Could not send.') +
            ' If it keeps failing, email <a href="mailto:jzffgames@gmail.com">jzffgames@gmail.com</a>.')
        }
      })
      .catch(function () {
        send.disabled = false
        send.querySelector('span').textContent = 'Send note'
        showError(form, 'Could not send. Check your connection, or email <a href="mailto:jzffgames@gmail.com">jzffgames@gmail.com</a>.')
      })
  }

  function showDone() {
    var body = panel.querySelector('.tscs-body')
    body.innerHTML =
      '<div class="tscs-done">' +
        '<div class="tscs-done-mark">&#9733;</div>' +
        '<div class="tscs-done-title">Delivered.</div>' +
        '<p class="tscs-done-sub">Thanks for writing. Every note gets read, and replies go to the email you left.</p>' +
        '<button type="button" class="tscs-again">Write another note</button>' +
      '</div>'
    body.querySelector('.tscs-again').addEventListener('click', function () {
      body.innerHTML = ''
      body.appendChild(buildForm())
      focusFirst()
    })
  }

  function buildPanel() {
    var p = el('div', 'tscs-panel')
    p.hidden = true
    p.setAttribute('role', 'dialog')
    p.setAttribute('aria-label', 'Support')

    var head = el('div', 'tscs-head')
    head.appendChild(el('div', 'tscs-kicker', 'The Sunday Chronicle'))
    var close = el('button', 'tscs-close', '&#10005;')
    close.type = 'button'
    close.setAttribute('aria-label', 'Close support form')
    close.addEventListener('click', closePanel)
    head.appendChild(close)
    p.appendChild(head)

    p.appendChild(el('h2', 'tscs-title', 'The Help Desk.'))
    p.appendChild(el('p', 'tscs-sub', 'Spotted a bug, have an idea, or need a hand? Send a note.'))

    var body = el('div', 'tscs-body')
    body.appendChild(buildForm())
    p.appendChild(body)
    return p
  }

  function focusFirst() {
    var email = panel.querySelector('#tscs-email')
    var target = email && !email.value ? email : panel.querySelector('#tscs-topic')
    if (target) target.focus()
  }

  function openPanel() {
    panel.hidden = false
    btn.classList.add('is-open')
    focusFirst()
    outsideHandler = function (ev) {
      if (!panel.contains(ev.target) && !btn.contains(ev.target)) closePanel()
    }
    keyHandler = function (ev) {
      if (ev.key === 'Escape') closePanel()
    }
    // Delay so the opening click doesn't immediately close it.
    setTimeout(function () {
      document.addEventListener('mousedown', outsideHandler)
      document.addEventListener('keydown', keyHandler)
    }, 0)
  }

  function closePanel() {
    panel.hidden = true
    btn.classList.remove('is-open')
    if (outsideHandler) document.removeEventListener('mousedown', outsideHandler)
    if (keyHandler) document.removeEventListener('keydown', keyHandler)
    outsideHandler = keyHandler = null
    btn.focus()
  }

  function mount() {
    if (root && document.body.contains(root)) return
    root = el('div', 'tscs-root')

    btn = el('button', 'tscs-btn', LIFEBUOY + '<span>Support</span>')
    btn.type = 'button'
    btn.setAttribute('aria-label', 'Contact support')
    btn.addEventListener('click', openPanel)

    panel = buildPanel()
    root.appendChild(btn)
    root.appendChild(panel)
    document.body.appendChild(root)
  }

  function unmount() {
    if (outsideHandler) document.removeEventListener('mousedown', outsideHandler)
    if (keyHandler) document.removeEventListener('keydown', keyHandler)
    outsideHandler = keyHandler = null
    if (root && root.parentNode) root.parentNode.removeChild(root)
    root = btn = panel = null
  }

  window.TSCSupport = { mount: mount, unmount: unmount }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount)
  } else {
    mount()
  }
})()
