(function() {
    let autoNextEnabled = true;
    let autoUnmuteEnabled = true;
    let persistentSpeed = 1.0;
    let hasUserInteracted = false;

    // Track User Interaction for Safe Audio Autoplay per Chrome Policy
    ['click', 'keydown', 'pointerdown', 'touchstart'].forEach(evt => {
        window.addEventListener(evt, () => { hasUserInteracted = true; }, { once: true, capture: true });
    });

    // Load Saved Settings
    chrome.storage.sync.get(['cs_auto_next', 'cs_auto_unmute', 'cs_playback_speed'], (data) => {
        if (data.cs_auto_next !== undefined) autoNextEnabled = data.cs_auto_next;
        if (data.cs_auto_unmute !== undefined) autoUnmuteEnabled = data.cs_auto_unmute;
        if (data.cs_playback_speed) persistentSpeed = parseFloat(data.cs_playback_speed);
        enforcePersistentSpeed();
    });

    // 1. Persistent Playback Speed Enforcement (Applies to Next Video Automatically)
    function enforcePersistentSpeed() {
        document.querySelectorAll('video').forEach(v => {
            if (!document.querySelector('.ad-showing')) {
                if (v.playbackRate !== persistentSpeed) {
                    v.playbackRate = persistentSpeed;
                }
            }
        });
    }

    document.addEventListener('play', (e) => {
        if (e.target && e.target.tagName === 'VIDEO' && !document.querySelector('.ad-showing')) {
            e.target.playbackRate = persistentSpeed;
        }
    }, true);

    document.addEventListener('loadedmetadata', (e) => {
        if (e.target && e.target.tagName === 'VIDEO' && !document.querySelector('.ad-showing')) {
            e.target.playbackRate = persistentSpeed;
        }
    }, true);

    // 2. High-Speed Ad-Skipper (<150ms Instant Skip + 16x Ad Fast-Forward)
    setInterval(() => {
        const skipSelectors = [
            '.ytp-ad-skip-button', '.ytp-ad-skip-button-modern', '.ytp-skip-ad-button', 
            'button.ytp-ad-skip-button-modern', '.ytp-ad-skip-button-container button',
            '[id^="skip-button"] button', '[aria-label*="Skip Ad" i]', '.videoAdUiSkipButton', 
            '.ytp-ad-overlay-close-button', '.ytp-ad-preview-container'
        ];
        
        skipSelectors.forEach(s => {
            document.querySelectorAll(s).forEach(btn => {
                try {
                    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    btn.click();
                } catch(e) {}
            });
        });
        
        // Fast-forward unskippable video ads
        const adShowing = document.querySelector('.ad-showing, .ytp-ad-player-overlay');
        const vids = document.querySelectorAll('video');
        if (adShowing) {
            vids.forEach(v => {
                v.playbackRate = 16.0;
                v.muted = true;
            });
        } else {
            // Restore persistent speed once ad ends
            vids.forEach(v => {
                if (v.playbackRate === 16.0) {
                    v.playbackRate = persistentSpeed;
                    v.muted = false;
                }
            });
        }
    }, 150);

    // 3. Safe Auto-Unmute
    setInterval(() => {
        if (!autoUnmuteEnabled) return;
        const userActive = (navigator.userActivation && navigator.userActivation.hasBeenActive) || hasUserInteracted;
        if (!userActive) return;

        document.querySelectorAll('video').forEach(v => {
            if (v.muted && !document.querySelector('.ad-showing')) {
                try {
                    v.muted = false;
                    v.volume = 1.0;
                } catch(e) {}
            }
        });
        document.querySelectorAll('[aria-label*="unmute" i], [aria-label*="Unmute" i]').forEach(b => {
            try { b.click(); } catch(e) {}
        });
    }, 800);

    // 4. Continuous PiP & Auto-Play Next Video
    document.addEventListener('ended', async (e) => {
        if (!autoNextEnabled) return;
        if (e.target && e.target.tagName === 'VIDEO') {
            const wasInPiP = document.pictureInPictureElement === e.target;
            const vids = Array.from(document.querySelectorAll('video'));
            const currentIdx = vids.indexOf(e.target);

            if (currentIdx !== -1 && currentIdx + 1 < vids.length) {
                const nextVid = vids[currentIdx + 1];
                nextVid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(async () => {
                    nextVid.muted = false;
                    nextVid.volume = 1.0;
                    nextVid.playbackRate = persistentSpeed;
                    try {
                        await nextVid.play();
                        if (wasInPiP) await nextVid.requestPictureInPicture();
                    } catch(err) {}
                }, 700);
            }
        }
    }, true);

    // 5. Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
        const vids = Array.from(document.querySelectorAll('video'));
        const v = vids.find(v => !v.paused && v.readyState > 0) || vids[0];
        if (!v) return;

        if (e.shiftKey && (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd')) {
            e.preventDefault(); 
            persistentSpeed = Math.min(3.5, +(persistentSpeed + 0.25).toFixed(2));
            chrome.storage.sync.set({ cs_playback_speed: persistentSpeed });
            vids.forEach(vid => vid.playbackRate = persistentSpeed);
        } else if (e.shiftKey && (e.key === '_' || e.key === '-' || e.code === 'NumpadSubtract')) {
            e.preventDefault(); 
            persistentSpeed = Math.max(0.25, +(persistentSpeed - 0.25).toFixed(2));
            chrome.storage.sync.set({ cs_playback_speed: persistentSpeed });
            vids.forEach(vid => vid.playbackRate = persistentSpeed);
        } else if (!e.shiftKey && (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd')) {
            e.preventDefault(); v.volume = Math.min(1.0, +(v.volume + 0.1).toFixed(2));
        } else if (!e.shiftKey && (e.key === '-' || e.code === 'NumpadSubtract')) {
            e.preventDefault(); v.volume = Math.max(0.0, +(v.volume - 0.1).toFixed(2));
        } else if (e.code === 'Space') { e.preventDefault(); v.paused ? v.play() : v.pause(); }
        else if (e.code === 'KeyF') { e.preventDefault(); (v.parentElement || v).requestFullscreen(); }
        else if (e.code === 'KeyM') { e.preventDefault(); v.muted = !v.muted; }
        else if (e.code === 'ArrowRight') { e.preventDefault(); v.currentTime += 10; }
        else if (e.code === 'ArrowLeft') { e.preventDefault(); v.currentTime -= 10; }
    });

    // 6. Message Listener from Popup
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === 'GET_METADATA') {
            const activeVid = Array.from(document.querySelectorAll('video')).find(v => !v.paused && v.readyState > 0) || document.querySelector('video');
            let u = window.location.href;
            let t = document.title || 'Saved Video';
            let s = 'Web';

            if (location.hostname.includes('youtube.com')) {
                s = 'YouTube';
                const yt = document.querySelector('h1.ytd-watch-metadata, #title h1, h1.title');
                if (yt && yt.innerText) t = yt.innerText.trim();
                if (activeVid) {
                    const link = activeVid.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-reel-video-renderer')?.querySelector('a#thumbnail, a[href^="/watch"], a[href^="/shorts"]');
                    if (link && link.href) u = link.href;
                }
            } else if (location.hostname.includes('facebook.com')) {
                s = 'Facebook';
                if (activeVid) {
                    const card = activeVid.closest('[role="article"], div[data-pagelet*="Feed"] > div, div[data-pagelet^="FeedUnit"]');
                    if (card) {
                        const link = card.querySelector('a[href*="/watch"], a[href*="/reel/"], a[href*="/videos/"]');
                        if (link && link.href) u = link.href;
                        const cap = card.querySelector('div[data-ad-preview="message"], div[dir="auto"], h2, strong');
                        if (cap && cap.innerText) t = cap.innerText.trim().split('\n')[0].slice(0, 60);
                    }
                }
            } else if (location.hostname.includes('tiktok.com')) {
                s = 'TikTok';
                const desc = document.querySelector('[data-e2e="browse-video-desc"]');
                if (desc && desc.innerText) t = desc.innerText.trim().slice(0, 60);
            }
            sendResponse({ url: u, title: t, site: s });
        } else if (msg.action === 'UPDATE_MEDIA_SETTINGS') {
            autoNextEnabled = msg.settings.autoNextEnabled;
            autoUnmuteEnabled = msg.settings.autoUnmuteEnabled;
            if (msg.settings.persistentSpeed) {
                persistentSpeed = msg.settings.persistentSpeed;
                enforcePersistentSpeed();
            }
            sendResponse({ status: 'ok' });
        } else if (msg.action === 'TRIGGER_PIP') {
            const vids = Array.from(document.querySelectorAll('video'));
            const activeVid = vids.find(v => !v.paused && v.readyState > 0) || vids[0];
            if (activeVid) document.pictureInPictureElement ? document.exitPictureInPicture() : activeVid.requestPictureInPicture();
        } else if (msg.action === 'TRIGGER_FOCUS') {
            const vids = Array.from(document.querySelectorAll('video'));
            const activeVid = vids.find(v => !v.paused && v.readyState > 0) || vids[0];
            if (activeVid) document.fullscreenElement ? document.exitFullscreen() : (activeVid.parentElement.parentElement || activeVid).requestFullscreen();
        } else if (msg.action === 'SET_SPEED') {
            persistentSpeed = msg.speed;
            chrome.storage.sync.set({ cs_playback_speed: persistentSpeed });
            enforcePersistentSpeed();
        }
        return true;
    });
})();
