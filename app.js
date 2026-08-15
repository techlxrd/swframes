const app = new Framework7({
  el: '#app',
  theme: "ios",
  name: "SWFrames",
  id: "com.techlxrd.SWFrames",
  touch: {
    touchHighlight: true,
    tapHold: true,
  },
  popup: {
    push: true,
    swipeToClose: 'to-bottom',
  },
  sheet: {
    push: true,
    swipeToClose: 'to-bottom',
  },
  colors: {
    primary: '#007AFF'
  },
  popover: {
    verticalPosition: 'bottom',
  },
  serviceWorker: {
    path: "./service-worker.js",
  }, 
});
var $ = Dom7;
const mainView = app.views.create(".view-main");
const locks = new Set();
const foundResizeObservers = new WeakMap();
const rootScrollHandlers = new WeakMap();
const repoDetailSwipeBackStates = new WeakMap();

function inAllowedArea(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest('#searchTab, .searchbar-found, .dialog, .popup, .sheet-modal, .popover');
}

function isRepoDetailPage(page) {
  if (!(page instanceof Element)) return false;
  return page.matches(
    '#repoDetailPage, #repo-detail, [data-name="repo-detail"], [data-page="repo-detail"], .page-repo-detail'
  );
}

function getPageFromArg(arg) {
  if (arg instanceof Element) return arg;
  if (arg && arg.el instanceof Element) return arg.el;
  if (arg && arg.pageEl instanceof Element) return arg.pageEl;
  if (arg && arg.currentPageEl instanceof Element) return arg.currentPageEl;
  return null;
}

function getSearchbarEnabled(searchbar) {
  if (!searchbar) return false;
  if (typeof searchbar.enabled === 'boolean') return searchbar.enabled;
  if (typeof searchbar.active === 'boolean') return searchbar.active;
  if (searchbar.el instanceof Element) {
    return searchbar.el.classList.contains('searchbar-enabled') ||
           searchbar.el.classList.contains('searchbar-active');
  }
  return false;
}

function preventBackgroundScroll(e) {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (inAllowedArea(target)) return;
  if (e.cancelable) e.preventDefault();
}

function preventDialogScroll(e) {
  const target = e.target;
  if (!(target instanceof Element)) return;
  const isDialog = target.closest('.dialog');
  const isBackdrop = target.classList.contains('dialog-backdrop');
  if (!isDialog && !isBackdrop) return;
  if (e.cancelable) e.preventDefault();
}

function lockBody() {
  document.documentElement.classList.add('ui-scroll-locked');
  document.body.classList.add('ui-scroll-locked');
  document.addEventListener('touchmove', preventBackgroundScroll, { passive: false, capture: true });
  document.addEventListener('wheel', preventBackgroundScroll, { passive: false, capture: true });
}

function unlockBody() {
  document.documentElement.classList.remove('ui-scroll-locked');
  document.body.classList.remove('ui-scroll-locked');
  document.removeEventListener('touchmove', preventBackgroundScroll, true);
  document.removeEventListener('wheel', preventBackgroundScroll, true);
}

function syncRepoDetailSwipeBack(searchbar, enable) {
  const page = searchbar.el.closest('.page');
  if (!page || !isRepoDetailPage(page)) return;
  const view = page.view || app.views.current;
  if (!view) return;
  if (enable) {
    if (!repoDetailSwipeBackStates.has(view)) {
      repoDetailSwipeBackStates.set(view, !!(view.params && view.params.iosSwipeBack));
    }
    if (view.params) view.params.iosSwipeBack = false;
    if ('allowPageSwipeBack' in view) view.allowPageSwipeBack = false;
    if (view.el) view.el.classList.add('repo-detail-swipeback-locked');
  } else {
    const prev = repoDetailSwipeBackStates.get(view);
    if (prev != null && view.params) {
      view.params.iosSwipeBack = prev;
      repoDetailSwipeBackStates.delete(view);
    }
    if ('allowPageSwipeBack' in view) view.allowPageSwipeBack = true;
    if (view.el) view.el.classList.remove('repo-detail-swipeback-locked');
  }
}

function blockRepoDetailSwipeBack(...args) {
  const page = args.map(getPageFromArg).find(Boolean) || document.querySelector('.page-current');
  if (!page || !isRepoDetailPage(page)) return;
  const sbEl = page.querySelector('.searchbar');
  const sb = sbEl ? app.searchbar.get(sbEl) : null;
  if (!getSearchbarEnabled(sb)) return;
  const evt = args.find(arg => arg && typeof arg.preventDefault === 'function');
  if (evt) evt.preventDefault();
  const data = args.find(arg => arg && typeof arg === 'object' && 'prevent' in arg);
  if (data) data.prevent = true;
  return false;
}

function syncSearchbarFound(searchbar, enable) {
  const page = searchbar.el.closest('.page');
  if (!page) return;
  const found = page.querySelector('.searchbar-found');
  if (!found) return;
  const isSearchTab = !!found.closest('#searchTab');
  const isBottomSearchPage = page.classList.contains('page-with-bottom-search');
  const isExpandable = searchbar.el.classList.contains('searchbar-expandable');

  if (!isSearchTab && !isBottomSearchPage) {
    found.style.cssText = '';
    return;
  }

  found.classList.toggle('ptr-ignore', enable);
  found.classList.toggle('ptr-watch-scrollable', enable);

  if (enable) {
    found.style.overflowY = 'auto';
    found.style.webkitOverflowScrolling = 'touch';
    found.style.overscrollBehavior = 'contain';
    found.style.touchAction = 'pan-y';
    found.style.minHeight = '0';

    if (isExpandable) {
      const updateHeight = () => {
        if (!found.isConnected) return;
        const vv = window.visualViewport;
        const vh = vv ? vv.height : window.innerHeight;
        const top = found.getBoundingClientRect().top;
        found.style.maxHeight = Math.max(120, vh - top - 12) + 'px';
      };

      if (foundResizeObservers.has(found)) {
        foundResizeObservers.get(found).disconnect();
      }
      const observer = new ResizeObserver(() => {
        requestAnimationFrame(updateHeight);
      });
      observer.observe(found);
      foundResizeObservers.set(found, observer);
      requestAnimationFrame(updateHeight);
    } else {
      found.style.maxHeight = '';
    }
  } else {
    found.style.cssText = '';
    const observer = foundResizeObservers.get(found);
    if (observer) {
      observer.disconnect();
      foundResizeObservers.delete(found);
    }
  }
}

function syncSearchScrollRoot(searchbar, enable) {
  const page = searchbar.el.closest('.page');
  if (!page) return;
  const root = page.querySelector('#searchTab');
  if (!root) return;

  root.classList.toggle('ptr-ignore', enable);
  root.classList.toggle('ptr-watch-scrollable', enable);

  if (enable) {
    root.style.overscrollBehavior = 'contain';
    root.style.touchAction = 'pan-y';
    root.style.webkitOverflowScrolling = 'touch';

    if (rootScrollHandlers.has(root)) return;

    let startY = 0;

    const onTouchStart = (e) => {
      if (!e.touches || !e.touches.length) return;
      startY = e.touches[0].clientY;
    };

    const onTouchMove = (e) => {
      if (!(e.target instanceof Element)) return;
      if (!root.contains(e.target)) return;
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      const deltaY = touch.clientY - startY;
      const atTop = root.scrollTop <= 0;
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 1;
      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        if (e.cancelable) e.preventDefault();
      }
    };

    const onWheel = (e) => {
      if (!(e.target instanceof Element)) return;
      if (!root.contains(e.target)) return;
      const atTop = root.scrollTop <= 0;
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 1;
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
        if (e.cancelable) e.preventDefault();
      }
    };

    root.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    root.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    root.addEventListener('wheel', onWheel, { passive: false, capture: true });
    rootScrollHandlers.set(root, { onTouchStart, onTouchMove, onWheel });
  } else {
    root.style.overscrollBehavior = '';
    root.style.touchAction = '';
    root.style.webkitOverflowScrolling = '';
    const handlers = rootScrollHandlers.get(root);
    if (!handlers) return;
    root.removeEventListener('touchstart', handlers.onTouchStart, true);
    root.removeEventListener('touchmove', handlers.onTouchMove, true);
    root.removeEventListener('wheel', handlers.onWheel, true);
    rootScrollHandlers.delete(root);
  }
}

document.addEventListener('touchmove', preventDialogScroll, { passive: false, capture: true });
document.addEventListener('wheel', preventDialogScroll, { passive: false, capture: true });
app.on('swipeback:beforechange', blockRepoDetailSwipeBack);

app.on('searchbarEnable', (searchbar) => {
  syncSearchbarFound(searchbar, true);
  syncSearchScrollRoot(searchbar, true);
  syncRepoDetailSwipeBack(searchbar, true);
  locks.add('search');
  if (locks.size === 1) lockBody();
});

app.on('searchbarSearch', (searchbar) => {
  syncSearchbarFound(searchbar, true);
  syncSearchScrollRoot(searchbar, true);
  syncRepoDetailSwipeBack(searchbar, true);
});

app.on('searchbarDisable', (searchbar) => {
  syncSearchbarFound(searchbar, false);
  syncSearchScrollRoot(searchbar, false);
  syncRepoDetailSwipeBack(searchbar, false);
  locks.delete('search');
  if (locks.size === 0) unlockBody();
});
document.addEventListener('click', function (e) {
  const clickedLink = e.target.closest('.sidebar-list .item-link');
  if (!clickedLink) return;
  app.popup.close();
  app.dialog.close();
  const currentPage = document.querySelector('.page-current[data-name="repo-detail"]');
  if (currentPage) {
    app.views.main.router.back();
  }
  const allLinks = document.querySelectorAll('.sidebar-list .item-link');
  for (const link of allLinks) {
    link.classList.remove('tab-link-active');
  }
  clickedLink.classList.add('tab-link-active');
});
document.addEventListener('click', function (e) {
  const clickedLink = e.target.closest('.sidebar-list .item-link');
  if (!clickedLink) return;
  app.popup.close();
  app.dialog.close();
  const currentPage = document.querySelector('.page-current[data-name="repo-detail"]');
  if (currentPage) {
    app.views.main.router.back();
  }
  const allLinks = document.querySelectorAll('.sidebar-list .item-link');
  for (const link of allLinks) {
    link.classList.remove('tab-link-active');
  }
  clickedLink.classList.add('tab-link-active');
});

window.addEventListener('error', function (event) {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (img.closest('.screenshots')) return;
  if (img.dataset.fallbackApplied) return;
  img.dataset.fallbackApplied = 'true';
  img.src = './assets/default.png';
}, true);

document.addEventListener('DOMContentLoaded', () => {
  app.on('tabShow', (tabEl) => {
    const tabId = `#${tabEl.id}`;
    if (!tabEl.id) return;
    const tabLink = document.querySelector(`.tab-link[href="${tabId}"]`);
    if (!tabLink) return;
    const title = tabLink.dataset.tabTitle;
    if (!title) return;
    const navbar = document.querySelector('.navbar.navbar-large');
    if (!navbar) return;
    const titleEl = navbar.querySelector('.title');
    const largeTitleEl = navbar.querySelector('.title-large-text');
    if (titleEl) titleEl.textContent = title;
    if (largeTitleEl) largeTitleEl.textContent = title;
  });

  window.goToTab = function (tabId) {
    app.popup.close();
    app.tab.show(tabId);
  };
});

function toggleDarkMode() {
  document.querySelector("html").classList.toggle("dark");
}

function applyDarkModeSetting() {
  const htmlElement = document.querySelector("html");
  const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const applyDarkMode = e => {
    htmlElement.classList.toggle("dark", e.matches);
  };
  darkModeQuery.addEventListener('change', applyDarkMode);
  applyDarkMode(darkModeQuery);
}
applyDarkModeSetting();
