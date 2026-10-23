---
title: "Contact"
date: 2026-07-24T00:00:00+07:00
draft: false
description: "Get in touch."
---

Let's talk.

<div class="contact-form-wrap">
  <h3>Send a message</h3>
  <p>Open for contract, consulting, and engineering work. Drop a note below or reach out directly at <a href="mailto:hanhphamit@gmail.com">hanhphamit@gmail.com</a>. Submitting opens a pre-addressed email draft in your local mail client: zero server endpoints, zero trackers.</p>
  <form class="contact-form" id="contact-form">
    <div class="contact-field">
      <label for="contact-name">Your Name</label>
      <input type="text" id="contact-name" name="name" placeholder="Optional" maxlength="80" autocomplete="name">
    </div>
    <div class="contact-field">
      <label for="contact-subject">Subject</label>
      <input type="text" id="contact-subject" name="subject" placeholder="What is this about?" required maxlength="120">
    </div>
    <div class="contact-field">
      <label for="contact-message">Message</label>
      <textarea id="contact-message" name="message" placeholder="Write your message..." required maxlength="2500"></textarea>
    </div>
    <button type="submit" class="contact-submit-btn">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
      Compose Email
    </button>
    <div class="contact-status info" id="contact-status">
      Draft prepared. If your email application did not open automatically, <a id="contact-fallback-link" href="#">click here to send directly</a>.
    </div>
  </form>
</div>

<script> <!-- security-lint:allow raw-html -->
function handleContactSubmit(e) {
    e.preventDefault();
    var name = document.getElementById("contact-name").value.trim();
    var subject = document.getElementById("contact-subject").value.trim();
    var message = document.getElementById("contact-message").value.trim();

    if (!subject || !message) return false;

    var body = message;
    if (name) {
        body = "From: " + name + "\n\n" + message;
    }

    var mailto = "mailto:hanhphamit@gmail.com"
        + "?subject=" + encodeURIComponent(subject)
        + "&body=" + encodeURIComponent(body);

    var statusBox = document.getElementById("contact-status");
    var fallbackLink = document.getElementById("contact-fallback-link");
    if (statusBox && fallbackLink) {
        fallbackLink.href = mailto;
        statusBox.classList.add("is-visible");
    }

    window.location.href = mailto;
    return false;
}

// Wired here rather than inline on the form: an onsubmit attribute is a handler the browser has to
// evaluate, which a content security policy blocks, and it is the pattern the lint refuses.
document.getElementById("contact-form").addEventListener("submit", handleContactSubmit);
</script>

### Or connect directly:
<ul class="contact-links">
  <li>
    <span class="label">linkedin</span>
    <a href="https://www.linkedin.com/in/hanhphamphuoc/" target="_blank" rel="noopener">hanhphamphuoc</a>
  </li>
  <li>
    <span class="label">email</span>
    <a href="mailto:hanhphamit@gmail.com">hanhphamit@gmail.com</a>
  </li>
  <li>
    <span class="label">github</span>
    <a href="https://github.com/hanhpp" target="_blank" rel="noopener">hanhpp</a>
  </li>
</ul>
