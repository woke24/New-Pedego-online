/*
 * Focus Trap helpers
 */

/* ---------------------------------------
 * Focus‑trap helpers
 ----------------------------------------*/

// store all handler fns *and* run‑time data in one object
const trapFocusHandlers = {};

// will hold the element that had focus *before* the trap
let previouslyFocusedElement = null;

// scroll position saved while body scroll is locked
let lockedBodyScrollY = null;

function focusWithoutScroll(element) {
  if (!element?.focus) return;
  try {
    element.focus({ preventScroll: true });
  } catch (error) {
    element.focus();
  }
}

function lockBodyScroll() {
  if (lockedBodyScrollY === null) {
    lockedBodyScrollY = window.scrollY;
  }
  document.body.classList.add('overflow-hidden');
}

function unlockBodyScroll() {
  const scrollY = lockedBodyScrollY ?? window.scrollY;
  lockedBodyScrollY = null;
  document.body.classList.remove('overflow-hidden');
  window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
}

function isFocusableAndVisible(element) {
  if (element.matches(':disabled, [hidden]')) return false;

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;

  return element.getClientRects().length > 0;
}

function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll(
      "summary, a:not([tabindex^='-']), button:enabled:not([tabindex^='-']), [tabindex]:not([tabindex^='-']), [draggable], area, input:not([type=hidden]):enabled, select:enabled, textarea:enabled, object, iframe"
    )
  ).filter(isFocusableAndVisible);
}

function trapFocus(container) {
  // Remove any existing trap first
  removeTrapFocus();

  // Remember what was focused *before* we trap (if it's outside)
  const current = document.activeElement;
  previouslyFocusedElement =
    current && !container.contains(current) ? current : null;

  trapFocusHandlers.container = container;

  /* ---------- calculate first / last focusable ---------- */
  function setFocusableElements() {
    const elements = getFocusableElements(container);
    trapFocusHandlers.first = elements[0];
    trapFocusHandlers.last = elements[elements.length - 1];
  }
  setFocusableElements();

  trapFocusHandlers.keydown = (event) => {
    if (event.code.toUpperCase() !== 'TAB') return;

    setFocusableElements();

    const { first, last } = trapFocusHandlers;
    if (!first || !last) return;

    // TAB forward on the last element → loop to first
    if (event.target === last && !event.shiftKey) {
      event.preventDefault();
      focusWithoutScroll(first);
    }

    // SHIFT+TAB on the first element → loop to last
    if (event.target === first && event.shiftKey) {
      event.preventDefault();
      focusWithoutScroll(last);
    }
  };

  trapFocusHandlers.containFocus = (event) => {
    if (!trapFocusHandlers.container?.contains(event.target)) {
      setFocusableElements();
      const { first, last } = trapFocusHandlers;
      if (!first) return;

      const { relatedTarget } = event;
      if (
        relatedTarget &&
        trapFocusHandlers.container.contains(relatedTarget) &&
        relatedTarget === trapFocusHandlers.first
      ) {
        focusWithoutScroll(last);
      } else {
        focusWithoutScroll(first);
      }
    }
  };

  document.addEventListener('keydown', trapFocusHandlers.keydown, true);
  document.addEventListener('focusin', trapFocusHandlers.containFocus);

  /* ----------  Watch for DOM changes  ---------- */
  const observer = new MutationObserver(() => {
    setFocusableElements();

    // If focus was lost because the element was removed, restore it:
    const activeElement = document.activeElement;
    if (
      activeElement &&
      !container.contains(activeElement) &&
      !trapFocusHandlers.container?.contains(activeElement)
    ) {
      focusWithoutScroll(trapFocusHandlers.first);
    }
  });

  observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'tabindex'] });

  trapFocusHandlers.disconnect = () => observer.disconnect();

  trapFocusHandlers.update = setFocusableElements;

  focusWithoutScroll(trapFocusHandlers.first);
}

function removeTrapFocus(elementToFocus = null) {
  document.removeEventListener('keydown', trapFocusHandlers.keydown, true);
  document.removeEventListener('focusin', trapFocusHandlers.containFocus);

  trapFocusHandlers.disconnect?.();

  if (!elementToFocus && previouslyFocusedElement?.isConnected) {
    elementToFocus = previouslyFocusedElement;
  }

  if (elementToFocus) focusWithoutScroll(elementToFocus);

  previouslyFocusedElement = null;
  delete trapFocusHandlers.container;
  delete trapFocusHandlers.first;
  delete trapFocusHandlers.last;
  delete trapFocusHandlers.update;
}

function refreshTrapFocus() {
  trapFocusHandlers.update?.();
}

/**
 * Validates if a URL belongs to YouTube or Vimeo by parsing and checking the hostname.
 * This prevents security risks from malicious URLs that might contain these strings.
 * @param {string} url - The URL to validate
 * @returns {Object|null} - Object with type: 'youtube'|'vimeo' or null if invalid
 */
function validateVideoUrl(url) {
  if (!url || typeof url !== 'string') return null;

  try {
    // Parse the URL to extract the hostname
    const urlObj = new URL(url, window.location.origin);
    const hostname = urlObj.hostname.toLowerCase();

    // Allowed YouTube domains (including subdomains)
    const youtubeDomains = [
      'youtube.com',
      'www.youtube.com',
      'youtu.be',
      'www.youtu.be',
      'youtube-nocookie.com',
      'www.youtube-nocookie.com'
    ];

    // Allowed Vimeo domains (including subdomains)
    const vimeoDomains = [
      'vimeo.com',
      'www.vimeo.com',
      'player.vimeo.com'
    ];

    // Check if hostname matches any allowed domain (exact match or subdomain)
    for (const domain of youtubeDomains) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return { type: 'youtube' };
      }
    }

    for (const domain of vimeoDomains) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return { type: 'vimeo' };
      }
    }

    return null;
  } catch (e) {
    // Invalid URL format
    return null;
  }
}

/* ---------------------------------------
 * Other helpers
 ----------------------------------------*/

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function throttle(fn, wait) {
  let t = false;
  return (...args) => {
    if (!t) {
      fn.apply(this, args)
      t = true;
      setTimeout(() => t = false, wait)
    }
  }
}

/*
 * Woolman Common JS
 */

// Initialize window.Woolman object
if (typeof window.Woolman == 'undefined') {
  window.Woolman = {};
}
Woolman.bind = function (fn, scope) {
  return function () {
    return fn.apply(scope, arguments);
  };
};

// -------
// Load components / libraries
Woolman.init = function () {
  Woolman.ModalsAndDrawers.init();
  Woolman.Header.init();
  Woolman.DetailsAccordions.init();
};

// -------
// Woolman Common JS - Utility library
Woolman.Utils = {
  debugMode: true,
  refreshTrapFocus,
  prepareQueryParams: () => {
    Shopify.queryParams = Shopify.queryParams || {};

    // Preserve existing query parameters
    if (location.search.length) {
      const params = location.search.substr(1).split('&');
      for (let i = 0; i < params.length; i++) {
        const keyValue = params[i].split('=');
        // Spaces are reverted back after the decode, since in component-facets.js we'll use URLSearchParams() method and we don't want to double decode the spaces
        if (keyValue.length) {
          Shopify.queryParams[decodeURIComponent(keyValue[0])] = decodeURIComponent(keyValue[1]).replaceAll('+', ' ');
        }
      }
    }

    return Shopify.queryParams;
  },
  formatMoney(cents, format) {
    const default_money_format = theme.settings.moneyFormat || '€{{amount}}';
    if (typeof cents == 'string') {
      cents = cents.replace('.', '');
    }
    if (window?.Shopify?.currency?.rate) {
      cents = cents * parseFloat(window.Shopify.currency.rate || 1.0);
    }

    var value = '';
    var placeholderRegex = /\{\{\s*(\w+)\s*\}\}/;
    var formatString = format || default_money_format;

    function defaultOption(opt, def) {
      return typeof opt == 'undefined' ? def : opt;
    }

    function formatWithDelimiters(number, precision, thousands, decimal) {
      precision = defaultOption(precision, 2);
      thousands = defaultOption(thousands, ',');
      decimal = defaultOption(decimal, '.');

      if (isNaN(number) || number == null) {
        return 0;
      }

      number = (number / 100.0).toFixed(precision);

      var parts = number.split('.'),
        dollars = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1' + thousands),
        cents = parts[1] ? decimal + parts[1] : '';

      return dollars + cents;
    }

    switch (formatString.match(placeholderRegex)[1]) {
      case 'amount':
        value = formatWithDelimiters(cents, 2);
        break;
      case 'amount_no_decimals':
        value = formatWithDelimiters(cents, 0);
        break;
      case 'amount_with_comma_separator':
        value = formatWithDelimiters(cents, 2, '.', ',');
        break;
      case 'amount_no_decimals_with_comma_separator':
        value = formatWithDelimiters(cents, 0, '.', ',');
        break;
    }

    return formatString.replace(placeholderRegex, value);
  },
};

// -------
// Woolman Common JS - Header component
Woolman.Header = {
  selectors: {
    header: 'MainHeader',
    cartBlip: '.cart-blip'
  },
  cache: {
    header: undefined,
    cartBlip: undefined,
    section: undefined,
    openButton: undefined
  },

  init: function () {
    this.cache.header = document.getElementById(this.selectors.header);
    this.cache.cartBlip = this.cache.header.querySelector(this.selectors.cartBlip);
    this.cache.section = this.cache.header.closest('.shopify-section');
    this.cache.openButton = this.cache.header.querySelector('[href="#drawer-menu"]')

    // Set the CSS variable on load
    this.setHeaderHeightVar();

    // Listen to the resize event and recalculate header height
    window.addEventListener('resize', throttle(this.setHeaderHeightVar.bind(this), 40));

    // Update cart blip when product is added to cart.
    document.addEventListener('ajaxProduct:added', this.updateCartBlip.bind(this))
    document.addEventListener('cart:update', this.updateCartBlip.bind(this));

    if (this.cache.header.dataset.stickyBehavior === 'none') return;
    this.initStickyBehavior(this.cache.header.dataset.stickyBehavior)
  },

  setHeaderHeightVar: function () {
    if (!this.cache.header) return;
    const headerHeight = this.cache.header.offsetHeight;
    document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);
    if (this.cache.header.dataset.stickyBehavior !== 'none') {
      document.documentElement.style.setProperty('--sticky-header-margin-top', `${headerHeight}px`);
    }
  },

  initStickyBehavior(behaviorType) {
    const stickyConfig = {
      headerHeight: this.cache.header.clientHeight,
      behavior: behaviorType
    }

    document.documentElement.classList.add('sticky-header-initialized', `sticky-header-${behaviorType}`);
    document.documentElement.style.setProperty('--sticky-header-margin-top', `${stickyConfig.headerHeight}px`);

    if (behaviorType === 'scroll' || behaviorType === 'fixed') {
      let prevScroll = window.scrollY || document.documentElement.scrollTop;
      let ticking = false;

      window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;

        requestAnimationFrame(() => {
          const curScroll = window.scrollY || document.documentElement.scrollTop;

          if (curScroll <= 0) {
            document.documentElement.classList.remove('sticky-header-show', 'sticky-header-hide');
            prevScroll = 0;
            ticking = false;
            return;
          }

          if (curScroll >= 300) {
            document.documentElement.classList.add('sticky-header-show');
          } else {
            document.documentElement.classList.remove('sticky-header-show');
          }

          if (behaviorType === 'scroll') {
            if (curScroll < prevScroll || curScroll < stickyConfig.headerHeight) {
              document.documentElement.classList.remove('sticky-header-hide');
            } else if (curScroll > prevScroll && curScroll >= 900) {
              document.documentElement.classList.add('sticky-header-hide');
            }
          }

          prevScroll = curScroll;
          ticking = false;
        });
      }, { passive: true });
    }
  },

  async updateCartBlip(e) {
    // cart:update carries the cart (item_count at the top level); other events need a fresh cart
    let itemCount = e?.detail?.cart?.item_count ?? e?.detail?.item_count;
    if (itemCount == null) {
      const res = await fetch(`${routes.cart_url}.js`);
      const cart = await res.json();
      itemCount = cart.item_count;
    }
    itemCount = itemCount || 0;

    const cartLink = this.cache.cartBlip.closest('.header-item-link');
    this.cache.cartBlip.textContent = itemCount;
    if (itemCount === 0) {
      this.cache.cartBlip.setAttribute('hidden', true);
      cartLink.classList.remove('has-blip-visible');
    } else {
      this.cache.cartBlip.removeAttribute('hidden')
      cartLink.classList.add('has-blip-visible');
    }

    // Screen reader label of the cart link, e.g. "View my cart (2)"
    const countLabel = cartLink.querySelector('[data-cart-count-label]');
    if (countLabel?.dataset.labelTemplate) {
      countLabel.textContent = countLabel.dataset.labelTemplate.replace('[count]', itemCount);
    }

    // Update notification cart amount at the same time (if present)
    const total_in_notification = document.querySelector('#cart-notification-link .cart-total');
    if (total_in_notification) {
      total_in_notification.textContent = itemCount;
    }
  }
};

class HeaderDropdown extends HTMLElement {
  constructor() {
    super();
    this.details = this.querySelector('details');
    this.summary = this.querySelector('summary');
    this.header = this.closest('header'); // Define the header element once
    this.timer = null;

    this.summary.addEventListener('mouseenter', this.openDropdown.bind(this));
    this.details.addEventListener('mouseenter', this.clearCloseTimer.bind(this));
    this.details.addEventListener('mouseleave', this.startCloseTimer.bind(this));
    this.summary.addEventListener('keydown', this.handleKeydown.bind(this));
  }

  openDropdown() {
    this.closeOtherDropdowns();
    this.details.open = true;
    if (this.header) {
      this.header.classList.add('sub-menu-open');
    }
  }

  closeOtherDropdowns() {
    if (this.header) {
      const otherDropdowns = this.header.querySelectorAll('header-dropdown details[open]');
      otherDropdowns.forEach(dropdown => {
        if (dropdown !== this.details) {
          dropdown.open = false;
          const parentDropdown = dropdown.closest('header-dropdown');
          if (parentDropdown && typeof parentDropdown.clearCloseTimer === 'function') {
            parentDropdown.clearCloseTimer();
          }
        }
      });
    }
  }

  startCloseTimer() {
    if (this.details.hasAttribute('data-theme-editor-pin')) return;

    this.timer = setTimeout(() => {
      this.details.open = false;
      if (this.header) {
        this.header.classList.remove('sub-menu-open');
      }
    }, 600);
  }

  clearCloseTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  handleKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      // Prevent default behavior to avoid double toggling
      event.preventDefault();
      if (!this.details.open) {
        this.openDropdown();
      } else {
        this.details.open = false;
        if (this.header) {
          this.header.classList.remove('sub-menu-open');
        }
      }
    }
  }
}
customElements.define('header-dropdown', HeaderDropdown);

// -------
// Pause all video-frame and external-video elements that are not inside the given container.
// Used when opening a modal so only modal content can have playing videos.
let videosPausedByModal = [];
function pauseVideosOutside(container) {
  videosPausedByModal = [];
  document.querySelectorAll('video-frame, external-video').forEach((el) => {
    if (!container.contains(el) && typeof el.pause === 'function') {
      const wasPlaying = el.video ? !el.video.paused : el.playing;
      el.pause();
      if (wasPlaying) {
        videosPausedByModal.push(el);
      }
    }
  });
}
// Resume playback for videos that were paused when the modal opened.
function resumeVideosPreviouslyPaused() {
  videosPausedByModal.forEach((el) => {
    if (typeof el.play === 'function') {
      el.play();
    }
  });
  videosPausedByModal = [];
}
// Pause all video-frame and external-video elements inside the given container.
// Used when closing a modal/drawer so playback stops; components resume via their own IntersectionObserver when visible again.
function pauseVideosInside(container) {
  if (!container) return;
  container.querySelectorAll('video-frame, external-video').forEach((el) => {
    if (typeof el.pause === 'function') {
      el.pause();
    }
  });
}

// -------
// Woolman Common JS - Modals & drawers library
Woolman.ModalsAndDrawers = {
  settings: {
    selectors: {
      modalLink: 'a[href*="#modal"]:not(.quick-buy-link)',
      drawerLink: 'a[href*="#drawer"]',
    },
  },
  focusTraps: {},
  init: function () {
    // Open modals/drawers via document delegation so links inside AJAX-replaced markup (e.g. product-media-area) still work.
    if (!this._modalDrawerClickDelegationBound) {
      this._modalDrawerClickDelegationBound = true;
      document.addEventListener('click', (event) => {
        const modalLink = event.target.closest(this.settings.selectors.modalLink);
        if (modalLink) {
          event.preventDefault();
          const raw = modalLink.getAttribute('href') || '';
          const hashStart = raw.indexOf('#');
          if (hashStart < 0) return;
          const afterHash = raw.slice(hashStart + 1);
          const targetId = afterHash.split('?')[0];
          const slideIndex = afterHash.split('?slide=')[1];
          const scrollToId = afterHash.split('?scroll=')[1];
          this.showModalOrDrawer(targetId, parseInt(slideIndex, 10), scrollToId);
          return;
        }
        const drawerLink = event.target.closest(this.settings.selectors.drawerLink);
        if (drawerLink) {
          event.preventDefault();
          const raw = drawerLink.getAttribute('href') || '';
          const hashStart = raw.indexOf('#');
          if (hashStart < 0) return;
          const afterHash = raw.slice(hashStart + 1);
          const targetId = afterHash.split('?')[0];
          this.showModalOrDrawer(targetId);
          return;
        }

        const closeTrigger = event.target.closest('[data-close], [data-overlay]');
        if (closeTrigger) {
          this.closeModalOrDrawerOrDrawerFromEvent(event);
        }
      });
    }

    // Escape to close all
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' || event.keyCode === 27) {
        document.querySelectorAll('.drawer.is-open, .modal.is-open').forEach((el) => {
          pauseVideosInside(el);
        });
        removeTrapFocus();
        document.querySelectorAll('.drawer').forEach((drawer) => {
          drawer.classList.remove('is-open');
        });
        document.querySelector('drawer-menu')?.resetSubmenus?.();
        document.querySelectorAll('.modal').forEach((modal) => {
          modal.classList.remove('is-open');
        });
        unlockBodyScroll();
        resumeVideosPreviouslyPaused();
      }
    });
  },
  /**
   *
   * @param {string} targetId - ID of modal or drawer element, e.g. modal-geo, drawer-menu
   * @param {int} slideIndex - Index of a Gridy Slider slide inside the opened modal - (sliding motion)
   * @param {string} scrollToId - ID of a Gridy Slider slide inside the opened modal - (no motion)
   * Traps focus to modal and disables body scrolling.
   */
  showModalOrDrawer: function (targetId, slideIndex, scrollToId) {
    const targetElement = document.getElementById(targetId);
    if (!targetElement && Woolman.Utils.debugMode) {
      console.warn('No modal/drawer element specified');
    }
    if (!targetElement) {
      return;
    }

    if (targetElement.classList.contains('is-open')) return;

    const opener =
      document.activeElement?.isConnected &&
      !targetElement.contains(document.activeElement)
        ? document.activeElement
        : null;

    targetElement.classList.add('initialized', 'is-open');
    lockBodyScroll();

    pauseVideosOutside(targetElement);

    setTimeout(() => {
      trapFocus(targetElement);

      if (opener?.isConnected && !targetElement.contains(opener)) {
        previouslyFocusedElement = opener;
      }

      // Focus on drawerSearchInput if it exists
      const drawerSearchInput = targetElement.querySelector('#drawerSearchInput');
      if (drawerSearchInput) {
        drawerSearchInput.focus();
        refreshTrapFocus();
      }
    }, 600);

    if (slideIndex) {
      setTimeout(() => {
        const gridySlider = targetElement.querySelector('gridy-slider');
        gridySlider.scrollToSlide(slideIndex - 1);
      }, 600);
    } else if (scrollToId) {
      const scrollToElement = document.getElementById(scrollToId),
        modal_dialog = targetElement.querySelector('.gridy-track');

      modal_dialog.scrollTo({
        top: scrollToElement.offsetTop,
        left: scrollToElement.offsetLeft,
        behavior: "instant"
      });
    }
  },
  closeModalOrDrawer: function (targetId) {
    const targetElement = document.getElementById(targetId);
    pauseVideosInside(targetElement);
    removeTrapFocus();
    targetElement.classList.remove('is-open');
    unlockBodyScroll();
    resumeVideosPreviouslyPaused();
    if (targetId === 'drawer-menu') {
      document.querySelector('drawer-menu')?.resetSubmenus?.();
    }
  },
  closeModalOrDrawerOrDrawerFromEvent: function (event) {
    event.preventDefault();
    const triggerElement = event.target.closest('[data-close], [data-overlay]') || event.currentTarget;
    if (!triggerElement) return;

    const parentElement = triggerElement.closest('[data-parent]');
    if (!parentElement) return;

    removeTrapFocus();
    pauseVideosInside(parentElement);
    parentElement.classList.remove('is-open');
    unlockBodyScroll();
    resumeVideosPreviouslyPaused();
    if (parentElement.id === 'drawer-menu') {
      document.querySelector('drawer-menu')?.resetSubmenus?.();
    }
  }
};

/**
 * Allow us to trigger something when window is actually resized.
 */
let woolman_window_size = window.innerWidth;
window.addEventListener(
  'resize',
  debounce(() => {
    if (window.innerWidth == woolman_window_size) {
      return;
    }
    woolman_window_size = window.innerWidth;
    document.dispatchEvent(new CustomEvent('woolman:resize'));
  }),
  250
);

/**
 * Animated details element
 */
class Accordion {
  constructor(el) {
    if (el.hasAttribute('data-no-accordion-logic')) {
      return;
    }

    this.el = el;
    this.summary = el.querySelector('summary');
    this.content = el.querySelector('.content');
    this.video = this.content ? this.content.querySelector('video') : null;

    this.animation = null;
    this.isClosing = false;
    this.isExpanding = false;
    this.summary.addEventListener('click', (e) => this.onClick(e));
    this.toggleByViewport();
    document.addEventListener('woolman:resize', this.toggleByViewport.bind(this));
  }

  onClick(e) {
    e.preventDefault();
    this.el.style.overflow = 'hidden';
    if (this.isClosing || !this.el.open) {
      this.open();
    } else if (this.isExpanding || this.el.open) {
      this.shrink();
    }
  }

  shrink() {
    this.isClosing = true;

    // Pause video if it exists and is playing
    if (this.video && !this.video.paused) {
      this.video.pause();
    }

    const startHeight = `${this.el.offsetHeight}px`;
    const endHeight = `${this.summary.offsetHeight}px`;

    if (this.animation) {
      this.animation.cancel();
    }

    this.animation = this.el.animate({
      height: [startHeight, endHeight]
    }, {
      duration: 400,
      easing: 'ease-in-out'
    });

    this.animation.onfinish = () => this.onAnimationFinish(false);
    this.animation.oncancel = () => this.isClosing = false;
  }

  open() {
    this.el.style.height = `${this.el.offsetHeight}px`;
    this.el.open = true;
    window.requestAnimationFrame(() => this.expand());
  }

  expand() {
    this.isExpanding = true;
    const startHeight = `${this.el.offsetHeight}px`;
    const endHeight = `${this.summary.offsetHeight + this.content.offsetHeight}px`;

    if (this.animation) {
      this.animation.cancel();
    }

    this.animation = this.el.animate({
      height: [startHeight, endHeight]
    }, {
      duration: 400,
      easing: 'ease-out'
    });
    this.animation.onfinish = () => this.onAnimationFinish(true);
    this.animation.oncancel = () => this.isExpanding = false;
  }

  onAnimationFinish(open) {
    this.el.open = open;
    this.animation = null;
    this.isClosing = false;
    this.isExpanding = false;
    this.el.style.height = this.el.style.overflow = '';

    // If accordion is closed and video exists, ensure it's paused
    if (!open && this.video && !this.video.paused) {
      this.video.pause();
    }
  }

  toggleByViewport() {
    let mobileClose = this.el.dataset.mobileClose != undefined ? JSON.parse(this.el.dataset.mobileClose) : false;
    let desktopOpen = this.el.dataset.desktopOpen != undefined ? JSON.parse(this.el.dataset.desktopOpen) : false;

    if (woolman_window_size >= 768 && desktopOpen) {
      this.el.open = true;
    } else if (mobileClose) {
      this.el.open = false;
      // Pause video when accordion is closed by viewport toggle
      if (this.video && !this.video.paused) {
        this.video.pause();
      }
    }
  }
};

Woolman.DetailsAccordions = {
  init: function () {
    document.querySelectorAll('details').forEach((el) => {
      new Accordion(el);
    });
  }
};

Woolman.init();

class LocalizationPopover extends HTMLElement {
  constructor() {
    super();
    this.details = this.querySelector('details');
    if (!this.details) return;

    this.boundDocumentClick = this.handleDocumentClick.bind(this);
    this.boundKeydown = this.handleKeydown.bind(this);
    this.details.addEventListener('toggle', this.onToggle.bind(this));
  }

  onToggle() {
    if (this.details.open) {
      document.querySelectorAll('localization-popover details[open]').forEach((details) => {
        if (details !== this.details) {
          details.open = false;
        }
      });
      setTimeout(() => {
        document.addEventListener('click', this.boundDocumentClick);
        document.addEventListener('keydown', this.boundKeydown);
      }, 0);
    } else {
      document.removeEventListener('click', this.boundDocumentClick);
      document.removeEventListener('keydown', this.boundKeydown);
    }
  }

  handleDocumentClick(event) {
    if (!this.details.open || this.contains(event.target)) return;
    this.details.open = false;
  }

  handleKeydown(event) {
    if (event.key !== 'Escape' || !this.details.open) return;
    this.details.open = false;
  }
}

customElements.define('localization-popover', LocalizationPopover);

class LocalizationForm extends HTMLElement {
  constructor() {
    super();
    this.elements = {
      input: this.querySelector('input[name="locale_code"], input[name="country_code"]')
    };

    this.querySelectorAll('a.localization-link').forEach(item => item.addEventListener('click', this.onItemClick.bind(this)));
  }

  setLoadingState(clickedLink) {
    this.classList.add('is-loading');

    this.querySelectorAll('a.localization-link').forEach(link => {
      if (link === clickedLink) {
        link.classList.add('loading');
        link.setAttribute('aria-busy', 'true');
        link.querySelector('.loading-overlay')?.classList.remove('hidden');
      } else {
        link.classList.add('disabled');
        link.setAttribute('aria-disabled', 'true');
      }
    });
  }

  onItemClick(event) {
    event.preventDefault();
    if (this.classList.contains('is-loading')) return;

    const form = this.querySelector('form');
    this.elements.input.value = event.currentTarget.dataset.value;

    // Filter params fix, replace "%2C" with ","
    let return_to_value = form.querySelector('[name="return_to"]').value;
    let indexOfFilters = return_to_value.indexOf("?filter");
    if (indexOfFilters !== -1) {
      let substringAfterFilters = return_to_value.substring(indexOfFilters);
      let replacedSubstring = substringAfterFilters.replace(/%2C/g, ",");
      form.querySelector('[name="return_to"]').value = return_to_value.substring(0, indexOfFilters) + replacedSubstring;
    }

    this.setLoadingState(event.currentTarget);

    if (form) form.submit();
  }
}

customElements.define('localization-form', LocalizationForm);

// Custom element for external YouTube/Vimeo embeds with responsive video switching.
// Usage: <external-video><iframe ...></iframe></external-video>
class ExternalVideo extends HTMLElement {
  constructor() {
    super();

    this.iframe = this.querySelector('iframe');
    if (!this.iframe) return;

    // Read data attributes from iframe
    this.type = this.iframe.dataset.type; // 'youtube' or 'vimeo'
    this.hasMobileVideo = this.iframe.dataset.hasMobileVideo === 'true';
    this.defaultVideoId = this.iframe.dataset.defaultVideoId;
    this.mobileVideoId = this.iframe.dataset.mobileVideoId;

    // Only auto-resume when in view if embed has data-autoplay (user-started never resumed by code)
    this.isAutoplay = this.iframe.hasAttribute('data-autoplay');

    // Mobile breakpoint (matches theme convention)
    this.mobileBreakpoint = 768;

    // Track current video to avoid unnecessary reloads
    this.currentVideoId = null;

    // Track visibility state to avoid redundant play/pause commands
    this.isVisible = false;
    // Track playback state so modals only resume videos that were actually playing
    this.playing = false;

    // Store bound function reference for proper cleanup
    this.boundUpdateVideoSource = this.updateVideoSource.bind(this);

    // Initialize with correct video
    this.updateVideoSource();

    // Listen for viewport changes
    if (this.hasMobileVideo) {
      document.addEventListener('woolman:resize', this.boundUpdateVideoSource);
    }

    // Set up IntersectionObserver for visibility-based playback
    this.initVisibilityObserver();
  }

  /**
   * Initializes the IntersectionObserver for visibility-based pause/play.
   * Uses threshold 0 to handle cases where video is larger than viewport.
   */
  initVisibilityObserver() {
    const observerOptions = {
      root: null, // viewport
      rootMargin: '0px',
      // Use threshold 0 to trigger when any part becomes visible/hidden
      // This handles cases where video is larger than viewport
      threshold: 0
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Video is at least partially visible
          if (!this.isVisible) {
            this.isVisible = true;
            // Only auto-resume if autoplay
            if (this.isAutoplay) {
              this.play();
            }
          }
        } else {
          // Video is completely out of view
          if (this.isVisible) {
            this.isVisible = false;
            this.pause();
          }
        }
      });
    }, observerOptions);

    this.observer.observe(this);
  }

  /**
   * Determines if the current viewport is mobile
   * @returns {boolean}
   */
  isMobileViewport() {
    return window.innerWidth < this.mobileBreakpoint;
  }

  /**
   * Gets the appropriate video ID based on current viewport
   * @returns {string}
   */
  getVideoIdForViewport() {
    if (!this.hasMobileVideo) {
      return this.defaultVideoId;
    }
    return this.isMobileViewport() ? this.mobileVideoId : this.defaultVideoId;
  }

  /**
   * Updates the iframe src with the correct video for the current viewport
   */
  updateVideoSource() {
    if (!this.hasMobileVideo) return;

    const targetVideoId = this.getVideoIdForViewport();

    // Skip if already showing the correct video
    if (this.currentVideoId === targetVideoId) return;

    this.currentVideoId = targetVideoId;
    const currentSrc = this.iframe.src;

    if (this.type === 'youtube') {
      this.updateYouTubeSource(currentSrc, targetVideoId);
    } else if (this.type === 'vimeo') {
      this.updateVimeoSource(currentSrc, targetVideoId);
    }
  }

  /**
   * Updates YouTube iframe src with new video ID
   * @param {string} currentSrc - Current iframe src
   * @param {string} newVideoId - New video ID to load
   */
  updateYouTubeSource(currentSrc, newVideoId) {
    try {
      const url = new URL(currentSrc);
      const pathParts = url.pathname.split('/');

      // Find and replace the video ID in the path (format: /embed/VIDEO_ID)
      const embedIndex = pathParts.indexOf('embed');
      if (embedIndex !== -1 && pathParts[embedIndex + 1]) {
        pathParts[embedIndex + 1] = newVideoId;
        url.pathname = pathParts.join('/');
      }

      // Update playlist parameter to match new video ID (for looping)
      if (url.searchParams.has('playlist')) {
        url.searchParams.set('playlist', newVideoId);
      }

      this.iframe.src = url.toString();
    } catch (e) {
      console.error('ExternalVideo: Error updating YouTube source', e);
    }
  }

  /**
   * Updates Vimeo iframe src with new video ID
   * @param {string} currentSrc - Current iframe src
   * @param {string} newVideoId - New video ID to load
   */
  updateVimeoSource(currentSrc, newVideoId) {
    try {
      const url = new URL(currentSrc);
      const pathParts = url.pathname.split('/');

      // Find and replace the video ID in the path (format: /video/VIDEO_ID)
      const videoIndex = pathParts.indexOf('video');
      if (videoIndex !== -1 && pathParts[videoIndex + 1]) {
        pathParts[videoIndex + 1] = newVideoId;
        url.pathname = pathParts.join('/');
      }

      // Update playlist parameter if present
      if (url.searchParams.has('playlist')) {
        url.searchParams.set('playlist', newVideoId);
      }

      this.iframe.src = url.toString();
    } catch (e) {
      console.error('ExternalVideo: Error updating Vimeo source', e);
    }
  }

  /**
   * Pauses the video playback
   */
  pause() {
    if (!this.iframe || !this.iframe.contentWindow) return;
    this.playing = false;

    if (this.type === 'youtube') {
      this.iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: 'pauseVideo',
        args: ''
      }), '*');
    } else if (this.type === 'vimeo') {
      this.iframe.contentWindow.postMessage(JSON.stringify({
        method: 'pause'
      }), '*');
    }
  }

  /**
   * Plays the video
   */
  play() {
    if (!this.iframe || !this.iframe.contentWindow) return;
    this.playing = true;

    if (this.type === 'youtube') {
      this.iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: 'playVideo',
        args: ''
      }), '*');
    } else if (this.type === 'vimeo') {
      this.iframe.contentWindow.postMessage(JSON.stringify({
        method: 'play'
      }), '*');
    }
  }
}
customElements.define('external-video', ExternalVideo);

/**
 * VideoFrame - Custom Web Component wrapper for native <video> elements.
 * Handles responsive video source switching when viewport changes between mobile and desktop.
 * Also handles visibility-based pause/play using IntersectionObserver.
 *
 * Usage (with responsive sources):
 * <video-frame data-responsive-video>
 *   <video playsinline autoplay loop muted>
 *     <source data-mobile-video src="mobile.mp4" type="video/mp4">
 *     <source data-default-video src="desktop.mp4" type="video/mp4">
 *   </video>
 * </video-frame>
 *
 * Usage (single source, no responsive switching):
 * <video-frame>
 *   <video playsinline autoplay loop muted>
 *     <source src="video.mp4" type="video/mp4">
 *   </video>
 * </video-frame>
 *
 * Visibility behavior:
 * - All videos are paused when out of view
 * - Only videos with autoplay attribute resume when back in view
 * - Videos without autoplay are user-controlled (play button)
 */
class VideoFrame extends HTMLElement {
  constructor() {
    super();

    this.video = this.querySelector('video');
    if (!this.video) return;

    // Check if this video should autoplay (only these resume on visibility)
    this.isAutoplay = this.video.hasAttribute('autoplay');

    // Check if responsive video switching is enabled
    this.isResponsive = this.hasAttribute('data-responsive-video');

    // Track visibility state
    this.isVisible = false;

    // Initialize responsive video if needed
    if (this.isResponsive) {
      this.initResponsiveVideo();
    }

    // Initialize visibility observer for all videos
    this.initVisibilityObserver();
  }

  /**
   * Initialize responsive video source switching
   */
  initResponsiveVideo() {
    this.mobileSource = this.video.querySelector('source[data-mobile-video]');
    this.defaultSource = this.video.querySelector('source[data-default-video]');

    // Bail if we don't have both sources
    if (!this.mobileSource || !this.defaultSource) return;

    // Mobile breakpoint (matches theme convention)
    this.mobileBreakpoint = 768;

    // Track current source to avoid unnecessary reloads
    this.currentSource = null;

    // Store bound function for proper cleanup
    this.boundUpdateSource = this.updateVideoSource.bind(this);

    // The browser picks a <source> via its media attribute on page load. Only reload if it picked
    // the wrong one (e.g. WebKit on iOS evaluating media before the viewport is set up), since
    // reloading restarts the download and delays playback.
    const syncWithSelectedSource = () => {
      this.currentSource = this.video.currentSrc || null;
      this.updateVideoSource();
    };

    if (this.video.currentSrc) {
      syncWithSelectedSource();
    } else {
      this.video.addEventListener('loadstart', syncWithSelectedSource, { once: true });
    }

    // Listen for viewport changes
    document.addEventListener('woolman:resize', this.boundUpdateSource);
  }

  /**
   * Initialize IntersectionObserver for visibility-based pause/play
   * - Pauses all videos when out of view
   * - Only resumes autoplay videos when back in view
   */
  initVisibilityObserver() {
    const observerOptions = {
      root: null, // viewport
      rootMargin: '0px',
      threshold: 0 // Trigger when any part becomes visible/hidden
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Video is at least partially visible
          if (!this.isVisible) {
            this.isVisible = true;
            // Only auto-resume if video has autoplay
            if (this.isAutoplay) {
              this.play();
            }
          }
        } else {
          // Video is completely out of view - pause all videos
          if (this.isVisible) {
            this.isVisible = false;
            this.pause();
          }
        }
      });
    }, observerOptions);

    this.observer.observe(this);
  }

  /**
   * Determines if the current viewport is mobile
   * @returns {boolean}
   */
  isMobileViewport() {
    return window.innerWidth < this.mobileBreakpoint;
  }

  /**
   * Gets the appropriate source URL based on current viewport
   * @returns {string}
   */
  getSourceForViewport() {
    return this.isMobileViewport()
      ? this.mobileSource.src
      : this.defaultSource.src;
  }

  /**
   * Updates the video source if viewport has changed
   */
  updateVideoSource() {
    const targetSource = this.getSourceForViewport();

    // Skip if already using the correct source
    if (this.currentSource === targetSource) return;

    this.currentSource = targetSource;

    // Store playback state
    const wasPlaying = !this.video.paused;
    const currentTime = this.video.currentTime;

    // Update the video src directly for more reliable switching
    this.video.src = targetSource;

    // Reload the video with new source
    this.video.load();

    // Restore playback state after source change
    this.video.addEventListener('loadeddata', () => {
      // Try to restore time position (may not work for all browsers/sources)
      if (currentTime > 0 && currentTime < this.video.duration) {
        this.video.currentTime = currentTime;
      }

      // Resume playback if it was playing before
      if (wasPlaying) {
        this.play();
      }
    }, { once: true });
  }

  /**
   * Pause video playback
   */
  pause() {
    if (!this.video.paused) {
      this.video.pause();
    }
  }

  /**
   * Play video with error handling
   */
  play() {
    if (this.video.paused) {
      this.video.play().catch(err => {
        // Autoplay may be blocked by browser, which is expected
        if (err.name !== 'NotAllowedError') {
          console.error('VideoFrame: Error playing video', err);
        }
      });
    }
  }
}
customElements.define('video-frame', VideoFrame);

// Gridy Slider - a custom Woolman built slider.
// Usage: <gridy-slider>
class GridySlider extends HTMLElement {
  constructor() {
    super();

    this.track = this.querySelector('.gridy-track');
    this.slides = this.querySelectorAll('.gridy-track > *');
    const child_count = this.track.childElementCount;

    const data_ipr_desktop = parseInt(this.dataset.iprDesktop, 10) || 1;
    const data_ipr_tablet = parseInt(this.dataset.iprTablet, 10) || data_ipr_desktop;
    const data_ipr_mobile = parseInt(this.dataset.iprMobile, 10) || 1;
    const data_init_scroll_to = this.dataset.initScrollTo;
    const data_autoplay = this.dataset.autoplay != undefined ? JSON.parse(this.dataset.autoplay) : false;
    const data_autoplay_delay = parseInt(this.dataset.autoplayDelay, 10) || 5000;
    const data_is_thumbnails_slider = this.dataset.thumbnailsFor != undefined ? true : false;
    const data_indicator = this.dataset.indicator != undefined ? JSON.parse(this.dataset.indicator) : false;
    const data_sliding_behavior = this.dataset.slidingBehavior;
    const data_thumbnail_slider = document.getElementById(`thumbnail-${this.id}`);
    const data_track_overflow_visible = this.dataset.overflowVisible != undefined ? true : false;

    this.config = {
      slide_count: child_count,
      current_slide: 0,
      active_slide_offset: 0, // used for thubnails slider

      ipr_desktop: data_ipr_desktop,
      ipr_tablet: data_ipr_tablet,
      ipr_mobile: data_ipr_mobile,
      breakpoint_tablet: 768,
      breakpoint_desktop: 1024,

      arrows: true,
      autoplay: data_autoplay || false,
      autoplay_delay: data_autoplay_delay, // in ms
      timer: null,

      // thumbnails related
      is_thumbnails_slider: data_is_thumbnails_slider,
      thumbnails_for: undefined,
      thumbnail_slider: data_thumbnail_slider,

      indicator: data_indicator,
      track_overflow_visible: data_track_overflow_visible,
      sliding_behavior: data_sliding_behavior || 'all'
    }

    // SCROLL ON INIT (with variant URL)
    if (data_init_scroll_to != undefined) {
      this.scrollToSlideByID(data_init_scroll_to);
    }

    // ARROWS INIT
    if (this.config.arrows) {
      this.buttons = this.querySelectorAll('[data-gridy-arrow]');
      this.buttons.forEach((arrowButton) => {
        arrowButton.addEventListener('click', this.onArrowClick.bind(this));
      });
    }

    // AUTOPLAY INIT
    if (this.config.autoplay) {
      this.autoplayGridy();

      // Always pause on hover
      this.addEventListener('mouseenter', this.clearAutoplayTimer);
      this.addEventListener('mouseleave', this.autoplayGridy);

      // Pause for touch devices
      this.addEventListener('touchenter', this.clearAutoplayTimer);
      this.addEventListener('touchleave', this.autoplayGridy);
    }

    // THUMBNAILS INIT
    if (this.config.is_thumbnails_slider) {
      this.config.active_slide_offset = 2,
        this.config.thumbnails_for = document.getElementById(this.dataset.thumbnailsFor);
      this.thumbnail = this.querySelectorAll('[data-thumbnail-btn]');
      this.thumbnail.forEach((thumbnail) => {
        thumbnail.addEventListener('click', this.onThumbnailClick.bind(this));
      });
    }

    // CURRENT SLIDE INDICATORS INIT
    if (this.config.indicator) {
      this.indicator_dots = this.querySelectorAll('[data-indicator-dot]');
      this.indicator_current = this.querySelector('[data-indicator-current]');
    }

    // SCROLL LISTENER (for setting active slide after normal scroll)
    if (!this.config.is_thumbnails_slider) {
      let scrollTimeout;
      this.track.addEventListener('scroll', function () {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(this.afterScrollStops.bind(this), 200);
      }.bind(this));
    }
  }

  afterScrollStops() {
    let slideInView = this.firstSlideInView();
    this.config.current_slide = slideInView;
    this.setActiveSlide(this.slides[slideInView + this.config.active_slide_offset]);

    // SYNC BACK TO THUMBNAILS SLIDER
    if (this.config.thumbnail_slider) {
      this.config.thumbnail_slider.scrollToSlide(slideInView);
    }
  }

  autoplayGridy() {
    this.config.timer = setInterval(this.scrollByIPR.bind(this), this.config.autoplay_delay, 'next');
  }

  clearAutoplayTimer() {
    clearInterval(this.config.timer);
    this.config.timer = null;
  }

  onThumbnailClick(event) {
    event.preventDefault();
    this.config.current_slide = Array.from(event.currentTarget.parentNode.children).indexOf(event.currentTarget);
    this.config.thumbnails_for.scrollToSlideByID(event.currentTarget.dataset.itemId);
    this.scrollToSlide(this.config.current_slide);
  }

  onArrowClick(event) {
    this.scrollByIPR(event.currentTarget.dataset.direction);
  }

  scrollByIPR(direction) {
    let currentIPR = this.getCurrentIPR(),
      slideMultiplier = this.config.sliding_behavior == 'all' ? currentIPR : 1,
      newCurrentSlide = this.config.current_slide,
      lastToShow = this.config.slide_count - currentIPR;

    if (direction === 'next') {
      newCurrentSlide = (newCurrentSlide + slideMultiplier);

      // Handle exceptions (Correct flow on next)
      if (this.config.current_slide >= lastToShow) {
        newCurrentSlide = 0; // Loop to start if all shown
      }
    } else if (direction === 'prev') {
      newCurrentSlide = (newCurrentSlide - slideMultiplier);

      // Handle exceptions
      if (this.config.current_slide > 0 && newCurrentSlide < 0) {
        newCurrentSlide = 0; // Must scroll to first item if before looping to the end
      } else if (newCurrentSlide < 0) {
        newCurrentSlide = lastToShow; // Loop to end slide past the first item
      }
    }

    this.config.current_slide = newCurrentSlide;
    this.scrollToSlide(newCurrentSlide);
  }

  scrollToSlide(newPosition) {
    // Needs to use scrollTo() instead of scrollIntoView()
    // since the later affects window scroll and thus cannot
    // be used with autoplay sliders.

    if (isNaN(newPosition)) {
      return;
    }

    // Can show different active slide compared to scrollTo slide for example in thumbnails slider
    let slidePosWithOffset = newPosition - this.config.active_slide_offset,
      newScrollToSlidePos = slidePosWithOffset > 0 ? slidePosWithOffset : 0;

    const slideInNewScrollToPos = this.slides[newScrollToSlidePos];

    let scrollToLeft = slideInNewScrollToPos.offsetLeft,
      scrollToTop = slideInNewScrollToPos.offsetTop;

    // If the track overflow is visible the scroll offset much include the left padding of the track
    // That is calculated with the first child offsetLeft
    if (this.config.track_overflow_visible) {
      scrollToLeft = this.slides[newScrollToSlidePos].offsetLeft - this.slides[0].offsetLeft;
    }

    this.track.scrollTo({
      left: scrollToLeft,
      top: scrollToTop,
      behavior: "smooth",
    });

    this.slides.forEach((item) => { item.classList.remove('active') });
    this.slides[newPosition].classList.add('active');
  }

  scrollToSlideByID(slideID) {
    // Second scrollTo method used with slideID
    // Used through thumbnails and variant change events

    const theSlide = document.getElementById(slideID);
    if (!theSlide) return;

    const newPosition = Array.from(theSlide.parentNode.children).indexOf(theSlide);
    this.scrollToSlide(newPosition);
  }

  setActiveSlide(slide) {
    this.slides.forEach((item) => { item.classList.remove('active') });
    slide.classList.add('active');

    if (this.config.indicator && this.indicator_dots) {
      this.indicator_current.textContent = this.config.current_slide + 1;
      this.indicator_dots.forEach((dot) => { dot.classList.remove('active') });
      this.indicator_dots[this.config.current_slide].classList.add('active');
    }
  }

  // Utility, returns items per row value according to current viewport size
  getCurrentIPR() {
    let currentIPR = this.config.ipr_mobile;
    if (woolman_window_size >= this.config.breakpoint_desktop) {
      currentIPR = this.config.ipr_desktop;
    } else if (woolman_window_size >= this.config.breakpoint_tablet) {
      currentIPR = this.config.ipr_tablet;
    }
    return currentIPR;
  }

  // Utility, returns the position of the first slide in view (1..n)
  firstSlideInView() {
    let loopIndex = 0;
    for (const slide of this.slides) {
      if (this.isSlideInView(slide)) {
        return loopIndex;
      }
      ++loopIndex;
    }

    // If visibility check fails return the last known current_slide
    return this.config.current_slide;
  }

  // Element visibility check
  isSlideInView(slide) {
    const containerBounds = this.track.getBoundingClientRect();
    const slideBounds = slide.getBoundingClientRect();

    const isSlideVisible =
      Math.round(slideBounds.top) >= Math.floor(containerBounds.top) &&
      Math.floor(slideBounds.bottom) <= Math.round(containerBounds.bottom) &&
      Math.round(slideBounds.left) >= Math.floor(containerBounds.left) &&
      Math.floor(slideBounds.right) <= Math.round(containerBounds.right);

    return isSlideVisible;
  }

}
customElements.define('gridy-slider', GridySlider);

// BeforeAfterSlider - a custom Woolman built before/after image comparison slider.
// Usage: <before-after-slider>
class BeforeAfterSlider extends HTMLElement {
  constructor() {
    super();

    this.rangeInput = this.querySelector('input[type="range"]');

    if (!this.rangeInput) return;

    this.initSlider();
    this.initDragHint();
  }

  // Moves the handle back and forth once (CSS animation) the first time the slider is in view.
  // Skipped in the theme editor; any interaction stops it so dragging works right away.
  initDragHint() {
    if (!this.hasAttribute('data-drag-hint') || window.Shopify?.designMode) return;

    const stopHint = () => this.classList.remove('is-hinting');
    this.addEventListener('animationend', (event) => {
      if (event.animationName === 'before-after-drag-hint') stopHint();
    });
    ['pointerdown', 'touchstart', 'keydown', 'focusin'].forEach((type) => {
      this.addEventListener(type, stopHint, { passive: true });
    });

    const observer = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      this.classList.add('is-hinting');
    }, { threshold: 0.5 });
    observer.observe(this);
  }

  initSlider() {
    this.updatePosition(this.rangeInput.value);

    // Input event listener
    this.rangeInput.addEventListener('input', this.onInput.bind(this));

    // Mouse events for better UX
    this.rangeInput.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.rangeInput.addEventListener('mouseup', this.onMouseUp.bind(this));

    // Touch events for mobile
    this.rangeInput.addEventListener('touchstart', this.onTouchStart.bind(this));
    this.rangeInput.addEventListener('touchend', this.onTouchEnd.bind(this));

    // Keyboard navigation
    this.rangeInput.addEventListener('keydown', this.onKeyDown.bind(this));
  }

  updatePosition(value) {
    const numericValue = (value === '0' || value === 0) ? 0 : Math.max(0, Math.min(1000, parseFloat(value) || 500));
    const position = numericValue / 10 + '%';
    this.style.setProperty('--position', position);
  }

  onInput(event) {
    this.updatePosition(event.target.value);
    this.rangeInput.setAttribute('aria-valuetext', `Showing ${event.target.value}% of before image`);
  }

  onMouseDown() {
    document.body.style.userSelect = 'none';
  }

  onMouseUp() {
    document.body.style.userSelect = '';
  }

  onTouchStart() {
    document.body.style.userSelect = 'none';
  }

  onTouchEnd() {
    document.body.style.userSelect = '';
  }

  onKeyDown(event) {
    const min = this.rangeInput.min ? parseInt(this.rangeInput.min) : 0;
    const max = this.rangeInput.max ? parseInt(this.rangeInput.max) : 1000;

    let newValue = parseInt(this.rangeInput.value);

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        newValue = Math.max(min, newValue - 50);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        newValue = Math.min(max, newValue + 50);
        break;
      case 'Home':
        newValue = min;
        break;
      case 'End':
        newValue = max;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.rangeInput.value = newValue;
    this.updatePosition(newValue);
  }
}
customElements.define('before-after-slider', BeforeAfterSlider);

// QuantityInput for + and - button functionality
// Used in: cart items, upsell items
class QuantityInput extends HTMLElement {
  constructor() {
    super();
    this.input = this.querySelector('input');
    this.changeEvent = new Event('change', { bubbles: true });

    this.querySelectorAll('button').forEach((button) => button.addEventListener('click', this.onButtonClick.bind(this)));
  }

  onButtonClick(event) {
    event.preventDefault();
    const previousValue = this.input.value;

    event.target.name === 'plus' ? this.input.stepUp() : this.input.stepDown();
    if (previousValue !== this.input.value) this.input.dispatchEvent(this.changeEvent);
  }
}
customElements.define('quantity-input', QuantityInput);

class VariantSelects extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.addEventListener('change', this.onVariantChange);
    const variantJson = this.querySelector('[data-selected-variant]')?.innerHTML;
    if (variantJson) this.currentVariant = JSON.parse(variantJson);
  }

  disconnectedCallback() {
    // Clean up event listeners when the element is removed from the DOM
    this.removeEventListener('change', this.onVariantChange);
  }

  // True in the quick view modal, which must not change the page it was opened from
  get isModal() {
    return this.dataset.modal === 'true';
  }

  onVariantChange(e) {
    // Check if we need to fetch a different product (for combined listings)
    const { isCombinedProduct, targetUrl } = this.combinedListingCheck(e);

    // Disable the add to cart button while we fetch the new product data
    this.toggleAddButton(true, '');
    const productUrl = targetUrl || this.dataset.url;
    this.updateSelectionMetadata(e);

    // Fetch the product section HTML
    this.fetchProductSection({
      newProductUrl: productUrl,
      callback: isCombinedProduct
        ? this.handleCombinedProduct(targetUrl)
        : this.handleUpdateProductInfo()
    }
    );
  }

  combinedListingCheck(e) {
    const currentUrl = window.location.pathname;
    let targetUrl;

    // For radio buttons, get productUrl from the target
    if (e.target.type === 'radio') {
      targetUrl = e.target.dataset.productUrl;
    }
    // For dropdowns, get productUrl from the selected option
    else if (e.target.tagName === 'SELECT') {
      const selectedOption = e.target.selectedOptions[0];
      targetUrl = selectedOption ? selectedOption.dataset.productUrl : undefined;
    }

    let isCombinedProduct = false;

    if (targetUrl != undefined && currentUrl != targetUrl) {
      isCombinedProduct = true;
    }

    return { isCombinedProduct, targetUrl };
  }

  async fetchProductSection({ newProductUrl, callback }) {
    const params = [];
    // Fetch either the full page, main-product section, or ajax-modal template
    if (this.isModal) {
      params.push('view=ajax-modal');
    } else {
      params.push(`section_id=${this.dataset.section}`);
    }
    this.selectedOptionValues = this.getSelectedOptionValues();
    const selectedOptionValues = this.selectedOptionValues?.join(',');
    params.push(`option_values=${selectedOptionValues}`);

    const requestUrl = `${newProductUrl}?${params.join('&')}`;

    fetch(requestUrl)
      .then((response) => response.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        callback(html)
      })
      .catch((error) => {
        console.error('Error fetching product section:', error);
      });
  }

  handleCombinedProduct(newProductUrl) {
    return (html) => {
      if (this.isModal) {
        const modalContent = this.closest('.modal-body');
        modalContent.innerHTML = html.querySelector('.modal-body').innerHTML;
      } else {
        const productElement = this.closest('.section--main-product');
        productElement.innerHTML = html.querySelector('.section--main-product').innerHTML;
        window.history.replaceState({}, '', `${newProductUrl}`);
      }
    }
  }

  updateSelectionMetadata(event) {
    const target = event.target;
    const tagName = target.tagName;

    if (tagName === 'SELECT' && target.selectedOptions.length) {
      Array.from(target.options)
        .find((option) => option.getAttribute('selected'))
        .removeAttribute('selected');
      target.selectedOptions[0].setAttribute('selected', 'selected');
    }
  }

  getSelectedOptionValues() {
    return Array.from(this.querySelectorAll('select option[selected], fieldset input:checked')).map(
      ({ dataset }) => dataset.optionValueId
    );
  }

  getSelectedVariant(productInfoNode) {
    const selectedVariant = productInfoNode.querySelector('variant-selects [data-selected-variant]')?.innerHTML;
    return !!selectedVariant ? JSON.parse(selectedVariant) : null;
  }

  handleUpdateProductInfo() {
    return (html) => {
      const prevFeaturedMediaId = this.currentVariant?.featured_media?.id;
      this.currentVariant = this.getSelectedVariant(html);
      this.updatePickupAvailability();
      this.removeErrorMessage();

      const featuredMediaChanged =
        this.currentVariant?.featured_media?.id !== prevFeaturedMediaId;

      if (!this.currentVariant) {
        this.renderProductInfo(html);
      } else {
        this.renderProductInfo(html, { featuredMediaChanged });
        this.updateMedia();
        this.updateURL();
        this.updateVariantInput();
        this.updateShareUrl();
      }
    }
  }

  updateSelectedModeMedia(html) {
    const sectionId = this.dataset.section;

    const tracks = [
      { sliderId: `slider-${sectionId}`, prefix: 'item-' },
      { sliderId: `thumbnail-slider-${sectionId}`, prefix: 'thumbnail-item-' },
    ];

    for (const { sliderId, prefix } of tracks) {
      const sourceSlider = html.getElementById(sliderId);
      const destSlider = document.getElementById(sliderId);
      if (!sourceSlider || !destSlider) continue;

      const sourceTrack = sourceSlider.querySelector('.gridy-track');
      const destTrack = destSlider.querySelector('.gridy-track');
      if (!sourceTrack || !destTrack) continue;

      const sourceItems = [...sourceTrack.children].filter(el => el.id?.startsWith(prefix));
      const destItems = [...destTrack.children].filter(el => el.id?.startsWith(prefix));
      const sourceIdSet = new Set(sourceItems.map(el => el.id));
      const destIdSet = new Set(destItems.map(el => el.id));

      for (const item of destItems) {
        if (!sourceIdSet.has(item.id)) item.remove();
      }

      for (let i = 0; i < sourceItems.length; i++) {
        const srcItem = sourceItems[i];
        if (destIdSet.has(srcItem.id)) continue;

        let refNode = null;
        for (let j = i + 1; j < sourceItems.length; j++) {
          refNode = destTrack.querySelector(`#${sourceItems[j].id}`);
          if (refNode) break;
        }
        destTrack.insertBefore(srcItem, refNode);
      }
    }

    const sourceZoom = html.getElementById(`modal--zoom-gallery-${sectionId}`);
    const destZoom = document.getElementById(`modal--zoom-gallery-${sectionId}`);
    if (sourceZoom && destZoom) {
      destZoom.innerHTML = sourceZoom.innerHTML;
    }
  }

  updateMedia() {
    if (!this.currentVariant) return;
    if (!this.currentVariant.featured_media) return;

    const mediaGridySlider = document.getElementById(`slider-${this.dataset.section}`);
    const thumbnailsGridySlider = document.getElementById(`thumbnail-slider-${this.dataset.section}`);

    if (mediaGridySlider) {
      mediaGridySlider.scrollToSlideByID(
        `item-${this.currentVariant.featured_media.id}`
      );
    }

    if (thumbnailsGridySlider) {
      thumbnailsGridySlider.scrollToSlideByID(`thumbnail-item-${this.currentVariant.featured_media.id}`)
    }

    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    const isGrid = mediaGridySlider?.dataset.desktopEnabled === 'false' ? true : false;
    if (isDesktop && isGrid) {
      document.getElementById(`item-${this.currentVariant.featured_media.id}`)?.scrollIntoView();
    }
  }

  updateURL() {
    if (!this.currentVariant || this.isModal || this.dataset.updateUrl === 'false') return;
    window.history.replaceState({}, '', `${this.dataset.url}?variant=${this.currentVariant.id}`);
  }

  updateShareUrl() {
    const shareButton = document.getElementById(`Share-${this.dataset.section}`);
    if (!shareButton || !shareButton.updateUrl) return;
    shareButton.updateUrl(`${window.shopUrl}${this.dataset.url}?variant=${this.currentVariant.id}`);
  }

  updateVariantInput() {
    const productForms = document.querySelectorAll(`#product-form-${this.dataset.section}, #product-form-installment-${this.dataset.section}, #product-form-${this.dataset.section}-product-buy-bar`);
    productForms.forEach((productForm) => {
      const input = productForm.querySelector('input[name="id"]');
      input.value = this.currentVariant.id;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  updatePickupAvailability() {
    // The quick view has no pickup availability, so leave the product page's one alone
    if (this.isModal) return;
    const pickUpAvailability = document.querySelector('pickup-availability');
    if (!pickUpAvailability) return;

    if (this.currentVariant && this.currentVariant.available) {
      pickUpAvailability.fetchAvailability(this.currentVariant.id);
    } else {
      pickUpAvailability.removeAttribute('available');
      pickUpAvailability.innerHTML = '';
    }
  }

  removeErrorMessage() {
    const section = this.closest('section');
    if (!section) return;

    const productForm = section.querySelector('product-form');
    if (productForm) productForm.handleErrorMessage();
  }

  renderProductInfo(html, { featuredMediaChanged = true } = {}) {
    const updateSourceFromDestination = (id, shouldHide = (source) => false) => {
      const source = html.getElementById(`${id}-${this.dataset.section}`);
      const destination = document.getElementById(`${id}-${this.dataset.section}`);
      if (source && destination) {
        destination.innerHTML = source.innerHTML;
        destination.classList.toggle('hidden', shouldHide(source));
      }
    };

    updateSourceFromDestination('variant-selects');
    updateSourceFromDestination('price');
    updateSourceFromDestination('buy-bar-info');

    if (featuredMediaChanged) {
      const variantImagesMode = this.dataset.variantImages || 'all';

      if (variantImagesMode === 'selected_group') {
        updateSourceFromDestination('product-media-area');
        updateSourceFromDestination('modal--zoom-gallery');
      } else if (variantImagesMode === 'selected') {
        this.updateSelectedModeMedia(html);
      }
    }

    updateSourceFromDestination('Sku', ({ classList }) => classList.contains('hidden'));
    updateSourceFromDestination('Inventory', ({ innerText }) => innerText === '');
    updateSourceFromDestination('saleBadge', ({ classList }) => classList.contains('hidden'));
    if (this.currentVariant) {
      this.toggleAddButton(!this.currentVariant.available, window.variantStrings.soldOut);
    } else {
      this.setUnavailable();
    }
  }

  toggleAddButton(disable = true, text) {
    const productForm = document.getElementById(`product-form-${this.dataset.section}`);
    if (!productForm) return;
    const addButton = productForm.querySelector('[name="add"]');
    const addButtonText = productForm.querySelector('[name="add"] > span');
    const multiplyButtons = productForm.querySelectorAll('.btn--add-multiplier');
    if (!addButton) return;

    if (disable) {
      addButton.setAttribute('disabled', 'disabled');
      if (text) addButtonText.textContent = text;
      if (multiplyButtons) {
        multiplyButtons.forEach(button => {
          button.disabled = true;
        });
      }
    } else {
      addButton.removeAttribute('disabled');
      if (this.dataset.isPreorder == 'true') {
        addButtonText.textContent = window.variantStrings.preOrder;
      } else {
        addButtonText.textContent = window.variantStrings.addToCart;
      }
      if (multiplyButtons) {
        multiplyButtons.forEach(button => {
          button.removeAttribute('disabled');
        });
      }
    }
  }

  setUnavailable() {
    const button = document.getElementById(`product-form-${this.dataset.section}`);
    const addButton = button.querySelector('[name="add"]');
    const addButtonText = button.querySelector('[name="add"] > span');
    const price = document.getElementById(`price-${this.dataset.section}`);
    if (!addButton) return;
    addButtonText.textContent = window.variantStrings.unavailable;
    if (price) price.classList.add('hidden');

    const button_BuyBar = document.getElementById(
      `product-form-${this.dataset.section}-product-buy-bar`
    );
    const addButton_BuyBar = button_BuyBar.querySelector('[name="add"]');
    const addButtonText_BuyBar = button_BuyBar.querySelector(
      '[name="add"] > span'
    );
    const price_BuyBar = document.getElementById(
      `price-${this.dataset.section}-product-buy-bar`
    );
    if (!addButton_BuyBar) return;
    addButtonText_BuyBar.textContent = window.variantStrings.unavailable;
    if (price_BuyBar) price_BuyBar.classList.add("hidden");

    const inventoryStatus = document.getElementById(`Inventory-${this.dataset.section}`);
    if (inventoryStatus) inventoryStatus.classList.add('hidden');

    const saleBadge = document.getElementById(`saleBadge-${this.dataset.section}`);
    if (saleBadge) saleBadge.classList.add('hidden');
  }
}

customElements.define('variant-selects', VariantSelects);

class ReadMore extends HTMLElement {
  constructor() {
    super();

    // Cache the read-more element itself for later use
    this.readMoreElement = this;
    this.toggle = this.querySelector('[data-read-more-toggle]');
    this.textElement = this.toggle?.querySelector('[data-read-more-text]');

    // Store bound handlers to avoid creating new functions on each call
    this.boundToggleVisibility = this.toggleVisibility.bind(this);
  }

  connectedCallback() {
    this.toggle.addEventListener('click', this.boundToggleVisibility);
  }

  disconnectedCallback() {
    this.toggle.removeEventListener('click', this.boundToggleVisibility);
  }

  toggleVisibility() {
    this.readMoreElement.classList.toggle('expanded');
    this.toggle.setAttribute('aria-expanded', this.readMoreElement.classList.contains('expanded') ? 'true' : 'false');
    this.toggle.setAttribute('aria-label', this.readMoreElement.classList.contains('expanded') ? this.toggle.getAttribute('data-read-less-label') : this.toggle.getAttribute('data-read-more-label'));
    this.textElement.textContent = this.readMoreElement.classList.contains('expanded') ? this.toggle.getAttribute('data-read-less-label') : this.toggle.getAttribute('data-read-more-label');
  }
}
customElements.define('read-more', ReadMore);