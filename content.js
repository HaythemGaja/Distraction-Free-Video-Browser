(function() {
    // Default Settings
    let adSkipperEnabled = true;
    let autoNextEnabled = true;
    let autoUnmuteEnabled = true;
    let persistentSpeed = 1.0;
    let globalVolume = 1.0;
    let ambientGlowEnabled = false;
    let miniHudEnabled = true;
    let currentEqPreset = 'flat';
    let forceHighResEnabled = true;
    let hasUserInteracted = false;

    // A-B Repeat Loop State
    let abLoop = { a: null, b: null, active: false };

    // Audio Equalizer State
    let audioCtx = null;
    let gainNode = null;
    let bassFilter = null;
    let vocalFilter = null;
    let hudFadeTimer = null;

    // Track User Interaction
    ['click', 'keydown', 'pointerdown', 'touchstart'].forEach(evt => {
        window.addEventListener(evt, () => { hasUserInteracted = true; }, { once: true, capture: true });
    });

    // Multi-Storage Loader
    function loadAllSettings(callback) {
        const keys = [
            'cs_ad_skipper_enabled', 'cs_auto_next', 'cs_auto_unmute', 'cs_playback_speed',
            'cs_global_volume', 'cs_ambient_glow', 'cs_mini_hud', 'cs_eq_preset',
            'cs_force_high_res'
        ];
        
        chrome.storage.local.get(keys, (localData) => {
            chrome.storage.sync.get(keys, (syncData) => {
                const data = Object.assign({}, syncData, localData);
                if (data.cs_ad_skipper_enabled !== undefined) adSkipperEnabled = data.cs_ad_skipper_enabled;
                if (data.cs_auto_next !== undefined) autoNextEnabled = data.cs_auto_next;
                if (data.cs_auto_unmute !== undefined) autoUnmuteEnabled = data.cs_auto_unmute;
                if (data.cs_playback_speed) persistentSpeed = parseFloat(data.cs_playback_speed);
                if (data.cs_global_volume !== undefined) globalVolume = parseFloat(data.cs_global_volume);
                if (data.cs_ambient_glow !== undefined) ambientGlowEnabled = data.cs_ambient_glow;
                if (data.cs_mini_hud !== undefined) miniHudEnabled = data.cs_mini_hud;
                if (data.cs_eq_preset) currentEqPreset = data.cs_eq_preset;
                if (data.cs_force_high_res !== undefined) forceHighResEnabled = data.cs_force_high_res;

                if (callback) callback();
            });
        });
    }

    function saveSetting(key, val) {
        const obj = { [key]: val };
        chrome.storage.local.set(obj);
        chrome.storage.sync.set(obj);
    }

    loadAllSettings(() => {
        enforcePersistentMedia();
        applyAmbientGlow();
    });

    function showToast(text, color = '#00f2fe') {
        let toast = document.getElementById('streamflow-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'streamflow-toast';
            document.body.appendChild(toast);
        }
        toast.innerText = text;
        toast.style.cssText = `position:fixed;top:35px;right:25px;background:rgba(15,18,26,0.95);color:${color};padding:10px 18px;border-radius:10px;z-index:2147483647;font-size:12px;font-weight:bold;border:1px solid ${color};box-shadow:0 8px 25px rgba(0,0,0,0.7);pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;`;
        clearTimeout(window.__sfToastTimer);
        window.__sfToastTimer = setTimeout(() => { if (toast) toast.remove(); }, 1800);
    }

    function getAllVideos() {
        return Array.from(document.querySelectorAll('video'));
    }

    function getActiveVideo() {
        const vids = getAllVideos();
        return vids.find(v => !v.paused && v.readyState > 0) || vids[0] || null;
    }

    function isAdVideo(v) {
        if (!v) return false;
        if (document.querySelector('.ad-showing, .ytp-ad-player-overlay, .ad-interrupting')) return true;
        const adContainer = v.closest('.ad-container, [class*="video-ad"], [id*="player_ad"], [class*="vast-"], [class*="ima-"], .jw-ad, .vjs-ad');
        if (adContainer) return true;
        const src = (v.currentSrc || v.src || '').toLowerCase();
        return src.includes('/ad/') || src.includes('doubleclick') || src.includes('googleads') || src.includes('vast');
    }

    // =======================================================
    // 1. SPEED & VOLUME PERSISTENCE ENGINE
    // =======================================================
    function enforcePersistentMedia() {
        const vids = getAllVideos();
        vids.forEach(v => {
            if (!isAdVideo(v)) {
                if (v.playbackRate !== persistentSpeed) v.playbackRate = persistentSpeed;
                if (Math.abs(v.volume - globalVolume) > 0.05) v.volume = globalVolume;
            }
        });
    }

    document.addEventListener('play', (e) => {
        if (e.target && e.target.tagName === 'VIDEO' && !isAdVideo(e.target)) {
            e.target.playbackRate = persistentSpeed;
            e.target.volume = globalVolume;
            if (!location.hostname.includes('tiktok.com')) {
                initAudioEqualizer(e.target);
            }
            renderUpperCenterHudOnVideo(e.target);
        }
    }, true);

    document.addEventListener('pause', () => {
        updateMiniHudPlayState();
    }, true);

    document.addEventListener('loadedmetadata', (e) => {
        if (e.target && e.target.tagName === 'VIDEO' && !isAdVideo(e.target)) {
            e.target.playbackRate = persistentSpeed;
            e.target.volume = globalVolume;
            if (forceHighResEnabled && location.hostname.includes('youtube.com')) {
                forceYouTubeMaxResolution();
            }
        }
    }, true);

    // =======================================================
    // 2. A-B REPEAT LOOP ENGINE
    // =======================================================
    function setPointA() {
        const v = getActiveVideo();
        if (!v) return;
        abLoop.a = v.currentTime;
        if (abLoop.b !== null && abLoop.b <= abLoop.a) abLoop.b = null;
        abLoop.active = (abLoop.a !== null && abLoop.b !== null);
        showToast(`🔁 Loop Point A: ${formatTime(abLoop.a)}`, '#f5b041');
        updateMiniHudPlayState();
    }

    function setPointB() {
        const v = getActiveVideo();
        if (!v) return;
        if (abLoop.a === null) abLoop.a = 0;
        abLoop.b = v.currentTime;
        abLoop.active = true;
        showToast(`🔁 Loop Point B: ${formatTime(abLoop.b)} (Active)`, '#2ecc71');
        updateMiniHudPlayState();
    }

    function toggleClearLoop() {
        abLoop.active = false;
        abLoop.a = null;
        abLoop.b = null;
        showToast('🔁 A-B Loop: Cleared', '#ff5f56');
        updateMiniHudPlayState();
    }

    function formatTime(secs) {
        if (secs === null || isNaN(secs)) return '0:00';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    document.addEventListener('timeupdate', (e) => {
        if (e.target && e.target.tagName === 'VIDEO' && abLoop.active) {
            const v = e.target;
            if (abLoop.b !== null && v.currentTime >= abLoop.b) {
                v.currentTime = abLoop.a || 0;
                v.play().catch(() => {});
            }
        }
    }, true);

    // =======================================================
    // 3. FRAME STEPPER & HD SCREENSHOT
    // =======================================================
    function stepFrame(forward = true) {
        const v = getActiveVideo();
        if (!v) return;
        if (!v.paused) v.pause();
        const step = 0.04;
        v.currentTime = forward ? Math.min(v.duration, v.currentTime + step) : Math.max(0, v.currentTime - step);
        showToast(`🎞️ Frame: ${v.currentTime.toFixed(2)}s`, '#00f2fe');
    }

    function captureScreenshot() {
        const v = getActiveVideo();
        if (!v || v.readyState < 2) return showToast('⚠️ No active video frame', '#ff5f56');

        try {
            const canvas = document.createElement('canvas');
            canvas.width = v.videoWidth || v.clientWidth || 1280;
            canvas.height = v.videoHeight || v.clientHeight || 720;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

            const timestamp = formatTime(v.currentTime).replace(':', '-');
            let cleanTitle = (document.title || 'Video').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 35);
            const fileName = `${cleanTitle}_[${timestamp}].png`;

            const link = document.createElement('a');
            link.download = fileName;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showToast(`📸 Saved: ${fileName}`, '#2ecc71');
        } catch (e) {
            showToast('⚠️ Screenshot blocked (Protected Stream)', '#ff5f56');
        }
    }

    // =======================================================
    // 4. AUDIO EQUALIZER
    // =======================================================
    function initAudioEqualizer(video) {
        if (!hasUserInteracted || !video || video.__sfAudioConnected) return;

        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }

            const source = audioCtx.createMediaElementSource(video);
            video.__sfAudioConnected = true;

            bassFilter = audioCtx.createBiquadFilter();
            bassFilter.type = 'lowshelf';
            bassFilter.frequency.value = 120;

            vocalFilter = audioCtx.createBiquadFilter();
            vocalFilter.type = 'peaking';
            vocalFilter.frequency.value = 2000;
            vocalFilter.Q.value = 1.2;

            gainNode = audioCtx.createGain();

            source.connect(bassFilter);
            bassFilter.connect(vocalFilter);
            vocalFilter.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            applyEqPreset(currentEqPreset);
        } catch (e) {}
    }

    function applyEqPreset(preset) {
        currentEqPreset = preset;
        saveSetting('cs_eq_preset', currentEqPreset);
        if (!bassFilter || !vocalFilter || !gainNode) return;

        if (preset === 'vocal') {
            bassFilter.gain.value = -4;
            vocalFilter.gain.value = 7;
            gainNode.gain.value = 1.1;
            showToast('🎚️ EQ: Vocal Clarity', '#f5b041');
        } else if (preset === 'bass') {
            bassFilter.gain.value = 8;
            vocalFilter.gain.value = -2;
            gainNode.gain.value = 1.0;
            showToast('🎚️ EQ: Bass Boost', '#f5b041');
        } else if (preset === 'night') {
            bassFilter.gain.value = -3;
            vocalFilter.gain.value = 3;
            gainNode.gain.value = 0.9;
            showToast('🎚️ EQ: Night Normalize', '#f5b041');
        } else {
            bassFilter.gain.value = 0;
            vocalFilter.gain.value = 0;
            gainNode.gain.value = 1.0;
            showToast('🎚️ EQ: Flat / Default', '#868fa6');
        }
    }

    // =======================================================
    // 5. AMBIENT GLOW & RESOLUTION LOCK
    // =======================================================
    function applyAmbientGlow() {
        let styleEl = document.getElementById('streamflow-glow-style');
        if (!ambientGlowEnabled) {
            if (styleEl) styleEl.remove();
            return;
        }
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'streamflow-glow-style';
            document.head.appendChild(styleEl);
        }
        styleEl.innerHTML = `
            video {
                box-shadow: 0 0 45px rgba(0, 242, 254, 0.45), 0 0 100px rgba(0, 114, 255, 0.25) !important;
                transition: box-shadow 0.3s ease !important;
            }
        `;
    }

    function forceYouTubeMaxResolution() {
        try {
            const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
            if (player && typeof player.getAvailableQualityLevels === 'function') {
                const levels = player.getAvailableQualityLevels();
                if (levels && levels.length > 0) {
                    const topQuality = levels[0];
                    player.setPlaybackQualityRange(topQuality, topQuality);
                    player.setPlaybackQuality(topQuality);
                }
            }
        } catch (e) {}
    }

    // =======================================================
    // 6. UPPER-CENTER ON-VIDEO HUD
    // =======================================================
    function positionHudUpperCenter(vid) {
        const hud = document.getElementById('streamflow-upper-center-hud');
        if (!hud || !vid) return;

        const rect = vid.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const topPos = Math.max(10, rect.top + 16);
        const leftPos = rect.left + (rect.width / 2);

        hud.style.top = `${topPos}px`;
        hud.style.left = `${leftPos}px`;
    }

    function showUpperCenterHud(temporary = true) {
        const hud = document.getElementById('streamflow-upper-center-hud');
        if (!hud) return;

        hud.style.opacity = '1';
        hud.style.pointerEvents = 'auto';

        clearTimeout(hudFadeTimer);
        if (temporary) {
            hudFadeTimer = setTimeout(() => {
                const v = getActiveVideo();
                if (v && !v.paused) {
                    hud.style.opacity = '0';
                    hud.style.pointerEvents = 'none';
                }
            }, 2500);
        }
    }

    function updateMiniHudPlayState() {
        const hud = document.getElementById('streamflow-upper-center-hud');
        if (!hud) return;
        const v = getActiveVideo();
        const isPaused = v ? v.paused : true;

        const playSvg = hud.querySelector('.sf-play-btn svg');
        if (playSvg) {
            playSvg.innerHTML = isPaused
                ? `<path d="M8 5v14l11-7z"/>`
                : `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;
        }
        const speedBtn = hud.querySelector('.sf-speed-btn');
        if (speedBtn) speedBtn.innerText = `${persistentSpeed}x`;
        
        const loopBtn = hud.querySelector('.sf-loop-btn svg');
        if (loopBtn) {
            loopBtn.style.fill = abLoop.active ? '#2ecc71' : (abLoop.a !== null ? '#f5b041' : '#e8eaed');
        }

        if (isPaused) {
            showUpperCenterHud(false);
        } else {
            showUpperCenterHud(true);
        }
    }

    function renderUpperCenterHudOnVideo(vid) {
        if (!miniHudEnabled || location.hostname.includes('tiktok.com') || isAdVideo(vid)) return;

        let hud = document.getElementById('streamflow-upper-center-hud');
        if (!hud) {
            hud = document.createElement('div');
            hud.id = 'streamflow-upper-center-hud';
            hud.className = 'streamflow-upper-center-hud';
            
            hud.style.cssText = `
                position: fixed !important; 
                top: 20px !important; 
                left: 50% !important; 
                transform: translate(-50%, 0) !important;
                z-index: 2147483647 !important;
                background: rgba(18, 21, 30, 0.92) !important; 
                backdrop-filter: blur(14px) !important; 
                -webkit-backdrop-filter: blur(14px) !important;
                border: 1px solid rgba(138, 180, 248, 0.35) !important; 
                border-radius: 30px !important;
                padding: 5px 12px !important; 
                display: flex !important; 
                gap: 6px !important; 
                align-items: center !important;
                opacity: 0 !important; 
                pointer-events: none !important;
                transition: opacity 0.25s ease, transform 0.25s ease !important;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                box-shadow: 0 8px 30px rgba(0,0,0,0.8) !important; 
                user-select: none !important;
            `;

            hud.innerHTML = `
                <button class="sf-hud-btn sf-play-btn" style="background:#a8c7fa; border:none; color:#041e49; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; outline:none; padding:4px;" title="Play / Pause (Space)">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
                <button class="sf-hud-btn sf-rewind-btn" style="background:transparent; border:none; color:#e8eaed; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; outline:none; padding:4px;" title="Rewind -10s">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.2 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
                </button>
                <button class="sf-hud-btn sf-fwd-btn" style="background:transparent; border:none; color:#e8eaed; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; outline:none; padding:4px;" title="Fast Forward +10s">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M11.5 8c2.65 0 5.05 1 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.2-3.16-1.88-5.12-1.88-3.54 0-6.55 2.31-7.6 5.5l-2.37-.78C2.92 11.03 6.85 8 11.5 8z"/></svg>
                </button>
                <button class="sf-hud-btn sf-speed-btn" style="background:rgba(0,242,254,0.14); color:#00f2fe; border:1px solid rgba(0,242,254,0.4); padding:2px 8px; border-radius:14px; font-size:11px; font-weight:800; cursor:pointer; outline:none;" title="Click to Cycle Speed (Keys: 4=+0.25x, 6=-0.25x, 0=1.0x)">${persistentSpeed}x</button>
                <button class="sf-hud-btn sf-pip-btn" style="background:transparent; border:none; color:#e8eaed; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; outline:none; padding:4px;" title="Picture-in-Picture">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M19 11h-8v6h8v-6zm4 8V5c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 0H3V5h18v14z"/></svg>
                </button>
                <button class="sf-hud-btn sf-shot-btn" style="background:transparent; border:none; color:#e8eaed; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; outline:none; padding:4px;" title="Take Screenshot (S)">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zm8-9.2h-3.2L15 4H9L7.2 6H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h3.9l1.8-2h4.6l1.8 2H20v10z"/></svg>
                </button>
                <button class="sf-hud-btn sf-loop-btn" style="background:transparent; border:none; color:#e8eaed; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; outline:none; padding:4px;" title="A-B Loop">
                    <svg viewBox="0 0 24 24" width="15" height="15" style="fill:#e8eaed;"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
                </button>
            `;

            hud.addEventListener('mouseenter', () => showUpperCenterHud(false));
            hud.addEventListener('mouseleave', () => showUpperCenterHud(true));

            hud.querySelector('.sf-play-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const v = getActiveVideo();
                if (v) {
                    v.paused ? v.play() : v.pause();
                    updateMiniHudPlayState();
                }
            });

            hud.querySelector('.sf-rewind-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const v = getActiveVideo();
                if (v) {
                    v.currentTime -= 10;
                    showToast('⏪ -10s');
                }
            });

            hud.querySelector('.sf-fwd-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const v = getActiveVideo();
                if (v) {
                    v.currentTime += 10;
                    showToast('⏩ +10s');
                }
            });

            hud.querySelector('.sf-speed-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const speeds = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5];
                let nextIdx = speeds.indexOf(persistentSpeed) + 1;
                if (nextIdx >= speeds.length || nextIdx === 0) nextIdx = 0;
                persistentSpeed = speeds[nextIdx];
                saveSetting('cs_playback_speed', persistentSpeed);
                enforcePersistentMedia();
                updateMiniHudPlayState();
                showToast(`⚡ Speed: ${persistentSpeed}x`);
            });

            hud.querySelector('.sf-pip-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const v = getActiveVideo();
                if (v) document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture();
            });

            hud.querySelector('.sf-shot-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                captureScreenshot();
            });

            hud.querySelector('.sf-loop-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.shiftKey) setPointB();
                else if (abLoop.active) toggleClearLoop();
cat << 'EOF' > popup.html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>StreamFlow Pro</title>
    <style>
        :root {
            --gmc-bg: #1e2024;
            --gmc-card: #292a2d;
            --gmc-card-hover: #33363b;
            --gmc-blue: #8ab4f8;
            --gmc-blue-btn: #a8c7fa;
            --gmc-blue-dark: #041e49;
            --text-primary: #e8eaed;
            --text-secondary: #9aa0a6;
            --accent-gold: #f5b041;
            --accent-green: #2ecc71;
            --accent-cyan: #00f2fe;
            --border-color: #383a3e;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            width: 420px; background-color: var(--gmc-bg); color: var(--text-primary);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            padding: 14px; display: flex; flex-direction: column; gap: 12px; user-select: none;
        }

        /* ================= 1. CHROME GMC MEDIA CARD ================= */
        .gmc-card {
            background-color: var(--gmc-card); border-radius: 14px; padding: 16px;
            display: flex; flex-direction: column; gap: 14px; box-shadow: 0 4px 18px rgba(0,0,0,0.35);
            border: 1px solid var(--border-color);
        }

        .gmc-header { display: flex; justify-content: space-between; align-items: center; }
        .gmc-domain-box { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--text-secondary); font-weight: 600; }
        .gmc-domain-icon { width: 14px; height: 14px; fill: var(--gmc-blue); }

        .gmc-header-actions { display: flex; align-items: center; gap: 8px; }

        .card-speed-select {
            background-color: #1e2024; color: var(--gmc-blue); border: 1px solid #3c4043;
            border-radius: 12px; padding: 3px 8px; font-size: 11px; font-weight: bold; cursor: pointer; outline: none;
        }
        .card-speed-select:hover { border-color: var(--gmc-blue); }

        .gmc-pip-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 3px; display: flex; align-items: center; }
        .gmc-pip-btn svg { width: 16px; height: 16px; fill: currentColor; }
        .gmc-pip-btn:hover { color: #fff; }

        .gmc-content-row { display: flex; justify-content: space-between; align-items: center; gap: 14px; }
        .gmc-info { flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 4px; }
        .gmc-title { font-size: 14px; font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .gmc-sub { font-size: 11px; color: var(--text-secondary); }

        .gmc-play-circle {
            width: 46px; height: 46px; border-radius: 50%; background-color: var(--gmc-blue-btn);
            color: var(--gmc-blue-dark); border: none; display: flex; align-items: center; justify-content: center;
            cursor: pointer; flex-shrink: 0; transition: transform 0.15s;
        }
        .gmc-play-circle svg { width: 18px; height: 18px; fill: var(--gmc-blue-dark); }
        .gmc-play-circle:hover { transform: scale(1.06); }

        /* Scrubber Bar */
        .gmc-timeline-container { display: flex; align-items: center; gap: 10px; width: 100%; }
        .gmc-scrub-slider {
            flex: 1; height: 4px; accent-color: var(--gmc-blue); cursor: pointer;
            background: #3c4043; border-radius: 2px; -webkit-appearance: none;
        }
        .gmc-scrub-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: var(--gmc-blue); }

        /* Controls Bar: |<< 10 [Timeline] 10 >>| */
        .gmc-controls-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        
        .gmc-transport-btn {
            background: none; border: none; color: var(--text-secondary);
            cursor: pointer; padding: 5px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
            transition: 0.15s;
        }
        .gmc-transport-btn svg { width: 16px; height: 16px; fill: currentColor; }
        .gmc-transport-btn:hover { color: var(--text-primary); background: rgba(255,255,255,0.08); }

        .time-badge { font-size: 10px; color: var(--text-secondary); min-width: 32px; text-align: center; font-weight: 500; }

        /* ================= 2. CLEAN SVG SETTINGS ROWS ================= */
        .gmc-list { display: flex; flex-direction: column; gap: 1px; }
        
        .gmc-list-row {
            display: flex; justify-content: space-between; align-items: center; padding: 11px 6px;
            border-top: 1px solid var(--border-color); font-size: 12px; color: var(--text-primary);
        }
        .gmc-list-row:first-child { border-top: none; }

        .gmc-row-label { display: flex; align-items: center; gap: 10px; font-weight: 500; font-size: 12px; }
        .gmc-row-icon { width: 16px; height: 16px; fill: var(--gmc-blue); flex-shrink: 0; display: flex; align-items: center; }
        .gmc-row-icon svg { width: 100%; height: 100%; fill: currentColor; }

        /* Switch Toggle */
        .gmc-switch {
            width: 34px; height: 19px; background: #3c4043; border-radius: 10px; position: relative;
            cursor: pointer; transition: background 0.2s;
        }
        .gmc-switch::after {
            content: ''; position: absolute; top: 2px; left: 2px; width: 15px; height: 15px;
            background: #fff; border-radius: 50%; transition: transform 0.2s;
        }
        .gmc-switch.active { background: var(--gmc-blue); }
        .gmc-switch.active::after { transform: translateX(15px); background: #041e49; }

        select, input[type="range"] {
            outline: none; font-size: 11px; font-weight: bold; border-radius: 6px; border: 1px solid #3c4043;
            background-color: var(--gmc-card); color: var(--text-primary); padding: 4px 8px;
        }

        .btn-action-small {
            padding: 4px 10px; border-radius: 6px; border: 1px solid #3c4043; background: var(--gmc-card);
            color: var(--text-primary); font-size: 11px; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
        }
        .btn-action-small:hover { border-color: var(--gmc-blue); color: var(--gmc-blue); }

        /* Keyboard Shortcuts Box */
        .shortcuts-box {
            background: var(--gmc-card); border: 1px solid var(--border-color); border-radius: 10px;
            padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--text-secondary);
        }
        .shortcuts-box b { color: #fff; }

        /* Watch Later Drawer */
        #wl-container { display: none; flex-direction: column; gap: 8px; padding: 10px 0 4px 0; border-top: 1px solid var(--border-color); }
        #wl-container.open { display: flex; }
        #wl-list { max-height: 170px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
        .wl-item { background: var(--gmc-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; font-size: 11px; }
        .wl-title { font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #fff; font-size: 12px; }
        .wl-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 2px; }
        .wl-btn-play { background: var(--gmc-blue); color: #000; border: none; padding: 3px 8px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 10px; }
        .wl-btn-del { color: #ff5f56; background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px 4px; }
    </style>
</head>
<body>

    <!-- 1. Chrome Native Media Control Card -->
    <div class="gmc-card">
        <div class="gmc-header">
            <div class="gmc-domain-box">
                <div class="gmc-domain-icon">
                    <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                </div>
                <span id="gmc-domain">Web Video</span>
            </div>
            
            <div class="gmc-header-actions">
                <select id="card-speed-select" class="card-speed-select" title="Playback Speed (Keys: 4=+0.25x, 6=-0.25x, 0=1.0x)">
                    <option value="0.5">0.5x</option>
                    <option value="0.75">0.75x</option>
                    <option value="1.0" selected>1.0x</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="1.75">1.75x</option>
                    <option value="2.0">2.0x</option>
                    <option value="2.5">2.5x</option>
                    <option value="3.0">3.0x</option>
                </select>

                <button id="btn-pip" class="gmc-pip-btn" title="Picture-in-Picture">
                    <svg viewBox="0 0 24 24"><path d="M19 11h-8v6h8v-6zm4 8V5c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 0H3V5h18v14z"/></svg>
                </button>
            </div>
        </div>

        <div class="gmc-content-row">
            <div class="gmc-info">
                <div id="gmc-title" class="gmc-title">Loading Media...</div>
                <div class="gmc-sub">StreamFlow Engine Active</div>
            </div>
            <button id="btn-play-pause" class="gmc-play-circle" title="Play / Pause (Space)">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>
        </div>

        <!-- Controls Bar (|<< 10 [Timeline] 10 >>|) -->
        <div class="gmc-controls-bar">
            <button id="btn-prev" class="gmc-transport-btn" title="Previous / Restart">
                <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <button id="btn-rewind" class="gmc-transport-btn" title="Rewind -10s">
                <svg viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.2 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
            </button>
            
            <div class="gmc-timeline-container">
                <span id="time-current" class="time-badge">0:00</span>
                <input type="range" id="gmc-scrubber" class="gmc-scrub-slider" min="0" max="100" value="0">
                <span id="time-duration" class="time-badge">0:00</span>
            </div>

            <button id="btn-forward" class="gmc-transport-btn" title="Forward +10s">
                <svg viewBox="0 0 24 24"><path d="M11.5 8c2.65 0 5.05 1 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.2-3.16-1.88-5.12-1.88-3.54 0-6.55 2.31-7.6 5.5l-2.37-.78C2.92 11.03 6.85 8 11.5 8z"/></svg>
            </button>
            <button id="btn-next" class="gmc-transport-btn" title="Next Video">
                <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
        </div>
    </div>

    <!-- 2. Settings Rows -->
    <div class="gmc-list">
        <!-- Turbo Ad-Skipper Row -->
        <div class="gmc-list-row">
            <div class="gmc-row-label">
                <div class="gmc-row-icon" style="color:var(--accent-cyan);">
                    <svg viewBox="0 0 24 24"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>
                </div>
                <span>Turbo Ad-Skipper (16x + Mute)</span>
            </div>
            <div id="toggle-adskipper" class="gmc-switch active"></div>
        </div>

        <!-- Global Volume Row -->
        <div class="gmc-list-row">
            <div class="gmc-row-label">
                <div class="gmc-row-icon" style="color:var(--gmc-blue);">
                    <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                </div>
                <span>Global Volume (<span id="volume-val" style="color:var(--gmc-blue);">100%</span>)</span>
            </div>
            <input type="range" id="volume-slider" min="0" max="100" step="5" value="100" style="width:125px; accent-color:var(--gmc-blue);">
        </div>

        <!-- Audio EQ Preset Row -->
        <div class="gmc-list-row">
            <div class="gmc-row-label">
                <div class="gmc-row-icon" style="color:var(--accent-gold);">
                    <svg viewBox="0 0 24 24"><path d="M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z"/></svg>
                </div>
                <span>Audio Equalizer</span>
            </div>
            <select id="eq-select" style="color:var(--accent-gold);">
                <option value="flat" selected>Flat (Default)</option>
                <option value="vocal">Vocal Clarity</option>
                <option value="bass">Bass Boost</option>
                <option value="night">Night Mode</option>
            </select>
        </div>

        <!-- A-B Repeat Loop Row -->
        <div class="gmc-list-row">
            <div class="gmc-row-label">
                <div class="gmc-row-icon" style="color:var(--accent-green);">
                    <svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
                </div>
                <span>A-B Repeat Loop</span>
            </div>
            <div style="display:flex; gap:5px;">
                <button id="btn-ab-a" class="btn-action-small">Set A ([)</button>
                <button id="btn-ab-b" class="btn-action-small">Set B (])</button>
                <button id="btn-ab-clear" class="btn-action-small" style="color:#ff5f56;">✕ (\)</button>
            </div>
        </div>

        <!-- Frame Step & Snap Row -->
        <div class="gmc-list-row">
            <div class="gmc-row-label">
                <div class="gmc-row-icon" style="color:var(--accent-cyan);">
                    <svg viewBox="0 0 24 24"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zm8-9.2h-3.2L15 4H9L7.2 6H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h3.9l1.8-2h4.6l1.8 2H20v10z"/></svg>
                </div>
                <span>Frame Step & Snap</span>
            </div>
            <div style="display:flex; gap:5px;">
                <button id="btn-frame-back" class="btn-action-small">⏪ (,)</button>
                <button id="btn-frame-fwd" class="btn-action-small">⏩ (.)</button>
                <button id="btn-shot" class="btn-action-small" style="color:var(--accent-cyan);">📸 (S)</button>
            </div>
        </div>

        <!-- Auto-Play Next Video Row -->
        <div class="gmc-list-row">
            <div class="gmc-row-label">
                <div class="gmc-row-icon" style="color:var(--gmc-blue);">
                    <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                </div>
                <span>Auto-Play Next Video</span>
            </div>
            <div id="toggle-autonext" class="gmc-switch active"></div>
        </div>

        <!-- Ambient Video Glow Row -->
        <div class="gmc-list-row">
            <div class="gmc-row-label">
                <div class="gmc-row-icon" style="color:var(--accent-cyan);">
                    <svg viewBox="0 0 24 24"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/></svg>
                </div>
                <span>Ambient Video Glow</span>
            </div>
            <div id="toggle-ambient" class="gmc-switch"></div>
        </div>

        <!-- Watch Later Queue Row -->
        <div class="gmc-list-row" id="row-wl-toggle" style="cursor:pointer;">
            <div class="gmc-row-label">
                <div class="gmc-row-icon" style="color:var(--accent-gold);">
                    <svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
                </div>
                <span>Watch Later Queue (<span id="wl-count">0</span>)</span>
            </div>
            <button id="btn-save-wl" class="btn-action-small" style="color:var(--accent-gold); border-color:var(--accent-gold);">+ Save Video</button>
        </div>

        <!-- Watch Later Drawer List -->
        <div id="wl-container">
            <div id="wl-list"></div>
        </div>

        <!-- Keyboard Shortcuts Reference -->
        <div class="shortcuts-box" style="margin-top:6px;">
            <div><b>4 / 6</b> : Speed Up (+0.25x) / Slow Down (-0.25x)</div>
            <div><b>0</b> (or R) : Reset Speed to 1.0x (Normal)</div>
            <div><b>M</b> : Mute / Unmute | <b>+ / -</b> : Volume Up / Down</div>
            <div><b>[ / ]</b> : Set Loop Point A / B | <b>\</b> : Clear Loop</div>
            <div><b>, / .</b> : Frame Step Back / Forward | <b>S</b> : Screenshot</div>
            <div><b>Space</b> : Play / Pause | <b>F</b> : Fullscreen</div>
        </div>
    </div>

    <script src="popup.js"></script>
</body>
</html>
