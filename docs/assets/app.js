// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Nav: add a hairline border once the page scrolls ── */
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ── Hero entrance: trigger the staggered rise ── */
  const heroReveals = document.querySelectorAll('.hero .reveal');
  if (heroReveals.length) {
    requestAnimationFrame(() => heroReveals.forEach((el) => el.classList.add('go')));
  }

  /* ── Scroll-reveal for sections below the fold ── */
  const reveals = document.querySelectorAll('.reveal:not(.go)');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 }
    );
    reveals.forEach((el) => io.observe(el));
  }

  /* ── Pointer-tracked glow on feature cards ── */
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    });
  });

  /* ── Hero terminal: type out the launch command ── */
  const cmdEl = document.getElementById('term-cmd');
  if (cmdEl) {
    const text = 'claude "Add a dark-mode toggle to Settings"';
    if (reduceMotion) {
      cmdEl.textContent = text;
    } else {
      let i = 0;
      const tick = () => {
        cmdEl.textContent = text.slice(0, i);
        if (i++ <= text.length) setTimeout(tick, 55 + Math.sin(i) * 18);
      };
      setTimeout(tick, 1100);
    }
  }

  /* ── Copy buttons on command rows ── */
  document.querySelectorAll('.copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy') || '';
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch { /* noop */ }
        ta.remove();
      }
      const original = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('done');
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('done');
      }, 1400);
    });
  });

  /* ── Docs TOC scroll-spy ── */
  const tocLinks = Array.from(document.querySelectorAll('.docs-nav a'));
  const sections = document.querySelectorAll('.docs-sec');
  if (tocLinks.length && sections.length && 'IntersectionObserver' in window) {
    const byId = new Map(tocLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            tocLinks.forEach((a) => a.classList.remove('active'));
            const link = byId.get(e.target.id);
            if (link) link.classList.add('active');
          }
        });
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );
    sections.forEach((s) => spy.observe(s));
  }
})();
