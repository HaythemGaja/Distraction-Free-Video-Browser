(function() {
    let panelSettings = {
        showTopBar: true,
        showStories: true,
        showLeftRail: false,
        showRightRail: false,
        showComments: true,
        feedWidth: 680
    };
    let commentSortMode = 'newest';
    let autoNextEnabled = true;

    // Load initial settings from Chrome Storage
    chrome.storage.sync.get(['cs_panel_settings', 'cs_comment_sort_mode', 'cs_auto_next'], (data) => {
        if (data.cs_panel_settings) panelSettings = data.cs_panel_settings;
        if (data.cs_comment_sort_mode) commentSortMode = data.cs_comment_sort_mode;
        if (data.cs_auto_next !== undefined) autoNextEnabled = data.cs_auto_next;
        applyStyles();
    });

    // 1. Dynamic Live CSS Generator
    function generateCSS() {
        if (!location.hostname.includes('facebook.com')) return '';
        return `
            /* Top Header */
            ${!panelSettings.showTopBar ? `[role="banner"], header, div[data-pagelet="NavigationTop"] { display: none !important; }` : `[role="banner"], header { visibility: visible !important; }`}
            
            /* Stories Tray */
            ${!panelSettings.showStories ? `[aria-label="Stories"], div[data-pagelet*="Stories"] { display: none !important; }` : `[aria-label="Stories"], div[data-pagelet*="Stories"] { display: flex !important; margin: 0 auto 12px auto !important; }`}
            
            /* Left Rail */
            ${!panelSettings.showLeftRail ? `div[data-pagelet="LeftRail"], #leftCol, div[role="navigation"]:not([role="banner"]):not([role="banner"] *):not([role="main"] *) { display: none !important; width: 0 !important; }` : `div[data-pagelet="LeftRail"], #leftCol { display: block !important; }`}
            
            /* Right Rail */
            ${!panelSettings.showRightRail ? `div[data-pagelet="RightRail"], #rightCol, [role="complementary"] { display: none !important; width: 0 !important; }` : `div[data-pagelet="RightRail"], #rightCol, [role="complementary"] { display: block !important; }`}
            
            /* Comments */
            ${!panelSettings.showComments ? `div[data-pagelet*="Comment"], div[aria-label*="Comment" i] { display: none !important; }` : `div[data-pagelet*="Comment"] { display: block !important; width: 100% !important; }`}
            
            /* Feed Centering & Width */
            ${!panelSettings.showLeftRail && !panelSettings.showRightRail ? `
                div[role="main"] { margin-left: auto !important; margin-right: auto !important; float: none !important; }
                div[role="feed"], div[data-pagelet="MainFeed"], div[data-pagelet*="Feed"] {
                    max-width: ${panelSettings.feedWidth}px !important; margin-left: auto !important; margin-right: auto !important; transition: max-width 0.15s ease !important;
                }
            ` : ''}
        `;
    }

    function applyStyles() {
        let el = document.getElementById('cinemastream-injected-style');
        if (!el) {
            el = document.createElement('style');
            el.id = 'cinemastream-injected-style';
            document.head.appendChild(el);
        }
        el.textContent = generateCSS();
    }

    // 2. Auto Ad-Skipper (YouTube & Facebook)
    setInterval(() => {
        const skipSelectors = [
            '.ytp-ad-skip-button', '.ytp-ad-skip-button-modern', '.ytp-skip-ad-button', 
            '[id^="skip-button"] button', '[aria-label*="Skip Ad" i]', '.videoAdUiSkipButton', 
            '.ytp-ad-overlay-close-button'
        ];
        skipSelectors.forEach(s => document.querySelectorAll(s).forEach(b => b.click()));
        
        const adShowing = document.querySelector('.ad-showing, .ytp-ad-player-overlay');
        if (adShowing) {
            const vid = document.querySelector('video');
            if (vid) { vid.playbackRate = 16.0; vid.muted = true; }
        }
    }, 500);

    // 3. Auto-Unmute
    setInterval(() => {
        document.querySelectorAll('video').forEach(v => {
            if (v.muted && !document.querySelector('.ad-showing')) {
                v.muted = false;
                v.volume = 1.0;
            }
        });
        document.querySelectorAll('[aria-label*="unmute" i], [aria-label*="Unmute" i]').forEach(b => b.click());
    }, 800);

    // 4. Facebook Comment Sorting
    function triggerRealClick(elem) {
        elem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        elem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        elem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }

    setInterval(() => {
        if (!commentSortMode || commentSortMode === 'off' || !location.hostname.includes('facebook.com')) return;
        
        const filterBtns = Array.from(document.querySelectorAll('div[role="button"], span[dir="auto"], span')).filter(el => {
            const text = (el.innerText || '').trim().toLowerCase();
            return (text.includes('most relevant') || text.includes('top comments') || text.includes('newest') || text.includes('all comments')) && 
                   el.closest('[role="article"], div[data-pagelet*="Comment"], div[aria-label*="Comment" i]');
        });

        filterBtns.forEach(btn => {
            const postCard = btn.closest('[role="article"], div[data-pagelet*="Feed"] > div') || btn;
            if (postCard.dataset.userManualSort) return;

            const currentText = (btn.innerText || '').trim().toLowerCase();
            let needsSwitch = false;
            
            if (commentSortMode === 'all' && !currentText.includes('all comments')) needsSwitch = true;
            if (commentSortMode === 'newest' && !currentText.includes('newest')) needsSwitch = true;
            if (commentSortMode === 'relevant' && (!currentText.includes('most relevant') && !currentText.includes('top comments'))) needsSwitch = true;

            if (needsSwitch && !btn.dataset.autoSorted) {
                btn.dataset.autoSorted = "true";
                const clickable = btn.closest('div[role="button"]') || btn;
                triggerRealClick(clickable);

                setTimeout(() => {
                    const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], div[role="button"]'));
                    let targetItem = null;
                    if (commentSortMode === 'all') {
                        targetItem = menuItems.find(m => (m.innerText || '').toLowerCase().includes('all comments')) || menuItems[2];
                    } else if (commentSortMode === 'newest') {
                        targetItem = menuItems.find(m => (m.innerText || '').toLowerCase().includes('newest')) || menuItems[1];
                    } else if (commentSortMode === 'relevant') {
                        targetItem = menuItems.find(m => (m.innerText || '').toLowerCase().includes('relevant')) || menuItems[0];
                    }

                    if (targetItem) triggerRealClick(targetItem);
                    else document.body.click();
                }, 250);
            }
        });
    }, 1200);

    // 5. Continuous PiP & Auto-Play Next Video
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
                    try {
                        await nextVid.play();
                        if (wasInPiP) await nextVid.requestPictureInPicture();
                    } catch(err) {}
                }, 700);
            }
        }
    }, true);

    // 6. Keyboard Shortcuts (+ / - Volume, Shift + / Shift - Speed)
    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
        const vids = Array.from(document.querySelectorAll('video'));
        const v = vids.find(v => !v.paused && v.readyState > 0) || vids[0];
        if (!v) return;

        if (e.shiftKey && (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd')) {
            e.preventDefault(); v.playbackRate = Math.min(3.5, +(v.playbackRate + 0.25).toFixed(2));
        } else if (e.shiftKey && (e.key === '_' || e.key === '-' || e.code === 'NumpadSubtract')) {
            e.preventDefault(); v.playbackRate = Math.max(0.25, +(v.playbackRate - 0.25).toFixed(2));
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

    // 7. Message Listener from Extension Popup
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
        } else if (msg.action === 'UPDATE_SETTINGS') {
            panelSettings = msg.settings.panelSettings;
            commentSortMode = msg.settings.commentSortMode;
            autoNextEnabled = msg.settings.autoNextEnabled;
            applyStyles();
            sendResponse({ status: 'ok' });
        } else if (msg.action === 'TRIGGER_PIP') {
            const vids = Array.from(document.querySelectorAll('video'));
            const activeVid = vids.find(v => !v.paused && v.readyState > 0) || vids[0];
            if (activeVid) {
                document.pictureInPictureElement ? document.exitPictureInPicture() : activeVid.requestPictureInPicture();
            }
        } else if (msg.action === 'TRIGGER_FOCUS') {
            const vids = Array.from(document.querySelectorAll('video'));
            const activeVid = vids.find(v => !v.paused && v.readyState > 0) || vids[0];
            if (activeVid) {
                document.fullscreenElement ? document.exitFullscreen() : (activeVid.parentElement.parentElement || activeVid).requestFullscreen();
            }
        } else if (msg.action === 'SET_SPEED') {
            const vids = Array.from(document.querySelectorAll('video'));
            vids.forEach(v => v.playbackRate = msg.speed);
        }
        return true;
    });
})();
