document.addEventListener('DOMContentLoaded', () => {
    let persistentSpeed = 1.0;
    let globalVolume = 1.0;
    let currentEqPreset = 'flat';
    let watchLaterList = [];
    let isLiveVideo = false;
    let durationSec = 0;
    let isDraggingScrubber = false;

    // Elements
    const gmcDomain = document.getElementById('gmc-domain');
    const gmcTitle = document.getElementById('gmc-title');
    const btnPlayPause = document.getElementById('btn-play-pause');
    const gmcScrubber = document.getElementById('gmc-scrubber');
    const timeCurrent = document.getElementById('time-current');
    const timeDuration = document.getElementById('time-duration');
    const volumeSlider = document.getElementById('volume-slider');
    const speedSelect = document.getElementById('speed-select');
    const eqSelect = document.getElementById('eq-select');
    const wlCount = document.getElementById('wl-count');
    const wlList = document.getElementById('wl-list');

    // Helper: Format Seconds to MM:SS
    function formatTime(s) {
        if (!s || isNaN(s)) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec < 10 ? '0' : ''}${sec}`;
    }

    // 1. Query Active Tab for Live Media Status
    function pollLiveMedia() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_MEDIA_STATUS' }, (res) => {
                if (res) {
                    isLiveVideo = res.hasVideo;
                    gmcDomain.innerText = res.hostname || 'Web';
                    gmcTitle.innerText = res.title || 'Video Player';
                    btnPlayPause.innerText = res.paused ? '▶' : '⏸';

                    durationSec = res.duration || 0;
                    timeDuration.innerText = formatTime(durationSec);

                    if (!isDraggingScrubber && durationSec > 0) {
                        timeCurrent.innerText = formatTime(res.currentTime);
                        gmcScrubber.value = (res.currentTime / durationSec) * 100;
                    }
                }
            });
        });
    }

    pollLiveMedia();
    setInterval(pollLiveMedia, 800);

    // 2. Transport Button Controls
    btnPlayPause.addEventListener('click', () => {
        sendTabAction('TOGGLE_PLAY');
        setTimeout(pollLiveMedia, 150);
    });

    document.getElementById('btn-rewind').addEventListener('click', () => {
        sendTabAction('SEEK_OFFSET', { offset: -10 });
    });

    document.getElementById('btn-forward').addEventListener('click', () => {
        sendTabAction('SEEK_OFFSET', { offset: 10 });
    });

    document.getElementById('btn-pip-top').addEventListener('click', () => {
        sendTabAction('TRIGGER_PIP');
    });

    document.getElementById('btn-mute').addEventListener('click', () => {
        sendTabAction('TOGGLE_PLAY');
    });

    // Scrubber Dragging
    gmcScrubber.addEventListener('input', (e) => {
        isDraggingScrubber = true;
        if (durationSec > 0) {
            const targetTime = (parseFloat(e.target.value) / 100) * durationSec;
            timeCurrent.innerText = formatTime(targetTime);
        }
    });

    gmcScrubber.addEventListener('change', (e) => {
        isDraggingScrubber = false;
        if (durationSec > 0) {
            const targetTime = (parseFloat(e.target.value) / 100) * durationSec;
            sendTabAction('SEEK_EXACT', { time: targetTime });
        }
    });

    // 3. Storage Sync
    const storageKeys = ['cs_playback_speed', 'cs_global_volume', 'cs_eq_preset', 'cs_watch_later'];
    chrome.storage.local.get(storageKeys, (localData) => {
        chrome.storage.sync.get(storageKeys, (syncData) => {
            const data = Object.assign({}, syncData, localData);
            if (data.cs_playback_speed) persistentSpeed = parseFloat(data.cs_playback_speed);
            if (data.cs_global_volume !== undefined) globalVolume = parseFloat(data.cs_global_volume);
            if (data.cs_eq_preset) currentEqPreset = data.cs_eq_preset;
            if (data.cs_watch_later) watchLaterList = data.cs_watch_later;

            speedSelect.value = persistentSpeed.toString();
            volumeSlider.value = Math.round(globalVolume * 100);
            eqSelect.value = currentEqPreset;
            renderWatchLater();
        });
    });

    function saveSettings() {
        const obj = {
            cs_playback_speed: persistentSpeed,
            cs_global_volume: globalVolume,
            cs_eq_preset: currentEqPreset
        };
        chrome.storage.local.set(obj);
        chrome.storage.sync.set(obj);

        sendTabAction('UPDATE_SETTINGS', {
            settings: {
                persistentSpeed,
                globalVolume,
                eqPreset: currentEqPreset,
                autoNextEnabled: true,
                autoUnmuteEnabled: true
            }
        });
    }

    volumeSlider.addEventListener('input', (e) => {
        globalVolume = parseInt(e.target.value) / 100;
        saveSettings();
    });

    speedSelect.addEventListener('change', (e) => {
        persistentSpeed = parseFloat(e.target.value);
        saveSettings();
    });

    eqSelect.addEventListener('change', (e) => {
        currentEqPreset = e.target.value;
        saveSettings();
    });

    // Tools Triggers
    function sendTabAction(action, data = {}) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, Object.assign({ action }, data)).catch(() => {});
        });
    }

    document.getElementById('btn-ab-a').addEventListener('click', () => sendTabAction('SET_AB_A'));
    document.getElementById('btn-ab-b').addEventListener('click', () => sendTabAction('SET_AB_B'));
    document.getElementById('btn-ab-clear').addEventListener('click', () => sendTabAction('CLEAR_AB'));
    document.getElementById('btn-frame-back').addEventListener('click', () => sendTabAction('STEP_FRAME_BACK'));
    document.getElementById('btn-frame-fwd').addEventListener('click', () => sendTabAction('STEP_FRAME_FWD'));
    document.getElementById('btn-shot').addEventListener('click', () => sendTabAction('TRIGGER_SCREENSHOT'));

    // 4. Watch Later
    function renderWatchLater() {
        wlCount.innerText = watchLaterList.length;
        chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', count: watchLaterList.length });
        wlList.innerHTML = '';

        if (watchLaterList.length === 0) {
            wlList.innerHTML = '<div style="color:#888; text-align:center; padding:10px; font-size:10px;">Queue is empty.</div>';
            return;
        }

        watchLaterList.forEach(item => {
            const el = document.createElement('div');
            el.className = 'wl-item';
            el.innerHTML = `
                <div class="wl-title" title="${item.title}">${item.title}</div>
                <div class="wl-actions">
                    <button class="wl-btn-play">▶ Play</button>
                    <button class="wl-btn-del">🗑️</button>
                </div>
            `;
            el.querySelector('.wl-btn-play').addEventListener('click', () => {
                chrome.tabs.create({ url: item.url });
            });
            el.querySelector('.wl-btn-del').addEventListener('click', () => {
                watchLaterList = watchLaterList.filter(i => i.id !== item.id);
                chrome.storage.local.set({ cs_watch_later: watchLaterList });
                renderWatchLater();
            });
            wlList.appendChild(el);
        });
    }

    document.getElementById('btn-save-wl').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_METADATA' }, (res) => {
                let finalUrl = (res && res.url) || tabs[0].url;
                let finalTitle = (res && res.title) || tabs[0].title;
                let site = (res && res.site) || 'Web';

                if (watchLaterList.some(i => i.url === finalUrl)) {
                    return alert('Video already in Watch Later!');
                }

                const newItem = {
                    id: Date.now(),
                    title: finalTitle,
                    url: finalUrl,
                    site: site,
                    date: new Date().toLocaleDateString()
                };

                watchLaterList.unshift(newItem);
                chrome.storage.local.set({ cs_watch_later: watchLaterList });
                renderWatchLater();
            });
        });
    });
});
