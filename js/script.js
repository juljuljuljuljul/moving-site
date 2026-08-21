(() => {
  // How much you have to scroll (in px) to advance one frame.
  // Lower = faster playback per scroll distance, higher = slower/longer scroll.
  // Mobile is tuned for a light touch-swipe; desktop mouse-wheel scrolling
  // covers far less physical effort per pixel, so it needs a much longer
  // distance to not blow through the whole sequence in one or two notches.
  const PIXELS_PER_FRAME_MOBILE = 1.16;
  const PIXELS_PER_FRAME_DESKTOP = 7;

  // Below this viewport width, use images/mobile instead of images/desktop.
  const MOBILE_BREAKPOINT = 768;

  const container = document.getElementById('scroll-container');
  const stage = document.getElementById('scroll-stage');
  const canvas = document.getElementById('frame-canvas');
  const ctx = canvas.getContext('2d');
  const loader = document.getElementById('loader');
  const loaderFill = document.getElementById('loader-fill');
  const loaderLabel = document.getElementById('loader-label');
  const scrollHint = document.getElementById('scroll-hint');
  const fullscreenBtn = document.getElementById('fullscreen-btn');

  let images = [];
  let frameCount = 0;
  let currentFrame = -1; // last requested frame index
  let currentSource = -1; // frame index actually painted (may be a stand-in)
  let canvasSized = false;
  let mode = null; // 'desktop' | 'mobile'
  let scrollDistance = 0;
  let baseViewportWidth = window.innerWidth;
  let loadToken = 0; // bumped on every init() so stale background loaders stop
  let hintDismissed = false;

  function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }

  function setLoaderProgress(loaded, total) {
    const pct = total ? Math.round((loaded / total) * 100) : 0;
    loaderFill.style.width = pct + '%';
    loaderLabel.textContent = `loading ${pct}%`;
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Loads a sequence progressively: geometry (frame count / scroll length)
  // is known immediately from the manifest, frames load in priority order
  // starting from 0, and this resolves as soon as a small first chunk is
  // ready — the rest keeps loading in the background so scrolling isn't
  // blocked on the full set, regardless of how fast the host serves files.
  async function loadAllProgressively(folder, files, token) {
    frameCount = files.length;
    images = new Array(frameCount).fill(null);
    canvasSized = false;
    setStageHeight();

    if (frameCount === 0) {
      loaderLabel.textContent = `no images found in images/${folder}/`;
      return;
    }

    const READY_COUNT = Math.min(frameCount, Math.max(20, Math.ceil(frameCount * 0.06)));
    let nextIndex = 0;
    let loadedCount = 0;
    let readyResolved = false;
    let resolveReady;
    const readyPromise = new Promise((resolve) => { resolveReady = resolve; });

    async function worker() {
      while (nextIndex < files.length) {
        if (token !== loadToken) return; // superseded by a newer init()
        const i = nextIndex++;
        const img = await loadImage(`images/${folder}/${files[i]}`);
        if (token !== loadToken) return;

        images[i] = img;
        if (img && !canvasSized) {
          setCanvasIntrinsicSize(img);
          canvasSized = true;
        }
        loadedCount++;
        setLoaderProgress(loadedCount, files.length);
        onScroll(); // repaint if the currently-viewed frame just became available

        if (!readyResolved && loadedCount >= READY_COUNT) {
          readyResolved = true;
          resolveReady();
        }
      }
    }

    const CONCURRENCY = Math.min(10, files.length);
    for (let w = 0; w < CONCURRENCY; w++) worker();

    await readyPromise;
  }

  function setCanvasIntrinsicSize(img) {
    // The canvas's width/height attributes define its aspect ratio; CSS
    // (max-width/max-height + width/height:auto) scales it uniformly to
    // fit the pin box, like object-fit: contain. Set once per sequence —
    // no need to touch this on viewport/toolbar resize.
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
  }

  function paint(img) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  function drawFrame(index) {
    if (!frameCount) return;
    index = Math.max(0, Math.min(frameCount - 1, index));

    // Resolve the best available source fresh every call — if the exact
    // frame isn't loaded yet, search outward for the nearest neighbor that
    // is. This must re-run every time (not just once per requested index):
    // an earlier search can fail because nothing was loaded yet at that
    // moment, and background loading keeps filling in frames afterward.
    let source = index;
    let img = images[index];
    if (!img) {
      for (let d = 1; d < frameCount; d++) {
        if (index - d >= 0 && images[index - d]) { source = index - d; img = images[index - d]; break; }
        if (index + d < frameCount && images[index + d]) { source = index + d; img = images[index + d]; break; }
      }
    }
    if (!img) return; // nothing loaded anywhere yet

    if (currentFrame === index && currentSource === source) return;
    currentFrame = index;
    currentSource = source;
    paint(img);
  }

  // Below the mobile breakpoint, #scroll-container is its own locked-down
  // internal scroller (see CSS) — the outer page never scrolls, so iOS
  // Safari's toolbar never auto-hides mid-interaction. At/above the
  // breakpoint, #scroll-container is a normal in-flow block and the page
  // scrolls the ordinary way, since desktop browsers don't have that
  // dynamic-toolbar problem in the first place.
  function getViewportHeight() {
    return mode === 'mobile' ? container.clientHeight : window.innerHeight;
  }

  function getScrolledPx() {
    return mode === 'mobile' ? container.scrollTop : -stage.getBoundingClientRect().top;
  }

  function setStageHeight() {
    const pixelsPerFrame = mode === 'mobile' ? PIXELS_PER_FRAME_MOBILE : PIXELS_PER_FRAME_DESKTOP;
    scrollDistance = (frameCount - 1) * pixelsPerFrame;
    stage.style.height = `${getViewportHeight() + scrollDistance}px`;
  }

  function onScroll() {
    const scrolled = Math.min(Math.max(getScrolledPx(), 0), scrollDistance);

    // The scroll hint is a one-time nudge — once the user has actually
    // scrolled at all, it fades away for good rather than reappearing.
    if (!hintDismissed && scrollHint && scrolled > 4) {
      hintDismissed = true;
      scrollHint.classList.remove('visible');
      scrollHint.classList.add('gone');
    }

    const progress = scrollDistance > 0 ? scrolled / scrollDistance : 0;
    const frame = Math.round(progress * (frameCount - 1));
    requestAnimationFrame(() => drawFrame(frame));
  }

  async function init(targetMode) {
    mode = targetMode;
    const token = ++loadToken;
    loader.classList.remove('hidden');
    loaderLabel.textContent = 'loading 0%';
    loaderFill.style.width = '0%';
    currentFrame = -1;
    currentSource = -1;

    const res = await fetch('manifest.json', { cache: 'no-store' });
    const manifest = await res.json();

    // Prefer this viewport's own frames, but if only the other device's
    // frames have been exported so far, use those rather than showing
    // nothing — scroll mechanics (`mode`) still follow the real viewport
    // regardless of which image set ends up loading.
    const fallbackMode = targetMode === 'mobile' ? 'desktop' : 'mobile';
    const preferred = manifest[targetMode] || [];
    const imageFolder = preferred.length ? targetMode : fallbackMode;
    const files = manifest[imageFolder] || [];

    await loadAllProgressively(imageFolder, files, token);
    if (token !== loadToken) return; // a newer init() has taken over

    onScroll();
    loader.classList.add('hidden');
    if (scrollHint && !hintDismissed && scrollDistance > 0) {
      scrollHint.classList.add('visible');
    }
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    // iOS Safari fires resize when its toolbar auto-hides/shows during
    // scroll, changing window.innerHeight without an actual layout change.
    // Only relevant on mobile (where #scroll-container is the real
    // scroller) — ignore height-only changes there. Desktop has no such
    // phantom-resize quirk, so every resize is a genuine one.
    if (mode === 'mobile' && window.innerWidth === baseViewportWidth) return;

    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      baseViewportWidth = window.innerWidth;
      setStageHeight();
      currentFrame = -1;
      onScroll();

      const nextMode = isMobile() ? 'mobile' : 'desktop';
      if (nextMode !== mode) init(nextMode);
    }, 200);
  });

  container.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });

  if (fullscreenBtn) {
    const EXPAND_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const COMPRESS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const updateFullscreenIcon = () => {
      const active = !!document.fullscreenElement;
      fullscreenBtn.innerHTML = active ? COMPRESS_ICON : EXPAND_ICON;
      fullscreenBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    };
    updateFullscreenIcon();

    fullscreenBtn.addEventListener('click', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    });
    document.addEventListener('fullscreenchange', updateFullscreenIcon);
  }

  init(isMobile() ? 'mobile' : 'desktop');
})();
