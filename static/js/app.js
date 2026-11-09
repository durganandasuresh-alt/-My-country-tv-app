document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const video = document.getElementById("liveVideo");
  const videoBox = document.getElementById("videoBox");
  const videoOverlay = document.getElementById("videoOverlay");
  const playPauseOverlay = document.getElementById("playPauseOverlay");
  const btnPlayPause = document.getElementById("btnPlayPause");
  const btnMute = document.getElementById("btnMute");
  const btnToggleProxy = document.getElementById("btnToggleProxy");
  const btnPip = document.getElementById("btnPip");
  const btnFullscreen = document.getElementById("btnFullscreen");

  // Info and badges
  const overlayChannelName = document.getElementById("overlayChannelName");
  const proxyStatus = document.getElementById("proxyStatus");
  const channelAvatar = document.getElementById("channelAvatar");
  const channelTitle = document.getElementById("channelTitle");
  const showTitle = document.getElementById("showTitle");
  const showTiming = document.getElementById("showTiming");
  const channelCategory = document.getElementById("channelCategory");
  const btnFavorite = document.getElementById("btnFavorite");
  const btnShare = document.getElementById("btnShare");
  const epgCurrentName = document.getElementById("epgCurrentName");

  // Grid, filters and search
  const channelGrid = document.getElementById("channelGrid");
  const channelCount = document.getElementById("channelCount");
  const currentCategoryTitle = document.getElementById("currentCategoryTitle");
  const categoryStrip = document.getElementById("categoryStrip");
  const langFilter = document.getElementById("langFilter");
  const searchInput = document.getElementById("searchInput");
  const clearSearch = document.getElementById("clearSearch");

  // Modal elements
  const playlistModal = document.getElementById("playlistModal");
  const btnOpenPlaylistModal = document.getElementById("btnOpenPlaylistModal");
  const mobPlaylistOpen = document.getElementById("mobPlaylistOpen");
  const btnCloseModal = document.getElementById("btnCloseModal");
  const btnLoadPlaylist = document.getElementById("btnLoadPlaylist");
  const playlistUrlInput = document.getElementById("playlistUrlInput");
  const userAvatar = document.querySelector(".user-avatar");

  // Screen middle edge arrows (circle buttons for changing channels)
  const edgePrev = document.getElementById("edgePrev");
  const edgeNext = document.getElementById("edgeNext");
  if (edgePrev) edgePrev.addEventListener("click", () => stepChannel(-1));
  if (edgeNext) edgeNext.addEventListener("click", () => stepChannel(1));

  // Stream error overlay (Network is not there)
  const streamError = document.getElementById("streamError");
  const streamErrorHeading = document.getElementById("streamErrorHeading");
  const streamErrorMsg = document.getElementById("streamErrorMsg");
  const btnRetryStream = document.getElementById("btnRetryStream");
  const btnNextOfflineChannel = document.getElementById("btnNextOfflineChannel");

  function showNetworkError(msg) {
    if (streamError) {
      if (streamErrorHeading) streamErrorHeading.textContent = "Network is Not There";
      if (streamErrorMsg) {
        streamErrorMsg.textContent = msg || `Network is not there or "${activeChannel ? activeChannel.name : 'this channel'}" feed is currently unreachable.`;
      }
      streamError.classList.remove("hidden");
    }
    if (proxyStatus) proxyStatus.textContent = "NO NETWORK";
  }

  function hideNetworkError() {
    if (streamError) {
      streamError.classList.add("hidden");
    }
  }

  if (btnRetryStream) {
    btnRetryStream.addEventListener("click", () => {
      hideNetworkError();
      if (activeChannel) {
        useProxy = true; // Switch to proxy for retry in case CORS blocked it
        localStorage.setItem("tvUseProxy", "1");
        updateProxyBadge();
        playChannel(activeChannel);
      }
    });
  }

  if (btnNextOfflineChannel) {
    btnNextOfflineChannel.addEventListener("click", () => {
      hideNetworkError();
      stepChannel(1);
    });
  }

  // User ID for multi-device & local persistence
  let currentUserId = localStorage.getItem("mctv_user_id");
  if (!currentUserId) {
    currentUserId = "user_" + Math.random().toString(36).substring(2, 10);
    localStorage.setItem("mctv_user_id", currentUserId);
  }
  // Sync user_id cookie so proxy/stream and API calls receive identity reliably
  try {
    document.cookie = `mctv_user_id=${encodeURIComponent(currentUserId)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch (e) {}

  // Subscription state
  let currentSubscription = {
    is_active: true,
    is_trial: true,
    trial_days_left: 10,
    plan: "free_trial",
    plan_name: "10 Days Free Plan"
  };
  let selectedPlanId = "3m"; // default highlight
  let currentPayment = null;

  // Subscription DOM Elements
  const btnSubscriptionStatus = document.getElementById("btnSubscriptionStatus");
  const headerSubText = document.getElementById("headerSubText");
  const btnUserAccount = document.getElementById("btnUserAccount");
  const subscriptionModal = document.getElementById("subscriptionModal");
  const btnCloseSubModal = document.getElementById("btnCloseSubModal");
  const plansSelectionView = document.getElementById("plansSelectionView");
  const upiPaymentView = document.getElementById("upiPaymentView");
  const subSuccessView = document.getElementById("subSuccessView");
  const btnBackToPlans = document.getElementById("btnBackToPlans");
  const summaryPlanName = document.getElementById("summaryPlanName");
  const summaryPlanAmount = document.getElementById("summaryPlanAmount");
  const upiQrCodeImg = document.getElementById("upiQrCodeImg");
  const btnPayUpiDirect = document.getElementById("btnPayUpiDirect");
  const btnPayGPay = document.getElementById("btnPayGPay");
  const btnPayPhonePe = document.getElementById("btnPayPhonePe");
  const btnPayPaytm = document.getElementById("btnPayPaytm");
  const upiVpaDisplay = document.getElementById("upiVpaDisplay");
  const btnCopyVpa = document.getElementById("btnCopyVpa");
  const btnConfirmUpiPayment = document.getElementById("btnConfirmUpiPayment");
  const subDetailsCard = document.getElementById("subDetailsCard");
  const btnSubSuccessClose = document.getElementById("btnSubSuccessClose");
  const subLockOverlay = document.getElementById("subLockOverlay");
  const btnUnlockSubscription = document.getElementById("btnUnlockSubscription");
  const btnSwitchToFreeNews = document.getElementById("btnSwitchToFreeNews");
  const btnTestExpireTrial = document.getElementById("btnTestExpireTrial");
  const btnTestResetTrial = document.getElementById("btnTestResetTrial");

  // State
  let allChannels = [];
  let filteredChannels = [];
  let renderedCount = 0;
  const CHUNK_SIZE = 60;
  let currentCategory = "All";
  let currentLanguage = "All";
  let activeChannel = null;
  let currentBottomTab = "home";
  let showOnlyFavorites = false;
  let hlsInstance = null;
  let useProxy = localStorage.getItem("tvUseProxy") === "1"; // default direct
  let favorites = new Set(JSON.parse(localStorage.getItem("jio_favorites") || "[]"));

  // Toast notification helper
  let toastEl = document.querySelector(".jio-toast");
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "jio-toast";
    document.body.appendChild(toastEl);
  }
  let toastTimer = null;
  function showToast(message, icon = "ri-information-line") {
    toastEl.innerHTML = `<i class="${icon}"></i> <span>${message}</span>`;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2500);
  }

  // Update proxy status badge
  function updateProxyBadge() {
    if (proxyStatus) {
      proxyStatus.textContent = useProxy ? "FLASK PROXY" : "DIRECT";
    }
  }
  updateProxyBadge();

  // Category normalization & matching
  const CAT_SYNONYMS = {
    "Entertainment": ["entertainment", "general", "series", "comedy", "variety"],
    "Movies": ["movie", "movies", "film", "films", "cinema"],
    "Sports": ["sport", "sports", "football", "cricket"],
    "News": ["news", "weather", "business"],
    "Music": ["music", "songs"],
    "Kids": ["kids", "children", "animation", "family"],
    "Devotional": ["devotional", "religious", "spiritual", "culture"],
    "Infotainment": ["infotainment", "documentary", "education", "science", "travel", "lifestyle", "cooking"]
  };

  function matchCategory(chCat, selectedCat) {
    if (selectedCat === "All") return true;
    const catLower = (chCat || "").toLowerCase();
    const target = selectedCat.toLowerCase();
    if (catLower.includes(target)) return true;

    const synonyms = CAT_SYNONYMS[selectedCat];
    if (synonyms) {
      return synonyms.some(syn => catLower.includes(syn));
    }
    return false;
  }

  // Language matching (supports 3-letter codes & full names)
  const LANG_CODES = {
    "Hindi": ["hindi", "hin"],
    "Kannada": ["kannada", "kan"],
    "Telugu": ["telugu", "tel"],
    "Tamil": ["tamil", "tam"],
    "English": ["english", "eng"]
  };

  function matchLanguage(ch, selectedLang) {
    if (selectedLang === "All") return true;
    const langLower = (ch.language || "").toLowerCase();
    const nameLower = (ch.name || "").toLowerCase();
    const target = selectedLang.toLowerCase();

    if (langLower.includes(target) || nameLower.includes(target)) return true;

    const codes = LANG_CODES[selectedLang];
    if (codes) {
      return codes.some(c => langLower.includes(c) || nameLower.includes(`(${c})`) || nameLower.includes(`[${c}]`));
    }
    return false;
  }

  // Apply filters and slice initial chunk
  function applyFilters() {
    const q = (searchInput ? searchInput.value : "").trim().toLowerCase();

    filteredChannels = allChannels.filter(ch => {
      // Favorites filter
      if (showOnlyFavorites && !favorites.has(ch.name)) return false;
      // Category
      if (!matchCategory(ch.category, currentCategory)) return false;
      // Language
      if (!matchLanguage(ch, currentLanguage)) return false;
      // Search query
      if (q) {
        const name = (ch.name || "").toLowerCase();
        const cat = (ch.category || "").toLowerCase();
        const lang = (ch.language || "").toLowerCase();
        if (!name.includes(q) && !cat.includes(q) && !lang.includes(q)) return false;
      }
      return true;
    });

    if (channelCount) {
      channelCount.textContent = `Showing ${filteredChannels.length} Channels`;
    }

    // Reset grid & render first chunk
    renderedCount = 0;
    if (channelGrid) {
      channelGrid.innerHTML = "";
    }
    renderNextChunk();
  }

  // Progressive rendering (60 at a time for 60fps responsiveness)
  function renderNextChunk() {
    if (!channelGrid) return;
    if (renderedCount >= filteredChannels.length) {
      if (filteredChannels.length === 0) {
        if (showOnlyFavorites) {
          channelGrid.innerHTML = `
            <div class="empty-state-card">
              <i class="ri-heart-3-line"></i>
              <h3>No Favorites Added Yet</h3>
              <p>Tap the heart icon on any channel to add it to your favorite channels list.</p>
              <button class="btn-jio" onclick="document.getElementById('tabNavLive').click()">Browse Live TV</button>
            </div>
          `;
        } else {
          channelGrid.innerHTML = `
            <div class="empty-state-card">
              <i class="ri-search-2-line"></i>
              <h3>No Channels Found</h3>
              <p>Try searching with another keyword or pick another category / language.</p>
              <button class="btn-jio" onclick="document.querySelector('.cat-tab[data-cat=\\'All\\']').click()">Show All Channels</button>
            </div>
          `;
        }
      }
      return;
    }

    const chunk = filteredChannels.slice(renderedCount, renderedCount + CHUNK_SIZE);
    const frag = document.createDocumentFragment();

    chunk.forEach(ch => {
      const isActive = activeChannel && (activeChannel.name === ch.name && activeChannel.stream_url === ch.stream_url);
      const isFav = favorites.has(ch.name);
      const isFree = ch.is_free || (ch.category || "").toLowerCase().includes("news") || (ch.name || "").toLowerCase().includes("news");
      const isLocked = !currentSubscription.is_active && !isFree;

      const card = document.createElement("div");
      card.className = `jio-channel-card ${isActive ? "active" : ""} ${isLocked ? "card-locked" : ""}`;
      card.dataset.channelName = ch.name;

      const fallbackInitial = (ch.logo_char || (ch.name || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "TV");
      const logoHtml = ch.logo
        ? `<span>${fallbackInitial}</span><img src="${ch.logo}" alt="${ch.name}" loading="lazy" onload="this.style.opacity='1'" onerror="this.remove()" style="opacity:0;" />`
        : `<span>${fallbackInitial}</span>`;

      let lockBadge = "";
      if (isLocked) {
        lockBadge = `<span class="pill-locked"><i class="ri-lock-2-fill"></i> VIP</span>`;
      } else if (isFree) {
        lockBadge = `<span class="pill-free-badge"><i class="ri-gift-line"></i> FREE</span>`;
      }

      card.innerHTML = `
        <div class="card-logo-box">
          ${logoHtml}
          ${isLocked ? '<div class="card-lock-curtain"><i class="ri-lock-2-fill"></i></div>' : ''}
        </div>
        <div class="card-details">
          <h3>${ch.name}</h3>
          <p class="card-now-playing">${isLocked ? "Subscription Required to Watch" : "Live Broadcast Program"}</p>
          <div class="card-badge-row">
            <span class="pill-live"><i class="ri-record-circle-line"></i> LIVE</span>
            <span class="pill-genre">${ch.category || "General"}</span>
            ${lockBadge}
            ${isFav ? '<span class="pill-genre" style="color:#f87171;"><i class="ri-heart-fill"></i></span>' : ''}
          </div>
        </div>
      `;

      card.addEventListener("click", () => {
        if (isLocked) {
          showSubscriptionLocked(ch);
        } else {
          playChannel(ch);
        }
      });
      frag.appendChild(card);
    });

    channelGrid.appendChild(frag);
    renderedCount += chunk.length;
  }

  // Infinite scroll trigger on window
  window.addEventListener("scroll", () => {
    if (renderedCount < filteredChannels.length) {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        renderNextChunk();
      }
    }
  }, { passive: true });

  // Show Subscription Locked screen
  function showSubscriptionLocked(channel) {
    if (subLockOverlay) {
      const heading = document.getElementById("lockHeading");
      const msg = document.getElementById("lockMsg");
      if (heading) heading.textContent = "10 Days Free Plan Expired";
      if (msg) {
        msg.textContent = `Your 10 days free trial with 10,000+ channels has ended. You need to buy a monthly plan (₹99 / ₹299 / ₹1,199) to unlock ${channel ? `"${channel.name}"` : 'channels'} and all 10,000+ live feeds!`;
      }
      subLockOverlay.classList.remove("hidden");
    }
    if (video) {
      video.pause();
    }
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
    openSubscriptionModal("plans");
  }

  function hideSubscriptionLocked() {
    if (subLockOverlay) {
      subLockOverlay.classList.add("hidden");
    }
  }

  // Play channel with HLS or native HTML5 video
  function playChannel(channel) {
    if (!channel || !video) return;

    // Check if channel is locked
    const isFree = channel.is_free || (channel.category || "").toLowerCase().includes("news") || (channel.name || "").toLowerCase().includes("news");
    if (!currentSubscription.is_active && !isFree) {
      showSubscriptionLocked(channel);
      return;
    }
    hideSubscriptionLocked();

    activeChannel = channel;

    // Update Player Metadata
    if (overlayChannelName) overlayChannelName.textContent = channel.name;
    if (channelTitle) channelTitle.textContent = channel.name;
    if (showTitle) showTitle.textContent = `Live Telecast - ${channel.category || 'General'}`;
    if (channelCategory) channelCategory.textContent = channel.category || 'General';
    if (epgCurrentName) epgCurrentName.textContent = `${channel.name} - Prime Slot`;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (showTiming) showTiming.innerHTML = `<i class="ri-time-line"></i> Live Feed (${timeStr})`;

    const fallbackInitial = (channel.logo_char || (channel.name || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "TV");
    if (channelAvatar) {
      channelAvatar.style.position = "relative";
      if (channel.logo) {
        channelAvatar.innerHTML = `<span>${fallbackInitial}</span><img src="${channel.logo}" alt="${channel.name}" onload="this.style.opacity='1'" onerror="this.remove()" style="opacity:0; position:absolute; inset:0; width:100%; height:100%; object-fit:contain; background:#12141e;" />`;
      } else {
        channelAvatar.innerHTML = `<span>${fallbackInitial}</span>`;
      }
    }

    // Favorite state update
    updateFavoriteBtn();

    // Active card highlighting in grid
    document.querySelectorAll(".jio-channel-card.active").forEach(el => el.classList.remove("active"));
    const activeEl = document.querySelector(`.jio-channel-card[data-channel-name="${CSS.escape(channel.name)}"]`);
    if (activeEl) activeEl.classList.add("active");

    // Build URL (Direct or Flask Proxy)
    let streamUrl = channel.stream_url;
    if (useProxy) {
      streamUrl = `/proxy/stream?url=${encodeURIComponent(channel.stream_url)}&user_id=${encodeURIComponent(currentUserId)}`;
    }
    updateProxyBadge();

    // Clean previous player and reset error screen
    hideNetworkError();
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    let streamPlaybackStarted = false;
    const playTimeout = setTimeout(() => {
      // If after 9 seconds of waiting the video still has not started playing, show network is not there
      if (!streamPlaybackStarted && video && (video.paused || video.readyState < 2)) {
        showNetworkError(`Network is not there or "${channel.name}" feed is not responding.`);
      }
    }, 9000);

    const onPlaying = () => {
      streamPlaybackStarted = true;
      clearTimeout(playTimeout);
      hideNetworkError();
      updatePlayPauseIcons(false);
      video.removeEventListener("playing", onPlaying);
    };
    video.addEventListener("playing", onPlaying, { once: true });

    if (streamUrl.includes(".m3u8") && Hls.isSupported()) {
      hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsInstance.loadSource(streamUrl);
      hlsInstance.attachMedia(video);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => { });
        updatePlayPauseIcons(false);
      });

      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal && !useProxy) {
          console.warn("Direct stream restricted by CORS, auto-switching to Flask proxy...");
          useProxy = true;
          updateProxyBadge();
          showToast("Retrying via Flask proxy (CORS bypass)...", "ri-shield-check-line");
          playChannel(activeChannel);
        } else if (data.fatal && useProxy) {
          console.warn("Fatal stream error:", data.type);
          clearTimeout(playTimeout);
          showNetworkError(`Network is not there. Server for "${channel.name}" is offline or stream is down.`);
        }
      });
    } else {
      // Non-HLS or native HLS (Safari/iOS)
      if (useProxy && streamUrl.startsWith("http") && !streamUrl.startsWith(window.location.origin)) {
        streamUrl = `/proxy/stream?url=${encodeURIComponent(streamUrl)}&user_id=${encodeURIComponent(currentUserId)}`;
      }
      video.src = streamUrl;
      video.play().catch(() => { });
      updatePlayPauseIcons(false);

      video.onerror = () => {
        clearTimeout(playTimeout);
        showNetworkError(`Network is not there or "${channel.name}" feed cannot be reached.`);
      };
    }
  }

  // Play / Pause handling
  function updatePlayPauseIcons(isPaused) {
    if (btnPlayPause) {
      btnPlayPause.innerHTML = isPaused ? `<i class="ri-play-line"></i>` : `<i class="ri-pause-line"></i>`;
    }
    if (playPauseOverlay) {
      playPauseOverlay.innerHTML = isPaused ? `<i class="ri-play-fill icon-huge"></i>` : `<i class="ri-pause-fill icon-huge"></i>`;
    }
  }

  function togglePlay() {
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => { });
      updatePlayPauseIcons(false);
    } else {
      video.pause();
      updatePlayPauseIcons(true);
    }
  }

  if (btnPlayPause) btnPlayPause.addEventListener("click", togglePlay);
  if (playPauseOverlay) playPauseOverlay.addEventListener("click", togglePlay);
  if (video) {
    video.addEventListener("play", () => updatePlayPauseIcons(false));
    video.addEventListener("pause", () => updatePlayPauseIcons(true));
  }

  // Mute / Unmute
  if (btnMute && video) {
    btnMute.addEventListener("click", () => {
      video.muted = !video.muted;
      btnMute.innerHTML = video.muted ? `<i class="ri-volume-mute-line"></i>` : `<i class="ri-volume-up-line"></i>`;
      showToast(video.muted ? "Muted" : "Unmuted", video.muted ? "ri-volume-mute-line" : "ri-volume-up-line");
    });
  }

  // Proxy toggle button
  if (btnToggleProxy) {
    btnToggleProxy.addEventListener("click", () => {
      useProxy = !useProxy;
      localStorage.setItem("tvUseProxy", useProxy ? "1" : "0");
      updateProxyBadge();
      showToast(useProxy ? "Flask Proxy Enabled (Bypass CORS)" : "Direct Stream Mode", "ri-shield-check-line");
      if (activeChannel) playChannel(activeChannel);
    });
  }

  // Picture in Picture
  if (btnPip && video) {
    btnPip.addEventListener("click", async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (document.pictureInPictureEnabled) {
          await video.requestPictureInPicture();
        }
      } catch (e) {
        showToast("PiP not supported or blocked", "ri-error-warning-line");
      }
    });
  }

  // Fullscreen with Mobile Screen Orientation Auto-Adjust & Fullscreen Back Button
  const btnToggleFit = document.getElementById("btnToggleFit");
  const btnFsBack = document.getElementById("btnFsBack");

  function toggleAspectFit() {
    if (!videoBox) return;
    const isFilled = videoBox.classList.toggle("video-fill-screen");
    showToast(isFilled ? "Draw Fullscreen: Edge-to-Edge Zoom" : "Original: 16:9 Proportional Fit", "ri-aspect-ratio-line");
    if (btnToggleFit) {
      btnToggleFit.classList.toggle("active", isFilled);
      btnToggleFit.title = isFilled ? "Aspect Ratio: Fill Screen (Tap for 16:9)" : "Aspect Ratio: 16:9 (Tap to Draw Fullscreen)";
    }
  }

  if (btnToggleFit) {
    btnToggleFit.addEventListener("click", toggleAspectFit);
  }

  // Double-tap on videoBox to toggle zoom / draw full screen (ignore clicks on interactive controls)
  let lastTapTime = 0;
  if (videoBox) {
    videoBox.addEventListener("touchend", (e) => {
      if (e.target.closest("button, input, select, a, .ctrl-btn, .edge-arrow")) {
        return;
      }
      const currentTime = Date.now();
      const tapInterval = currentTime - lastTapTime;
      if (tapInterval < 320 && tapInterval > 0) {
        toggleAspectFit();
        e.preventDefault();
      }
      lastTapTime = currentTime;
    });
  }

  // Android App Native Insets Bridge for Auto-Padding on Cutouts / Notches / Pill Bars
  window.setAndroidAppInsets = function(topDp, bottomDp, leftDp, rightDp, isLandscape) {
    document.documentElement.classList.add("is-android-native-app");
    document.body.classList.add("is-android-native-app");
    
    // Inject exact native padding directly to CSS variables
    document.documentElement.style.setProperty("--safe-top", topDp + "px");
    document.documentElement.style.setProperty("--safe-bottom", bottomDp + "px");
    document.documentElement.style.setProperty("--safe-left", leftDp + "px");
    document.documentElement.style.setProperty("--safe-right", rightDp + "px");

    if (isLandscape) {
      document.body.classList.add("android-landscape-fullscreen");
    } else {
      document.body.classList.remove("android-landscape-fullscreen");
    }
  };

  // Detect Android WebView user agent flag on startup
  if (navigator.userAgent && navigator.userAgent.includes("MyCountryTV-AndroidApp")) {
    document.documentElement.classList.add("is-android-native-app");
    document.body.classList.add("is-android-native-app");
  }

  // Mobile Orientation Auto-Adjust handler
  window.handleAppOrientationChange = function() {
    if (window.innerWidth > window.innerHeight) {
      // Landscape: auto-scroll to video player for maximum canvas view
      if (videoBox) {
        videoBox.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  window.addEventListener("orientationchange", () => {
    setTimeout(window.handleAppOrientationChange, 200);
  });

  function enterFullscreen() {
    if (!videoBox) return;
    if (videoBox.requestFullscreen) {
      videoBox.requestFullscreen().catch(() => {
        videoBox.classList.add("is-fullscreen");
        document.body.classList.add("has-fullscreen");
        updateFullscreenUI();
      });
    } else if (videoBox.webkitRequestFullscreen) {
      videoBox.webkitRequestFullscreen();
    } else if (video && video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    } else {
      videoBox.classList.add("is-fullscreen");
      document.body.classList.add("has-fullscreen");
      updateFullscreenUI();
    }
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock("landscape").catch(() => {});
    }
  }

  function exitFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
    if (videoBox) videoBox.classList.remove("is-fullscreen");
    document.body.classList.remove("has-fullscreen");
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
    updateFullscreenUI();
  }

  if (btnFullscreen && videoBox) {
    btnFullscreen.addEventListener("click", () => {
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || videoBox.classList.contains("is-fullscreen"));
      if (!isFs) {
        enterFullscreen();
      } else {
        exitFullscreen();
      }
    });
  }

  if (btnFsBack) {
    btnFsBack.addEventListener("click", () => {
      exitFullscreen();
    });
  }

  function updateFullscreenUI() {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || (videoBox && videoBox.classList.contains("is-fullscreen")));
    if (videoBox) {
      videoBox.classList.toggle("is-fullscreen", isFs);
    }
    document.body.classList.toggle("has-fullscreen", isFs);
    if (btnFullscreen) {
      btnFullscreen.innerHTML = isFs ? `<i class="ri-fullscreen-exit-line"></i>` : `<i class="ri-fullscreen-line"></i>`;
      btnFullscreen.title = isFs ? "Exit Fullscreen" : "Fullscreen";
    }
    if (btnFsBack) {
      btnFsBack.classList.toggle("hidden", !isFs);
    }
    showControls();
  }

  document.addEventListener("fullscreenchange", updateFullscreenUI);
  document.addEventListener("webkitfullscreenchange", updateFullscreenUI);

  // 0.2s smooth animation to hide all screen controls after inactivity
  let controlsIdleTimer = null;

  function showControls() {
    if (!videoBox) return;
    videoBox.classList.remove("controls-hidden");
    videoBox.classList.add("controls-visible");
    videoBox.style.cursor = "default";
    clearTimeout(controlsIdleTimer);

    // Auto-hide after 2.5 seconds of no mouse movement (both normal & fullscreen)
    controlsIdleTimer = setTimeout(() => {
      // Keep controls visible if video is paused so user can easily play
      if (video && !video.paused) {
        hideControls();
      }
    }, 2500);
  }

  function hideControls() {
    if (!videoBox) return;
    videoBox.classList.remove("controls-visible");
    videoBox.classList.add("controls-hidden");
    videoBox.style.cursor = "none";
  }

  if (videoBox) {
    videoBox.addEventListener("mousemove", showControls);
    videoBox.addEventListener("mouseenter", showControls);
    videoBox.addEventListener("mouseleave", () => {
      if (video && !video.paused) {
        hideControls();
      }
    });
    videoBox.addEventListener("click", (e) => {
      // If clicking inside videoBox when controls were hidden, reveal them first
      if (videoBox.classList.contains("controls-hidden")) {
        showControls();
        e.stopPropagation();
      }
    });
    videoBox.addEventListener("touchstart", showControls, { passive: true });
  }

  // Favorite button
  function updateFavoriteBtn() {
    if (!btnFavorite) return;
    const isFav = activeChannel && favorites.has(activeChannel.name);
    btnFavorite.classList.toggle("favorited", !!isFav);
    btnFavorite.innerHTML = isFav
      ? `<i class="ri-heart-fill"></i> <span>Favorited</span>`
      : `<i class="ri-heart-line"></i> <span>Favorite</span>`;
  }

  if (btnFavorite) {
    btnFavorite.addEventListener("click", () => {
      if (!activeChannel) return showToast("Select a channel first");
      if (favorites.has(activeChannel.name)) {
        favorites.delete(activeChannel.name);
        showToast(`Removed ${activeChannel.name} from Favorites`, "ri-heart-line");
      } else {
        favorites.add(activeChannel.name);
        showToast(`Added ${activeChannel.name} to Favorites`, "ri-heart-fill");
      }
      localStorage.setItem("jio_favorites", JSON.stringify([...favorites]));
      updateFavoriteBtn();
      // Update badge on channel card
      const card = document.querySelector(`.jio-channel-card[data-channel-name="${CSS.escape(activeChannel.name)}"]`);
      if (card) {
        const badgeRow = card.querySelector(".card-badge-row");
        if (badgeRow) {
          let favBadge = badgeRow.querySelector(".pill-genre i.ri-heart-fill")?.parentElement;
          if (favorites.has(activeChannel.name)) {
            if (!favBadge) {
              const span = document.createElement("span");
              span.className = "pill-genre";
              span.style.color = "#f87171";
              span.innerHTML = '<i class="ri-heart-fill"></i>';
              badgeRow.appendChild(span);
            }
          } else if (favBadge) {
            favBadge.remove();
          }
        }
      }
    });
  }

  // Share button
  if (btnShare) {
    btnShare.addEventListener("click", () => {
      if (!activeChannel) return showToast("Select a channel first");
      const shareText = `${activeChannel.name} - Watch Live on JioTV: ${activeChannel.stream_url}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareText).then(() => {
          showToast("Channel stream link copied to clipboard!", "ri-clipboard-line");
        }).catch(() => {
          showToast(activeChannel.stream_url);
        });
      } else {
        showToast(activeChannel.stream_url);
      }
    });
  }

  // Category Tab Selection
  if (categoryStrip) {
    categoryStrip.querySelectorAll(".cat-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        categoryStrip.querySelectorAll(".cat-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        currentCategory = tab.getAttribute("data-cat") || "All";
        if (currentCategoryTitle) {
          currentCategoryTitle.textContent = currentCategory === "All" ? "All Live Channels" : `${currentCategory} Channels`;
        }
        applyFilters();
      });
    });
  }

  // Language filter dropdown
  if (langFilter) {
    langFilter.addEventListener("change", (e) => {
      currentLanguage = e.target.value;
      applyFilters();
    });
  }

  // Search input & debounce
  let searchDebounce = null;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const val = searchInput.value.trim();
      if (clearSearch) clearSearch.classList.toggle("hidden", val.length === 0);
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(applyFilters, 200);
    });
  }

  if (clearSearch && searchInput) {
    clearSearch.addEventListener("click", () => {
      searchInput.value = "";
      clearSearch.classList.add("hidden");
      applyFilters();
      searchInput.focus();
    });
  }

  // Logo click resets to "For You" / All
  const jioLogo = document.querySelector(".jio-logo");
  if (jioLogo) {
    jioLogo.addEventListener("click", () => {
      currentCategory = "All";
      currentLanguage = "All";
      if (langFilter) langFilter.value = "All";
      if (searchInput) {
        searchInput.value = "";
        if (clearSearch) clearSearch.classList.add("hidden");
      }
      if (categoryStrip) {
        categoryStrip.querySelectorAll(".cat-tab").forEach(t => t.classList.remove("active"));
        const firstTab = categoryStrip.querySelector('.cat-tab[data-cat="All"]');
        if (firstTab) firstTab.classList.add("active");
      }
      if (currentCategoryTitle) currentCategoryTitle.textContent = "All Live Channels";
      applyFilters();
    });
  }

  // M3U Modal Open / Close
  const toggleModal = (show) => {
    if (playlistModal) playlistModal.classList.toggle("hidden", !show);
  };

  if (btnOpenPlaylistModal) btnOpenPlaylistModal.addEventListener("click", () => toggleModal(true));
  if (mobPlaylistOpen) mobPlaylistOpen.addEventListener("click", () => toggleModal(true));
  if (btnCloseModal) btnCloseModal.addEventListener("click", () => toggleModal(false));
  if (playlistModal) {
    playlistModal.addEventListener("click", (e) => {
      if (e.target === playlistModal) toggleModal(false);
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggleModal(false);
  });

  // Load M3U Playlist
  if (btnLoadPlaylist && playlistUrlInput) {
    btnLoadPlaylist.addEventListener("click", async () => {
      const url = playlistUrlInput.value.trim();
      if (!url) return alert("Please enter a valid M3U playlist URL");

      btnLoadPlaylist.textContent = "Loading...";
      btnLoadPlaylist.disabled = true;

      try {
        const res = await fetch("/api/load_m3u", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.status === "success") {
          showToast(`Loaded ${data.total_channels} channels!`, "ri-check-line");
          toggleModal(false);
          fetchChannels();
        } else {
          alert("Failed to load playlist: " + (data.message || "Unknown error"));
        }
      } catch (err) {
        alert("Error loading playlist: " + err.message);
      } finally {
        btnLoadPlaylist.textContent = "Load Playlist";
        btnLoadPlaylist.disabled = false;
      }
    });
  }

  // Sections
  const channelsSection = document.getElementById("channelsSection");
  const catchupSection = document.getElementById("catchupSection");
  const activeFilterBadge = document.getElementById("activeFilterBadge");

  // Bottom Navigation Handling: Home | Live TV | Catch-up | Favorites | Account
  function switchBottomNavTab(targetTab) {
    currentBottomTab = targetTab;
    document.querySelectorAll(".jio-bottom-bar .bar-tab").forEach(t => {
      t.classList.toggle("active", t.dataset.tab === targetTab);
    });

    if (targetTab === "home") {
      showOnlyFavorites = false;
      if (activeFilterBadge) activeFilterBadge.classList.add("hidden");
      if (currentCategoryTitle) currentCategoryTitle.textContent = "All Live Channels";
      if (channelsSection) channelsSection.classList.remove("hidden");
      if (catchupSection) catchupSection.classList.add("hidden");
      applyFilters();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (targetTab === "live") {
      showOnlyFavorites = false;
      if (activeFilterBadge) activeFilterBadge.classList.add("hidden");
      if (currentCategoryTitle) currentCategoryTitle.textContent = "Live TV Channels";
      if (channelsSection) channelsSection.classList.remove("hidden");
      if (catchupSection) catchupSection.classList.add("hidden");
      applyFilters();
      if (channelsSection) channelsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (targetTab === "catchup") {
      if (channelsSection) channelsSection.classList.add("hidden");
      if (catchupSection) {
        catchupSection.classList.remove("hidden");
        catchupSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      renderCatchupTimeline(activeChannel);
    } else if (targetTab === "favorites") {
      showOnlyFavorites = true;
      if (activeFilterBadge) {
        activeFilterBadge.textContent = "Favorites Only";
        activeFilterBadge.classList.remove("hidden");
      }
      if (currentCategoryTitle) currentCategoryTitle.textContent = "My Favorite Channels";
      if (channelsSection) channelsSection.classList.remove("hidden");
      if (catchupSection) catchupSection.classList.add("hidden");
      applyFilters();
      if (channelsSection) channelsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (targetTab === "account") {
      openAccountDrawer();
    }
  }

  document.querySelectorAll(".jio-bottom-bar .bar-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      switchBottomNavTab(tab.dataset.tab);
    });
  });

  // Header Brand Logo click goes to Home
  const headerBrandLogo = document.getElementById("headerBrandLogo");
  if (headerBrandLogo) {
    headerBrandLogo.addEventListener("click", () => {
      switchBottomNavTab("home");
    });
  }

  // User avatar click
  if (userAvatar) {
    userAvatar.addEventListener("click", () => {
      showToast(`JioTV Online • ${allChannels.length} Channels Loaded`, "ri-tv-line");
    });
  }

  // Keyboard navigation for channels (Left / Right arrows)
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      stepChannel(1);
      e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      stepChannel(-1);
      e.preventDefault();
    } else if (e.key === " ") {
      togglePlay();
      e.preventDefault();
    } else if (e.key === "m" || e.key === "M") {
      if (btnMute) btnMute.click();
    } else if (e.key === "f" || e.key === "F") {
      if (btnFullscreen) btnFullscreen.click();
    }
  });

  function stepChannel(direction) {
    if (!filteredChannels.length) return;
    let idx = filteredChannels.findIndex(c => activeChannel && c.name === activeChannel.name);
    idx = (idx === -1 ? 0 : idx + direction + filteredChannels.length) % filteredChannels.length;
    playChannel(filteredChannels[idx]);
  }

  // Fetch Channels from backend
  async function fetchChannels() {
    try {
      const res = await fetch(`/api/channels?user_id=${encodeURIComponent(currentUserId)}`);
      const data = await res.json();
      if (data.status === "success") {
        if (data.subscription) {
          updateSubscriptionState(data.subscription);
        }
        allChannels = data.channels || [];

        // Dynamically add any missing languages to dropdown without duplicating
        if (langFilter && data.languages) {
          const currentOptions = new Set(Array.from(langFilter.options).map(o => o.value.toLowerCase()));
          data.languages.forEach(lang => {
            if (lang && !currentOptions.has(lang.toLowerCase())) {
              const opt = document.createElement("option");
              opt.value = lang;
              opt.textContent = lang;
              langFilter.appendChild(opt);
              currentOptions.add(lang.toLowerCase());
            }
          });
        }

        applyFilters();

        // Autoplay first channel if none is playing
        if (!activeChannel && filteredChannels.length > 0) {
          playChannel(filteredChannels[0]);
        }
      }
    } catch (err) {
      if (channelGrid) {
        channelGrid.innerHTML = `<div class="jio-loading-spinner"><p>Unable to load channels. Ensure backend server is running.</p></div>`;
      }
    }
  }

  // Service Worker Registration for PWA / Android WebAPK
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  // Mobile App Modal & Dual Network (LAN / WAN) handling
  let deferredPrompt = null;
  const mobileAppModal = document.getElementById("mobileAppModal");
  const btnMobileApp = document.getElementById("btnMobileApp");
  const mobInstallTab = document.getElementById("mobInstallTab");
  const btnCloseMobileModal = document.getElementById("btnCloseMobileModal");
  const pwaDirectBanner = document.getElementById("pwaDirectBanner");
  const btnPwaDirectInstall = document.getElementById("btnPwaDirectInstall");
  const lanUrlDisplay = document.getElementById("lanUrlDisplay");
  const lanUrlInput = document.getElementById("lanUrlInput");
  const btnCopyLanUrl = document.getElementById("btnCopyLanUrl");

  // Dual Network UI Elements
  const btnNetModeLan = document.getElementById("btnNetModeLan");
  const btnNetModeWan = document.getElementById("btnNetModeWan");
  const networkTitleDesc = document.getElementById("networkTitleDesc");
  const networkExplainerText = document.getElementById("networkExplainerText");
  const tagLanIp = document.getElementById("tagLanIp");
  const tagWanIp = document.getElementById("tagWanIp");
  const qrCodeImg = document.getElementById("qrCodeImg");
  const qrCaptionText = document.getElementById("qrCaptionText");

  let serverNetworkData = {
    lan_url: "http://127.0.0.1:5000",
    wan_url: "http://127.0.0.1:5000",
    lan_ip: "127.0.0.1",
    wan_ip: "127.0.0.1",
    activeMode: "lan"
  };

  function setNetworkMode(mode) {
    serverNetworkData.activeMode = mode;
    const isLan = mode === "lan";
    const targetUrl = isLan ? serverNetworkData.lan_url : serverNetworkData.wan_url;

    if (btnNetModeLan) btnNetModeLan.classList.toggle("active", isLan);
    if (btnNetModeWan) btnNetModeWan.classList.toggle("active", !isLan);

    if (lanUrlDisplay) lanUrlDisplay.textContent = targetUrl;
    if (lanUrlInput) lanUrlInput.value = targetUrl;

    if (qrCodeImg) {
      qrCodeImg.src = `/api/qr-code?mode=${mode}&t=${Date.now()}`;
    }

    if (qrCaptionText) {
      qrCaptionText.innerHTML = `<i class="ri-qr-scan-2-line"></i> Scan with Phone Camera to Open`;
    }

    if (networkTitleDesc) {
      networkTitleDesc.textContent = "Scan QR to Open on Mobile";
    }

    if (networkExplainerText) {
      networkExplainerText.innerHTML = `Scan with your phone camera or QR scanner to open My Country TV directly without typing any address.`;
    }
  }

  if (btnNetModeLan) btnNetModeLan.addEventListener("click", () => setNetworkMode("lan"));
  if (btnNetModeWan) btnNetModeWan.addEventListener("click", () => setNetworkMode("wan"));

  // Fetch local LAN & WAN URLs dynamically from server
  fetch("/api/server-info")
    .then(r => r.json())
    .then(data => {
      if (data) {
        serverNetworkData.lan_url = data.lan_url || serverNetworkData.lan_url;
        serverNetworkData.wan_url = data.wan_url || serverNetworkData.wan_url;
        serverNetworkData.lan_ip = data.lan_ip || serverNetworkData.lan_ip;
        serverNetworkData.wan_ip = data.wan_ip || serverNetworkData.wan_ip;

        if (tagLanIp) {
          tagLanIp.innerHTML = "";
        }
        if (tagWanIp) {
          tagWanIp.innerHTML = "";
        }

        // Default initialize to LAN
        setNetworkMode("lan");
      }
    })
    .catch(() => {});

  // Intercept beforeinstallprompt for instant 1-tap Android install
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (pwaDirectBanner) pwaDirectBanner.classList.remove("hidden");
  });

  if (btnPwaDirectInstall) {
    btnPwaDirectInstall.addEventListener("click", async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          showToast("App installed to your Android device!", "ri-check-line");
          closeMobileModal();
        }
        deferredPrompt = null;
      }
    });
  }

  function openMobileModal() {
    if (mobileAppModal) mobileAppModal.classList.remove("hidden");
  }

  function closeMobileModal() {
    if (mobileAppModal) mobileAppModal.classList.add("hidden");
  }

  if (btnMobileApp) btnMobileApp.addEventListener("click", openMobileModal);
  if (mobInstallTab) mobInstallTab.addEventListener("click", openMobileModal);
  if (btnCloseMobileModal) btnCloseMobileModal.addEventListener("click", closeMobileModal);
  if (mobileAppModal) {
    mobileAppModal.addEventListener("click", (e) => {
      if (e.target === mobileAppModal) closeMobileModal();
    });
  }

  if (btnCopyLanUrl && lanUrlInput) {
    btnCopyLanUrl.addEventListener("click", () => {
      navigator.clipboard.writeText(lanUrlInput.value).then(() => {
        showToast("URL copied to clipboard!", "ri-file-copy-line");
      }).catch(() => {
        lanUrlInput.select();
        document.execCommand("copy");
        showToast("URL copied to clipboard!", "ri-file-copy-line");
      });
    });
  }

  // ==========================================
  // SUBSCRIPTION & UPI PAYMENT LOGIC
  // ==========================================

function updateSubscriptionState(sub) {
    currentSubscription = sub;

    const subBadgeIcon = document.getElementById("subBadgeIcon");
    const planStatusBanner = document.getElementById("planStatusBanner");
    const statusBannerTitle = document.getElementById("statusBannerTitle");
    const statusBannerMsg = document.getElementById("statusBannerMsg");
    const freePlanCardStatus = document.getElementById("freePlanCardStatus");
    const btnClaimFreePlan = document.getElementById("btnClaimFreePlan");

    if (sub.is_active) {
      isSubscriptionActive = true;
      if (sub.is_trial) {
        // 10 Days Free Plan is active
        if (btnSubscriptionStatus) {
          btnSubscriptionStatus.className = "sub-status-btn free-plan-active";
        }
        if (subBadgeIcon) {
          subBadgeIcon.innerHTML = `<i class="ri-gift-fill"></i>`;
        }
        const daysLeft = sub.trial_days_left !== undefined ? sub.trial_days_left : (sub.days_left || 10);
        if (headerSubText) {
          headerSubText.textContent = `Free Plan (${daysLeft}d left)`;
        }
        if (planStatusBanner) {
          planStatusBanner.className = "plan-status-banner banner-active-free";
          if (statusBannerTitle) statusBannerTitle.textContent = `10 Days Free Plan Active (${daysLeft} Days Left)`;
          if (statusBannerMsg) statusBannerMsg.textContent = `All 10,000+ live channels unlocked! After 10 days, you will need to buy a monthly plan.`;
        }
        if (freePlanCardStatus) {
          freePlanCardStatus.innerHTML = `<span class="badge-free-active"><i class="ri-checkbox-circle-fill"></i> Active (${daysLeft}d left)</span>`;
          freePlanCardStatus.classList.remove("hidden");
        }
        if (btnClaimFreePlan) {
          btnClaimFreePlan.classList.add("hidden");
        }
      } else {
        // Paid Monthly / Extended Plan is active
        if (btnSubscriptionStatus) {
          btnSubscriptionStatus.className = "sub-status-btn vip-active";
        }
        if (subBadgeIcon) {
          subBadgeIcon.innerHTML = `<i class="ri-vip-crown-2-fill"></i>`;
        }
        const daysLeft = sub.days_left || 30;
        if (headerSubText) {
          headerSubText.textContent = `${sub.plan_name || 'Monthly Plan'}: ${daysLeft}d left`;
        }
        if (planStatusBanner) {
          planStatusBanner.className = "plan-status-banner banner-active-vip";
          if (statusBannerTitle) statusBannerTitle.textContent = `${sub.plan_name || 'Monthly Plan'} Active (${daysLeft} Days Left)`;
          if (statusBannerMsg) statusBannerMsg.textContent = `VIP status active with high-speed streaming for all 10,000+ channels. Expires: ${sub.expires_at || ''}`;
        }
        if (freePlanCardStatus) {
          freePlanCardStatus.innerHTML = `<span class="badge-free-used"><i class="ri-check-line"></i> Free Trial Completed</span>`;
          freePlanCardStatus.classList.remove("hidden");
        }
        if (btnClaimFreePlan) {
          btnClaimFreePlan.classList.add("hidden");
        }
      }
      if (btnUserAccount) btnUserAccount.className = "user-btn active";
      if (subLockOverlay) subLockOverlay.classList.add("hidden");
    } else {
      // 10 Days Free Plan Expired!
      isSubscriptionActive = false;
      if (btnSubscriptionStatus) {
        btnSubscriptionStatus.className = "sub-status-btn expired-alert";
      }
      if (subBadgeIcon) {
        subBadgeIcon.innerHTML = `<i class="ri-error-warning-fill"></i>`;
      }
      if (headerSubText) {
        headerSubText.textContent = "Free Plan Expired • Buy Monthly Plan";
      }
      if (planStatusBanner) {
        planStatusBanner.className = "plan-status-banner banner-expired";
        if (statusBannerTitle) statusBannerTitle.textContent = `⚠️ 10 Days Free Plan Expired`;
        if (statusBannerMsg) statusBannerMsg.textContent = `Your 10 days free trial with 10,000+ channels has ended. You need to buy a monthly plan below to unlock all live channels.`;
      }
      if (freePlanCardStatus) {
        freePlanCardStatus.innerHTML = `<span class="badge-free-expired"><i class="ri-time-line"></i> 10 Days Expired</span>`;
        freePlanCardStatus.classList.remove("hidden");
      }
      if (btnClaimFreePlan) {
        btnClaimFreePlan.classList.add("hidden");
      }
    }

    // Refresh channel card locked statuses in the grid
    applyFilters();
  }

  async function refreshSubscriptionStatus() {
    try {
      const res = await fetch(`/api/subscription/status?user_id=${encodeURIComponent(currentUserId)}`);
      const data = await res.json();
      if (data.status === "success" && data.subscription) {
        updateSubscriptionState(data.subscription);
      }
    } catch (e) {
      console.warn("Failed to fetch subscription status:", e);
    }
  }

  function openSubscriptionModal(view = "plans") {
    if (!subscriptionModal) return;
    subscriptionModal.classList.remove("hidden");

    if (view === "plans") {
      if (plansSelectionView) plansSelectionView.classList.remove("hidden");
      if (upiPaymentView) upiPaymentView.classList.add("hidden");
      if (subSuccessView) subSuccessView.classList.add("hidden");
    } else if (view === "upi") {
      if (plansSelectionView) plansSelectionView.classList.add("hidden");
      if (upiPaymentView) upiPaymentView.classList.remove("hidden");
      if (subSuccessView) subSuccessView.classList.add("hidden");
    }
  }

  function closeSubscriptionModal() {
    if (subscriptionModal) subscriptionModal.classList.add("hidden");
  }

  if (btnSubscriptionStatus) btnSubscriptionStatus.addEventListener("click", () => openSubscriptionModal("plans"));
  if (btnUserAccount) btnUserAccount.addEventListener("click", () => openSubscriptionModal("plans"));
  if (btnCloseSubModal) btnCloseSubModal.addEventListener("click", closeSubscriptionModal);
  if (subscriptionModal) {
    subscriptionModal.addEventListener("click", (e) => {
      if (e.target === subscriptionModal) closeSubscriptionModal();
    });
  }

  // Plan Selection Handler
  document.querySelectorAll(".btn-select-plan").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const planId = btn.getAttribute("data-plan") || "3m";
      startUpiPayment(planId);
    });
  });

  // Start UPI Payment Flow
  async function startUpiPayment(planId) {
    selectedPlanId = planId;
    const planCard = document.querySelector(`.plan-card[data-plan="${planId}"]`);
    const price = planCard ? planCard.getAttribute("data-price") : "299";
    const duration = planId === "1m" ? "1 Month" : (planId === "3m" ? "3 Months" : "1 Year");

    if (summaryPlanName) summaryPlanName.textContent = `${duration} Pack`;
    if (summaryPlanAmount) summaryPlanAmount.textContent = `₹${price}`;

    try {
      showToast("Generating UPI payment details...", "ri-loader-4-line");
      const res = await fetch("/api/subscription/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUserId,
          plan_id: planId
        })
      });
      const data = await res.json();
      if (data.status === "success") {
        currentPayment = data;
        
        // Update QR code image
        if (upiQrCodeImg && data.upi && data.upi.qr_url) {
          upiQrCodeImg.src = data.upi.qr_url;
        }

        // Set UPI deep links
        const intentUrl = data.upi.intent_url;
        if (btnPayUpiDirect) btnPayUpiDirect.href = intentUrl;
        if (btnPayGPay) btnPayGPay.href = intentUrl.replace("upi://pay?", "tez://upi/pay?");
        if (btnPayPhonePe) btnPayPhonePe.href = intentUrl.replace("upi://pay?", "phonepe://pay?");
        if (btnPayPaytm) btnPayPaytm.href = intentUrl.replace("upi://pay?", "paytmmp://pay?");

        if (upiVpaDisplay) upiVpaDisplay.value = data.upi.vpa;

        openSubscriptionModal("upi");
      } else {
        alert("Unable to initiate payment: " + (data.message || "Unknown error"));
      }
    } catch (err) {
      alert("Error contacting payment server: " + err.message);
    }
  }

  if (btnBackToPlans) {
    btnBackToPlans.addEventListener("click", () => openSubscriptionModal("plans"));
  }

  // Copy VPA ID button
  if (btnCopyVpa && upiVpaDisplay) {
    btnCopyVpa.addEventListener("click", () => {
      navigator.clipboard.writeText(upiVpaDisplay.value).then(() => {
        showToast("UPI ID copied: " + upiVpaDisplay.value, "ri-file-copy-line");
      }).catch(() => {
        upiVpaDisplay.select();
        document.execCommand("copy");
        showToast("UPI ID copied: " + upiVpaDisplay.value, "ri-file-copy-line");
      });
    });
  }

  // Confirm UPI Payment button (Activates channels)
  if (btnConfirmUpiPayment) {
    btnConfirmUpiPayment.addEventListener("click", async () => {
      btnConfirmUpiPayment.disabled = true;
      btnConfirmUpiPayment.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Verifying Payment...`;

      try {
        const paymentId = currentPayment ? currentPayment.payment_id : "";
        const res = await fetch("/api/subscription/confirm-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: currentUserId,
            payment_id: paymentId,
            plan_id: selectedPlanId
          })
        });
        const data = await res.json();
        if (data.status === "success") {
          updateSubscriptionState(data.subscription);
          hideSubscriptionLocked();

          // Show Success Screen
          if (plansSelectionView) plansSelectionView.classList.add("hidden");
          if (upiPaymentView) upiPaymentView.classList.add("hidden");
          if (subSuccessView) subSuccessView.classList.remove("hidden");

          if (subDetailsCard) {
            subDetailsCard.innerHTML = `
              <div class="sub-detail-row">
                <span>Plan Activated:</span>
                <strong>${data.subscription.plan_name}</strong>
              </div>
              <div class="sub-detail-row">
                <span>Status:</span>
                <strong style="color:#22c55e;">Active VIP (All Channels Unlocked)</strong>
              </div>
              <div class="sub-detail-row">
                <span>Expires At:</span>
                <strong>${data.subscription.expires_at || '30+ Days'}</strong>
              </div>
            `;
          }

          showToast("Payment Successful! All channels unlocked.", "ri-checkbox-circle-fill");
        } else {
          alert("Payment confirmation failed: " + (data.message || "Unknown error"));
        }
      } catch (err) {
        alert("Payment confirmation error: " + err.message);
      } finally {
        btnConfirmUpiPayment.disabled = false;
        btnConfirmUpiPayment.innerHTML = `<i class="ri-checkbox-circle-line"></i> I Have Paid - Activate All Channels`;
      }
    });
  }

  if (btnSubSuccessClose) {
    btnSubSuccessClose.addEventListener("click", () => {
      closeSubscriptionModal();
      if (activeChannel) {
        playChannel(activeChannel);
      } else if (filteredChannels.length > 0) {
        playChannel(filteredChannels[0]);
      }
    });
  }

  // Subscription locked overlay buttons
  if (btnUnlockSubscription) {
    btnUnlockSubscription.addEventListener("click", () => {
      openSubscriptionModal("plans");
    });
  }

  if (btnSwitchToFreeNews) {
    btnSwitchToFreeNews.addEventListener("click", () => {
      hideSubscriptionLocked();
      // Switch category filter to "News" tab
      if (categoryStrip) {
        categoryStrip.querySelectorAll(".cat-tab").forEach(t => t.classList.remove("active"));
        const newsTab = categoryStrip.querySelector('.cat-tab[data-cat="News"]');
        if (newsTab) newsTab.classList.add("active");
        currentCategory = "News";
        if (currentCategoryTitle) currentCategoryTitle.textContent = "Free News Channels";
        applyFilters();
      }
      // Play first free news channel
      const firstFree = allChannels.find(c => (c.category || "").toLowerCase().includes("news") || (c.name || "").toLowerCase().includes("news"));
      if (firstFree) {
        playChannel(firstFree);
      }
    });
  }

  // Demo testing buttons for trial expiration and reset
  if (btnTestExpireTrial) {
    btnTestExpireTrial.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/subscription/reset-trial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: currentUserId, action: "expire" })
        });
        const data = await res.json();
        if (data.status === "success") {
          updateSubscriptionState(data.subscription);
          showToast("Simulated: 10 Days Free Plan Expired! Buy Monthly Plan.", "ri-alert-line");
          closeSubscriptionModal();
          // If playing non-free channel, lock it
          if (activeChannel && !(activeChannel.category || "").toLowerCase().includes("news") && !(activeChannel.name || "").toLowerCase().includes("news")) {
            showSubscriptionLocked(activeChannel);
          }
        }
      } catch (err) {
        alert("Error expiring trial: " + err.message);
      }
    });
  }

  if (btnTestResetTrial) {
    btnTestResetTrial.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/subscription/reset-trial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: currentUserId, action: "reset" })
        });
        const data = await res.json();
        if (data.status === "success") {
          updateSubscriptionState(data.subscription);
          hideSubscriptionLocked();
          showToast("10 Days Free Plan restored! All 10,000+ channels active.", "ri-checkbox-circle-fill");
          closeSubscriptionModal();
          if (activeChannel) playChannel(activeChannel);
        }
      } catch (err) {
        alert("Error resetting trial: " + err.message);
      }
    });
  }

  const btnClaimFreePlan = document.getElementById("btnClaimFreePlan");
  if (btnClaimFreePlan) {
    btnClaimFreePlan.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/subscription/activate-free-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: currentUserId })
        });
        const data = await res.json();
        if (data.status === "success") {
          showToast(data.message || "10 Days Free Plan Active!", "ri-checkbox-circle-fill");
          if (data.subscription) updateSubscriptionState(data.subscription);
          closeSubscriptionModal();
        } else {
          showToast(data.message || "Please select a monthly plan below.", "ri-alert-line");
        }
      } catch (err) {
        showToast("Error checking free plan: " + err.message, "ri-error-warning-line");
      }
    });
  }

  // ========================================================
  // THEME MANAGEMENT (Dark Mode / Light Mode)
  // ========================================================
  const themeToggleCheckbox = document.getElementById("themeToggleCheckbox");
  const themeToggleIcon = document.getElementById("themeToggleIcon");
  const themeStatusLabel = document.getElementById("themeStatusLabel");

  const savedTheme = localStorage.getItem("mctv_theme") || "dark";
  applyTheme(savedTheme);

  function applyTheme(theme) {
    if (theme === "light") {
      document.body.classList.remove("dark-theme");
      document.body.classList.add("light-theme");
      if (themeToggleCheckbox) themeToggleCheckbox.checked = false;
      if (themeToggleIcon) themeToggleIcon.className = "ri-sun-fill";
      if (themeStatusLabel) themeStatusLabel.textContent = "Light Mode Active";
    } else {
      document.body.classList.remove("light-theme");
      document.body.classList.add("dark-theme");
      if (themeToggleCheckbox) themeToggleCheckbox.checked = true;
      if (themeToggleIcon) themeToggleIcon.className = "ri-moon-fill";
      if (themeStatusLabel) themeStatusLabel.textContent = "Dark Mode Active";
    }
    localStorage.setItem("mctv_theme", theme);
  }

  if (themeToggleCheckbox) {
    themeToggleCheckbox.addEventListener("change", (e) => {
      applyTheme(e.target.checked ? "dark" : "light");
      showToast(e.target.checked ? "Dark Mode Enabled" : "Light Mode Enabled", "ri-contrast-2-line");
    });
  }

  // ========================================================
  // ACCOUNT DRAWER & PROFILE
  // ========================================================
  const accountDrawerModal = document.getElementById("accountDrawerModal");
  const btnCloseAccountDrawer = document.getElementById("btnCloseAccountDrawer");
  const drawerBtnLoginTrigger = document.getElementById("drawerBtnLoginTrigger");
  const drawerBtnLogout = document.getElementById("drawerBtnLogout");
  const drawerUserName = document.getElementById("drawerUserName");
  const drawerUserPhone = document.getElementById("drawerUserPhone");
  const drawerSubBadge = document.getElementById("drawerSubBadge");
  const drawerSubDesc = document.getElementById("drawerSubDesc");
  const drawerMenuSubscription = document.getElementById("drawerMenuSubscription");
  const drawerMenuFeedback = document.getElementById("drawerMenuFeedback");
  const drawerMenuAndroidApp = document.getElementById("drawerMenuAndroidApp");

  let loggedInUserPhone = localStorage.getItem("mctv_user_phone") || "";

  function openAccountDrawer() {
    updateAccountDrawerUI();
    if (accountDrawerModal) accountDrawerModal.classList.remove("hidden");
  }

  function closeAccountDrawer() {
    if (accountDrawerModal) accountDrawerModal.classList.add("hidden");
  }

  if (btnUserAccount) {
    btnUserAccount.addEventListener("click", openAccountDrawer);
  }

  if (btnCloseAccountDrawer) {
    btnCloseAccountDrawer.addEventListener("click", closeAccountDrawer);
  }

  if (drawerMenuSubscription) {
    drawerMenuSubscription.addEventListener("click", () => {
      closeAccountDrawer();
      openSubscriptionModal("plans");
    });
  }

  if (drawerMenuFeedback) {
    drawerMenuFeedback.addEventListener("click", () => {
      closeAccountDrawer();
      openFeedbackModal();
    });
  }

  if (drawerMenuAndroidApp) {
    drawerMenuAndroidApp.addEventListener("click", () => {
      closeAccountDrawer();
      openMobileModal();
    });
  }

  function updateAccountDrawerUI() {
    if (loggedInUserPhone) {
      if (drawerUserName) drawerUserName.textContent = "Subscriber";
      if (drawerUserPhone) drawerUserPhone.textContent = `+91 ${loggedInUserPhone}`;
      if (drawerBtnLoginTrigger) drawerBtnLoginTrigger.classList.add("hidden");
      if (drawerBtnLogout) drawerBtnLogout.classList.remove("hidden");
    } else {
      if (drawerUserName) drawerUserName.textContent = "Guest User";
      if (drawerUserPhone) drawerUserPhone.textContent = "+91 Not Logged In";
      if (drawerBtnLoginTrigger) drawerBtnLoginTrigger.classList.remove("hidden");
      if (drawerBtnLogout) drawerBtnLogout.classList.add("hidden");
    }

    if (currentSubscription) {
      const planName = currentSubscription.plan_name || "10 Days Free Plan";
      if (drawerSubBadge) drawerSubBadge.textContent = currentSubscription.is_active ? `${planName} Active` : "Subscription Expired";
      if (drawerSubDesc) drawerSubDesc.textContent = `${planName} • 10,000+ Channels`;
    }
  }

  // ========================================================
  // MOBILE NUMBER & OTP LOGIN (Mobile Only, No Google Login)
  // ========================================================
  const authModal = document.getElementById("authModal");
  const btnCloseAuthModal = document.getElementById("btnCloseAuthModal");
  const authStepPhone = document.getElementById("authStepPhone");
  const authStepOtp = document.getElementById("authStepOtp");
  const authStepSuccess = document.getElementById("authStepSuccess");
  const phoneNumberInput = document.getElementById("phoneNumberInput");
  const btnSendOtp = document.getElementById("btnSendOtp");
  const btnVerifyOtp = document.getElementById("btnVerifyOtp");
  const btnResendOtp = document.getElementById("btnResendOtp");
  const displayPhoneNum = document.getElementById("displayPhoneNum");
  const loggedInPhoneText = document.getElementById("loggedInPhoneText");
  const btnAuthSuccessClose = document.getElementById("btnAuthSuccessClose");
  const otpDigits = document.querySelectorAll(".otp-digit");

  let pendingAuthPhone = "";

  function openAuthModal() {
    closeAccountDrawer();
    if (authStepPhone) authStepPhone.classList.remove("hidden");
    if (authStepOtp) authStepOtp.classList.add("hidden");
    if (authStepSuccess) authStepSuccess.classList.add("hidden");
    if (phoneNumberInput) {
      phoneNumberInput.value = "";
      setTimeout(() => phoneNumberInput.focus(), 200);
    }
    if (authModal) authModal.classList.remove("hidden");
  }

  function closeAuthModal() {
    if (authModal) authModal.classList.add("hidden");
  }

  if (drawerBtnLoginTrigger) {
    drawerBtnLoginTrigger.addEventListener("click", openAuthModal);
  }

  if (btnCloseAuthModal) {
    btnCloseAuthModal.addEventListener("click", closeAuthModal);
  }

  if (btnSendOtp) {
    btnSendOtp.addEventListener("click", async () => {
      const phone = (phoneNumberInput ? phoneNumberInput.value : "").trim();
      if (!phone || phone.length < 10) {
        showToast("Please enter a valid 10-digit mobile number", "ri-alert-line");
        return;
      }
      pendingAuthPhone = phone;
      btnSendOtp.disabled = true;
      btnSendOtp.innerHTML = `<i class="ri-loader-4-line spinner"></i> Sending OTP...`;

      try {
        const res = await fetch("/api/auth/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone })
        });
        const data = await res.json();
        if (data.success) {
          if (authStepPhone) authStepPhone.classList.add("hidden");
          if (authStepOtp) authStepOtp.classList.remove("hidden");
          if (displayPhoneNum) displayPhoneNum.textContent = `+91 ${phone}`;
          otpDigits.forEach(d => d.value = "");
          if (otpDigits[0]) setTimeout(() => otpDigits[0].focus(), 200);
          showToast(`OTP Code sent! (Demo OTP: ${data.demo_otp || "1234"})`, "ri-mail-send-line");
        } else {
          showToast(data.error || "Failed to send OTP", "ri-error-warning-line");
        }
      } catch (err) {
        showToast("Error sending OTP: " + err.message, "ri-error-warning-line");
      } finally {
        btnSendOtp.disabled = false;
        btnSendOtp.innerHTML = `<i class="ri-send-plane-fill"></i> Get OTP`;
      }
    });
  }

  // OTP digit auto-advance
  otpDigits.forEach((digit, idx) => {
    digit.addEventListener("input", (e) => {
      if (e.target.value && idx < otpDigits.length - 1) {
        otpDigits[idx + 1].focus();
      }
    });
    digit.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !e.target.value && idx > 0) {
        otpDigits[idx - 1].focus();
      }
    });
  });

  if (btnVerifyOtp) {
    btnVerifyOtp.addEventListener("click", async () => {
      let otp = "";
      otpDigits.forEach(d => otp += d.value.trim());
      if (otp.length < 4) {
        showToast("Please enter the 4-digit OTP code", "ri-alert-line");
        return;
      }

      btnVerifyOtp.disabled = true;
      btnVerifyOtp.innerHTML = `<i class="ri-loader-4-line spinner"></i> Verifying...`;

      try {
        const res = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: pendingAuthPhone, otp })
        });
        const data = await res.json();
        if (data.success) {
          loggedInUserPhone = pendingAuthPhone;
          localStorage.setItem("mctv_user_phone", loggedInUserPhone);
          currentUserId = "user_" + loggedInUserPhone;
          localStorage.setItem("mctv_user_id", currentUserId);
          document.cookie = `mctv_user_id=${encodeURIComponent(currentUserId)}; path=/; max-age=31536000; SameSite=Lax`;

          if (authStepOtp) authStepOtp.classList.add("hidden");
          if (authStepSuccess) authStepSuccess.classList.remove("hidden");
          if (loggedInPhoneText) loggedInPhoneText.textContent = `+91 ${loggedInUserPhone}`;

          updateAccountDrawerUI();
          refreshSubscriptionStatus();
          showToast("Signed in successfully with mobile number!", "ri-checkbox-circle-fill");
        } else {
          showToast(data.error || "Invalid OTP code. Try 1234.", "ri-error-warning-line");
        }
      } catch (err) {
        showToast("Verification error: " + err.message, "ri-error-warning-line");
      } finally {
        btnVerifyOtp.disabled = false;
        btnVerifyOtp.innerHTML = `<i class="ri-checkbox-circle-fill"></i> Verify & Sign In`;
      }
    });
  }

  if (btnResendOtp) {
    btnResendOtp.addEventListener("click", () => {
      if (btnSendOtp) btnSendOtp.click();
    });
  }

  if (btnAuthSuccessClose) {
    btnAuthSuccessClose.addEventListener("click", closeAuthModal);
  }

  if (drawerBtnLogout) {
    drawerBtnLogout.addEventListener("click", () => {
      loggedInUserPhone = "";
      localStorage.removeItem("mctv_user_phone");
      currentUserId = "guest_" + Math.random().toString(36).substring(2, 8);
      localStorage.setItem("mctv_user_id", currentUserId);
      document.cookie = `mctv_user_id=${encodeURIComponent(currentUserId)}; path=/; max-age=31536000; SameSite=Lax`;
      updateAccountDrawerUI();
      closeAccountDrawer();
      showToast("Logged out successfully", "ri-logout-box-r-line");
      refreshSubscriptionStatus();
    });
  }

  // ========================================================
  // SERVICE & FEEDBACK MODAL
  // ========================================================
  const feedbackModal = document.getElementById("feedbackModal");
  const btnCloseFeedbackModal = document.getElementById("btnCloseFeedbackModal");
  const btnSubmitFeedback = document.getElementById("btnSubmitFeedback");
  const feedbackMessage = document.getElementById("feedbackMessage");
  const feedbackTopic = document.getElementById("feedbackTopic");

  function openFeedbackModal() {
    if (feedbackMessage) feedbackMessage.value = "";
    if (feedbackModal) feedbackModal.classList.remove("hidden");
  }

  function closeFeedbackModal() {
    if (feedbackModal) feedbackModal.classList.add("hidden");
  }

  if (btnCloseFeedbackModal) {
    btnCloseFeedbackModal.addEventListener("click", closeFeedbackModal);
  }

  if (btnSubmitFeedback) {
    btnSubmitFeedback.addEventListener("click", () => {
      const msg = (feedbackMessage ? feedbackMessage.value : "").trim();
      const topic = feedbackTopic ? feedbackTopic.value : "General Inquiry";
      if (!msg) {
        showToast("Please enter your feedback message", "ri-alert-line");
        return;
      }
      closeFeedbackModal();
      showToast("Thank you! Your feedback has been received.", "ri-checkbox-circle-fill");
    });
  }

  // ========================================================
  // CATCH-UP TV (EPG) TIMELINE RENDERER
  // ========================================================
  const epgTimeline = document.getElementById("epgTimeline");
  const epgCurrentName = document.getElementById("epgCurrentName");

  function renderCatchupTimeline(channel) {
    if (!epgTimeline) return;
    const chName = channel ? channel.name : (activeChannel ? activeChannel.name : "Star Maa HD");
    if (epgCurrentName) epgCurrentName.textContent = chName;

    const mockShows = [
      { time: "06:00 AM - 08:00 AM", title: "Morning Devotional & News Bulletin", genre: "News & Culture" },
      { time: "08:00 AM - 10:00 AM", title: "Breakfast Super Star Hits", genre: "Entertainment" },
      { time: "10:00 AM - 01:00 PM", title: "Blockbuster Super Cinema", genre: "Movies" },
      { time: "01:00 PM - 02:00 PM", title: "Prime Afternoon Live News Hour", genre: "News" },
      { time: "02:00 PM - 05:00 PM", title: "Family Drama Series & Comedy Special", genre: "Drama" },
      { time: "05:00 PM - 07:00 PM", title: "Live Sports Arena Match", genre: "Sports" },
      { time: "07:00 PM - 10:00 PM", title: "Grand Primetime Show & Live Feed", genre: "Prime Time" }
    ];

    epgTimeline.innerHTML = mockShows.map(show => `
      <div class="epg-item">
        <span class="epg-item-time">${show.time}</span>
        <div class="epg-item-info">
          <div class="epg-item-title">${show.title}</div>
          <div class="epg-item-genre">${chName} • ${show.genre}</div>
        </div>
        <button class="btn-play-epg" onclick="document.getElementById('tabNavLive').click()">
          <i class="ri-play-fill"></i> Watch
        </button>
      </div>
    `).join("");
  }

  // Start
  refreshSubscriptionStatus();
  fetchChannels();
});
